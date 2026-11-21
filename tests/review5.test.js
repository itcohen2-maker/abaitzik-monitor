'use strict';
// 5th review: the entry standing order decision; the failure on the recorded package order only, explicit codes, numbers
// or names; add-on orders processing before Sumit with a heartbeat; an offer replaces; the tile rule.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const PL = require('../lib/plan.js');
const R = require('../lib/renewal.js');
const A = require('../lib/addons.js');
const AP = require('../lib/addon-pay.js');
const P0 = require('../lib/plan.js');

const NOW = Date.UTC(2026, 10, 14, 12);
const PKG = 'המוניטור העסקי, חבילת ';
const item = (ID, Status, name) => ({ ID, Status, Item: { Name: name || (PKG + 'עצמאי') } });
const solo139 = { plan: 'solo', price: 139, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [], suspended: true };

function sumitStub(items, started, cancelled, ids) {
  return {
    listRecurring: async () => items,
    cancelRecurring: async (c, id) => { cancelled.push(id); return {}; },
    startRecurring: async (c, e, n, m) => { started.push(m); return { RecurringCustomerItemIDs: [ids || 555] }; },
  };
}

// ---- 1. the entry decision: a failing order is replaced; a healthy one is kept; a new customer gets the default
test('a suspended paid customer paying the entry flow: the failing order is cancelled, a new one is opened at his price', async () => {
  const started = [], cancelled = [];
  const r = await PL.entryRecurring(sumitStub([item(91, 3)], started, cancelled, 555), 77, solo139, null);
  assert.deepEqual(cancelled, [91]);
  assert.equal(started.length, 1);
  assert.deepEqual(started[0], { name: PKG + 'עצמאי', price: 139, note: 'מנוי חודשי, חבילת עצמאי' });
  assert.equal(r.id, 555);
  assert.equal(r.skipped, false);
  // the entry state clears the stop: not suspended again
  const after = PL.applyEntryPayment(solo139, 'entry', 9001, NOW);
  assert.equal(after.suspended, undefined);
});

test('negative: a healthy active package order is kept: no second order, nothing cancelled', async () => {
  const started = [], cancelled = [];
  const r = await PL.entryRecurring(sumitStub([item(5, 0)], started, cancelled), 77, solo139, null);
  assert.equal(started.length, 0);
  assert.equal(cancelled.length, 0);
  assert.equal(r.skipped, true);
  assert.equal(r.id, 5);
});

test('a failing one as a string status ("14") or as a name is cancelled too', async () => {
  const s1 = [], c1 = [];
  await PL.entryRecurring(sumitStub([item(91, '14')], s1, c1), 77, solo139, null);
  assert.deepEqual(c1, [91]);
  const s2 = [], c2 = [];
  await PL.entryRecurring(sumitStub([item(92, 'DisabledFailedBillingPayment')], s2, c2), 77, solo139, null);
  assert.deepEqual(c2, [92]);
});

test('a new entry customer (no paid plan) gets the default entry order', async () => {
  const started = [], cancelled = [];
  await PL.entryRecurring(sumitStub([], started, cancelled), 77, { plan: 'trial', start: '2026-12-01T10:00:00Z' }, null);
  assert.deepEqual(started, [null]);
});

// ---- 4. an offer replaces the package's order, it never adds one
test('an offer for a customer with an active package order replaces it: the old one is cancelled, then the offer order', async () => {
  const started = [], cancelled = [];
  const of = { monthly: { name: PKG + 'SMALL', price: 700, note: 'x' } };
  await PL.entryRecurring(sumitStub([item(5, 0)], started, cancelled), 77, { plan: 'solo', price: 149 }, of);
  assert.deepEqual(cancelled, [5]);
  assert.equal(started.length, 1);
  assert.equal(started[0].price, 700);
});

// ---- 2. the failure: the recorded package order, explicit statuses, numbers and names
test('the failure counts on the recorded package order only (packageOrder.id)', () => {
  const items = [item(10, 3), item(20, 0)];
  assert.equal(R.failing(items, 20), false, 'the recorded one is healthy');
  assert.equal(R.failing(items, 10), true, 'the recorded one is the failed one');
});
test('without a recorded id, an explicitly failed package order counts', () => {
  assert.equal(R.failing([item(10, 3)]), true);
  assert.equal(R.failing([item(10, 0)]), false);
});
test('a failure status as a number, a string, or a name: each is read (3, 14, 11)', () => {
  for (const st of [3, '3', 14, '14', 11, '11', 'DisabledFailedBillingPayment', 'PendingRetry', 'GracePeriod']) {
    assert.equal(R.failing([item(10, st)]), true, String(st));
  }
  for (const st of [0, '0', 'Active', 1, '1', 'Cancelled', 9, 13, 'CancelledByCustomer', 'FinishedExpired']) {
    assert.equal(R.failing([item(10, st)]), false, String(st));
  }
});
test('negative: a non-package item in a failure status does not count', () => {
  assert.equal(R.failing([item(30, 3, 'חיבור לבנק, קריאה בלבד')]), false);
});

