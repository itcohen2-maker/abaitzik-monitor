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
  messenger: 'הודעה במסנג׳ר', 'ig-dm': 'הודעה באינסטגרם', leadform: 'טופס לידים של מטא', manual: 'נרשם ידנית', aff: 'הפניה משותף', whatsapp: 'הודעה בוואטסאפ',
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
  const m = /^\s*ליד \[([A-Za-z0-9_.-]{4,80})\]\s*:\s*(סטטוס|הערה|מחיקה)[ \t]*([\s\S]*)$/m.exec(String(text || ''));
  if (!m) return null;
  return { id: m[1], act: m[2], arg: m[3].trim() };
}

function apply(dataPath, text, now) {
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
    return { ok: true, reply: 'מחקתי את ' + nm + ' מטבלת הלידים.' };
  }
  if (p.act === 'סטטוס') {
    if (STAGES.indexOf(p.arg) < 0) return { ok: false, reply: 'סטטוס לא מוכר: ' + p.arg };
    r.status = p.arg; r.updatedAt = at; write(dataPath, r);
    return { ok: true, reply: nm + ': ' + p.arg + '.' };
  }
  if (!p.arg) return { ok: false, reply: 'ההערה ריקה.' };
  const d = new Date(at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric' });
  r.note = (r.note ? r.note + '\n' : '') + d + ': ' + p.arg; r.updatedAt = at; write(dataPath, r);
  return { ok: true, reply: 'רשמתי אצל ' + nm + '.' };
}

/*
  f = { src: 'fb-comment'|..., key: '<meta id of the person or comment>', name, text, at, link, phone?, email? }
  Returns the record when it is new (the caller alerts once), null when known.
*/
function addFound(dataPath, f) {
  // 12.11.2026: a lead he deleted does not come back when the scanner sees the same comment again
  if (require('./lead-delete.js').isGone(dataPath, f.key)) return null;
  const all = readAll(dataPath);
  const same = all.find((x) => (x.srcKey && x.srcKey === f.key) || (x.source === f.src && f.name && x.name === f.name));
  const at = f.at || new Date().toISOString();
  if (same) {
    const line = String(f.text || '').trim();
    if (line && String(same.last || '') !== line) {
      same.last = line; same.updatedAt = new Date().toISOString(); write(dataPath, same);
    }
    return null;
  }
  const r = {
    id: 'biz-' + stamp(at) + '-' + String(f.src).replace(/[^a-z]/g, '').slice(0, 4),
    kind: 'lead', name: f.name || 'בלי שם', phone: f.phone || '', email: f.email || '',
    status: 'חדש', amount: 0, note: '', last: String(f.text || '').trim().slice(0, 500),
    next: 'לחזור אליו', nextAt: new Date(at).toISOString().slice(0, 10),
    at: at, updatedAt: at, source: f.src, srcKey: f.key, link: f.link || '',
  };
  // his own phone or mail: a test (lib/own-leads.js), still created
  if (require('./own-leads.js').isOwn(dataPath, { phone: r.phone, email: r.email })) r.test = true;
  if (all.some((x) => x.id === r.id)) r.id += '-' + Math.random().toString(16).slice(2, 6);
  write(dataPath, r);
  return r;
}

module.exports = { STAGES, SOURCES, parse, apply, addFound, readAll };
