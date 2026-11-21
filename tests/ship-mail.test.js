'use strict';
// Synthetic mails and rows only: the repository is public.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/ship-mail.js');

const NOW = '2026-10-06T10:00:00Z';
const row = (o) => Object.assign({ id: String(o.po) + 'x', po: '6001', supplier: 'JEFF', status: '', etd: '', eta: '', customs: '', container: '', history: [] }, o);
const mail = (o) => Object.assign({ id: 'm1', from: 'agent@example.com', subject: '', body: '' }, o);

test('a booking confirmation for one order moves its status and records the mail', () => {
  const rows = [row({ po: '6411', status: '' })];
  const r = M.apply([mail({ subject: 'Booking confirmed PO 6411', body: 'ETD: 10/10/2026' })], rows, NOW);
  assert.deepStrictEqual(r.applied.map((a) => a.field + '=' + a.to), ['status=BOOKING CONFIRM', 'etd=2026-10-10']);
  assert.strictEqual(rows[0].history.at(-1).src, 'mail:m1');
});
test('a status never moves back', () => {
  const rows = [row({ po: '6411', status: 'Goods On Board' })];
  const r = M.apply([mail({ subject: 'booking confirm 6411' })], rows, NOW);
  assert.strictEqual(r.applied.length, 0);
  assert.strictEqual(r.queued.length, 1);
  assert.strictEqual(rows[0].status, 'Goods On Board');
});
test('a customs file number and a container are written when the mail names one of each', () => {
  const rows = [row({ po: '6249', status: 'Goods On Board' })];
  M.apply([mail({ subject: 'תיק עמילות 62457283 להזמנה 6249', body: 'מכולה MSKU1234567' })], rows, NOW);
  assert.strictEqual(rows[0].customs, '62457283');
  assert.strictEqual(rows[0].container, 'MSKU1234567');
});
test('two orders in one mail, or no order number, are queued and change nothing', () => {
  const rows = [row({ po: '6411' }), row({ po: '6412', id: 'b' })];
  const a = M.apply([mail({ subject: 'booking confirm 6411 6412' })], rows, NOW);
  assert.strictEqual(a.applied.length, 0);
  assert.match(a.queued[0].reason, /כמה הזמנות/);
  const b = M.apply([mail({ id: 'm2', subject: 'booking confirm' })], rows, NOW);
  assert.match(b.queued[0].reason, /אין מספר הזמנה/);
});
test('an order with several open lines is queued, a closed line is ignored', () => {
  const two = [row({ po: '6411', id: 'a' }), row({ po: '6411', id: 'b' })];
  assert.match(M.apply([mail({ subject: 'booking confirm 6411' })], two, NOW).queued[0].reason, /כמה שורות/);
  const closed = [row({ po: '6411', id: 'a', status: 'במלאי' }), row({ po: '6411', id: 'b' })];
  assert.strictEqual(M.apply([mail({ id: 'm3', subject: 'booking confirm 6411' })], closed, NOW).applied.length, 1);
});
test('the same mail is never applied twice', () => {
  const rows = [row({ po: '6411' })];
  M.apply([mail({ subject: 'booking confirm 6411' })], rows, NOW);
  const again = M.apply([mail({ subject: 'booking confirm 6411' })], rows, NOW);
  assert.strictEqual(again.applied.length, 0);
});
test('an invalid date is ignored, a number that is not an order is ignored', () => {
  assert.strictEqual(M.isoDate('31/02/2026'), '');
  const rows = [row({ po: '6411' })];
  const r = M.apply([mail({ subject: 'invoice 6999 booking confirm 6411', body: 'ETA: 99/99/2026' })], rows, NOW);
  assert.deepStrictEqual(r.applied.map((a) => a.field), ['status']);
});
