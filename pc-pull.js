/*
  The PC half of pc-task.js.

  Itzik, 1.10: "תבנה שהמחשב יקלוט לבד משימות מהמוניטור שהשרת מסמן לו".
  Runs every minute from a hidden scheduled task (setup-pc-pull.ps1). Most
  minutes it is one ssh call that finds nothing and exits: no Claude, no
  tokens (29.9, a Claude polling loop burned thirty million). Only when the
  server has marked a task does it start a session here, with his Chrome
  attached, and send that session's answer back to the server, which writes
  it in his thread and pushes.

  Usage: node pc-pull.js [--dry]
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

if (process.platform !== 'win32') { console.log('pc-pull runs on the PC only.'); process.exit(0); }

const HERE = __dirname;
const inst = require('./lib/instance.js');
const KEY = 'C:/Users/User/.ssh/monitor_server';
const HOST = 'root@178.105.63.97';
const REMOTE = '/home/monitor/abaitzik-monitor';
const STATUS = path.join(inst.dataPath, 'status');
const LOG = path.join(STATUS, 'pc-pull.log');
const LIVE = path.join(STATUS, 'pc-pull-live.json');
const DRY = process.argv.includes('--dry');
// Two at once is plenty for one PC and one Chrome.
const MAX_LIVE = 2;
const MAX_SESSION_MS = 30 * 60 * 1000;

function say(line) {
  const l = new Date().toISOString() + ' ' + line;
  try { fs.mkdirSync(STATUS, { recursive: true }); fs.appendFileSync(LOG, l + '\n', 'utf8'); } catch (e) {}
  console.log(l);
}
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function alive(pid) {
  try { process.kill(+pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function liveNow() {
  const live = readJson(LIVE, {});
  Object.keys(live).forEach((pid) => {
    if (!alive(pid) || Date.now() - Date.parse(live[pid].at) > MAX_SESSION_MS + 60 * 1000) delete live[pid];
  });
  try { fs.writeFileSync(LIVE, JSON.stringify(live, null, 1), 'utf8'); } catch (e) {}
  return live;
}
function setLive(pid, v) {
  const live = readJson(LIVE, {});
  if (v) live[pid] = v; else delete live[pid];
  try { fs.writeFileSync(LIVE, JSON.stringify(live, null, 1), 'utf8'); } catch (e) {}
}

// One command on the server, as the monitor user, with optional stdin.
function remote(args, input) {
  return new Promise((resolve) => {
    const cmd = 'cd ' + REMOTE + ' && sudo -u monitor node pc-task.js ' + args;
    const c = spawn('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', HOST, cmd], { windowsHide: true });
    let out = '', err = '';
    c.stdout.on('data', (b) => { out += b; });
    c.stderr.on('data', (b) => { err += b; });
    c.on('error', (e) => resolve({ code: -1, out, err: e.message }));
    c.on('close', (code) => resolve({ code, out, err }));
    c.stdin.end(input || '', 'utf8');
  });
}

function prompt(t) {
  return [
    'זו הרצה אוטומטית על המחשב של ' + inst.owner + ', עם הכרום שלו מחובר. אין אדם בצד השני של הפלט.',
    'סשן בשרת קיבל ממנו הודעה במוניטור וסימן שהיא צריכה את המחשב (דפדפן, ריווחית, קבצים כאן).',
    'אל תבקש אישור ואל תציע: תבצע עד הסוף ותאמת.',
    '',
    'כללי הבית: הפעל את הסקיל abaitzik-onboarding לפני שאתה נוגע במשהו. הכללים האדומים בתוקף.',
    '',
    'ההודעה המקורית שלו:',
    String(t.message || '(לא נמצאה)'),
    '',
    'המשימה כפי שהשרת ניסח אותה:',
    t.task,
    '',
    'חשוב:',
    '  - אל תכתוב לצ׳אט של המוניטור ואל תריץ push.js או git. התשובה שלך חוזרת לשרת לבד.',
    '  - קובץ שצריך להגיע אליו: scp ל-' + HOST + ':' + REMOTE + '/data/files-private/<שם>, ואז',
    '    ssh ... "chown monitor:monitor ' + REMOTE + '/data/files-private/<שם>", ובתשובה כתוב files/<שם>.',
    '  - כל טאב שפתחת נסגר לפני שאתה מדפיס את התשובה, גם אם נכשלת באמצע. הוא ביקש את זה שוב ב 8.10:',
    '    טאבים שנשארים פתוחים מפריעים לו. לא סוגרים את המוניטור ולא טאב שהוא פתח בעצמו.',
    '',
    'בסוף, הדבר האחרון שאתה מדפיס: התשובה אליו, בין שתי השורות האלה בדיוק:',
    '<<<ANSWER',
    '(עד חמש שורות קצרות, עברית של יום יום, המשפט הראשון הוא התוצאה, בלי מקפים, בלי אימוג׳י, בלי שמות קבצים)',
    'ANSWER>>>',
    'אם לא הצלחת, כתוב בתוך הסימנים מה נתקע ומה הוא צריך לעשות.',
  ].join('\n');
}

function work(t) {
  return new Promise((resolve) => {
    say('מתחיל משימה ' + t.id + ': ' + t.task.slice(0, 80));
    const child = spawn('claude', ['-p', '--chrome', '--dangerously-skip-permissions'], { cwd: HERE, shell: true, windowsHide: true });
    setLive(child.pid, { id: t.id, at: new Date().toISOString() });
    let out = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { out += b; });
    const timer = setTimeout(() => { say('!! עברו 30 דקות, עוצר ' + t.id); try { child.kill(); } catch (e) {} }, MAX_SESSION_MS);
    child.stdin.end(prompt(t), 'utf8');
    child.on('error', (e) => { clearTimeout(timer); setLive(child.pid, null); resolve({ ok: false, why: 'הסשן לא עלה: ' + e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      setLive(child.pid, null);
      const m = String(out).match(/<<<ANSWER\s*([\s\S]*?)\s*ANSWER>>>/g);
      const last = m && m[m.length - 1].replace(/^<<<ANSWER\s*|\s*ANSWER>>>$/g, '').trim();
      if (last) resolve({ ok: true, text: last });
      else resolve({ ok: false, why: 'קוד ' + code + ', בלי תשובה. ' + String(out).trim().slice(-200) });
    });
  });
}

async function main() {
  const live = liveNow();
  const room = MAX_LIVE - Object.keys(live).length;
  if (room <= 0) return;
  for (let i = 0; i < room; i++) {
    const r = await remote('next');
    if (r.code !== 0) { say('!! השרת לא ענה: ' + (r.err || r.code).toString().trim().slice(0, 200)); return; }
    const line = r.out.trim();
    if (!line) return;
    let t;
    try { t = JSON.parse(line); } catch (e) { say('!! תשובה לא מובנת מהשרת: ' + line.slice(0, 200)); return; }
    if (DRY) { say('יש משימה (dry, לא מבצע ולא מחזיר): ' + t.id); return; }
    // Each task in its own detached process, so a long one never holds the
    // scheduled task and the next minute can pick up another.
    const c = spawn(process.execPath, [__filename, '--task', Buffer.from(line).toString('base64')],
      { cwd: HERE, detached: true, stdio: 'ignore', windowsHide: true });
    c.unref();
  }
}

async function one(b64) {
  const t = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  const res = await work(t);
  if (res.ok) {
    const r = await remote('done ' + t.id, res.text);
    say((r.code === 0 ? 'הוחזר לשרת: ' : '!! ההחזרה נכשלה: ') + t.id + ' ' + r.err.trim().slice(-200));
  } else {
    const r = await remote('fail ' + t.id, res.why);
    say('!! ' + t.id + ' נכשל (' + r.out.trim() + '): ' + res.why.slice(0, 200));
  }
}

const ti = process.argv.indexOf('--task');
if (ti > -1) one(process.argv[ti + 1]);
else main();
