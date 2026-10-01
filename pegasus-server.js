/*
  Pegasus keeps working while the PC is off.

  Itzik, 1.10: every ten minutes, check Pegasus; if it finished its rest or its
  task, wake it and let it go on. The PC does that (AbaItzikPegasusWake), and
  then he added: "גם אם המחשב מכובה יש לנו את השרת". So this is the same wake,
  on the server, for the hours the PC is asleep.

  It stands in only while the PC is off: pc-task.js `next` is called by the PC
  every minute it is awake and leaves data/status/pc-seen.json behind. Seen in
  the last PC_FRESH_MS, the PC owns Pegasus and this exits.

  What the server may not do: deploy. The server has no browser, and every
  Pegasus release is verified live in one before it ships (AGENTS.md, and the
  26.9 incident where deploys from a stale line removed 268 live commits). So
  the session here builds and tests on its own branch, server/pegasus, pushes
  that branch, and the PC verifies, merges and deploys when it is back.

  Guards against burning tokens (29.9, a Claude loop burned 30M):
    one run at a time (lock), a pause after a usage limit, a pause while the
    session says there is nothing open and the PC line has not moved, and a
    daily cap.

  Timer: monitor-pegasus.timer, every 10 minutes. Log: /var/log/monitor-pegasus.log.
  Usage: node pegasus-server.js [--dry]   --dry decides and prints, runs nothing.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const REPO = process.env.PEGASUS_REPO || path.join(__dirname, '..', 'pegasus');
const PC_LINE = 'origin/codex/release-snapshot-20260906';
const BRANCH = 'server/pegasus';
const STATUS = path.join(inst.dataPath, 'status');
const SEEN = path.join(STATUS, 'pc-seen.json');
const STATE = path.join(STATUS, 'pegasus-server.json');
const LOCK = path.join(STATUS, 'pegasus-server.lock');
const PC_FRESH_MS = 5 * 60 * 1000;
const LIMIT_PAUSE_MS = 30 * 60 * 1000;
const IDLE_PAUSE_MS = 3 * 60 * 60 * 1000;
const DAILY_CAP = 30;
const RUN_TIMEOUT_MS = 45 * 60 * 1000;
const DRY = process.argv.includes('--dry');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function log(...a) { console.log(new Date().toISOString(), ...a); }
function git(...args) { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }

// The decision alone, so it can be tested without a repo or a Claude.
function decide({ now, pcSeenAt, state, pcHead }) {
  if (pcSeenAt && now - Date.parse(pcSeenAt) < PC_FRESH_MS) return 'pc-on';
  if (state.pauseUntil && now < Date.parse(state.pauseUntil)) return 'limit-pause';
  if (state.idleAt && state.idleHead === pcHead && now - Date.parse(state.idleAt) < IDLE_PAUSE_MS) return 'idle';
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.day === day && (state.runs || 0) >= DAILY_CAP) return 'cap';
  return 'run';
}

// Put server/pegasus on the newest PC line when it has nothing of its own.
function sync() {
  git('fetch', '-q', 'origin');
  const has = (() => { try { git('rev-parse', '--verify', '-q', BRANCH); return true; } catch (e) { return false; } })();
  if (git('status', '--porcelain')) {
    if (git('rev-parse', '--abbrev-ref', 'HEAD') !== BRANCH && has) log('note: uncommitted changes off', BRANCH);
    return 'dirty';
  }
  if (!has) { git('checkout', '-q', '-b', BRANCH, PC_LINE); return 'created'; }
  git('checkout', '-q', BRANCH);
  const mine = Number(git('rev-list', '--count', PC_LINE + '..' + BRANCH));
  const pcNew = Number(git('rev-list', '--count', BRANCH + '..' + PC_LINE));
  if (pcNew && !mine) { git('reset', '-q', '--hard', PC_LINE); return 'moved'; }
  return pcNew ? 'behind' : 'ok';
}

function prompt() {
  return [
    'הפעלה אוטומטית של פגסוס מהשרת (כל 10 דקות, לבקשת איציק, רק כשהמחשב שלו כבוי).',
    'אתה בתיקיית המשחק בשרת, על הענף ' + BRANCH + '. קרא את AGENTS.md ו-CLAUDE.md, ואת התוכניות ב-docs.',
    'תמשיך לעבוד על המשימה הבאה בתוכנית של פגסוס מאיפה שעצרו, חבילה אחת קטנה ושלמה.',
    'אם הענף שלך מאחורי ' + PC_LINE + ', קודם תעשה rebase עליו.',
    'כללים לשרת: אין כאן דפדפן ואין פריסה. לא npm run deploy, לא vercel, לא לגעת בענפים אחרים ולא ב-main.',
    'בודקים עם npx tsc --noEmit ועם הטסטים של החלק שנגעת בו, מקמטים ודוחפים רק את ' + BRANCH + ' (git push origin ' + BRANCH + ').',
    'בסוף תוסיף שורה ב-AGENTS.md: מה נבנה בשרת, שלא נבדק חי, ושהמחשב צריך לבדוק חי ולפרוס.',
    'אם אין משימה פתוחה שאפשר לעשות בלי דפדפן, אל תמציא עבודה: כתוב שורה אחת מה המצב, ובשורה האחרונה רק PEGASUS-IDLE.',
  ].join('\n');
}

function runClaude(text) {
  return new Promise((resolve) => {
    const child = spawn('claude', ['-p', '--dangerously-skip-permissions', '--output-format', 'text'], { cwd: REPO, env: process.env });
    let out = '';
    const timer = setTimeout(() => { out += '\n[timeout]'; child.kill('SIGTERM'); }, RUN_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
    child.stdin.end(text);
  });
}

async function main() {
  const now = Date.now();
  const state = readJson(STATE, {});
  const seen = readJson(SEEN, {});
  let pcHead = '';
  try { pcHead = git('rev-parse', PC_LINE); } catch (e) { log('error: no pegasus repo at', REPO); return; }
  const what = decide({ now, pcSeenAt: seen.at, state, pcHead });
  if (what !== 'run') { log('skip', what); return; }
  if (DRY) { log('would run'); return; }

  fs.mkdirSync(STATUS, { recursive: true });
  try { fs.mkdirSync(LOCK); } catch (e) {
    const age = now - fs.statSync(LOCK).mtimeMs;
    if (age < RUN_TIMEOUT_MS + 5 * 60 * 1000) { log('skip running'); return; }
    log('stale lock, taking it');
  }
  try {
    log('sync', sync());
    const day = new Date(now).toISOString().slice(0, 10);
    const runs = state.day === day ? (state.runs || 0) + 1 : 1;
    fs.writeFileSync(STATE, JSON.stringify(Object.assign({}, state, { day, runs, lastRun: new Date(now).toISOString() })));
    log('wake', 'run', runs, 'today');
    const { code, out } = await runClaude(prompt());
    const tail = out.trim().split('\n').slice(-3).join(' | ').slice(0, 400);
    const next = Object.assign(readJson(STATE, {}), { lastCode: code, lastTail: tail });
    delete next.idleAt; delete next.idleHead; delete next.pauseUntil;
    if (/usage limit|rate limit|limit reached|hit your limit/i.test(out)) {
      next.pauseUntil = new Date(Date.now() + LIMIT_PAUSE_MS).toISOString();
      log('limit', tail);
    } else if (/PEGASUS-IDLE\s*$/.test(out.trim())) {
      next.idleAt = new Date().toISOString();
      next.idleHead = pcHead;
      log('idle', tail);
    } else {
      log('done', code, tail);
    }
    fs.writeFileSync(STATE, JSON.stringify(next));
  } finally {
    try { fs.rmdirSync(LOCK); } catch (e) {}
  }
}

if (require.main === module) main().catch((e) => log('error', e.message));
module.exports = { decide, PC_FRESH_MS, IDLE_PAUSE_MS, DAILY_CAP };
