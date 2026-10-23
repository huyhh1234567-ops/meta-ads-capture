// Isolated Chrome only; replay production capture commands against a local DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { chromium } = require(process.env.MAC_PLAYWRIGHT_PATH || 'playwright');
const { harness, settings } = require('./recovery-regression');
const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent('<style>body{margin:0}h1{font:24px Arial}</style><h1>Sharp capture text</h1>');
    const cdp = await page.context().newCDPSession(page);
    for (const backgroundMode of [false, true]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: .75, mobile: false });
      const run = harness();
      run.context.chrome.debugger.sendCommand = (_target, command, params) => cdp.send(command, params);
      run.context.chrome.tabs.query = async () => [{ id: 1 }];
      vm.runInNewContext(source.slice(source.indexOf('async function captureViewport('), source.indexOf('async function captureOneAd(')), run.context);
      let pixels;
      run.context.captureOneAd = async (tab, captureSettings, _ordinal, snapshot) => {
        assert.deepEqual(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]), [800, 600, 2]);
        const dataUrl = await run.context.captureViewport(tab, captureSettings);
        const png = Buffer.from(dataUrl.split(',')[1], 'base64');
        pixels = [png.readUInt32BE(16), png.readUInt32BE(20)];
        return { name: snapshot.name, dataUrl, width: pixels[0], height: pixels[1], parts: 1 };
      };
      await run.run(1, { ...settings, targetCampaigns: ['First'], backgroundMode, highResolution: true });
      assert.equal(run.final().state, 'done', run.final().message);
      assert.deepEqual(pixels, [1600, 1200]);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      // Clearing metrics returns to Chrome's window size, independent of Playwright's viewport override.
      assert.equal(await page.evaluate(() => devicePixelRatio), 1);
      console.log(`PASS real PNG 1600x1200 from 800x600 CSS at initial .75 DPR; background=${backgroundMode}; density restored`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
