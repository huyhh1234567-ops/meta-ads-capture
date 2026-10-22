// Run with: node tests/navigation-regression.js (Node only; no Meta account).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const levels = [['campaign', 'Campaign'], ['adset', 'Ad set'], ['ad', 'Ad']];
const ids = { wanted: '111111111111111', other: '222222222222222', parent: '333333333333333', wrongParent: '444444444444444' };
const tests = [];
const test = (name, run) => tests.push({ name, run });

function fixture() {
  let time = 0, rows = [], loadingUntil = 0;
  const body = {};
  const search = { type: 'text', value: '', getAttribute: (key) => key === 'placeholder' ? 'Search' : '', getBoundingClientRect: () => rect() };
  const document = {
    body, addEventListener() {}, elementsFromPoint: () => [],
    getElementById: (id) => id === 'campaign_structure_tree_root'
      ? { getBoundingClientRect: () => rect(), querySelectorAll: () => [search] } : null,
    querySelectorAll: (selector) => {
      if (selector.includes('aria-busy') || selector.includes('progressbar') || selector.includes('skeleton')) {
        return time < loadingUntil ? [loader] : [];
      }
      return selector.includes('rowheader') || selector.includes('treeitem') ? rows : [];
    }
  };
  const rect = (top = 140) => ({ left: 20, right: 320, top, bottom: top + 40, width: 300, height: 40 });
  const loader = { getBoundingClientRect: () => rect(), getAttribute: () => '' };
  const context = {
    window: {}, document, innerWidth: 1200, innerHeight: 800, URL,
    location: { href: 'https://adsmanager.facebook.com/adsmanager/manage/ads/edit' },
    Date: { now: () => time }, Event: class {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', overflowY: 'visible' }),
    chrome: { runtime: { sendMessage: async ({ ms }) => { time += ms; }, onMessage: { addListener() {} } } }
  };
  vm.runInNewContext(content.replace('  chrome.runtime.onMessage.addListener',
    '  window.test = { state, normalizedEntityId, rememberSelectedPath, normalizedExact, exactEntityMatch, entityNameVariants, entityItems, entityIds, idsFromUrl, currentEntityIds, entityParentContext, matchesExpectedParents, settleEntityListAt, resetEntityListToTop };\n  chrome.runtime.onMessage.addListener'), context);
  const api = context.window.test;
  api.state.settings.maxLoadWaitMs = 3000;
  const grid = { querySelectorAll: () => rows };
  function row(name, level, attributes = {}, top = 140) {
    const label = levels.find(([key]) => key === level)[1];
    const node = {
      parentElement: body, textContent: name, innerText: name, children: [],
      getAttribute: (key) => key === 'aria-label' ? label : attributes[key] || '',
      getBoundingClientRect: () => rect(top), contains: () => false,
      cloneNode: () => ({ textContent: name, querySelectorAll: () => [] }),
      closest: (selector) => selector === '[role="grid"]' ? grid : null,
      querySelectorAll: () => [], scrollIntoView() {}
    };
    return node;
  }
  return { api, context, row, setRows: (value) => { rows = value; },
    loadingFor: (ms) => { loadingUntil = time + ms; }, time: () => time,
    setQuery: (value) => { search.value = value; } };
}

// Keep real matching/ID/parent helpers; substitute only navigation and capture.
function selectionFixture(f, { screenId = ids.wanted, actualReset = false } = {}) {
  let time = 0, selectedName = '', clicked = null;
  const grid = { scrollTop: 0, clientHeight: 650, scrollHeight: 650 };
  const context = {
    state: f.api.state, LEVEL_CONFIG: Object.fromEntries(levels.map(([level, output]) => [level, { output }])),
    Date: { now: () => time }, URL,
    location: { href: `https://adsmanager.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${screenId}`, search: `?selected_ad_ids=${screenId}` },
    normalizedEntityId: f.api.normalizedEntityId, normalizedExact: f.api.normalizedExact, exactEntityMatch: f.api.exactEntityMatch,
    entityItems: f.api.entityItems, entityIds: f.api.entityIds,
    matchesExpectedParents: f.api.matchesExpectedParents,
    resetEntityListToTop: actualReset ? f.api.resetEntityListToTop : async () => grid,
    searchEntityList: async (target) => { f.setQuery(target); return actualReset ? f.api.resetEntityListToTop('ad', target) : context.resetEntityListToTop(); },
    settleEntityListAt: actualReset ? f.api.settleEntityListAt : async () => grid,
    entityGrid: () => actualReset ? null : grid,
    currentEntityName: () => selectedName, currentEntityIds: () => screenId ? [screenId] : [],
    isLevelScreen: () => !!selectedName,
    readOnlyClick: (node) => { clicked = node; selectedName = node.textContent; },
    sleep: async (ms) => { time += ms; }, findPreviewContainer: () => ({ scrollTop: 0 }),
    forceScrollTop() {}, rememberSelectedPath() {}, prepareEntity: async () => ({ name: selectedName })
  };
  vm.runInNewContext(content.slice(content.indexOf('  async function selectNamedEntity('), content.indexOf('  async function selectNamedAd(')), context);
  return { context, select: (...args) => context.selectNamedEntity(...args), clicked: () => clicked };
}

test('stable hierarchy without a sidebar scrollbar settles and returns null', async () => {
  const f = fixture();
  f.setRows([f.row('Visible Campaign', 'campaign'), f.row('Visible Ad set', 'adset'), f.row('Visible Ad', 'ad')]);
  f.loadingFor(1000);
  assert.equal(await f.api.settleEntityListAt(0), null);
  assert.ok(f.time() >= 1000, 'Wait for visible hierarchy loading to finish');
  assert.ok(f.time() < 3000, 'A scrollbar is not required when rendered rows are stable');
});

test('a missing sidebar with no hierarchy rows still fails closed', async () => {
  const f = fixture();
  await assert.rejects(f.api.settleEntityListAt(0), /chưa quét hết|ổn định/);
});

test('search selects an exact rendered row even when there is no scrollbar', async () => {
  const f = fixture(), target = f.row('Exact visible Ad', 'ad');
  f.setRows([target]);
  const selection = selectionFixture(f, { actualReset: true, screenId: '' });
  const result = await selection.select('Exact visible Ad', 'ad');
  assert.equal(selection.clicked(), target);
  assert.equal(result.snapshot.name, 'Exact visible Ad');
});

test('search with stable non-scrollable rows reports a genuinely missing name', async () => {
  const f = fixture();
  f.setRows([f.row('Some other Ad', 'ad')]);
  const selection = selectionFixture(f, { actualReset: true, screenId: '' });
  await assert.rejects(selection.select('Missing Ad', 'ad'), /Không tìm thấy/);
  assert.equal(selection.clicked(), null);
});

for (const [level, label] of levels) {
  const prefix = { campaign: 'cg', adset: 'as', ad: 'ad' }[level];
  test(`${label}: imported prefixed ID verifies the same numeric Edit ID`, async () => {
    const f = fixture(), target = f.row('Exact imported name', level, { [`data-${level}-id`]: ids.wanted });
    f.setRows([target]);
    const selection = selectionFixture(f);
    const result = await selection.select('Exact imported name', level, {}, `${prefix}:${ids.wanted}`);
    assert.equal(selection.clicked(), target);
    assert.equal(result.snapshot.name, 'Exact imported name');
  });

  test(`${label}: prefix normalization never accepts a different Edit ID`, async () => {
    const f = fixture(), target = f.row('Exact imported name', level, { [`data-${level}-id`]: ids.wanted });
    f.setRows([target]);
    const selection = selectionFixture(f, { screenId: ids.other });
    await assert.rejects(selection.select('Exact imported name', level, {}, `${prefix}:${ids.wanted}`), /ID|đúng màn hình/);
    assert.equal(selection.clicked(), target, 'Correct row is clicked before the different screen ID is rejected');
  });

  test(`${label}: a unique row with no ID still verifies the prefixed import against Edit`, async () => {
    const f = fixture(), target = f.row('Exact imported name', level);
    f.setRows([target]);
    const selection = selectionFixture(f);
    assert.equal((await selection.select('Exact imported name', level, {}, `${prefix}:${ids.wanted}`)).snapshot.name, 'Exact imported name');
  });

  test(`${label}: wrong-level and unknown prefixes stop before any click`, async () => {
    const f = fixture(), target = f.row('Exact imported name', level);
    f.setRows([target]);
    const selection = selectionFixture(f);
    for (const badPrefix of ['unknown', level === 'campaign' ? 'as' : 'cg']) {
      await assert.rejects(selection.select('Exact imported name', level, {}, `${badPrefix}:${ids.wanted}`), /ID.*không hợp lệ/);
      assert.equal(selection.clicked(), null);
    }
  });

  test(`${label}: only the real level ID distinguishes duplicate names`, async () => {
    const f = fixture(), attribute = `data-${level}-id`;
    const wrong = f.row('Same full name', level, { [attribute]: ids.other, 'data-id': ids.wanted });
    const right = f.row('Same full name', level, { [attribute]: ids.wanted, 'data-id': ids.other });
    f.setRows([wrong, right]);
    assert.deepEqual(Array.from(f.api.entityIds({ el: wrong }, level)), [ids.other]);
    const selection = selectionFixture(f);
    const result = await selection.select('Same full name', level, {}, ids.wanted);
    assert.equal(selection.clicked(), right);
    assert.equal(result.snapshot.name, 'Same full name');
  });

  test(`${label}: same-name screen with a different real ID is never accepted after click`, async () => {
    const f = fixture(), target = f.row('Same full name', level, { [`data-${level}-id`]: ids.wanted });
    f.setRows([target]);
    const selection = selectionFixture(f, { screenId: ids.other });
    await assert.rejects(selection.select('Same full name', level, {}, ids.wanted), /ID|đúng màn hình/);
    assert.equal(selection.clicked(), target, 'The matching navigation row was clicked; verification must reject the wrong Edit entity');
  });

  test(`${label}: duplicate names across virtualized viewports are ambiguous without an expected ID`, async () => {
    const f = fixture();
    const first = f.row('Duplicate across pages', level, { [`data-${level}-id`]: ids.wanted });
    const second = f.row('Duplicate across pages', level, { [`data-${level}-id`]: ids.other });
    f.setRows([first]);
    const selection = selectionFixture(f, { screenId: '' });
    const grid = { scrollTop: 0, clientHeight: 500, scrollHeight: 1500 };
    selection.context.resetEntityListToTop = async () => { grid.scrollTop = 0; f.setRows([first]); return grid; };
    selection.context.entityGrid = () => grid;
    selection.context.settleEntityListAt = async (top) => {
      grid.scrollTop = Math.min(top, grid.scrollHeight - grid.clientHeight);
      f.setRows(grid.scrollTop < 500 ? [first] : [second]);
      return grid;
    };
    await assert.rejects(selection.select('Duplicate across pages', level), /Có nhiều|trùng tên/);
    assert.equal(selection.clicked(), null, 'Scan the tree for ambiguity before selecting an unnamed-ID target');
  });
}

test('real navigation hrefs provide only the requested level advertising ID', () => {
  const f = fixture();
  for (const [level] of levels) {
    const key = { campaign: 'selected_campaign_ids', adset: 'selected_adset_ids', ad: 'selected_ad_ids' }[level];
    const target = f.row('Actual linked entity', level, { href: `/adsmanager/manage/ads/edit?${key}=${ids.wanted}&id=${ids.other}` });
    assert.deepEqual(Array.from(f.api.entityIds({ el: target }, level)), [ids.wanted]);
    const foreign = f.row('Unrelated link', level, { href: `https://example.test/edit?${key}=${ids.wanted}` });
    assert.deepEqual(Array.from(f.api.entityIds({ el: foreign }, level)), []);
    assert.deepEqual(Array.from(f.api.idsFromUrl(`https://adsmanager.facebook.com/edit?id=${ids.wanted}`, level)), []);
  }
});

test('current selected query is level-specific and unselected names cannot supply the screen ID', () => {
  const f = fixture();
  f.context.location.href = `https://adsmanager.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${ids.other}&selected_campaign_ids=${ids.parent}`;
  f.setRows([f.row('Same full name', 'ad', { 'data-ad-id': ids.wanted })]);
  assert.deepEqual(Array.from(f.api.currentEntityIds('ad')), [ids.other]);
  assert.deepEqual(Array.from(f.api.currentEntityIds('campaign')), [ids.parent]);
  assert.deepEqual(Array.from(f.api.currentEntityIds('adset')), []);
});

test('a stale selected navigation ID cannot override a conflicting current Edit query ID', async () => {
  const f = fixture();
  f.context.location.href = `https://adsmanager.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${ids.other}`;
  const target = f.row('Same full name', 'ad', { 'data-ad-id': ids.wanted, 'aria-selected': 'true' });
  f.setRows([target]);
  const selection = selectionFixture(f);
  selection.context.currentEntityIds = f.api.currentEntityIds;
  assert.deepEqual(Array.from(f.api.currentEntityIds('ad')), [ids.other], 'The current Edit URL, not stale row selection, is authoritative');
  await assert.rejects(selection.select('Same full name', 'ad', {}, ids.wanted), /ID|đúng màn hình/);
});

test('generic data-id never invents an advertising ID', () => {
  const f = fixture();
  for (const [level] of levels) {
    const target = f.row('Unique full name', level, { 'data-id': ids.wanted });
    assert.deepEqual(Array.from(f.api.entityIds({ el: target }, level)), []);
  }
});

test('an empty href never borrows the selected ID from the current page', () => {
  const f = fixture();
  f.context.location.href = `https://adsmanager.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${ids.wanted}`;
  const target = f.row('No advertising ID', 'ad', { 'data-id': ids.other });
  assert.deepEqual(Array.from(f.api.entityIds({ el: target }, 'ad')), []);
  assert.deepEqual(Array.from(f.api.idsFromUrl('#', 'ad')), []);
});

test('a multi-selection URL cannot verify one same-name Ad as the only open entity', async () => {
  const f = fixture();
  f.context.location.href = `https://adsmanager.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${ids.wanted},${ids.other}`;
  f.setRows([f.row('Same full name', 'ad', { 'data-ad-id': ids.wanted })]);
  const selection = selectionFixture(f);
  selection.context.currentEntityIds = f.api.currentEntityIds;
  await assert.rejects(selection.select('Same full name', 'ad', {}, ids.wanted), /ID|đúng màn hình/);
});

test('duplicate Ads require their own ID even when imported parent IDs exist', async () => {
  const f = fixture();
  const wrongCampaign = f.row('Duplicate Campaign', 'campaign', { 'data-campaign-id': ids.wrongParent });
  const wrongAdset = f.row('Duplicate Ad set', 'adset', { 'data-adset-id': ids.other });
  const wrongAd = f.row('Duplicate Ad', 'ad', { 'data-campaign-id': ids.wrongParent, 'data-adset-id': ids.other });
  const rightCampaign = f.row('Duplicate Campaign', 'campaign', { 'data-campaign-id': ids.parent });
  const rightAdset = f.row('Duplicate Ad set', 'adset', { 'data-adset-id': ids.wanted });
  const rightAd = f.row('Duplicate Ad', 'ad', { 'data-campaign-id': ids.parent, 'data-adset-id': ids.wanted });
  f.setRows([wrongCampaign, wrongAdset, wrongAd, rightCampaign, rightAdset, rightAd]);
  const selection = selectionFixture(f, { screenId: '' });
  await assert.rejects(selection.select('Duplicate Ad', 'ad',
    { campaign: 'Duplicate Campaign', adset: 'Duplicate Ad set' }, '',
    { campaign: ids.parent, adset: ids.wanted }), /nhiều/);
  assert.equal(selection.clicked(), null);
});

for (const [level, label] of [['adset', 'Ad set'], ['ad', 'Ad']]) {
  test(`${label}: directly select its own ID with hidden parents and a stale selected path`, async () => {
    const f = fixture();
    const wrong = f.row('Same full name', level, { [`data-${level}-id`]: ids.other });
    const right = f.row('Same full name', level, { [`data-${level}-id`]: ids.wanted });
    f.setRows([wrong, right]);
    f.api.state.selectedPath = { campaign: 'Previously opened Campaign', adset: 'Previously opened Ad set' };
    f.api.state.selectedIds = { campaign: ids.wrongParent, adset: ids.other };
    const selection = selectionFixture(f);
    const result = await selection.select('Same full name', level,
      { campaign: 'Imported Campaign', adset: 'Imported Ad set' }, ids.wanted, { campaign: ids.parent });
    assert.equal(selection.clicked(), right);
    assert.equal(result.snapshot.name, 'Same full name');
  });
}

test('a unique full name can be selected directly without ID or visible parent rows', async () => {
  const f = fixture(), row = f.row('Unique Ad', 'ad');
  f.setRows([row]);
  const selection = selectionFixture(f, { screenId: '' });
  assert.equal((await selection.select('Unique Ad', 'ad', { campaign: 'Imported Campaign', adset: 'Imported Ad set' })).snapshot.name, 'Unique Ad');
  assert.equal(selection.clicked(), row);
});

test('matching parent names cannot override known different parent IDs', () => {
  const f = fixture();
  const campaign = f.row('Duplicate Campaign', 'campaign', { 'data-campaign-id': ids.wrongParent });
  const adset = f.row('Duplicate Ad set', 'adset', { 'data-adset-id': ids.other });
  const ad = f.row('Duplicate Ad', 'ad', { 'data-campaign-id': ids.wrongParent, 'data-adset-id': ids.other });
  f.setRows([campaign, adset, ad]);
  assert.equal(f.api.matchesExpectedParents({ el: ad },
    { campaign: 'Duplicate Campaign', adset: 'Duplicate Ad set' }, 'ad',
    { campaign: ids.parent, adset: ids.wanted }), false);
});

test('prefixed parent IDs retain the correct Campaign and Ad set scope', async () => {
  const f = fixture();
  const campaign = f.row('Parent Campaign', 'campaign', { 'data-campaign-id': ids.parent });
  const adset = f.row('Parent Ad set', 'adset', { 'data-adset-id': ids.wanted });
  const ad = f.row('Exact child', 'ad', { 'data-campaign-id': ids.parent, 'data-adset-id': ids.wanted });
  f.setRows([campaign, adset, ad]);
  const selection = selectionFixture(f, { screenId: ids.other });
  const result = await selection.select('Exact child', 'ad',
    { campaign: 'Parent Campaign', adset: 'Parent Ad set' }, `ad:${ids.other}`,
    { campaign: `cg:${ids.parent}`, adset: `as:${ids.wanted}` });
  assert.equal(selection.clicked(), ad);
  assert.equal(result.snapshot.name, 'Exact child');
});

test('prefixed IDs remain exact strings above Number precision and are level-specific', () => {
  const f = fixture(), id = '120247852812420602';
  for (const [level, prefix] of [['campaign', 'cg'], ['adset', 'as'], ['ad', 'ad']]) {
    assert.equal(f.api.normalizedEntityId(` ${prefix.toUpperCase()}:${id} `, level), id);
    f.api.rememberSelectedPath(level, 'Exact name', `${prefix}:${id}`);
    assert.equal(f.api.state.selectedIds[level], id);
    const row = f.row('Exact name', level, { [`data-${level}-id`]: `${prefix}:${id}`, 'aria-selected': 'true' });
    f.setRows([row]);
    assert.deepEqual(Array.from(f.api.currentEntityIds(level)), [id]);
    assert.deepEqual(Array.from(f.api.idsFromUrl(`https://adsmanager.facebook.com/edit?selected_${level === 'adset' ? 'adset' : level}_ids=${prefix}:${id}`, level)), [id]);
  }
  const row = f.row('Wrong type', 'campaign', { 'data-campaign-id': `as:${id}` });
  assert.deepEqual(Array.from(f.api.entityIds({ el: row }, 'campaign')), []);
});

test('reported c: Ad set import selects the correct duplicate and verifies numeric Edit ID', async () => {
  const f = fixture(), id = '120256368566560602';
  const wrong = f.row('RMKT_18-45_8 key cities_New', 'adset', { 'data-adset-id': ids.other });
  const right = f.row('RMKT_18-45_8 key cities_New', 'adset', { 'data-adset-id': id });
  f.setRows([wrong, right]);
  const selection = selectionFixture(f, { screenId: id });
  const result = await selection.select('RMKT_18-45_8 key cities_New', 'adset', {}, `c:${id}`);
  assert.equal(selection.clicked(), right);
  assert.equal(result.snapshot.name, 'RMKT_18-45_8 key cities_New');
  assert.equal(f.api.normalizedEntityId(`c:${id}`, 'adset'), id);
  assert.equal(f.api.normalizedEntityId(`c:${id}`, 'campaign'), '');
  assert.equal(f.api.normalizedEntityId(`c:${id}`, 'ad'), '');
});

test('c: Ad set ID is verified even without a navigation ID and rejects a wrong open entity', async () => {
  const f = fixture(), id = '120256368566560602';
  const target = f.row('RMKT_18-45_8 key cities_New', 'adset');
  f.setRows([target]);
  const selection = selectionFixture(f, { screenId: id });
  assert.equal((await selection.select(target.textContent, 'adset', {}, `c:${id}`)).snapshot.name, target.textContent);
  const wrongSelection = selectionFixture(f, { screenId: ids.other });
  await assert.rejects(wrongSelection.select(target.textContent, 'adset', {}, `c:${id}`), /Meta chưa mở đúng ID/);
  assert.equal(wrongSelection.clicked(), target);
});

test('c: parent ID from saved import keeps child Ad scoped to the correct Ad set', async () => {
  const f = fixture(), id = '120256368566560602';
  const campaign = f.row('Parent Campaign', 'campaign', { 'data-campaign-id': ids.parent });
  const adset = f.row('Parent Ad set', 'adset', { 'data-adset-id': id });
  const ad = f.row('Exact child', 'ad', { 'data-campaign-id': ids.parent, 'data-adset-id': id });
  f.setRows([campaign, adset, ad]);
  const selection = selectionFixture(f, { screenId: ids.wanted });
  assert.equal((await selection.select('Exact child', 'ad', { campaign: 'Parent Campaign', adset: 'Parent Ad set' },
    `ad:${ids.wanted}`, { campaign: `cg:${ids.parent}`, adset: `c:${id}` })).snapshot.name, 'Exact child');
  assert.equal(selection.clicked(), ad);
  assert.equal(f.api.matchesExpectedParents({ el: ad }, {}, 'ad', { adset: `c:${ids.other}` }), false);
  const prefixedRow = f.row('Exact parent', 'adset', { 'data-adset-id': `c:${id}` });
  assert.deepEqual(Array.from(f.api.entityIds({ el: prefixedRow }, 'adset')), [id]);
});

test('reported a: Ad import selects the correct duplicate and verifies all digits', async () => {
  const f = fixture(), id = '120256468858400602';
  const name = 'Single_BOGO5_WCV_POST 455_BOGO5_Post mới';
  const wrong = f.row(name, 'ad', { 'data-ad-id': ids.other });
  const right = f.row(name, 'ad', { 'data-ad-id': id });
  f.setRows([wrong, right]);
  const selection = selectionFixture(f, { screenId: id });
  assert.equal((await selection.select(name, 'ad', {}, `a:${id}`)).snapshot.name, name);
  assert.equal(selection.clicked(), right);
  const wrongSelection = selectionFixture(f, { screenId: ids.other });
  await assert.rejects(wrongSelection.select(name, 'ad', {}, `a:${id}`), /Meta chưa mở đúng ID/);
  assert.equal(wrongSelection.clicked(), right);
});

test('all supported export prefixes are valid only at their own level', () => {
  const f = fixture(), id = '120256468858400602';
  const allowed = { campaign: ['cg'], adset: ['as', 'c'], ad: ['ad', 'a'] };
  for (const [level] of levels) {
    assert.equal(f.api.normalizedEntityId(id, level), id);
    for (const prefix of ['cg', 'as', 'c', 'ad', 'a', 'unknown']) {
      const expected = allowed[level].includes(prefix) ? id : '';
      assert.equal(f.api.normalizedEntityId(`${prefix}:${id}`, level), expected, `${level}/${prefix}`);
      assert.equal(f.api.normalizedEntityId(` ${prefix.toUpperCase()}:${id} `, level), expected);
    }
  }
});

test('saved cg:/c:/a: hierarchy navigates all three levels without editing import IDs', async () => {
  const f = fixture();
  const nodes = [
    { level: 'campaign', name: 'Campaign imported', id: `cg:${ids.parent}`, numeric: ids.parent },
    { level: 'adset', name: 'Ad set imported', id: `c:120256368566560602`, numeric: '120256368566560602' },
    { level: 'ad', name: 'Ad imported', id: `a:120256468858400602`, numeric: '120256468858400602' }
  ];
  const rows = nodes.map((node) => f.row(node.name, node.level, { [`data-${node.level}-id`]: node.numeric }));
  f.setRows(rows);
  const parentNames = {}, parentIds = {};
  for (const node of nodes) {
    const selection = selectionFixture(f, { screenId: node.numeric });
    selection.context.rememberSelectedPath = f.api.rememberSelectedPath;
    assert.equal((await selection.select(node.name, node.level, { ...parentNames }, node.id, { ...parentIds })).snapshot.name, node.name);
    assert.equal(f.api.state.selectedIds[node.level], node.numeric);
    parentNames[node.level] = node.name;
    parentIds[node.level] = node.id;
  }
  assert.equal(nodes[2].id, 'a:120256468858400602');
});

(async () => {
  let failed = 0;
  for (const { name, run } of tests) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}\n  ${error.message}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} navigation regression checks passed.`);
  if (failed) process.exitCode = 1;
})();
