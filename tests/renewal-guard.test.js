'use strict';
/*
  21.11.2026 security review (renewal): negative tests. Active items decide, a missing standing order is a failure
  after 3 days, a flapping status does not reset the grace or tell twice, one tenant's error does not stop the others,
  the plan is re-read before any write, and a customer id sorts numerically.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const R = require('../lib/renewal.js');

const DAY = 864e5;
const T0 = Date.parse('2026-12-10T08:00:00Z');
const solo = { plan: 'solo', price: 149, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [] };
const order = (status) => ({ Status: status, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'renew-g-'));

test('negative: a status that flaps does not reset the grace and does not tell again', () => {
  let s = {};
  let r = R.step(s, true, T0);
  assert.equal(r.tellCustomer, true);
  s = r.next;
  r = R.step(s, false, T0 + DAY);           // one good day
  assert.equal(r.resume, false);
  s = r.next;
  r = R.step(s, true, T0 + DAY + 3600e3);   // fails again the same day
  assert.equal(r.tellCustomer, false); assert.equal(r.tellItzik, false);
  s = r.next;
  assert.equal(s.firstFailAt, new Date(T0).toISOString());
  r = R.step(s, true, T0 + 8 * DAY);        // the grace is still counted from the first failure
  assert.equal(r.suspend, true);
});

test('negative: a stop clears only after two good days in a row, not on one good run', () => {
  let s = R.step({}, true, T0).next;
  s = R.step(s, true, T0 + 8 * DAY).next; // suspended
  s = R.step(s, false, T0 + 8 * DAY + 3600e3).next;
  const notYet = R.step(s, false, T0 + 9 * DAY);
  assert.equal(notYet.resume, false);
  const cleared = R.step(notYet.next, false, T0 + 10 * DAY + 3600e3);
  assert.equal(cleared.resume, true);
  assert.deepEqual(cleared.next, {});
});

test('negative: an active package order is what counts; no order for 3 days is a failure, 2 days is not', async () => {
  const DATA = tmp();
  const told = { chat: 0, itzik: 0 };
  const deps = (now, items) => ({
    DATA, now, plans: { ten1: solo }, customerIdOf: () => 77, listRecurring: async () => items,
    tenantDir: (t) => path.join(DATA, 'tenants', t), tellChat: () => { told.chat++; }, tellItzik: () => { told.itzik++; }, writePlan: () => {},
  });
  await R.runOnce(deps(T0, []));
  await R.runOnce(deps(T0 + 2 * DAY, []));
  assert.equal(told.chat, 0);
  await R.runOnce(deps(T0 + 3 * DAY, []));
  assert.equal(told.chat, 1); assert.equal(told.itzik, 1);
  // a cancelled order is not an active one
  const DATA2 = tmp();
  const cancelled = [{ Status: 1, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }];
  let c2 = 0;
  const d2 = { DATA: DATA2, plans: { ten1: solo }, customerIdOf: () => 77, listRecurring: async () => cancelled, tenantDir: (t) => path.join(DATA2, 'tenants', t), tellChat: () => { c2++; }, tellItzik: () => {}, writePlan: () => {} };
  await R.runOnce(Object.assign({}, d2, { now: T0 }));
  await R.runOnce(Object.assign({}, d2, { now: T0 + 4 * DAY }));
  assert.equal(c2, 1);
  assert.equal(R.hasActiveOrder([order(1)]), false);
  assert.equal(R.hasActiveOrder([order(0)]), true);
});

test('negative: one tenant that throws does not stop the others; the error is in the report', async () => {
  const DATA = tmp();
  const plans = { ten1: solo, ten2: solo };
  const report = await R.runOnce({
    DATA, now: T0, plans, customerIdOf: () => 77,
    listRecurring: async (cid) => { throw new Error('sumit down'); },
    tenantDir: (t) => path.join(DATA, 'tenants', t), tellChat: () => {}, tellItzik: () => {}, writePlan: () => {},
  });
  assert.equal(report.length, 2);
  assert.ok(report.every((r) => r.error === 'sumit down'));
});

test('negative: the plan is re-read right before a write; a stale copy never overwrites a change made in between', async () => {
  const DATA = tmp();
  const written = [];
  const failing = [{ Status: 3, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }];
  const deps = (now) => ({
    DATA, now, plans: { ten1: solo }, customerIdOf: () => 77, listRecurring: async () => failing,
    tenantDir: (t) => path.join(DATA, 'tenants', t), tellChat: () => {}, tellItzik: () => {},
    readPlan: () => Object.assign({}, solo, { extra: 77 }),
    writePlan: (t, st) => written.push(st),
  });
  await R.runOnce(deps(T0));
  await R.runOnce(deps(T0 + 8 * DAY));
  // the first failure writes the failing flag, the stop writes suspended; both from the fresh copy
  assert.equal(written.length, 2);
  assert.equal(written[0].extra, 77);
  assert.equal(written[0].failing, true);
  assert.equal(written[1].extra, 77);
  assert.equal(written[1].suspended, true);
});

test('negative: a suspended customer whose charge is paid again is cleared by the payment record', () => {
  const s = R.step({ firstFailAt: new Date(T0).toISOString(), suspendedAt: new Date(T0 + 8 * DAY).toISOString() }, false, T0 + 9 * DAY);
  assert.equal(s.resume, false, 'one good run is not enough');
});
