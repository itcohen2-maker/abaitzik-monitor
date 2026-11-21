'use strict';
// 2nd security review: add-on returns. Empty identifier is confirmed at SUMIT or refused; one payment id can not
// be taken by two orders in parallel.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const A = require('../lib/addons.js');
const AP = require('../lib/addon-pay.js');
const P = require('../lib/plan.js');

const NOW = Date.UTC(2026, 10, 14, 12);
const BANKS = {};
function world(payment, opts) {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'addonlookup-'));
  const plans = { ten1: { plan: 'small', month: P.monthOf(NOW), extra: 0, applied: [], history: [] }, ten2: { plan: 'small', month: P.monthOf(NOW), extra: 0, applied: [], history: [] } };
  const calls = [], owner = [];
  const S = {
    getPayment: async () => payment,
    paymentOk: require('../lib/sumit.js').paymentOk,
    listRecurring: async () => [{ ID: 5, Item: { Name: A.PKG_PREFIX + 'Small' } }],
    cancelRecurring: async (c, id) => { calls.push(['cancel', c, id]); return {}; },
    startRecurring: async (c, env, now, m) => { calls.push(['start', c, m.name]); return {}; },
  };
  const PIO = { stateOf: (t) => plans[t], write: (t, s) => { plans[t] = s; } };
  function order(tenant, what) {
    const q = A.quote(plans[tenant], what, {}, BANKS);
    const oid = require('crypto').randomBytes(9).toString('hex');
    fs.mkdirSync(path.join(DATA, 'pay', 'orders'), { recursive: true });
    fs.writeFileSync(path.join(DATA, 'pay', 'orders', oid + '.json'), JSON.stringify(Object.assign({ id: oid, tenant, status: 'open' }, q)));
    return oid;
  }
  const deps = Object.assign({ DATA, P: S, PIO, now: NOW, lookup: async () => 'ten1', owner: (t) => owner.push(t) }, opts || {});
  return { DATA, plans, calls, owner, deps, order };
}
const good = (extra) => Object.assign({ ID: 9001, CustomerID: 77, ValidPayment: true, Amount: 826 }, extra || {});

test('negative: an empty identifier that SUMIT can not confirm is refused, the owner gets the line, nothing changes', async () => {
  const w = world(good(), { lookup: async () => '' });
  const oid = w.order('ten1', 'upgrade:medium');
  await assert.rejects(AP.done(w.deps, oid, '9001', 'ten1'), /unverified/);
  assert.equal(w.plans.ten1.plan, 'small');
  assert.equal(w.calls.length, 0);
  assert.equal(w.owner.length, 1);
});

test('negative: an empty identifier whose SUMIT lookup fails is refused (fail closed)', async () => {
  const w = world(good(), { lookup: async () => { throw new Error('sumit down'); } });
  const oid = w.order('ten1', 'actions');
  await assert.rejects(AP.done(w.deps, oid, '9002', 'ten1'), /lookup/);
  assert.equal(w.plans.ten1.extra, 0);
  assert.equal(w.owner.length, 1);
});

test('negative: an empty identifier whose SUMIT customer belongs to another tenant is refused', async () => {
  const w = world(good(), { lookup: async () => 'ten2' });
  const oid = w.order('ten1', 'actions');
  await assert.rejects(AP.done(w.deps, oid, '9003', 'ten1'), /tenant/);
  assert.equal(w.plans.ten1.extra, 0);
});

test('negative: two parallel returns with one payment id on two different orders: exactly one goes through', async () => {
  const w = world(good({ ExternalIdentifier: 'ten1' }));
  const o1 = w.order('ten1', 'actions');
  const o2 = w.order('ten1', 'actions');
  const res = await Promise.allSettled([AP.done(w.deps, o1, '9004', 'ten1'), AP.done(w.deps, o2, '9004', 'ten1')]);
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(w.plans.ten1.extra, 200);
});

test('positive: an empty identifier that SUMIT confirms for this tenant goes through', async () => {
  const w = world(good());
  const oid = w.order('ten1', 'upgrade:medium');
  await AP.done(w.deps, oid, '9005', 'ten1');
  assert.equal(w.plans.ten1.plan, 'medium');
});
