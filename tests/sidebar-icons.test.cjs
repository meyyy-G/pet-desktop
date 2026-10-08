const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/desktop_pet/web/index.html'), 'utf8');

test('sidebar and day/night icon paths point to existing shared SVGs', () => {
  const paths = [
    'right sidebar/play-circle.svg',
    'right sidebar/stop-circle.svg',
    'Segmented Control/day.svg',
    'Segmented Control/night.svg',
  ];
  for (const iconPath of paths) {
    assert.ok(html.includes(`./assets/${iconPath}`), iconPath);
    assert.ok(fs.existsSync(path.join(root, 'assets/web/svg', iconPath)), iconPath);
  }
  assert.doesNotMatch(html, /\.\/assets\/(?:home\/(?:sun|night)|right sidebar\/(?:play|sun))\.svg/);
});

test('focus control switches between inactive and active icons', () => {
  const source = fs.readFileSync(path.join(root, 'src/desktop_pet/web/scripts/pages/home.js'), 'utf8');
  const handler = source.slice(source.indexOf('export function bindFocusToggle()'), source.indexOf('// 首页中的心情模块'))
    .replace('export function bindFocusToggle()', 'function bindFocusToggle()');
  const image = { src: 'play-circle.svg' };
  const attrs = { 'aria-pressed': 'false', 'aria-label': 'Start focus' };
  const button = {
    dataset: { inactiveSrc: 'play-circle.svg', activeSrc: 'stop-circle.svg' },
    addEventListener(event, callback) { assert.equal(event, 'click'); this.click = callback; },
    getAttribute(name) { return attrs[name]; },
    setAttribute(name, value) { attrs[name] = value; },
    querySelector() { return image; },
  };
  vm.runInNewContext(handler + '\nbindFocusToggle();', { dom: { focusToggle: button } });

  button.click();
  assert.equal(attrs['aria-pressed'], 'true');
  assert.equal(attrs['aria-label'], 'Stop focus');
  assert.equal(image.src, 'stop-circle.svg');

  button.click();
  assert.equal(attrs['aria-pressed'], 'false');
  assert.equal(attrs['aria-label'], 'Start focus');
  assert.equal(image.src, 'play-circle.svg');
});
