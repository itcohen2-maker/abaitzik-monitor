'use strict';
/*
  13.11.2026, Itzik: "המנהל צריך לעבור על המיילים שמגיעים ולטפל בהם בכל מה שנוגע לתקלות במוניטורים".
  The button checker, the guard, the listener and the posting scripts all report faults by mail
  (notify.js, info@it-solution.co.il), and a customer may write about one too. Until now nobody
  acted on those mails; the manager only summed them up.

  Every 15 minutes (cron, 07 to 22 Israel time) this reads the last day of his inbox, read only
  (tools/mail-search.py, EXAMINE), picks the mails about a monitor fault, and sends each new one
  to the PC queue as a fix order (pc-task.js, full Claude with memory). The answer lands in his
  chat. No model here, no send to anyone, nothing in the mailbox changes.

  Limits: one order per mail (by id), the same subject once a day, 3 per run, 10 per day.
  The manager's own mails ("המנהל: ...") never count, so a fix that fails cannot feed itself.
  State: data/manager/fault-mail.json. A line per order goes to the manager card (data/manager/work).

  Usage: node fault-mail.js [--dry]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const DRY = process.argv.includes('--dry');
const STATE = path.join(inst.dataPath, 'manager', 'fault-mail.json');
const WORK_DIR = path.join(inst.dataPath, 'manager', 'work');
const LINE = /^\[(\d+)\] (\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}) \| (.*)$/;
const FAULT = /(בודק המוניטורים|השומר מצא תקלה|נשארה בלי תשובה|לא עלה|לא עובד|לא עובדת|לא נפתח|לא נשלח|נכשל|נכשלה|תקלה|שגיאה|נפל|תקוע|נתקע|בלי תגובה|אבטחה)/;
const NOT = /(הכל תקין|תקין שוב|^המנהל|צריכת טוקנים)/;
const SYSTEM = /info@it-solution\.co\.il/i;
const MAX_RUN = 3, MAX_DAY = 10;

const day = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const noDash = (s) => String(s || '').replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim();
function unb64(s) {
  const t = String(s || '').replace(/\s+/g, '');
  if (t.length < 16 || !/^[A-Za-z0-9+/=]+$/.test(t)) return String(s || '');
  try { return Buffer.from(t.slice(0, t.length - (t.length % 4)), 'base64').toString('utf8').replace(/\uFFFD/g, ''); } catch (e) { return String(s || ''); }
}

function mails() {
  const out = execFileSync('/usr/bin/python3', ['-I', path.join(__dirname, 'tools/mail-search.py'), '--days', '1', '--limit', '80'],
    { cwd: __dirname, encoding: 'utf8', timeout: 3 * 60 * 1000, stdio: ['ignore', 'pipe', 'pipe'] });
  const rows = []; let cur = null;
  out.split('\n').forEach((l) => {
    const m = l.match(LINE);
    if (m) { cur = { id: m[1], at: m[4] + '-' + m[3] + '-' + m[2] + ' ' + m[5] + ':' + m[6], from: m[7], lines: [] }; rows.push(cur); return; }
    if (cur && l.trim()) cur.lines.push(l.trim());
  });
  return rows.map((r) => ({ id: r.id, at: r.at, from: r.from, subject: r.lines[0] || '', body: unb64(r.lines.slice(1).join(' ')) }));
}

function isFault(m) {
  const s = m.subject, all = s + ' ' + m.body;
  if (NOT.test(s) || NOT.test(m.body.slice(0, 40))) return false;
  if (SYSTEM.test(m.from)) return FAULT.test(s) || (FAULT.test(m.body) && /מוניטור|אריח|כפתור|מסך/.test(m.body));
  return /מוניטור/.test(all) && FAULT.test(all); // a person writing about a fault in a monitor
}

function job(m) {
  return [
    'המנהל: הגיע מייל על תקלה במוניטור. לטפל בה עד הסוף, לבד.',
    'המייל: ' + m.at + ' · מאת ' + m.from + ' · נושא: ' + m.subject,
    'התוכן: ' + noDash(m.body).slice(0, 900),
    '',
    'מה לעשות:',
    '1. לבדוק אם התקלה אמיתית, בדף החי או בשרת (ssh -i C:\Users\User\.ssh\monitor_server root@178.105.63.97, קריאה ובדיקה).',
    '2. אמיתית: לתקן בקוד של abaitzik-monitor (main, /home/monitor/abaitzik-monitor), לא בתוך תיקייה של לקוח. npm test חייב לעבור. התיקון מגיע לכל הלקוחות לבד תוך 5 דקות.',
    '3. לא אמיתית (הבודק טעה): לתקן את הבודק או את הכפתור כך שהלחיצה מראה תגובה, כדי שהמייל לא יחזור.',
    '4. לוודא שזה עובד אחרי התיקון, לא רק בקוד.',
    'אסור: לשלם, לשלוח הודעה לאדם, לפרסם, למחוק מידע של לקוח, לשנות סיסמה או הגדרת אבטחה.',
    'התשובה: שתי שורות בעברית, מה היה ומה תוקן, או למה לא תוקן.'
  ].join('\n');
}

function card(lines) {
  const f = path.join(WORK_DIR, day().replace(/-/g, '') + '.json');
  const prev = rd(f, {}).items || [];
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), items: prev.concat(lines) }, null, 1));
}

(function main() {
  const st = rd(STATE, {});
  st.seen = st.seen || {}; st.subj = st.subj || {};
  const d = day();
  if (st.day !== d) { st.day = d; st.n = 0; st.subj = {}; }
  // the seen list keeps a week
  const cut = Date.now() - 7 * 864e5;
  Object.keys(st.seen).forEach((k) => { if (Date.parse(st.seen[k]) < cut) delete st.seen[k]; });
  let rows;
  try { rows = mails(); } catch (e) { console.log(new Date().toISOString().slice(0, 16) + ' mail read failed: ' + String(e.stderr || e.message).slice(-160)); return; }
  const todo = rows.filter((m) => !st.seen[m.id] && isFault(m));
  const lines = [];
  let sent = 0;
  for (const m of todo) {
    // the same fault once a day: subject plus the start of the body ("תקלה אצל לקוח" names a different customer each time)
    const key = noDash(m.subject + ' ' + m.body.replace(/\s+/g, ' ').slice(0, 60)).slice(0, 120);
    if (st.subj[key] || sent >= MAX_RUN || st.n >= MAX_DAY) { st.seen[m.id] = new Date().toISOString(); continue; }
    if (DRY) { console.log('DRY ' + m.id + ' ' + m.subject); continue; }
    try { m.body = execFileSync('/usr/bin/python3', ['-I', path.join(__dirname, 'tools/mail-search.py'), '--id', m.id], { cwd: __dirname, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').slice(4).join('\n').trim() || m.body; } catch (e) { /* the snippet is enough */ }
    try {
      execFileSync('node', ['pc-task.js', 'add', '--re', 'fault-mail-' + m.id, job(m)], { cwd: __dirname, stdio: 'ignore', timeout: 60000 });
      sent++; st.n++; st.subj[key] = m.id;
      lines.push({ when: new Date().toISOString(), kind: 'faultmail', text: 'מייל תקלה', status: 'mail', line: 'נשלח לתיקון: ' + noDash(m.subject) });
      console.log(new Date().toISOString().slice(0, 16) + ' fix order ' + m.id + ' ' + key);
    } catch (e) { console.log(new Date().toISOString().slice(0, 16) + ' pc-task failed ' + m.id); continue; }
    st.seen[m.id] = new Date().toISOString();
  }
  if (DRY) return;
  rows.forEach((m) => { if (!isFault(m)) st.seen[m.id] = st.seen[m.id] || new Date().toISOString(); });
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(st, null, 1));
  if (lines.length) card(lines);
})();
