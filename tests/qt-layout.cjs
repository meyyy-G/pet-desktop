const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

module.exports = function checkQtLayout(pages) {
  const root = path.join(__dirname, '..');
  const localPython = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.PYTHON || (fs.existsSync(localPython) ? localPython : 'python');
  const result = spawnSync(python, [path.join(__dirname, 'shell-layout-smoke.py'), '--pages', pages], {
    cwd: root, encoding: 'utf8', timeout: 90000,
  });
  assert.equal(result.status, 0, [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n'));
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.ok(report.checked >= 8, 'The layout matrix did not run');
  assert.deepEqual(report.failures, []);
};
