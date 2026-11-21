'use strict';
// 24.10.2026: what money.js reports to Itzik (lib/anomaly.js). Pure, no files, no network.
const { test } = require('node:test');
const assert = require('node:assert');
const an = require('../lib/anomaly.js');

const DAY = 24 * 3600 * 1000;
const TODAY = Date.parse('2026-10-24T00:00:00Z');
const daysAgo = (n) => new Date(TODAY - n * DAY).toISOString().slice(0, 10);

test('a charge over 2.5 times the median of earlier charges is flagged', () => {
  const m = [
    { date: '2026-07-01', payee: 'סופר', amount: -100 },
    { date: '2026-08-01', payee: 'סופר', amount: -110 },
    { date: '2026-09-01', payee: 'סופר', amount: -105 },
    { date: '2026-10-01', payee: 'סופר', amount: -400 },
  ];
  const out = an.chargeAnomalies(m);
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].t.includes('סופר'));
  assert.ok(out[0].sub.includes('400'));
});

test('a charge at 2.5 times or below is not flagged', () => {
  const m = [
    { date: '2026-07-01', payee: 'סופר', amount: -100 },
    { date: '2026-08-01', payee: 'סופר', amount: -100 },
    { date: '2026-09-01', payee: 'סופר', amount: -100 },
    { date: '2026-10-01', payee: 'סופר', amount: -250 },
  ];
  assert.deepStrictEqual(an.chargeAnomalies(m), []);
});

test('a charge is judged only against the charges before it', () => {
  // the big one is the first charge of the history: nothing earlier to compare with,
  // so it is only a new payee case (over 1000), never a "times the median" case
  const m = [
    { date: '2026-07-01', payee: 'רכב', amount: -5000 },
    { date: '2026-08-01', payee: 'רכב', amount: -100 },
    { date: '2026-09-01', payee: 'רכב', amount: -100 },
  ];
  const out = an.chargeAnomalies(m);
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].t.startsWith('ספק חדש'));
});

test('a new payee over 1000 is flagged, one under 1000 is not', () => {
  const big = an.chargeAnomalies([{ date: '2026-10-02', payee: 'חדש', amount: -1500 }]);
  assert.strictEqual(big.length, 1);
  assert.ok(big[0].t.startsWith('ספק חדש'));
  assert.deepStrictEqual(an.chargeAnomalies([{ date: '2026-10-02', payee: 'חדש', amount: -900 }]), []);
});

test('income is never a charge', () => {
  assert.deepStrictEqual(an.chargeAnomalies([{ date: '2026-10-02', payee: 'לקוח', amount: 5000 }]), []);
});

test('a debtor unpaid more than 30 days past due is flagged', () => {
  const debtors = [{ name: 'סלאס', inv: [
    { n: '101', date: daysAgo(40), left: 200 },
    { n: '102', date: daysAgo(20), left: 300 },
    { n: '103', date: daysAgo(90), left: 0 },
  ] }];
  const out = an.overdueAnomalies(debtors, TODAY);
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].sub.includes('101'));
  assert.ok(out[0].sub.includes('40'));
});

test('a due day, when there is one, is what counts for overdue', () => {
  const debtors = [{ name: 'א', inv: [{ n: '7', date: daysAgo(60), due: daysAgo(10), left: 50 }] }];
  assert.deepStrictEqual(an.overdueAnomalies(debtors, TODAY), []);
});

test('keys are stable, and fresh() drops the ones already seen', () => {
  const m = [
    { date: '2026-10-02', payee: 'חדש', amount: -1500 },
    { date: '2026-10-03', payee: 'חדש 2', amount: -2000 },
  ];
  const a = an.chargeAnomalies(m);
  const again = an.chargeAnomalies(m);
  assert.deepStrictEqual(a.map((x) => x.key), again.map((x) => x.key));
  assert.strictEqual(an.fresh(a, [a[0].key]).length, 1);
  assert.strictEqual(an.fresh(a, []).length, 2);
});

test('the Hebrew text carries no dash of any kind', () => {
  const m = [
    { date: '2026-07-01', payee: 'סופר', amount: -100 },
    { date: '2026-08-01', payee: 'סופר', amount: -100 },
    { date: '2026-09-01', payee: 'סופר', amount: -100 },
    { date: '2026-10-01', payee: 'סופר', amount: -900 },
    { date: '2026-10-02', payee: 'חדש', amount: -1500 },
  ];
  const all = an.chargeAnomalies(m).concat(an.overdueAnomalies([{ name: 'ב', inv: [{ n: '1', date: daysAgo(50), left: 9 }] }], TODAY));
  assert.ok(all.length >= 3);
  all.forEach((a) => {
    assert.ok(!/[-‐-―־]/.test(a.t + a.sub), a.t + ' | ' + a.sub);
  });
});
