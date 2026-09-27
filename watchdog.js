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
const WAIT_MS = 15 * 60 * 1000;      // a message older than this with no answer
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
  if (late.length) problems.push(late.length === 1 ? 'הודעה אחת מחכה יותר מרבע שעה בלי תשובה' : late.length + ' הודעות מחכות יותר מרבע שעה בלי תשובה');
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

function main() {
  const now = Date.now();
  const problems = check(now);
  const prev = readJson(OUT, { told: {} });
  const told = prev.told || {};
  const fresh = problems.filter((p) => { const k = p.replace(/\d+/g, '#'); return !told[k] || now - Date.parse(told[k]) > RETELL_MS; });
  console.log(new Date(now).toISOString().slice(11, 19) + '  ' + (problems.length ? 'תקלות: ' + problems.join(' · ') : 'תקין'));
  if (DRY) return;
  if (fresh.length) {
    try {
      require('./lib/notify-channels.js').notify('השומר מצא תקלה', fresh.join('\n'));
      fresh.forEach((p) => { told[p.replace(/\d+/g, '#')] = new Date(now).toISOString(); });
    } catch (e) { console.log('!! ההתראה לא נשלחה: ' + e.message); }
  }
  Object.keys(told).forEach((k) => { if (now - Date.parse(told[k]) > 24 * 3600 * 1000) delete told[k]; });
  try { fs.mkdirSync(STATUS, { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ at: new Date(now).toISOString(), problems, told }, null, 1)); } catch (e) {}
}

if (require.main === module) main();
module.exports = { check, when };
