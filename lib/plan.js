'use strict';
/*
  4.11.2026, Itzik approved the monthly action packages: small 300 actions / 700 ILS (14.11.2026: raised to 500),
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
  small: { label: 'Small', actions: 500, price: 700 },
  medium: { label: 'Medium', actions: 1000, price: 1400 },
  large: { label: 'Large', actions: 2000, price: 2600 },
  // 21.11.2026, Itzik approved the trade packages, for customers who signed up from the trade page (/day/).
  // Prices are before VAT; the card is charged with VAT on top (lib/sumit.js VATIncluded false).
  solo: { label: 'עצמאי', actions: 60, price: 149 },
  pro: { label: 'מקצועי', actions: 150, price: 249 },
};
const ORDER = ['entry', 'small', 'medium', 'large'];
// The upgrade ladder. solo and pro are ranked on their own, so entry keeps its old list (small, medium, large).
const UPGRADE_TO = { entry: ['small', 'medium', 'large'], solo: ['pro', 'small', 'medium', 'large'], pro: ['small', 'medium', 'large'],
  small: ['medium', 'large'], medium: ['large'], large: [] };
const ADDON = { actions: 200, price: 300 };
const VAT_PCT = 18;
// 21.11.2026: a meeting summary (lib/meet-push.js) is counted as actions in solo and pro, 3 each (a proposal, see the report).
const SUMMARY_ACTIONS = 3;
const SUMMARY_PLANS = ['solo', 'pro'];
const CHAT_FREE = 1000;
// 21.11.2026, Itzik: the launch price of the trade packages runs until the end of this Israel date (YYYY-MM-DD).
// The launch line disappears from the next day. TODO(Itzik): the regular price of solo and pro after the launch is
// not decided yet; 149 and 249 stay the price until he decides. Change it here and only here.
const LAUNCH_UNTIL = '2026-12-31';
// A /day/ signup's ref (the four trade pages, lib/trades.js).
const DAY_REF = /^m-(gypsum|beauty|consult|photo)$/;
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
// 21.11.2026 (third review): free only when the message IS a tile command, short, from its first word. A tile word
// inside a long request (the word at the end of it) is an action like any other.
const FREE_RE = /^\s*(?:מצב אישי[\s.,!?:]*|(?:אפשר\s+ל)?(?:תזיז|להזיז|תסדר|לסדר|סדר|תוסיף|להוסיף|תמחק|למחוק|תעביר|להעביר|תבנה|לבנות)(?:\s+\S+)?\s+ה?(?:אריח|אריחים|כפתור|כפתורים|מסך|משימות|משימה)[\s.!?]*)$/;
const FREE_MAX = 120;
function billable(m) {
  const t = String((m && (m.text || m.body)) || '').trim();
  return !(t.length <= FREE_MAX && FREE_RE.test(t));
}

// The month's actions and list-price dollars from the text of usage.jsonl.
// 21.11.2026: solo and pro: a chat message (usage field "chat", answered without a tool) is free up to CHAT_FREE a month.
// Past that, the chat messages count as actions. chatCap is true only for those packages.
function usage(text, month, chatCap) {
  let actions = 0, usd = 0, chat = 0;
  String(text || '').split('\n').forEach((l) => {
    if (!l) return;
    let u;
    try { u = JSON.parse(l); } catch (e) { return; }
    if (!u || !u.at) return;
    // month is 'YYYY-MM', or for a trial { from, to } in ms.
    const t = Date.parse(u.at);
    if (typeof month === 'object' ? !(t >= month.from && t < month.to) : monthOf(t) !== month) return;
    const msgs = Number(u.msgs) || 0;
    const c = chatCap ? Math.min(Number(u.chat) || 0, msgs) : 0;
    chat += c;
    actions += msgs - c;
    usd += Number(u.usd) || 0;
  });
  if (chatCap) actions += Math.max(0, chat - CHAT_FREE);
  const out = { actions, usd: Math.round(usd * 100) / 100 };
  if (chatCap) out.chat = chat;
  return out;
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
    const day = isDaySource(state);
    return { plan: state.plan, label: pk.label, price: 0, month, extra: 0, total: pk.actions, used: tu.actions, pct: tpct, level: tlevel, trial: true, family: !!state.family,
      endsAt: new Date(to).toISOString(), usd: tu.usd, costLimit: 3, cheap: tu.usd >= 3, day, launch: launchLine(now),
      say: sayFor(state, tlevel, now) };
  }
  const extra = extraFor(state, month);
  const total = pk.actions + extra;
  const u = usage(usageText, month, SUMMARY_PLANS.indexOf(state.plan) > -1);
  // 21.11.2026 security review: the bridge's meter (lib/meter.js) counts too, past the free chats; the larger count wins.
  if (SUMMARY_PLANS.indexOf(state.plan) > -1 && state.meterMonth === month) {
    const over = Math.max(0, (Number(state.meterN) || 0) - CHAT_FREE);
    if (over > u.actions) u.actions = over;
  }
  const pct = total > 0 ? Math.min(100, Math.floor(u.actions / total * 100)) : 100;
  const level = u.actions >= total ? 'full' : (u.actions >= total * WARN_PCT / 100 ? 'warn' : 'ok');
  const price = priceOf(state);
  const costLimit = COST_SHARE * price / USD_RATE;
  // 21.11.2026: at 80% the next package is offered once a month (warnedMonth, kept by plan-io statusWith).
  const nextUp = (UPGRADE_TO[state.plan] || [])[0];
  const warnLine = level === 'warn' && nextUp && state.warnedMonth !== month ? warnUpgradeLine(nextUp) : '';
  // 21.11.2026: a failed monthly charge past its 7 days (lib/renewal.js sets suspended) reads as the trial's end.
  const stopped = !!state.suspended;
  return { plan: state.plan, label: pk.label, price, month, extra, total, used: u.actions, pct, level: stopped ? 'ended' : level,
    usd: u.usd, costLimit: Math.round(costLimit * 100) / 100, cheap: u.usd >= costLimit, day: isDaySource(state), launch: launchLine(now),
    warnLine, warnMark: warnLine ? month : '', say: stopped ? suspendedLine(price) : '', payRenew: !!(stopped || state.failing) };
}

// What the customer's page may see: actions only, never dollars. say: the line for his current level (sayFor).
// warnLine: the once-a-month offer at 80% (empty after it was shown this month).
function view(st) {
  if (!st) return null;
  return { label: st.label, plan: st.plan, total: st.total, used: st.used, pct: st.pct, level: st.level, extra: st.extra, trial: !!st.trial, family: !!st.family, endsAt: st.endsAt || '',
    day: !!st.day, launch: st.launch || '', say: st.say || '', warnLine: st.warnLine || '', payRenew: !!st.payRenew };
}
// The stop text after 7 days of a failed monthly charge (lib/renewal.js). The price is shown with + מע״מ.
function suspendedLine(price) {
  return 'החיוב החודשי לא עבר, והמוניטור עומד מאז שבעה ימים. להמשך, לחצו על הכפתור למטה ושלמו ' + price + ' ₪ לחודש + מע״מ. ההודעות שלך נשמרו.';
}
// 21.11.2026: the 80% line, the next package with its monthly price before VAT, shown with + מע״מ.
function warnUpgradeLine(k) {
  return 'השתמשת ב 80% מהחבילה החודשית. אפשר לעבור לחבילת ' + PACKAGES[k].label + ' ב ' + PACKAGES[k].price + ' ₪ לחודש + מע״מ.';
}

/*
  21.11.2026: the price a customer joined at, kept on his plan file (price, set by applyDayPayment). A later change of
  PACKAGES never touches him. Customers from before that have no price and read the package list.
*/
function priceOf(state) {
  const p = Number(state && state.price);
  return p > 0 ? p : (state && PACKAGES[state.plan] ? PACKAGES[state.plan].price : 0);
}
// VAT is added on top of the price before VAT: 149 is 175.82, 249 is 293.82.
function withVat(n) { return Math.round(Number(n) * (100 + VAT_PCT)) / 100; }
// The Israel date of a moment, YYYY-MM-DD.
function ilDate(now) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(now == null ? Date.now() : now)); }
// The launch price holds on the last day of LAUNCH_UNTIL (Israel time) and not after it.
function launchOn(now) { return ilDate(now) <= LAUNCH_UNTIL; }
function launchLine(now) {
  return launchOn(now) ? 'מחיר השקה למצטרפים עד ' + LAUNCH_UNTIL.split('-').reverse().join('.') + ', והוא נשאר שלך כל עוד המנוי פעיל.' : '';
}
// A trade signup: the /day/ ref of one of the four trades, or a trade set on the monitor. A family trial never is.
// 21.11.2026 security review: only the server's own token decides (signup src, written to the plan file at provisioning).
// A ref typed in the URL and a trade chosen in the questions never do: a client can type them.
function isDaySource(st) {
  if (!st || st.family) return false;
  return st.source === 'day';
}
// The day texts of the trial, the launch line only before its deadline.
/*
  21.11.2026 security review: the price is decided here, on the server, by the date (Israel time). launch until
  LAUNCH_UNTIL, regular from the next day. The regular price is not decided yet (Itzik): TODO, the same 149 and 249 until
  he decides, in this one table. The order (lib/pay-day.js), the texts and the stored plan price all read it.
*/
const PRICE_TABLE = { launch: { solo: 149, pro: 249 }, regular: { solo: 149, pro: 249 } }; // TODO(Itzik): regular prices after the launch
function priceFor(plan, now, table) {
  const t = table || PRICE_TABLE;
  return launchOn(now) ? t.launch[plan] : t.regular[plan];
}
// The trial's day texts for a trade customer, with the price the date says (never a constant in the text).
function dayTexts(now, table) {
  const L = launchLine(now), tail = L ? ' ' + L : '';
  const solo = priceFor('solo', now, table), pro = priceFor('pro', now, table);
  return {
    trialWarn: 'נשארו לך מעט פעולות בשבוע הניסיון. כדי להמשיך בלי הפסקה, אפשר כבר עכשיו לבחור חבילה: עצמאי ב ' + solo + ' ₪ לחודש + מע״מ, או מקצועי ב ' + pro + ' ₪ לחודש + מע״מ.' + tail,
    trialEnd: 'שבוע הניסיון הסתיים. ההודעות שלך נשמרו. כדי להמשיך: חבילת עצמאי ב ' + solo + ' ₪ לחודש + מע״מ, או חבילת מקצועי ב ' + pro + ' ₪ לחודש + מע״מ.' + tail
      + ' שני הכפתורים מחכים לך באריח 📦 החבילה החודשית.',
  };
}
/*
  A paid entry (390, or an offer's package) writes the plan and its price in the same step, clears a stop
  (suspended after a failed charge) and the trial's start. An unknown plan changes nothing.
*/
function applyEntryPayment(state, plan, paymentId, now) {
  if (!PACKAGES[plan] || PACKAGES[plan].trial || !state) return state;
  // 3rd review: a paid customer (solo, pro, or any package) is never moved down to entry by an entry payment.
  const paid = state.plan && state.plan !== 'trial' && PACKAGES[state.plan] && state.plan !== 'entry';
  if (plan === 'entry' && paid) plan = state.plan;
  const t = now == null ? Date.now() : now;
  const next = Object.assign({}, state, { plan, price: plan === state.plan && state.price ? state.price : PACKAGES[plan].price, month: monthOf(t), extra: 0,
    applied: (state.applied || []).concat(['pay-' + paymentId]).slice(-100),
    history: (state.history || []).concat([{ at: new Date(t).toISOString(), kind: 'paid', plan, price: PACKAGES[plan].price, paymentId: Number(paymentId) }]).slice(-60) });
  delete next.start;
  delete next.suspended;
  return next;
}
// The line for a level of the trial: the day texts for a trade signup, the 390 texts for everyone else (unchanged).
function sayFor(st, level, now) {
  const day = isDaySource(st);
  if (level === 'ended') return day ? dayTexts(now).trialEnd : SAY.trialEnd;
  if (level === 'warn') return day ? dayTexts(now).trialWarn : SAY.trialWarn;
  return '';
}
// A trade customer paid his package (lib/sumit.js charge, wa-bridge /api/pay/done): the plan, the price he joined at,
// a new month with its actions. The same payment id changes nothing.
function applyDayPayment(state, order, paymentId, now) {
  if (!valid(state) || !order || !PACKAGES[order.plan] || PACKAGES[order.plan].trial) return state;
  const id = 'pay-' + paymentId;
  if ((state.applied || []).indexOf(id) > -1) return state;
  const t = now == null ? Date.now() : now;
  const next = Object.assign({}, state, { plan: order.plan, price: Number(order.price), month: monthOf(t), extra: 0,
    applied: (state.applied || []).concat([id]).slice(-100),
    history: (state.history || []).concat([{ at: new Date(t).toISOString(), kind: 'paid', plan: order.plan, price: Number(order.price), paymentId: Number(paymentId) }]).slice(-60) });
  delete next.start;
  return next;
}

