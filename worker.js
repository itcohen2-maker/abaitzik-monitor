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
/*
  A message needs a moment to settle, but a minute was never that moment.

  The listener writes the record in the same second it arrives, and since 17.9
  it also transcribes a voice note by itself, in about twenty seconds, so the
  text is on the page long before a session could have read it. The minute here
  was buying nothing and costing a minute of a wait he was already calling
  unanswered. Twenty seconds is enough to let a burst of notes land together
  and be answered in one session rather than three.
*/
const SETTLE_MS = 20 * 1000;
// Never two at once, and never one that has been stuck for an hour.
const LOCK_STALE_MS = 60 * 60 * 1000;
/*
  How long one session may hold the queue, and why there is a limit at all.

  Only one session runs, because two of them committing and pushing the same
  repository at the same second is a worse failure than a wait. The cost of
  that choice is that a long session is a wall: everything he sends while it
  runs waits for it to finish. On 17.9 a session started at 08:01 and six
  notes he sent from 08:09 sat behind it untouched, which from where he sits
  is the monitor ignoring him, and it is the whole complaint.

  The prompt now makes the session write and push its answer inside the first
  two minutes. That is what makes a cap safe: by the time this fires he has
  already been answered, and what is lost is the tail of the work, not the
  reply. Ten minutes is roughly the longest session that has ever finished
  something useful; past that it has been rereading itself.
*/
const MAX_SESSION_MS = 10 * 60 * 1000;

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

function unmarkHandled(list) {
  const done = readJson(SEEN, {});
  list.forEach((m) => { delete done[m.file]; });
  try { fs.writeFileSync(SEEN, JSON.stringify(done, null, 1), 'utf8'); } catch (e) {}
  say('הבאטץ׳ הוחזר לתור: ' + list.map((m) => m.file).join(', '));
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
    'כללי הבית: הפעל את הסקיל abaitzik-onboarding לפני שאתה נוגע במשהו.',
    'אם ל-note של ההודעה כבר יש תמלול, זה התמלול. רק אם אין, תמלל בעצמך עם',
    '`node transcribe.js data/inbox/<שם>.webm`.',
    '',
    'סדר העבודה, ובדיוק בסדר הזה. הוא מחכה מול מסך.',
    '',
    'שלב א, לפני שאתה עובד על משהו, ולא יותר משתי דקות מתחילת הסשן:',
    '  1. קובץ חדש ב-data/chat/chat בשם <YYYYMMDD>-<HHMM>-claude-<slug>.json ובו',
    '     {"at":"<ISO עם +03:00>","from":"claude","re":"<id ההודעה שלו>","text":"<התשובה>"}.',
    '     כתוב מה הבנת ומה אתה הולך לעשות, במשפט או שניים. אם אתה כבר יודע את',
    '     התשובה, זו התשובה. קצר ויבש, בלי מקפים, בלי אימוגי, בלי לפנות בשם.',
    '  2. node build.js, git add -A, git commit, git push. עכשיו, לא בסוף.',
    'זה לא דיווח התקדמות ולא "עובד על זה". זו תשובה. שתים עשרה דקות של שקט',
    'הן מבחינתו הודעה שנפלה, וזה מה שהוא ביקש לתקן.',
    '',
    'שלב ב: תעשה בדיוק את מה שהוא ביקש, עד הסוף, ותאמת את התוצאה על הדף החי.',
    '',
    'שלב ג, בסוף, לכל הודעה, חובה:',
    '  1. בקובץ שלה ב-data/chat/chat: status ל-"done", ו-note עם התמלול אם זו הקלטה.',
    '  2. הודעה נוספת בצאט עם מה שיצא בפועל, אם זה שונה ממה שכתבת בשלב א.',
    '  3. npm test, node build.js, git add -A, git commit, git push.',
    '',
    'אם משהו באמת חסום או דורש החלטה שלו, כתוב לו את זה כבר בשלב א. גם אז',
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
  const cap = setTimeout(() => {
    say('!! הסשן עבר ' + (MAX_SESSION_MS / 60000) + ' דקות. עוצר אותו כדי לשחרר את התור.');
    try { process.kill(child.pid); } catch (e) {}
    try { execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {}); } catch (e) {}
  }, MAX_SESSION_MS);
  let out = '';
  child.stdout.on('data', (b) => { out += b; });
  child.stderr.on('data', (b) => { out += b; });
  child.on('close', (code) => {
    clearTimeout(cap);
    say('הסשן הסתיים, קוד ' + code + '. ' + String(out).trim().slice(-300).replace(/\s+/g, ' '));
    // A session that died is not an answer. Marking before the run stops a
    // crash loop from answering the same thing five times; putting a failed
    // batch back is what stops the opposite, a message that was marked handled
    // and never was. The next tick picks it up again.
    if (code !== 0) unmarkHandled(list);
    releaseLock();
  });
  child.on('error', (e) => { clearTimeout(cap); say('!! הסשן לא עלה: ' + e.message); unmarkHandled(list); releaseLock(); });
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
