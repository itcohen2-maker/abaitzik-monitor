'use strict';
/*
  21.11.2026: the trade packages' payment (solo 149, pro 249, before VAT), the two steps wa-bridge.js runs:
    start  (/api/pay/start): a trade trial asks for solo or pro, the server opens an order at its own price and returns
           SUMIT's payment page. The return address carries the order id only (?o=), never the price.
    finish (/api/pay/done?o=): SUMIT confirms the payment, the order must be open and of this tenant, the card amount
           must cover the order's price. Then the plan moves to that package at the price he joined at, and the
           monthly standing order starts next month at the same price.
  SUMIT is passed in (deps.P), so the tests stub it. No network here.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PLANS = ['solo', 'pro'];
const PKG = 'המוניטור העסקי, חבילת ';
const FAILED = [3, 14, 11];
function ordersDir(DATA) { return path.join(DATA, 'pay', 'orders'); }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }

/*
  Returns { status, body } for the route, or { status: 0 } when this is not a trade customer (the caller keeps the
  390 entry flow). deps: DATA, P (lib/sumit.js shape), PL (lib/plan.js), A (lib/addons.js), now, tenant, state, who, plan.
*/
async function start(deps) {
  const PL = deps.PL, st = deps.state;
  if (!PL.isDaySource(st)) return { status: 0 };
  if (PLANS.indexOf(deps.plan) < 0) return { status: 400, body: { error: 'plan' } };
  // 21.11.2026 security review: a stopped customer (suspended after a failed charge) pays his own package again.
  if (!st) return { status: 409, body: { error: 'have' } };
  if (st.plan !== 'trial') {
    if (!st.suspended) return { status: 409, body: { error: 'have' } };
    if (deps.plan !== st.plan) return { status: 400, body: { error: 'plan' } };
  }
  // 21.11.2026 security review: the price is the server's, by the date (lib/plan.js priceFor), never from the request.
  // 3rd review: a stopped customer pays the price he joined at (as the renewal does), not today's price.
  const joined = st.suspended && st.plan === deps.plan && Number(PL.priceOf(st)) > 0;
  const price = joined ? PL.priceOf(st) : PL.priceFor(deps.plan, deps.now == null ? Date.now() : deps.now, deps.prices);
  const oid = crypto.randomBytes(9).toString('hex');
  fs.mkdirSync(ordersDir(deps.DATA), { recursive: true });
  fs.writeFileSync(path.join(ordersDir(deps.DATA), oid + '.json'),
    JSON.stringify({ id: oid, kind: 'day', tenant: deps.tenant, plan: deps.plan, price, at: new Date(deps.now == null ? Date.now() : deps.now).toISOString(), status: 'open' }, null, 1), { mode: 0o600 });
  const url = await deps.P.beginEntry({ tenant: deps.tenant, name: deps.who.name, email: deps.who.email, phone: deps.who.phone,
    items: [{ name: deps.A.pkgName(deps.plan), price }], redirect: 'https://wa.abaitzik.com/api/pay/done?o=' + oid, cancel: deps.who.home });
  return { status: 200, body: { url } };
}

