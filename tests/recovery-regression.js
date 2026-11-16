// Run with: node tests/recovery-regression.js (no dependencies or account needed).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).version;
const copy = (value) => JSON.parse(JSON.stringify(value));
const settings = {
  targetCampaigns: ['First', 'Second'], captureAdImage: true, captureAdPreview: false,
  backgroundMode: false, uploadDrive: true, filenamePrefix: 'Regression',
  highResolution: true, captureMode: 'auto'
};
const tab = (id) => ({ id, windowId: 1, url: 'https://adsmanager.facebook.com/adsmanager/manage/ads', autoDiscardable: true });

function harness(options = {}, storage = {}) {
  const statuses = [], messages = [], captures = [], uploads = [], previews = [], commands = [], zooms = [];
  let currentName = '';
  const snapshot = () => ({ name: currentName, scrollTop: 0, scrollHeight: 400, clientHeight: 400,
    viewportWidth: 800, viewportHeight: 600, rect: { left: 0, top: 0, width: 800, height: 400 }, atBottom: true });
  const context = {
    URL, Date, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto, TextEncoder, Uint8Array,
    DEFAULTS: {}, regularCaptureTabs: new Set(), activeCaptureTabs: new Set(), backgroundCaptureTabs: new Set(),
    stopRequestedTabs: new Set(), activeSessions: new Map(), lastKeepAlive: new Map(),
    isGoogleAdsUrl: () => false, wait: async () => {}, safe: (value) => String(value || ''),
    setStatus: async (patch) => {
      const status = { ...(storage.captureStatus || {}), ...copy(patch) };
      storage.captureStatus = status;
      statuses.push(copy(status));
    },
    shouldStop: async () => false,
    send: async (id, message) => {
      messages.push({ ...copy(message), targetTabId: id });
      if (message.type === 'MAC_CAPTURE_INIT') return options.initFailure ? { ok: false, error: 'Initialization failed' } : { ok: true, version };
      if (message.type === 'MAC_SELECT_TARGET_ENTITY') {
        currentName = message.name;
        if (options.selectFailure?.(message.name)) return { ok: false, error: 'Preparation failed' };
        if (options.stopOnSelect === message.name) throw new Error('__MAC_STOPPED__');
      }
      return { ok: true, snapshot: snapshot() };
    },
    keepBackgroundTabActive: async () => {}, installBackgroundRenderShim: async () => {}, removeBackgroundRenderShim: async () => {},
    captureOneAd: async (currentTab, _settings, _ordinal, initialSnapshot) => {
      captures.push({ id: currentTab.id, name: initialSnapshot.name });
      if (options.captureFailure?.(initialSnapshot.name)) throw new Error('Screenshot failed');
      return { name: initialSnapshot.name, dataUrl: `image:${initialSnapshot.name}`, parts: 1, width: 800, height: 400, truncated: false };
    },
    uploadThroughWebhook: async (image, filename) => {
      uploads.push({ image, filename });
      if (options.uploadFailure) throw new Error('Upload failed');
      return `https://images.example.test/${encodeURIComponent(image)}`;
    },
    getAdPreviewLink: async (currentTab) => {
      previews.push({ id: currentTab.id, name: currentName });
      if (options.previewFailure) throw new Error('Preview failed');
      return 'https://www.facebook.com/ads/preview/123';
    },
    downloadData: async () => {}, notifyCaptureComplete: async () => {}, openProgressWindow: async () => {
      if (options.monitorFailure) throw new Error('Monitor unavailable');
    },
    chrome: {
      storage: { local: {
        get: async (keys) => {
          if (keys == null) return copy(storage);
          if (typeof keys === 'string') return { [keys]: storage[keys] == null ? undefined : copy(storage[keys]) };
          return Object.fromEntries(keys.map((key) => [key, storage[key] == null ? undefined : copy(storage[key])]));
        },
        set: async (values) => Object.assign(storage, copy(values)),
        remove: async (keys) => { for (const key of [].concat(keys)) delete storage[key]; }
      } },
      scripting: { executeScript: async () => [] },
      tabs: { update: async () => {}, setZoom: async (...args) => zooms.push(args) },
      debugger: {
        attach: async () => {}, detach: async () => {},
        sendCommand: async ({ tabId }, command, params) => {
          commands.push({ id: tabId, command, params });
          return command === 'Runtime.evaluate' ? { result: { value: { width: 800, height: 600, scale: options.dpr || 1 } } } : {};
        }
      }
    }
  };
  // Keep real report formatting and retry logic; replace only browser/account boundaries.
  vm.runInNewContext(source.slice(source.indexOf('function flattenCaptureTree('), source.indexOf('async function downloadData(')), context);
  const runEnd = source.indexOf('chrome.runtime.onMessage.addListener', source.indexOf('async function runCapture('));
  vm.runInNewContext(source.slice(source.indexOf('async function captureEntityWithRetry'), runEnd), context);
  return { context, storage, statuses, messages, captures, uploads, previews, commands, zooms,
    run: (id = 1, supplied = settings) => context.runCapture(tab(id), supplied),
    final: () => statuses.at(-1),
    selections: (name) => messages.filter((message) => message.type === 'MAC_SELECT_TARGET_ENTITY' && message.name === name) };
}

