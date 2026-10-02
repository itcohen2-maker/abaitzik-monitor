'use strict';
/*
  The watchdog. Itzik, 27.9: "אפליקציה שתעשה דיבאגינג ותבדוק תקלות מהסוג הזה
  במשך כל היום". Every fault found that day was silent: a message answered but
  left in "working", a message taken and never answered, and a worker unit that
  stayed "activating" for as long as one session ran, so the timer stopped and
  three notes waited behind the first. Each of them only showed up when he
  asked why nothing answered.

  This runs every two minutes on the server, once per instance (his, and each
  customer's, from their own folder). It only looks; the worker's reconcile()
  does the fixing. What it finds is written to data/status/watchdog.json, which
  tenants-health.js carries to Itzik's tile, and a new fault is told once
  through notify-channels (which owns the daily budget), not every run.

  Usage: node watchdog.js [--dry]
  Env: WATCHDOG_WORKER_UNIT (default monitor-worker), read from the unit file.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const DRY = process.argv.includes('--dry');
const CHAT = path.join(inst.dataPath, 'chat', 'chat');
const STATUS = path.join(inst.dataPath, 'status');
const OUT = path.join(STATUS, 'watchdog.json');
const UNIT = process.env.WATCHDOG_WORKER_UNIT || 'monitor-worker';
// The target is a first answer inside two minutes; five without one is a fault.
const TARGET_MS = 2 * 60 * 1000;
const WAIT_MS = 5 * 60 * 1000;
const STUCK_MS = 3 * 60 * 1000;      // the dispatcher exits in seconds now
const TIMER_MS = 5 * 60 * 1000;      // the timer fires every minute
const RETELL_MS = 2 * 60 * 60 * 1000;

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function show(unit, prop) {
  try { return execFileSync('systemctl', ['show', unit, '-p', prop, '--value'], { encoding: 'utf8' }).trim(); }
  catch (e) { return ''; }
}
// "Sun 2026-09-27 19:02:22 UTC" -> ms
function when(s) {
  const m = String(s || '').match(/(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)(?: (\w+))?/);
  if (!m) return NaN;
  return Date.parse(m[1] + 'T' + m[2] + (m[3] === 'UTC' || !m[3] ? 'Z' : 'Z'));
}

/*
  1.10: "401" on its own matched 20261001-1401-claude-ner-candles-pc.json, a
  reply written at 14:01, and he got an alarm that the login had expired while
  every session was answering. The status code counts only as a number of its
  own, not inside a file name or a time.
*/
function refused(log) {
  return /((?<![\w-])401(?![\w-])|unauthori[sz]ed|invalid (api key|token)|oauth token (has )?expired|please run \/login)/i.test(log);
}
function heldProblem(all, now) {
  const held = all.filter((m) => m.from === 'unverified' && m.status === 'held'
    && now - Date.parse(m.at) > 3 * 60 * 1000 && now - Date.parse(m.at) < 24 * 3600 * 1000);
  if (!held.length) return '';
  return (held.length === 1 ? 'הודעה אחת' : held.length + ' הודעות')
    + ' הגיעו בלי הקוד ונעצרו, למשל ' + String(held[0].text || '').slice(0, 40);
}
function check(now) {
  const problems = [];
  let files = [];
  try { files = fs.readdirSync(CHAT); } catch (e) { return ['אין תיקיית צ׳אט']; }
  const all = files.map((f) => { const d = readJson(path.join(CHAT, f), null); return d ? Object.assign({ file: f }, d) : null; }).filter(Boolean);
  const answered = new Set(all.filter((m) => m.from === 'claude' && m.re).map((m) => m.re));
  const mine = all.filter((m) => m.from === 'itzik' && m.status !== 'done');
  const late = mine.filter((m) => !(m.id && answered.has(m.id)) && now - Date.parse(m.at) > WAIT_MS);
  if (late.length) problems.push(late.length === 1 ? 'הודעה אחת מחכה יותר מחמש דקות בלי תשובה' : late.length + ' הודעות מחכות יותר מחמש דקות בלי תשובה');
  const stale = mine.filter((m) => m.id && answered.has(m.id) && now - Date.parse(m.at) > WAIT_MS);
  if (stale.length) problems.push(stale.length + ' הודעות נענו ועדיין מסומנות בטיפול');
  /*
    2.10 19:45: his logo arrived four times and sat as 'held', because the file
    after it failed and the line with his code never came. Nothing here looked
    at held messages, so he waited an hour and found out alone. A held message
    from the last day that is still held after three minutes is a problem: the
    code that would release it is not coming.
  */
  const h = heldProblem(all, now);
  if (h) problems.push(h);

  /*
    2.10: a shopping item sat for minutes while he was told the PC was off. A
    task still waiting 10 minutes after it was marked, or held by the PC for 25,
    is a problem, whatever the reason.
  */
  try {
    const PCDIR = path.join(path.dirname(CHAT), "..", "pc", "pc");
    fs.readdirSync(PCDIR).forEach((f) => {
      const t = readJson(path.join(PCDIR, f), null);
      if (!t || t.test) return;
      if (t.status === "pending" && now - Date.parse(t.at) > 10 * 60 * 1000) problems.push("משימה למחשב מחכה יותר מעשר דקות: " + String(t.task).slice(0, 40));
      if (t.status === "claimed" && now - Date.parse(t.claimedAt) > 25 * 60 * 1000) problems.push("המחשב תקוע על משימה יותר מ-25 דקות: " + String(t.task).slice(0, 40));
    });
  } catch (e) {}
  // The Claude login on the server (CLAUDE_CODE_OAUTH_TOKEN, set 25.9.2026)
  // lasts about a year. Warn a month ahead, and at once if the worker log shows
  // the sessions being refused.
  if (now > Date.parse('2027-08-25T00:00:00Z')) problems.push('הכניסה של קלוד בשרת פגה בקרוב, צריך לחדש');
  try {
    const wl = fs.readFileSync(process.env.WORKER_LOG || '/var/log/monitor-worker.log', 'utf8').split('\n').slice(-60).join('\n');
    if (refused(wl)) problems.push('סשנים בשרת נדחים, כנראה הכניסה של קלוד פגה');
  } catch (e) {}
  if (process.platform !== 'win32') {
    const st = show(UNIT + '.service', 'ActiveState');
    const since = when(show(UNIT + '.service', 'StateChangeTimestamp'));
    if (st === 'activating' && now - since > STUCK_MS) problems.push('המענה האוטומטי תקוע ' + Math.round((now - since) / 60000) + ' דקות');
    const last = when(show(UNIT + '.timer', 'LastTriggerUSec'));
    if (show(UNIT + '.timer', 'ActiveState') !== 'active') problems.push('השעון של המענה לא פעיל');
    else if (!isNaN(last) && now - last > TIMER_MS) problems.push('השעון של המענה לא הופעל ' + Math.round((now - last) / 60000) + ' דקות');
    const g = gitStuck(__dirname, now);
    if (g) problems.push(g);
  }
  return problems;
}

