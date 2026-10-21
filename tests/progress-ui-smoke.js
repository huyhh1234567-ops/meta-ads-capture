// Optional isolated Chrome, mocked extension APIs; never the user's Ads profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.MAC_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const file = request.url.slice(1);
  if (!['progress.html', 'progress.js', 'progress.css'].includes(file) || !fs.existsSync(path.join(root, file))) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', `${file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'}; charset=utf-8`);
  response.end(fs.readFileSync(path.join(root, file)));
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 300 } });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__actions = []; window.__listener = null;
      let currentWindow = { id: 8, width: 360, height: 330 };
      window.chrome = {
        storage: { onChanged: { addListener(fn) { window.__listener = fn; } } },
        runtime: { sendMessage: async (message) => {
          window.__actions.push(message);
          if (message.type === 'MAC_GET_STATUSES') return { session1: { state: 'running', progress: 24, message: 'Ad set 2: đang chụp đoạn 3…', targetTabId: 42, updatedAt: 1 } };
          return { ok: true };
        } },
        tabs: { get: async (id) => { if (window.__missingTab) throw new Error('No tab'); return { id, windowId: 7 }; },
          update: async (id, options) => window.__actions.push({ tabId: id, ...options }) },
        windows: { getCurrent: async () => currentWindow, update: async (id, options) => {
          window.__actions.push({ windowId: id, ...options }); if (id === 8) currentWindow = { ...currentWindow, ...options };
        } }
      };
    });
    const response = await page.goto(`http://127.0.0.1:${server.address().port}/progress.html`);
    assert.equal(response.status(), 200, 'Monitor page must exist');
    await page.waitForFunction(() => document.getElementById('progress')?.value === 24);
    assert.equal(await page.locator('#message').textContent(), 'Ad set 2: đang chụp đoạn 3…');
    assert.equal(await page.locator('#warning').isVisible(), false);
    await page.evaluate(() => window.__listener({ captureStatus: { newValue: { state: 'running', retrying: true, progress: 24,
      message: 'Ad set 2: đang chụp lại…', targetTabId: 42, updatedAt: 2 } } }, 'local'));
    await page.locator('#warning').waitFor({ state: 'visible' });
    assert.match(await page.locator('#warning').textContent(), /chuyển về tab/i);
    assert.equal(await page.locator('#warning').evaluate((el) => getComputedStyle(el).color), 'rgb(180, 35, 24)');
    await page.evaluate(() => window.__listener({ captureStatus: { newValue: { state: 'idle', updatedAt: 1 } } }, 'local'));
    assert.equal(await page.locator('#warning').isVisible(), true, 'Ignore older status arriving after a live update');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sizeToggle');
    await page.locator('#backToTab').click();
    assert.ok((await page.evaluate(() => window.__actions)).some((action) => action.tabId === 42 && action.active === true));
    assert.ok((await page.evaluate(() => window.__actions)).some((action) => action.windowId === 7 && action.focused === true));
    await page.locator('#sizeToggle').click();
    assert.equal(await page.locator('#sizeToggle').getAttribute('aria-expanded'), 'false');
    await page.locator('#sizeToggle').click();
    assert.equal(await page.locator('#sizeToggle').getAttribute('aria-expanded'), 'true');
    await page.locator('#stopCapture').click();
    assert.ok((await page.evaluate(() => window.__actions)).some((action) => action.type === 'MAC_STOP_SESSION'));
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 420 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}`);
    }
    await page.setViewportSize({ width: 360, height: 300 });
    const output = path.join(root, 'output/playwright'); fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'progress-retry.png') });
    await page.evaluate(() => window.__listener({ captureStatus: { newValue: { state: 'done', progress: 100,
      message: 'Hoàn tất 5 mục. Mở app để Copy kết quả.', targetTabId: 42, updatedAt: 3 } } }, 'local'));
    assert.equal(await page.locator('#warning').isVisible(), false);
    assert.equal(await page.locator('#stopCapture').isDisabled(), true);
    assert.equal(await page.locator('#progress').evaluate((el) => el.value), 100);
    await page.evaluate(() => { window.__missingTab = true; });
    await page.locator('#backToTab').click();
    assert.match(await page.locator('#actionError').textContent(), /đã đóng/);
    assert.deepEqual(errors, []);
    console.log('PASS Chrome status updates, retry reminder, target focus, resize controls, stop, responsive layout, completion and closed-tab error');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
