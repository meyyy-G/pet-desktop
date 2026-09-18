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
  assert.doesNotMatch(css, /transform:\s*scale|\bzoom\s*:/);
});

test('Home markup uses project SVG assets and keeps business DOM hooks', () => {
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  assert.match(html, /\.\/assets\/navigation\/home\.svg/);
  assert.match(html, /id="home-greeting"/);
  assert.match(html, /id="task-items"/);
  assert.match(html, /id="mini-calendar-grid"/);
  assert.match(html, /id="snapshot-mood-name"/);
});