/*
  The listener's pull --rebase has stuck twice on docs/live.json and left HEAD
  detached, which looks like a permissions failure. A rebase is normal for a
  few seconds, so only one older than STUCK_MS counts. This used to be checked
  by a Claude loop three times an hour (29.9); it costs nothing here.
*/
function gitStuck(repo, now) {
  const git = path.join(repo, '.git');
  if (!fs.existsSync(git)) return '';
  for (const d of ['rebase-merge', 'rebase-apply']) {
    try { const t = fs.statSync(path.join(git, d)).mtimeMs; if (now - t > STUCK_MS) return 'הגיט בשרת תקוע באמצע rebase'; } catch (e) {}
  }
  try {
    const head = fs.readFileSync(path.join(git, 'HEAD'), 'utf8').trim();
    const t = fs.statSync(path.join(git, 'HEAD')).mtimeMs;
    if (!head.startsWith('ref:') && now - t > STUCK_MS) return 'הגיט בשרת במצב HEAD מנותק';
  } catch (e) {}
  return '';
}

/*
  How fast he is answered today: minutes from his message to my first record
  that points back at it. The median, because one slow voice note should not
  hide forty quick answers, and the share inside the two minute target.
*/
function speed(now) {
  let files = [];
  try { files = fs.readdirSync(CHAT); } catch (e) { return null; }
  const all = files.map((f) => readJson(path.join(CHAT, f), null)).filter(Boolean);
  const first = {};
  all.filter((m) => m.from === 'claude' && m.re).forEach((m) => {
    const t = Date.parse(m.at);
    if (!first[m.re] || t < first[m.re]) first[m.re] = t;
  });
  const day = new Date(now).toISOString().slice(0, 10);
  const d = all.filter((m) => m.from === 'itzik' && m.id && String(m.at).slice(0, 10) === day && first[m.id])
    .map((m) => first[m.id] - Date.parse(m.at)).filter((x) => x >= 0).sort((a, b) => a - b);
  if (!d.length) return { n: 0 };
  return { n: d.length, medianMin: Math.round(d[Math.floor(d.length / 2)] / 6000) / 10,
    inTarget: Math.round(100 * d.filter((x) => x <= TARGET_MS).length / d.length) };
}