// ---- 3. add-on: processing before Sumit, a heartbeat in the loop, a slow chain past 10 minutes is not run twice
function addonWorld(status) {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rev5-'));
  const plans = { ten1: { plan: 'small', month: P0.monthOf(NOW), extra: 0, applied: [], history: [] } };
  const calls = { start: 0, cancel: 0 };
  let onCancel = null;
  const S = {
    getPayment: async () => ({ ID: 1, CustomerID: 77, ValidPayment: true, Amount: 826, ExternalIdentifier: 'ten1' }),
    paymentOk: require('../lib/sumit.js').paymentOk,
    listRecurring: async () => [{ ID: 5, Item: { Name: A.PKG_PREFIX + 'Small' } }],
    cancelRecurring: async (c, id) => { calls.cancel++; if (onCancel) await onCancel(id); return {}; },
    startRecurring: async () => { calls.start++; return { RecurringCustomerItemIDs: [900] }; },
  };
  const PIO = { stateOf: (t) => plans[t], write: (t, s) => { plans[t] = s; } };
  const oid = require('crypto').randomBytes(9).toString('hex');
  fs.mkdirSync(path.join(DATA, 'pay', 'orders'), { recursive: true });
  const q = A.quote(plans.ten1, 'upgrade:medium', {}, {});
  fs.writeFileSync(path.join(DATA, 'pay', 'orders', oid + '.json'), JSON.stringify(Object.assign({ id: oid, tenant: 'ten1', status: status || 'open' }, q)));
  const deps = { DATA, P: S, PIO, now: NOW, lookup: async () => 'ten1', owner: () => {} };
  return { DATA, plans, calls, oid, deps, setOnCancel: (f) => { onCancel = f; } };
}

test('a slow chain: a second return while the first one cancels is refused; one standing order only', async () => {
  const w = addonWorld();
  let second = null;
  w.setOnCancel(async () => {
    if (!second) second = AP.done(w.deps, w.oid, '3001', 'ten1').then(() => 'ok', (e) => e.message);
    // the first holder is slow: its lock ages past 10 minutes, then the loop's heartbeat refreshes it
    const lock = path.join(w.DATA, 'pay', 'order-' + w.oid + '.lock');
    const old = (Date.now() - 11 * 60e3) / 1000;
    fs.utimesSync(lock, old, old);
  });
  await AP.done(w.deps, w.oid, '3000', 'ten1');
  const r2 = await second;
  assert.match(String(r2), /in progress|being paid|being recorded|lock/);
  assert.equal(w.calls.start, 1, 'one standing order only');
});

test('negative: an order already processing (a crash, or a slow chain) is never run again by a later return', async () => {
  const w = addonWorld('processing');
  await assert.rejects(AP.done(w.deps, w.oid, '3002', 'ten1'), /in progress/);
  assert.equal(w.calls.start, 0);
  assert.equal(w.calls.cancel, 0);
});

test('the processing mark is written before the Sumit calls', async () => {
  const w = addonWorld();
  let seen = null;
  w.setOnCancel(async () => {
    seen = JSON.parse(fs.readFileSync(path.join(w.DATA, 'pay', 'orders', w.oid + '.json'), 'utf8')).status;
  });
  await AP.done(w.deps, w.oid, '3003', 'ten1');
  assert.equal(seen, 'processing');
});

// ---- 5. the tile rule: no table, one free word at most between the verb and the tile word
test('"טבלה" is not a free tile word; the tile command allows one free word, not two', () => {
  assert.equal(PL.billable({ text: 'תוסיף לי טבלה' }), true);
  assert.equal(PL.billable({ text: 'תבנה לי את הכפתור' }), true, 'two free words');
  assert.equal(PL.billable({ text: 'תבנה כפתור' }), false);
  assert.equal(PL.billable({ text: 'תוסיף לי אריח' }), false);
  assert.equal(PL.billable({ text: 'מצב אישי' }), false);
});
