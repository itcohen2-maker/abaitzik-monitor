'use strict';
/*
  14.11.2026, Itzik: "אותו דבר בכל התוספות שהלקוח רוצה... הוא משלם והאופציה פתוחה לו", and
  "שהכל יהיה אוטומטי ואני לא יצטרך לעשות כלום". Every add-on and every upgrade on the offer page
  (it-solution.co.il/offer) is paid on SUMIT's page and opens by itself once SUMIT confirms the payment.

  Pure logic here (no files, no network): the catalog, what an order costs, and what a confirmed
  payment changes in the plan file (/srv/monitor-changes/<id>.plan.json, lib/plan-io.js).
  wa-bridge.js /api/pay/addon opens the payment, /api/pay/addon-done/<order> checks it with SUMIT
  and applies it; setup/addon-provision.sh (root) does what needs root (the bank installer).

  Prices are before VAT (SUMIT adds it). A monthly add-on: the first month now, then a standing
  order from next month on the same card. An upgrade: the difference now, and the package's
  standing order is replaced by the new package's price from next month.
*/
const P = require('./plan.js');

const CATALOG = {
  actions: { name: '200 פעולות נוספות לחודש הנוכחי', short: '200 פעולות נוספות', price: P.ADDON.price, monthly: false },
  sign50: { name: 'חתימות דיגיטליות: 50 נוספות בחודש', short: '50 חתימות דיגיטליות נוספות', price: 49, monthly: true },
  accounting: { name: 'חיבור להנהלת חשבונות', short: 'חיבור להנהלת חשבונות', price: 99, monthly: true, ask: 'software' },
  bank: { name: 'חיבור לבנק, קריאה בלבד', short: 'חיבור לבנק', price: 149, monthly: true, ask: 'bank' },
};
const SOFTWARE = { rivhit: 'ריווחית', morning: 'חשבונית ירוקה (Morning)', icount: 'אייקאונט', hashavshevet: 'חשבשבת', other: 'תוכנה אחרת' };
const KINDS = { private: 'חשבון פרטי', business: 'חשבון עסקי' };
const PKG_PREFIX = 'המוניטור העסקי, חבילת ';

function pkgName(plan) { return PKG_PREFIX + (P.PACKAGES[plan] ? P.PACKAGES[plan].label : plan); }

/*
  What one order costs. banks: lib/bank-flow.js BANKS ({ key: { name, kinds } }), passed in so this
  file stays pure. Returns { ok, kind, items, monthly, ... } or { ok:false, why } where why is
  'plan' (no paid package), 'have', 'top', 'unknown', 'answer', 'unsupported'.
*/
function quote(state, what, answers, banks) {
  if (!P.valid(state) || P.PACKAGES[state.plan].trial) return { ok: false, why: 'plan' };
  const a = answers || {};
  const up = /^upgrade:(small|medium|large)$/.exec(String(what || ''));
  if (up) {
    const to = up[1];
    if (P.ORDER.indexOf(to) <= P.ORDER.indexOf(state.plan)) return { ok: false, why: 'top' };
    const diff = P.upgradeDiff(state.plan, to);
    return { ok: true, kind: 'upgrade', to, title: 'שדרוג לחבילת ' + P.PACKAGES[to].label,
      items: [{ name: 'שדרוג לחבילת ' + P.PACKAGES[to].label + ', ההפרש לחודש הנוכחי', price: diff }],
      monthly: { name: pkgName(to), price: P.PACKAGES[to].price, note: 'מנוי חודשי, חבילת ' + P.PACKAGES[to].label },
      replace: true };
  }
  const c = CATALOG[what];
  if (!c) return { ok: false, why: 'unknown' };
  const have = (state.addons || {})[what];
  if (c.monthly && have && have.on) return { ok: false, why: 'have' };
  const o = { ok: true, kind: what, title: c.short, items: [{ name: c.name, price: c.price }],
    monthly: c.monthly ? { name: c.name, price: c.price, note: 'תוספת חודשית: ' + c.short } : null, answers: {} };
  if (c.ask === 'software') {
    if (!SOFTWARE[a.software]) return { ok: false, why: 'answer' };
    o.answers = { software: a.software };
    o.title += ', ' + SOFTWARE[a.software];
  }
  if (c.ask === 'bank') {
    const b = (banks || {})[a.bank];
    if (!b || !KINDS[a.kind]) return { ok: false, why: 'answer' };
    // Only what the program on his computer can read today is sold; the rest is told honestly.
    if ((b.kinds || []).indexOf(a.kind) < 0) return { ok: false, why: 'unsupported', bankName: b.name, kindName: KINDS[a.kind] };
    o.answers = { bank: a.bank, kind: a.kind };
    o.title += ', ' + b.name + ', ' + KINDS[a.kind];
  }
  return o;
}

