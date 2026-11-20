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
  assert.match(taskSource, /tasks\.filter\(task => task\.date === today\)/);
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
  assert.match(homeCss, /\.home-page \.home-workspace\s*\{[^}]*display:\s*flex[^}]*height:\s*420px[^}]*padding:\s*0 15px/s);
  assert.match(homeCss, /\.home-workspace \.home-panel\s*\{[^}]*width:\s*350px[^}]*height:\s*420px/s);
  assert.match(homeCss, /\.home-task-tabs\s*\{[^}]*height:\s*35px/s);
  assert.match(homeCss, /\.task-row\s*\{[^}]*height:\s*60px[^}]*padding:\s*0 15px[^}]*border:\s*0/s);
});

test('Home task tabs filter the presentation without changing task records', () => {
  assert.match(taskSource, /homeTaskPeriod === "all" \? todayTasks : todayTasks\.filter\(task => homeTaskPeriod === "completed" \? task\.completed : !task\.completed\)/);
  assert.match(taskSource, /dom\.taskItems\.append\(\.\.\.visible\.map\(task => taskRow\(task, true\)\)\)/);
  assert.match(taskSource, /button\.setAttribute\("aria-selected", String\(period === homeTaskPeriod\)\)/);
});