/*
  The doctor. A fault that is still there after ten minutes is not a blip, and
  waiting for him to notice is the thing he asked to end. A Claude session is
  started on the server with the faults and the log tails, in Itzik's repo (a
  fix made in a tenant folder is overwritten by the next sync). It fixes the
  cause, runs the tests, pushes through push.js and leaves him one line in the
  chat. Three a day at most, one at a time, so a fault it cannot fix does not
  burn the day's Claude budget.
*/
const DOCTOR = path.join(STATUS, 'doctor.json');
const DOCTOR_AFTER_MS = 10 * 60 * 1000;
const DOCTOR_MAX = 3;
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function tailOf(f, n) {
  try { const L = fs.readFileSync(f, 'utf8').split('\n'); return L.slice(-n).join('\n'); } catch (e) { return ''; }
}
function doctor(problems, since, now) {
  if (process.platform === 'win32' || !process.env.WATCHDOG_DOCTOR) return;
  const persistent = problems.filter((p) => since[key(p)] && now - Date.parse(since[key(p)]) > DOCTOR_AFTER_MS);
  if (!persistent.length) return;
  const d = readJson(DOCTOR, { day: '', runs: 0, pid: 0, log: [] });
  const day = new Date(now).toISOString().slice(0, 10);
  if (d.day !== day) { d.day = day; d.runs = 0; }
  if (d.pid && alive(d.pid)) return;
  if (d.runs >= DOCTOR_MAX) return;
  const repo = process.env.WATCHDOG_DOCTOR;
  const text = [
    'אתה הרופא האוטומטי של המוניטור של איציק. השומר מצא תקלות שנמשכות יותר מעשר דקות במופע ' + inst.name + ':',
    persistent.map((p) => '- ' + p).join('\n'),
    '',
    'יומן המענה (סוף):', tailOf(process.env.WORKER_LOG || '/var/log/monitor-worker.log', 40),
    '',
    'המשימה: למצוא את הסיבה ולתקן אותה בקוד ב ' + repo + ' (לא בתיקיית לקוח, הסנכרון דורס). לתקן את המשפחה ולא את המופע.',
    'לא למחוק הודעות, לא לשלוח הודעות לאנשים, לא לשנות קובצי systemd בלי צורך מוכח.',
    'אחרי התיקון: npm test חייב לעבור, ואז node push.js "doctor: <מה תוקן>".',
    'בסוף לכתוב לאיציק רשומה אחת ב data/chat/chat/ (from "claude"), בעברית פשוטה, בלי מקפים: מה נשבר ומה תוקן, שורה או שתיים.',
    'אם אי אפשר לתקן, לכתוב לו את זה באותה רשומה ולעצור.',
  ].join('\n');
  const { spawn } = require('child_process');
  let out = 'ignore';
  try { if (process.env.WATCHDOG_LOG) out = fs.openSync(process.env.WATCHDOG_LOG, 'a'); } catch (e) {}
  const c = spawn('claude', ['-p', '--dangerously-skip-permissions'], { cwd: repo, detached: true, stdio: ['pipe', out, out], shell: true });
  c.stdin.end(text, 'utf8');
  c.unref();
  d.runs += 1; d.pid = c.pid;
  d.log = (d.log || []).concat([{ at: new Date(now).toISOString(), instance: inst.name, problems: persistent }]).slice(-30);
  try { fs.writeFileSync(DOCTOR, JSON.stringify(d, null, 1)); } catch (e) {}
  console.log('רופא הופעל (' + d.runs + '/' + DOCTOR_MAX + ' היום): ' + persistent.join(' · '));
}
function key(p) { return p.replace(/\d+/g, '#'); }

