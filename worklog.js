#!/usr/bin/env node
'use strict';
/*
  worklog.js: the daily work log (19.11.2026, Itzik: "תיישם את זה ברשימת לוגים שבועית", after the reel of eliron.giny).

  At the end of every task, every Claude session (on his PC or on the server) writes one entry:
    node worklog.js --task "מה ביקשו" --done "מה עשיתי" --changed "קבצים" --failed "מה נכשל" --tests "מה הרצתי" --auto "מה כדאי להפוך לאוטומציה"
  Every flag is optional except --task. Longer notes can come on stdin with --stdin (node worklog.js --task "..." --stdin < notes.txt).

  Where it lands: one file per Israel day, /home/monitor/work-logs/YYYY-MM-DD.md on the server, outside git (it can
  hold names and numbers, and the repo is public). From the PC the entry goes over ssh; if the server cannot be
  reached it waits in C:\Users\User\work-logs\queue and goes with the next entry.

  Every Friday weekly-logs.js reads the week and writes the summary report to the monitor.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SERVER_DIR = '/home/monitor/work-logs';
const ON_SERVER = fs.existsSync('/home/monitor/abaitzik-monitor');
const QUEUE = path.join(os.homedir(), 'work-logs', 'queue');
const KEY = path.join(os.homedir(), '.ssh', 'monitor_server');
const HOST = 'root@178.105.63.97';

function arg(name) {
  const a = process.argv.slice(2), i = a.indexOf('--' + name);
  return i >= 0 && i + 1 < a.length ? String(a[i + 1]).trim() : '';
}
function israel(d, opts) { return new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: 'Asia/Jerusalem' }, opts)).format(d); }
function dayOf(d) { return israel(d, { year: 'numeric', month: '2-digit', day: '2-digit' }); }
function timeOf(d) { return israel(d, { hour: '2-digit', minute: '2-digit', hour12: false }); }

function entry(now) {
  const lines = [['task', 'משימה'], ['done', 'מה עשיתי'], ['changed', 'מה שיניתי'], ['failed', 'מה נכשל'], ['tests', 'בדיקות שהרצתי'], ['auto', 'כדאי להפוך לאוטומציה']]
    .map(([k, he]) => { const v = arg(k); return v ? '- **' + he + ':** ' + v.replace(/\r?\n/g, ' ') : ''; }).filter(Boolean);
  let extra = '';
  if (process.argv.includes('--stdin')) { try { extra = fs.readFileSync(0, 'utf8').trim(); } catch (e) { extra = ''; } }
  if (extra) lines.push(extra);
  const where = (ON_SERVER ? 'שרת' : 'מחשב') + ' · ' + path.basename(process.cwd());
  return '\n## ' + timeOf(now) + ' · ' + where + '\n' + lines.join('\n') + '\n';
}

function appendServer(day, text) {
  if (ON_SERVER) {
    fs.mkdirSync(SERVER_DIR, { recursive: true });
    const f = path.join(SERVER_DIR, day + '.md');
    if (!fs.existsSync(f)) fs.writeFileSync(f, '# יומן עבודה ' + day + '\n');
    fs.appendFileSync(f, text);
    return true;
  }
  const cmd = 'mkdir -p ' + SERVER_DIR + ' && chown monitor:monitor ' + SERVER_DIR + ' && f=' + SERVER_DIR + '/' + day + '.md && '
    + '{ [ -f "$f" ] || echo "# יומן עבודה ' + day + '" > "$f"; } && cat >> "$f" && chown monitor:monitor "$f"';
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', HOST, cmd], { input: text, encoding: 'utf8', timeout: 30000 });
  return r.status === 0;
}

function flushQueue() {
  let names = [];
  try { names = fs.readdirSync(QUEUE).filter((n) => n.endsWith('.md')).sort(); } catch (e) { return; }
  for (const n of names) {
    const f = path.join(QUEUE, n);
    if (!appendServer(n.slice(0, 10), fs.readFileSync(f, 'utf8'))) return;
    fs.unlinkSync(f);
  }
}

function main() {
  if (!arg('task')) { console.error('חסר --task'); process.exit(2); }
  const now = new Date(), day = dayOf(now), text = entry(now);
  if (!ON_SERVER) flushQueue();
  if (appendServer(day, text)) { console.log('נרשם ביומן ' + day); return; }
  fs.mkdirSync(QUEUE, { recursive: true });
  fs.writeFileSync(path.join(QUEUE, day + '-' + now.getTime() + '.md'), text);
  console.log('השרת לא זמין, נשמר בתור ויישלח עם הרישום הבא');
}

if (require.main === module) main();
module.exports = { dayOf, timeOf };
