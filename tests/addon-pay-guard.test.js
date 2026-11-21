'use strict';
// 21.11.2026 security review: an add-on payment return is refused unless it belongs to the order's tenant and customer.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/addons.js');
const AP = require('../lib/addon-pay.js');
const P = require('../lib/plan.js');

const NOW = Date.UTC(2026, 10, 14, 12);
const BANKS = {};

// payment: the fake SUMIT's record for any id. calls: every standing order change.
function world(payment, items) {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'addonguard-'));
  const plans = { ten1: { plan: 'small', month: P.monthOf(NOW), extra: 0, applied: [], history: [] }, ten2: { plan: 'small', month: P.monthOf(NOW), extra: 0, applied: [], history: [] } };
  const calls = [];
  const S = {
    getPayment: async () => payment,
    paymentOk: require('../lib/sumit.js').paymentOk,
    listRecurring: async () => items || [],
    cancelRecurring: async (c, id) => { calls.push(['cancel', c, id]); return {}; },
    startRecurring: async (c, env, now, m) => { calls.push(['start', c, m.name, m.price]); return { ok: 1 }; },
  };
  const PIO = { stateOf: (t) => plans[t], write: (t, s) => { plans[t] = s; } };
  function order(tenant, what) {
    const q = A.quote(plans[tenant], what, {}, BANKS);
    const oid = require('crypto').randomBytes(9).toString('hex');
    fs.mkdirSync(path.join(DATA, 'pay', 'orders'), { recursive: true });
    fs.writeFileSync(path.join(DATA, 'pay', 'orders', oid + '.json'), JSON.stringify(Object.assign({ id: oid, tenant, status: 'open' }, q)));
    return oid;
  }
  return { DATA, plans, calls, deps: { DATA, P: S, PIO, now: NOW, lookup: async () => 'ten1', owner: () => {} }, order };
}
const good = (extra) => Object.assign({ ID: 4001, CustomerID: 77, ValidPayment: true, Amount: 826 }, extra || {});

test('negative: a payment SUMIT says belongs to another tenant changes nothing', async () => {
  const w = world(good({ ExternalIdentifier: 'ten2' }), [{ ID: 5, Item: { Name: A.PKG_PREFIX + 'Small' } }]);
  const oid = w.order('ten1', 'upgrade:medium');
  await assert.rejects(AP.done(w.deps, oid, '4001', 'ten1'), /tenant/);
  assert.equal(w.plans.ten1.plan, 'small');
  assert.equal(w.calls.length, 0);
});

test('negative: an amount below the add-on or upgrade price changes nothing', async () => {
  const w = world(good({ Amount: 100 }), []);
  const oid = w.order('ten1', 'actions');
  await assert.rejects(AP.done(w.deps, oid, '4002', 'ten1'), /not valid/);
  assert.equal(w.plans.ten1.extra, 0);
});

test('negative: the SUMIT customer is bound to the tenant; a payment from another customer is refused before any cancel', async () => {
  const w = world(good(), [{ ID: 5, Item: { Name: A.PKG_PREFIX + 'Small' } }]);
  const oid1 = w.order('ten1', 'actions');
  await AP.done(w.deps, oid1, '4003', 'ten1');
  assert.equal(w.plans.ten1.extra, 200);
  // the same tenant, another SUMIT customer
  const w2 = Object.assign({}, w, { deps: Object.assign({}, w.deps, { P: Object.assign({}, w.deps.P, { getPayment: async () => good({ CustomerID: 88 }) }) }) });
  const oid2 = w.order('ten1', 'upgrade:medium');
  await assert.rejects(AP.done(w2.deps, oid2, '4004', 'ten1'), /customer|tenant/);
  assert.equal(w.plans.ten1.plan, 'small');
  assert.equal(w.calls.length, 0);
});

test('negative: a customer bound to ten1 can not pay for ten2 (same SUMIT customer, other tenant)', async () => {
  const w = world(good(), []);
  const oid1 = w.order('ten1', 'actions');
  await AP.done(w.deps, oid1, '4005', 'ten1');
  const oid2 = w.order('ten2', 'actions');
  await assert.rejects(AP.done(w.deps, oid2, '4006', 'ten2'), /tenant|customer/);
  assert.equal(w.plans.ten2.extra, 0);
});

test('negative: a second return of the same order while the first one runs is refused, nothing happens twice', async () => {
  const w = world(good(), [{ ID: 5, Item: { Name: A.PKG_PREFIX + 'Small' } }]);
  const oid = w.order('ten1', 'upgrade:medium');
  const results = await Promise.allSettled([AP.done(w.deps, oid, '4007', 'ten1'), AP.done(w.deps, oid, '4007', 'ten1')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(w.calls.filter((c) => c[0] === 'start').length, 1);
  assert.equal(w.calls.filter((c) => c[0] === 'cancel').length, 1);
});

test('negative: a payment id recorded for another tenant is refused', async () => {
  const w = world(good(), []);
  const oid1 = w.order('ten1', 'actions');
  await AP.done(w.deps, oid1, '4008', 'ten1');
  // ten2 tries the very same payment id with its own order
  const oid2 = w.order('ten2', 'actions');
  await assert.rejects(AP.done(w.deps, oid2, '4008', 'ten2'), /another tenant/);
  assert.equal(w.plans.ten2.extra, 0);
});

test('positive: the right tenant, the right customer, the right amount goes through once', async () => {
  const w = world(good({ ExternalIdentifier: 'ten1' }), [{ ID: 5, Item: { Name: A.PKG_PREFIX + 'Small' } }]);
  const oid = w.order('ten1', 'upgrade:medium');
  await AP.done(w.deps, oid, '4009', 'ten1');
  assert.equal(w.plans.ten1.plan, 'medium');
  assert.equal(w.calls.length, 2);
});
