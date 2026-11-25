'use strict';
/*
  11.11.2026, Itzik: "תקים מערכת שתסרוק ותבדוק את כל הלידים שמגיעים, כי אני לא בודק את זה.
  ותכין בתוך העסק שלי טבלה של כל הלידים ... וליד כל ליד אפשרות לתת תגובה או למחוק או לעדכן או לרשום."

  Two jobs, no model:
  1. apply(): the buttons in the leads table send "ליד [<id>]: <action>". The listener applies
     status, note and delete here. Delete moves the file to data/biz/_deleted, never erases it.
  2. addFound(): the Meta scanner (lead-scan.js) hands every new comment, message or form lead;
     one record per person (same source id or same name from the same channel updates it).
*/
const fs = require('fs');
const path = require('path');

const STAGES = ['חדש', 'בשיחה', 'הצעה', 'נסגר', 'אבד'];
const SOURCES = {
  site: 'צ׳אט באתר', 'fb-comment': 'תגובה במודעה בפייסבוק', 'ig-comment': 'תגובה במודעה באינסטגרם',
  'igc-own': 'תגובה באינסטגרם של אבא איציק', 'fbc-own': 'תגובה בפייסבוק של אבא איציק', // 16.11.2026, comment-leads.js
  messenger: 'הודעה במסנג׳ר', 'ig-dm': 'הודעה באינסטגרם', leadform: 'טופס לידים של מטא', manual: 'נרשם ידנית', aff: 'הפניה משותף', whatsapp: 'הודעה בוואטסאפ', signup: 'נרשם לשבוע ניסיון',
};

function dirOf(dataPath) { return path.join(dataPath, 'biz', 'biz'); }
function stamp(d) { return new Date(d).toISOString().replace(/\D/g, '').slice(0, 14); }

