'use strict';
/*
  14.11.2026: the return from SUMIT after an add-on or upgrade (lib/addons.js), out of wa-bridge.js so the whole
  path runs in the tests against a fake SUMIT: the payment is checked with SUMIT itself, once per payment id; the
  plan file changes at once; the monthly part becomes a standing order from next month (an upgrade first cancels
  the package's old one, and never doubles one it can not tell apart); bank and accounting are queued for
  setup/addon-provision.sh. deps: { DATA, P (lib/sumit.js), PIO (lib/plan-io.js), now }.
  Returns { order, out, qs } where qs is what the customer's page gets back.
*/
const fs = require('fs');
const path = require('path');
const A = require('./addons.js');

async function done(deps, oid, pid, ext) {
  const { DATA, P, PIO } = deps;
  if (!/^[a-f0-9]{18}$/.test(String(oid || ''))) throw new Error('bad order id');
  const of = path.join(DATA, 'pay', 'orders', oid + '.json');
  const order = JSON.parse(fs.readFileSync(of, 'utf8'));
  if (order.status === 'done') return { order, out: null, qs: '?paid=1&addon=' + order.kind };
  pid = String(pid || '').replace(/\D/g, '');
  if (!pid || (ext && ext !== order.tenant)) throw new Error('addon return params');
  const rec = path.join(DATA, 'pay', pid + '.json');
  let prev = null; try { prev = JSON.parse(fs.readFileSync(rec, 'utf8')); } catch (e) {}
  if (prev && prev.order !== oid) throw new Error('payment ' + pid + ' belongs to another order');
  const p = await P.getPayment(pid);
  if (!P.paymentOk(p, A.total(order))) throw new Error('addon payment ' + pid + ' not valid');
  const at = new Date(deps.now == null ? Date.now() : deps.now).toISOString();
  const out = { at, tenant: order.tenant, order: oid, kind: order.kind, paymentId: Number(pid), customerId: p.CustomerID, amount: p.Amount };
  fs.mkdirSync(path.dirname(rec), { recursive: true });
  fs.writeFileSync(rec, JSON.stringify(out, null, 1));
  const before = PIO.stateOf(order.tenant);
  const after = A.apply(before, order, pid, deps.now);
  if (after && after !== before) PIO.write(order.tenant, after);
  if (order.monthly) {
    try {
      if (order.replace) {
        const items = await P.listRecurring(p.CustomerID);
        const pk = A.packageItems(items);
        if (!pk.length && items.length) throw new Error('לא נמצאה הוראת הקבע של החבילה מבין ' + items.length + ', לבדוק בסאמיט');
        for (const it of pk) await P.cancelRecurring(p.CustomerID, it.ID);
        out.cancelled = pk.map((x) => x.ID);
      }
      out.recurring = await P.startRecurring(p.CustomerID, undefined, deps.now, order.monthly);
    } catch (e) { out.recurringError = e.message; }
  }
  if (order.kind === 'bank' || order.kind === 'accounting') {
    const pd = path.join(DATA, 'pay', 'provision'); fs.mkdirSync(pd, { recursive: true });
    fs.writeFileSync(path.join(pd, order.tenant + '-' + order.kind + '.json'), JSON.stringify({ tenant: order.tenant, kind: order.kind, answers: order.answers || {}, order: oid, at, state: 'queued' }, null, 1));
  }
  order.status = 'done'; order.paymentId = Number(pid); order.doneAt = at;
  fs.writeFileSync(of, JSON.stringify(order, null, 1));
  fs.writeFileSync(rec, JSON.stringify(out, null, 1));
  return { order, out, qs: '?paid=1&addon=' + order.kind };
}

module.exports = { done };
