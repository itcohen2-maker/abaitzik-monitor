'use strict';
// 4th review: the whole message decides a free tile command; a lock belongs to its owner (heartbeat, takeover, release);
// a payment that finds its order paid stops; a failing package item counts while it is not terminated; a paid customer
// never opens a second entry standing order.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const G = require('../lib/pay-guard.js');
const R = require('../lib/renewal.js');
const PL = require('../lib/plan.js');
const D = require('../lib/pay-day.js');
const A = require('../lib/addons.js');
const S = require('../lib/sumit.js');

const NOW = Date.now();
const MIN = 60e3;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rev4-'));
const age = (file, ms) => { const t = (NOW - ms) / 1000; fs.utimesSync(file, t, t); };

// ---- 1. the whole message is the command
test('negative: "מצב אישי" with a request after it is billable (the request is an action)', () => {
  assert.equal(PL.billable({ text: 'מצב אישי: כתוב לי עשרה פוסטים על הקרוסלה, תזמן אותם לשבוע הבא ותשלח לי לאישור' }), true);
});
test('"מצב אישי" alone, with only punctuation or spaces, is free', () => {
  assert.equal(PL.billable({ text: 'מצב אישי' }), false);
  assert.equal(PL.billable({ text: '  מצב אישי!  ' }), false);
  assert.equal(PL.billable({ text: 'מצב אישי.' }), false);
});
test('negative: a tile command followed by free text (חוזה) is billable; the command alone is free', () => {
  assert.equal(PL.billable({ text: 'תבנה לי כפתור לשליחת הצעות ואז כתוב חוזה' }), true);
  assert.equal(PL.billable({ text: 'תבנה לי כפתור' }), false);
  assert.equal(PL.billable({ text: 'תזיז את האריח' }), false);
  assert.equal(PL.billable({ text: 'תוסיף לי אריח' }), false);
});
test('negative: a tile word at the end of a long request is billable', () => {
  assert.equal(PL.billable({ text: 'אני רוצה שתכתוב הודעה ארוכה ללקוחות על המבצע של השבוע ותשלח אותה מחר ותזיז את זה לאריח' }), true);
});

// ---- 2. locks belong to their owner
test('a reservation is a handle with an owner; a second one is refused', () => {
  const D0 = tmp();
  const h = G.reserveName(D0, 'order-a', NOW);
  assert.ok(h && h.owner && h.path);
  assert.equal(G.reserveName(D0, 'order-a', NOW), null);
  G.release(h);
  assert.ok(G.reserveName(D0, 'order-a', NOW));
});

test('negative: A\'s release does not delete B\'s lock after B took over a stale one', () => {
  const D0 = tmp();
  const a = G.reserveName(D0, 'order-b', NOW);
  age(a.path, 11 * MIN);
  const b = G.reserveName(D0, 'order-b', NOW);
  assert.ok(b, 'B took over');
  G.release(a);
  assert.equal(G.owned(b), true, 'B still holds it');
  assert.equal(fs.existsSync(b.path), true);
});

test('negative: a slow first holder past 10 minutes that heartbeats keeps its lock: no second processing', () => {
  const D0 = tmp();
  const a = G.reserveName(D0, 'order-c', NOW);
  age(a.path, 11 * MIN);
  G.touch(a, NOW);                              // the heartbeat between steps
  assert.equal(G.reserveName(D0, 'order-c', NOW), null);
});

test('negative: a slow first holder with no heartbeat loses the lock to a takeover, and then cannot write', () => {
  const D0 = tmp();
  const a = G.reserveName(D0, 'order-d', NOW);
  age(a.path, 11 * MIN);
  const b = G.reserveName(D0, 'order-d', NOW);
  assert.ok(b);
  assert.throws(() => G.touch(a, NOW), /lock lost/);
  assert.throws(() => G.assertOwned(a), /lock lost/);
  G.assertOwned(b);
});

