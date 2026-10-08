const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/desktop_pet/web/scripts/pages/task.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/desktop_pet/web/index.html'), 'utf8');

test('Task UI uses only the Python bridge data source', () => {
  assert.doesNotMatch(source, /localStorage/);
  for (const method of ['getTasks', 'addTask', 'updateTask', 'setTaskCompleted', 'deleteTask']) {
    assert.match(source, new RegExp(`"${method}"`));
  }
  assert.match(source, /setTimeout\(\(\) => \{ row\.classList\.add\("is-leaving"\).*600/s);
});

test('Quick Add and Task tabs expose the required controls', () => {
  for (const id of ['task-quick-title', 'task-date-select', 'task-priority-select', 'task-quick-add', 'task-page-list']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const view of ['today', 'upcoming', 'all', 'completed']) {
    assert.match(html, new RegExp(`data-task-view="${view}"`));
  }
  assert.match(source, /task\/calendar-add\.svg/);
  assert.doesNotMatch(html, /id="task-category-select"/);
});

test('Date and combined priority menus follow the requested options', () => {
  assert.match(source, /menuButton\("Today"[\s\S]*menuButton\("Pick a day"/);
  assert.match(source, /TIME OF DAY/);
  assert.match(source, /function periodIcon\(period\)/);
  assert.doesNotMatch(source, /\["Tomorrow"/);
  assert.match(source, /PRIORITY/);
  assert.match(source, /CATEGORY/);
  assert.match(source, /for \(const value of \["work", "personal", "learning"\]\)/);
  assert.doesNotMatch(source, /"design", "work", "personal", "learning"/);
  assert.match(source, /tp-menu-check/);
});

test('Collapsed priority control shows only the selected priority', () => {
  assert.match(html, /id="task-priority-select"[^>]*>[\s\S]*?task\/tag\.svg[\s\S]*?tp-priority-selected-dot[^>]*hidden[\s\S]*?<span>Priority<\/span>/);
  assert.match(source, /quickPriorityChosen: false/);
  assert.match(source, /dot\.dataset\.priority = taskState\.quickPriority/);
  assert.match(source, /taskState\.quickPriorityChosen \? labels\[taskState\.quickPriority\] : "Priority"/);
  assert.match(source, /taskState\.quickPriorityChosen = true;\s*renderQuickPriority\(\)/);
  assert.doesNotMatch(source, /quickCategory[^\n]*renderQuickPriority/);
});

test('Combined priority and category menu stays open while choosing both values', () => {
  assert.match(source, /closeOnSelect = true/);
  assert.match(source, /if \(closeOnSelect\) closeMenu\(\)/);
  assert.match(source, /updateMenuCheck\(menu, "priority", value\);[\s\S]*taskState\.quickPriorityChosen && taskState\.quickPriority === value, false\)\)/);
  assert.match(source, /updateMenuCheck\(menu, "category", value\)[^\n]*false\)\)/);
});

test('Short priority labels can be centered without moving Medium or the dot', () => {
  assert.match(source, /button\.dataset\.selectedPriority = taskState\.quickPriority/);
});

test('Clicking the selected priority again clears only its explicit selection', () => {
  assert.match(source, /taskState\.quickPriorityChosen && taskState\.quickPriority === value/);
  assert.match(source, /taskState\.quickPriority = "medium";\s*taskState\.quickPriorityChosen = false;/);
  assert.match(source, /updateMenuCheck\(menu, "priority", null\)/);
  assert.match(source, /taskState\.quickPriorityChosen && taskState\.quickPriority === value, false/);
});

test('Clicking the open priority trigger toggles its menu closed', () => {
  assert.match(source, /menuTrigger: null/);
  assert.match(source, /taskState\.menuTrigger = button/);
  assert.match(source, /taskState\.menu && taskState\.menuTrigger === dom\.taskPrioritySelect/);
  assert.match(source, /taskState\.menuTrigger === dom\.taskPrioritySelect\) \{\s*closeMenu\(\);\s*return;/);
});
