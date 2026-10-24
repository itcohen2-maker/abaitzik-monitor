'use strict';
/*
  24.10.2026: the morning brief as a metrics page (stage 3).

  daily-brief.js (07:00) writes data/brief/brief/<YYYYMMDD>.json:
    {at, items:[{t, sub, act, actText}], kpis:[{k, v, u, state, spark}], done:true}
  plus a `week` block on Sundays. build.js hands the latest one to the page as
  D.brief (forPage). The home screen only renders it; this file only fills it.

  Everything here is plain code and never calls a model. The functions below
  are pure (they take the files already read), so tests/brief.test.js can call
  them with made up input. gather() is the only one that touches the disk.

  Visible copy is Hebrew, short, and has no dashes: noDash() strips them from
  every string that goes out, the same rule daily-brief.js applies to the report.
*/
const fs = require('fs');
const path = require('path');
const approvals = require('./approvals.js');

const TZ = 'Asia/Jerusalem';
const DAY = 24 * 3600 * 1000;
const MAX_ITEMS = 5;
// A debt counts as overdue when an open invoice behind it is older than this.
// There is no payment term in the data, so 30 days is the working guess.
const OVERDUE_DAYS = 30;
// Per category caps, so one long list (say, many debtors) cannot push the rest out.
// Order is also importance: approvals, debtors, appointments, leads, health.
const CAPS = [['approve', 3], ['debt', 2], ['appt', 3], ['lead', 2], ['health', 2]];
const KIND_HE = { send: 'שליחה', pay: 'תשלום', delete: 'מחיקה', identity: 'שינוי זהות' };
const MAIL_TAG = 'מייל:';

function noDash(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim();
}

function clip(s, n) {
  const t = noDash(s);
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// 'YYYY-MM-DD' in Israel time, the key every day comparison below uses.
function dayKey(ms) {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
}

// Whole days from b to a (a later than b gives a positive number).
function daysBetween(a, b) {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY);
}

function hhmm(ms) {
  return new Date(ms).toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

function isSunday(now) {
  return new Date(now).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' }) === 'Sun';
}

// Accepts ISO strings and the DD.MM.YYYY form the rivhit invoices use.
function parseDay(s) {
  const t = String(s || '').trim();
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(t);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return Date.UTC(y, Number(m[2]) - 1, Number(m[1]));
  }
  return Date.parse(t);
}

function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; }
}

// Every doc of one collection (data/<sub>/<sub>/*.json), broken files skipped.
// Same id rule as build.js loadDocs: the id inside the document wins.
function readAll(dataPath, sub) {
  const dir = path.join(dataPath, sub, sub);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    const doc = readJson(path.join(dir, f), null);
    if (!doc || typeof doc !== 'object') return null;
    doc.file = f.replace(/\.json$/, '');
    if (!doc.id) doc.id = doc.file;
    return doc;
  }).filter(Boolean);
}

// The pieces below, each one pure.

// Open approval cards, oldest first (the one waiting longest is the most urgent).
function openApprovals(choices, now) {
  return (choices || [])
    .filter(c => c && !c.answer)
    .map(c => (c.type === 'approve' ? approvals.normalize(c, now) : null))
    .filter(Boolean)
    .sort((a, b) => ((a.at || '') < (b.at || '') ? -1 : 1));
}

// Debtors with an open invoice older than OVERDUE_DAYS. A debt with no dated
// invoices has no overdue part, so it is left out rather than guessed.
function overdueDebtors(debts, now) {
  return (debts || [])
    .filter(d => d && d.kind === 'debt' && typeof d.amount === 'number' && d.amount > 0)
    .map(d => {
      const inv = Array.isArray(d.inv) ? d.inv : [];
      let sum = 0;
      inv.forEach(x => {
        const at = parseDay(x && x.date);
        if (isNaN(at)) return;
        if ((now - at) / DAY > OVERDUE_DAYS) sum += Number(x.amount) || 0;
      });
      return { name: noDash(d.name || ''), sum };
    })
    .filter(d => d.sum > 0 && d.name)
    .sort((a, b) => b.sum - a.sum);
}

// Appointments whose day is today (Israel), soonest first.
function todayAppts(appts, now) {
  const today = dayKey(now);
  return (appts || [])
    .map(a => ({ a, ms: Date.parse(a && a.when) }))
    .filter(x => !isNaN(x.ms) && dayKey(x.ms) === today)
    .sort((x, y) => x.ms - y.ms)
    .map(x => ({ what: noDash(x.a.what || ''), ms: x.ms, noTime: !!x.a.noTime }));
}

// Leads that came in during the last 24 hours and are not closed.
function newLeads(contacts, now) {
  return (contacts || [])
    .filter(c => c && c.status !== 'done' && !isNaN(Date.parse(c.at)) && now - Date.parse(c.at) <= DAY)
    .map(c => ({ name: noDash(c.name || ''), source: noDash(c.source || c.network || '') }))
    .filter(c => c.name);
}

