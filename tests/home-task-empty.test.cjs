const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const taskSource = fs.readFileSync(path.join(root, 'src/desktop_pet/web/scripts/pages/task.js'), 'utf8');
const homeCss = fs.readFileSync(path.join(root, 'src/desktop_pet/web/styles/pages/home.css'), 'utf8');

test('Home task empty state follows persisted row count', () => {
  assert.match(taskSource, /const hasTasks = Boolean\(dom\.taskItems\.querySelector\("\.task-row"\)\)/);
  assert.match(taskSource, /taskItems\.classList\.toggle\("has-tasks", hasTasks\)/);
  assert.match(taskSource, /taskEmptyState\.hidden = hasTasks/);
  assert.match(taskSource, /!task\.completed && task\.date === today/);
  assert.match(homeCss, /\.task-empty-state\s*\{/);
  assert.match(homeCss, /padding:\s*38px 9px/);
  assert.match(homeCss, /\.task-empty-icon[^\{]*\{[^}]*48px/s);
});

test('Home task rows render category and priority labels from the shared task data', () => {
  assert.match(taskSource, /meta\.className = compact \? "task-meta"/);
  assert.match(taskSource, /categoryLabel\.className = "task-label"/);
  assert.match(taskSource, /priorityLabel\.className = "task-label"/);
  assert.match(taskSource, /priorityDot\.dataset\.priority = task\.priority/);
});

test('Home task card follows the latest Figma list geometry', () => {
  assert.match(homeCss, /\.task-card\s*\{[^}]*gap:\s*2px[^}]*padding:\s*20px 7px/s);
  assert.match(homeCss, /\.task-items\s*\{[^}]*height:\s*354px[^}]*width:\s*303px/s);
  assert.match(homeCss, /\.task-row\s*\{[^}]*height:\s*60px[^}]*padding:\s*11px 15px[^}]*border-bottom:\s*1px solid #ece8e2/s);
  assert.match(homeCss, /\.home-task-period\s*\{[^}]*height:\s*24px/s);
});

test('Populated Home task frame keeps the Day and Night sections inside the Figma card', () => {
  assert.match(homeCss, /\.task-items\.has-tasks\s*\{[^}]*height:\s*354px[^}]*max-height:\s*none/s);
  assert.match(taskSource, /const periods = \[/);
  assert.match(taskSource, /heading\.dataset\.period = period\.key/);
});
