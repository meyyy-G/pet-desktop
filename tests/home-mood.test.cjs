const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the summary renderer without Qt, a browser or saved user data.
const source = fs.readFileSync(path.join(__dirname, '../src/desktop_pet/web/scripts/pages/home.js'), 'utf8');
const details = source.slice(source.indexOf('const moodDetails ='), source.indexOf('const moodIconFiles ='));
const renderer = source.slice(source.indexOf('function updateMoodButtonState()'), source.indexOf('export function renderMiniCalendar()'));

function render(mood, selectedDate = '2026-08-27') {
  const icon = { hidden: false, style: { setProperty(key, value) { this[key] = value; } } };
  const buttons = ['Stress', 'Low', 'Anxious', 'Steady', 'Light', 'Inspired', 'Grateful'].map(name => ({
    dataset: { mood: name },
    classList: { toggle(key, value) { this[key] = value; } },
    querySelector() { return { style: { getPropertyValue() { return `url(${name}.svg)`; } } }; },
  }));
  const dom = { homeMoodTitle: {}, homeMoodName: { style: {} }, homeMoodDetail: {}, homeMoodIcon: icon, moodButtons: buttons };
  vm.runInNewContext(details + renderer + '\nupdateMoodButtonState();', {
    dom,
    state: { selectedMiniDate: selectedDate, recordedMoods: { [selectedDate]: mood } },
    moodColors: { Steady: '#8fb994', Light: '#dab6b4', Low: '#1471da', Inspired: '#cb30e0' },
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    toDateText: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  });
  return dom;
}

test('empty date does not invent a recorded mood', () => {
  const dom = render(undefined);
  assert.equal(dom.homeMoodName.textContent, 'Not set');
  assert.equal(dom.homeMoodDetail.textContent, 'No check-in yet');
  assert.equal(dom.homeMoodIcon.hidden, true);
  assert.ok(dom.moodButtons.every(button => !button.classList.selected));
});

test('selected date updates summary and reuses the button icon', () => {
  const dom = render('Steady');
  assert.equal(dom.homeMoodTitle.textContent, 'August 27th Mood:');
  assert.equal(dom.homeMoodName.textContent, 'Steady');
  assert.equal(dom.homeMoodDetail.textContent, 'Grounded & Calm');
  assert.equal(dom.homeMoodIcon.hidden, false);
  assert.equal(dom.homeMoodIcon.style['--mood-icon'], 'url(Steady.svg)');
  assert.equal(dom.moodButtons.filter(button => button.classList.selected).length, 1);
});

test('selected July 2 displays its own mood and the supplied description', () => {
  const dom = render('Light', '2026-07-02');
  assert.equal(dom.homeMoodTitle.textContent, 'July 2nd Mood:');
  assert.equal(dom.homeMoodName.textContent, 'Light');
  assert.equal(dom.homeMoodDetail.textContent, 'Relaxed & At Ease');
  assert.equal(dom.homeMoodIcon.style['--mood-icon'], 'url(Light.svg)');
});

test('Mood Main uses the revised Low and Inspired descriptions', () => {
  assert.equal(render('Low').homeMoodDetail.textContent, 'Drained & Low Energy');
  assert.equal(render('Inspired').homeMoodDetail.textContent, 'Energized & Creative');
});

test('selecting July 2 restores July 1 mood color and makes July 2 black', () => {
  const makeCell = (date, selected) => {
    const classes = new Set(['mood-history', ...(selected ? ['mini-selected'] : [])]);
    return {
      dataset: { date },
      classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
      style: {
        backgroundColor: selected ? 'var(--text-primary)' : '', color: selected ? '#fff' : '', borderColor: selected ? 'var(--text-primary)' : '',
        removeProperty(name) { this[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = ''; },
      },
      setAttribute(name, value) { this[name] = value; },
    };
  };
  const july1 = makeCell('2026-07-01', true);
  const july2 = makeCell('2026-07-02', false);
  const dom = { miniCalendarGrid: { querySelectorAll() { return [july1, july2]; } } };
  vm.runInNewContext(renderer + '\nsyncMiniCalendarSelection();', {
    dom, state: { selectedMiniDate: '2026-07-02' },
  });
  assert.equal(july1.style.backgroundColor, '');
  assert.equal(july1.classList.contains('mood-history'), true);
  assert.equal(july2.style.backgroundColor, 'var(--text-primary)');
  assert.equal(july2['aria-pressed'], 'true');
});

test('Daily Snapshot only shows today’s recorded mood, independent of mini calendar selection', () => {
  const today = new Date();
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const otherDate = '2020-07-02';
  const dot = {
    hidden: true,
    classList: { toggle() {} },
    style: { setProperty(key, value) { this[key] = value; }, removeProperty() {} },
  };
  const dom = { snapshotMoodDot: dot, snapshotMoodName: {}, snapshotMoodDetail: {} };
  const state = {
    currentDate: new Date(`${otherDate}T00:00:00`),
    selectedMiniDate: otherDate,
    recordedMoods: { [otherDate]: 'Light' },
  };
  const context = {
    dom, state, document: { body: { dataset: { svgBase: '/svg/' } } },
    moodColors: { Steady: '#8fb994', Light: '#dab6b4' },
    toDateText: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  };
  const displayRenderer = source.slice(source.indexOf('const moodDetails ='), source.indexOf('function showMoodTooltip')).replace('export function renderMoodDisplays()', 'function renderMoodDisplays()');
  const renderSnapshot = () => vm.runInNewContext(displayRenderer + '\nrenderMoodDisplays();', { ...context });

  renderSnapshot();
  assert.equal(dom.snapshotMoodName.textContent, 'Not set');
  assert.equal(dom.snapshotMoodDetail.textContent, 'No check-in yet');
  assert.equal(dot.hidden, true);

  state.recordedMoods[todayText] = 'Steady';
  renderSnapshot();
  assert.equal(dom.snapshotMoodName.textContent, 'Steady');
  assert.equal(dom.snapshotMoodDetail.textContent, 'Grounded & Calm');
  assert.equal(dot.hidden, false);
  assert.equal(dot.style['--mood-icon'], 'url("/svg/moodcard/steady.svg")');
  assert.equal(dot.style['--display-mood-color'], '#8fb994');

  state.selectedMiniDate = '2020-07-03';
  renderSnapshot();
  assert.equal(dom.snapshotMoodName.textContent, 'Steady');
});
