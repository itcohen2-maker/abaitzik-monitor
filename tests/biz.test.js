'use strict';
/*
  "העסק שלי": the rules behind the score, the urgent line and the month sums.

  Every test pins the clock. "now" is Sunday 12.10.2026 10:00 in Israel, so
  the Israel calendar day, the month and the "7 days / 3 days" windows are
  all fixed and nothing depends on when the test runs.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { load, summary } = require('../lib/biz.js');

const NOW = Date.parse('2026-10-12T10:00:00+03:00');

function rec(o) {
  return Object.assign({
    id: 'biz-test-' + Math.random().toString(36).slice(2, 8),
    kind: 'lead', name: '', phone: '', status: 'חדש', amount: 0, note: '',
    next: '', nextAt: '', at: '2026-09-01T10:00:00+03:00', updatedAt: '2026-09-01T10:00:00+03:00',
  }, o);
}

// The full set: one of each rule plus the edge cases next to each one.
function fixture() {
  return [
    rec({ id: 'L1', name: 'דנה', status: 'חדש' }), // untouched 41 days: stale
    rec({ id: 'L2', name: 'יוסי', status: 'בשיחה', updatedAt: '2026-10-11T09:00:00+03:00',
      next: 'להתקשר לחזור', nextAt: '2026-10-12' }), // fresh, due today
    rec({ id: 'C1', name: 'רונית', kind: 'customer', status: 'נסגר', updatedAt: '2026-08-01T10:00:00+03:00' }), // closed: ignored
    rec({ id: 'O1', name: 'מיכל', status: 'הצעה', updatedAt: '2026-10-07T10:00:00+03:00' }), // 5 days: stuck, oldest
    rec({ id: 'O2', name: 'אבי', kind: 'customer', status: 'הצעה', updatedAt: '2026-10-08T10:00:00+03:00' }), // 4 days: stuck
    rec({ id: 'D1', name: 'שירן', status: 'חדש', updatedAt: '2026-10-09T10:00:00+03:00',
      next: 'לשלוח הצעה', nextAt: '2026-10-10' }), // overdue
    rec({ id: 'F1', name: 'עתיד', status: 'חדש', updatedAt: '2026-10-09T10:00:00+03:00',
      next: 'מחר', nextAt: '2026-10-13' }), // not due yet
    rec({ id: 'I1', kind: 'income', amount: 1500, at: '2026-10-03T12:00:00+03:00', updatedAt: '2026-10-03T12:00:00+03:00' }),
    rec({ id: 'I2', kind: 'income', amount: 900, at: '2026-09-28T12:00:00+03:00', updatedAt: '2026-09-28T12:00:00+03:00' }), // September
    rec({ id: 'I3', kind: 'income', amount: 200, at: '2026-10-12T01:00:00+03:00', updatedAt: '2026-10-12T01:00:00+03:00' }),
    rec({ id: 'E1', kind: 'expense', amount: 300.5, at: '2026-10-05T12:00:00+03:00', updatedAt: '2026-10-05T12:00:00+03:00' }),
    // 30.9 23:30 UTC is 1.10 01:30 in Israel: October. 31.10 23:30 UTC is 1.11: not October.
    rec({ id: 'E2', kind: 'expense', amount: 100, at: '2026-09-30T23:30:00Z', updatedAt: '2026-09-30T23:30:00Z' }),
    rec({ id: 'E3', kind: 'expense', amount: 999, at: '2026-10-31T23:30:00Z', updatedAt: '2026-10-31T23:30:00Z' }),
  ];
}

test('score takes 8 per stale lead, 12 per stuck offer, 6 per due item', () => {
  const s = summary(fixture(), NOW);
  // 1 stale lead (דנה), 2 stuck offers (מיכל, אבי), 2 due items (שירן, יוסי)
  assert.strictEqual(s.score, 100 - 8 - 24 - 12);
  assert.strictEqual(s.score, 56);
});

test('score is null with no records and never below 0', () => {
  assert.strictEqual(summary([], NOW).score, null);
  const many = [];
  for (let i = 0; i < 10; i++) many.push(rec({ id: 'X' + i, status: 'הצעה', updatedAt: '2026-09-01T10:00:00+03:00' }));
  assert.strictEqual(summary(many, NOW).score, 0);
});

test('open, staleLeads, stuck offers and due list', () => {
  const s = summary(fixture(), NOW);
  // open: leads and customers not closed (L1, L2, O1, O2, D1, F1)
  assert.strictEqual(s.open, 6);
  assert.deepStrictEqual(s.counts, { lead: 5, customer: 1 });
  assert.deepStrictEqual(s.staleLeads, [{ id: 'L1', name: 'דנה', days: 41, status: 'חדש' }]);
  assert.deepStrictEqual(s.due.map(d => d.name), ['שירן', 'יוסי']);
  assert.deepStrictEqual(s.due[0], { id: 'D1', name: 'שירן', next: 'לשלוח הצעה', nextAt: '2026-10-10' });
});

test('urgent: a stuck offer comes first, the oldest one', () => {
  assert.strictEqual(summary(fixture(), NOW).urgent,
    'מיכל קיבל הצעה לפני 5 ימים ולא חזרת אליו. להתקשר היום.');
});

test('urgent: with no stuck offer, an overdue next action', () => {
  const recs = [
    rec({ id: 'L1', name: 'דנה' }),
    rec({ id: 'D1', name: 'שירן', status: 'חדש', updatedAt: '2026-10-09T10:00:00+03:00',
      next: 'לשלוח הצעה', nextAt: '2026-10-10' }),
  ];
  assert.strictEqual(summary(recs, NOW).urgent, 'שירן: לשלוח הצעה');
});

test('urgent: with nothing due, the stalest lead', () => {
  const recs = [
    rec({ id: 'L1', name: 'דנה' }),
    rec({ id: 'L2', name: 'יוסי', updatedAt: '2026-09-20T10:00:00+03:00' }),
  ];
  assert.strictEqual(summary(recs, NOW).urgent, 'דנה מחכה 41 ימים בלי מגע.');
});

test('urgent: nothing pressing, and empty when there are no records', () => {
  const recs = [rec({ id: 'L2', name: 'יוסי', updatedAt: '2026-10-11T09:00:00+03:00' })];
  assert.strictEqual(summary(recs, NOW).urgent, 'אין משהו דחוף היום.');
  assert.strictEqual(summary([], NOW).urgent, '');
});

test('month sums use the Israel calendar month and the at date', () => {
  const s = summary(fixture(), NOW);
  assert.strictEqual(s.monthIncome, 1500 + 200);
  assert.strictEqual(s.monthExpense, 300.5 + 100);
});

test('load reads biz/biz, skips broken files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abaitzik-biz-'));
  const dir = path.join(root, 'biz', 'biz');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(rec({ id: 'A', name: 'א' })));
  fs.writeFileSync(path.join(dir, 'b.json'), '{ broken');
  fs.writeFileSync(path.join(dir, 'note.txt'), 'not a record');
  const got = load(root);
  assert.deepStrictEqual(got.map(r => r.id), ['A']);
  assert.deepStrictEqual(load(path.join(root, 'missing')), []);
});
