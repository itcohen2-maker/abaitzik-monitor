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

  if (process.platform !== 'win32') {
    const st = show(UNIT + '.service', 'ActiveState');
    const since = when(show(UNIT + '.service', 'StateChangeTimestamp'));
    if (st === 'activating' && now - since > STUCK_MS) problems.push('המענה האוטומטי תקוע ' + Math.round((now - since) / 60000) + ' דקות');
    const last = when(show(UNIT + '.timer', 'LastTriggerUSec'));
    if (show(UNIT + '.timer', 'ActiveState') !== 'active') problems.push('השעון של המענה לא פעיל');
    else if (!isNaN(last) && now - last > TIMER_MS) problems.push('השעון של המענה לא הופעל ' + Math.round((now - last) / 60000) + ' דקות');
  }
  return problems;
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
module.exports = { check, when, speed };
