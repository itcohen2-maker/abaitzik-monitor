'use strict';
/*
  15.11.2026, Itzik's idea "רוצה את זה": a reminder that already came can be put off in one tap, "שוב בעוד שעה" or
  "שוב מחר". The phone sends "תזכורת שוב: <1h|tom> <at>|<due>" (the two dates of the reminder file, as the reminders
  screen knows it). listen.js handles it with no model, like "✓ טופל". 1h: a timed push through alarm.js, so it rings at
  the minute. tom: a new reminder for tomorrow at 09:00 through remind.js (its 09:00 run sends it).
  The old reminder is marked sentAt, so it never goes out again, and snoozedAt says when it was put off.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RE = /^\s*תזכורת שוב:\s*(1h|tom)\s+(\S+?)\|(\S+)\s*$/;

function parse(text) {
  const m = RE.exec(String(text || '').replace(/\n\s*קוד[^\n]*$/, ''));
  return m ? { how: m[1], at: m[2], due: m[3] } : null;
}

const israelDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
const israelHm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

// opt.now and opt.run are for the tests; run defaults to a real child node process.
function apply(dataPath, p, opt = {}) {
  const now = opt.now || new Date();
  const dir = path.join(dataPath, 'reminders', 'reminders');
  const run = opt.run || ((args) => execFileSync(process.execPath, args, { cwd: ROOT, env: process.env, stdio: 'pipe' }));
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f)) : [];
  const file = files.find((f) => { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return d.at === p.at && d.due === p.due; });
  if (!file) return { ok: false, reply: 'התזכורת הזו כבר לא קיימת.' };
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  let when;
  if (p.how === '1h') {
    const t = new Date(now.getTime() + 3600e3);
    run([path.join(ROOT, 'alarm.js'), israelHm(t), '⏰ שוב: ' + doc.text]);
    when = 'בעוד שעה, ב ' + israelHm(t);
  } else {
    const day = israelDay(new Date(now.getTime() + 86400e3));
    run([path.join(ROOT, 'remind.js'), 'add', day, '⏰ שוב: ' + doc.text]);
    when = 'מחר ב 09:00';
  }
  if (!doc.sentAt) doc.sentAt = now.toISOString();
  doc.snoozedAt = now.toISOString();
  fs.writeFileSync(file, JSON.stringify(doc, null, 1) + '\n', 'utf8');
  return { ok: true, reply: '⏰ אזכיר שוב ' + when + '.' };
}

module.exports = { parse, apply };
