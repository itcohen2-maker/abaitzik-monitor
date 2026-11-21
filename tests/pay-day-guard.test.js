'use strict';
// 21.11.2026 security review: the trade package payment is bound to its tenant, its SUMIT customer and one order.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const D = require('../lib/pay-day.js');
const S = require('../lib/sumit.js');
const PL = require('../lib/plan.js');
const A = require('../lib/addons.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const who = { name: 'דני', email: 'd@example.com', phone: '0500000000', home: 'https://t1.m.it-solution.co.il/' };
const day = () => ({ plan: 'trial', start: '2026-12-01T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [], source: 'day' });

function setup(paymentFor) {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'payday-guard-'));
  const begun = [];
  const P = Object.assign({}, S, {
    beginEntry: async (o) => { begun.push(o); return 'https://sumit.co.il/x'; },
    getPayment: async (id) => paymentFor(id),
    startRecurring: async () => ({}),
  });
  const writes = [];
  const deps = { DATA, P, PL, A, now: NOW, writePlan: (t, st) => writes.push([t, st]), lookup: async () => 't1', owner: () => {} };
  return { DATA, P, begun, writes, deps };
}
async function order(w, tenant) {
  const r = await D.start({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant, state: day(), who, plan: 'solo' });
  return r.body && r.body.url ? w.begun[w.begun.length - 1].redirect.split('=').pop() : null;
}
const pay = (extra) => Object.assign({ ID: 7001, CustomerID: 555, ValidPayment: true, Amount: 175.82 }, extra || {});

test('negative: a payment SUMIT says belongs to another tenant is refused and nothing is written', async () => {
  const w = setup(() => pay({ ExternalIdentifier: 'other' }));
  const oid = await order(w, 't1');
  await assert.rejects(D.finish(w.deps, { tenant: 't1', pid: '7001', oid, state: day(), who }), /not valid|another|tenant/);
  assert.equal(w.writes.length, 0);
});

test('negative: a second SUMIT customer for a bound tenant is refused, the first order was fine', async () => {
  const w = setup((id) => pay({ ID: Number(id), CustomerID: String(id) === '7101' ? 555 : 556 }));
  const o1 = await order(w, 't1');
  await D.finish(w.deps, { tenant: 't1', pid: '7101', oid: o1, state: day(), who });
  const o2 = await order(w, 't1');
  await assert.rejects(D.finish(w.deps, { tenant: 't1', pid: '7102', oid: o2, state: day(), who }), /customer/);
  assert.equal(w.writes.length, 1);
});

test('negative: a SUMIT customer bound to one tenant is refused for another tenant', async () => {
  const w = setup((id) => pay({ ID: Number(id), CustomerID: 555 }));
  const o1 = await order(w, 't1');
  await D.finish(w.deps, { tenant: 't1', pid: '7201', oid: o1, state: day(), who });
  const o2 = await order(w, 't2');
  await assert.rejects(D.finish(w.deps, { tenant: 't2', pid: '7202', oid: o2, state: day(), who }), /tenant|customer/);
});

test('negative: two returns for the same order while one runs: one plan change, one standing order', async () => {
  const w = setup(() => pay({ ID: 7301, CustomerID: 555 }));
  const oid = await order(w, 't1');
  const res = await Promise.allSettled([D.finish(w.deps, { tenant: 't1', pid: '7301', oid, state: day(), who }), D.finish(w.deps, { tenant: 't1', pid: '7301', oid, state: day(), who })]);
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(w.writes.length, 1);
});

test('positive: the payment whose identifier is ours, for the bound customer, goes through once', async () => {
  const w = setup(() => pay({ ID: 7401, CustomerID: 555, ExternalIdentifier: 't1' }));
  const oid = await order(w, 't1');
  const r = await D.finish(w.deps, { tenant: 't1', pid: '7401', oid, state: day(), who });
  assert.equal(r.out.plan, 'solo');
  assert.equal(w.writes.length, 1);
});

test('a payment clears a suspended plan and its failure record, the normal path for a stopped customer', async () => {
  const w = setup(() => pay({ ID: 7501, CustomerID: 555, ExternalIdentifier: 't1' }));
  const oid = await order(w, 't1');
  const stopped = Object.assign(day(), { plan: 'solo', price: 149, suspended: true });
  const fs2 = require('fs');
  fs2.mkdirSync(path.join(w.DATA, 'renewal'), { recursive: true });
  fs2.writeFileSync(path.join(w.DATA, 'renewal', 't1.json'), JSON.stringify({ failure: { firstFailAt: '2026-12-01T00:00:00Z', suspendedAt: '2026-12-08T00:00:00Z' } }));
  await D.finish(w.deps, { tenant: 't1', pid: '7501', oid, state: stopped, who });
  assert.equal(w.writes[0][1].suspended, undefined);
  assert.deepEqual(JSON.parse(fs2.readFileSync(path.join(w.DATA, 'renewal', 't1.json'), 'utf8')).failure, {});
});

test('negative: the order price follows the date, not the request; after the launch the regular price is charged', async () => {
  const w = setup(() => pay({}));
  const table = { launch: { solo: 149, pro: 249 }, regular: { solo: 199, pro: 299 } };
  await D.start({ DATA: w.DATA, P: w.P, PL, A, now: Date.parse('2027-01-03T10:00:00Z'), tenant: 't9', state: day(), who, plan: 'solo', prices: table });
  const oid = w.begun[w.begun.length - 1].redirect.split('=').pop();
  const o = JSON.parse(fs.readFileSync(path.join(w.DATA, 'pay', 'orders', oid + '.json'), 'utf8'));
  assert.equal(o.price, 199);
  assert.equal(w.begun[w.begun.length - 1].items[0].price, 199);
});

test('a suspended trade customer pays his own package again through the normal path; another package is refused', async () => {
  const w = setup(() => pay({}));
  const susp = Object.assign(day(), { plan: 'solo', price: 149, suspended: true });
  const again = await D.start({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: susp, who, plan: 'solo' });
  assert.equal(again.status, 200);
  const other = await D.start({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: susp, who, plan: 'pro' });
  assert.equal(other.status, 400);
  const paid = await D.start({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: Object.assign(day(), { plan: 'solo', price: 149 }), who, plan: 'solo' });
  assert.equal(paid.status, 409);
});

// 2nd review (d): a suspended or failing customer who pays on the day path cancels the failed package order, like renew.
test('(d) a suspended day customer paying through the day path cancels the failed standing order, and starts a new one', async () => {
  const w = setup(() => pay({ ID: 7601, CustomerID: 555, ExternalIdentifier: 't1' }));
  const cancelled = [];
  w.P.listRecurring = async () => [{ ID: 91, Status: 3, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } }, { ID: 92, Status: 0, Item: { Name: 'חיבור לבנק, קריאה בלבד' } }];
  w.P.cancelRecurring = async (c, id) => { cancelled.push(id); return {}; };
  const started = [];
  w.P.startRecurring = async (c, e, n, m) => { started.push(m); return {}; };
  const oid = await order(w, 't1');
  await D.finish(Object.assign({}, w.deps, { P: w.P }), { tenant: 't1', pid: '7601', oid, state: Object.assign(day(), { plan: 'solo', price: 149, suspended: true }), who });
  assert.deepEqual(cancelled, [91]);
  assert.equal(started.length, 1);
});
