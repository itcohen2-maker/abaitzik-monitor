'use strict';
/*
  14.11.2026: the return from SUMIT after an add-on or upgrade (lib/addons.js), out of wa-bridge.js so the whole
  path runs in the tests against a fake SUMIT: the payment is checked with SUMIT itself, once per payment id; the
  plan file changes at once; the monthly part becomes a standing order from next month (an upgrade first cancels
  the package's old one, and never doubles one it can not tell apart); bank and accounting are queued for
  setup/addon-provision.sh. deps: { DATA, P (lib/sumit.js), PIO (lib/plan-io.js), now }.
  Returns { order, out, qs } where qs is what the customer's page gets back.

  21.11.2026 (security review): the order is reserved on disk before the first await (a second return waits its turn
  and is refused), the payment must belong to the order's tenant (SUMIT's ExternalIdentifier when it is echoed, else
  the open order itself), the SUMIT customer is bound to the tenant (lib/pay-guard.js bindCustomer), and a payment id
  recorded for another tenant is refused. Replace cancels only the package's own orders of that bound customer.
*/
const fs = require('fs');
const path = require('path');
const A = require('./addons.js');
const PG = require('./pay-guard.js');

async function done(deps, oid, pid, ext) {
  const { DATA, P, PIO } = deps;
  if (!/^[a-f0-9]{18}$/.test(String(oid || ''))) throw new Error('bad order id');
  const of = path.join(DATA, 'pay', 'orders', oid + '.json');
  const order = JSON.parse(fs.readFileSync(of, 'utf8'));
  if (order.status === 'done') return { order, out: null, qs: '?paid=1&addon=' + order.kind };
  // 5th review (3): an order that is processing (a crash or a slow chain) is never run again by a second return.
  if (order.status === 'processing') {
    // fix6: a stuck order is never silent: a 📋 line for Itzik (deps.owner), then the refusal.
    if (typeof deps.owner === 'function') { try { deps.owner('הזמנת תוספת ' + oid + ' של ' + order.tenant + ' נתקעה באמצע. לבדוק בסאמיט אם החיוב החודשי עודכן.'); } catch (e) {} }
    throw new Error('order ' + oid + ' is in progress: check it by hand');
  }
  pid = String(pid || '').replace(/\D/g, '');
  if (!pid || (ext && ext !== order.tenant)) throw new Error('addon return params');
  const owner = PG.ownerOf(DATA, pid);
  if (owner && owner !== order.tenant) throw new Error('payment ' + pid + ' belongs to another tenant');
  const rec = path.join(DATA, 'pay', pid + '.json');
  let prev = null; try { prev = JSON.parse(fs.readFileSync(rec, 'utf8')); } catch (e) {}
  if (prev && prev.order !== oid) throw new Error('payment ' + pid + ' belongs to another order');
  // Reserved before the first await: a second return of the same order is refused while the first one runs.
  const lock = PG.reserveName(DATA, 'order-' + oid);
  if (!lock) throw new Error('order ' + oid + ' is being paid');
  // 2nd review: the payment id itself is reserved too: two orders can not take one payment in parallel.
  let pidLock = null;
  try { pidLock = PG.reserve(DATA, pid); } catch (e) { PG.release(lock); throw e; }
  if (!pidLock) { PG.release(lock); throw new Error('payment ' + pid + ' is being recorded'); }
  try {
    const p = await P.getPayment(pid);
    // 4th review: heartbeat both locks, then the order is read again: a second return that got in first wins.
    PG.touch(lock); PG.touch(pidLock);
    const order2 = JSON.parse(fs.readFileSync(of, 'utf8'));
    if (order2.status === 'done') return { order: order2, out: null, qs: '?paid=1&addon=' + order2.kind };
    // Fail closed: an empty identifier is confirmed by the SUMIT customer (pay-guard checkPayment), or it is refused.
    const chk = await PG.checkPayment(DATA, p, order.tenant, deps.now, { lookup: deps.lookup, owner: deps.owner });
    if (!chk.ok) throw new Error('payment ' + pid + ' ' + chk.why);
    if (!P.paymentOk(p, A.total(order))) throw new Error('addon payment ' + pid + ' not valid');
    const bound = PG.bindCustomer(DATA, order.tenant, p.CustomerID);
    if (!bound.ok) throw new Error('payment ' + pid + ' customer ' + bound.why);
    const at = new Date(deps.now == null ? Date.now() : deps.now).toISOString();
    const out = { at, tenant: order.tenant, order: oid, kind: order.kind, paymentId: Number(pid), customerId: p.CustomerID, amount: p.Amount };
    PG.assertOwned(lock); PG.assertOwned(pidLock);
    PG.recordWrite(DATA, pid, out);
    const before = PIO.stateOf(order.tenant);
    const after = A.apply(before, order, pid, deps.now);
    if (after && after !== before) PIO.write(order.tenant, after);
    // 5th review (3): processing, with its owner, before the Sumit calls (as the day path marks its order paid first).
    order.status = 'processing'; order.owner = lock.owner;
    fs.writeFileSync(of, JSON.stringify(order, null, 1));
    if (order.monthly) {
      try {
        if (order.replace) {
          // fix6: inactive included (a failing order is listed as inactive), terminated ones are left alone.
          const PL = require('./plan.js');
          const items = (await P.listRecurring(p.CustomerID, undefined, true)) || [];
          const pk = items.filter((x) => PL.isPkgItem(x) && PL.TERMINATED.indexOf(PL.statusCode(x)) < 0);
          if (!pk.length && items.length) throw new Error('לא נמצאה הוראת הקבע של החבילה מבין ' + items.length + ', לבדוק בסאמיט');
          // the heartbeat inside the loop: a slow chain keeps its lock, a second return is refused while it runs
          for (const it of pk) { PG.touch(lock); await P.cancelRecurring(p.CustomerID, it.ID); }
          PG.touch(lock);
          out.cancelled = pk.map((x) => x.ID);
        }
        out.recurring = await P.startRecurring(p.CustomerID, undefined, deps.now, order.monthly);
        const nid = require('./plan.js').orderIdOf(out.recurring);
        if (nid && order.replace) { const cur = PIO.stateOf(order.tenant); if (cur) PIO.write(order.tenant, Object.assign({}, cur, { packageOrder: { id: nid } })); }
      } catch (e) { out.recurringError = e.message; }
    }
    if (order.kind === 'bank' || order.kind === 'accounting') {
      const pd = path.join(DATA, 'pay', 'provision'); fs.mkdirSync(pd, { recursive: true });
      fs.writeFileSync(path.join(pd, order.tenant + '-' + order.kind + '.json'), JSON.stringify({ tenant: order.tenant, kind: order.kind, answers: order.answers || {}, order: oid, at, state: 'queued' }, null, 1));
    }
    order.status = 'done'; order.paymentId = Number(pid); order.doneAt = at;
    fs.writeFileSync(of, JSON.stringify(order, null, 1));
    PG.recordWrite(DATA, pid, out);
    return { order, out, qs: '?paid=1&addon=' + order.kind };
  } finally { PG.release(pidLock); PG.release(lock); }
}

module.exports = { done };
