// Run with: node tests/check.js (no dependencies or advertising account needed).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');

async function check() {
  let headings = [];
  let metaMessage;
  const listeners = {};
  const context = {
    window: {}, innerWidth: 1200, innerHeight: 800,
    document: { addEventListener: (type, fn) => { listeners[type] = fn; }, querySelectorAll: () => headings },
    chrome: { runtime: { sendMessage: async () => ({ ok: true }), onMessage: { addListener(fn) { metaMessage = fn; } } } },
    getComputedStyle: (node) => ({ display: 'block', visibility: 'visible', overflowY: node.overflowY || 'visible' })
  };
  const content = source('content.js').replace('  chrome.runtime.onMessage.addListener',
    '  window.test = { state, normalizedEntityId, readOnlyClick, protectSettings, advantageHighlight, normalizedExact, exactEntityMatch, entityGrid, resetEntityListToTop, settleEntityListAt, entityNameVariants, entityItems, entityIds, entityParentContext, matchesExpectedParents, waitForStableContent, findSharePreviewTrigger, canonicalPreviewUrl, previewUrlFrom, capturePreviewLink };\n  chrome.runtime.onMessage.addListener');
  vm.runInNewContext(content, context);
  const api = context.window.test;
  const unexpectedResponse = () => { throw new Error('Unrelated command should not get a Meta response'); };
  assert.equal(metaMessage({ type: 'MAC_PAGE_CAPTURE_INIT' }, {}, unexpectedResponse), false);
  assert.equal(metaMessage({ type: 'MAC_CONTENT_WAIT' }, {}, unexpectedResponse), false);
  api.state.readOnly = true;
  const input = { closest: () => true };
  for (const type of ['click', 'beforeinput', 'keydown', 'paste', 'drop']) {
    let prevented = false, stopped = false;
    listeners[type]({ type, isTrusted: true, target: input, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
    assert.ok(prevented && stopped, `Capture must block ${type} on settings`);
  }
  for (const role of ['input name', 'Women radio', 'preview switch']) {
    assert.throws(() => api.readOnlyClick({ closest: () => ({ role }) }), /chặn/);
  }
  let clicked = 0;
  const row = { closest: () => null, contains: () => false, click() { clicked++; } };
  api.readOnlyClick(row);
  assert.equal(clicked, 1);
  assert.equal(api.state.allowedClick, null);
  assert.equal(api.normalizedExact('  XL7\u200b_Việt Nam  '), api.normalizedExact('XL7_Việt Nam'));
  assert.ok(api.exactEntityMatch({ variants: ['XL7 Launch', 'defaultAction menu'] }, 'XL7 Launch'));
  assert.ok(!api.exactEntityMatch({ variants: ['XL7 Launch Women'] }, 'XL7 Launch'));

  const button = (text, left, top, width, attrs = {}, iconCount = 0) => ({
    textContent: text, disabled: false, getAttribute: (name) => attrs[name] || '',
    getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + 34, width, height: 34 }),
    querySelectorAll: () => Array.from({ length: iconCount }, () => ({ contains: () => false }))
  });
  const label = button('Ad preview', 600, 120, 90);
  const defaults = button('Review defaults 1', 780, 170, 125);
  const expand = button('', 910, 170, 35, { 'aria-label': 'Expand preview' }, 1);
  const share = button('', 950, 170, 60, { 'aria-haspopup': 'menu' }, 2);
  let toolbarButtons = [defaults, expand, share];
  const toolbar = {
    getBoundingClientRect: () => ({ left: 560, right: 1020, top: 110, bottom: 750, width: 460, height: 640 }),
    querySelectorAll: (selector) => selector === 'button, [role="button"]' ? toolbarButtons : [label, ...toolbarButtons],
    parentElement: context.document.body
  };
  label.parentElement = toolbar;
  const initialQuery = context.document.querySelectorAll;
  context.document.querySelectorAll = (selector) => selector === 'button, [role="button"]' ? [defaults, expand, share] : [label, defaults, expand, share];
  assert.equal(api.findSharePreviewTrigger(), share, 'Two-row Ad preview toolbar: find Share next to Review defaults, not on the label row');
  const shareAttributes = share.getAttribute;
  share.getAttribute = () => '';
  assert.equal(api.findSharePreviewTrigger(), share, 'Recognize the icon-only arrow + dropdown inside the verified preview toolbar');
  share.disabled = true;
  assert.equal(api.findSharePreviewTrigger(), null, 'Never activate a disabled share button or fallback to fullscreen');
  share.disabled = false;
  const ambiguous = button('', 1015, 170, 60, {}, 2);
  toolbarButtons.push(ambiguous);
  assert.equal(api.findSharePreviewTrigger(), null, 'Ambiguous unlabelled controls must not be clicked by screen position');
  toolbarButtons.pop(); share.getAttribute = shareAttributes;
  const outsideShare = button('Share', 1050, 170, 60, { 'aria-haspopup': 'menu' });
  context.document.querySelectorAll = () => [label, defaults, expand, share, outsideShare];
  assert.equal(api.findSharePreviewTrigger(), share, 'Ignore unrelated buttons outside the preview card');
  const originalLabelRect = label.getBoundingClientRect;
  label.getBoundingClientRect = () => ({ ...originalLabelRect(), top: 170, bottom: 204 });
  assert.equal(api.findSharePreviewTrigger(), share, 'Legacy one-row preview header still works');
  label.getBoundingClientRect = originalLabelRect;
  context.URL = URL;
  const previewUrl = 'https://fb.me/adspreview/facebook/26T9EyYhOhwjbsD';
  const wrappedPreview = `https://l.facebook.com/l.php?u=${encodeURIComponent(previewUrl)}&h=tracking`;
  assert.equal(api.canonicalPreviewUrl(wrappedPreview), previewUrl);
  assert.equal(api.canonicalPreviewUrl('https://example.com/random-preview'), '', 'Unrelated clipboard/field links are not ad previews');

  let previewClock = 0, stage = 0, cleanedUp = 0, copied = '';
  const shareItem = {}, copyItem = {};
  const calls = [];
  const shareDialog = { innerText: '', querySelectorAll: () => [] };
  const flow = {
    state: { currentLevel: 'ad', stopRequested: false },
    Date: { now: () => previewClock },
    resetOuterScroll: async () => { calls.push('reset'); }, ensureAdPreviewEnabled: async () => {},
    document: { documentElement: { removeAttribute: () => { copied = ''; }, getAttribute: () => copied } },
    smallestVisibleText: (pattern, root) => root === shareDialog ? copyItem : stage === 1 ? shareItem : null,
    findSharePreviewTrigger: api.findSharePreviewTrigger,
    activate: (node) => {
      calls.push(node);
      if (node === share) stage = 1;
      else if (node === shareItem) stage = 2;
      else if (node === copyItem) copied = wrappedPreview;
      else assert.fail('Only Share, Share a link and Copy can be activated');
    },
    sleep: async (ms) => { previewClock += ms; },
    canonicalPreviewUrl: api.canonicalPreviewUrl, previewUrlFrom: api.previewUrlFrom,
    visibleDialog: () => stage === 2 ? shareDialog : null,
    closeSharePreviewUi: async () => { cleanedUp++; stage = 0; }
  };
  vm.runInNewContext(source('content.js').slice(source('content.js').indexOf('  async function capturePreviewLink('), source('content.js').indexOf('  function fuzzyMatchScore(')), flow);
  const copiedPreview = await flow.capturePreviewLink(5000, 'ad');
  assert.equal(copiedPreview.link, previewUrl, 'Full Share → Share a link → Copy flow returns the canonical preview');
  assert.equal(calls[0], 'reset');
  assert.deepEqual(calls.slice(1), [share, shareItem, copyItem]);
  assert.equal(cleanedUp, 1);
  shareDialog.innerText = wrappedPreview;
  const fieldPreview = await flow.capturePreviewLink(5000, 'ad');
  assert.equal(fieldPreview.link, previewUrl, 'Read a preview URL directly from the current dialog');
  flow.state.stopRequested = true;
  const beforeStop = calls.length;
  await assert.rejects(flow.capturePreviewLink(5000, 'ad'), /__MAC_STOPPED__/);
  assert.equal(calls.length, beforeStop + 1, 'Stop may reset the viewport, but must not click Share afterward');
  flow.state.stopRequested = false;
  flow.smallestVisibleText = () => null;
  await assert.rejects(flow.capturePreviewLink(5000, 'ad'), /không thấy mục Share a link/);
  assert.equal(stage, 0, 'Cleanup closes an opened menu even when Share a link did not load');
  context.document.querySelectorAll = initialQuery;

  let topWrites = 0;
  let resetClock = 0;
  context.Date = { now: () => resetClock };
  context.chrome.runtime.sendMessage = async ({ ms }) => { resetClock += ms; };
  const left = { parentElement: context.document.body, scrollHeight: 2500, clientHeight: 650, scrollTop: 900, overflowY: 'auto',
    getBoundingClientRect: () => ({ left: 20, right: 360, top: 100, bottom: 750, width: 340, height: 650 }),
    scrollTo({ top }) { topWrites++; this.scrollTop = top; }, dispatchEvent() {},
    querySelectorAll: (selector) => selector.includes('[role="rowheader"]') ? [adRow] : [] };
  const right = { scrollTop: 500 };
  const adRow = { parentElement: left, getAttribute: () => 'Ad',
    getBoundingClientRect: () => ({ left: 60, right: 340, top: 200, bottom: 240, width: 280, height: 40 }) };
  context.document.querySelectorAll = (selector) => selector.includes('[role="rowheader"]') ? [adRow] : headings;
  context.Event = class {};
  // No Campaign is rendered yet, only an Ad. Reset via the same sidebar and
  // repeat this reset on the next search, without touching the right scrollbar.
  await api.resetEntityListToTop('campaign');
  assert.equal(left.scrollTop, 0);
  left.scrollTop = 1400;
  await api.resetEntityListToTop('campaign');
  assert.equal(left.scrollTop, 0);
  assert.equal(right.scrollTop, 500);
  assert.equal(topWrites, 2, 'Reset only once per search, not on each verification sample');
  await api.resetEntityListToTop('campaign');
  assert.equal(topWrites, 2, 'Already at top: no scroll writes or synthetic scroll event');

  // Start validates Search; only the filtered lookup resets the tree.
  const searchInput = { type: 'text', value: '', getAttribute: (key) => key === 'placeholder' ? 'Search' : '', getBoundingClientRect: () => left.getBoundingClientRect() };
  context.document.getElementById = (id) => id === 'campaign_structure_tree_root'
    ? { getBoundingClientRect: () => left.getBoundingClientRect(), querySelectorAll: () => [searchInput] } : null;
  left.scrollTop = 1800;
  const initialized = await new Promise((resolve) => metaMessage({ type: 'MAC_CAPTURE_INIT', settings: {} }, {}, resolve));
  assert.equal(initialized.ok, true);
  assert.equal(initialized.version, '6.6.2');
  assert.equal(left.scrollTop, 1800, 'Start must not scan or reset the unfiltered tree');

  const normalQuery = context.document.querySelectorAll, normalRows = left.querySelectorAll;
  context.document.elementsFromPoint = () => [];
  // No Campaign/Ad/Ad set DOM rows exist yet. Locate the scroll pane itself,
  // reset it, then wait for the virtualized rows instead of silently skipping.
  const rowsReadyAt = resetClock + 1400;
  context.document.querySelectorAll = (selector) => selector.startsWith('div, section') ? [left] : [];
  left.querySelectorAll = (selector) => resetClock >= rowsReadyAt && selector.includes('[role="rowheader"]') ? [adRow] : [];
  left.scrollTop = 1200;
  await api.resetEntityListToTop('campaign');
  assert.equal(left.scrollTop, 0);
  assert.ok(resetClock >= rowsReadyAt + 500, 'Do not search until rows at the top have loaded and settled');
  assert.equal(right.scrollTop, 500, 'Reset the list, not the right settings scrollbar');

  api.state.settings.maxLoadWaitMs = 3000;
  context.document.querySelectorAll = () => [];
  await assert.rejects(api.resetEntityListToTop('campaign'), /chưa tải ổn định/, 'Missing sidebar must fail closed, not silently search from the middle');
  context.document.querySelectorAll = normalQuery;
  left.querySelectorAll = normalRows;
  const normalScrollTo = left.scrollTo;
  left.scrollTo = () => {};
  left.scrollTop = 1500;
  await assert.rejects(api.resetEntityListToTop('campaign'), /không tìm từ vị trí cuộn hiện tại/, 'Never begin search if the sidebar refused to reset');
  left.scrollTo = normalScrollTo; left.scrollTop = 0;
  api.state.settings = {};
  for (const level of ['campaign', 'adset', 'ad']) {
    left.scrollTop = 1700;
    await api.resetEntityListToTop(level);
    assert.equal(left.scrollTop, 0, `Each ${level} search must start at the top`);
  }
  const longHeight = left.scrollHeight;
  left.scrollHeight = left.clientHeight;
  await api.resetEntityListToTop('campaign');
  left.scrollHeight = longHeight;
  api.state.stopRequested = true;
  await assert.rejects(api.resetEntityListToTop('ad'), /__MAC_STOPPED__/);
  api.state.stopRequested = false;

  const wrapper = { ...left, scrollTop: 0, scrollHeight: 650, clientHeight: 650, overflowY: 'hidden', parentElement: left };
  adRow.parentElement = wrapper;
  assert.equal(api.entityGrid([]), left, 'Skip a short overflow:hidden wrapper to use the real sidebar scrollbar');
  adRow.parentElement = left;
  const replacementLeft = { ...left, scrollTop: 0 };
  let replaced = false;
  const resetWait = context.chrome.runtime.sendMessage;
  context.chrome.runtime.sendMessage = async ({ ms }) => {
    resetClock += ms;
    if (!replaced) { replaced = true; adRow.parentElement = replacementLeft; }
  };
  const settledReplacement = await api.settleEntityListAt(1000);
  assert.equal(settledReplacement, replacementLeft);
  assert.equal(replacementLeft.scrollTop, 1000, 'A replaced scroll pane must reach the requested position before scanning');
  adRow.parentElement = left;
  context.chrome.runtime.sendMessage = resetWait;
  const workingScrollTo = left.scrollTo;
  left.scrollTop = 0; left.scrollTo = () => {};
  api.state.settings.maxLoadWaitMs = 3000;
  await assert.rejects(api.settleEntityListAt(1000), /chưa quét hết/, 'A stuck scroll is incomplete, not a missing name');
  left.scrollTo = workingScrollTo; api.state.settings = {};

  let clock = 0, loadingUntil = 0;
  context.Date = { now: () => clock };
  context.chrome.runtime.sendMessage = async ({ ms }) => { clock += ms; };
  const readyNode = { tagName: 'INPUT', value: 'Loaded setting', getBoundingClientRect: () => ({ left: 100, right: 500, top: 100, bottom: 130, width: 400, height: 30 }) };
  const imageNode = { ...readyNode, tagName: 'IMG', complete: false };
  const readyPane = { scrollTop: 0, scrollHeight: 1200,
    getBoundingClientRect: () => ({ left: 0, right: 1200, top: 0, bottom: 800 }),
    querySelectorAll: (selector) => selector.startsWith('input') ? Array(4).fill(readyNode) : clock < loadingUntil ? [imageNode] : [] };
  api.state.settings = { capturePace: 'fast' };
  const quick = await api.waitForStableContent(readyPane);
  assert.ok(quick.stable && quick.waitedMs >= 600 && quick.waitedMs <= 800);
  api.state.settings.capturePace = 'steady';
  const steady = await api.waitForStableContent(readyPane, { settleMs: 2500 });
  assert.ok(steady.waitedMs >= 2500, 'Slower mode respects configured wait');
  api.state.settings.capturePace = 'fast';
  loadingUntil = clock + 2400;
  const pendingImage = await api.waitForStableContent(readyPane);
  assert.ok(pendingImage.stable && pendingImage.waitedMs >= 2400, 'Fast mode still waits for images');
  const manyNodesPane = { ...readyPane, querySelectorAll: (selector) => selector.startsWith('input') ? Array(8).fill(readyNode) : clock < loadingUntil ? [imageNode] : [] };
  loadingUntil = clock + 5000;
  api.state.currentLevel = 'campaign';
  const slowImage = await api.waitForStableContent(manyNodesPane);
  assert.ok(slowImage.stable && slowImage.waitedMs >= 5000, 'Campaign recommendations must not bypass images that are still loading');
  api.state.currentLevel = 'ad';

  let waited = 0, stopScroll = false, animate = true, animationTarget = 0, stopOnWait = false;
  const scrolling = { scrollTop: 0, scrollHeight: 2000, clientHeight: 500, isConnected: true,
    scrollTo({ top, behavior }) { if (behavior === 'instant') this.scrollTop = top; else animationTarget = top; } };
  const scrollContext = { window: {}, chrome: { runtime: { sendMessage: async ({ ms }) => {
    waited += ms;
    if (animate) scrolling.scrollTop = Math.min(animationTarget, scrolling.scrollTop + 100);
    if (stopOnWait) stopScroll = true;
  } } } };
  vm.runInNewContext(source('capture-scroll.js'), scrollContext);
  await scrollContext.window.__captureScrollTo(scrolling, 450, () => stopScroll);
  assert.equal(scrolling.scrollTop, 450);
  assert.ok(waited <= 600);
  waited = 0; animate = false;
  await scrollContext.window.__captureScrollTo(scrolling, 900, () => stopScroll);
  assert.equal(scrolling.scrollTop, 900, 'Stalled background animation falls back to exact position');
  assert.equal(waited, 600);
  stopOnWait = true;
  await assert.rejects(scrollContext.window.__captureScrollTo(scrolling, 1400, () => stopScroll), /__MAC_STOPPED__/);
  assert.equal(scrolling.scrollTop, 900, 'Stop cancels animation without jumping to next tile');
  const cleaned = { textContent: 'PFM_Fronx_Lead Mess default', querySelectorAll: (selector) => selector.startsWith('button') ? [{ remove() { cleaned.textContent = 'PFM_Fronx_Lead Mess'; } }] : [] };
  const campaignRow = { cloneNode: () => cleaned, getAttribute: () => '', querySelectorAll: () => [], innerText: 'PFM_Fronx_Lead Mess default', textContent: 'PFM_Fronx_Lead Mess default' };
  assert.ok(api.entityNameVariants(campaignRow, 'campaign').includes('PFM_Fronx_Lead Mess'));
  // Meta SVG <title>default</title> is not a menu/button. It must not become
  // part of the name or make a different campaign ending in "default" match.
  const makeIconRow = (name, level) => {
    const clone = { textContent: `${name} default`, querySelectorAll: (selector) => selector.includes('svg')
      ? [{ remove() { clone.textContent = name; } }] : [] };
    return { cloneNode: () => clone, getAttribute: (key) => key === 'aria-label' ? level : '',
      querySelectorAll: () => [], innerText: `${name} default`, textContent: `${name} default`,
      scrollIntoView() {},
      getBoundingClientRect: () => ({ left: 60, right: 340, top: 200, bottom: 240, width: 280, height: 40 }) };
  };
  for (const [level, label] of [['campaign', 'Campaign'], ['adset', 'Ad set'], ['ad', 'Ad']]) {
    const variants = api.entityNameVariants(makeIconRow('PFM_Fronx_Lead Mess', label), level);
    assert.ok(api.exactEntityMatch({ variants }, 'PFM_Fronx_Lead Mess'), `${label}: ignore SVG title default`);
    assert.ok(!api.exactEntityMatch({ variants }, 'PFM_Fronx_Lead Mess default'), `${label}: icon text must not match another name`);
  }
  const namedDefault = api.entityNameVariants(makeIconRow('Summer default', 'Campaign'), 'campaign');
  assert.ok(api.exactEntityMatch({ variants: namedDefault }, 'Summer default'), 'Preserve default when it belongs to the actual name');
  assert.ok(!api.exactEntityMatch({ variants: namedDefault }, 'Summer'));
  assert.ok(!api.exactEntityMatch({ variants: ['PFM_Fronx_Lead Mess'] }, 'PFM_Fronx_Lead Mess Women'), 'A full name is not a truncated prefix');
  assert.ok(api.exactEntityMatch({ variants: ['PFM_Fronx_Lead…'] }, 'PFM_Fronx_Lead Mess'), 'Explicit Meta truncation still permits a candidate, verified in Edit');
  const previousQuery = context.document.querySelectorAll;
  const campaignWithIcon = makeIconRow('PFM_Fronx_Lead Mess', 'Campaign');
  context.document.querySelectorAll = () => [campaignWithIcon];
  assert.equal(api.entityItems('campaign')[0].name, 'PFM_Fronx_Lead Mess', 'Diagnostic name must be clean too');
  let selectedCampaign = '', navigationTime = 0, leftResets = 0;
  const selectionGrid = { scrollTop: 0, scrollHeight: 650, clientHeight: 650 };
  const selectionContext = {
    state: { settings: {}, selectedPath: {}, stopRequested: false }, LEVEL_CONFIG: { campaign: { output: 'Campaign' } },
    Date: { now: () => navigationTime }, normalizedEntityId: api.normalizedEntityId, normalizedExact: api.normalizedExact,
    resetEntityListToTop: async () => { leftResets++; },
    searchEntityList: async () => selectionContext.resetEntityListToTop(),
    settleEntityListAt: async () => selectionGrid,
    currentEntityName: () => selectedCampaign, isLevelScreen: () => !!selectedCampaign,
    currentEntityIds: () => selectedCampaign ? ['111111111111111'] : [],
    entityItems: api.entityItems, exactEntityMatch: api.exactEntityMatch,
    entityIds: api.entityIds,
    matchesExpectedParents: () => true, entityGrid: () => selectionGrid,
    readOnlyClick: (node) => { assert.equal(node, campaignWithIcon); selectedCampaign = 'PFM_Fronx_Lead Mess'; },
    sleep: async (ms) => { navigationTime += ms; },
    findPreviewContainer: () => ({ scrollTop: 0 }), forceScrollTop: () => {},
    rememberSelectedPath: () => {}, prepareEntity: async () => ({ name: selectedCampaign, scrollTop: 0 })
  };
  const selectionSource = source('content.js');
  vm.runInNewContext(selectionSource.slice(selectionSource.indexOf('  async function selectNamedEntity('), selectionSource.indexOf('  async function selectNamedAd(')), selectionContext);
  const selection = await selectionContext.selectNamedEntity('PFM_Fronx_Lead Mess', 'campaign');
  assert.equal(selection.snapshot.name, 'PFM_Fronx_Lead Mess', 'The full selection flow finds the reported Campaign');
  assert.equal(leftResets, 1);
  // A numeric UI data-id is not a Campaign ID from the Facebook export.
  const campaignAttribute = campaignWithIcon.getAttribute;
  campaignWithIcon.getAttribute = (key) => key === 'data-id' ? '999999999999999' : campaignAttribute(key);
  selectedCampaign = '';
  const importedSelection = await selectionContext.selectNamedEntity('PFM_Fronx_Lead Mess', 'campaign', {}, '111111111111111');
  assert.equal(importedSelection.snapshot.name, 'PFM_Fronx_Lead Mess', 'An unrelated UI ID must not reject the exact Campaign name');
  for (const [level, label, attribute] of [['campaign', 'Campaign', 'data-campaign-id'], ['adset', 'Ad set', 'data-adset-id'], ['ad', 'Ad', 'data-ad-id']]) {
    selectionContext.LEVEL_CONFIG[level] = { output: label };
    const namedRow = makeIconRow('Exact imported name', label);
    const rowAttribute = namedRow.getAttribute;
    let actualId = '';
    namedRow.getAttribute = (key) => key === 'data-id' ? '999999999999999' : key === attribute ? actualId : rowAttribute(key);
    context.document.querySelectorAll = () => [namedRow];
    let clicks = 0;
    selectionContext.readOnlyClick = (node) => { assert.equal(node, namedRow); clicks++; selectedCampaign = 'Exact imported name'; };
    selectedCampaign = '';
    await selectionContext.selectNamedEntity('Exact imported name', level, {}, '111111111111111');
    assert.equal(clicks, 1, `${label}: unknown advertising ID permits a unique exact name, not generic UI ID matching`);
    actualId = '222222222222222'; clicks = 0; selectedCampaign = '';
    await assert.rejects(selectionContext.selectNamedEntity('Exact imported name', level, {}, '111111111111111'), /Đã thấy.*ID trong Meta.*khác ID trong file/);
    assert.equal(clicks, 0, `${label}: a real mismatched ID must never be clicked`);
    actualId = '111111111111111';
    await selectionContext.selectNamedEntity('Exact imported name', level, {}, actualId);
    assert.equal(clicks, 1, `${label}: the correctly typed ID selects safely`);
    selectedCampaign = '';
    selectionContext.readOnlyClick = () => { clicks++; };
    await assert.rejects(selectionContext.selectNamedEntity('Exact imported name', level, {}, actualId), /Đã tìm thấy.*Meta chưa mở đúng màn hình/, 'A navigation timeout is not a name-not-found error');
    assert.equal(clicks, 2, 'Do not keep clicking a row that failed to open');
    actualId = ''; selectedCampaign = '';
    context.document.querySelectorAll = () => [namedRow, makeIconRow('Exact imported name', label)];
    await assert.rejects(selectionContext.selectNamedEntity('Exact imported name', level, {}, '111111111111111'), /Có nhiều/, 'Unknown IDs must not allow ambiguous same-name selection');
    selectionContext.matchesExpectedParents = () => false;
    context.document.querySelectorAll = () => [namedRow];
    actualId = '111111111111111';
    selectionContext.readOnlyClick = (node) => { assert.equal(node, namedRow); clicks++; selectedCampaign = 'Exact imported name'; };
    assert.equal((await selectionContext.selectNamedEntity('Exact imported name', level, { campaign: 'Not opened' }, actualId)).snapshot.name,
      'Exact imported name', 'The entity ID is sufficient without opening its imported ancestors');
    selectionContext.matchesExpectedParents = () => true;

    // A shortened input is not the same name as two real suffixed entities.
    const shortName = 'PFM_Lead Mess_RTG';
    const fullName = `${shortName}_HCM,HN`;
    const fullRow = makeIconRow(fullName, label);
    context.document.querySelectorAll = () => [fullRow, makeIconRow(`${fullName}_Excl HCM,HN`, label)];
    const beforeClicks = clicks;
    await assert.rejects(selectionContext.selectNamedEntity(shortName, level), (error) =>
      /Các tên có thêm hậu tố/.test(error.message) && error.message.includes(fullName) && error.message.includes(`${fullName}_Excl HCM,HN`));
    assert.equal(clicks, beforeClicks, `${label}: do not silently choose a similarly named entity`);
    selectedCampaign = '';
    selectionContext.readOnlyClick = (node) => { assert.equal(node, fullRow); selectedCampaign = fullName; clicks++; };
    const fullSelection = await selectionContext.selectNamedEntity(fullName, level);
    assert.equal(fullSelection.snapshot.name, fullName, `${label}: a full name selects the right entity among shared prefixes`);

    // Import keeps names and IDs; a renamed item needs a precise diagnosis.
    const fullAttribute = fullRow.getAttribute;
    fullRow.getAttribute = (key) => key === attribute ? '111111111111111' : fullAttribute(key);
    selectedCampaign = '';
    await assert.rejects(selectionContext.selectNamedEntity(shortName, level, {}, '111111111111111'), /ID .* khác tên yêu cầu/);

    // A known ID on the row wins over a different full-name label with no ID.
    const truncatedRow = makeIconRow('PFM_Lead Mess_RTG…', label);
    truncatedRow.closest = () => ({ getAttribute: (key) => key === attribute ? '111111111111111' : '' });
    context.document.querySelectorAll = () => [makeIconRow(fullName, label), truncatedRow];
    selectionContext.readOnlyClick = (node) => { assert.equal(node, truncatedRow); selectedCampaign = fullName; };
    const byIdSelection = await selectionContext.selectNamedEntity(fullName, level, {}, '111111111111111');
    assert.equal(byIdSelection.snapshot.name, fullName, `${label}: verify the full Edit name after selecting a truncated label by ID`);

    const innerRow = makeIconRow(fullName, label), wrapper = makeIconRow(fullName, label);
    wrapper.contains = (node) => node === innerRow;
    context.document.querySelectorAll = () => [wrapper, innerRow];
    assert.equal(api.entityItems(level).length, 1, `${label}: nested semantics are one navigation row, not duplicate names`);
  }
  const campaignA = makeIconRow('Campaign A', 'Campaign'), adsetA = makeIconRow('Ad set A', 'Ad set');
  const campaignB = makeIconRow('Campaign B', 'Campaign'), adB = makeIconRow('Ad B', 'Ad');
  const virtualGrid = { getAttribute: () => '', querySelectorAll: () => [campaignA, adsetA, campaignB, adB] };
  adB.closest = () => virtualGrid;
  const parents = api.entityParentContext(adB);
  assert.equal(parents.campaign[0], 'Campaign B');
  assert.equal(parents.adset, undefined, 'Never associate an Ad with an Ad set from another Campaign');
  api.state.selectedPath = { campaign: 'Campaign B', adset: 'Ad set B' };
  assert.ok(api.matchesExpectedParents({ el: adB }, { campaign: 'Campaign B', adset: 'Ad set B' }, 'ad'), 'Use the verified selected parent when virtualization removed its label');
  api.state.selectedPath = {};
  context.document.querySelectorAll = previousQuery;

  // Regression for the screenshot: a real RTG exists below similar RTG names
  // and many child-only viewports. It must still be found after 30 seconds.
  for (const [level, label] of [['campaign', 'Campaign'], ['adset', 'Ad set'], ['ad', 'Ad']]) {
    const deepGrid = { scrollTop: 5000, scrollHeight: 30000, clientHeight: 500 };
    const targetName = level === 'adset' ? 'PFM_Lead Mess_RTG' : `Exact ${label} below long tree`;
    const deepRow = makeIconRow(targetName, label);
    deepRow.getBoundingClientRect = () => ({ left: 60, right: 340, top: 55 * 375 - deepGrid.scrollTop + 200, width: 280, height: 40 });
    const seenPositions = [];
    navigationTime = 0; selectedCampaign = '';
    selectionContext.state.settings = { maxLoadWaitMs: 10000 };
    selectionContext.resetEntityListToTop = async () => { deepGrid.scrollTop = 0; };
    selectionContext.entityGrid = () => deepGrid;
    selectionContext.entityItems = () => {
      seenPositions.push(deepGrid.scrollTop);
      if (deepGrid.scrollTop >= 55 * 375) return [{ el: deepRow, name: targetName, variants: [targetName] }];
      if (deepGrid.scrollTop === 0) return [{ el: makeIconRow(`${targetName}_HCM,HN`, label), name: `${targetName}_HCM,HN`, variants: [`${targetName}_HCM,HN`] }];
      return []; // Only child Ads are rendered here, not the searched level.
    };
    selectionContext.settleEntityListAt = async (top) => {
      deepGrid.scrollTop = Math.min(top, deepGrid.scrollHeight - deepGrid.clientHeight);
      navigationTime += 750;
      return deepGrid;
    };
    selectionContext.readOnlyClick = (node) => { assert.equal(node, deepRow); selectedCampaign = targetName; };
    const deepSelection = await selectionContext.selectNamedEntity(targetName, level);
    assert.equal(deepSelection.snapshot.name, targetName);
    assert.equal(seenPositions[0], 0, `${label}: begin at the top even if the previous lookup finished below`);
    assert.ok(navigationTime > 30000, `${label}: render timeout must not truncate a long search`);
    assert.ok(seenPositions.some((top) => top >= 55 * 375), `${label}: scan past similar names and child-only viewports`);
    selectedCampaign = '';
    const advanceDeep = selectionContext.settleEntityListAt;
    selectionContext.settleEntityListAt = async () => deepGrid;
    await assert.rejects(selectionContext.selectNamedEntity(targetName, level), /bị kẹt.*chưa quét hết/);
    selectionContext.state.stopRequested = true;
    await assert.rejects(selectionContext.selectNamedEntity(targetName, level), /__MAC_STOPPED__/);
    selectionContext.state.stopRequested = false;
    selectionContext.settleEntityListAt = advanceDeep;
    await assert.rejects(selectionContext.selectNamedEntity('A truly missing full name', level), /Không tìm thấy/);
    assert.equal(deepGrid.scrollTop, deepGrid.scrollHeight - deepGrid.clientHeight, `${label}: only conclude not found after scanning the real bottom`);
  }

  const popupSource = source('popup.js');
  const importContext = {};
  vm.runInNewContext(popupSource.slice(popupSource.indexOf('const cleanHeader ='), popupSource.indexOf('function walkTree(')), importContext);
  const importedTree = importContext.buildCaptureTree(importContext.parseDelimited('Campaign ID,Campaign Name,Ad Set ID,Ad Set Name,Ad ID,Ad Name\n111111111111111,PFM_Fronx_Lead Mess,222222222222222,"PFM_Lead Mess_RTG_HCM,HN",333333333333333,"Ad_full_name_HCM,HN"'));
  assert.equal(importedTree[0].name, 'PFM_Fronx_Lead Mess');
  assert.equal(importedTree[0].children[0].name, 'PFM_Lead Mess_RTG_HCM,HN', 'Import preserves suffixes and commas in quoted names');
  assert.equal(importedTree[0].children[0].id, '222222222222222');
  assert.equal(importedTree[0].children[0].children[0].name, 'Ad_full_name_HCM,HN');

  const makeHeading = (top) => {
    const card = { textContent: 'Advantage+ creative enhancements Turned off Try it out', parentElement: null,
      getBoundingClientRect: () => ({ left: 300, right: 660, top, width: 360, height: 260 }) };
    return { textContent: 'Advantage+ creative', children: [], parentElement: card,
      getBoundingClientRect: () => ({ left: 310, right: 580, top: top + 10, width: 270, height: 20 }) };
  };
  api.state.settings.highlightAdvantage = true;
  api.state.currentLevel = 'ad';
  const first = makeHeading(1200), second = makeHeading(1800);
  headings = [second, first]; // Both are below the viewport; DOM order is mixed.
  const rect = { left: 240, top: 100, width: 960, height: 700 };
  const mark = api.advantageHighlight(rect, 0);
  assert.equal(mark.y, 1100, 'Only the first creative block should be highlighted');
  assert.equal(mark.height, 260);
  headings = [first];
  assert.equal(api.advantageHighlight(rect, 0).y, 1100);
  api.state.currentLevel = 'adset';
  assert.equal(api.advantageHighlight(rect, 0), null);

  // Screenshot regression: the Advantage section is embedded at the bottom
  // of one large Ad creative card containing Description and CTA above it.
  api.state.currentLevel = 'ad';
  const embeddedCard = { textContent: 'Primary text Headline Description Call to action Advantage+ creative enhancements Essential enhancements Try it out Advantage+ creative translation Turned on Text Edit',
    parentElement: null, getBoundingClientRect: () => ({ left: 300, right: 660, top: 500, bottom: 1900, width: 360, height: 1400 }) };
  const embeddedHeading = (text, top) => ({ textContent: text, children: [], parentElement: embeddedCard,
    getBoundingClientRect: () => ({ left: 310, right: 650, top, bottom: top + 20, width: 340, height: 20 }) });
  const enhancement = embeddedHeading('Advantage+ creative enhancements (0/4)', 1480);
  const essential = embeddedHeading('Essential enhancements (0/4)', 1580);
  const translation = embeddedHeading('Advantage+ creative translation', 1740);
  const testing = embeddedHeading('Creative testing', 1920);
  headings = [enhancement, essential, translation, testing];
  const embeddedMark = api.advantageHighlight(rect, 0);
  assert.ok(embeddedMark.y >= 1370, 'Do not outline Primary text, Headline, Description or CTA above Advantage');
  assert.ok(embeddedMark.y <= 1380, 'Include the Advantage heading itself');
  assert.ok(embeddedMark.y + embeddedMark.height >= 1800, 'Include creative translation and its Edit control at the end of this section');
  assert.ok(embeddedMark.y + embeddedMark.height < 1820, 'Do not include Creative testing');
  const translationSection = { textContent: 'Advantage+ creative translation Turned on: Text Edit', parentElement: embeddedCard,
    getBoundingClientRect: () => ({ left: 300, right: 660, top: 1730, bottom: 1890, width: 360, height: 160 }) };
  translation.parentElement = translationSection;
  const trialHeading = embeddedHeading('Try it out', 1670);
  const nextEnhancement = embeddedHeading('Advantage+ creative enhancements (0/8)', 2200);
  // The shared outer card now contains multiple sections and Advantage blocks.
  embeddedCard.getBoundingClientRect = () => ({ left: 300, right: 660, top: 500, bottom: 3000, width: 360, height: 2500 });
  headings = [nextEnhancement, translation, trialHeading, essential, enhancement];
  const precise = api.advantageHighlight(rect, 500);
  assert.equal(precise.y, 1874, 'Scroll offset is applied to the subsection, not the entire Ad creative card');
  assert.equal(precise.y + precise.height, 2290, 'End at the translation controls, not at the large ancestor or next Advantage block');
  headings = [trialHeading, essential, enhancement, testing];
  const noTranslation = api.advantageHighlight(rect, 0);
  assert.equal(noTranslation.y + noTranslation.height, 1596, 'Without translation, stop just after Try it out');
  headings = [translation];
  assert.equal(api.advantageHighlight(rect, 0), null, 'Translation alone is not a new creative enhancements block');
  headings = [enhancement, essential, translation, testing];
  api.state.settings.highlightAdvantage = false;
  assert.equal(api.advantageHighlight(rect, 0), null, 'The option remains opt-in');
  api.state.settings.highlightAdvantage = true;

  // Verify the last tile is clipped rather than scaled, which distorted images.
  const draws = [], marks = [];
  const canvas = { getContext: () => ({ fillRect() {}, drawImage: (...args) => draws.push(args), save() {}, restore() {}, strokeRect: (...args) => marks.push(args) }), toDataURL: () => 'data:image/png;base64,test' };
  const stitchContext = { document: { createElement: () => canvas },
    fetch: async () => ({ blob: async () => ({}) }),
    createImageBitmap: async () => ({ width: 800, height: 600, close() {} }),
    chrome: { runtime: { onMessage: { addListener() {} } } } };
  vm.runInNewContext(source('offscreen.js'), stitchContext);
  await stitchContext.stitch([{ dataUrl: 'first', scrollTop: 0 }, { dataUrl: 'last', scrollTop: 450 }],
    { viewportWidth: 800, rect: { left: 100, top: 100, width: 500, height: 500 }, scrollHeight: 700, advantageHighlight: { x: 20, y: 100, width: 250, height: 200 } });
  assert.equal(draws[1][2], 150, 'Crop the overlap off the next source tile');
  assert.equal(draws[1][4], 200);
  assert.equal(draws[1][6], 500, 'Append only new content, without repainting the previous tile');
  assert.equal(draws[1][8], 200);
  assert.equal(marks.length, 1);
  marks.length = 0;
  await stitchContext.stitch([{ dataUrl: 'first', scrollTop: 0 }, { dataUrl: 'last', scrollTop: 450 }],
    { viewportWidth: 800, rect: { left: 100, top: 100, width: 500, height: 500 }, scrollHeight: 700, regionHighlights: [
      { kind: 'advantage', x: 20, y: 80, width: 250, height: 100 },
      { kind: 'advantage', x: 20, y: 300, width: 250, height: 100 },
      { kind: 'ta', x: 20, y: 200, width: 250, height: 100 },
      { kind: 'budget', x: 20, y: 400, width: 250, height: 100 },
      { kind: 'budget', x: 0, y: 0, width: 500, height: 5000 }, null
    ] });
  assert.equal(marks.length, 3, 'Draw independent regions once per kind; reject a whole-page outline');
  draws.length = 0;
  await stitchContext.stitch([{ dataUrl: 'first', scrollTop: 0 }, { dataUrl: 'middle', scrollTop: 350 }, { dataUrl: 'last', scrollTop: 600 }],
    { wholePage: true, viewportWidth: 800, viewportHeight: 600, rect: { left: 200, top: 100, width: 600, height: 400 }, scrollHeight: 1000 });
  assert.equal(canvas.width, 800, 'Normal capture includes the full width, including sidebar');
  assert.equal(canvas.height, 1200, 'Normal capture includes header and footer once');
  assert.equal(draws[1][6], 1100, 'Footer goes at the end of the long page');
  assert.equal(draws[2][5], 200, 'Scrolled content keeps its horizontal position');
  assert.equal(draws[2][6], 500);
  assert.equal(draws[3][6], 850);
  await assert.rejects(stitchContext.stitch([{ dataUrl: 'first', scrollTop: 0 }, { dataUrl: 'last', scrollTop: 600 }],
    { viewportWidth: 800, rect: { left: 100, top: 100, width: 500, height: 500 }, scrollHeight: 1000 }), /thiếu một đoạn/);
  await assert.rejects(stitchContext.stitch([{ dataUrl: 'first', scrollTop: 0 }],
    { viewportWidth: 800, rect: { left: 100, top: 100, width: 500, height: 500 }, scrollHeight: 700 }), /chưa phủ hết/);
  let decoded = 0;
  stitchContext.createImageBitmap = async () => ({ width: decoded++ ? 900 : 800, height: 600, close() {} });
  await assert.rejects(stitchContext.stitch([{ dataUrl: 'first', scrollTop: 0 }, { dataUrl: 'last', scrollTop: 200 }],
    { viewportWidth: 800, rect: { left: 100, top: 100, width: 500, height: 500 }, scrollHeight: 700 }), /Kích thước ảnh thay đổi/);

  // App pages scroll one pane, not the sidebar/footer. Normal capture must
  // crop that pane even on the first tile, at the original pixel density.
  const pageContext = { window: {}, innerWidth: 800, innerHeight: 600, devicePixelRatio: 2,
    document: { title: 'Meta settings', scrollingElement: {} },
    chrome: { runtime: { onMessage: { addListener() {} } } } };
  vm.runInNewContext(source('page-content.js').replace('  chrome.runtime.onMessage.addListener',
    '  window.test = { state, snapshot };\n  chrome.runtime.onMessage.addListener'), pageContext);
  pageContext.window.test.state.container = { isConnected: true, scrollTop: 0, scrollHeight: 1000, clientHeight: 400,
    getBoundingClientRect: () => ({ left: 200, top: 100, width: 600, height: 400 }) };
  const cropped = pageContext.window.test.snapshot();
  assert.equal(cropped.wholePage, false, 'Nested main pane must not leave a blank sidebar or copy the outside footer');
  draws.length = 0;
  stitchContext.createImageBitmap = async () => ({ width: 1600, height: 1200, close() {} });
  await stitchContext.stitch([{ dataUrl: 'first', scrollTop: 0 }, { dataUrl: 'middle', scrollTop: 350 }, { dataUrl: 'last', scrollTop: 600 }], cropped);
  assert.equal(canvas.width, 1200, 'Keep 2x pixels without scaling back down');
  assert.equal(canvas.height, 2000, 'No outside header/footer or white sidebar gutter');
  assert.equal(draws[0][1], 400, 'Crop out the left menu on the first tile too');
  assert.equal(draws[0][2], 200);
  assert.equal(draws[0][4], 800, 'Capture only the pane, excluding the bottom fixed footer');
  draws.length = 0;
  stitchContext.createImageBitmap = async () => ({ width: 2000, height: 1200, close() {} });
  await stitchContext.stitch([{ dataUrl: 'first', scrollTop: 0 }, { dataUrl: 'middle', scrollTop: 350 }, { dataUrl: 'last', scrollTop: 600 }], cropped);
  assert.equal(canvas.width, 1200, 'An extra side-panel strip must not inflate the density or distort the image');
  assert.equal(draws[0][1], 400);
  assert.equal(draws[0][3], 1200);
  pageContext.document.scrollingElement = pageContext.window.test.state.container;
  assert.equal(pageContext.window.test.snapshot().wholePage, true, 'Document-scrolling websites still get full-page capture');

  // A scroll during screenshot must discard the entity, not produce a proof
  // with a missing middle. Reaching maxShots early must not report success.
  const bg = source('background.js');
  // A page-capture listener can be present while the Meta listener is absent
  // after an extension reload. Chrome may resolve sendMessage with undefined
  // rather than throw; this must still trigger loading the correct adapter.
  const routeLoads = [], routeMessages = [];
  let adapterLoaded = false;
  const routeContext = {
    regularCaptureTabs: new Set(), isGoogleAdsUrl: () => false, wait: async () => {},
    chrome: {
      tabs: {
        get: async () => ({ url: 'https://adsmanager.facebook.com/adsmanager/manage/adsets/edit' }),
        sendMessage: async (_id, message) => { routeMessages.push(message.type); return adapterLoaded ? { ok: true } : undefined; }
      },
      scripting: { executeScript: async ({ files }) => { routeLoads.push(...files); adapterLoaded = true; } }
    }
  };
  vm.runInNewContext(bg.slice(bg.indexOf('async function send('), bg.indexOf('async function keepBackgroundTabActive')), routeContext);
  assert.equal((await routeContext.send(1, { type: 'MAC_CAPTURE_INIT' }))?.ok, true, 'Undefined response must load the Meta adapter and retry');
  assert.equal(routeLoads[1], 'content.js');
  assert.equal(routeMessages.length, 2);
  routeContext.regularCaptureTabs.add(1); adapterLoaded = false;
  await routeContext.send(1, { type: 'MAC_CAPTURE_INIT' });
  assert.equal(routeLoads[3], 'page-content.js');
  assert.equal(routeMessages[2], 'MAC_PAGE_CAPTURE_INIT');
  routeContext.regularCaptureTabs.delete(1); adapterLoaded = false;
  await routeContext.send(1, { type: 'MAC_CAPTURE_INIT' });
  assert.equal(routeLoads[5], 'content.js', 'Switch back from regular capture loads the Meta adapter');

  let googleMessage;
  vm.runInNewContext(source('google-content.js'), {
    window: {}, document: { addEventListener() {} },
    chrome: { runtime: { onMessage: { addListener(fn) { googleMessage = fn; } } } }
  });
  assert.equal(googleMessage({ type: 'MAC_PAGE_CAPTURE_INIT' }, {}, unexpectedResponse), false);
  assert.equal(googleMessage({ type: 'MAC_CONTENT_WAIT' }, {}, unexpectedResponse), false);
  const captureStart = bg.indexOf('async function captureOneAd(');
  const captureEnd = bg.indexOf('async function captureEntityWithRetry', captureStart);
  const snap = { scrollTop: 0, scrollHeight: 700, clientHeight: 500, viewportWidth: 800, viewportHeight: 600, rect: { left: 100, top: 100, width: 500, height: 500 } };
  let current = { ...snap }, interfere = false, scrollCalls = 0, stitchedGeometry;
  const captureContext = {
    shouldStop: async () => false, setStatus: async () => {}, ensureOffscreen: async () => {},
    captureViewport: async () => {
      if (interfere === 'left') current = { ...current, rect: { ...current.rect, left: current.rect.left + 15 } };
      else if (interfere === 'height') current = { ...current, rect: { ...current.rect, height: current.rect.height - 20 } };
      else if (interfere) current = { ...current, scrollTop: 25 };
      return 'image';
    },
    send: async (_id, message) => {
      if (message.type === 'MAC_PREVIEW_SNAPSHOT') return { ok: true, snapshot: { ...current } };
      scrollCalls++;
      if (current.scrollTop === 0) { current = { ...current, scrollTop: 200, atBottom: true }; return { ok: true, moved: true, snapshot: { ...current } }; }
      return { ok: true, moved: false, snapshot: { ...current, atBottom: true } };
    },
    chrome: { runtime: { sendMessage: async (message) => { stitchedGeometry = message.geometry; return { ok: true, dataUrl: 'stitched', width: 500, height: 700, truncated: false }; } } }
  };
  vm.runInNewContext(bg.slice(captureStart, captureEnd), captureContext);
  const image = await captureContext.captureOneAd({ id: 1 }, { maxShots: 5 }, 1, snap);
  assert.equal(image.parts, 2);
  assert.equal(scrollCalls, 1, 'No unnecessary scroll/wait after capturing the last tile');
  const annotated = { ...snap, regionHighlights: [{ kind: 'advantage', x: 10, y: 50, width: 250, height: 100 }] };
  current = { ...annotated };
  await captureContext.captureOneAd({ id: 1 }, { maxShots: 5 }, 1, annotated);
  assert.equal(stitchedGeometry.regionHighlights.length, 1, 'Pass region coordinates into stitching without adding duplicate frames');
  current = { ...snap }; interfere = true;
  await assert.rejects(captureContext.captureOneAd({ id: 1 }, { maxShots: 5 }, 1, snap), /cuộn trong lúc chụp/);
  for (const shift of ['left', 'height']) {
    current = { ...snap }; interfere = shift;
    await assert.rejects(captureContext.captureOneAd({ id: 1 }, { maxShots: 5 }, 1, snap), /cuộn trong lúc chụp/);
  }
  current = { ...snap }; interfere = false;
  await assert.rejects(captureContext.captureOneAd({ id: 1 }, { maxShots: 1 }, 1, snap), /Chưa chụp hết/);

  const background = source('background.js');
  const start = background.indexOf('function googleCaptureJobs(');
  const end = background.indexOf('async function openGoogleCapturePage', start);
  const googleContext = { URL };
  vm.runInNewContext(background.slice(start, end), googleContext);
  const jobs = googleContext.googleCaptureJobs('Campaign Summer | https://ads.google.com/aw/settings?campaignId=123\nAd group Women | https://ads.google.com/aw/adgroups?adGroupId=456');
  assert.equal(jobs.length, 2);
  assert.equal(jobs[1].label, 'Ad group');
  assert.equal(jobs[1].name, 'Women');
  assert.throws(() => googleContext.googleCaptureJobs('https://ads.google.com.evil.example/aw/'));
  assert.throws(() => googleContext.googleCaptureJobs('javascript:alert(1)'));
  const sent = [], statuses = [], installedFiles = [];
  let uploads = 0;
  const regularContext = {
    DEFAULTS: { backgroundMode: false, uploadDrive: true, filenamePrefix: 'Capture' },
    isGoogleAdsUrl: () => false,
    flattenCaptureTree: (tree) => { assert.equal(tree.length, 0); return []; },
    regularCaptureTabs: new Set(), activeCaptureTabs: new Set([1]), stopRequestedTabs: new Set(), activeSessions: new Map(), lastKeepAlive: new Map(),
    URL, crypto: require('node:crypto').webcrypto, TextEncoder, Uint8Array,
    chrome: { storage: { local: { get: async () => ({}), set: async () => {} } }, scripting: { executeScript: async ({ files }) => installedFiles.push(...files) }, tabs: { update: async () => {} } },
    setStatus: async (status) => statuses.push(status),
    send: async (_id, message) => {
      sent.push(message.type);
      if (message.type === 'MAC_CAPTURE_INIT') return { ok: true, version: '6.6.2' };
      return { ok: true, snapshot: { ...snap, name: 'Current page' } };
    },
    shouldStop: async () => false, keepBackgroundTabActive: async () => {},
    captureOneAd: async () => ({ name: 'Current page', dataUrl: 'image', parts: 1, width: 800, height: 700 }),
    safe: (value) => value,
    uploadThroughWebhook: async () => { uploads++; return 'https://example.test/image'; },
    compactReportLinks: (text) => text, richReportHtml: (text) => text,
    notifyCaptureComplete: async () => {}, openProgressWindow: async () => {}
  };
  const runStart = bg.indexOf('async function captureFingerprint(');
  const runEnd = bg.indexOf('chrome.runtime.onMessage.addListener', runStart);
  vm.runInNewContext(bg.slice(bg.indexOf('function hierarchicalReport('), bg.indexOf('async function downloadData(')), regularContext);
  vm.runInNewContext(bg.slice(runStart, runEnd), regularContext);
  await regularContext.runCapture({ id: 1, url: 'https://example.test/page' }, {
    captureMode: 'regular', captureTree: [{ level: 'campaign', name: 'Old imported campaign' }], targetAds: ['Old Ad'], captureAdPreview: true
  });
  assert.equal(uploads, 1, 'Normal capture uploads exactly one image');
  assert.ok(!sent.includes('MAC_SELECT_TARGET_ENTITY'));
  assert.ok(!sent.includes('MAC_GET_PREVIEW_LINK'));
  const done = statuses.find((status) => status.state === 'done');
  assert.ok(done, JSON.stringify(statuses));
  assert.equal(done.result.report, 'https://example.test/image');
  assert.equal(regularContext.regularCaptureTabs.size, 0);
  assert.ok(installedFiles.includes('page-content.js'));
  // Every bulk run explicitly loads Meta, not just the regular-capture path.
  await regularContext.runCapture({ id: 1, url: 'https://adsmanager.facebook.com/adsmanager/manage/adsets/edit' }, {
    captureMode: 'auto', targetCampaigns: ['Campaign Summer'], captureAdPreview: false
  });
  assert.ok(installedFiles.includes('content.js'), 'Bulk mode explicitly loads Meta even if sendMessage could return undefined');
  assert.ok(sent.includes('MAC_SELECT_TARGET_ENTITY'));
  const manifest = JSON.parse(source('manifest.json'));
  assert.ok(manifest.host_permissions.includes('https://ads.google.com/*'));
  assert.ok(manifest.content_scripts.some((item) => item.js.includes('google-content.js')));
  assert.ok(manifest.content_scripts.every((item) => item.js[0] === 'capture-scroll.js'));
  console.log('Passed: preview toolbar (one/two rows, icon-only, disabled/ambiguous controls), Share/link/Copy/Stop/cleanup, canonical preview URLs, full-tree search, sidebar replacement/blocked scroll, initialization recovery, crop/stitch integrity, settings protection, Advantage+, Google URLs.');
}
check().catch((error) => { console.error(error); process.exitCode = 1; });