test('a leftover takeover marker older than 10 minutes is cleared, once; a fresh one is respected', () => {
  const D0 = tmp();
  const a = G.reserveName(D0, 'order-e', NOW);
  age(a.path, 11 * MIN);
  const mk = a.path + '.takeover';
  fs.writeFileSync(mk, 'crashed taker');
  age(mk, 11 * MIN);
  assert.ok(G.reserveName(D0, 'order-e', NOW), 'the old marker is cleared and the takeover goes through');
  assert.equal(fs.existsSync(mk), false);

  const D1 = tmp();
  const c = G.reserveName(D1, 'order-f', NOW);
  age(c.path, 11 * MIN);
  fs.writeFileSync(c.path + '.takeover', 'taking now');
  assert.equal(G.reserveName(D1, 'order-f', NOW), null, 'a fresh marker is respected');
});

test('negative: a payment whose order is paid while it waits for SUMIT stops before any write', async () => {
  const DATA = tmp();
  let writes = 0;
  const P = Object.assign({}, S, {
    beginEntry: async () => 'https://sumit.co.il/x',
    getPayment: async () => {
      // the other return paid the order while this one waited
      const f = path.join(DATA, 'pay', 'orders');
      for (const n of fs.readdirSync(f)) { const o = JSON.parse(fs.readFileSync(path.join(f, n), 'utf8')); o.status = 'paid'; fs.writeFileSync(path.join(f, n), JSON.stringify(o)); }
      return { ID: 1, CustomerID: 555, ValidPayment: true, Amount: 175.82, ExternalIdentifier: 't1' };
    },
    startRecurring: async () => { writes++; return {}; },
  });
  const who = { name: 'x', email: 'x@x.co', phone: '0500000000', home: 'https://t1/' };
  const st = { plan: 'trial', start: '2026-12-01T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [], source: 'day' };
  const r = await D.start({ DATA, P, PL, A, now: NOW, tenant: 't1', state: st, who, plan: 'solo' });
  const oid = (await (async () => { const f = path.join(DATA, 'pay', 'orders'); return fs.readdirSync(f)[0].replace('.json', ''); })());
  assert.equal(r.status, 200);
  await assert.rejects(D.finish({ DATA, P, PL, A, now: NOW, writePlan: () => { writes++; } }, { tenant: 't1', pid: '1', oid, state: st, who }), /already paid/);
  assert.equal(writes, 0);
});

// ---- 3. failing: the non-terminated package items
test('a cancelled newer item does not hide a failing older active one', () => {
  const items = [{ ID: 30, Status: 1, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }, { ID: 10, Status: 3, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }];
  assert.equal(R.failing(items), true);
});
test('two active package items: one failing counts', () => {
  const items = [{ ID: 10, Status: 0, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }, { ID: 20, Status: 3, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }];
  assert.equal(R.failing(items), true);
});
test('negative: a cancelled or finished failing item does not count; a healthy active one does not', () => {
  assert.equal(R.failing([{ ID: 10, Status: 1, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }]), false);
  assert.equal(R.failing([{ ID: 10, Status: 9, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }]), false);
  assert.equal(R.failing([{ ID: 10, Status: 0, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }]), false);
});

// ---- 4. a paid customer's entry payment opens no second standing order
test('negative: a paid customer paying the entry flow opens no standing order (no second 390)', async () => {
  let calls = 0;
  // 5th review: a healthy active package order is what keeps a paid customer from a second one
  const P = { listRecurring: async () => [{ ID: 5, Status: 0, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }], startRecurring: async () => { calls++; return {}; } };
  await PL.entryRecurring(P, 555, { plan: 'solo', price: 149 }, null);
  await PL.entryRecurring(P, 555, { plan: 'entry', price: 390 }, null);
  assert.equal(calls, 0);
});
test('a new entry customer (trial, no plan) still gets the default entry order', async () => {
  let got = 'unset';
  const P = { listRecurring: async () => [], startRecurring: async (c, e, n, m) => { got = m; return {}; } };
  await PL.entryRecurring(P, 555, { plan: 'trial', start: '2026-12-01T10:00:00Z' }, null);
  assert.equal(got, null, 'null = the sumit default entry standing order');
});
test('an offer brings its own monthly order', async () => {
  let got = null;
  const P = { listRecurring: async () => [], startRecurring: async (c, e, n, m) => { got = m; return {}; } };
  const of = { monthly: { name: 'המוניטור העסקי, חבילת SMALL', price: 700 } };
  await PL.entryRecurring(P, 555, { plan: 'solo' }, of);
  assert.equal(got.price, 700);
});
