'use strict';
/*
  19.11.2026: the PC copy of this repo was found 540 commits behind the server. Nothing on the PC ever pulled, and a
  session that left uncommitted edits here blocked a manual pull, so the PC's scheduled tasks (pc-pull, cal-pull,
  vercel-check, memory-sync) kept running code a week old. Itzik: "אז תתקן את זה".
  Scheduled task AbaItzikRepoSync, every 30 minutes, hidden. Fast-forward only: it never merges, resets or deletes.
  A dirty tree or a fork from origin is left as it is, with one push a day (notify.js) saying so.
*/
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const stateFile = path.join(dir, 'data', 'status', 'repo-sync.json');
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
let st = {};
try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) { st = {}; }

function save(o) { try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(Object.assign(st, o, { at: new Date().toISOString() }), null, 1)); } catch (e) { console.error('state: ' + e.message); } }
function warn(why) {
  console.log('not synced: ' + why);
  if (st.warned === day) return save({ ok: false, why });
  try { execFileSync('node', ['notify.js', 'המחשב לא מעודכן', 'התיקייה abaitzik-monitor במחשב לא התעדכנה מהשרת: ' + why + '. המשימות במחשב מריצות קוד ישן עד שמסדרים.'], { cwd: dir, stdio: 'pipe' }); save({ ok: false, why, warned: day }); }
  catch (e) { console.error('notify: ' + e.message); save({ ok: false, why }); }
}

try {
  git('fetch', '-q', 'origin');
  const behind = Number(git('rev-list', '--count', 'HEAD..origin/main'));
  const ahead = Number(git('rev-list', '--count', 'origin/main..HEAD'));
  if (!behind) { console.log('up to date'); save({ ok: true, why: '' }); process.exit(0); }
  if (ahead) { warn(ahead + ' שינויים מקומיים שלא עלו לשרת'); process.exit(0); }
  const dirty = git('status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean);
  try { git('merge', '--ff-only', '-q', 'origin/main'); console.log('pulled ' + behind); save({ ok: true, why: '', pulled: behind }); }
  catch (e) { warn((dirty.length ? dirty.length + ' קבצים ששונו במחשב ולא נשמרו' : 'המיזוג נכשל') + ', ' + behind + ' עדכונים מחכים'); }
} catch (e) { warn('git: ' + String(e.message || e).split('\n')[0].slice(0, 100)); }
