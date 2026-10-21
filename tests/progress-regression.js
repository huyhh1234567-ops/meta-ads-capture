const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

(async () => {
  const background = read('background.js');
  let existing = [], creations = [], updates = [];
  const context = { chrome: {
    runtime: { getURL: (file) => `chrome-extension://fixture/${file}`, getContexts: async (filter) => {
      assert.equal(filter.documentUrls[0], 'chrome-extension://fixture/progress.html'); return existing;
    } },
    windows: {
      create: async (options) => { creations.push(options); existing = [{ windowId: 8 }]; return { id: 8 }; },
      update: async (id, options) => updates.push({ id, options })
    }
  } };
  vm.runInNewContext(background.slice(background.indexOf('async function openProgressWindow('), background.indexOf('async function notifyCaptureComplete(')), context);
  assert.equal(typeof context.openProgressWindow, 'function', 'A standalone monitor must open on capture');
  await context.openProgressWindow();
  await context.openProgressWindow();
  assert.equal(creations.length, 1, 'Reuse the monitor rather than accumulating windows');
  assert.equal(creations[0].focused, false, 'Never steal foreground from the capture tab');
  assert.equal(creations[0].type, 'popup');
  assert.equal(updates[0].options.focused, false);
  assert.equal(updates[0].options.width, undefined, 'Preserve the user-resized window');
  context.chrome.windows.update = async () => { throw new Error('Window just closed'); };
  await context.openProgressWindow();
  assert.equal(creations.length, 2, 'Recreate when the user closes the monitor during lookup');

  const statusContext = { statusCache: new Map(), statusWriteQueue: Promise.resolve(), Date,
    chrome: { storage: { local: { set: async () => {} } } } };
  vm.runInNewContext(background.slice(background.indexOf('async function setStatus('), background.indexOf('async function shouldStop(')), statusContext);
  await statusContext.setStatus({ state: 'running', retrying: true });
  await statusContext.setStatus({ message: 'Capturing next tile' });
  assert.equal(statusContext.statusCache.get('session1').retrying, true, 'Retry warning survives tile/status updates');
  for (const state of ['done', 'error', 'stopped']) {
    await statusContext.setStatus({ state: 'running', retrying: true });
    await statusContext.setStatus({ state });
    assert.equal(statusContext.statusCache.get('session1').retrying, false, 'Terminal status clears retry warning');
  }
  assert.match(background, /retrying: attempt > 1/);
  assert.match(background, /retrying: attempt < 3/);
  assert.match(background, /await openProgressWindow\(\)\.catch/);
  console.log('PASS monitor lifecycle, focus safety, retry persistence and terminal cleanup');
})().catch((error) => { console.error(error); process.exitCode = 1; });
