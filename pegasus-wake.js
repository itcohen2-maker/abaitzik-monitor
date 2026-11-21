/*
  Wakes Pegasus, the Claude session that builds the game, every ten minutes.

  Itzik, 10.10 (voice): work around the clock without waiting for him; plan on
  Opus 5.5, execute through the cheapest model (haiku subagent), check the result.

  Itzik, 1.10 (voice, again): "כל עשר דקות אתה בודק את פגסוס אם הוא סיים את
  המנוחה שלו או את המשימה ואתה מדליק אותו מחדש ונותן לו להמשיך לעבוד".
  The earlier timer was a CronCreate inside one session and died with it, so
  this runs from a hidden scheduled task (setup-pegasus-wake.ps1) instead.

  Each run: find Pegasus's session (the newest transcript in its project
  folders). If it was written in the last few minutes it is still working, so
  skip. If a wake from an earlier run is still going, skip (lock file). Else
  resume that same session headless with the standing message and log what it
  answered. A usage-limit answer is just logged; the next run tries again.

  Usage: node pegasus-wake.js [--dry]
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

if (process.platform !== 'win32') { console.log('pegasus-wake runs on the PC only.'); process.exit(0); }

const HERE = __dirname;
const inst = require('./lib/instance.js');
const STATUS = path.join(inst.dataPath, 'status');
const LOG = path.join(STATUS, 'pegasus-wake.log');
const LOCK = path.join(STATUS, 'pegasus-wake.lock');
const PROJECTS = 'C:/Users/User/.claude/projects';
// Pegasus has worked from the main repo and from the audit worktree.
const DIRS = ['C--Users-User-OneDrive-Documents-pegasus', 'C--Users-User-AppData-Local-Temp-pegasus-audit-scoreboard-20260908'];
const BUSY_MS = 8 * 60 * 1000;
const REPO = 'C:/Users/User/OneDrive/Documents/pegasus';
const MAX_RUN_MS = 2 * 60 * 60 * 1000;
const DRY = process.argv.includes('--dry');
const MESSAGE = 'הפעלה אוטומטית של פגסוס (כל 10 דקות, 24 שעות, לבקשת איציק 10.10): אל תחכה להוראות מאיציק ותמשיך לעבוד כל הזמן. תמשיך את המשימה הבאה בתוכנית מאיפה שעצרת. אם אין משימה פתוחה, תתכנן את הצעד הבא לפי התוכניות ב-docs, תרשום אותו ב-docs ותבצע אותו; אל תעצור עם שורת מצב. התכנון שלך על Opus 5.5; את הביצוע תעביר לסוכן במודל הזול ביותר (כלי Agent עם model: haiku), ותבדוק בעצמך את מה שחזר לפני קומיט, פריסה או דיווח.';

const SERVER_BRANCH = 'origin/server/pegasus';
const MAIN_BRANCH = 'origin/codex/release-snapshot-20260906';
const SERVER_NOTE = ' יש בענף server/pegasus עבודה מהשרת שעוד לא בקוד הראשי (%N קומיטים). קודם כול: תמזג או תעביר את העבודה מהענף server/pegasus לקוד הראשי, תבדוק חי בדפדפן, תפרוס לפי הנוהל ב-AGENTS.md, ואז תעשה snapshot כרגיל.';

// The server wakes Pegasus while the PC is off and commits to server/pegasus
// (it cannot deploy, no browser). Count what is there and not in the main line.
function serverWork(cwd) {
  try {
    execFileSync('git', ['fetch', '--quiet', 'origin'], { cwd, windowsHide: true, timeout: 120000, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) { say('warn: git fetch failed: ' + String(e.stderr || e.message).trim().slice(0, 300)); }
  try {
    const n = parseInt(execFileSync('git', ['rev-list', '--count', MAIN_BRANCH + '..' + SERVER_BRANCH], { cwd, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(), 10);
    return n > 0 ? n : 0;
  } catch (e) { say('warn: server branch check failed: ' + String(e.stderr || e.message).trim().slice(0, 300)); return 0; }
}

function say(line) {
  const l = new Date().toISOString() + ' ' + line;
  try { fs.mkdirSync(STATUS, { recursive: true }); fs.appendFileSync(LOG, l + '\n', 'utf8'); } catch (e) { console.error('log write failed: ' + e.message); }
  console.log(l);
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function newestSession() {
  let best = null;
  for (const d of DIRS) {
    const dir = path.join(PROJECTS, d);
    let names = [];
    try { names = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl')); } catch (e) { continue; }
    for (const n of names) {
      const p = path.join(dir, n);
      const m = fs.statSync(p).mtimeMs;
      if (!best || m > best.mtime) best = { id: n.slice(0, -6), file: p, mtime: m };
    }
  }
  if (!best) return null;
  // The working folder is recorded on every line; take the last one.
  const fd = fs.openSync(best.file, 'r');
  const size = fs.fstatSync(fd).size;
  const len = Math.min(size, 256 * 1024);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  const cwds = buf.toString('utf8').match(/"cwd":"((?:[^"\\]|\\.)*)"/g) || [];
  best.cwd = cwds.length ? JSON.parse('{' + cwds[cwds.length - 1] + '}').cwd : null;
  return best;
}

function main() {
  if (fs.existsSync(LOCK)) {
    let held = null;
    try { held = JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch (e) {}
    if (held && alive(held.pid) && Date.now() - held.at < MAX_RUN_MS + 10 * 60 * 1000) {
      say('skip: a wake from ' + new Date(held.at).toISOString() + ' is still running (pid ' + held.pid + ')');
      return;
    }
    say('stale lock removed');
    fs.unlinkSync(LOCK);
  }

  /*
    16.10.2026, Itzik: "תמיד תחשבו איך אנחנו חוסכים". The ten minute wake that
    resumed one giant session (1,688 wakes) and answered "nothing new" 144
    times a day burned 200 dollars of API credit in nine hours. From now on a
    wake starts Claude only when there is work it alone can do: commits on the
    server branch that need a live check and a deploy. Decisions Itzik makes on
    the Pegasus screen reach the PC through the task queue (pc-pull.js, Haiku),
    not through this. And it is a fresh short session each time, never a resume.
  */
  const s = newestSession();
  if (s && Date.now() - s.mtime < BUSY_MS) { say('skip: Pegasus is working (session ' + s.id + ' written ' + Math.round((Date.now() - s.mtime) / 1000) + 's ago)'); return; }
  const cwd = REPO;
  const pending = serverWork(cwd);
  if (!pending) { say('skip: no work (server branch merged; decisions travel through the PC queue)'); return; }
  say('wake: ' + pending + ' commits on server/pegasus to verify and deploy, fresh session in ' + cwd);
  if (DRY) { say('dry: not starting'); return; }

  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now(), session: 'fresh' }));
  const env = Object.assign({}, process.env);
  const message = 'הפעלה אוטומטית של פגסוס (לבקשת איציק). קרא קודם AGENTS.md ו-CLAUDE.md בתיקייה הזאת.' + SERVER_NOTE.replace('%N', pending)
    + ' עבודה אחת שלמה ואז עצור. בסוף: שורה אחת מה נעשה ואיפה רואים.';
  // Plan on Opus with read only tools, execute on Haiku: the iron rule of 14.10.
  let plan = '';
  try {
    const r = require('child_process').spawnSync('claude', ['-p', '--model', 'claude-opus-5-5', '--output-format', 'json', '--allowedTools', 'Read', 'Grep', 'Glob', '--max-turns', '6'],
      { cwd, shell: true, windowsHide: true, env, encoding: 'utf8', timeout: 10 * 60 * 1000,
        input: 'תכנן בלבד, אל תשנה קבצים. כתוב תוכנית קצרה וממוספרת (עד 15 שורות) לביצוע על ידי סוכן זול:\n' + message });
    const j = JSON.parse(r.stdout || '{}');
    if (j && !j.is_error && j.result) plan = String(j.result).slice(0, 6000);
    say('plan: ' + plan.length + ' chars from opus');
  } catch (e) { say('warn: planning failed, executing without a plan: ' + e.message.slice(0, 200)); }
  const child = spawn('claude', ['--model', 'haiku', '-p', '--dangerously-skip-permissions'], { cwd, shell: true, windowsHide: true, env });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.stdin.end(message + (plan ? '\n\nהתוכנית (מאופוס):\n' + plan : ''));
  const timer = setTimeout(() => { say('timeout: killing after ' + MAX_RUN_MS / 60000 + ' min'); child.kill(); }, MAX_RUN_MS);
  child.on('close', code => {
    clearTimeout(timer);
    try { fs.unlinkSync(LOCK); } catch (e) {}
    const text = out.trim().replace(/\s+/g, ' ');
    const limited = /usage limit|limit reached|rate limit|resets? at/i.test(text);
    say((limited ? 'limit' : 'done') + ' (exit ' + code + '): ' + text.slice(-1500));
  });
  child.on('error', e => { try { fs.unlinkSync(LOCK); } catch (x) {} say('error: spawn failed: ' + e.message); });
}

main();
