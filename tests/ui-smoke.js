// Optional: MAC_PLAYWRIGHT_PATH points to an existing Playwright installation.
// Uses isolated, headless Chrome and mocked extension APIs; never an Ads account.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.MAC_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const files = new Set(['popup.html', 'popup.css', 'popup.js', 'xlsx-parser.js', 'package-config.js']);
const server = http.createServer((request, response) => {
  const file = request.url.slice(1).split('?')[0];
  if (!files.has(file)) { response.writeHead(404).end(); return; }
  const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript';
  response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  response.end(fs.readFileSync(path.join(root, file)));
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const settings = { backgroundMode: false, autoHidePanel: false };
      const result = { screenshots: [{ link: 'https://images.example.test/first' }], processed: [{ name: 'First' }], mappings: [], report: 'Ad First: https://images.example.test/first', copyText: 'Ad First: https://images.example.test/first', copyHtml: '<p>Ad First: <a href="https://images.example.test/first">Link</a></p>', compactReport: 'Ad First: Link' };
      let status = { state: 'error', message: 'Fixture failure; partial results retained', progress: 50, resumeAvailable: true, result };
      const local = {};
      window.__starts = [];
      window.__googleConnects = 0;
      window.chrome = {
        storage: {
          sync: { get: async () => ({ settings }), set: async () => {} },
          local: { get: async () => local, set: async (data) => Object.assign(local, data) }
        },
        tabs: { query: async () => [{ id: 7, windowId: 1, url: 'https://adsmanager.facebook.com/adsmanager/manage/ads' }] },
        runtime: { sendMessage: async (message) => {
          if (message.type === 'MAC_GOOGLE_STATUS') return { ok: true, connected: false };
          if (message.type === 'MAC_GOOGLE_CONNECT') { window.__googleConnects++; return { ok: true, pending: true }; }
          if (message.type === 'MAC_GOOGLE_CHECK') return { ok: true, account: 'alice@example.test' };
          if (message.type === 'MAC_GET_STATUSES') return { session1: status };
          if (message.type === 'MAC_START_SINGLE') {
            window.__starts.push(message.settings);
            status = { ...status, state: 'done', progress: 100, resumeAvailable: false };
          }
          return { ok: true };
        } }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);
    await page.locator('#resume').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#highlightTA').isChecked(), false);
    assert.equal(await page.locator('#highlightBudget').isChecked(), false);
    assert.equal(await page.locator('#highResolution').isChecked(), true);
    assert.match(await page.locator('label:has(#highlightAdvantage)').innerText(), /của Ad[\s\S]*Không khoanh[\s\S]*Ad set/);
    assert.ok((await page.locator('.session-result-text').inputValue()).includes('https://images.example.test/first'));
    await page.locator('#highlightTA').check();
    await page.locator('#highlightBudget').check();
    const output = path.join(root, 'output/playwright');
    fs.mkdirSync(output, { recursive: true });
    await page.locator('#resume').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'popup-partial-resume-6.4.0.png') });
    await page.locator('#resume').click();
    await page.waitForFunction(() => window.__starts.length === 1);
    const resumed = await page.evaluate(() => window.__starts[0]);
    assert.equal(resumed.resumeCapture, true);
    assert.equal(resumed.tabId, 7);
    assert.equal(resumed.highlightTA, true); assert.equal(resumed.highlightBudget, true);
    assert.equal(resumed.highResolution, true);
    await page.locator('#resume').waitFor({ state: 'hidden' });
    await page.locator('.advanced > summary').click();
    await page.locator('#highResolution').uncheck();
    await page.locator('#capture').click();
    await page.waitForFunction(() => window.__starts.length === 2);
    assert.equal(await page.evaluate(() => window.__starts[1].resumeCapture), false);
    assert.equal(await page.evaluate(() => window.__starts[1].highResolution), false);
    await page.locator('input[name=destination][value=drive]').check();
    assert.equal(await page.locator('#driveAuthMode').inputValue(), 'google');
    assert.equal(await page.locator('#webhookOptions').isVisible(), false);
    await page.locator('#connect').click();
    assert.equal(await page.evaluate(() => window.__googleConnects), 1);
    await page.locator('#folderId').fill('https://drive.google.com/drive/folders/alice_folder_123');
    await page.locator('#driveAuthMode').selectOption('webhook');
    await page.locator('#webhookToken').fill('never-send-this-private-token');
    await page.locator('#webhookUrl').fill('https://script.google.com/macros/s/private-owner-deployment/exec');
    await page.locator('#driveAuthMode').selectOption('google');
    await page.locator('#capture').click();
    await page.waitForFunction(() => window.__starts.length === 3);
    const googleSettings = await page.evaluate(() => window.__starts[2]);
    assert.equal(googleSettings.driveAuthMode, 'google'); assert.equal(googleSettings.folderId, 'alice_folder_123');
    assert.equal(googleSettings.webhookToken, ''); assert.equal(googleSettings.webhookUrl, '');
    for (const width of [360, 420]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No horizontal overflow at ${width}px`);
    }
    assert.deepEqual(errors, [], 'No runtime UI errors');
    await page.evaluate(() => document.getElementById('highlightTA').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, 'popup-6.4.0.png') });
    console.log('PASS real Chrome popup: opt-in controls, partial Copy result, resume/new-run flags and 360/420px layout');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
