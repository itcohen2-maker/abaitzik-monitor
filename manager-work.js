'use strict';
/*
  The manager's own work (Itzik, 8.11.2026: "המנהל לא סתם מנהל. הוא בודק במשימות של השבוע
  כל הזמן מה הוא יכול לעשות לבד, ועושה. רק מידע אותי שהוא שם בתזכורת והוא עשה").

  Called from manager.js in the 07:25 and 13:00 rounds. Goes over the reminders that are due
  within the next 7 days (or already due and not closed) and, for each one that is a CHECK the
  server can do alone (a live page, a mail, a search), opens one cheap Haiku session with read
  only tools, does the check once, and closes the reminder: doneAt, doneBy "manager", result.
  Closed reminders leave the reminders screen (build.js) and the line goes to the manager card
  (data/manager/work/<YYYYMMDD>.json, shown by lib/manager.js as k "work").

  What stays with Itzik, never done here: anything that needs his passport, face, card, a payment,
  a signature, an app tap on his phone, a send to a person, a delete or an identity change
  (the red rules in CLAUDE.md). Those are left open and the session says why in one line.

  Budget: at most 4 sessions per round (Haiku), one check per reminder, no loops. One push per
  round, only when something was closed or turned out to need him.

  Usage: node manager-work.js [--dry]   (--dry lists what it would try, runs nothing)
*/
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const DRY = process.argv.includes('--dry');
const DAY = 24 * 3600 * 1000;
const MAX_PER_ROUND = 4;
const REM_DIR = path.join(inst.dataPath, 'reminders', 'reminders');
const WORK_DIR = path.join(inst.dataPath, 'manager', 'work');

function noDash(s) { return String(s == null ? '' : s).replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim(); }
function dayKey(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }

// A reminder is a candidate when it asks for a check or a retry, and is not one that only Itzik can do.
const CHECKY = /(לבדוק|בדיקה|לנסות שוב|האם עלה|נסרק|הגיע|אושר|מאומת|תג האימות|סטטוס)/;
// Bank and money are his alone (bank-owner-only); Meta, ad manager and Rivhit need a login the server does not have.
const ONLY_HIM = /(דרכון|סלפי|לשלם|תשלום|חתימה|לחתום|תור ב|מחר בשעה|היום \d|להתקשר|לשלוח|לצלם|כדור|בנק|פנסיה|הראל|כסף|ש״ח|חשבונית|מנהל המודעות|קמפיין|להקצות|ריווחית|לקנות|לאשר|להשלים|שי בודק|סים)/;

function candidates(now) {
  if (!fs.existsSync(REM_DIR)) return [];
  return fs.readdirSync(REM_DIR).filter(f => f.endsWith('.json')).map(f => {
    try { const r = JSON.parse(fs.readFileSync(path.join(REM_DIR, f), 'utf8')); r._file = f; return r; } catch (e) { return null; }
  }).filter(r => r && r.text && !r.doneAt && !r.every && r.due
    && Date.parse(r.due) <= now + 7 * DAY
    && Date.parse(r.due) >= now - 3 * DAY
    && (!r.tried || dayKey(Date.parse(r.tried)) !== dayKey(now))
    && CHECKY.test(r.text) && (/תג האימות/.test(r.text) || !ONLY_HIM.test(r.text)))
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due)).slice(0, MAX_PER_ROUND);
}

