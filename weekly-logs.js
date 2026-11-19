#!/usr/bin/env node
'use strict';
/*
  weekly-logs.js: every Friday morning, Claude reads the week's work logs (worklog.js, /home/monitor/work-logs) and
  writes one report to the monitor (19.11.2026, Itzik: "תיישם את זה ברשימת לוגים שבועית"):
    - what repeats and is worth an automation, and how much time it would save;
    - what failed or went wrong, and which test or validation stops it next time;
    - decisions taken this week (a short list to come back to);
    - where the time went.
  One claude -p call, no tools, Sonnet. Run by monitor-weekly-logs.timer; --dry prints instead of writing.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { dayOf } = require('./worklog.js');

const ROOT = __dirname;
const LOGS = '/home/monitor/work-logs';
const DRY = process.argv.includes('--dry');

function weekFiles(now) {
  const days = [];
  for (let i = 7; i >= 1; i--) days.push(dayOf(new Date(now - i * 864e5)));
  return days.map((d) => path.join(LOGS, d + '.md')).filter((f) => fs.existsSync(f));
}

const SYSTEM = [
  'אתה עובר על יומני העבודה של השבוע של סוכני קלוד שעובדים בשביל איציק כהן (מוניטור אבא איציק, IT Solution, הרשתות שלו).',
  'כתוב בעברית בלבד, קצר ויבש, בלי מקפים, בלי אימוג׳י מלבד כותרות הסעיפים, בלי שמות קבצים אם אפשר לומר במילים.',
  'החזר ארבעה סעיפים בדיוק, כל אחד עם עד 5 שורות שמתחילות ב •:',
  '🔁 חוזר על עצמו: פעולה שנעשתה ידנית יותר מפעם אחת. לכל אחת: מה האוטומציה, וכמה זמן היא תחסוך בשבוע בהערכה.',
  '⚠️ נכשל או טעות: מה קרה, ואיזו בדיקה או וולידציה תמנע את זה בפעם הבאה. אם כבר נוספה בדיקה, תכתוב שזה סגור.',
  '📌 החלטות השבוע: מה הוחלט ונשאר בתוקף.',
  '⏱️ לאן הלך הזמן: שלושת הנושאים שלקחו הכי הרבה משימות.',
  'אם אין מה לכתוב בסעיף, כתוב "• אין". אל תמציא דבר שלא כתוב ביומנים.',
].join('\n');

function llm(input) {
  return new Promise((ok, no) => {
    const args = ['-p', '--model', 'sonnet', '--output-format', 'text', '--system-prompt', SYSTEM, '--disallowedTools',
      'Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Task', 'Agent'];
    const child = spawn('claude', args, { cwd: os.tmpdir(), env: process.env });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); no(new Error('timeout')); }, 10 * 60e3);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => { clearTimeout(timer); return code ? no(new Error('claude ' + code + ' ' + err.slice(0, 300))) : ok(out.trim()); });
    child.stdin.end(input, 'utf8');
  });
}

async function main() {
  const now = Date.now(), files = weekFiles(now);
  const today = dayOf(new Date(now));
  const [y, m, d] = today.split('-');
  const title = '🗒️ סיכום השבוע מיומני העבודה ' + (+d) + '.' + (+m);
  let body;
  if (!files.length) {
    body = 'השבוע לא נרשם אף רישום ביומני העבודה. בדקו שהסוכנים רושמים בסוף כל משימה (worklog.js).';
  } else {
    // The newest days first win the room if the week is very long.
    let text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n\n');
    if (text.length > 150000) text = text.slice(-150000);
    const n = (text.match(/^## /gm) || []).length;
    const out = await llm(text);
    body = 'השבוע נרשמו ' + n + ' משימות ב ' + files.length + ' ימים.\n\n' + out;
  }
  if (DRY) { console.log(title + '\n\n' + body); return; }
  const f = path.join(ROOT, 'data', 'reports', 'reports', y + m + d + '-weekly-logs.json');
  fs.writeFileSync(f, JSON.stringify({ at: new Date(now).toISOString(), title, body }, null, 1));
  spawnSync('git', ['add', f], { cwd: ROOT });
  spawnSync('node', ['push.js', 'דוח שבועי מיומני העבודה'], { cwd: ROOT, stdio: 'inherit', timeout: 30 * 60e3 });
  spawnSync('node', ['notify.js', title, 'הסיכום השבועי מחכה בדוחות במוניטור'], { cwd: ROOT, stdio: 'inherit', timeout: 60e3 });
  console.log('נכתב: ' + f);
}

main().catch((e) => { console.error(new Date().toISOString() + ' ' + e.message); process.exit(1); });
