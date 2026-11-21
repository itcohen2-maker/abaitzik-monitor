'use strict';
// 3rd review: tile commands, reservation takeover, neutral state, renewal vs a payment, current standing order,
// grandfathered price for a stopped trade customer, and no downgrade to entry.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const G = require('../lib/pay-guard.js');
const R = require('../lib/renewal.js');
const D = require('../lib/pay-day.js');
const PL = require('../lib/plan.js');
const A = require('../lib/addons.js');
const S = require('../lib/sumit.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const MIN = 60e3;
const T0 = Date.now(); // the lock files carry real mtimes, so the lock tests run on the real clock
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'third-'));

// ---- (2) tile commands are free only when the message is the command
test('a tile command is free; the tile word at the end of a long request is billable', () => {
  assert.equal(PL.billable({ text: 'תזיז את האריח' }), false);
  assert.equal(PL.billable({ text: 'מצב אישי' }), false);
  const long = 'אני רוצה שתכתוב הודעה ארוכה ללקוחות על המבצע של השבוע, תשלח אותה מחר בבוקר ותזיז את זה לאריח';
  assert.equal(PL.billable({ text: long }), true);
  assert.equal(PL.billable({ text: 'תזכיר לי לשלם מחר' }), true);
});

// ---- (3) a stale reservation is taken over once; a fresh one is not; a crash between reserve and release is recovered
test('negative: a fresh reservation is not taken over', () => {
  const D0 = tmp();
  assert.ok(G.reserveName(D0, 'order-x', T0));
  assert.equal(G.reserveName(D0, 'order-x', T0 + 5 * MIN), null);
});

test('a reservation older than 10 minutes (a crash between reserve and release) is taken over, once', () => {
  const D0 = tmp();
  const lock = G.reserveName(D0, 'order-y', T0);
  fs.utimesSync(lock.path, (T0 - 11 * MIN) / 1000, (T0 - 11 * MIN) / 1000);
  const again = G.reserveName(D0, 'order-y', T0);
  assert.ok(again, 'taken over');
  assert.equal(G.reserveName(D0, 'order-y', T0), null, 'the new reservation holds');
  assert.equal(fs.existsSync(lock.path + '.takeover'), false, 'no takeover marker left');
});

test('negative: two takeovers of one stale reservation: only one wins (O_EXCL marker)', () => {
  const D0 = tmp();
  const lock = G.reserveName(D0, 'order-z', T0);
  fs.utimesSync(lock.path, (T0 - 11 * MIN) / 1000, (T0 - 11 * MIN) / 1000);
  fs.writeFileSync(lock.path + '.takeover', 'someone else');
  assert.equal(G.reserveName(D0, 'order-z', T0), null);
});

// ---- (4) a payment recorded after the run started wins: no failure, no stop, no write
test('negative: a renewal run concurrent with a payment marks nothing and writes nothing', async () => {
  const DATA = tmp();
  const told = { chat: 0, itzik: 0, plans: 0 };
  const solo = { plan: 'solo', price: 149, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [] };
  const failing = [{ ID: 91, Status: 3, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }];
  const paidAt = new Date(NOW + 1000).toISOString();
  await R.runOnce({
    DATA, now: NOW, plans: { ten1: solo }, customerIdOf: () => 77, listRecurring: async () => failing,
    tenantDir: (t) => path.join(DATA, 'tenants', t), tellChat: () => { told.chat++; }, tellItzik: () => { told.itzik++; },
    writePlan: () => { told.plans++; },
    readPlan: () => Object.assign({}, solo, { history: [{ at: paidAt, kind: 'paid', plan: 'solo' }] }),
  });
  assert.deepEqual(told, { chat: 0, itzik: 0, plans: 0 });
  assert.equal(fs.existsSync(path.join(DATA, 'renewal', 'ten1.json')), false);
});

test('negative: the same, when the payment is only a pay record (not yet in the plan file)', async () => {
  const DATA = tmp();
  fs.mkdirSync(path.join(DATA, 'pay'), { recursive: true });
  fs.writeFileSync(path.join(DATA, 'pay', '5001.json'), JSON.stringify({ tenant: 'ten1', at: new Date(NOW + 2000).toISOString() }));
  const solo = { plan: 'solo', price: 149, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [] };
  let tells = 0, writes = 0;
  await R.runOnce({
    DATA, now: NOW, plans: { ten1: solo }, customerIdOf: () => 77,
    listRecurring: async () => [{ ID: 91, Status: 3, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }],
    tenantDir: (t) => path.join(DATA, 'tenants', t), tellChat: () => { tells++; }, tellItzik: () => { tells++; }, writePlan: () => { writes++; },
  });
  assert.equal(tells, 0);
  assert.equal(writes, 0);
});

// ---- (6) only the current (newest) standing order of the package decides the failure
test('negative: an old, replaced package order in status 3 does not make the customer failing', () => {
  const old = { ID: 10, Status: 3, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } };
  const current = { ID: 20, Status: 0, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } };
  // 4th review: any non-terminated package item in a failed status counts (the old one is not cancelled yet)
  assert.equal(R.failing([old, current]), true);
  assert.equal(R.failing([Object.assign({}, old, { Status: 1 }), current]), false, 'a cancelled one does not');
  assert.equal(R.failing([old]), true, 'the only package order is the failed one');
  assert.equal(R.failing([{ ID: 20, Status: 3, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }]), true);
  assert.equal(R.failing([{ ID: 30, Status: 3, Item: { Name: 'חיבור לבנק, קריאה בלבד' } }]), false, 'a bank add-on is not the package');
});

// ---- (7) an entry payment never moves a paid customer down
test('negative: an entry payment (an offer, or the 390 flow) does not downgrade a paid customer', () => {
  const solo = { plan: 'solo', price: 139, month: '2026-12', extra: 0, applied: [], history: [], suspended: true, start: undefined };
  const kept = PL.applyEntryPayment(solo, 'entry', 9001, NOW);
  assert.equal(kept.plan, 'solo');
  assert.equal(kept.price, 139);
  assert.equal(kept.suspended, undefined, 'the stop still clears on any payment');
  const small = PL.applyEntryPayment({ plan: 'trial', start: '2026-12-01T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [] }, 'entry', 9002, NOW);
  assert.equal(small.plan, 'entry');
  assert.equal(small.price, 390);
});

// ---- (5) a stopped trade customer pays his own price, not today's
test('a suspended trade customer is charged the price he joined at (139), not the current one', async () => {
  const sent = [];
  const P = Object.assign({}, S, { beginEntry: async (o) => { sent.push(o); return 'https://sumit.co.il/x'; } });
  const st = { plan: 'solo', price: 139, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [], suspended: true, source: 'day' };
  const r = await D.start({ DATA: tmp(), P, PL, A, now: NOW, tenant: 't1', state: st, who: { name: 'x', email: 'x@x.co', phone: '0500000000', home: 'https://t1/' }, plan: 'solo' });
  assert.equal(r.status, 200);
  assert.equal(sent[0].items[0].price, 139);
});
