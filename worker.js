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
/*
  How many of his messages can be worked at the same time.

  Itzik, 18.9: "it cannot be that you take one request at a time, then the
  monitor is worth nothing, it is not efficient and no client will want it."

  It used to be one, with a lock, because two sessions committing to the same
  repository in the same second break the build. That reasoning was right about
  the danger and wrong about the cure: it queued the whole job to protect one
  step of it. Six notes he sent between 07:53 and 07:58 on 17.9 sat behind a
  session that had started at 07:52 and had nothing to do with them.

  So the sessions run together and only the write is queued, in push.js. Three
  is not a hardware limit, it is a judgement: each one is a full session reading
  his repo, and past three they spend more time waiting on that one queue than
  working.
*/
const MAX_LIVE = 3;
const LIVE = path.join(STATUS, 'worker-live.json');
// A session gets ten minutes. The prompt makes it answer inside the first two,
// so a cap costs the tail of the work and never the reply.
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
/*
  The register of sessions that are actually alive.

  There is no lock any more, because there is nothing here to hold one for.
  This is a head count: who is running, since when, and on what. A dispatcher
  run prunes the dead, kills anything past its ten minutes, and starts more
  only if there is room.

  It is a file rather than memory because the dispatcher exits between ticks.
  It has to: while it was alive the scheduled task refused to start another
  one, so a session that ran for nineteen minutes meant nineteen minutes with
  nobody watching the queue. That was the bug behind "the monitor does not
  answer me".
*/
function livePids() {
  const reg = readJson(LIVE, {});
  const now = Date.now();
  const kept = {};
  Object.keys(reg).forEach((pid) => {
    const e = reg[pid];
    if (!alive(Number(pid))) return;
    if (now - Date.parse(e.at) > MAX_SESSION_MS) {
      say('!! סשן ' + pid + ' עבר ' + (MAX_SESSION_MS / 60000) + ' דקות. עוצר אותו.');
      try { process.kill(Number(pid)); } catch (e2) {}
      try { execFile('taskkill', ['/pid', pid, '/t', '/f'], () => {}); } catch (e2) {}
      return;
    }
    kept[pid] = e;
  });
  try { fs.writeFileSync(LIVE, JSON.stringify(kept, null, 1), 'utf8'); } catch (e) {}
  return kept;
}
function register(pid, files) {
  const reg = readJson(LIVE, {});
  reg[pid] = { at: new Date().toISOString(), files };
  try { fs.mkdirSync(STATUS, { recursive: true }); fs.writeFileSync(LIVE, JSON.stringify(reg, null, 1), 'utf8'); } catch (e) {}
}
function unregister(pid) {
  const reg = readJson(LIVE, {});
  delete reg[pid];
  try { fs.writeFileSync(LIVE, JSON.stringify(reg, null, 1), 'utf8'); } catch (e) {}
}

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
    'חשוב: יתכן שרצים עכשיו עוד סשנים במקביל על הודעות אחרות שלו.',
    'לכן **אל תריץ git add, git commit או git push בעצמך**. במקום זה תמיד',
    '`node push.js "הודעת הקומיט"`. הוא בונה, מקמט, דוחף ועושה rebase אם צריך,',
    'ומחזיק תור כך ששני סשנים לא דורסים זה את זה. זה הדבר היחיד שמתוזמן.',
    'אל תיגע בקבצים של הודעות שלא הוקצו לך, ואל תענה להודעה שלא ברשימה למטה.',
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
    '  2. `node push.js "מה עשית"`. עכשיו, לא בסוף.',
    'זה לא דיווח התקדמות ולא "עובד על זה". זו תשובה. שתים עשרה דקות של שקט',
    'הן מבחינתו הודעה שנפלה, וזה מה שהוא ביקש לתקן.',
    '',
    'שלב ב: תעשה בדיוק את מה שהוא ביקש, עד הסוף, ותאמת את התוצאה על הדף החי.',
    '',
    'שלב ג, בסוף, לכל הודעה, חובה:',
    '  1. בקובץ שלה ב-data/chat/chat: status ל-"done", ו-note עם התמלול אם זו הקלטה.',
    '  2. הודעה נוספת בצאט עם מה שיצא בפועל, אם זה שונה ממה שכתבת בשלב א.',
    '  3. npm test, ואז `node push.js "מה עשית"`.',
    '',
    'אם משהו באמת חסום או דורש החלטה שלו, כתוב לו את זה כבר בשלב א. גם אז',
    'הכתיבה והדחיפה הן חובה: הודעה שלא נכתבה היא הודעה שהוא לא קיבל.',
  ].join('\n');
}

function run(list) {
  const text = prompt(list);
  say('מפעיל סשן על ' + list.length + ' הודעות: ' + list.map((m) => m.file).join(', '));
  // The prompt goes in on stdin, not as an argument. It is long, it is Hebrew,
  // and it quotes him; concatenating it into a Windows command line is a
  // quoting bug waiting for the first message that contains a double quote.
  const child = spawn('claude', ['-p', '--dangerously-skip-permissions'],
    { cwd: HERE, shell: true, windowsHide: true });
  child.stdin.end(text, 'utf8');
  register(child.pid, list.map((m) => m.file));
  /*
    The dispatcher does not wait for it.

    unref lets this process exit the moment it has started what it started, so
    the next tick is a minute away rather than however long the session takes.
    The ten minute cap is enforced by a later tick reading the register, not by
    a timer inside a process that is meant to be gone.
  */
  child.unref();
  let out = '';
  child.stdout.on('data', (b) => { out += b; });
  child.stderr.on('data', (b) => { out += b; });
  child.on('close', (code) => {
    unregister(child.pid);
    say('הסשן הסתיים, קוד ' + code + '. ' + String(out).trim().slice(-300).replace(/\s+/g, ' '));
    // A session that died is not an answer. Marking before the run stops a
    // crash loop from answering the same thing five times; putting a failed
    // batch back is what stops the opposite, a message that was marked handled
    // and never was. The next tick picks it up again.
    if (code !== 0) unmarkHandled(list);
  });
  child.on('error', (e) => { unregister(child.pid); say('!! הסשן לא עלה: ' + e.message); unmarkHandled(list); });
}

function main() {
  const live = livePids();
  const room = MAX_LIVE - Object.keys(live).length;
  const list = waiting();
  if (!list.length) { if (DRY) say('אין הודעות שמחכות. רצים: ' + Object.keys(live).length); return; }
  say('מחכות ' + list.length + ', רצים ' + Object.keys(live).length + ', מקום ל' + Math.max(0, room));
  if (DRY) return;
  if (room <= 0) { say('שלושה סשנים כבר רצים. ממתין לטיק הבא.'); return; }
  /*
    One session per message, not one per batch.

    Batching was a habit from the days of a single lock: if only one thing may
    run, you want it to carry everything. Now that they run together, a batch
    is only a way of making one slow message hold up three fast ones. The one
    exception is a burst he sent in the same breath, which is still one thought
    and reads badly as three separate answers, so notes within ninety seconds
    of each other travel together.
  */
  const BURST_MS = 90 * 1000;
  const batches = [];
  list.forEach((m) => {
    const last = batches[batches.length - 1];
    if (last && Math.abs(Date.parse(m.at) - Date.parse(last[last.length - 1].at)) <= BURST_MS) last.push(m);
    else batches.push([m]);
  });
  batches.slice(0, room).forEach((batch) => {
    // Marked before the session starts, not after. A session that crashes must
    // not put the same message back in the queue for ever; he would rather hear
    // "I missed one" once than get the same answer five times.
    markHandled(batch);
    run(batch);
  });
}
main();