/*
  The seven o'clock network report. Itzik, 1.10: "ביקשתי ממך לעשות כל יום בשבע
  בבוקר בדיקה, אתה לא בודק". The clock lived on the PC and never reached the
  server. This runs every two minutes anyway, so from 07:00 Israel it marks the
  job once a day in the PC queue (net-daily.js --queue), and the PC does it the
  first minute it is on. A stamp per day keeps it to one try, even if the PC
  job fails. His instance only: the customers' monitors have no such report.
*/
const NET_STAMP = path.join(STATUS, 'net-daily-queued.json');
function netDaily(now) {
  if (inst.name !== 'abaitzik') return;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now)).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
  const day = p.year + '-' + p.month + '-' + p.day;
  if (+p.hour < 7 || readJson(NET_STAMP, {}).day === day) return;
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'net-daily.js'), '--queue'],
      { cwd: __dirname, encoding: 'utf8', env: Object.assign({}, process.env, { TZ: 'Asia/Jerusalem' }), timeout: 30000 });
    fs.writeFileSync(NET_STAMP, JSON.stringify({ day, at: new Date(now).toISOString(), out: String(out).trim().slice(0, 300) }));
    console.log('דוח רשתות: ' + String(out).trim().slice(0, 120));
  } catch (e) { console.log('!! דוח הרשתות לא סומן למחשב: ' + e.message); }
}

function main() {
  const now = Date.now();
  const problems = check(now);
  const prev = readJson(OUT, { told: {} });
  const told = prev.told || {};
  const fresh = problems.filter((p) => { const k = key(p); return !told[k] || now - Date.parse(told[k]) > RETELL_MS; });
  // since: when each current fault was first seen, for the doctor's ten minutes.
  const since = {};
  problems.forEach((p) => { since[key(p)] = (prev.since || {})[key(p)] || new Date(now).toISOString(); });
  const sp = speed(now);
  console.log(new Date(now).toISOString().slice(11, 19) + '  ' + (problems.length ? 'תקלות: ' + problems.join(' · ') : 'תקין')
    + (sp && sp.n ? '  | היום ' + sp.n + ' תשובות, חציון ' + sp.medianMin + ' דק׳, ' + sp.inTarget + '% בתוך שתי דקות' : ''));
  if (DRY) return;
  netDaily(now);
  doctor(problems, since, now);
  if (fresh.length) {
    try {
      require('./lib/notify-channels.js').notify('השומר מצא תקלה', fresh.join('\n'));
      fresh.forEach((p) => { told[p.replace(/\d+/g, '#')] = new Date(now).toISOString(); });
    } catch (e) { console.log('!! ההתראה לא נשלחה: ' + e.message); }
  }
  Object.keys(told).forEach((k) => { if (now - Date.parse(told[k]) > 24 * 3600 * 1000) delete told[k]; });
  try { fs.mkdirSync(STATUS, { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ at: new Date(now).toISOString(), problems, told, since, speed: sp }, null, 1)); } catch (e) {}
}

if (require.main === module) main();
module.exports = { refused, check, when, speed, gitStuck, heldProblem };