/*
  The payment SUMIT confirmed. Throws when anything is wrong, and then nothing is written.
  deps: DATA, P, PL, A, now, writePlan(tenant, state). args: { tenant, pid, oid, state, who }.
  Returns { out: { plan, price, customerId, recurring }, order }.
*/
async function finish(deps, args) {
  const PL = deps.PL, P = deps.P, PG = require('./pay-guard.js');
  const oid = String(args.oid || '');
  if (!/^[a-f0-9]{18}$/.test(oid)) throw new Error('no order for a trade payment');
  const order = readJson(path.join(ordersDir(deps.DATA), oid + '.json'), null);
  if (!order || (order.kind !== 'day' && order.kind !== 'renew') || order.status !== 'open' || order.tenant !== args.tenant) throw new Error('order ' + oid + ' not open for ' + args.tenant);
  // 21.11.2026 (security review): one order is paid once. Reserved before the first await.
  const lock = PG.reserveName(deps.DATA, 'order-' + oid);
  if (!lock) throw new Error('order ' + oid + ' is being paid');
  try {
    const p = await P.getPayment(Number(args.pid));
    // 4th review: heartbeat, then the order is read again under the lock: a payment recorded while this one waited wins.
    PG.touch(lock);
    const order2 = readJson(path.join(ordersDir(deps.DATA), oid + '.json'), null);
    if (!order2 || order2.status !== 'open') throw new Error('order ' + oid + ' already paid');
    // 2nd review (a): an empty identifier is confirmed at SUMIT (the customer's own), or the payment is refused.
    const chk = await PG.checkPayment(deps.DATA, p, args.tenant, deps.now == null ? Date.now() : deps.now, { lookup: deps.lookup, owner: deps.owner });
    if (!chk.ok) throw new Error('payment ' + args.pid + ' ' + chk.why);
    if (!P.paymentOk(p, order.price)) throw new Error('payment ' + args.pid + ' not valid');
    const bound = PG.bindCustomer(deps.DATA, args.tenant, p.CustomerID);
    if (!bound.ok) throw new Error('payment ' + args.pid + ' customer ' + bound.why);
    const t = deps.now == null ? Date.now() : deps.now;
    // 21.11.2026: a renewal (kind renew) keeps the plan and its extras as they are; it only clears the stop and the failure.
    const renew = order.kind === 'renew';
    const cancelFailed = renew || !!(args.state && (args.state.suspended || args.state.failing));
    let st = renew ? Object.assign({}, args.state) : PL.applyDayPayment(args.state, { plan: order.plan, price: order.price }, args.pid, t);
    if (renew) delete st.failing;
    // applyDayPayment keeps the state when it is not a valid trial: the card is charged, so the plan moves anyway.
    if (!renew && st.plan !== order.plan) st = Object.assign({}, st, { plan: order.plan, price: order.price, month: PL.monthOf(t), extra: 0 });
    // 21.11.2026: a payment clears a stop (suspended after a failed charge, lib/renewal.js) and the failure record.
    delete st.suspended;
    // The failure record of a failed charge is cleared too (lib/renewal.js), so the next daily run starts clean.
    PG.assertOwned(lock);
    fs.mkdirSync(path.join(deps.DATA, "renewal"), { recursive: true });
    fs.writeFileSync(path.join(deps.DATA, "renewal", args.tenant + ".json"), JSON.stringify({ failure: {}, cleared: new Date(t).toISOString() }, null, 1));
    deps.writePlan(args.tenant, st);
    fs.writeFileSync(path.join(ordersDir(deps.DATA), oid + '.json'), JSON.stringify(Object.assign({}, order, { status: 'paid', paymentId: Number(args.pid) }), null, 1));
    const monthly = { name: deps.A.pkgName(order.plan), price: order.price, note: 'מנוי חודשי, חבילת ' + PL.PACKAGES[order.plan].label };
    let recurring = null, recurringError = '';
    try {
      // A renewal first cancels the failed package order of this customer, then starts the new one at the same price.
      // 2nd review (d): a suspended or failing customer cancels the failed package order on the day path too.
      if (cancelFailed) {
        const items = await P.listRecurring(p.CustomerID, undefined, true);
        for (const x of items) { if (FAILED.indexOf(Number(x.Status)) > -1 && String((x.Item && x.Item.Name) || '').indexOf(PKG) === 0) await P.cancelRecurring(p.CustomerID, x.ID); }
      }
      recurring = await P.startRecurring(p.CustomerID, undefined, undefined, monthly);
      // 5th review (2): the new package order is recorded on the plan file.
      const newId = require('./plan.js').orderIdOf(recurring);
      if (newId) deps.writePlan(args.tenant, Object.assign({}, st, { packageOrder: { id: newId } }));
    } catch (e) { recurringError = e.message; }
    return { out: { plan: order.plan, price: order.price, customerId: p.CustomerID, amount: p.Amount, recurring, recurringError }, order };
  } finally { PG.release(lock); }
}

/*
  21.11.2026: the renewal pay (a failed charge or a stop, lib/renewal.js): his own package at the price he joined at
  (lib/plan.js priceOf), + VAT. Same order and same finish as a trade payment (kind renew). Refused for an active customer.
  deps: DATA, P, PL, A, now, tenant, state, who.
*/
async function renewStart(deps) {
  const PL = deps.PL, st = deps.state;
  if (!st || st.plan === 'trial' || !PL.PACKAGES[st.plan] || !(st.suspended || st.failing)) return { status: 409, body: { error: 'have' } };
  const price = PL.priceOf(st);
  if (!(Number(price) > 0)) return { status: 409, body: { error: 'price' } };
  const oid = crypto.randomBytes(9).toString('hex');
  fs.mkdirSync(ordersDir(deps.DATA), { recursive: true });
  fs.writeFileSync(path.join(ordersDir(deps.DATA), oid + '.json'),
    JSON.stringify({ id: oid, kind: 'renew', tenant: deps.tenant, plan: st.plan, price, at: new Date(deps.now == null ? Date.now() : deps.now).toISOString(), status: 'open' }, null, 1), { mode: 0o600 });
  const url = await deps.P.beginEntry({ tenant: deps.tenant, name: deps.who.name, email: deps.who.email, phone: deps.who.phone,
    items: [{ name: deps.A.pkgName(st.plan), price }], redirect: 'https://wa.abaitzik.com/api/pay/done?o=' + oid, cancel: deps.who.home });
  return { status: 200, body: { url } };
}

module.exports = { PLANS, start, finish, renewStart };
