'use strict';
/*
  4.11.2026, Itzik approved the monthly action packages: small 300 actions / 700 ILS,
  medium 1,000 / 1,400, large 2,000 / 2,600, plus an add-on of 200 actions for 300 ILS.
  Everything is paid in advance, nothing is billed after the fact.

  Pure logic: no files, no clock of its own, no network, like lib/quota-hold.js.
  An "action" is one customer message handled by a Claude session: the sum of `msgs`
  over the month's lines of data/status/usage.jsonl (the planner's line carries 0).
  The state lives in /srv/monitor-changes/<id>.plan.json, which only Itzik's
  instance writes (tenants-health.js); lib/plan-io.js does the reading and writing.
  Shape: { plan: 'medium', month: '2026-11', extra: 0, applied: ['cr..'], history: [...] }
*/

const PACKAGES = {
  // 11.11.2026: the entry package (390, no setup) and the self signup trial (40 actions for 7 days, then it stops).
  entry: { label: 'כניסה', actions: 200, price: 390 },
  trial: { label: 'ניסיון', actions: 40, price: 0, days: 7, trial: true },
  small: { label: 'Small', actions: 300, price: 700 },
  medium: { label: 'Medium', actions: 1000, price: 1400 },
  large: { label: 'Large', actions: 2000, price: 2600 },
};
const ORDER = ['entry', 'small', 'medium', 'large'];
const ADDON = { actions: 200, price: 300 };
// Itzik, 4.11: at 80% of the package the customer is told. 11.11: at 100% nothing stops, he is told to upgrade.
const WARN_PCT = 80;
// Cost guard: list price of the month at 40% of the package price (in dollars) switches to the cheaper model.
const COST_SHARE = 0.4;
const USD_RATE = 3.7;

// The Israel calendar month of a moment, 'YYYY-MM'.
function monthOf(now) {
  const t = now == null ? Date.now() : now;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(t)).slice(0, 7);
}

function valid(state) {
  if (!(state && typeof state === 'object' && PACKAGES[state.plan])) return false;
  // A trial counts from its own start, so without one there is nothing to count from.
  return !PACKAGES[state.plan].trial || !isNaN(Date.parse(state.start));
}

// An add-on bought for a month is gone with it; a package stays until it is changed.
function extraFor(state, month) {
  return state && state.month === month ? Math.max(0, Number(state.extra) || 0) : 0;
}

/*
  12.11.2026, Itzik: "כל הבנייה של האריחים והזזות, נוחיותם יותר חשובה, ואנחנו לא מחייבים על זה כפעולות".
  A message about the customer's tiles (the 🏡 personal mode requests, building, adding, moving or arranging
  a tile) is not an action. The session's cost is still logged in usage.jsonl, only msgs leaves it out.
*/
const FREE_RE = /^\s*מצב אישי|אריח|אריחים|כפתור במסך|לסדר את המסך|סידור המסך|להזיז|תזיז/;
function billable(m) { return !FREE_RE.test(String((m && (m.text || m.body)) || '')); }

// The month's actions and list-price dollars from the text of usage.jsonl.
function usage(text, month) {
  let actions = 0, usd = 0;
  String(text || '').split('\n').forEach((l) => {
    if (!l) return;
    let u;
    try { u = JSON.parse(l); } catch (e) { return; }
    if (!u || !u.at) return;
    // month is 'YYYY-MM', or for a trial { from, to } in ms.
    const t = Date.parse(u.at);
    if (typeof month === 'object' ? !(t >= month.from && t < month.to) : monthOf(t) !== month) return;
    actions += Number(u.msgs) || 0;
    usd += Number(u.usd) || 0;
  });
  return { actions, usd: Math.round(usd * 100) / 100 };
}

/*
  Where a customer stands. null where no package applies (no file, or an unknown package):
  that customer keeps the old behaviour. level: ok, warn (from 80%), full (100%).
*/
function status(state, usageText, now) {
  if (!valid(state)) return null;
  const month = monthOf(now);
  const pk = PACKAGES[state.plan];
  if (pk.trial) {
    // 11.11.2026: the trial stops at 40 actions or after 7 days (level 'ended'); the page offers to pay or to ask for an offer.
    const from = Date.parse(state.start), to = from + pk.days * 86400e3, t = now == null ? Date.now() : now;
    const tu = usage(usageText, { from, to });
    const tpct = Math.min(100, Math.floor(tu.actions / pk.actions * 100));
    const tlevel = (tu.actions >= pk.actions || t >= to) ? 'ended' : (tu.actions >= pk.actions * WARN_PCT / 100 ? 'warn' : 'ok');
    return { plan: state.plan, label: pk.label, price: 0, month, extra: 0, total: pk.actions, used: tu.actions, pct: tpct, level: tlevel, trial: true,
      endsAt: new Date(to).toISOString(), usd: tu.usd, costLimit: 3, cheap: tu.usd >= 3 };
  }
  const extra = extraFor(state, month);
  const total = pk.actions + extra;
  const u = usage(usageText, month);
  const pct = total > 0 ? Math.min(100, Math.floor(u.actions / total * 100)) : 100;
  const level = u.actions >= total ? 'full' : (u.actions >= total * WARN_PCT / 100 ? 'warn' : 'ok');
  const costLimit = COST_SHARE * pk.price / USD_RATE;
  return { plan: state.plan, label: pk.label, price: pk.price, month, extra, total, used: u.actions, pct, level,
    usd: u.usd, costLimit: Math.round(costLimit * 100) / 100, cheap: u.usd >= costLimit };
}

