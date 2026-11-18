'use strict';
/*
  14.11.2026, Itzik: "עכשיו כבר אין לנו בעיות לתפוס לידים, כמובן שגם בדוחות וסריקה בבוקר של הרשתות
  אני מצפה שאם יש ליד לספר לי". One list of the IT Solution leads that still need him, used by the
  morning brief (daily-brief.js) and by the morning network scan (net-daily.js, through ssh).
  A lead is listed when it is not closed and: it is new, it is due today or tomorrow, or it wrote in the
  last 24 hours. Each line: name, where from, the day and hour it came in, what it wrote, phone, what next.
  Code only, no model. CLI: node lib/leads-open.js   prints the lines (or "אין לידים פתוחים").
*/
const L = require('./leads.js');
const TZ = 'Asia/Jerusalem';
const DAY = 24 * 3600 * 1000;

function ilDay(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }); }
// 18.11.2026 (review): a full ISO nextAt is due on its Israel day (00:30 Israel is still the UTC day before);
// a date only one is already a day.
function dueDay(v) { v = String(v || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const ms = Date.parse(v); return isNaN(ms) ? v.slice(0, 10) : ilDay(ms); }
function when(iso) {
  const ms = Date.parse(iso); if (isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' }) + ' בשעה '
    + new Date(ms).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

// 15.11.2026, Itzik: "וואטסאפ בדו"ח של הלידים". A wa.me link opens the chat with that lead.
function waLink(phone) {
  let d = String(phone || '').replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.charAt(0) === '0') d = '972' + d.slice(1);
  return ' · וואטסאפ https://wa.me/' + d;
}

function open(dataPath, now) {
  // 18.11.2026: a customer with leadsOff (lib/features.js) hears nothing about leads in the brief or the scan.
  try { if (require('./features.js').leadsOff(dataPath)) return []; } catch (e) { /* as before */ }
  now = now || Date.now();
  const today = ilDay(now), tmr = ilDay(now + DAY);
  return L.readAll(dataPath)
    .filter((r) => r && r.kind === 'lead' && !r.test && r.status !== 'נסגר' && r.status !== 'אבד')
    .filter((r) => r.status === 'חדש' || (r.nextAt && dueDay(r.nextAt) <= tmr)
      || (r.updatedAt && now - Date.parse(r.updatedAt) <= DAY))
    .sort((a, b) => String(b.updatedAt || b.at).localeCompare(String(a.updatedAt || a.at)))
    .map((r) => ({
      r,
      line: (r.name || 'בלי שם') + ' (' + (L.SOURCES[r.source] || r.source || 'ליד') + ', הגיע ' + when(r.at) + ')'
        + (r.last ? ': "' + String(r.last).slice(0, 120) + '"' : '')
        + (r.phone ? ', טלפון ' + r.phone + waLink(r.phone) : '')
        + ' · ' + (r.status || '') + (r.next ? ', ' + r.next + (r.nextAt && !/מחר|היום/.test(r.next) ? (dueDay(r.nextAt) === today ? ' היום' : dueDay(r.nextAt) === tmr ? ' מחר' : ' ' + (/^\d{4}-\d{2}-\d{2}$/.test(String(r.nextAt)) ? r.nextAt : when(r.nextAt))) : '') : ''),
    }));
}

function lines(dataPath, now) { return open(dataPath, now).map((x) => x.line); }

module.exports = { open, lines };

if (require.main === module) {
  const dp = require('./instance.js').dataPath;
  const out = lines(dp);
  console.log(out.length ? out.map((l, i) => (i + 1) + '. ' + l).join('\n') : 'אין לידים פתוחים');
}
