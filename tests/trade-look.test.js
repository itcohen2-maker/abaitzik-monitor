// 21.11.2026, Itzik: every trade's monitor has its own colour.
const test = require('node:test');
const assert = require('node:assert');
const { TRADES } = require('../lib/trades.js');
const tc = require('../lib/trade-cards.js');
test('every trade has a look, and no two share an accent', () => {
  const seen = new Set();
  for (const id of Object.keys(TRADES)) {
    const L = tc.LOOK[id];
    assert.ok(L && L.length === 2, id);
    const css = tc.lookCss(id);
    assert.ok(css.includes('--accent:' + L[0][0]) && css.includes('--accent:' + L[1][0]), id);
    assert.ok(css.includes('data-theme="dark"'), id);
    assert.ok(!seen.has(L[1][0])); seen.add(L[1][0]);
  }
});
test('a monitor with no trade keeps its colours', () => { assert.strictEqual(tc.lookCss('nope'), ''); });
