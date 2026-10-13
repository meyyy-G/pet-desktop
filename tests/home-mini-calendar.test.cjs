const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const homeSource = fs.readFileSync(path.join(__dirname, '../src/desktop_pet/web/scripts/pages/home.js'), 'utf8');
const homeCss = fs.readFileSync(path.join(__dirname, '../src/desktop_pet/web/styles/pages/home.css'), 'utf8');
const renderSource = homeSource.slice(
  homeSource.indexOf('export function renderMiniCalendar()'),
  homeSource.indexOf('export function loadRecordedMoods()'),
).replace('export function renderMiniCalendar()', 'function renderMiniCalendar()');

function makeElement() {
  const classes = new Set();
  const attributes = {};
  const listeners = {};
  return {
    classes,
    attributes,
    listeners,
    dataset: {},
    style: { setProperty(name, value) { this[name] = value; } },
    classList: { add(name) { classes.add(name); } },
    setAttribute(name, value) { attributes[name] = value; },
    addEventListener(name, listener) { listeners[name] = listener; },
    appendChild() {},
    querySelector() { return { style: {} }; },
  };
}

test('mini calendar keeps past unrecorded dates outlined and blocks future selection', () => {
  const cells = [];
  const grid = makeElement();
  grid.appendChild = cell => cells.push(cell);
  const modal = makeElement();
  const dom = { miniCalendarGrid: grid, miniPrevMonthButton: makeElement(), miniNextMonthButton: makeElement(), futureModal: modal };
  const state = {
    miniVisibleMonth: new Date(2026, 9, 1),
    miniCalendarPage: 0,
    selectedMiniDate: '2026-10-12',
    recordedMoods: {},
  };
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [2026, 9, 12])); }
  }
  let noteLoads = 0;
  vm.runInNewContext(
    renderSource + '\nrenderMiniCalendar();',
    {
      Date: FixedDate, document: { createElement: makeElement }, dom, state,
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      toDateText: date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'),
      isFutureDate: date => date > '2026-10-12',
      calendarMoodColors: {}, syncMiniCalendarSelection() {}, updateMoodButtonState() {},
      loadHomeNote() { noteLoads += 1; }, animateMiniMoodSelection() {}, renderMoodDisplays() {},
    },
  );
  const past = cells.find(cell => cell.dataset.date === '2026-10-11');
  const future = cells.find(cell => cell.dataset.date === '2026-10-13');
  assert.ok(past);
  assert.ok(future.classes.has('mini-future'));
  assert.equal(future.attributes['aria-disabled'], 'true');
  future.listeners.click();
  assert.equal(state.selectedMiniDate, '2026-10-12');
  assert.equal(noteLoads, 0);
  assert.ok(modal.classes.has('visible'));
  past.listeners.click();
  assert.equal(state.selectedMiniDate, '2026-10-11');
  assert.equal(noteLoads, 1);

  assert.match(homeCss, /button:not\(\.mood-history\):not\(\.mood-today\) \{ border: 1px solid var\(--border-default\); background: transparent; \}/);
  assert.match(homeCss, /button\.mini-future:not\(\.mood-history\):not\(\.mood-today\) \{[^}]*border: 0;/);
});
