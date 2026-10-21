// Optional: isolated Chrome with synthetic DOM, no Ads account or upload.
// MAC_PLAYWRIGHT_PATH points to an existing Playwright installation.
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
    const wanted = '120247852812420602', other = '120247852812420603';
    for (const [level, label, prefix] of [['campaign', 'Campaign', 'cg'], ['adset', 'Ad set', 'as'], ['adset', 'Ad set', 'c'], ['ad', 'Ad', 'ad'], ['ad', 'Ad', 'a']]) {
      await page.goto('about:blank');
      await page.setContent(`<style>nav{position:absolute;left:20px;top:100px;width:300px}section{position:absolute;left:500px;top:100px}button{display:block;height:40px;width:300px}</style>
        <nav role="grid" id="campaign_structure_tree_root"><input role="combobox" placeholder="Search"><button role="rowheader" aria-label="${label}" data-${level}-id="${other}" aria-selected="true">Exact imported name</button>
        <button role="rowheader" aria-label="${label}" data-${level}-id="${wanted}">Exact imported name</button></nav>
        <section><label>${label} name</label><input value="Exact imported name"></section>`);
      await page.evaluate(() => {
        window.__clicks = 0;
        for (const row of document.querySelectorAll('[role="rowheader"]')) row.onclick = () => {
          window.__clicks++;
          for (const otherRow of document.querySelectorAll('[role="rowheader"]')) otherRow.removeAttribute('aria-selected');
          row.setAttribute('aria-selected', 'true');
        };
        window.chrome = { runtime: {
          onMessage: { addListener() {} },
          sendMessage: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms || 0))
        } };
      });
      // Substitute image preparation only; navigation, ID reads and checks are real.
      await page.addScriptTag({ content: source.replace('  chrome.runtime.onMessage.addListener',
        '  prepareEntity = async (level) => ({ name: currentEntityName(level) });\n  window.__idTest = { state, selectNamedEntity, currentEntityIds };\n  chrome.runtime.onMessage.addListener') });
      const result = await page.evaluate(async ({ level, prefix, wanted }) => {
        window.__idTest.state.readOnly = true;
        const selected = await window.__idTest.selectNamedEntity('Exact imported name', level, {}, `${prefix}:${wanted}`);
        await window.__idTest.selectNamedEntity('Exact imported name', level, {}, `${prefix}:${wanted}`);
        return { name: selected.snapshot.name, ids: window.__idTest.currentEntityIds(level), remembered: window.__idTest.state.selectedIds[level], clicks: window.__clicks };
      }, { level, prefix, wanted });
      assert.deepEqual(result, { name: 'Exact imported name', ids: [wanted], remembered: wanted, clicks: 1 });
      console.log(`PASS real Chrome ${label} (${prefix}:): duplicate-name navigation, prefixed import and exact 18-digit ID`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