// What the customer's page may see: actions only, never dollars.
function view(st) {
  if (!st) return null;
  return { label: st.label, plan: st.plan, total: st.total, used: st.used, pct: st.pct, level: st.level, extra: st.extra, trial: !!st.trial, endsAt: st.endsAt || '' };
}

function money(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function upgradeDiff(from, to) {
  if (!PACKAGES[from] || !PACKAGES[to]) return 0;
  return PACKAGES[to].price - PACKAGES[from].price;
}
// The upgrade options above the current package.
function upgradesFrom(from) {
  const i = ORDER.indexOf(from);
  return i < 0 ? [] : ORDER.slice(i + 1).map((k) => ({ plan: k, label: PACKAGES[k].label, diff: upgradeDiff(from, k) }));
}

// The two request texts the customer's page files. Itzik approves only after the payment arrived.
function upgradeText(from, to) {
  return 'שדרוג חבילה ל ' + PACKAGES[to].label + ', תשלום ההפרש מראש: ' + money(upgradeDiff(from, to)) + ' ₪. לאשר רק אחרי שהתשלום הגיע.';
}
function addonText() {
  return 'תוספת ' + ADDON.actions + ' פעולות, ' + ADDON.price + ' ₪ מראש. לאשר רק אחרי שהתשלום הגיע.';
}

// What a request asks for, read from its text (never from a field the customer could set).
function parseRequest(text) {
  const t = String(text || '').trim();
  const up = /^שדרוג חבילה ל\s*(small|medium|large)\b/i.exec(t);
  if (up) return { kind: 'upgrade', to: up[1].toLowerCase() };
  if (/^תוספת\s+200\s+פעולות/.test(t)) return { kind: 'addon' };
  return null;
}

// A new month starts with no add-on; the package stays.
function rollover(state, month) {
  if (!valid(state) || state.month === month) return state;
  return Object.assign({}, state, { month, extra: 0,
    history: (state.history || []).concat([{ at: month, kind: 'month', plan: state.plan }]).slice(-60) });
}

/*
  Carries out one approved request. Idempotent: a request id is applied once.
  An upgrade only goes up; the new package starts at once for the rest of the month.
  Returns the same state when nothing changed.
*/
function applyRequest(state, req, id, now) {
  if (!valid(state) || !req || !id) return state;
  if ((state.applied || []).indexOf(id) > -1) return state;
  const month = monthOf(now);
  const s = rollover(state, month);
  const at = new Date(now == null ? Date.now() : now).toISOString();
  const next = Object.assign({}, s, { applied: (s.applied || []).concat([id]).slice(-100) });
  let h = null;
  if (req.kind === 'upgrade' && ORDER.indexOf(req.to) > ORDER.indexOf(s.plan)) {
    h = { at, kind: 'upgrade', id, from: s.plan, to: req.to };
    next.plan = req.to;
  } else if (req.kind === 'addon') {
    h = { at, kind: 'addon', id, actions: ADDON.actions };
    next.extra = (Number(s.extra) || 0) + ADDON.actions;
  } else {
    h = { at, kind: 'ignored', id, req };
  }
  next.history = (s.history || []).concat([h]).slice(-60);
  return next;
}

// The messages the customer hears. No dollars, no names, no dashes.
const SAY = {
  warn: 'השתמשת ב 80% מהחבילה החודשית. כדי שהעבודה לא תיעצר, אפשר לשדרג או להוסיף 200 פעולות, בתשלום מראש.',
  // 11.11.2026, Itzik: past the package nothing stops; the customer only hears it is time to upgrade.
  // 11.11.2026: the self signup trial. It does stop at its end (40 actions or 7 days).
  trialWarn: 'נשארו לך מעט פעולות בשבוע הניסיון. כדי להמשיך בלי הפסקה, אפשר כבר עכשיו לעבור לחבילת הכניסה ב 390 ₪ לחודש.',
  trialEnd: 'שבוע הניסיון הסתיים. ההודעות שלך נשמרו. כדי להמשיך: חבילת הכניסה ב 390 ₪ לחודש, או שנחזור אליך עם הצעה לחבילה גדולה יותר. שני הכפתורים מחכים לך באריח 📦 החבילה החודשית.',
  full: 'ניצלת את כל החבילה החודשית. המוניטור ממשיך לעבוד כרגיל, וכדאי לשדרג לחבילה גדולה יותר. נדבר על זה בקרוב.',
};

module.exports = { billable, FREE_RE, PACKAGES, ORDER, ADDON, WARN_PCT, COST_SHARE, USD_RATE, SAY,
  monthOf, valid, usage, status, view, upgradeDiff, upgradesFrom, upgradeText, addonText, parseRequest, rollover, applyRequest };