// Monitors the board marks as not ok (the paused ones are not faults).
function badCards(board) {
  return ((board && board.cards) || [])
    .filter(c => c && !c.ok && !c.paused)
    .map(c => ({ title: noDash(c.title || c.id || ''), problem: noDash((c.problems && c.problems[0]) || 'לא עובד') }));
}

// Items in importance order, capped per category and then to MAX_ITEMS.
function pickItems(p) {
  const pool = {
    approve: (p.approvals || []).map(a => ({
      t: clip(a.question, 80),
      sub: KIND_HE[a.kind] || 'לאישור',
    })),
    debt: (p.debtors || []).map(d => ({
      t: d.name + ' חוב ישן ' + money(d.sum),
      sub: 'חוב מעל ' + OVERDUE_DAYS + ' יום',
      act: 'תכין תזכורת תשלום ללקוח ' + d.name,
      actText: 'תזכורת תשלום',
    })),
    appt: (p.appts || []).map(x => ({
      t: clip(x.what, 80),
      sub: x.noTime ? 'היום, בלי שעה' : 'היום בשעה ' + hhmm(x.ms),
    })),
    lead: (p.leads || []).map(l => ({
      t: 'ליד חדש: ' + l.name,
      sub: l.source || 'ליד',
      act: 'תציג לי את פרטי הליד ' + l.name,
      actText: 'פרטי הליד',
    })),
    health: (p.health || []).map(h => ({
      t: 'תקלה: ' + h.title + ', ' + h.problem,
      sub: 'תקלה במוניטור',
      act: 'בדוק את התקלה ב' + h.title,
      actText: 'בדוק תקלה',
    })),
  };
  const out = [];
  CAPS.forEach(([cat, cap]) => { out.push(...(pool[cat] || []).slice(0, cap)); });
  return out.slice(0, MAX_ITEMS).map(stripEmpty);
}

function stripEmpty(item) {
  const o = { t: item.t, sub: item.sub };
  if (item.act) { o.act = noDash(item.act); o.actText = noDash(item.actText); }
  return o;
}

function money(n) {
  return '₪' + Math.round(n).toLocaleString('he-IL');
}

// His messages (not mail) with no answer yet, from the last seven days.
function waitingCount(chat, now) {
  const list = chat || [];
  const answered = new Set(list.filter(x => x.from === 'claude' && x.re).map(x => x.re));
  return list.filter(x => x.from === 'itzik' && !String(x.text || '').startsWith(MAIL_TAG)
    && now - Date.parse(x.at) <= 7 * DAY && !answered.has(x.id)).length;
}

function answersToday(chat, now) {
  const today = dayKey(now);
  return (chat || []).filter(x => x.from === 'claude' && dayKey(Date.parse(x.at)) === today).length;
}

/*
  The kpi list. `v` is the number, `k` the Hebrew label the page shows and `u`
  the unit (only money has one). Money comes from data/money/money.json and is
  skipped when that file is missing, so nothing shows a made up zero.
*/
function kpiList(inp, now, items) {
  const today = dayKey(now);
  const appts = todayAppts(inp.appts, now).length;
  const tasks = (inp.tasks || []).filter(t => t && t.day && t.day <= today).length;
  const waiting = waitingCount(inp.chat, now);
  const list = [
    { k: 'תורים היום', v: appts, u: '', state: 'ok' },
    { k: 'משימות פתוחות', v: tasks, u: '', state: tasks > 5 ? 'warn' : 'ok' },
    { k: 'מחכות לתשובה', v: waiting, u: '', state: waiting > 0 ? 'warn' : 'ok' },
    { k: 'תשובות היום', v: answersToday(inp.chat, now), u: '', state: 'ok' },
  ];
  const m = inp.money;
  if (m && typeof m.cash === 'number') list.push({ k: 'מזומן', v: m.cash, u: '₪', state: 'ok' });
  if (m && typeof m.debt === 'number') list.push({ k: 'חוב', v: m.debt, u: '₪', state: m.debt > 0 ? 'warn' : 'ok' });
  if (m && typeof m.late === 'number') list.push({ k: 'באיחור', v: m.late, u: '₪', state: m.late > 0 ? 'bad' : 'ok' });
  return list;
}

/*
  Spark: the same kpi on each of the six days before today, from the brief
  docs already written, then today's value last. A day with no doc is skipped,
  so a new install shows a short line and grows. One doc per day counts (the
  latest one, if a manual run wrote two).
*/
function withSpark(kpis, prev, now) {
  const today = dayKey(now);
  const byDay = {};
  (prev || []).forEach(d => {
    if (!d || !d.at || isNaN(Date.parse(d.at))) return;
    const day = dayKey(Date.parse(d.at));
    const back = daysBetween(today, day);
    if (back < 1 || back > 6) return;
    if (!byDay[day] || Date.parse(d.at) > Date.parse(byDay[day].at)) byDay[day] = d;
  });
  const days = Object.keys(byDay).sort();
  return kpis.map(kp => {
    const vals = [];
    days.forEach(day => {
      const hit = (byDay[day].kpis || []).find(x => x && x.k === kp.k);
      if (hit && typeof hit.v === 'number') vals.push(hit.v);
    });
    return Object.assign({}, kp, { spark: vals.concat([kp.v]) });
  });
}

