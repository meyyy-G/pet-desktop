const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Mood colors match the approved Figma variables', async () => {
  const { moodPalette, moodBackground } = await import('../src/desktop_pet/web/scripts/mood-palette.js');
  const expected = {
    Stress: ['#B5B5B5', '#757575', '#B3B3B3'],
    Low: ['#B9D8F7', '#1471DA', '#9EBEF1'],
    Anxious: ['#FFB2B2', '#FF6A6A', '#FCB3AD'],
    Steady: ['#CCECBE', '#8FB994', '#CFF7D3'],
    Light: ['#FED2CB', '#FFA59E', '#FEE9E7'],
    Inspired: ['#D0BCFF', '#B69DF8', '#FAE1FA'],
    Grateful: ['#FAEDB7', '#FFCC00', '#FFE8A3'],
  };
  assert.deepEqual(Object.keys(moodPalette).sort(), Object.keys(expected).sort());
  for (const [name, [background, icon, calendar]] of Object.entries(expected)) {
    assert.equal(moodPalette[name].background, background);
    assert.equal(moodPalette[name].icon, icon);
    assert.equal(moodPalette[name].calendar, calendar);
    assert.equal(moodBackground(name), `${background}33`);
  }
});
