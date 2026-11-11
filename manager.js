'use strict';
/*
  The manager's round (Itzik, 4.11.2026: "נגדיר אותך כמנהל"). Server only, timer
  monitor-manager.timer at 07:25, 13:00 and 18:00 Israel; cal-pull.js on the PC also
  runs it right after it reads the calendar (07:15).

  Writes data/manager/manager/<YYYYMMDD>.json (the "המנהל" card on the home screen,
  lib/manager.js), schedules a ntfy alarm 30 minutes before each timed calendar
  event of today (alarm.js, once per event), and pushes:
    morning: one push with what is left for him today (once a day),
    18:00:   one push only if "מה בצלחת" or the WhatsApp status is still open.
  Budget: at most 2 pushes a day plus one per timed event.

  Usage: node manager.js [--dry] [--evening]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');
const M = require('./lib/manager.js');

const DRY = process.argv.includes('--dry');
const EVENING = process.argv.includes('--evening') ||
  Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false })) >= 17;
const dataPath = inst.dataPath;
const dir = path.join(dataPath, 'manager');
const stateFile = path.join(dir, 'state.json');

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function log(s) { console.log(new Date().toISOString().slice(0, 19) + '  ' + s); }
function run(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { log('!! ' + args[0] + ' failed: ' + String(e.stderr || e.message).slice(0, 200)); return null; }
}

if (!DRY && !EVENING) run('node', ['manager-work.js']); // 8.11: the manager's own checks first, so the card shows them

const now = Date.now();
const inp = M.gather(dataPath, __dirname, now);
// 10.11: the setup forms that came back are pulled into the customers' monitors first (lib/setup-intake.js); --dry only reads the last result
inp.intake = (() => { try { return DRY ? JSON.parse(fs.readFileSync(path.join(dataPath, 'setup-intake', 'summary.json'), 'utf8')) : require('./lib/setup-intake.js').managerRound({ data: dataPath }); } catch (e) { log('intake: ' + String(e.message).slice(0, 100)); return null; } })();
const m = M.build(inp);
if (DRY) { console.log(JSON.stringify(m, null, 1)); console.log(M.pushText(m)); process.exit(0); }

fs.mkdirSync(path.join(dir, 'manager'), { recursive: true });
fs.writeFileSync(path.join(dir, 'manager', m.day.replace(/-/g, '') + '.json'), JSON.stringify(m, null, 1));
log('round ' + m.day + ': ' + m.items.map(i => i.k + '=' + i.st).join(' '));

const st = readJson(stateFile, {});
st.alarms = (st.alarms || []).filter(x => x.startsWith(m.day));
// 11.11: a plate story posted and not on the site or in the highlight: the manager sends the PC job himself, once per item.
st.plateSite = st.plateSite || {};
for (const it of M.plateSiteMissing(inp.plate, now)) {
  if (st.plateSite[it.id]) continue;
  if (run('node', ['pc-task.js', 'add', '--quiet', '--re', 'plate-site-' + it.id, M.plateSiteJob(it)]) !== null) { st.plateSite[it.id] = new Date(now).toISOString(); log('plate site job ' + it.id); }
}
// 11.11: open external approvals are checked by the PC itself (browser + mail): pending or needs info once a day, not submitted once a week.
st.apprTask = st.apprTask || {};
for (const a of (inp.approvals || [])) {
  const A = require('./approvals.js');
  if (!A.OPEN(a.status)) continue;
  const gap = (a.status === 'notSubmitted' ? 7 * 24 : 20) * 3600e3;
  if (st.apprTask[a.id] && now - Date.parse(st.apprTask[a.id]) < gap) continue;
  if (run('node', ['pc-task.js', 'add', '--quiet', '--re', 'approval-' + a.id, A.taskText(a)]) !== null) { st.apprTask[a.id] = new Date(now).toISOString(); log('approval check ' + a.id); }
}
for (const e of M.alarmsDue(m, now, st.alarms)) {
  const at = new Date(e.ms - 30 * 60000).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
  const out = run('node', ['alarm.js', at, 'בעוד חצי שעה: ' + e.title + (e.where ? ', ' + e.where : '')]);
  if (out !== null) { st.alarms.push(m.day + '|' + e.id); log('alarm ' + at + ' ' + e.title); }
}

const p = M.pushText(m);
const HOUR = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }));
const li = m.items.find(i => i.k === 'linkedin' && i.st === 'warn');
if (!EVENING && st.pushed !== m.day && p) {
  if (run('node', ['notify.js', p.title, p.body]) !== null) { st.pushed = m.day; st.pushedAt = new Date().toISOString(); } // 10.11: pushedAt feeds the 08:30 WhatsApp fallback (lib/morning-wa.js)
} else if (!EVENING && HOUR >= 12 && li && st.liNoon !== m.day) {
  // 9.11: the 13:00 round, one more reminder for a LinkedIn post still waiting for his approval (once a day)
  if (run('node', ['notify.js', 'המנהל: ' + li.t, li.sub]) !== null) st.liNoon = m.day;
} else if (EVENING && st.evening !== m.day) {
  const open = m.items.filter(i => ((i.k === 'plate' || i.k === 'status') && i.st === 'todo') || (i.k === 'linkedin' && i.st === 'warn'));
  if (open.length && run('node', ['notify.js', 'תזכורת ערב', open.map(i => i.t + ': ' + i.sub).join('\n')]) !== null) st.evening = m.day;
}
// 10.11: an item waiting in 📋 לטיפול for more than 3 hours is pushed again at the 13:00 and 18:00 rounds (once per round).
// The push follows quiet hours like any push; the tile on the home screen blinks at every hour.
const hd = m.items.find(i => i.k === 'handle');
if (hd && hd.hours > 3 && !(HOUR < 12) && st.handleAt !== m.day + '-' + (EVENING ? 'e' : 'n')) {
  if (run('node', ['notify.js', 'המנהל: ' + hd.t, hd.sub]) !== null) st.handleAt = m.day + '-' + (EVENING ? 'e' : 'n');
}
fs.writeFileSync(stateFile, JSON.stringify(st));
run('node', ['push.js', 'manager round']);
