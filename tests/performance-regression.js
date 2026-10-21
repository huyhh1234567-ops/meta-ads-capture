const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');
let clock = 0, pendingUntil = 0;
const context = { state: { settings: { capturePace: 'fast' }, currentLevel: 'ad', stopRequested: false },
  Date: { now: () => clock }, sleep: async (ms) => { clock += ms; },
  contentSignature: () => ({ value: 'stable', skeletons: clock < pendingUntil ? 1 : 0, pendingImages: clock < pendingUntil ? 1 : 0, nodeCount: context.state.currentLevel === 'campaign' ? 8 : 4 }) };
vm.runInNewContext(source.slice(source.indexOf('  async function waitForStableContent('), source.indexOf('  async function requireStableContent(')), context);
(async () => {
  const fast = await context.waitForStableContent({});
  console.log(`Synthetic stable Meta wait: ${fast.waitedMs} ms`);
  assert.ok(fast.stable && fast.waitedMs >= 600 && fast.waitedMs <= 800, 'Three stable samples without loaders should fit the 800 ms budget');
  clock = 0; pendingUntil = 2400;
  assert.ok((await context.waitForStableContent({})).waitedMs >= 2400, 'Pending images must not be captured to win speed');
  clock = 0; pendingUntil = 5000; context.state.currentLevel = 'campaign';
  assert.ok((await context.waitForStableContent({})).waitedMs >= 5000, 'Persistent-loader and Campaign fallbacks must never bypass an unfinished image');
  context.state.currentLevel = 'ad';
  clock = 0; pendingUntil = Infinity;
  assert.equal((await context.waitForStableContent({})).stable, false, 'Unfinished content must still time out');
  clock = 0; pendingUntil = 0; context.state.settings.capturePace = 'steady';
  assert.ok((await context.waitForStableContent({}, { settleMs: 2500 })).waitedMs >= 2500);
  console.log('PASS readiness speed budget, pending images, timeout and steady mode');
})().catch((error) => { console.error(error); process.exitCode = 1; });
