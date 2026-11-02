'use strict';
// 24.10.2026: the 90 day forecast (lib/cashflow.js). Pure, no files, no network.
const { test } = require('node:test');
const assert = require('node:assert');
const cf = require('../lib/cashflow.js');

const DAY = 24 * 3600 * 1000;
const TODAY = Date.parse('2026-10-24T00:00:00Z');
const dayStr = (offset) => new Date(TODAY + offset * DAY).toISOString().slice(0, 10);

test('no cash known means no forecast at all', () => {
  const r = cf.forecast({ cash: null, invoices: [], movements: [], today: TODAY });
  assert.deepStrictEqual(r.forecast90, []);
});

test('thirteen weekly points, starting from the cash', () => {
  const r = cf.forecast({ cash: 1000, invoices: [], movements: [], today: TODAY });
  assert.strictEqual(r.forecast90.length, 13);
  assert.ok(r.forecast90.every((v) => v === 1000));
});

test('an invoice comes in on its due day, in the week it falls', () => {
  const r = cf.forecast({ cash: 1000, invoices: [{ left: 500, due: dayStr(10) }], movements: [], today: TODAY });
  assert.strictEqual(r.forecast90[0], 1000); // day 7
  assert.strictEqual(r.forecast90[1], 1500); // day 14, due day 10 is inside week 2
  assert.strictEqual(r.forecast90[12], 1500);
});

test('an invoice already past due is not counted (conservative)', () => {
  const r = cf.forecast({ cash: 1000, invoices: [{ left: 500, due: dayStr(-5) }], movements: [], today: TODAY });
  assert.ok(r.forecast90.every((v) => v === 1000));
});

test('a monthly payee found in the history is projected, a one time one is not', () => {
  const movements = [
    { date: dayStr(-95), payee: 'ארנונה', amount: -300 },
    { date: dayStr(-65), payee: 'ארנונה', amount: -300 },
    { date: dayStr(-35), payee: 'ארנונה', amount: -300 },
    { date: dayStr(-40), payee: 'תיקון חד פעמי', amount: -2000 },
  ];
  const rec = cf.recurring(movements, TODAY);
  assert.strictEqual(rec.length, 1);
  assert.strictEqual(rec[0].payee, 'ארנונה');
  assert.strictEqual(rec[0].monthly, 300);
  const r = cf.forecast({ cash: 1000, invoices: [], movements, today: TODAY });
  // The last charge was 35 days ago, so the next one is 30 days after it: 5 days ago, moved
  // forward to day 25. Then days 55 and 85. Week 3 ends on day 21 (nothing yet), week 4 ends on day 28.
  assert.strictEqual(r.forecast90[2], 1000);
  assert.strictEqual(r.forecast90[3], 1000 - 300);
  assert.strictEqual(r.forecast90[12], 1000 - 900);
});

test('a whatIf adds one more monthly cost from day 0', () => {
  const input = { cash: 1000, invoices: [], movements: [], today: TODAY };
  const base = cf.forecast(input).forecast90;
  const w = cf.whatIf(input, 100);
  assert.strictEqual(w.length, 13);
  // charges on days 0, 30, 60 and 90 are inside the 91 days
  assert.strictEqual(w[12], base[12] - 400);
  assert.strictEqual(w[0], base[0] - 100);
});

test('a payee with fewer than three charges is not recurring', () => {
  const rec = cf.recurring([
    { date: dayStr(-60), payee: 'חנות', amount: -50 },
    { date: dayStr(-30), payee: 'חנות', amount: -50 },
  ], TODAY);
  assert.deepStrictEqual(rec, []);
});
