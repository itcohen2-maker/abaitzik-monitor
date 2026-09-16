/*
  The thing that was missing.

  Itzik, 16.9: "what I ask in the monitor does not get done, what I ask in the
  terminal does. How can that be." It is exactly right, and the reason is that
  the monitor is a mailbox. The listener catches his message in a second and
  writes it down in red, and then nothing reads it, because nothing in this
  repo can start a session. It waited for me to happen to look. Tonight six
  messages sat for two hours and forty six minutes, and I only found them
  while cleaning up after something else.

  So this is the part that looks. It runs on a schedule, finds messages of his
  that have no answer, and starts a headless Claude with them. Then it gets out
  of the way: it does not write answers itself and it does not decide anything,
  because a worker that improvises replies in his name is worse than silence.

  Usage: node worker.js [--dry]
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const HERE = __dirname;
const CHAT = path.join(HERE, 'data', 'chat', 'chat');
const STATUS = path.join(HERE, 'data', 'status');
const LOCK = path.join(STATUS, 'worker.lock');
const LOG = path.join(STATUS, 'worker.log');
const SEEN = path.join(STATUS, 'worker-seen.json');
const DRY = process.argv.includes('--dry');
// A message needs a moment to settle: the listener writes the record, and a
// voice note still has to be transcribed. Starting on the same second would
// hand the session half a message.
const SETTLE_MS = 60 * 1000;
// Never two at once, and never one that has been stuck for an hour.
const LOCK_STALE_MS = 60 * 60 * 1000;

function say(line) {
  const t = new Date().toTimeString().slice(0, 8);
  try { fs.appendFileSync(LOG, t + '  ' + line + '\n', 'utf8'); } catch (e) {}
  console.log(t + '  ' + line);
}
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function claimLock() {
  const cur = readJson(LOCK, null);
  if (cur && cur.pid && alive(cur.pid) && Date.now() - Date.parse(cur.at) < LOCK_STALE_MS) return false;
  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8');
  return true;
}
function releaseLock() { try { fs.unlinkSync(LOCK); } catch (e) {} }

/*
  Unanswered means unanswered by me, not unread by him.

  A message of his is waiting while it carries no done mark and nothing of
  mine in the chat points back at it. Both halves matter: the status is what I
  set when I finish, and the `re` link is what ties an answer to its question.
*/
function waiting() {
  let files = [];
  try { files = fs.readdirSync(CHAT); } catch (e) { return []; }
  const all = files.map((f) => {
    const d = readJson(path.join(CHAT, f), null);
    return d && d.at ? Object.assign({ file: f }, d) : null;
  }).filter(Boolean);
  const answeredIds = new Set(all.filter((m) => m.from === 'claude' && m.re).map((m) => m.re));
  const done = readJson(SEEN, {});
  const now = Date.now();
  return all.filter((m) => m.from === 'itzik')
    .filter((m) => m.status !== 'done')
    .filter((m) => !(m.id && answeredIds.has(m.id)))
    .filter((m) => !done[m.file])
    .filter((m) => now - Date.parse(m.at) > SETTLE_MS)
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

function markHandled(list) {
  const done = readJson(SEEN, {});
  list.forEach((m) => { done[m.file] = new Date().toISOString(); });
  const keys = Object.keys(done).sort();
  while (keys.length > 500) delete done[keys.shift()];
  try { fs.writeFileSync(SEEN, JSON.stringify(done, null, 1), 'utf8'); } catch (e) {}
}

function prompt(list) {
  const lines = list.map((m) => '- [' + m.at + '] (id ' + (m.id || m.file) + ') ' + String(m.text || '').replace(/\s+/g, ' '));
  return [
    'זו הרצה אוטומטית. אין אדם בצד השני של הפלט הזה ואף אחד לא יקרא אותו.',
    'אל תבקש אישור ואל תציע לעשות משהו: תבצע. אל תסיים בלי לכתוב תשובה ולדחוף אותה.',
    '',
    'איציק שלח את ההודעות האלה למוניטור והן עדיין בלי תשובה:',
    '',
    lines.join('\n'),
    '',
    'תעשה בדיוק את מה שהוא ביקש, עד הסוף, ותאמת את התוצאה על הדף החי.',
    'כללי הבית: הפעל את הסקיל abaitzik-onboarding לפני שאתה נוגע במשהו.',
    'הודעה קולית: תמלל עם `node transcribe.js data/inbox/<שם>.webm` ופעל לפי מה שנאמר.',
    '',
    'בסוף, לכל הודעה, חובה:',
    '  1. בקובץ שלה ב-data/chat/chat: status ל-"done", ו-note עם התמלול אם זו הקלטה.',
    '  2. קובץ חדש ב-data/chat/chat בשם <YYYYMMDD>-<HHMM>-claude-<slug>.json ובו',
    '     {"at":"<ISO עם +03:00>","from":"claude","re":"<id ההודעה שלו>","text":"<התשובה>"}.',
    '     קצר ויבש, בלי מקפים, בלי אימוגי, בלי לפנות בשם.',
    '  3. npm test, node build.js, git add -A, git commit, git push.',
    '',
    'אם משהו באמת חסום או דורש החלטה שלו, כתוב לו את זה באותה תשובה בצאט. גם אז',
    'הכתיבה והדחיפה הן חובה: הודעה שלא נכתבה היא הודעה שהוא לא קיבל.',
  ].join('\n');
}

function run(list) {
  const text = prompt(list);
  say('מפעיל סשן על ' + list.length + ' הודעות');
  // The prompt goes in on stdin, not as an argument. It is long, it is Hebrew,
  // and it quotes him; concatenating it into a Windows command line is a
  // quoting bug waiting for the first message that contains a double quote.
  const child = spawn('claude', ['-p', '--dangerously-skip-permissions'],
    { cwd: HERE, shell: true, windowsHide: true });
  child.stdin.end(text, 'utf8');
  let out = '';
  child.stdout.on('data', (b) => { out += b; });
  child.stderr.on('data', (b) => { out += b; });
  child.on('close', (code) => {
    say('הסשן הסתיים, קוד ' + code + '. ' + String(out).trim().slice(-300).replace(/\s+/g, ' '));
    releaseLock();
  });
  child.on('error', (e) => { say('!! הסשן לא עלה: ' + e.message); releaseLock(); });
}

function main() {
  const list = waiting();
  if (!list.length) { if (DRY) say('אין הודעות שמחכות.'); return; }
  say('מחכות ' + list.length + ': ' + list.map((m) => String(m.text || '').slice(0, 40)).join(' | '));
  if (DRY) return;
  if (!claimLock()) { say('סשן אחר עוד רץ. לא מפעיל שני.'); return; }
  // Marked before the session starts, not after. A session that crashes must
  // not put the same message back in the queue for ever; he would rather hear
  // "I missed one" once than get the same answer five times.
  markHandled(list);
  run(list);
}
main();
