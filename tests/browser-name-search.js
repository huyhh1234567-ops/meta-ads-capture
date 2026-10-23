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
      window.readyDelays = []; window.resultsReadyAt = 0;
      window.screenName = ''; window.screenId = ''; window.failLoading = false;
      window.renderDelay = 650; window.hideLoading = false;
      const search = document.querySelector('nav input');
      const rows = document.getElementById('rows');
      let revision = 0;
      let inputQuery = '21New Launch 264 - drop 2_Female_FB_21/10_31/10_$32.4';
      search.setAttribute('value', inputQuery);
      const ads = [
        { name: 'First exact Ad', id: '111111111111111' },
        { name: 'Second exact Ad', id: '222222222222222' },
        { name: 'Duplicate Ad', id: '333333333333333' },
        { name: 'Duplicate Ad', id: '444444444444444' },
        { name: 'New Launch 264 - drop 2_Female', id: '555555555555555' }
      ];
      window.renderRows = (items) => {
        rows.replaceChildren();
        for (const item of items) {
          const row = document.createElement('button');
          row.setAttribute('role', 'rowheader'); row.setAttribute('aria-label', item.level || 'Ad');
          row.id = `ads_campaign_structure_item_${item.id}`;
          row.textContent = item.name;
          row.onclick = () => { window.readyDelays.push(performance.now() - window.resultsReadyAt); window.clicks.push(item.id); window.screenId = item.id; window.screenName = item.name; };
          rows.append(row);
        }
      };
      // Search results change only after Enter and a delayed render.
      search.addEventListener('input', () => {
        window.searchInputs++;
        const value = search.value;
        setTimeout(() => { inputQuery = value; search.setAttribute('value', value); }, 350);
      });
      search.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const query = inputQuery, request = ++revision;
        window.queries.push(query);
        rows.setAttribute('aria-busy', String(!window.hideLoading));
        if (window.hideLoading && !window.keepStaleRows) window.renderRows([{ name: '21New Launch 264 - drop 2_Female_FB_21/10_31/10_$32.4', id: '666666666666666', level: 'Ad set' }]);
        if (window.failLoading) return;
        setTimeout(() => {
          if (request !== revision) return;
          window.renderRows(ads.filter((ad) => ad.name.includes(query)));
          window.resultsReadyAt = performance.now();
          rows.setAttribute('aria-busy', 'false');
        }, window.renderDelay);
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
      searchTest.state.selectedPath = { campaign: 'Old Campaign', adset: 'Old Ad set' };
      searchTest.state.selectedIds = { campaign: '888888888888888', adset: '999999999999999' };
      const parents = { campaign: 'Imported Campaign', adset: 'Imported Ad set' };
      const first = await window.searchTest.selectNamedEntity('First exact Ad', 'ad', parents, 'a:111111111111111');
      const second = await window.searchTest.selectNamedEntity('Second exact Ad', 'ad', parents, 'a:222222222222222');
      return { names: [first.snapshot.name, second.snapshot.name], queries, clicks, searchInputs,
        setting: document.getElementById('ad-name').value, query: document.querySelector('nav input').value };
    });
    assert.deepEqual(result, { names: ['First exact Ad', 'Second exact Ad'],
      queries: ['First exact Ad', 'Second exact Ad'], clicks: ['111111111111111', '222222222222222'],
      searchInputs: 2, setting: 'Original ad setting', query: 'Second exact Ad' });
    console.log('PASS direct sibling Ad searches use their own IDs with no parent rows or selected ancestors');

    await page.evaluate(async () => { await searchTest.selectNamedEntity('First exact Ad', 'ad'); });
    const readyDelays = await page.evaluate(() => readyDelays);
    console.log(`Ready Search to click (ID, ID, unique name): ${readyDelays.map(Math.round).join(', ')} ms`);
    assert.ok(readyDelays.every((ms) => ms < 500), 'Already loaded results must be clicked within 500 ms, without repeated stability waits');

    await page.evaluate(() => {
      const unrelated = document.createElement('div');
      unrelated.id = 'unrelated-pane';
      unrelated.style.cssText = 'position:absolute;left:0;top:300px;width:350px;height:450px;overflow:auto';
      unrelated.innerHTML = '<div style="height:800px"><div role="progressbar" style="width:50px;height:20px">Loading another panel</div></div>';
      document.body.append(unrelated);
    });
    await page.evaluate(async () => {
      const selected = await searchTest.selectNamedEntity('First exact Ad', 'ad', {}, 'a:111111111111111');
      if (selected.snapshot.name !== 'First exact Ad') throw new Error('Wrong selected Ad');
      const unique = await searchTest.selectNamedEntity('Second exact Ad', 'ad');
      if (unique.snapshot.name !== 'Second exact Ad') throw new Error('Wrong unique result');
    });
    await page.locator('#unrelated-pane').evaluate((node) => node.remove());
    console.log('PASS unrelated left-side scroller and loader cannot block ready Search results');

    await page.evaluate(async () => {
      window.hideLoading = true; window.keepStaleRows = true;
      await searchTest.selectNamedEntity('First exact Ad', 'ad', {}, 'a:111111111111111');
      window.keepStaleRows = false; window.hideLoading = false;
    });
    console.log('PASS stale same-level results without a loading marker wait for the new target');

    await page.evaluate(async () => {
      window.hideLoading = true; window.renderDelay = 2600;
      const selected = await searchTest.selectNamedEntity('New Launch 264 - drop 2_Female', 'ad', {}, 'a:555555555555555');
      if (selected.snapshot.name !== 'New Launch 264 - drop 2_Female') throw new Error('Wrong reported Ad');
      window.hideLoading = false; window.renderDelay = 650;
    });
    console.log('PASS reported Ad loads after a parent-only result without a loading marker');

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
    await page.evaluate(() => { setTimeout(() => { document.querySelector('nav input').value = 'Changed after Enter'; }, 1000); });
    await expectFailure('First exact Ad', '', /Không thể đọc kết quả Ad sau Search: Ô Search đã thay đổi/);
    await page.evaluate(() => { setTimeout(() => { searchTest.state.stopRequested = true; }, 100); });
    await expectFailure('First exact Ad', '', /__MAC_STOPPED__/);
    await page.evaluate(() => { searchTest.state.stopRequested = false; });
    await page.evaluate(() => { window.failLoading = true; });
    await expectFailure('First exact Ad', '', /còn loading trong cây/);
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
