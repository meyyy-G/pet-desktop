const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const web = path.join(__dirname, '../src/desktop_pet/web');

test('Diary remains editable after resizing and expanding', () => {
  require('./qt-layout.cjs')('diary');
});

test('Diary toolbar uses existing project SVG paths', () => {
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  for (const asset of ['undo-arrow.svg', 'redo-arrow.svg', 'bulleted-list.svg', 'numbered-list.svg', 'text-italic.svg', 'text-underline.svg', 'link.svg', 'maximize.svg', 'arrow-right.svg']) {
    assert.match(html, new RegExp(`\\.\\/assets\\/diary\\/${asset.replace('.', '\\.')}`));
  }
});

test('Diary maximize animates geometry and supports Escape', () => {
  const source = fs.readFileSync(path.join(web, 'scripts/pages/diary.js'), 'utf8');
  assert.match(source, /area\.animate\(/);
  assert.match(source, /duration:\s*320/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /aria-expanded/);
  assert.doesNotMatch(source, /transform:\s*scale|\bzoom\s*=/);
});
