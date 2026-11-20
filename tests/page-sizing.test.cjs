const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const web = path.join(__dirname, '../src/desktop_pet/web');

test('Calendar and Task fill the viewport without clipping', () => {
  require('./qt-layout.cjs')('calendar,task');
});

test('Home layout does not scale the whole Figma frame', () => {
  const cssFiles = ['styles/base.css', 'styles/shell.css', 'styles/navigation.css', 'styles/pages/home.css'];
  const css = cssFiles.map((file) => fs.readFileSync(path.join(web, file), 'utf8')).join('\n');
  assert.doesNotMatch(css, /(?:\.app-shell|\.home-page|\.home-main-layout)\s*\{[^}]*transform:\s*scale/s);
});

test('Home markup uses project SVG assets and keeps business DOM hooks', () => {
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  assert.match(html, /\.\/assets\/navigation\/home\.svg/);
  assert.match(html, /id="home-greeting"/);
  assert.match(html, /id="task-items"/);
  assert.match(html, /id="mini-calendar-grid"/);
  assert.doesNotMatch(html, /class="right-sidebar"/);
  assert.match(html, /id="task-empty-state"/);
  assert.match(html, /\.\/assets\/task\/receipt-add\.svg/);
  assert.match(html, /id="home-mood-trigger"/);
  assert.match(html, /id="home-mood-note"/);
  assert.doesNotMatch(html, /class="mood-row"/);
});

test('Calendar shows the diary marker before the mood marker', () => {
  const css = fs.readFileSync(path.join(web, 'styles/pages/calendar.css'), 'utf8');
  const source = fs.readFileSync(path.join(web, 'scripts/pages/calendar.js'), 'utf8');
  assert.match(source, /markers\.append\(diaryMarker\)[\s\S]*markers\.append\(moodMarker\)/);
  assert.match(css, /\.calendar-day-markers\s*\{[^}]*display:flex[^}]*gap:5px/);
  assert.match(css, /\.calendar-diary-marker\s*\{[^}]*background:#171717/);
});
