'use strict';
// 21.11.2026 fix6: the review findings of the trade-price merge (c3e7bdafe), against a fake SUMIT: no card is charged here.
const test = require('node:test');
const assert = require('node:assert');
const PL = require('../lib/plan.js');
const N = 'המוניטור העסקי, חבילת עצמאי';

test('a package order pending its first payment (12) is kept: no second order', async () => {
  let calls = 0, cancels = 0;
  const P = { listRecurring: async () => [{ ID: 5, Status: 12, Item: { Name: N } }], startRecurring: async () => { calls++; return {}; }, cancelRecurring: async () => { cancels++; } };
  const r = await PL.entryRecurring(P, 555, { plan: 'solo', price: 149 }, null);
  assert.equal(calls, 0); assert.equal(cancels, 0); assert.equal(r.skipped, true); assert.equal(r.id, 5);
});
test('a package order with no readable status is kept, never doubled', async () => {
  let calls = 0;
  const P = { listRecurring: async () => [{ ID: 6, Item: { Name: N } }], startRecurring: async () => { calls++; return {}; }, cancelRecurring: async () => {} };
  const r = await PL.entryRecurring(P, 555, { plan: 'solo', price: 149 }, null);
  assert.equal(calls, 0); assert.equal(r.skipped, true);
});
test('negative: only cancelled or finished package orders: a new one opens', async () => {
  let calls = 0;
  const P = { listRecurring: async () => [{ ID: 7, Status: 'Cancelled', Item: { Name: N } }, { ID: 8, Status: 9, Item: { Name: N } }], startRecurring: async () => { calls++; return { RecurringCustomerItemIDs: [99] }; }, cancelRecurring: async () => {} };
  const r = await PL.entryRecurring(P, 555, { plan: 'solo', price: 149 }, null);
  assert.equal(calls, 1); assert.equal(r.id, 99);
});
test('a failing order (status by name) is cancelled, then a new one opens', async () => {
  const cancelled = []; let calls = 0;
  const P = { listRecurring: async () => [{ ID: 3, Status: 'DisabledFailedBillingPayment', Item: { Name: N } }], startRecurring: async () => { calls++; return {}; }, cancelRecurring: async (c, id) => { cancelled.push(id); } };
  await PL.entryRecurring(P, 555, { plan: 'solo', price: 149 }, null);
  assert.deepEqual(cancelled, [3]); assert.equal(calls, 1);
});
test('the entry flow lists inactive orders too', async () => {
  let inactive = null;
  const P = { listRecurring: async (c, e, i) => { inactive = i; return []; }, startRecurring: async () => ({}), cancelRecurring: async () => {} };
  await PL.entryRecurring(P, 555, null, null);
  assert.equal(inactive, true);
});
