// Isolated Chrome with a mocked google.script.run; no Google account or upload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MAC_PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const client = 'a'.repeat(32), nonce = '00000000-0000-0000-0000-000000000001';
    const html = fs.readFileSync(path.join(__dirname, '../apps-script/DriveConnect.html'), 'utf8').replace('<?= nonce ?>', nonce).replace('<?= client ?>', client);
    await page.route('https://n-project-0lu-script.googleusercontent.com/**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
    await page.addInitScript(({ client }) => {
      window.readyEvents = []; window.serverCalls = [];
      window.chrome = { runtime: { id: client, sendMessage: async (data) => { readyEvents.push(data); }, onMessage: { addListener: (fn) => { window.bridgeHandler = fn; } } } };
      const runner = { withSuccessHandler(fn) { return { ...this, success: fn }; }, withFailureHandler(fn) { return { ...this, failure: fn }; },
        browserDriveRequest(action, payload) { serverCalls.push({ action, payload }); this.success({ ok: true, account: 'alice@example.test', viewerLink: 'https://script.google.com/macros/s/user-app/exec?view=image&sig=signature' }); } };
      window.google = { script: { run: runner } };
    }, { client });
    await page.goto('https://n-project-0lu-script.googleusercontent.com/userCodeAppPanel');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../google-drive-bridge.js'), 'utf8') });
    await page.waitForFunction(() => readyEvents.length > 0);
    const result = await page.evaluate(async ({ client, nonce }) => {
      const response = await new Promise((resolve) => bridgeHandler({ type: 'MAC_GOOGLE_REQUEST', id: 'request1', client, nonce, action: 'upload', payload: { dataUrl: 'test-image' } }, { id: client }, resolve));
      const rejected = bridgeHandler({ type: 'MAC_GOOGLE_REQUEST', id: 'request2', client, nonce: 'old-session', action: 'upload' }, { id: client }, () => { throw new Error('Stale request accepted'); });
      const foreign = bridgeHandler({ type: 'MAC_GOOGLE_REQUEST', id: 'request3', client, nonce, action: 'upload' }, { id: 'b'.repeat(32) }, () => { throw new Error('Foreign extension accepted'); });
      return { response, rejected, foreign, ready: readyEvents[0], uploads: serverCalls.filter((item) => item.action === 'upload').length, status: document.getElementById('status').textContent };
    }, { client, nonce });
    assert.equal(result.response.ok, true); assert.equal(result.response.account, 'alice@example.test');
    assert.equal(result.uploads, 1); assert.equal(result.rejected, false); assert.equal(result.foreign, false);
    assert.equal(result.ready.nonce, nonce); assert.match(result.status, /alice@example.test/);
    console.log('PASS HTML Service handshake after early READY, upload relay, and rejection of stale nonce/foreign sender');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
