'use strict';
/*
  27.10.2026, Itzik: "תציע לי מדי פעם, תבחר תדירות, ותעדכן אותי, מחיקת דברים שלא חייבים
  להיות בשרת מטעמי אבטחה". Once a month (cron, no Claude) this looks at the places where
  old copies pile up, and if anything is there it writes one chat line with what, how much
  and from when, and a push. It deletes nothing: he answers, a session moves what is worth
  keeping to his private Drive and deletes the rest, the way it was done on 27.10.
  Quiet when there is nothing to report.

  Usage: node server-hygiene.js        report (cron, 1st of the month)
         node server-hygiene.js --dry  print only
*/
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DAY = 24 * 3600 * 1000;
// Places that only ever hold old copies. Each with how old a file must be to count.
const PLACES = [
  ['data/_archive', 0, 'ארכיון'],
  ['data/backup', 0, 'גיבויים ישנים'],
  ['data/files-archive', 0, 'קבצים בארכיון'],
  ['data/inbox', 30, 'קבצים שנכנסו לפני יותר מחודש'],
  ['data/uploads', 30, 'העלאות ישנות'],
];

function walk(dir) {
  let out = [];
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of names) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out = out.concat(walk(p));
    else { try { const st = fs.statSync(p); out.push({ p, size: st.size, at: st.mtimeMs }); } catch {} }
  }
  return out;
}

const mb = (n) => (n / 1048576).toFixed(n < 1048576 ? 2 : 0);
const day = (ms) => new Date(ms).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });

const lines = [];
for (const [rel, minDays, label] of PLACES) {
  const files = walk(path.join(ROOT, rel)).filter((f) => Date.now() - f.at > minDays * DAY);
  if (!files.length) continue;
  const size = files.reduce((t, f) => t + f.size, 0);
  const oldest = Math.min(...files.map((f) => f.at)), newest = Math.max(...files.map((f) => f.at));
  lines.push(`• ${label} (${rel}): ${files.length} קבצים, ${mb(size)} מגה, מ ${day(oldest)} עד ${day(newest)}`);
}

if (!lines.length) process.exit(0);
const text = '🧹 בדיקה חודשית של השרת, מטעמי אבטחה: נמצאו עותקים ישנים שלא חייבים להיות בשרת.\n'
  + lines.join('\n')
  + '\n\nההמלצה: מה שאולי עוד תצטרך עובר לדרייב הפרטי שלך, והשאר נמחק. לכתוב "נקה את השרת" כדי שאפרט ואבצע.';
if (process.argv.includes('--dry')) { console.log(text); process.exit(0); }
const now = new Date();
const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
fs.writeFileSync(path.join(ROOT, 'data/chat/chat', stamp + '-claude-server-hygiene.json'), JSON.stringify({ at: now.toISOString(), from: 'claude', text }, null, 1));
spawnSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', timeout: 300000 });
spawnSync('node', ['push.js', 'server hygiene: monthly report'], { cwd: ROOT, stdio: 'ignore', timeout: 300000 });
spawnSync('node', ['notify.js', 'בדיקת אבטחה חודשית', 'יש בשרת עותקים ישנים שאפשר לנקות. הפרטים בצ׳אט.'], { cwd: ROOT, stdio: 'ignore', timeout: 60000 });