/*
  The Sunday digest. Seven days back from now, plain counts: his messages
  that got an answer, reports written (the morning reports themselves left out,
  the same way daily-brief leaves them out of its input), and approvals asked
  and answered.
*/
function weekCounts(inp, now) {
  const from = now - 7 * DAY;
  const inWeek = ms => !isNaN(ms) && ms > from && ms <= now;
  const approve = (inp.choices || []).filter(c => c && c.type === 'approve');
  return {
    from: dayKey(from),
    to: dayKey(now),
    answered: (inp.chat || []).filter(x => x.from === 'claude' && inWeek(Date.parse(x.at))).length,
    reports: (inp.reports || []).filter(r => !/^דוח בוקר/.test(r.title || '') && inWeek(Date.parse(r.at))).length,
    approvalsAsked: approve.filter(c => inWeek(Date.parse(c.at))).length,
    approvalsAnswered: approve.filter(c => c.answer && inWeek(Date.parse(c.answeredAt || c.at))).length,
  };
}

/*
  The whole doc. `inp` holds the raw collections (see gather); the result is
  what daily-brief.js writes. Pure: the same input gives the same doc.
*/
function buildBrief(inp) {
  const now = inp.now;
  const approvalsOpen = openApprovals(inp.choices, now);
  const items = pickItems({
    approvals: approvalsOpen,
    debtors: overdueDebtors(inp.debts, now),
    appts: todayAppts(inp.appts, now),
    leads: newLeads(inp.contacts, now),
    health: badCards(inp.health),
  });
  const kpis = withSpark(kpiList(inp, now, items), inp.prev, now);
  const doc = { at: new Date(now).toISOString(), items, kpis, done: true };
  if (isSunday(now)) doc.week = weekCounts(inp, now);
  return doc;
}

/*
  Notify only on change. Returns {send, sig, why}.
  - no items, nothing to say: no notify.
  - state.day is today and count reached 1: at most one notify per day.
  - the same items as the last notify: no notify (signature = item texts).
  `state` is data/brief/notify.json: {day, count, sig}.
*/
function notifyPlan(doc, state, now) {
  const items = (doc && doc.items) || [];
  if (!items.length) return { send: false, sig: '', why: 'nothing to show' };
  const sig = items.map(i => i.t).join('|');
  const st = state || {};
  if (st.day === dayKey(now) && st.count >= 1) return { send: false, sig, why: 'already sent today' };
  if (st.sig === sig) return { send: false, sig, why: 'same as the last notify' };
  return { send: true, sig, why: 'changed' };
}

// The notify record after a send attempt (also after a failed one, so a retry
// cannot make a second message the same day).
function recordNotify(state, now, sig) {
  const day = dayKey(now);
  const st = state || {};
  const count = st.day === day ? (st.count || 0) + 1 : 1;
  return { day, count, sig };
}

/*
  build.js: the latest brief doc, only when it is dated today or yesterday
  (Israel), and only a finished one. Anything older is not shown on the home screen.
*/
function forPage(docs, now) {
  const today = dayKey(now);
  const yest = dayKey(now - DAY);
  const ok = (docs || []).filter(d => d && d.done === true && !isNaN(Date.parse(d.at))
    && (dayKey(Date.parse(d.at)) === today || dayKey(Date.parse(d.at)) === yest));
  if (!ok.length) return null;
  ok.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return ok[ok.length - 1];
}

// Reads everything buildBrief needs from data/. Missing folders give empty lists.
function gather(dataPath, now) {
  const status = path.join(dataPath, 'status');
  return {
    now,
    choices: readAll(dataPath, 'choices'),
    debts: readAll(dataPath, 'rivhit'),
    appts: readAll(dataPath, 'appts'),
    contacts: readAll(dataPath, 'contacts'),
    tasks: readAll(dataPath, 'tasks'),
    chat: readAll(dataPath, 'chat'),
    reports: readAll(dataPath, 'reports'),
    prev: readAll(dataPath, 'brief'),
    health: readJson(path.join(status, 'health-board.json'), null),
    money: readJson(path.join(dataPath, 'money', 'money.json'), null),
  };
}

module.exports = {
  MAX_ITEMS, OVERDUE_DAYS,
  dayKey, daysBetween, isSunday, noDash,
  openApprovals, overdueDebtors, todayAppts, newLeads, badCards,
  pickItems, kpiList, withSpark, weekCounts, waitingCount,
  buildBrief, notifyPlan, recordNotify, forPage, gather, readAll,
};
