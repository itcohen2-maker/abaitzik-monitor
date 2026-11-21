'use strict';
/*
  21.11.2026, Itzik: the daily check of every paid customer's monthly charge (setup/renewal-check.js runs it).
  - SUMIT recurring status 3 (DisabledFailedBillingPayment), 14 (PendingRetry) or 11 (GracePeriod): a failed charge.
    The customer is told once in his chat (it goes to his WhatsApp too, waPush). Itzik is told once. Service goes on
    7 days from the first failure; then the plan is marked suspended and the page says so, the way a trial ends.
  - 21.11.2026 security review: only ACTIVE items count (Status 0). A paid plan with no active package standing order
    for 3 days is a failure too. A status that flaps does not reset the grace or tell twice: the failure is cleared
    only after two good days in a row. Each tenant is run on its own (one error does not stop the others), and the plan
    is read again right before it is written.
  - The month's summary goes once a month, 1 to 2 days before the renewal date (Date_NextBilling).
  Everything outside this file (SUMIT, the plan file, the chat, Itzik's 📋 line) comes in through deps.
  The state per customer: DATA/renewal/<tenant>.json { failure: {...}, missingSince, summaryMonth }.
*/
const fs = require('fs');
const path = require('path');
const P = require('./plan.js');

const FAIL_STATUS = [3, 14, 11];
const TERMINATED = [1, 9, 13];
const GRACE_MS = 7 * 864e5;
const OK_MS = 2 * 864e5;
const MISSING_MS = 3 * 864e5;
const PAID = ['entry', 'small', 'medium', 'large', 'solo', 'pro'];
const DAY = 864e5;
const PKG = 'המוניטור העסקי, חבילת ';

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function readText(f) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } }
const nameOf = (x) => String((x && x.Item && x.Item.Name) || (x && x.Name) || '');
const isActive = (x) => !!x && (x.Status == null || Number(x.Status) === 0);

// A failed charge in any ACTIVE item (a cancelled item says nothing about the charge now).
// A failed status is on the package's own order (a failed charge moves that item out of Status 0 by itself).
function failing(items, orderId) {
  // 5th review (2): only an explicit failure (3, 14, 11) on the package order recorded on the plan file (packageOrder.id).
  // Without a recorded id, any package order in a failure status counts. Status as a number or a name (plan.js statusCode).
  return (items || []).some((x) => {
    if (!x || !P.isPkgItem(x)) return false;
    if (P.FAIL_CODES.indexOf(P.statusCode(x)) < 0) return false;
    return orderId ? String(x.ID) === String(orderId) : true;
  });
}
// The package's own standing order is active (the name the upgrade and the payment write, lib/addons.js PKG_PREFIX).
function hasActiveOrder(items) {
  return (items || []).some((x) => isActive(x) && nameOf(x).indexOf(PKG) === 0);
}
// The next billing date of the active items, ISO, or '' when there is none.
function nextBilling(items) {
  const d = (items || []).filter((x) => isActive(x) && x.Date_NextBilling)
    .map((x) => Date.parse(x.Date_NextBilling)).filter((t) => !isNaN(t));
  return d.length ? new Date(Math.min.apply(null, d)).toISOString() : '';
}

/*
  The missing-order clock. Returns { missingSince, bad }: bad after MISSING_MS with no active package order.
*/
function missingStep(missingSince, hasOrder, now) {
  const t = now == null ? Date.now() : now;
  if (hasOrder) return { missingSince: undefined, bad: false };
  const since = missingSince || new Date(t).toISOString();
  return { missingSince: since, bad: t - Date.parse(since) >= MISSING_MS };
}

/*
  One step of the failure state. prev: { firstFailAt, okSince, suspendedAt } or {}. bad: the charge failed now.
  A failure is told once, on the first of a run. The grace is counted from firstFailAt and survives flapping: a good
  run only starts the two-day clock (okSince); a failure inside it keeps the original firstFailAt and tells nothing.
*/
function step(prev, bad, now) {
  const t = now == null ? Date.now() : now;
  const p = prev || {};
  if (!bad) {
    if (!p.firstFailAt) return { next: {}, tellCustomer: false, tellItzik: false, suspend: false, resume: false };
    const okSince = p.okSince || new Date(t).toISOString();
    if (t - Date.parse(okSince) >= OK_MS) return { next: {}, tellCustomer: false, tellItzik: false, suspend: false, resume: !!p.suspendedAt };
    return { next: Object.assign({}, p, { okSince }), tellCustomer: false, tellItzik: false, suspend: false, resume: false };
  }
  const base = Object.assign({}, p);
  delete base.okSince;
  if (!base.firstFailAt) {
    return { next: { firstFailAt: new Date(t).toISOString() }, tellCustomer: true, tellItzik: true, suspend: false, resume: false };
  }
  const since = t - Date.parse(base.firstFailAt);
  if (!base.suspendedAt && since >= GRACE_MS) {
    return { next: Object.assign({}, base, { suspendedAt: new Date(t).toISOString() }), tellCustomer: false, tellItzik: false, suspend: true, resume: false };
  }
  return { next: base, tellCustomer: false, tellItzik: false, suspend: false, resume: false };
}

