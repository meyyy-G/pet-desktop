const { test } = require('node:test');
const checkQtLayout = require('./qt-layout.cjs');

test('Home cards remain reachable across window sizes', () => checkQtLayout('home'));
