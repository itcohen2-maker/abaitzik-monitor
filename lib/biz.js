'use strict';
/*
  "העסק שלי", the small business CRM.

  Added 12.10, when the business side was set against Revora, the tool Itzik
  compared it with. One record per file under dataPath/biz/biz. Everything
  here is pure: load() reads the folder, summary() takes records and a clock,
  so the rules can be tested with fixed dates. All calendar days are Israel
  days (Asia/Jerusalem), because that is the calendar Itzik lives on.
*/
const fs = require('fs');
const path = require('path');

const DAY = 24 * 3600 * 1000;
const TZ = 'Asia/Jerusalem';
const CLOSED = ['נסגר', 'אבד'];

function load(dataPath) {
  const dir = path.join(dataPath, 'biz', 'biz');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return r && typeof r === 'object' && !Array.isArray(r) ? r : null;
    } catch (e) { return null; }
  }).filter(Boolean);
}

// Israel calendar day of an instant, as YYYY-MM-DD.
function dayOf(ms) {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
}

// The day a record is due by: a date-only nextAt is already a day, a
// datetime is compared by its Israel day (same as "before end of today").
function dueDay(nextAt) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(nextAt)) return nextAt;
  const ms = Date.parse(nextAt);
  return isNaN(ms) ? null : dayOf(ms);
}

const num = v => (typeof v === 'number' && isFinite(v) ? v : (Number(v) || 0));

function summary(records, now) {
  const t = now == null ? Date.now() : Number(now);
  const list = Array.isArray(records) ? records : [];
  const today = dayOf(t);
  const month = today.slice(0, 7);
  const isOpen = r => (r.kind === 'lead' || r.kind === 'customer') && !CLOSED.includes(r.status);
  const touched = r => Date.parse(r.updatedAt || r.at);
  const ageDays = r => {
    const ms = touched(r);
    return isNaN(ms) ? null : Math.floor((t - ms) / DAY);
  };

  const open = list.filter(isOpen);
  const counts = { lead: 0, customer: 0 };
  open.forEach(r => { counts[r.kind]++; });

  // Stale: an open lead with no touch for more than 7 days.
  const staleLeads = open.filter(r => r.kind === 'lead' && (touched(r) < t - 7 * DAY || isNaN(touched(r))))
    .map(r => ({ id: r.id, name: r.name || '', days: ageDays(r) || 0, status: r.status || '' }))
    .sort((a, b) => b.days - a.days);

  // Stuck offer: status הצעה and untouched 3 days or more. Oldest first.
  const stuckOffers = open.filter(r => r.status === 'הצעה' && (isNaN(touched(r)) || touched(r) <= t - 3 * DAY))
    .map(r => ({ id: r.id, name: r.name || '', days: ageDays(r) || 0 }))
    .sort((a, b) => b.days - a.days);

  // Due: a next action whose day is today or earlier, on an open record.
  const due = open.filter(r => r.nextAt && dueDay(String(r.nextAt)) && dueDay(String(r.nextAt)) <= today)
    .map(r => ({ id: r.id, name: r.name || '', next: r.next || '', nextAt: r.nextAt }))
    .sort((a, b) => (dueDay(a.nextAt) < dueDay(b.nextAt) ? -1 : dueDay(a.nextAt) > dueDay(b.nextAt) ? 1 : 0));

  const inMonth = r => {
    const ms = Date.parse(r.at);
    return !isNaN(ms) && dayOf(ms).slice(0, 7) === month;
  };
  const monthIncome = list.filter(r => r.kind === 'income' && inMonth(r)).reduce((n, r) => n + num(r.amount), 0);
  const monthExpense = list.filter(r => r.kind === 'expense' && inMonth(r)).reduce((n, r) => n + num(r.amount), 0);

  let score = null;
  if (list.length) {
    score = Math.max(0, 100 - 8 * staleLeads.length - 12 * stuckOffers.length - 6 * due.length);
  }

  let urgent;
  if (!list.length) urgent = '';
  else if (stuckOffers.length) {
    const o = stuckOffers[0];
    urgent = o.name + ' קיבל הצעה לפני ' + o.days + ' ימים ולא חזרת אליו. להתקשר היום.';
  } else if (due.length) {
    const d = due[0];
    urgent = d.name + ': ' + d.next;
  } else if (staleLeads.length) {
    const s = staleLeads[0];
    urgent = s.name + ' מחכה ' + s.days + ' ימים בלי מגע.';
  } else urgent = 'אין משהו דחוף היום.';

  return {
    score,
    urgent,
    open: open.length,
    staleLeads,
    due: due.map(({ id, name, next, nextAt }) => ({ id, name, next, nextAt })),
    monthIncome,
    monthExpense,
    counts,
  };
}

/*
  21.10: Itzik, "שיכנסו לידים היכן אני יראה אותם", then "כן" to having them
  in העסק שלי. A message from the site's chat (api/contact.js) arrives as
  "ליד מהאתר ..." with שם, אימייל, טלפון and מקור lines and then the words.
  It becomes a lead here, status חדש. The test sends of 20.10 (phone
  0500000000, a name with בדיקה, source test-...) are not leads.
*/
function isTestLead(text) {
  return /0500000000|^שם:.*בדיקה|^מקור:\s*test/m.test(String(text || ''));
}

function leadFromSite(text, at, id) {
  const t = String(text || '');
  if (!/^\s*ליד מהאתר/.test(t) || isTestLead(t)) return null;
  const field = (k) => { const m = t.match(new RegExp('^' + k + ':\s*(.*)$', 'm')); return m ? m[1].trim() : ''; };
  const blank = (v) => (/^(לא ניתן|-)?$/.test(v) ? '' : v);
  const words = t.split('\n').slice(1).filter(l => !/^(שם|אימייל|טלפון|מקור):/.test(l)).join('\n').trim();
  const email = blank(field('אימייל'));
  const note = ['מהצ׳אט באתר', email ? 'מייל: ' + email : '', words].filter(Boolean).join('\n');
  return { id: id, kind: 'lead', name: field('שם') || 'ליד מהאתר', phone: blank(field('טלפון')),
    status: 'חדש', amount: 0, note: note, next: 'לחזור אליו', nextAt: dayOf(Date.parse(at) || Date.now()),
    at: at, updatedAt: at, source: 'site' };
}

module.exports = { load, summary, isTestLead, leadFromSite };
