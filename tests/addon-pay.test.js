'use strict';
// 14.11.2026: the whole return from SUMIT against a fake SUMIT (lib/addon-pay.js): no card is charged here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/addons.js');
const AP = require('../lib/addon-pay.js');
const P = require('../lib/plan.js');

const NOW = Date.UTC(2026, 10, 14, 12);
const BANKS = { hapoalim: { name: 'בנק הפועלים', kinds: ['private'] } };

function world(plan, items, amountFor) {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'addonpay-'));
  const plans = { ten1: { plan, month: P.monthOf(NOW), extra: 0, applied: [], history: [] } };
  const calls = [];
  const P2 = {
    getPayment: async (id) => ({ ID: Number(id), CustomerID: 77, ValidPayment: id !== '999', Amount: amountFor }),
    paymentOk: require('../lib/sumit.js').paymentOk,
    listRecurring: async () => items,
    cancelRecurring: async (c, id) => { calls.push(['cancel', c, id]); return {}; },
    startRecurring: async (c, env, now, m) => { calls.push(['start', c, m.name, m.price]); return { ok: 1 }; },
  };
  const PIO = { stateOf: (t) => plans[t], write: (t, s) => { plans[t] = s; } };
  function order(what, answers) {
    const q = A.quote(plans.ten1, what, answers || {}, BANKS);
    const oid = require('crypto').randomBytes(9).toString('hex');
    fs.mkdirSync(path.join(DATA, 'pay', 'orders'), { recursive: true });
    fs.writeFileSync(path.join(DATA, 'pay', 'orders', oid + '.json'), JSON.stringify(Object.assign({ id: oid, tenant: 'ten1', status: 'open' }, q)));
    return oid;
  }
  return { DATA, plans, calls, deps: { DATA, P: P2, PIO, now: NOW, lookup: async () => 'ten1', owner: () => {} }, order };
}

test('addon pay: an upgrade changes the plan, cancels only the package order and starts the new one', async () => {
  const w = world('small', [{ ID: 5, Item: { Name: 'המוניטור העסקי, חבילת Small' } }, { ID: 6, Item: { Name: 'חיבור לבנק, קריאה בלבד' } }], 826);
  const oid = w.order('upgrade:medium');
  const r = await AP.done(w.deps, oid, '1001', 'ten1');
  assert.equal(w.plans.ten1.plan, 'medium');
  assert.deepEqual(w.calls, [['cancel', 77, 5], ['start', 77, A.PKG_PREFIX + 'Medium', 1400]]);
  assert.equal(r.qs, '?paid=1&addon=upgrade');
  // SUMIT sends him back twice: nothing happens twice.
  await AP.done(w.deps, oid, '1001', 'ten1');
  assert.equal(w.calls.length, 2);
});

test('addon pay: a package order it can not tell apart is never doubled', async () => {
  const w = world('small', [{ ID: 9, Item: { Name: 'חבילה ישנה בשם אחר' } }], 2242);
  const r = await AP.done(w.deps, w.order('upgrade:large'), '1002', 'ten1');
  assert.equal(w.plans.ten1.plan, 'large');
  assert.equal(w.calls.length, 0);
  assert.ok(r.out.recurringError);
});

test('addon pay: actions now, a monthly add-on starts its own standing order, the bank is queued', async () => {
  const w = world('entry', [], 999);
  await AP.done(w.deps, w.order('actions'), '2001', 'ten1');
  assert.equal(w.plans.ten1.extra, 200);
  assert.equal(w.calls.length, 0);
  await AP.done(w.deps, w.order('bank', { bank: 'hapoalim', kind: 'private' }), '2002', 'ten1');
  assert.equal(w.plans.ten1.addons.bank.on, true);
  assert.deepEqual(w.calls[0], ['start', 77, 'חיבור לבנק, קריאה בלבד', 149]);
  const job = JSON.parse(fs.readFileSync(path.join(w.DATA, 'pay', 'provision', 'ten1-bank.json'), 'utf8'));
  assert.equal(job.state, 'queued'); assert.deepEqual(job.answers, { bank: 'hapoalim', kind: 'private' });
});

test('addon pay: an invalid or short payment, a foreign customer or a reused payment id changes nothing', async () => {
  const w = world('entry', [], 10);
  await assert.rejects(AP.done(w.deps, w.order('sign50'), '3001', 'ten1'));
  assert.ok(!w.plans.ten1.addons);
  const w2 = world('entry', [], 999);
  await assert.rejects(AP.done(w2.deps, w2.order('sign50'), '999', 'ten1'));
  await assert.rejects(AP.done(w2.deps, w2.order('sign50'), '3002', 'other'));
  const o1 = w2.order('actions');
  await AP.done(w2.deps, o1, '3003', 'ten1');
  await assert.rejects(AP.done(w2.deps, w2.order('actions'), '3003', 'ten1'));
  assert.equal(w2.plans.ten1.extra, 200);
});
