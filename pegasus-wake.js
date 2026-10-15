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

  const s = newestSession();
  if (!s || !s.cwd || !fs.existsSync(s.cwd)) { say('error: no Pegasus session found ' + JSON.stringify(s)); process.exitCode = 1; return; }
  const idle = Date.now() - s.mtime;
  if (idle < BUSY_MS) { say('skip: Pegasus is working (session ' + s.id + ' written ' + Math.round(idle / 1000) + 's ago)'); return; }

  say('wake: session ' + s.id + ' idle ' + Math.round(idle / 60000) + ' min, cwd ' + s.cwd);
  const pending = serverWork(s.cwd);
  const message = pending ? MESSAGE + SERVER_NOTE.replace('%N', pending) : MESSAGE;
  say('server/pegasus: ' + pending + ' commits not in ' + MAIN_BRANCH);
  if (DRY) { say('dry: not starting'); return; }

  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now(), session: s.id }));
  // 14.10.2026: Pegasus runs on the $200 monthly API credit of the Max 20x plan
  // (key in ~/.claude/pegasus-api-key.txt, valid to 13.11), not on the subscription.
  const env = Object.assign({}, process.env);
  try { env.ANTHROPIC_API_KEY = require('fs').readFileSync('C:/Users/User/.claude/pegasus-api-key.txt', 'utf8').trim(); delete env.CLAUDE_CODE_OAUTH_TOKEN; } catch (e) {}
  const child = spawn('claude', ['--resume', s.id, '--model', 'haiku', '-p', '--dangerously-skip-permissions'], { cwd: s.cwd, shell: true, windowsHide: true, env });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.stdin.end(message);
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
