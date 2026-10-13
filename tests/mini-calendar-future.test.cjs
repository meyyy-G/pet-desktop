const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const homePath = path.join(__dirname, '../src/desktop_pet/web/scripts/pages/home.js');
const source = fs.readFileSync(homePath, 'utf8');
const renderer = source.slice(
  source.indexOf('export function renderMiniCalendar()'),
  source.indexOf('export function loadRecordedMoods()'),
).replace('export function renderMiniCalendar()', 'function renderMiniCalendar()');

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [2026, 9, 12]));
  }
}

function cell(tagName) {
  const classes = new Set();
  const listeners = {};
  return {
    tagName,
    classList: {
      add(name) { classes.add(name); },
      contains(name) { return classes.has(name); },
    },
    style: { setProperty() {} },
    dataset: {},
    listeners,
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, callback) { listeners[name] = callback; },
  };
}

test('mini calendar leaves past unrecorded dates selectable and future dates unselectable', () => {
  const children = [];
  const grid = {
    set innerHTML(value) { if (value === '') children.length = 0; },
    appendChild(element) { children.push(element); },
    setAttribute() {},
  };
  const state = {
    miniVisibleMonth: new FixedDate(2026, 9, 1),
    miniCalendarPage: 0,
    selectedMiniDate: '2026-10-12',
    recordedMoods: { '2026-10-13': 'Steady' },
  };
  vm.runInNewContext(renderer + '\nrenderMiniCalendar();', {
    Date: FixedDate,
    document: { createElement: cell },
    dom: { miniCalendarGrid: grid },
    state,
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    toDateText: date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'),
    calendarMoodColors: { Steady: '#8fb994' },
    syncMiniCalendarSelection() {},
    updateMoodButtonState() {},
    loadHomeNote() {},
    animateMiniMoodSelection() {},
    renderMoodDisplays() {},
  });

  const past = children.find(item => item.dataset.date === '2026-10-11');
  const future = children.find(item => item.dataset.date === '2026-10-13');
  assert.equal(past.disabled, undefined);
  assert.equal(typeof past.listeners.click, 'function');
  assert.equal(past.classList.contains('mood-history'), false);
  assert.equal(future.disabled, true);
  assert.equal(future.listeners.click, undefined);
  assert.equal(future.classList.contains('mini-future'), true);
  assert.equal(future.classList.contains('mood-history'), false);
  assert.equal(future.title, '\u8fd8\u672a\u5230');
  past.listeners.click();
  assert.equal(state.selectedMiniDate, '2026-10-11');
});

test('future mini calendar cells have no stroke', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/desktop_pet/web/styles/pages/home.css'), 'utf8');
  assert.match(css, /button\.mini-future:not\(\.mood-history\):not\(\.mood-today\)\s*\{[^}]*border:\s*0/);
});
