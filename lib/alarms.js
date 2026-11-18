'use strict';
/*
  14.11.2026, Itzik: "אם הלקוח רוצה תן לי התראה או שעון מעורר או תזכיר לי בוואטסאפ... אולי ה-AI יכול להגיד לו,
  אתה רוצה תזכורת בוואטסאפ?" One-off reminders at an exact time, delivered on WhatsApp (and as a phone push).

    data/alarms/alarms/<id>.json   { id, due (ISO), text, at, sentAt? }
    data/alarms/prefs.json         { declined: n }  two "no"s and the monitor stops offering

  Made by the monitor's own session when the owner asks ("תזכיר לי מחר ב 8 ...") or says yes to its offer:
    node wa-alarm.js add "<YYYY-MM-DD HH:MM Israel time>" "<text>"     node wa-alarm.js declined     node wa-alarm.js list
  Fired by worker.js every minute (tick), code only, no model, no quota. Delivery:
    a customer: a chat record "<stamp>-claude-push.json" with waPush (wa-bridge.js waPushSweep sends it to his
                WhatsApp: text inside 24 hours, otherwise the approved template) and a phone push;
    Itzik:      lib/wa-out.js sendOwner and a phone push.
  A time missed by less than 6 hours (server down) still goes out, with "באיחור"; older ones are marked missed.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TZ = 'Asia/Jerusalem';
const LATE_MS = 6 * 3600e3;
const MAX_OPEN = 200;

function dirOf(dataPath) { return path.join(dataPath, 'alarms', 'alarms'); }
function rj(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function wj(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(f + '.tmp', f); }

// "2026-11-16 08:00" in Israel time -> epoch ms (the server clock is UTC; the offset is found for that very day).
function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return NaN;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  for (const off of [2, 3]) {
    const t = asUtc - off * 3600e3;
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
    if (h === +m[4]) return t;
  }
  return asUtc - 2 * 3600e3;
}
function when(ms) {
  return new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

function list(dataPath) {
  let fl = []; try { fl = fs.readdirSync(dirOf(dataPath)).filter((f) => f.endsWith('.json')); } catch (e) { return []; }
  return fl.map((f) => rj(path.join(dirOf(dataPath), f), null)).filter(Boolean).sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
}
// 18.11.2026 (review): open = still to go out. A cancelled or done one never counts, or 200 replaced lead
// reminders would fill every slot and refuse even a plain "תזכיר לי".
function isOpen(a) { return !!a && !a.sentAt && !a.missed && !a.cancelledAt && !a.doneAt; }
function leadFile(dataPath, lead) { return path.join(dataPath, 'biz', 'biz', String(lead).replace(/[^A-Za-z0-9_.-]/g, '') + '.json'); }
function add(dataPath, local, text, now, extra) {
  const t = parseLocal(local), n = now == null ? Date.now() : now;
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (isNaN(t)) return { ok: false, why: 'time' };
  if (t < n - 60e3) return { ok: false, why: 'past' };
  if (t > n + 400 * 86400e3) return { ok: false, why: 'far' };
  if (!text) return { ok: false, why: 'text' };
  if (list(dataPath).filter(isOpen).length >= MAX_OPEN) return { ok: false, why: 'many' };
  const id = 'a' + n.toString(36) + crypto.randomBytes(2).toString('hex');
  const a = { id, due: new Date(t).toISOString(), text, at: new Date(n).toISOString() };
  if (extra && extra.lead) a.lead = String(extra.lead); // 18.11.2026: a reminder tied to a lead (lib/leads.js)
  wj(path.join(dirOf(dataPath), id + '.json'), a);
  return { ok: true, alarm: a, when: when(t) };
}
// 18.11.2026: marks every open reminder of a lead as cancelled (closed, lost, deleted, or replaced). Returns how many.
function cancelLead(dataPath, leadId, now, exceptId) {
  const n = now == null ? Date.now() : now; let c = 0;
  list(dataPath).forEach((a) => {
    if (a.lead !== leadId || a.id === exceptId || !isOpen(a)) return;
    a.cancelledAt = new Date(n).toISOString(); wj(path.join(dirOf(dataPath), a.id + '.json'), a); c++;
  });
  return c;
}
// 18.11.2026 (review): the next step of a lead changed, so its open reminder says the new one. Returns how many.
function retextLead(dataPath, leadId, text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300); let c = 0;
  if (!text) return 0;
  list(dataPath).forEach((a) => {
    if (a.lead !== leadId || !isOpen(a) || a.text === text) return;
    a.text = text; wj(path.join(dirOf(dataPath), a.id + '.json'), a); c++;
  });
  return c;
}
function declined(dataPath) {
  const f = path.join(dataPath, 'alarms', 'prefs.json'), p = rj(f, {}) || {};
  p.declined = (Number(p.declined) || 0) + 1; p.lastNo = new Date().toISOString(); wj(f, p); return p.declined;
}
function offerOk(dataPath) { return (Number((rj(path.join(dataPath, 'alarms', 'prefs.json'), {}) || {}).declined) || 0) < 2; }

/*
  hooks: { wa(text) -> Promise, push(title, body) }. Returns the ids that went out. Each one is marked before it is
  sent, so two overlapping minutes never send it twice.
*/
function tick(dataPath, now, hooks) {
  const n = now == null ? Date.now() : now, out = [];
  list(dataPath).forEach((a) => {
    if (a.sentAt || a.missed || a.cancelledAt) return;
    const f = path.join(dirOf(dataPath), a.id + '.json');
    // 18.11.2026: a reminder of a lead that was deleted (file no longer in data/biz/biz) is not sent, and is marked
    // cancelled so it stops holding an open slot (review, 18.11)
    if (a.lead && !fs.existsSync(leadFile(dataPath, a.lead))) { if (!a.doneAt) { a.cancelledAt = new Date(n).toISOString(); wj(f, a); } return; }
    const t = Date.parse(a.due);
    if (isNaN(t) || t > n) return;
    if (n - t > LATE_MS) { a.missed = new Date(n).toISOString(); wj(f, a); return; }
    a.sentAt = new Date(n).toISOString(); wj(f, a);
    const late = n - t > 15 * 60e3;
    // 18.11.2026 (review): a lead reminder already reads "⏰ <name>: <next> · <phone>" (lib/leads.js), so it goes out as is
    const msg = a.lead ? a.text + (late ? ' (באיחור)' : '') : '⏰ תזכורת' + (late ? ' (באיחור)' : '') + ': ' + a.text;
    try { hooks.push('⏰ תזכורת', a.lead ? a.text.replace(/^⏰\s*/, '') : a.text); } catch (e) {}
    try { Promise.resolve(hooks.wa(msg, a.id)).catch(() => {}); } catch (e) {}
    out.push(a.id);
  });
  return out;
}

