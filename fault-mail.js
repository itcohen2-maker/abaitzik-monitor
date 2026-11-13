'use strict';
/*
  13.11.2026, Itzik: "המנהל צריך לעבור על המיילים שמגיעים ולטפל בהם בכל מה שנוגע לתקלות במוניטורים".
  The button checker, the guard, the listener and the posting scripts all report faults by mail
  (notify.js, info@it-solution.co.il), and a customer may write about one too. Until now nobody
  acted on those mails; the manager only summed them up.

  Every 10 minutes, day and night (13.11, Itzik: "תיקונים אוטומטים צריכים להתבצע כל הזמן, יש לנו לקוחות שמשלמים"), this reads the last day of his inbox, read only
  (tools/mail-search.py, EXAMINE), picks the mails about a monitor fault, and sends each new one
  to the PC queue as a fix order (pc-task.js, full Claude with memory). When the PC is off (night,
  lid closed) the server fixes it itself: node fault-mail.js --fix runs one Claude session at a time
  on the server (data/manager/fault-fix/<id>.txt), as user monitor. The answer lands in his chat. The scan itself uses no model, sends to no one, nothing in the mailbox changes.

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
// 13.11.2026: alerts no longer go to his mailbox (lib/notify-channels.js toManager), they land here. The last day.
function inbox() {
  const cut = Date.now() - 864e5;
  let txt = ''; try { txt = fs.readFileSync(path.join(inst.dataPath, 'manager', 'inbox.jsonl'), 'utf8'); } catch (e) { return []; }
  return txt.split('
').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } })
    .filter((m) => m && m.id && Date.parse(m.at) > cut)
    .map((m) => ({ id: m.id, local: true, at: new Date(m.at).toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }).slice(0, 16), from: m.from, subject: m.subject, body: m.body }));
}

function isFault(m) {
  const s = m.subject, all = s + ' ' + m.body;
  if (NOT.test(s) || NOT.test(m.body.slice(0, 40))) return false;
  if (SYSTEM.test(m.from)) return FAULT.test(s) || (FAULT.test(m.body) && /מוניטור|אריח|כפתור|מסך/.test(m.body));
  return /מוניטור/.test(all) && FAULT.test(all); // a person writing about a fault in a monitor
}

function job(m, server) {
  return [
    'המנהל: הגיע מייל על תקלה במוניטור. לטפל בה עד הסוף, לבד.',
    'המייל: ' + m.at + ' · מאת ' + m.from + ' · נושא: ' + m.subject,
    'התוכן: ' + noDash(m.body).slice(0, 900),
    '',
    'מה לעשות:',
    server ? '1. אתה רץ על השרת עצמו, בתיקייה /home/monitor/abaitzik-monitor. לבדוק אם התקלה אמיתית: יומנים ב /home/monitor ו /var/log, הדף החי, והקוד.'
      : '1. לבדוק אם התקלה אמיתית, בדף החי או בשרת (ssh -i C:\Users\User\.ssh\monitor_server root@178.105.63.97, קריאה ובדיקה).',
    '2. אמיתית: לתקן בקוד של abaitzik-monitor (main, /home/monitor/abaitzik-monitor), לא בתוך תיקייה של לקוח. npm test חייב לעבור. התיקון מגיע לכל הלקוחות לבד תוך 5 דקות.',
    '3. לא אמיתית (הבודק טעה): לתקן את הבודק או את הכפתור כך שהלחיצה מראה תגובה, כדי שהמייל לא יחזור.',
    '4. לוודא שזה עובד אחרי התיקון, לא רק בקוד.',
    'אסור: לשלם, לשלוח הודעה לאדם, לפרסם, למחוק מידע של לקוח, לשנות סיסמה או הגדרת אבטחה.',
    server ? 'אחרי תיקון: git commit ואז node push.js. התשובה: שתי שורות בעברית, מה היה ומה תוקן, או למה לא תוקן. אם לא תוקן, השורה הראשונה מתחילה ב "לא תוקן".'
      : 'התשובה: שתי שורות בעברית, מה היה ומה תוקן, או למה לא תוקן.'
  ].join('\n');
}

function card(lines) {
  const f = path.join(WORK_DIR, day().replace(/-/g, '') + '.json');
  const prev = rd(f, {}).items || [];
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), items: prev.concat(lines) }, null, 1));
}

const FIX_DIR = path.join(inst.dataPath, 'manager', 'fault-fix');
const FIX_LOCK = path.join(FIX_DIR, '.lock');
function pcOn() { try { return /^on/.test(execFileSync('node', ['pc-task.js', 'online'], { cwd: __dirname, encoding: 'utf8', timeout: 30000 }).trim()); } catch (e) { return false; } }
function lockFree() { try { const t = Date.parse(fs.readFileSync(FIX_LOCK, 'utf8')); return !(Date.now() - t < 40 * 60 * 1000); } catch (e) { return true; } }
// the server stands in for the PC: one session at a time, oldest order first
function serverFix() {
  if (!lockFree()) return;
  fs.writeFileSync(FIX_LOCK, new Date().toISOString());
  const { spawnSync } = require('child_process');
  try {
    for (;;) {
      const next = fs.readdirSync(FIX_DIR).filter((f) => /^\d+\.txt$/.test(f)).sort()[0];
      if (!next) break;
      const id = next.replace('.txt', ''), jf = path.join(FIX_DIR, next);
      fs.writeFileSync(FIX_LOCK, new Date().toISOString());
      const r = spawnSync('claude', ['-p', '--model', 'sonnet', '--output-format', 'text', '--allowedTools', 'Read,Edit,Write,Grep,Glob,Bash,WebFetch'],
        { cwd: __dirname, input: fs.readFileSync(jf, 'utf8'), encoding: 'utf8', timeout: 30 * 60 * 1000, env: process.env, maxBuffer: 8 * 1024 * 1024 });
      let text = String(r.stdout || '').trim();
      if (r.status !== 0 || !text) text = 'לא תוקן: הסשן בשרת לא הסתיים (' + String(r.error ? r.error.message : 'קוד ' + r.status).slice(0, 80) + '). הבדיקה הבאה תנסה שוב דרך המחשב.';
      const chat = path.join(inst.dataPath, 'chat', 'chat');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(chat, stamp + '-claude-faultfix.json'), JSON.stringify({ at: new Date().toISOString(), from: 'claude', re: 'fault-mail-' + id, text: text.slice(0, 1500), status: 'done' }, null, 1));
      fs.renameSync(jf, jf.replace(/\.txt$/, '.done'));
      console.log(new Date().toISOString().slice(0, 16) + ' server fix ' + id + ': ' + noDash(text).slice(0, 120));
      if (/^\s*לא תוקן/.test(text)) { try { execFileSync('node', ['notify.js', 'המנהל: תקלה לא תוקנה', noDash(text).slice(0, 300)], { cwd: __dirname, stdio: 'ignore', timeout: 60000 }); } catch (e) {} }
      try { execFileSync('node', ['push.js', 'fault fix ' + id], { cwd: __dirname, stdio: 'ignore', timeout: 5 * 60 * 1000 }); } catch (e) {}
    }
  } finally { try { fs.unlinkSync(FIX_LOCK); } catch (e) {} }
}
if (process.argv.includes('--fix')) { fs.mkdirSync(FIX_DIR, { recursive: true }); serverFix(); return; }

(function main() {
  const st = rd(STATE, {});
  st.seen = st.seen || {}; st.subj = st.subj || {};
  const d = day();
  if (st.day !== d) { st.day = d; st.n = 0; st.subj = {}; }
  // the seen list keeps a week
  const cut = Date.now() - 7 * 864e5;
  Object.keys(st.seen).forEach((k) => { if (Date.parse(st.seen[k]) < cut) delete st.seen[k]; });
  let rows;
  try { rows = mails(); } catch (e) { console.log(new Date().toISOString().slice(0, 16) + ' mail read failed: ' + String(e.stderr || e.message).slice(-160)); rows = []; }
  rows = rows.concat(inbox());
  const todo = rows.filter((m) => !st.seen[m.id] && isFault(m));
  const lines = [];
  let sent = 0;
  for (const m of todo) {
    // the same fault once a day: subject plus the start of the body ("תקלה אצל לקוח" names a different customer each time)
    const key = noDash(m.subject + ' ' + m.body.replace(/\s+/g, ' ').slice(0, 60)).slice(0, 120);
    if (st.subj[key] || sent >= MAX_RUN || st.n >= MAX_DAY) { st.seen[m.id] = new Date().toISOString(); continue; }
    if (DRY) { console.log('DRY ' + m.id + ' ' + m.subject); continue; }
    if (!m.local) try { m.body = execFileSync('/usr/bin/python3', ['-I', path.join(__dirname, 'tools/mail-search.py'), '--id', m.id], { cwd: __dirname, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').slice(4).join('\n').trim() || m.body; } catch (e) { /* the snippet is enough */ }
    const onPc = pcOn();
    try {
      if (onPc) execFileSync('node', ['pc-task.js', 'add', '--re', 'fault-mail-' + m.id, job(m)], { cwd: __dirname, stdio: 'ignore', timeout: 60000 });
      else { fs.mkdirSync(FIX_DIR, { recursive: true }); fs.writeFileSync(path.join(FIX_DIR, m.id + '.txt'), job(m, true)); }
      sent++; st.n++; st.subj[key] = m.id;
      lines.push({ when: new Date().toISOString(), kind: 'faultmail', text: 'מייל תקלה', status: 'mail', line: (onPc ? 'נשלח למחשב לתיקון: ' : 'השרת מתקן (המחשב כבוי): ') + noDash(m.subject) });
      console.log(new Date().toISOString().slice(0, 16) + ' fix order ' + m.id + ' ' + key);
    } catch (e) { console.log(new Date().toISOString().slice(0, 16) + ' pc-task failed ' + m.id); continue; }
    st.seen[m.id] = new Date().toISOString();
  }
  if (DRY) return;
  rows.forEach((m) => { if (!isFault(m)) st.seen[m.id] = st.seen[m.id] || new Date().toISOString(); });
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(st, null, 1));
  if (lines.length) card(lines);
  // anything waiting for the server is started in the background, so the cron run ends now
  try { if (fs.readdirSync(FIX_DIR).some((f) => /^\d+\.txt$/.test(f)) && lockFree()) require('child_process').spawn('node', [__filename, '--fix'], { cwd: __dirname, detached: true, stdio: ['ignore', fs.openSync('/home/monitor/fault-mail.log', 'a'), fs.openSync('/home/monitor/fault-mail.log', 'a')], env: process.env }).unref(); } catch (e) {}
})();
