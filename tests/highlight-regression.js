const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');
let nodes = [], screenLevel = 'Ad';
const box = (top, height, width = 360, left = 300) => ({ top, bottom: top + height, height, width, left, right: left + width });
const card = (text, top, height) => ({ textContent: text, parentElement: null, getBoundingClientRect: () => box(top, height) });
const heading = (text, top, parent) => ({ textContent: text, children: [], parentElement: parent, getBoundingClientRect: () => box(top, 20, 300, 310) });
const context = { state: { settings: { highlightAdvantage: true, highlightTA: true, highlightBudget: true }, currentLevel: 'ad' }, innerWidth: 1200,
  document: { body: {}, querySelectorAll: () => [heading(`${screenLevel} name`, -700, null), ...nodes] }, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) };
vm.runInNewContext(source.slice(source.indexOf('  function advantageHighlight('), source.indexOf('  function previewSnapshot(')), context);
const rect = { left: 240, top: 100, width: 800, height: 700 };
const cases = [
  ['Advantage only marks Ad creative, even with stale Ad state on an Ad set screen', () => {
    const outer = card('Advantage+ creative enhancements Essential enhancements Try it out', 500, 250);
    nodes = [heading('Advantage+ audience', 200, outer), heading('Advantage+ placements', 300, outer), heading('Advantage+ creative enhancements (0/5)', 510, outer)];
    context.state.currentLevel = 'ad'; screenLevel = 'Ad set';
    assert.equal(context.advantageHighlight(rect, 0), null);
    screenLevel = 'Ad';
    assert.ok(context.advantageHighlight(rect, 0));
    nodes[2].textContent += '\u200b';
    assert.ok(context.advantageHighlight(rect, 0), 'Real Meta heading has a zero-width marker');
    context.state.currentLevel = 'adset';
    assert.equal(context.advantageHighlight(rect, 0), null);
    context.state.currentLevel = 'ad';
    nodes = nodes.slice(0, 2);
    assert.equal(context.advantageHighlight(rect, 0), null);
  }],
  ['Advantage never outlines an unbounded ancestor beginning with its title', () => {
    const outer = card('Advantage+ creative enhancements Essential enhancements Try it out Tracking Budget', 500, 4000);
    nodes = [heading('Advantage+ creative enhancements (0/4)', 510, outer)];
    assert.equal(context.advantageHighlight(rect, 0), null);
  }],
  ['Advantage starts at its subsection even when the outer card begins with Advantage', () => {
    const outer = card('Advantage+ creative enhancements Essential enhancements Try it out', 100, 1500);
    const title = heading('Advantage+ creative enhancements (0/4)', 800, outer);
    nodes = [title, heading('Try it out', 1050, outer)];
    const mark = context.advantageHighlight(rect, 400);
    assert.ok(mark.y >= 1090 && mark.y < 1110);
    assert.ok(mark.height < 300);
  }],
  ['TA is opt-in and limited to Ad set', () => {
    const outer = card('Audience Locations Age Gender Languages', 1200, 500);
    nodes = [heading('Audience', 1210, outer)];
    context.state.currentLevel = 'ad';
    assert.equal(context.sectionHighlight(rect, 0, 'ta'), null);
    context.state.currentLevel = 'adset'; context.state.settings.highlightTA = false;
    assert.equal(context.sectionHighlight(rect, 0, 'ta'), null);
    context.state.settings.highlightTA = true;
    const mark = context.sectionHighlight(rect, 300, 'ta');
    assert.equal(mark.y, 1400); assert.equal(mark.height, 500);
  }],
  ['Budget uses the first real Budget card, not Bid cap or another same-name card', () => {
    context.state.currentLevel = 'adset';
    const first = card('Budget & schedule Daily budget Start date', 700, 320);
    const second = card('Budget & schedule Daily budget', 1400, 400);
    nodes = [heading('Budget & schedule', 1410, second), heading('Bid cap', 400, first), heading('Budget & schedule', 710, first)];
    const mark = context.sectionHighlight(rect, 100, 'budget');
    assert.equal(mark.y, 700); assert.equal(mark.height, 320);
    context.state.settings.highlightBudget = false;
    assert.equal(context.sectionHighlight(rect, 0, 'budget'), null);
    context.state.settings.highlightBudget = true;
  }],
  ['TA and Budget reject a whole-page wrapper or a sidebar heading', () => {
    context.state.currentLevel = 'adset';
    const outer = card('Audience Budget & schedule Tracking Many cards', 100, 5000);
    nodes = [heading('Audience', 800, outer), heading('Budget & schedule', 1600, outer)];
    assert.equal(context.sectionHighlight(rect, 0, 'ta'), null);
    assert.equal(context.sectionHighlight(rect, 0, 'budget'), null);
    const side = heading('Audience', 800, card('Audience Locations', 790, 300));
    side.getBoundingClientRect = () => box(800, 20, 160, 20);
    nodes = [side]; assert.equal(context.sectionHighlight(rect, 0, 'ta'), null);
  }]
];
let failures = 0;
for (const [name, run] of cases) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`${cases.length - failures}/${cases.length} highlight regressions passed.`);
if (failures) process.exitCode = 1;