/*
  14.11.2026, Itzik: "כן לבנות טופל". The three buttons under a reminder on WhatsApp: done, in an hour, tomorrow
  morning (09:00). A tap is also his answer, so it opens Meta's 24 hour window. Returns { ok, say } for the reply.
*/
function act(dataPath, id, action, now) {
  const n = now == null ? Date.now() : now;
  const f = path.join(dirOf(dataPath), String(id) + '.json');
  const a = /^a[a-z0-9]{6,20}$/.test(String(id)) ? rj(f, null) : null;
  if (!a) return { ok: false, say: 'התזכורת הזו כבר לא קיימת.' };
  if (action === 'done') { a.doneAt = new Date(n).toISOString(); wj(f, a); return { ok: true, say: '✅ סומן כטופל.' }; }
  let t;
  if (action === '1h') t = n + 3600e3;
  else if (action === 'tom') {
    const d = new Date(n + 86400e3);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
    t = parseLocal(day + ' 09:00');
  } else return { ok: false, say: '' };
  const id2 = 'a' + n.toString(36) + crypto.randomBytes(2).toString('hex');
  wj(path.join(dirOf(dataPath), id2 + '.json'), Object.assign({ id: id2, due: new Date(t).toISOString(), text: a.text, at: new Date(n).toISOString(), from: a.id }, a.lead ? { lead: a.lead } : {}));
  a.snoozedAt = new Date(n).toISOString(); wj(f, a);
  // 18.11.2026 (review): a lead's reminder moved from WhatsApp moves the lead's nextAt too (the board shows it).
  // Written here directly (lib/leads.js requires this file), and only when the lead is still in the table and open.
  if (a.lead) {
    const lf = leadFile(dataPath, a.lead), r = rj(lf, null);
    if (r && typeof r === 'object' && r.status !== 'נסגר' && r.status !== 'אבד') { r.nextAt = new Date(t).toISOString(); r.updatedAt = new Date(n).toISOString(); try { fs.writeFileSync(lf, JSON.stringify(r, null, 1), 'utf8'); } catch (e) {} }
  }
  return { ok: true, say: '⏰ אזכיר שוב ' + when(t) + '.', id: id2 };
}

// The lines a worker session is told (worker.js), for every monitor.
function promptLines(dataPath) {
  return [
    'תזכורות בוואטסאפ (lib/alarms.js): כשהבעלים מבקש "תזכיר לי" עם זמן, קובעים מיד: node wa-alarm.js add "YYYY-MM-DD HH:MM" "<מה להזכיר, משפט קצר>"',
    '  (שעון ישראל), ועונים במשפט אחד מתי זה יגיע. התזכורת יוצאת בוואטסאפ ובהתראה לטלפון, בלי מודל.',
    '  חישוב הזמן מהשעה של עכשיו בישראל: "בעוד שעתיים" = בדיוק שעתיים מעכשיו. בלי שעה ("מחר", "בעוד יומיים", "ביום שלישי") = 09:00 באותו יום,',
    '  ובתשובה אומרים "ב 09:00, אם תרצה שעה אחרת תגיד". "לפני הפגישה" = שעה לפני. זמן לא ברור: שואלים שאלה אחת ולא מנחשים.',
    offerOk(dataPath)
      ? '  כשבהודעה שלו יש אירוע או משימה עם תאריך או שעה בעתיד (פגישה, תשלום, שיחה), ולא ביקש תזכורת: בסוף התשובה שורה אחת בלבד: "⏰ רוצה שאזכיר לך בוואטסאפ? (שעה לפני / בבוקר של היום)". פעם אחת לכל נושא. "כן" בשרשור: קובעים. "לא": node wa-alarm.js declined.'
      : '  הוא סירב פעמיים להצעת תזכורת: לא מציעים יותר, קובעים רק כשהוא מבקש.',
    '',
  ];
}

module.exports = { parseLocal, when, list, isOpen, add, cancelLead, retextLead, declined, offerOk, tick, act, promptLines, LATE_MS };