function total(order) { return (order.items || []).reduce((s, x) => s + Number(x.price || 0), 0); }

/*
  A payment SUMIT confirmed: the new plan state. Idempotent per payment id (applied list),
  so a second return from SUMIT with the same id changes nothing.
*/
function apply(state, order, paymentId, now) {
  const id = 'pay-' + paymentId;
  if (!P.valid(state) || (state.applied || []).indexOf(id) > -1) return state;
  if (order.kind === 'upgrade') return P.applyRequest(state, { kind: 'upgrade', to: order.to }, id, now);
  if (order.kind === 'actions') return P.applyRequest(state, { kind: 'addon' }, id, now);
  if (!CATALOG[order.kind]) return state;
  const at = new Date(now == null ? Date.now() : now).toISOString();
  const s = P.rollover(state, P.monthOf(now));
  const addons = Object.assign({}, s.addons || {});
  addons[order.kind] = Object.assign({ on: true, at, paymentId: Number(paymentId) }, order.answers || {});
  return Object.assign({}, s, { addons,
    applied: (s.applied || []).concat([id]).slice(-100),
    history: (s.history || []).concat([{ at, kind: 'addon-' + order.kind, id }]).slice(-60) });
}

/*
  Which standing orders to cancel on an upgrade: the package's own lines (named PKG_PREFIX...,
  or the entry package's name), never an add-on's.
*/
function packageItems(items) {
  return (items || []).filter((x) => {
    const n = String((x && (x.Item && x.Item.Name)) || (x && x.Name) || '');
    return n.indexOf(PKG_PREFIX) === 0 && (x.Status == null || !/cancel/i.test(String(x.Status)));
  });
}

// What the customer's page shows: names and prices only.
function menu(state, banks) {
  if (!P.valid(state) || P.PACKAGES[state.plan].trial) return null;
  const have = state.addons || {};
  return {
    addons: Object.keys(CATALOG).map((k) => ({ key: k, name: CATALOG[k].short, price: CATALOG[k].price, monthly: CATALOG[k].monthly,
      ask: CATALOG[k].ask || '', on: !!(have[k] && have[k].on) })),
    upgrades: P.upgradesFrom(state.plan).map((u) => ({ key: 'upgrade:' + u.plan, label: u.label, diff: u.diff, price: P.PACKAGES[u.plan].price })),
    software: SOFTWARE, kinds: KINDS,
    banks: Object.keys(banks || {}).map((k) => ({ key: k, name: banks[k].name, kinds: banks[k].kinds || [] })),
  };
}

// The line the customer reads after paying.
function doneText(order) {
  if (order.kind === 'upgrade') return 'השדרוג נכנס. מעכשיו אתה בחבילת ' + P.PACKAGES[order.to].label + ', והחיוב החודשי מתעדכן מהחודש הבא.';
  if (order.kind === 'actions') return 'נוספו 200 פעולות לחודש הזה.';
  if (order.kind === 'sign50') return 'נוספו 50 חתימות דיגיטליות בכל חודש.';
  if (order.kind === 'accounting') return 'התשלום התקבל. המוניטור מתחיל עכשיו את החיבור ל' + (SOFTWARE[order.answers.software] || 'תוכנה') + ', ויכתוב לך כאן מה לעשות.';
  if (order.kind === 'bank') return 'התשלום התקבל. בעוד דקה או שתיים יופיע כאן קישור להתקנה במחשב שלך, עם הסבר קצר.';
  return 'התשלום התקבל.';
}

module.exports = { CATALOG, SOFTWARE, KINDS, PKG_PREFIX, pkgName, quote, total, apply, packageItems, menu, doneText };