function assertPartialResult(run, expectedNames) {
  const errors = run.statuses.filter((status) => status.state === 'error');
  assert.ok(errors.length, 'The failed operation must expose error status');
  for (const status of errors) {
    assert.ok(status.result, 'Every error status must retain a usable result, including zero completed items');
    assert.deepEqual(status.result.processed.map((item) => item.name), expectedNames);
    assert.equal(typeof status.result.report, 'string');
  }
}

const tests = [
  ['an unavailable progress window never interrupts capture or changes its tab', async () => {
    const run = harness({ monitorFailure: true });
    await run.run(42);
    assert.equal(run.final().state, 'done');
    assert.ok(run.captures.every((capture) => capture.id === 42));
  }],
  ['a transient failure retries the same item and then continues, without duplicating prior output', async () => {
    let attempts = 0;
    const run = harness({ selectFailure: (name) => name === 'Second' && ++attempts < 3 });
    await run.run();
    assert.equal(run.final().state, 'done');
    assert.ok(run.statuses.some((status) => status.retrying === true && status.state === 'running'), 'The monitor can warn while retries are still running');
    assert.equal(run.selections('Second').length, 3);
    assert.equal(run.uploads.length, 2);
    assert.deepEqual(run.final().result.processed.map((item) => item.name), ['First', 'Second']);
    assert.equal(run.storage.captureCheckpoint.nextIndex, 2);
  }],
  ['preparation failure retains the completed image and stops after three total attempts', async () => {
    const run = harness({ selectFailure: (name) => name === 'Second' });
    await run.run();
    assertPartialResult(run, ['First']);
    assert.equal(run.selections('Second').length, 3, 'Preparation gets three total attempts');
    assert.equal(run.uploads.length, 1);
    assert.equal(run.storage.captureCheckpoint.version, '6.4.0');
    assert.equal(run.storage.captureCheckpoint.nextIndex, 1);
    assert.deepEqual(run.storage.captureCheckpoint.captured.map((item) => item.name), ['First']);
    assert.equal(run.storage.captureCheckpoint.jobs.length, 2);
    assert.ok(run.storage.captureCheckpoint.fingerprint);
    assert.ok(run.final().result.report.includes('https://images.example.test/'));
  }],
  ['resume survives a new worker and uses the newly selected tab without uploading completed items again', async () => {
    const storage = {};
    const failed = harness({ selectFailure: (name) => name === 'Second' }, storage);
    await failed.run(1);
    assert.ok(storage.captureCheckpoint, 'Failed batch must persist a checkpoint');
    const resumed = harness({}, storage);
    await resumed.run(9, { ...settings, tabId: 9, resumeCapture: true });
    assert.equal(resumed.final().state, 'done');
    assert.equal(resumed.selections('First').length, 0);
    assert.equal(resumed.uploads.length, 1, 'Only unfinished Second may upload after resume');
    assert.equal(resumed.captures.length, 1);
    assert.equal(resumed.captures[0].name, 'Second');
    assert.ok(resumed.messages.every((message) => message.targetTabId === 9), 'No message may target the old tab');
    assert.deepEqual(resumed.final().result.processed.map((item) => item.name), ['First', 'Second']);
  }],
  ['screenshot failure has three total attempts, even with the inner retry helper', async () => {
    const run = harness({ captureFailure: (name) => name === 'Second' });
    await run.run();
    assertPartialResult(run, ['First']);
    assert.equal(run.captures.filter((item) => item.name === 'Second').length, 3, 'Nested retry loops must not turn three attempts into nine');
    assert.equal(run.storage.captureCheckpoint.nextIndex, 1);
  }],
  ['preview failure retains the uploaded image and resume performs only the pending preview', async () => {
    const storage = {};
    const adSettings = { ...settings, targetCampaigns: [], targetAds: ['Preview Ad'], captureAdPreview: true };
    const failed = harness({ previewFailure: true }, storage);
    await failed.run(1, adSettings);
    assert.equal(failed.final().state, 'error', 'A missing requested preview remains resumable');
    assertPartialResult(failed, ['Preview Ad']);
    assert.equal(failed.previews.length, 3);
    assert.equal(failed.uploads.length, 1, 'Preview retries must not upload a screenshot again');
    assert.equal(failed.final().result.screenshots.length, 1);
    const savedLink = failed.final().result.processed[0].link;
    assert.ok(savedLink.startsWith('https://images.example.test/'));
    assert.equal(storage.captureCheckpoint.nextIndex, 0, 'The preview of this item is still pending');
    const resumed = harness({}, storage);
    await resumed.run(7, { ...adSettings, resumeCapture: true });
    assert.equal(resumed.final().state, 'done');
    assert.equal(resumed.captures.length, 0);
    assert.equal(resumed.uploads.length, 0);
    assert.equal(resumed.previews.length, 1);
    assert.equal(resumed.previews[0].id, 7);
    assert.equal(resumed.final().result.processed.length, 1);
    assert.equal(resumed.final().result.processed[0].link, savedLink);
    assert.ok(resumed.final().result.processed[0].previewLink);
  }],
  ['initialization and upload errors always return a result', async () => {
    for (const options of [{ initFailure: true }, { uploadFailure: true }]) {
      const run = harness(options);
      await run.run(1, { ...settings, targetCampaigns: ['First'] });
      assertPartialResult(run, []);
    }
  }],
  ['explicit stop retains completed results and never automatically retries', async () => {
    const run = harness({ stopOnSelect: 'Second' });
    await run.run();
    assert.equal(run.final().state, 'stopped');
    assert.equal(run.selections('Second').length, 1);
    assert.equal(run.uploads.length, 1);
    assert.ok(run.final().result, 'Stop must retain completed results');
    assert.deepEqual(run.final().result.processed.map((item) => item.name), ['First']);
    assert.equal(run.storage.captureCheckpoint.nextIndex, 1);
    assert.ok(!run.statuses.some((status) => status.state === 'error'));
  }],
  ['highResolution renders at least 2x with fixed CSS size and restores metrics', async () => {
    for (const backgroundMode of [false, true]) for (const dpr of [.75, 1, 1.25, 2, 3]) {
      const run = harness({ dpr });
      await run.run(1, { ...settings, targetCampaigns: ['First'], backgroundMode, highResolution: true });
      assert.equal(run.final().state, 'done');
      const overrides = run.commands.filter((entry) => entry.command === 'Emulation.setDeviceMetricsOverride');
      assert.equal(overrides.length, 1);
      assert.deepEqual(copy(overrides[0].params), { width: 800, height: 600, deviceScaleFactor: Math.max(2, dpr), mobile: false });
      assert.ok(run.commands.some((entry) => entry.command === 'Emulation.clearDeviceMetricsOverride'));
      assert.equal(run.zooms.length, 0, 'Capture must never call setZoom');
    }
    const native = harness({ dpr: .75 });
    await native.run(1, { ...settings, targetCampaigns: ['First'], backgroundMode: true, highResolution: false });
    assert.equal(native.commands.find((entry) => entry.command === 'Emulation.setDeviceMetricsOverride').params.deviceScaleFactor, .75);
    const failed = harness({ captureFailure: () => true });
    await failed.run(1, { ...settings, targetCampaigns: ['First'], highResolution: true });
    assert.equal(failed.final().state, 'error');
    assert.ok(failed.commands.some((entry) => entry.command === 'Emulation.clearDeviceMetricsOverride'));
  }],
  ['foreground high-resolution capture never enables background focus/idle emulation', async () => {
    const run = harness();
    vm.runInNewContext(source.slice(source.indexOf('async function keepBackgroundTabActive('), source.indexOf('async function installBackgroundRenderShim(')), run.context);
    run.context.activeCaptureTabs.add(1);
    await run.context.keepBackgroundTabActive(1, true);
    assert.equal(run.commands.length, 0);
    run.context.backgroundCaptureTabs.add(1);
    await run.context.keepBackgroundTabActive(1, true);
    assert.equal(run.commands.length, 3);
  }],
  ['checkpoint never stores an upload token or image bytes', async () => {
    const run = harness({ selectFailure: (name) => name === 'Second' });
    await run.run(1, { ...settings, webhookToken: 'private-upload-token-not-for-checkpoint' });
    const saved = JSON.stringify(run.storage.captureCheckpoint);
    assert.ok(!saved.includes('private-upload-token-not-for-checkpoint'));
    assert.ok(!saved.includes('dataUrl') && !saved.includes('base64'));
  }],
  ['resume rejects changed account, list or upload destination, but permits longer waits', async () => {
    const storage = {};
    const failed = harness({ selectFailure: (name) => name === 'Second' }, storage);
    await failed.run();
    for (const patch of [{ targetCampaigns: ['Other'] }, { folderId: 'another-folder' }, { webhookToken: 'changed-token' }]) {
      const run = harness({}, storage);
      await run.run(2, { ...settings, ...patch, resumeCapture: true });
      assert.equal(run.final().state, 'error');
      assert.equal(run.captures.length, 0);
      assert.ok(run.final().message.includes('cài đặt đã thay đổi'));
      assert.deepEqual(run.final().result.processed.map((item) => item.name), ['First'], 'Rejected resume must not erase the prior Copy result');
    }
    const wrongAccount = harness({}, storage);
    await wrongAccount.context.runCapture({ ...tab(3), url: `${tab(3).url}?act=9988776655` }, { ...settings, resumeCapture: true });
    assert.equal(wrongAccount.captures.length, 0);
    assert.equal(wrongAccount.final().state, 'error');
    const longerWait = harness({}, storage);
    await longerWait.run(4, { ...settings, maxLoadWaitMs: 60000, resumeCapture: true });
    assert.equal(longerWait.final().state, 'done');
    assert.equal(longerWait.uploads.length, 1);
  }],
  ['disabled ancestors stay in the report but only the requested Ads are searched by name and ID', async () => {
    const tree = [{ level: 'campaign', uid: 'c', name: 'Same Campaign', id: '111111111111111', captureEnabled: false, children: [
      { level: 'adset', uid: 's', name: 'Same Ad set', id: '222222222222222', captureEnabled: false, children: [
        { level: 'ad', uid: 'a', name: 'Same Ad', id: '333333333333333' },
        { level: 'ad', uid: 'b', name: 'Same Ad', id: '444444444444444' }
      ] }
    ] }];
    const run = harness({});
    await run.run(1, { ...settings, targetCampaigns: [], captureTree: tree, captureAdPreview: false });
    assert.equal(run.final().state, 'done');
    assert.equal(run.uploads.length, 2);
    const selected = run.messages.filter((message) => message.type === 'MAC_SELECT_TARGET_ENTITY');
    assert.deepEqual(selected.map((message) => [message.level, message.name, message.id]), [
      ['ad', 'Same Ad', '333333333333333'], ['ad', 'Same Ad', '444444444444444']
    ]);
    assert.ok(run.final().result.report.includes('Campaign Same Campaign:\n\nAd set Same Ad set:\n\nAd Same Ad:'));
  }],
  ['enabled Campaign, Ad set and sibling Ads are each searched once as their own capture job', async () => {
    const tree = [{ level: 'campaign', uid: 'c', name: 'Campaign', id: '111111111111111', children: [
      { level: 'adset', uid: 's', name: 'Ad set', id: '222222222222222', children: [
        { level: 'ad', uid: 'a', name: 'First Ad', id: '333333333333333' },
        { level: 'ad', uid: 'b', name: 'Second Ad', id: '444444444444444' }
      ] }
    ] }];
    const run = harness({});
    await run.run(1, { ...settings, targetCampaigns: [], captureTree: tree });
    assert.equal(run.final().state, 'done');
    assert.deepEqual(run.messages.filter((message) => message.type === 'MAC_SELECT_TARGET_ENTITY').map((message) => message.name),
      ['Campaign', 'Ad set', 'First Ad', 'Second Ad']);
  }],
  ['hierarchical retries and resume search only the unfinished Ad', async () => {
    const tree = [{ level: 'campaign', uid: 'c', name: 'Parent Campaign', captureEnabled: false, children: [
      { level: 'adset', uid: 's', name: 'Parent Ad set', captureEnabled: false, children: [
        { level: 'ad', uid: 'a', name: 'First Ad', id: '333333333333333' },
        { level: 'ad', uid: 'b', name: 'Second Ad', id: '444444444444444' }
      ] }
    ] }];
    const supplied = { ...settings, targetCampaigns: [], captureTree: tree }, storage = {};
    const failed = harness({ selectFailure: (name) => name === 'Second Ad' }, storage);
    await failed.run(1, supplied);
    assert.equal(failed.final().state, 'error');
    assert.deepEqual(failed.messages.filter((message) => message.type === 'MAC_SELECT_TARGET_ENTITY').map((message) => message.name),
      ['First Ad', 'Second Ad', 'Second Ad', 'Second Ad']);
    const resumed = harness({}, storage);
    await resumed.run(9, { ...supplied, resumeCapture: true });
    assert.equal(resumed.final().state, 'done');
    assert.deepEqual(resumed.messages.filter((message) => message.type === 'MAC_SELECT_TARGET_ENTITY').map((message) => [message.name, message.id]),
      [['Second Ad', '444444444444444']]);
    assert.equal(resumed.uploads.length, 1);
  }],
  ['a restarted worker exposes partial results and the resume button, without stopping a live session', async () => {
    const storage = { captureCheckpoint: { version: '6.4.0', nextIndex: 1, jobs: [{}, {}] }, captureStatuses: {
      session1: { state: 'running', cleanupPending: true, progress: 50, result: { report: 'saved link' } }
    } };
    const context = { activeSessions: new Map(), statusCache: new Map(), chrome: { storage: { local: { get: async () => copy(storage) } } },
      setStatus: async (status, id) => context.statusCache.set(id, status) };
    const begin = source.indexOf("  if (message.type === 'MAC_GET_STATUSES')");
    const end = source.indexOf("  if (message.type === 'MAC_STOP_SESSION')", begin);
    vm.runInNewContext(`function getStatuses(message, respond) { ${source.slice(begin, end)} }`, context);
    let result = await new Promise((resolve) => context.getStatuses({ type: 'MAC_GET_STATUSES' }, resolve));
    assert.equal(result.session1.state, 'stopped');
    assert.equal(result.session1.resumeAvailable, true);
    assert.equal(result.session1.cleanupPending, false);
    assert.equal(result.session1.result.report, 'saved link');
    context.statusCache.clear(); context.activeSessions.set('session1', 7);
    result = await new Promise((resolve) => context.getStatuses({ type: 'MAC_GET_STATUSES' }, resolve));
    assert.equal(result.session1.state, 'running');
  }]
];

module.exports = { harness, settings };
if (require.main === module) (async () => {
  let failed = 0;
  for (const [name, test] of tests) {
    try { await test(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} recovery regressions passed.`);
  if (failed) process.exitCode = 1;
})();
