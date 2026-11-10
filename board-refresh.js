// 10.11.2026, Itzik: "🎛️ לוח בקרה: הלוח לא מעודכן". The automation part of the board (the
// "⚙️ האוטומציות" rows: when each one last ran and its last log line) is baked into the sealed
// page payload at build time, so it stayed frozen until something else pushed. This runs every
// 10 minutes from cron, and pushes (push.js, which builds) only when one of those logs changed.
// Plain code, no model. The list mirrors `auto` in build.js (the board block).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const STATE = path.join(__dirname, 'data', 'status', 'board-refresh.json');
const LOGS = ['/home/monitor/ai-post.log', '/home/monitor/ner-post.log', '/home/monitor/linkedin-post.log',
  '/home/monitor/wa-status-morning.log', '/home/monitor/camp-daily.log', '/home/monitor/stock-check.log',
  '/home/monitor/social-run.log', '/var/log/monitor-ads.log'];
const DRY = process.argv.includes('--dry');

function signature() {
  return LOGS.map((f) => {
    try { return f + '@' + fs.statSync(f).mtime.toISOString(); } catch (e) { return f + '@none'; }
  }).join('|');
}

let prev = '';
try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')).sig || ''; } catch (e) {}
const sig = signature();
if (sig === prev) {
  console.log('board: no change');
  process.exit(0);
}
if (DRY) {
  console.log('board: would push (changed)');
  process.exit(0);
}
execFileSync('node', ['push.js', 'board: automation status'], { cwd: __dirname, stdio: 'ignore', timeout: 240000 });
fs.writeFileSync(STATE, JSON.stringify({ sig, at: new Date().toISOString() }) + '\n');
console.log('board: pushed');