function prompt(r) {
  return [
    'אתה "המנהל" של אבא איציק. זו תזכורת שהוא קבע לעצמו, ואתה מבצע אותה במקומו אם אפשר.',
    'התזכורת: ' + r.text,
    '',
    'כללים:',
    '- בדיקה אחת בלבד, ללא לולאות וללא בדיקה חוזרת. אתר חי נבדק פעם אחת.',
    '- כלים לקריאה בלבד: קריאת קבצים, חיפוש ברשת, פתיחת עמוד. מייל נקרא רק דרך: node mail-read.js "<שאלה>" --days 14.',
    '- בלי לשלוח, לשלם, למחוק, לשנות זהות או להתחבר לחשבון. בלי הודעה לאדם אחר.',
    '- אתר הנרות candletimes.com: הקוד ב /home/monitor/ner-site, אפשר לקרוא אותו; בדיקת האתר החי פעם אחת בלבד.',
    '- תג אימות בלינקדין: רק לבדוק אם התג כבר קיים בפרופיל של איציק (עמוד הפרופיל הציבורי, או הטוקן ב linkedin-post.js לקריאה בלבד). קיים: done. לא קיים: needsItzik, והסיבה שהאימות עצמו דורש ממנו דרכון וסלפי.',
    '- אם הדבר דורש את איציק עצמו (דרכון, פנים, כרטיס, לחיצה בטלפון, החלטה), לא לנסות: להחזיר needsItzik.',
    '',
    'הפלט: JSON בלבד, אובייקט אחד, בלי טקסט לפניו או אחריו:',
    '{"status":"done|needsItzik|failed","line":"שורה אחת בעברית פשוטה: מה בדקת ומה יצא, עם המספר או התאריך","why":"אם needsItzik: מה בדיוק נשאר לו, במשפט"}',
    'עברית פשוטה, בלי מקפים, בלי אימוג׳י.',
  ].join('\n');
}

function runClaude(text) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--model', 'haiku', '--output-format', 'text',
      '--allowedTools', 'Read,Grep,Glob,WebFetch,WebSearch,Bash(node mail-read.js:*)'];
    const child = spawn('claude', args, { cwd: __dirname, env: process.env });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('timeout')); }, 8 * 60 * 1000);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error('claude exited ' + code + ': ' + err.slice(0, 160))); });
    child.stdin.end(text);
  });
}

function parse(out) {
  const a = out.indexOf('{'), b = out.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON in the answer');
  const o = JSON.parse(out.slice(a, b + 1));
  const status = ['done', 'needsItzik', 'failed'].includes(o.status) ? o.status : 'failed';
  return { status, line: noDash(o.line || ''), why: noDash(o.why || '') };
}

async function main() {
  const now = Date.now();
  const list = candidates(now);
  if (DRY) { console.log(list.map(r => r.due.slice(0, 10) + '  ' + r.text.slice(0, 90)).join('\n') || '(nothing to try)'); return; }
  const results = [];
  for (const r of list) {
    const file = path.join(REM_DIR, r._file);
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    doc.tried = new Date().toISOString(); // one attempt a day at most, whatever came out
    let res;
    try { res = parse(await runClaude(prompt(r))); } catch (e) { res = { status: 'failed', line: '', why: String(e.message).slice(0, 100) }; }
    if (res.status === 'done' && res.line) { doc.doneAt = new Date().toISOString(); doc.doneBy = 'manager'; doc.result = res.line; }
    else if (res.status === 'needsItzik') doc.managerNote = res.why || res.line;
    fs.writeFileSync(file, JSON.stringify(doc, null, 1));
    results.push({ text: noDash(r.text).slice(0, 80), status: res.status, line: res.line || res.why });
    console.log(new Date().toISOString().slice(11, 19) + '  ' + res.status + '  ' + r._file);
  }
  if (!results.length) return;
  const day = dayKey(now).replace(/-/g, '');
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const f = path.join(WORK_DIR, day + '.json');
  let prev = []; try { prev = JSON.parse(fs.readFileSync(f, 'utf8')).items || []; } catch (e) {}
  fs.writeFileSync(f, JSON.stringify({ at: new Date(now).toISOString(), items: prev.concat(results.map(x => Object.assign({ when: new Date().toISOString() }, x))) }, null, 1));
  const done = results.filter(x => x.status === 'done');
  const him = results.filter(x => x.status === 'needsItzik');
  if (!done.length && !him.length) return;
  const body = done.map(x => 'סגרתי: ' + x.text + '. ' + x.line).concat(him.map(x => 'נשאר לך: ' + x.text + '. ' + x.line)).join('\n');
  try { execFileSync('node', ['notify.js', 'המנהל: ' + (done.length ? 'עשיתי ' + done.length : 'משהו נשאר לך'), body], { cwd: __dirname, stdio: 'ignore', timeout: 60000 }); } catch (e) {}
}

main().catch(e => { console.log(new Date().toISOString().slice(11, 19) + '  MANAGER WORK FAILED: ' + e.message); process.exit(1); });
