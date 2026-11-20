const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const web = path.join(__dirname, '../src/desktop_pet/web');

test('Diary remains editable after resizing and expanding', () => {
  require('./qt-layout.cjs')('diary');
});

test('Diary toolbar uses the provided SVGs and updated button order', () => {
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  for (const asset of ['undo-arrow.svg', 'redo-arrow.svg', 'bulleted-list.svg', 'text-italic.svg', 'text-underline.svg', 'link.svg', 'maximize.svg']) {
    assert.match(html, new RegExp(`\\.\\/assets\\/diary\\/${asset.replace('.', '\\.')}`));
  }
  assert.match(html, /class="diary-color-button"[^>]*>.*?<svg viewBox="0 0 20 20"[^>]*>.*?<circle[^>]*fill="currentColor"/);
  assert.match(html, /class="diary-format-menu"/);
  assert.equal((html.match(/data-diary-font="Inter"/g) || []).length, 1);
  assert.equal((html.match(/data-diary-font="Geom"/g) || []).length, 1);
  assert.equal((html.match(/data-diary-font="Jost"/g) || []).length, 1);
  assert.doesNotMatch(html, /Font size 14/);
});

test('Diary toolbar separates hover scale from active fill and stroke', () => {
  const css = fs.readFileSync(path.join(web, 'styles/pages/diary.css'), 'utf8');
  assert.match(css, /\.diary-toolbar button\s*\{[^}]*background:\s*transparent;[^}]*border:\s*1px solid transparent;/s);
  assert.match(css, /\.diary-toolbar button:not\(:disabled\):hover\s*\{\s*transform:\s*scale\(1\.08\);/);
  assert.match(css, /\.diary-toolbar button\[aria-pressed="true"\][^}]*background:\s*#f2f2f7;\s*border-color:\s*#f2f2f7;/s);
  assert.match(css, /\.diary-color-button\[aria-pressed="true"\][^}]*transform:\s*scale\(1\.15\);\s*background:\s*transparent;/s);
});

test('Diary maximize animates geometry and supports Escape', () => {
  const source = fs.readFileSync(path.join(web, 'scripts/pages/diary.js'), 'utf8');
  assert.match(source, /area\.animate\(/);
  assert.match(source, /duration:\s*320/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /aria-expanded/);
  assert.doesNotMatch(source, /transform:\s*scale/);
});

test('Diary main follows the latest Figma prompt and text-area layout', () => {
  const css = fs.readFileSync(path.join(web, 'styles/pages/diary.css'), 'utf8');
  const shellCss = fs.readFileSync(path.join(web, 'styles/shell.css'), 'utf8');
  assert.doesNotMatch(css, /\.diary-recent/);
  assert.match(css, /\.diary-prompt-area\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /\.diary-editor\s*\{[^}]*width:\s*calc\(100% - 14px\)/s);
  assert.match(shellCss, /grid-template-columns:\s*var\(--nav-width\) minmax\(0, 1fr\);/);
});

test('Old diary dialog and Recent Entries are removed', () => {
  const domSource = fs.readFileSync(path.join(web, 'scripts/dom.js'), 'utf8');
  const diarySource = fs.readFileSync(path.join(web, 'scripts/pages/diary.js'), 'utf8');
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(web, 'styles/pages/diary.css'), 'utf8');
  for (const source of [html, css, domSource, diarySource]) assert.doesNotMatch(source, /diary-recent|diaryRecent|previous-entry-button/);
  assert.match(diarySource, /function openTimelineDate\(/);
});

test('Calendar dates with diary text or saved Chat open in the main editor', () => {
  const source = fs.readFileSync(path.join(web, 'scripts/pages/diary.js'), 'utf8');
  assert.match(source, /state\.recordedDates\.has\(dateText\) \|\| state\.savedChatDates\.has\(dateText\)/);
  assert.match(source, /openTimelineDate\(dateText\)/);
});

test('Diary main actions appear only while editing', () => {
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(web, 'scripts/pages/diary.js'), 'utf8');
  const css = fs.readFileSync(path.join(web, 'styles/pages/diary.css'), 'utf8');
  assert.match(html, /id="diary-main-actions"[^>]*hidden/);
  assert.match(css, /\.diary-footer-actions\[hidden\]\s*\{\s*display:\s*none;/);
  assert.match(source, /function setMainEditing\(editing\)/);
  assert.match(source, /diaryEditor\.addEventListener\("focus",[^]*?setMainEditing\(true\)/);
  assert.match(source, /diaryEditor\.addEventListener\("input",[^]*?setMainEditing\(true\)/);
  assert.match(source, /state\.hasUnsavedChanges = false;\s*setMainEditing\(false\)/);
  assert.match(source, /document\.addEventListener\("pointerdown", event => leaveMainEditingIfOutside\(event\.target\)\)/);
  assert.match(source, /document\.addEventListener\("focusin", event => leaveMainEditingIfOutside\(event\.target\)\)/);
  assert.match(source, /diary-color-popover, #diary-main-actions/);
});
