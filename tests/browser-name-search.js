// Isolated Chrome: real DOM/events, no advertising account or upload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MAC_PLAYWRIGHT_PATH || 'playwright');
const source = fs.readFileSync(path.resolve(__dirname, '../content.js'), 'utf8');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent(`<style>
      #campaign_structure_tree_root{position:absolute;left:30px;top:40px;width:320px}
      #rows{height:180px;overflow:auto}button{display:block;width:300px;height:40px}
      section{position:absolute;left:600px;top:40px}
      </style><nav id="campaign_structure_tree_root">
      <input role="combobox" placeholder="Search"><div id="rows" role="grid"></div>
      </nav><section><label>Ad name<input id="ad-name" value="Original ad setting"></label>
      <input placeholder="Search" id="settings-search"></section>`);
    await page.evaluate(() => {
      window.queries = []; window.clicks = []; window.searchInputs = 0;
      window.screenName = ''; window.screenId = ''; window.failLoading = false;
      const search = document.querySelector('nav input');
      const rows = document.getElementById('rows');
      let revision = 0;
      const ads = [
        { name: 'First exact Ad', id: '111111111111111' },
        { name: 'Second exact Ad', id: '222222222222222' },
        { name: 'Duplicate Ad', id: '333333333333333' },
        { name: 'Duplicate Ad', id: '444444444444444' }
      ];
      window.renderRows = (items) => {
        rows.replaceChildren();
        for (const item of items) {
          const row = document.createElement('button');
          row.setAttribute('role', 'rowheader'); row.setAttribute('aria-label', 'Ad');
          row.id = `ads_campaign_structure_item_${item.id}`;
          row.textContent = item.name;
          row.onclick = () => { window.clicks.push(item.id); window.screenId = item.id; window.screenName = item.name; };
          rows.append(row);
        }
      };
      // Search results change only after Enter and a delayed render.
      search.addEventListener('input', () => { window.searchInputs++; });
      search.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const query = search.value, request = ++revision;
        window.queries.push(query);
        rows.setAttribute('aria-busy', 'true');
        if (window.failLoading) return;
        setTimeout(() => {
          if (request !== revision) return;
          window.renderRows(ads.filter((ad) => ad.name.includes(query)));
          rows.setAttribute('aria-busy', 'false');
        }, 650);
      });
      window.renderRows([{ name: 'Stale unrelated Ad', id: '999999999999999' }]);
      window.chrome = { runtime: { onMessage: { addListener(fn) { window.listener = fn; } },
        sendMessage: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms || 0)) } };
    });
    await page.addScriptTag({ content: source.replace('  chrome.runtime.onMessage.addListener',
      `  prepareEntity = async () => ({ name: window.screenName, scrollTop: 0 });
  currentEntityName = () => window.screenName;
  currentEntityIds = () => window.screenId ? [window.screenId] : [];
  isLevelScreen = () => !!window.screenName;
  window.searchTest = { state, selectNamedEntity, searchEntityList, entityIds };
  chrome.runtime.onMessage.addListener`) });
    await page.evaluate(() => {
      window.searchTest.state.readOnly = true;
      window.searchTest.state.settings.maxLoadWaitMs = 3000;
    });
    const result = await page.evaluate(async () => {
      const first = await window.searchTest.selectNamedEntity('First exact Ad', 'ad', {}, 'a:111111111111111');
      const second = await window.searchTest.selectNamedEntity('Second exact Ad', 'ad', {}, 'a:222222222222222');
      return { names: [first.snapshot.name, second.snapshot.name], queries, clicks, searchInputs,
        setting: document.getElementById('ad-name').value, query: document.querySelector('nav input').value };
    });
    assert.deepEqual(result, { names: ['First exact Ad', 'Second exact Ad'],
      queries: ['First exact Ad', 'Second exact Ad'], clicks: ['111111111111111', '222222222222222'],
      searchInputs: 2, setting: 'Original ad setting', query: 'Second exact Ad' });
    console.log('PASS search each name with Enter, await delayed results, then open the exact ID');

    const expectFailure = async (name, id, pattern) => {
      const result = await page.evaluate(async ({ name, id }) => {
        const before = clicks.length;
        try { await searchTest.selectNamedEntity(name, 'ad', {}, id); return { error: '', clicks: clicks.length - before }; }
        catch (error) { return { error: error.message, clicks: clicks.length - before }; }
      }, { name, id });
      assert.match(result.error, pattern); assert.equal(result.clicks, 0);
    };
    await expectFailure('Missing full Ad', '', /Không tìm thấy/);
    await expectFailure('Duplicate Ad', '', /nhiều/);
    await expectFailure('First exact Ad', 'a:888888888888888', /ID/);
    await page.evaluate(async () => { await searchTest.selectNamedEntity('Duplicate Ad', 'ad', {}, 'a:444444444444444'); });
    assert.equal(await page.evaluate(() => clicks.at(-1)), '444444444444444');
    console.log('PASS empty results, duplicate names, wrong ID and duplicate selection by typed navigation ID');

    // The read-only guard permits typing only during the scoped search operation.
    const blocked = await page.evaluate(() => {
      const enter = (node) => !node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return [enter(document.querySelector('nav input')), enter(document.getElementById('ad-name')),
        enter(document.getElementById('settings-search'))];
    });
    assert.deepEqual(blocked, [true, true, true]);
    await page.evaluate(() => { setTimeout(() => { document.querySelector('nav input').value = 'Changed by user'; }, 100); });
    await expectFailure('First exact Ad', '', /Search/);
    await page.evaluate(() => { setTimeout(() => { searchTest.state.stopRequested = true; }, 100); });
    await expectFailure('First exact Ad', '', /__MAC_STOPPED__/);
    await page.evaluate(() => { searchTest.state.stopRequested = false; });
    await page.evaluate(() => { window.failLoading = true; });
    await expectFailure('First exact Ad', '', /ổn định|tải/);
    await page.evaluate(() => { searchTest.state.stopRequested = true; });
    await expectFailure('First exact Ad', '', /__MAC_STOPPED__/);
    await page.evaluate(() => {
      searchTest.state.stopRequested = false;
      document.querySelector('nav input').after(document.querySelector('nav input').cloneNode());
    });
    await expectFailure('First exact Ad', '', /Search|tìm kiếm/);
    await page.evaluate(() => { document.querySelector('nav input').remove(); });
    await page.evaluate(() => { searchTest.state.stopRequested = false; document.querySelector('nav input').remove(); });
    await expectFailure('First exact Ad', '', /Search|tìm kiếm/);
    assert.equal(await page.inputValue('#settings-search'), '');
    console.log('PASS read-only protection, loading timeout, Stop and missing Search fail safely');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
