const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const background = read('background.js');
const capture = background.slice(background.indexOf('async function captureOneAd('), background.indexOf('async function captureEntityWithRetry'));

async function runCapture({ finalTop = 600, shrink = false, stall = false, clipped = false } = {}) {
  const initial = { name: 'Ad set', scrollTop: 0, scrollHeight: 1000, clientHeight: 400,
    rect: { left: 100, top: 100, width: 500, height: clipped ? 380 : 400 }, viewportWidth: 800, viewportHeight: 600 };
  let current = structuredClone(initial), captures = 0;
  const canvas = { getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => 'stitched' };
  const stitchContext = { document: { createElement: () => canvas },
    fetch: async () => ({ blob: async () => ({}) }), createImageBitmap: async () => ({ width: 800, height: 600, close() {} }),
    chrome: { runtime: { onMessage: { addListener() {} } } } };
  vm.runInNewContext(read('offscreen.js'), stitchContext);
  const capturedTops = [];
  const captureContext = {
    shouldStop: async () => false, setStatus: async () => {}, ensureOffscreen: async () => {},
    captureViewport: async () => { capturedTops.push(current.scrollTop); return `frame${++captures}`; },
    send: async (_id, message) => {
      if (message.type === 'MAC_PREVIEW_SNAPSHOT') return { ok: true, snapshot: structuredClone(current) };
      const previous = current.scrollTop;
      let next = Math.min(previous + 300, finalTop);
      if (message.toBottom && !stall) next = current.scrollHeight - current.clientHeight;
      current = { ...current, scrollTop: next, scrollHeight: shrink && next >= 300 ? 950 : current.scrollHeight };
      if (shrink) current.scrollTop = Math.min(current.scrollTop, current.scrollHeight - current.clientHeight);
      current.atBottom = current.scrollTop + current.clientHeight >= current.scrollHeight - 5;
      return { ok: true, moved: Math.abs(next - previous) > 2, snapshot: structuredClone(current) };
    },
    chrome: { runtime: { sendMessage: async ({ frames, geometry }) => {
      try { return { ok: true, ...await stitchContext.stitch(frames, geometry) }; }
      catch (error) { return { ok: false, error: error.message }; }
    } } }
  };
  vm.runInNewContext(capture, captureContext);
  const image = await captureContext.captureOneAd({ id: 1 }, { maxShots: 8 }, 1, initial);
  return { image, capturedTops };
}

(async () => {
  const cases = [
    ['a last tile 3 px above the bottom is scrolled to the actual end and captured', async () => {
      const result = await runCapture({ finalTop: 597 });
      assert.equal(result.image.height, 1000);
      assert.equal(result.capturedTops.at(-1), 600);
    }],
    ['normal exact-bottom capture does not add an extra screenshot', async () => {
      const result = await runCapture();
      assert.deepEqual(result.capturedTops, [0, 300, 600]);
    }],
    ['content shrinking between tiles restarts the item rather than stitching stale geometry', async () => {
      await assert.rejects(runCapture({ shrink: true }), /chiều cao nội dung|Chiều cao nội dung/i);
    }],
    ['a stuck final scroll never returns an incomplete image', async () => {
      await assert.rejects(runCapture({ finalTop: 597, stall: true }), /chưa tới cuối|thiếu|phủ hết/);
    }],
    ['a clipped pane reports measured missing coverage, not a generic unreadable error', async () => {
      await assert.rejects(runCapture({ clipped: true }), /20 px.*1000.*400.*380/);
    }]
  ];
  let failed = 0;
  for (const [name, test] of cases) {
    try { await test(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  if (failed) process.exitCode = 1;
})();