function money(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
// The difference to pay now: the target's price less what the customer pays today (fromPrice, default his package).
function upgradeDiff(from, to, fromPrice) {
  if (!PACKAGES[from] || !PACKAGES[to]) return 0;
  const was = fromPrice == null ? PACKAGES[from].price : Number(fromPrice);
  return PACKAGES[to].price - was;
}
function canUpgrade(from, to) { return (UPGRADE_TO[from] || []).indexOf(to) > -1; }
// The upgrade options above the current package (the plan name only, the price as in PACKAGES).
function upgradesFrom(from) {
  return (UPGRADE_TO[from] || []).map((k) => ({ plan: k, label: PACKAGES[k].label, diff: upgradeDiff(from, k) }));
}
// The same options for one customer: the difference from the price he joined at (grandfathered).
function upgradeOptions(state) {
  if (!valid(state)) return [];
  return (UPGRADE_TO[state.plan] || []).map((k) => ({ plan: k, label: PACKAGES[k].label, price: PACKAGES[k].price,
    diff: upgradeDiff(state.plan, k, priceOf(state)) }));
}

// The two request texts the customer's page files. Itzik approves only after the payment arrived.
function upgradeText(from, to, fromPrice) {
  return 'שדרוג חבילה ל ' + PACKAGES[to].label + ', תשלום ההפרש מראש: ' + money(upgradeDiff(from, to, fromPrice)) + ' ₪. לאשר רק אחרי שהתשלום הגיע.';
}
function addonText() {
  return 'תוספת ' + ADDON.actions + ' פעולות, ' + ADDON.price + ' ₪ מראש. לאשר רק אחרי שהתשלום הגיע.';
}

// What a request asks for, read from its text (never from a field the customer could set).
function parseRequest(text) {
  const t = String(text || '').trim();
  const up = /^שדרוג חבילה ל\s*(pro|small|medium|large)\b/i.exec(t);
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
  if (req.kind === 'upgrade' && canUpgrade(s.plan, req.to)) {
    h = { at, kind: 'upgrade', id, from: s.plan, to: req.to };
    next.plan = req.to;
    // The package he moves to is at its own price from now on (the joined price belonged to the old package).
    next.price = PACKAGES[req.to].price;
  } else if (req.kind === 'addon') {
    const n = Number(req.actions) > 0 ? Number(req.actions) : ADDON.actions;
    h = { at, kind: 'addon', id, actions: n };
    next.extra = (Number(s.extra) || 0) + n;
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
  // 18.11.2026, Itzik: a family trial ("family": true in the plan file) is never asked to pay and never deleted.
  trialWarnFamily: 'נשארו לך מעט פעולות בשבוע הניסיון. כדי להמשיך, פנה לאיציק או לצ׳ופי.',
  trialEndFamily: 'שבוע הניסיון הסתיים. ההודעות שלך נשמרו. כדי להמשיך, פנה לאיציק או לצ׳ופי.',
  full: 'ניצלת את כל החבילה החודשית. המוניטור ממשיך לעבוד כרגיל, וכדאי לשדרג לחבילה גדולה יותר. נדבר על זה בקרוב.',
};

// 5th review: a Sumit recurring item's status is a number (0 active, 3 failed billing, 14 pending retry, 11 grace,
// 1 cancelled, 9 finished, 13 cancelled by the customer, 12 pending first payment), or its name. Both work.
const STATUS_NAME = { Active: 0, Cancelled: 1, DisabledFailedBillingPayment: 3, FinishedExpired: 9, GracePeriod: 11,
  PendingForFirstPayment: 12, CancelledByCustomer: 13, PendingRetry: 14 };
const FAIL_CODES = [3, 14, 11];
const TERMINATED = [1, 9, 13];
function statusCode(x) {
  const s = x && x.Status;
  if (typeof s === 'number') return s;
  const str = String(s == null ? '' : s).trim();
  if (/^-?\d+$/.test(str)) return Number(str);
  return Object.prototype.hasOwnProperty.call(STATUS_NAME, str) ? STATUS_NAME[str] : NaN;
}
const PKG_PREFIX = 'המוניטור העסקי, חבילת ';
function pkgName(plan) { return PKG_PREFIX + (PACKAGES[plan] ? PACKAGES[plan].label : plan); }
function isPkgItem(x) { return String((x && ((x.Item && x.Item.Name) || x.Name)) || '').indexOf(PKG_PREFIX) === 0; }
// The id of the standing order startRecurring opened (Sumit's RecurringCustomerItemIDs), or null.
function orderIdOf(res) { const ids = res && res.RecurringCustomerItemIDs; return Array.isArray(ids) && ids.length ? (Number(ids[0]) || null) : null; }

/*
  The standing order of an entry payment (wa-bridge payDone, trade). Returns { res, id, cancelled, skipped }.
  - an offer replaces the package's standing orders (cancel the non-terminated ones, then its own monthly), it never adds one;
  - a new entry customer (no paid plan) gets the default entry order (null = lib/sumit.js default);
  - a paid customer with an ACTIVE, non-failing package order keeps it (skipped, no second order);
  - a paid customer whose package order is failing (3, 14, 11) has it cancelled, and a new one opened at his price.
  opts.touch: the lock heartbeat, called between the Sumit calls.
*/
async function entryRecurring(P, customerId, prior, of, opts) {
  const touch = () => { if (opts && typeof opts.touch === 'function') opts.touch(); };
  const items = (await P.listRecurring(customerId, undefined, true)) || [];
  const pkg = items.filter(isPkgItem);
  const cancelled = [];
  const cancelAll = async (list) => { for (const x of list) { touch(); await P.cancelRecurring(customerId, x.ID); cancelled.push(x.ID); } };
  if (of) {
    await cancelAll(pkg.filter((x) => TERMINATED.indexOf(statusCode(x)) < 0));
    touch();
    const res = await P.startRecurring(customerId, undefined, undefined, of.monthly || null);
    return { res, id: orderIdOf(res), cancelled, skipped: false };
  }
  const paid = !!(prior && prior.plan && prior.plan !== 'trial' && PACKAGES[prior.plan]);
  if (!paid) {
    touch();
    const res = await P.startRecurring(customerId, undefined, undefined, null);
    return { res, id: orderIdOf(res), cancelled, skipped: false };
  }
  const failed = pkg.filter((x) => FAIL_CODES.indexOf(statusCode(x)) > -1);
  // fix6: a pending first payment (12) or an order with no readable status is not failing either: kept, never doubled.
  const healthy = pkg.filter((x) => FAIL_CODES.indexOf(statusCode(x)) < 0 && TERMINATED.indexOf(statusCode(x)) < 0);
  await cancelAll(failed);
  if (healthy.length) return { res: null, id: Number(healthy[0].ID) || null, cancelled, skipped: true };
  touch();
  const monthly = { name: pkgName(prior.plan), price: priceOf(prior), note: 'מנוי חודשי, חבילת ' + PACKAGES[prior.plan].label };
  const res = await P.startRecurring(customerId, undefined, undefined, monthly);
  return { res, id: orderIdOf(res), cancelled, skipped: false };
}

module.exports = { statusCode, isPkgItem, orderIdOf, pkgName, FAIL_CODES, TERMINATED, PKG_PREFIX, STATUS_NAME, entryRecurring, billable, FREE_RE, PACKAGES, ORDER, UPGRADE_TO, ADDON, WARN_PCT, COST_SHARE, USD_RATE, SAY, VAT_PCT, LAUNCH_UNTIL, DAY_REF, SUMMARY_ACTIONS, SUMMARY_PLANS, CHAT_FREE,
  monthOf, valid, usage, status, view, upgradeDiff, upgradesFrom, upgradeOptions, upgradeText, addonText, parseRequest, rollover, applyRequest,
  priceOf, withVat, ilDate, launchOn, launchLine, suspendedLine, priceFor, PRICE_TABLE, applyEntryPayment, isDaySource, dayTexts, sayFor, applyDayPayment, canUpgrade };
