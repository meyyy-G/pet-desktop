const { test } = require('node:test');
const checkQtLayout = require('./qt-layout.cjs');

test('Chat keeps messages scrollable and its composer inside the viewport', () => checkQtLayout('chat'));
