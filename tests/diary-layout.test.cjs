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
  for (const asset of ['arrow-down.svg', 'bulleted-list.svg', 'numbered-list.svg', 'text-italic.svg', 'text-underline.svg', 'link.svg', 'maximize.svg', 'arrow-right.svg']) {
    assert.match(html, new RegExp(`\\.\\/assets\\/diary\\/${asset.replace('.', '\\.')}`));
  }
  assert.match(html, /class="diary-color-button"[^>]*>.*?<img src="\.\/assets\/diary\/arrow-down\.svg"/);
  assert.match(html, /class="diary-text-button"[^>]*>T<\/button>/);
});

test('Diary maximize animates geometry and supports Escape', () => {
  const source = fs.readFileSync(path.join(web, 'scripts/pages/diary.js'), 'utf8');
  assert.match(source, /area\.animate\(/);
  assert.match(source, /duration:\s*320/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /aria-expanded/);
  assert.doesNotMatch(source, /transform:\s*scale/);
});

test('Diary main follows the latest Figma editor-only layout', () => {
  const css = fs.readFileSync(path.join(web, 'styles/pages/diary.css'), 'utf8');
  const shellCss = fs.readFileSync(path.join(web, 'styles/shell.css'), 'utf8');
  assert.match(css, /\.diary-recent\s*\{\s*display:\s*none;/);
  assert.match(css, /\.diary-prompt-area\s*\{[^}]*width:\s*calc\(100% - 14px\)/s);
  assert.match(css, /\.diary-editor\s*\{[^}]*width:\s*calc\(100% - 14px\)/s);
  assert.match(shellCss, /data-active-page="diary"\]\s+\.right-sidebar\s*\{\s*display:\s*none;/);
});

test('Recent Entries displays saved diary previews rather than placeholder cards', () => {
  const domSource = fs.readFileSync(path.join(web, 'scripts/dom.js'), 'utf8');
  const diarySource = fs.readFileSync(path.join(web, 'scripts/pages/diary.js'), 'utf8');
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(web, 'styles/pages/diary.css'), 'utf8');
  assert.match(domSource, /diaryRecent:\s*document\.querySelector\("\.diary-recent"\)/);
  assert.match(diarySource, /diaryBridge\.getRecentEntries/);
  assert.match(diarySource, /diaryRecent\?\.classList\.toggle\("is-visible", Boolean\(entries\?\.length\)\)/);
  assert.doesNotMatch(html, /Reflecting on the garden growth/);
  assert.match(css, /\.diary-recent\.is-visible\s*\{\s*display:\s*flex;/);
});