function readAll(dataPath) {
  const dir = dirOf(dataPath);
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch (e) { return []; }
  return names.map((n) => { try { return Object.assign(JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')), { _file: n }); } catch (e) { return null; } })
    .filter(Boolean);
}

function write(dataPath, r) {
  const dir = dirOf(dataPath);
  fs.mkdirSync(dir, { recursive: true });
  const file = r._file || (r.id + '.json');
  const o = Object.assign({}, r); delete o._file;
  fs.writeFileSync(path.join(dir, file), JSON.stringify(o, null, 1), 'utf8');
}

// "ליד [biz-...]: סטטוס בשיחה" | "ליד [biz-...]: הערה <text>" | "ליד [biz-...]: מחיקה"
function parse(text) {
  // The page sends "<kind line>\n<text>\n\nקוד ..." (ntfyText); the caller strips the code line.
  const m = /^\s*ליד \[([A-Za-z0-9_.-]{4,80})\]\s*:\s*(סטטוס|הערה|מחיקה|צעד|אתר|תזכורת)[ \t]*([\s\S]*)$/m.exec(String(text || ''));
  if (!m) return null;
  return { id: m[1], act: m[2], arg: m[3].trim() };
}

// 18.11.2026: a site must be an http(s) host; anything else (javascript:, markup) is rejected.
function normSite(s) {
  s = String(s || '').trim();
  if (!s || /[\s<>"'`\\]/.test(s)) return '';
  if (!/^https?:\/\//i.test(s)) { if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return ''; s = 'https://' + s; }
  if (!/^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:[0-9]+)?([/?#]|$)/i.test(s) || s.length > 300) return '';
  return s;
}
const NOTE_REMOVE = /(^|[^א-ת])(תסיר|להסיר|תמחק|למחוק|תוריד|להוריד)[^א-ת]*(אותו|אותה|אותם|את זה|מפה|מכאן|מהטבלה|מהרשימה|$)/;
const NOTE_LOST = /לא מעוניי?[ןנ]|לא רלוונטי/;
// The text of a lead's reminder on WhatsApp (lib/alarms.js sends it as is, with one ⏰).
function remText(r) { return '⏰ ' + (r.name || 'הליד') + ': ' + (r.next || 'לחזור אליו') + (r.phone ? ' · ' + r.phone : ''); }
function apply(dataPath, text, now) {
  const A = require('./alarms.js');
  const p = parse(text);
  if (!p) return null;
  const at = new Date(now || Date.now()).toISOString();
  const r = readAll(dataPath).find((x) => x.id === p.id);
  if (!r) return { ok: false, reply: 'לא מצאתי את הליד הזה, אולי כבר נמחק.' };
  const nm = r.name || 'הליד';
  if (p.act === 'מחיקה') {
    const del = path.join(dataPath, 'biz', '_deleted');
    fs.mkdirSync(del, { recursive: true });
    const o = Object.assign({}, r, { deletedAt: at }); delete o._file;
    fs.writeFileSync(path.join(del, r._file), JSON.stringify(o, null, 1), 'utf8');
    fs.unlinkSync(path.join(dirOf(dataPath), r._file));
    A.cancelLead(dataPath, r.id, now);
    return { ok: true, reply: 'מחקתי את ' + nm + ' מטבלת הלידים.' };
  }
  if (p.act === 'סטטוס') {
    if (STAGES.indexOf(p.arg) < 0) return { ok: false, reply: 'סטטוס לא מוכר: ' + p.arg };
    const shut = p.arg === 'נסגר' || p.arg === 'אבד';
    r.status = p.arg; r.updatedAt = at; if (shut) r.nextAt = ''; write(dataPath, r);
    if (shut) A.cancelLead(dataPath, r.id, now);
    return { ok: true, reply: nm + ': ' + p.arg + '.' };
  }
  if (p.act === 'צעד') {
    if (!p.arg) return { ok: false, reply: 'הצעד ריק.' };
    r.next = p.arg.slice(0, 200); r.updatedAt = at; write(dataPath, r);
    A.retextLead(dataPath, r.id, remText(r)); // the open reminder says the new step (review, 18.11)
    return { ok: true, reply: 'רשמתי צעד אצל ' + nm + '.', next: r.next };
  }
  if (p.act === 'אתר') {
    const clear = p.arg === 'ביטול' || p.arg === '';
    const site = clear ? '' : normSite(p.arg);
    if (!clear && !site) return { ok: false, reply: 'כתובת האתר לא תקינה.' };
    r.site = site; r.updatedAt = at; write(dataPath, r);
    return { ok: true, reply: clear ? 'הסרתי את האתר של ' + nm + '.' : 'רשמתי אתר אצל ' + nm + '.', site };
  }
  if (p.act === 'תזכורת') {
    if (p.arg === 'ביטול') {
      A.cancelLead(dataPath, r.id, now);
      r.nextAt = ''; r.updatedAt = at; write(dataPath, r);
      return { ok: true, reply: 'ביטלתי את התזכורת של ' + nm + '.', nextAt: '' };
    }
    const t = A.parseLocal(p.arg);
    if (isNaN(t)) return { ok: false, reply: 'פורמט התזכורת: YYYY-MM-DD HH:MM.' };
    const res = A.add(dataPath, p.arg, remText(r), now == null ? Date.now() : now, { lead: r.id });
    if (!res.ok) return { ok: false, reply: res.why === 'past' ? 'הזמן הזה כבר עבר.' : 'לא הצלחתי לקבוע את התזכורת.' };
    A.cancelLead(dataPath, r.id, now, res.alarm.id); // the previous open one is replaced
    r.nextAt = res.alarm.due; r.updatedAt = at; write(dataPath, r);
    return { ok: true, reply: 'אזכיר לך על ' + nm + ' ' + res.when + '.', nextAt: r.nextAt };
  }
  if (!p.arg) return { ok: false, reply: 'ההערה ריקה.' };
  // 15.11.2026, Itzik: "תבדוק את ההערות שאני כותב ליד הלידים, ואם למשל כתוב תסיר אותו, אז תסיר אותו."
  // A note that asks to remove the lead removes it; "לא מעוניין" closes it as lost.
  if (NOTE_REMOVE.test(p.arg)) return apply(dataPath, 'ליד [' + p.id + ']: מחיקה', now);
  if (NOTE_LOST.test(p.arg) && r.status !== 'אבד') { r.status = 'אבד'; r.nextAt = ''; A.cancelLead(dataPath, r.id, now); }
  // 18.11.2026: a note on a lead still חדש means someone already wrote about him: it is no longer new (Talia, 13.11, stayed חדש for 5 days after her note).
  else if (r.status === 'חדש') { r.status = 'בשיחה'; }
  const d = new Date(at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric' });
  r.note = (r.note ? r.note + '\n' : '') + d + ': ' + p.arg; r.updatedAt = at; write(dataPath, r);
  return { ok: true, reply: 'רשמתי אצל ' + nm + '.' };
}

/*
  f = { src: 'fb-comment'|..., key: '<meta id of the person or comment>', name, text, at, link, phone?, email? }
  Returns the record when it is new (the caller alerts once), null when known.
*/
function addFound(dataPath, f, onUpdate) { // onUpdate(lead, line): 14.11, a new message from a lead we already have
  // 12.11.2026: a lead he deleted does not come back when the scanner sees the same comment again
  if (require('./lead-delete.js').isGone(dataPath, f.key)) return null;
  const all = readAll(dataPath);
  const same = all.find((x) => (x.srcKey && x.srcKey === f.key) || (x.source === f.src && f.name && x.name === f.name));
  const at = f.at || new Date().toISOString();
  if (same) {
    const line = String(f.text || '').trim();
    if (line && String(same.last || '') !== line) {
      same.last = line; if (f.phone && !same.phone) same.phone = f.phone; same.updatedAt = new Date().toISOString(); write(dataPath, same); // 14.11: a phone sent later fills the lead
      if (typeof onUpdate === 'function') { try { onUpdate(same, line); } catch (e) { /* the alert never blocks the table */ } }
    }
    return null;
  }
  const r = {
    id: 'biz-' + stamp(at) + '-' + String(f.src).replace(/[^a-z]/g, '').slice(0, 4),
    kind: 'lead', name: f.name || 'בלי שם', phone: f.phone || '', email: f.email || '',
    status: 'חדש', amount: 0, note: '', last: String(f.text || '').trim().slice(0, 500),
    // 14.11.2026, Itzik: "תשים באריח הלידים לחזור מחר את אופירה ומי שעוד נכנס ויכנס": every new lead is due the next day.
    // 25.11.2026, Itzik: a trial signup is nobody to call back; the board brings it up a week after it signed up (lbWeek)
    next: f.src === 'signup' ? '' : 'לחזור מחר', nextAt: f.src === 'signup' ? '' : new Date(Date.parse(at) + 2 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().slice(0, 10),
    at: at, updatedAt: at, source: f.src, srcKey: f.key, link: f.link || '',
  };
  // his own phone or mail: a test (lib/own-leads.js). Until 24.11 it was created greyed; Itzik 24.11: "תתקן שליד לא יכנס"
  if (require('./own-leads.js').isOwn(dataPath, { phone: r.phone, email: r.email })) return null;
  if (all.some((x) => x.id === r.id)) r.id += '-' + Math.random().toString(16).slice(2, 6);
  write(dataPath, r);
  return r;
}

module.exports = { STAGES, SOURCES, parse, apply, normSite, addFound, readAll };
