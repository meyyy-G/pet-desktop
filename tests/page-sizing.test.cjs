const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const web = path.join(__dirname, '../src/desktop_pet/web');

test('Calendar and Task fill the viewport without clipping', () => {
  require('./qt-layout.cjs')('calendar,task');
});

test('new Home does not scale the Figma frame', () => {
  const cssFiles = ['styles/base.css', 'styles/shell.css', 'styles/navigation.css', 'styles/right-sidebar.css', 'styles/pages/home.css'];
  const css = cssFiles.map((file) => fs.readFileSync(path.join(web, file), 'utf8')).join('\n');
  assert.doesNotMatch(css, /transform:\s*scale/);
});

test('Home markup uses project SVG assets and keeps business DOM hooks', () => {
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  assert.match(html, /\.\/assets\/navigation\/home\.svg/);
  assert.match(html, /id="home-greeting"/);
  assert.match(html, /id="task-items"/);
  assert.match(html, /id="mini-calendar-grid"/);
  assert.match(html, /id="snapshot-mood-name"/);
  assert.match(html, /id="task-empty-state"/);
  assert.match(html, /\.\/assets\/Segmented Control\/receipt-add\.svg/);
  assert.match(html, /id="home-mood-trigger"/);
  assert.match(html, /id="home-mood-note"/);
  assert.doesNotMatch(html, /class="mood-row"/);
});

test('Calendar shows the diary marker before the mood marker', () => {
  const css = fs.readFileSync(path.join(web, 'styles/pages/calendar.css'), 'utf8');
  assert.match(css, /\.calendar-day\.recorded::before\s*\{[^}]*width:\s*8px[^}]*height:\s*8px[^}]*background:\s*#000/s);
  assert.match(css, /\.calendar-day\.recorded\.mood-recorded::before\s*\{[^}]*left:\s*calc\(50% - 10px\)/s);
  assert.match(css, /\.calendar-day\.recorded\.mood-recorded::after\s*\{[^}]*left:\s*calc\(50% \+ 2px\)/s);
});