// The summary goes 1 to 2 days before the renewal date.
function summaryDue(nextIso, now) {
  const t = Date.parse(nextIso), n = now == null ? Date.now() : now;
  if (isNaN(t)) return false;
  const diff = t - n;
  return diff >= DAY && diff <= 2 * DAY;
}
// YYYY-MM of an ISO moment in Israel time (the summary's once-a-month key).
function monthKey(iso) { return P.ilDate(Date.parse(iso)).slice(0, 7); }

// The customer's counts for a month: summaries (usage lines of kind meeting), quotes sent and signed (csign records),
// bookings of the month that are not cancelled (lib/bookings.js readItems).
function countsFrom(o) {
  const m = o.month;
  const inMonth = (at) => !!at && P.ilDate(Date.parse(at)).slice(0, 7) === m;
  let summaries = 0;
  String(o.usageText || '').split('\n').forEach((l) => {
    if (!l) return;
    try { const u = JSON.parse(l); if (u.kind === 'meeting' && inMonth(u.at)) summaries++; } catch (e) { /* a bad line is skipped */ }
  });
  const recs = o.csignRecs || [];
  return {
    summaries,
    quotes: recs.filter((r) => inMonth(r.at)).length,
    signed: recs.filter((r) => inMonth(r.at) && r.state && r.state.signedAt).length,
    bookings: (o.items || []).filter((i) => inMonth(i.start) && i.status !== 'cancelled').length,
  };
}

// The texts the customer reads. Payment is arranged with Itzik (there is no pay button on a paid package yet).
function failText(price, url) {
  return 'החיוב החודשי של המוניטור לא עבר. לתשלום של ' + price + ' ₪ לחודש + מע״מ, לחצו כאן: ' + (url || '') + ' . '
    + 'המוניטור ממשיך לעבוד כרגיל עד 7 ימים מהחיוב שלא עבר.';
}
// 21.11.2026: the stop text carries the link (the 📦 sheet has the same button).
function stopText(price, url) { return P.suspendedLine(price) + (url ? ' לתשלום: ' + url : ''); }
function summaryText(c) {
  return 'מה המשרד עשה בשבילך החודש:\n'
    + '• פעולות: ' + c.used + ' מתוך ' + c.total + '\n'
    + '• סיכומי פגישות: ' + c.summaries + '\n'
    + '• הצעות מחיר שנשלחו: ' + c.quotes + ', מהן נחתמו: ' + c.signed + '\n'
    + '• תורים שנקבעו: ' + (c.bookings || 0) + '\n'
    + 'החיוב הבא, ' + c.price + ' ₪ לחודש + מע״מ, יורד ב' + (c.billDate ? ' ' + c.billDate : ' בקרוב') + '.';
}

// The signing records of a customer (data/csign/<token>.json, the count folder is skipped).
function readCsign(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /^[a-f0-9]{24}\.json$/.test(f)); } catch (e) { return []; }
  return names.map((f) => readJson(path.join(dir, f), null)).filter(Boolean);
}

/*
  The daily run. plans: { tenant: planState } from the plan files. Returns one report line per tenant.
  deps: DATA, now, plans, customerIdOf(tenant), listRecurring(customerId) -> items (inactive included),
        tenantDir(tenant), tellChat(dir, text), tellItzik(tenant, text, key), writePlan(tenant, state),
        readPlan(tenant) -> the plan file right now (optional; defaults to the plans given).
*/
// 21.11.2026 (third review): a payment recorded after this run started (the plan's paid history, or a pay record) wins.
function paidAfter(DATA, tenant, since, fresh) {
  if (fresh && (fresh.history || []).some((h) => h && h.kind === 'paid' && Date.parse(h.at) >= since)) return true;
  let names = [];
  try { names = fs.readdirSync(path.join(DATA, 'pay')).filter((f) => /^\d+\.json$/.test(f)); } catch (e) { return false; }
  return names.some((f) => { const r = readJson(path.join(DATA, 'pay', f), null); return !!r && r.tenant === tenant && Date.parse(r.at) >= since; });
}

