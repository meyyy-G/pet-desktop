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

test('Add Task opens a modal and no longer renders the old inline form', () => {
  for (const id of ['task-header-add', 'task-add-backdrop', 'task-add-form', 'task-add-name', 'task-add-date', 'task-add-duration', 'task-add-submit', 'task-add-cancel']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="task-quick-add"|id="task-quick-title"/);
  assert.match(source, /function bindAddTaskDialog\(\)/);
  assert.match(source, /duration_minutes: Number\(duration\.value\)/);
});

test('Today and Upcoming reuse the standard task list without Day/Night groups', () => {
  assert.doesNotMatch(source, /tp-period-group|openPeriodMenu\(/);
  assert.match(source, /dom\.taskPageList\.replaceChildren\(\.\.\.\(tasks\.length \? tasks\.map\(task => taskRow\(task\)\)/);
  assert.match(source, /taskState\.view === "upcoming" \? "sand-timer" : taskState\.view === "completed" \? "task-square" : "day"/);
});

test('Task more menu supports editing, completion, moving, and deletion', () => {
  for (const label of ['Edit', 'Mark as completed', 'Move to', 'Delete']) {
    assert.match(source, new RegExp(`"${label}"`));
  }
  assert.match(source, /tp-menu-divider/);
  assert.match(source, /tp-menu-delete/);
  assert.match(source, /updateTask\(task\.id, \{ completed: !task\.completed \}\)/);
  assert.match(source, /createTaskDatePicker\(\(\) => task\.date, value => \{ closeMenu\(\); updateTask\(task\.id, \{ date: value \}\)/);
  assert.doesNotMatch(source, /dateInput\.type = "date"/);
});

test('Task form reuses the calendar and duration menu for add and edit', () => {
  assert.match(html, /id="task-add-date-trigger"/);
  assert.match(html, /id="task-add-duration-trigger"/);
  assert.match(html, /id="task-add-date" type="hidden"/);
  assert.match(html, /id="task-add-duration" type="hidden"/);
  assert.match(source, /calendar = createTaskDatePicker\(\(\) => date\.value/);
  assert.match(source, /openDurationMenu\(durationTrigger, Number\(duration\.value\)/);
  assert.match(source, /duration\.value = task \? String\(task\.duration_minutes\) : "45"/);
  assert.match(source, /if \(editingTask\) updateTask\(editingTask\.id, values, close, failed\)/);
});

test('Task sections collapse with the right arrow and keep view state', () => {
  assert.match(html, /data-task-section-toggle="primary"/);
  assert.match(html, /data-task-section-toggle="secondary"/);
  assert.match(source, /const collapsedTaskSections = \{ all: false, today: false, upcoming: false, completed: false, secondary: false \}/);
  assert.match(source, /collapsed \? "arrow-right4" : "arrow-down4"/);
  assert.match(source, /toggle\.setAttribute\("aria-expanded", String\(!collapsed\)\)/);
});

test('Task filter exposes tag, priority, and status controls', () => {
  assert.match(html, /id="task-filter-trigger"[^>]*aria-haspopup="dialog"/);
  assert.doesNotMatch(html, /id="task-filter-trigger"[^>]*disabled/);
  for (const value of ['work', 'design', 'personal', 'learning']) assert.match(html, new RegExp(`name="category" value="${value}"`));
  for (const value of ['low', 'medium', 'high']) assert.match(html, new RegExp(`name="priority" value="${value}"`));
  for (const value of ['all', 'incomplete', 'completed']) assert.match(html, new RegExp(`name="status" value="${value}"`));
  assert.match(source, /function bindTaskFilter\(\)/);
  assert.match(source, /categories\.includes\(task\.category\)/);
  assert.match(source, /priorities\.includes\(task\.priority\)/);
  assert.match(source, /task\.completed === \(status === "completed"\)/);
});

test('Task has no inline add form or Day/Night interface remnants', () => {
  const css = fs.readFileSync(path.join(root, 'src/desktop_pet/web/styles/pages/task.css'), 'utf8');
  assert.doesNotMatch(html, /id="task-quick-add"|id="task-date-select"|id="task-priority-select"/);
  assert.doesNotMatch(source, /quickPeriod|renderQuickPeriod|openDateMenu|openPriorityMenu|tp-period-group/);
  assert.doesNotMatch(css, /\.tp-quick-add|\.tp-period-group|\.tp-period-select|\.tp-calendar-menu/);
});

test('Sort supports chronological and priority order in the current Task view', () => {
  assert.match(html, /id="task-sort-trigger"[^>]*aria-haspopup="menu"/);
  assert.match(source, /function sortVisibleTasks\(a, b\)/);
  for (const mode of ['time-asc', 'time-desc', 'priority-high', 'priority-low']) {
    assert.ok(source.includes(`"${mode}"`), `${mode} is missing`);
  }
  assert.match(source, /filteredTasks\(\)\.sort\(sortVisibleTasks\)/);
  assert.match(source, /bindTaskSort\(\)/);
});

test('Home task tabs use All, Uncompleted, and Completed without Day/Night', () => {
  for (const view of ['all', 'uncompleted', 'completed']) {
    assert.match(html, new RegExp(`data-home-task-period="${view}"`));
  }
  assert.doesNotMatch(html, /data-home-task-period="day"|data-home-task-period="night"/);
  assert.match(source, /period === "completed" \? task\.completed : !task\.completed/);
});
