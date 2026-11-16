// Uses a local fixture of the two-tab Lead preview header, not an Ads account.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.MAC_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const previewUrl = 'https://fb.me/adspreview/facebook/26T9EyYhOhwjbsD';
    for (const initialTab of ['destination', 'ad']) {
      await page.setContent(`
        <style>
          .card { margin-left: auto; width: 410px; padding: 12px }
          #campaign_structure_tree_root { position: absolute; width: 240px }
          header, #toolbar { display: flex; align-items: center; gap: 6px }
          #toolbar { justify-content: end; margin-top: 6px }
          button { background: transparent; border: 0; padding: 6px 10px }
          button.selected { background: #deebf8 }
        </style>
        <div id="campaign_structure_tree_root"><input aria-label="Search" placeholder="Search"></div>
        <section class="card">
          <header><span style="margin-right:auto">Ad preview</span><button id="ad">Ad</button><button id="destination">Destination</button></header>
          <div id="toolbar"><button>Review defaults</button><button id="share" aria-haspopup="menu">Share previews</button></div>
          <button id="shareLink" hidden>Share a link</button>
          <div role="dialog" id="shareDialog" hidden>Share preview <a href="${previewUrl}">Preview link</a><button id="closeShare">Close</button></div>
        </section>`);
      await page.evaluate((active) => {
        const get = (id) => document.getElementById(id);
        window.__metaAdsCaptureInstalled = false;
        window.__clicks = [];
        window.chrome = { runtime: { onMessage: { addListener: (fn) => { window.__message = fn; } },
          sendMessage: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) } };
        get(active).classList.add('selected');
        get('share').disabled = active === 'destination';
        get('ad').onclick = () => {
          window.__clicks.push('ad');
          setTimeout(() => {
            get('destination').classList.remove('selected');
            get('ad').classList.add('selected');
            get('share').disabled = false;
          }, 340);
        };
        get('share').onclick = () => { window.__clicks.push('share'); get('shareLink').hidden = false; };
        get('shareLink').onclick = () => { window.__clicks.push('link'); get('shareLink').hidden = true; get('shareDialog').hidden = false; };
        get('closeShare').onclick = () => { get('shareDialog').hidden = true; };
      }, initialTab);
      await page.addScriptTag({ path: path.join(__dirname, '../content.js') });
      const result = await page.evaluate(async () => {
        const run = (message) => new Promise((resolve) => window.__message(message, {}, resolve));
        const init = await run({ type: 'MAC_CAPTURE_INIT' });
        if (!init.ok) throw new Error(init.error);
        return run({ type: 'MAC_GET_PREVIEW_LINK', level: 'ad' });
      });
      assert.equal(result.link, previewUrl, JSON.stringify(result));
      assert.deepEqual(await page.evaluate(() => window.__clicks), initialTab === 'destination' ? ['ad', 'share', 'link'] : ['share', 'link']);
      assert.ok(await page.locator('#shareDialog').isHidden());
    }
    console.log('PASS Chrome Lead preview switches Destination once, skips an already-selected Ad, and returns the share link');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