async function runOnce(deps) {
  const now = deps.now == null ? Date.now() : deps.now;
  const report = [];
  for (const tenant of Object.keys(deps.plans || {})) {
    try {
      const state = deps.plans[tenant];
      // Trials and family trials are not charged; only the paid packages.
      if (!P.valid(state) || PAID.indexOf(state.plan) < 0) continue;
      const cid = deps.customerIdOf(tenant);
      if (!cid) continue;
      const dir = deps.tenantDir(tenant);
      const file = path.join(deps.DATA, 'renewal', tenant + '.json');
      const prev = readJson(file, {});
      const items = await deps.listRecurring(cid);
      const fresh0 = deps.readPlan ? deps.readPlan(tenant) : state;
      if (paidAfter(deps.DATA, tenant, now, fresh0)) { report.push({ tenant, paidDuringRun: true }); continue; }
      const miss = missingStep(prev.missingSince, hasActiveOrder(items), now);
      // 5th review (2): the failure is read against the package order recorded on the plan file (its id).
      const st = step(prev.failure, failing(items, state.packageOrder && state.packageOrder.id) || miss.bad, now);
      const next = Object.assign({}, prev, { failure: st.next });
      if (miss.missingSince) next.missingSince = miss.missingSince; else delete next.missingSince;
      const price = P.priceOf(state);
      const payUrl = deps.payUrl ? deps.payUrl(tenant) : '';
      if (st.tellCustomer) deps.tellChat(dir, failText(price, payUrl));
      const recovered = !!(prev.failure && prev.failure.firstFailAt) && !next.failure.firstFailAt;
      if (st.tellCustomer || recovered) {
        // 21.11.2026: the 📦 sheet shows the pay button while a charge is failing; recovery clears it.
        const fresh0 = deps.readPlan ? deps.readPlan(tenant) : state;
        if (P.valid(fresh0)) { const f0 = Object.assign({}, fresh0); if (st.tellCustomer) f0.failing = true; else delete f0.failing; if (recovered && !st.resume) deps.writePlan(tenant, f0); else if (st.tellCustomer) deps.writePlan(tenant, f0); }
      }
      if (st.tellItzik) deps.tellItzik(tenant, 'החיוב החודשי של ' + tenant + ' לא עבר. הלקוח קיבל הודעה עם קישור לתשלום. השירות ממשיך 7 ימים, ואחר כך הוא עומד.', 'renew-' + tenant + '-' + (st.next.firstFailAt || ''));
      // The plan is read again right before the write, so a change made in between is not lost.
      if (st.suspend || st.resume) {
        const fresh = deps.readPlan ? deps.readPlan(tenant) : state;
        if (P.valid(fresh)) {
          if (st.suspend) { deps.tellChat(dir, stopText(price, payUrl)); deps.writePlan(tenant, Object.assign({}, fresh, { suspended: true })); }
          if (st.resume) { const s2 = Object.assign({}, fresh); delete s2.suspended; delete s2.failing; deps.writePlan(tenant, s2); }
        }
      }
      const nb = nextBilling(items);
      if (nb && summaryDue(nb, now) && prev.summaryMonth !== monthKey(nb)) {
        const usageText = readText(path.join(dir, 'data', 'status', 'usage.jsonl'));
        const csignRecs = readCsign(path.join(dir, 'data', 'csign'));
        let its = [];
        try { its = require('./bookings.js').readItems(path.join(dir, 'data')); } catch (e) { its = []; }
        const c = countsFrom({ usageText, csignRecs, items: its, month: P.monthOf(now) });
        const u = P.status(state, usageText, now);
        deps.tellChat(dir, summaryText({ used: u ? u.used : 0, total: u ? u.total : P.PACKAGES[state.plan].actions, summaries: c.summaries,
          quotes: c.quotes, signed: c.signed, bookings: c.bookings, price, billDate: P.ilDate(Date.parse(nb)).split('-').reverse().join('.') }));
        next.summaryMonth = monthKey(nb);
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(next, null, 1));
      report.push({ tenant, failing: !!next.failure.firstFailAt, suspend: st.suspend, resume: st.resume });
    } catch (e) {
      report.push({ tenant, error: e.message });
    }
  }
  return report;
}

module.exports = { FAIL_STATUS, GRACE_MS, OK_MS, MISSING_MS, PAID, failing, hasActiveOrder, nextBilling, missingStep, step, summaryDue, monthKey, countsFrom,
  failText, stopText, summaryText, runOnce };
