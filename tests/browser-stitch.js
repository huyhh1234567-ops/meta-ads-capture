// Isolated Chrome: no Ads account, no upload, no user browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.MAC_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer((request, response) => {
    if (!['/offscreen.html', '/offscreen.js'].includes(request.url)) { response.writeHead(404); response.end(); return; }
    // Extension resources have no HTTP charset: the HTML must declare its own.
    response.setHeader('Content-Type', request.url.endsWith('.html') ? 'text/html' : 'text/javascript');
    response.end(fs.readFileSync(path.join(root, request.url.slice(1))));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.chrome = { runtime: { onMessage: { addListener() {} } } }; });
    await page.goto(`http://127.0.0.1:${server.address().port}/offscreen.html`);
    const actual = await page.evaluate(async () => {
      const geometry = { viewportWidth: 800, viewportHeight: 600, rect: { left: 100, top: 100, width: 500, height: 400 }, scrollHeight: 1000 };
      const tile = (top) => {
        const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1200;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1600, 1200);
        ctx.fillStyle = '#00ff00'; ctx.fillRect(200, 200 + (990 - top) * 2, 1000, 20);
        return { scrollTop: top, dataUrl: canvas.toDataURL() };
      };
      const frames = [0, 300, 600].map(tile);
      let error;
      try { await stitch([frames[0]], geometry); } catch (caught) { error = caught.message; }
      const result = await stitch(frames, geometry);
      const bitmap = await createImageBitmap(await (await fetch(result.dataUrl)).blob());
      const out = document.createElement('canvas'); out.width = result.width; out.height = result.height;
      const ctx = out.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
      const bottom = [...ctx.getImageData(10, result.height - 1, 1, 1).data]; bitmap.close();
      return { charset: document.characterSet, error, bottom, width: result.width, height: result.height };
    });
    console.log(JSON.stringify(actual));
    assert.equal(actual.charset, 'UTF-8');
    assert.match(actual.error, /^Ảnh chưa phủ hết nội dung/);
    assert.deepEqual(actual.bottom, [0, 255, 0, 255], 'Keep the final content pixels at native 2x DPR');
    assert.equal(actual.width, 1000); assert.equal(actual.height, 2000);
    console.log('PASS Chrome UTF-8 errors and real pixel stitching at native DPR');
    for (const [filename, command] of [['content.js', 'MAC_PREVIEW_SCROLL'], ['google-content.js', 'MAC_PREVIEW_SCROLL'], ['page-content.js', 'MAC_PAGE_PREVIEW_SCROLL']]) {
      await page.goto('about:blank');
      await page.setContent('<style>body{margin:0}main{position:absolute;left:200px;top:100px;width:700px;height:400px;overflow:auto}main>div{height:1000px;position:relative}section{position:absolute;top:850px}label{display:block}</style><main><div>Stable content<section><label>Budget</label><label>Audience</label><label>Placement</label><label>Brand safety</label></section></div></main>');
      await page.evaluate(() => {
        window.chrome.runtime.onMessage.addListener = (fn) => { window.__handler = fn; };
        window.chrome.runtime.sendMessage = ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms || 0));
      });
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'capture-scroll.js'), 'utf8') });
      let adapter = fs.readFileSync(path.join(root, filename), 'utf8');
      // Expose only the pane state. Scroll handler and smooth-scroll helper are real.
      adapter = adapter.replace('  chrome.runtime.onMessage.addListener',
        '  window.__captureState = state;\n  chrome.runtime.onMessage.addListener');
      await page.addScriptTag({ content: adapter });
      const result = await page.evaluate(async ({ filename, command }) => {
        const pane = document.querySelector('main'); pane.scrollTop = 597;
        const state = window.__captureState;
        state.settings = {};
        if (filename === 'content.js') { state.preview = pane; state.currentLevel = 'adset'; }
        else state.container = pane;
        return new Promise((resolve) => window.__handler({ type: command, toBottom: true, settleMs: 100, maxLoadWaitMs: 10000 }, {}, resolve));
      }, { filename, command });
      assert.equal(result.ok, true, `${filename}: ${result.error}`);
      assert.equal(result.snapshot.scrollTop, 600, `${filename}: capture the last 3 px, not the approximate bottom`);
      console.log(`PASS Chrome ${filename} exact-bottom scroll`);
    }
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
