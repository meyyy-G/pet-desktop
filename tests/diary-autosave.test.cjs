const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const web = path.join(__dirname, '../src/desktop_pet/web');
const source = fs.readFileSync(path.join(web, 'scripts/pages/diary.js'), 'utf8');
const controller = source.slice(source.indexOf('function setStatus(text)'), source.indexOf('function updateWordCount()'));

function setup() {
  const requests = [];
  const timers = new Map();
  let nextTimer = 0;
  const editor = { innerText: 'First draft', querySelector() { return null; }, contains() { return false; } };
  const dom = {
    diaryEditor: editor,
    saveStatus: { textContent: '' },
    diarySaveIndicator: { hidden: true },
    diaryMainActions: { hidden: true },
  };
  const state = {
    currentDate: new Date(2026, 9, 12),
    hasUnsavedChanges: false,
    diaryBridge: { saveEntryByDate(date, payload, callback) { requests.push({ date, payload, callback }); } },
  };
  let recentLoads = 0;
  const context = vm.createContext({
    dom, state,
    diaryPlainText: element => element.innerText,
    diaryPayload: element => element.innerText,
    toDateText: () => '2026-10-12',
    loadRecordedDates() { recentLoads += 1; },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(controller, context);
  const runTimer = delay => {
    const next = [...timers].find(([, timer]) => timer.delay === delay);
    assert.ok(next, `missing ${delay}ms timer`);
    timers.delete(next[0]);
    next[1].callback();
  };
  return { context, dom, state, editor, requests, runTimer, recentLoads: () => recentLoads };
}

test('Diary status hides when empty and follows real autosave results', () => {
  const app = setup();
  app.editor.innerText = '';
  vm.runInContext('setStatus("Saving...")', app.context);
  assert.equal(app.dom.diarySaveIndicator.hidden, true);
  app.editor.innerText = 'First draft';
  vm.runInContext('editVersion += 1; state.hasUnsavedChanges = true; setStatus("Saving..."); scheduleAutoSave()', app.context);
  assert.equal(app.dom.diarySaveIndicator.hidden, false);
  assert.equal(app.dom.saveStatus.textContent, 'Saving...');
  app.runTimer(700);
  assert.equal(app.requests.length, 1);
  app.requests[0].callback({ date: '2026-10-12' });
  assert.equal(app.dom.saveStatus.textContent, 'Saved');
  assert.equal(app.state.hasUnsavedChanges, false);
  assert.equal(app.recentLoads(), 1);

  app.editor.innerText = 'Changed draft';
  vm.runInContext('editVersion += 1; state.hasUnsavedChanges = true; setStatus("Saving..."); scheduleAutoSave()', app.context);
  app.runTimer(700);
  app.requests[1].callback({ ok: false });
  assert.equal(app.dom.saveStatus.textContent, 'Save failed');
  assert.equal(app.state.hasUnsavedChanges, true);
});

test('an older save result never marks newer typing as saved', () => {
  const app = setup();
  vm.runInContext('editVersion += 1; state.hasUnsavedChanges = true; setStatus("Saving..."); scheduleAutoSave()', app.context);
  app.runTimer(700);
  app.editor.innerText = 'Newer draft';
  vm.runInContext('editVersion += 1; state.hasUnsavedChanges = true; setStatus("Saving..."); scheduleAutoSave()', app.context);
  app.runTimer(700);
  assert.equal(app.requests.length, 1);
  app.requests[0].callback({ date: '2026-10-12' });
  assert.equal(app.dom.saveStatus.textContent, 'Saving...');
  app.runTimer(0);
  assert.equal(app.requests[1].payload, 'Newer draft');
  app.requests[1].callback({ date: '2026-10-12' });
  assert.equal(app.dom.saveStatus.textContent, 'Saved');
});

test('Diary footer keeps status as text, not an action button', () => {
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(web, 'styles/pages/diary.css'), 'utf8');
  assert.match(html, /id="diary-word-count">0 words<\/span>/);
  assert.match(html, /id="diary-save-indicator" hidden>.*id="save-status"/);
  assert.match(css, /\.diary-stats > span\[hidden\] \{ display: none; \}/);
  assert.doesNotMatch(html, /Auto saved/);
});
