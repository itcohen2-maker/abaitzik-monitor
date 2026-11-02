'use strict';
/*
  1.11.2026, Itzik: "build a system that takes all these answers and we learn from it".
  Once a week (Sunday 09:00 Israel, cron): pull the Shachar testers' feedback, rebuild the
  monitor (the full list is in 💼 העסק שלי ← עסקים ← "שחר: משוב מהנסיינים"), and send him
  the week in a few lines: how many answers helped, the 👎 answers, and what people wrote.
  Code only, no model. Nothing is changed in Shachar without his approval.
*/
const path = require('path');
const { execFile } = require('child_process');
const inst = require('./lib/instance.js').load();
const shachar = require('./lib/shachar.js');

function run(args) {
  return new Promise((res) => execFile(process.execPath, args, { cwd: __dirname, timeout: 240000 }, () => res()));
}

(async () => {
  const deps = { dir: inst.dataPath, fetch: fetch, now: () => new Date(), notify: () => {}, rebuild: null };
  const r = await shachar.handleRefresh(deps);
  const s = shachar.load(inst.dataPath);
  const f = s.feedback;
  if (!r.ok || !f) { await run(['notify.js', 'שחר: סיכום המשוב השבועי לא נמשך', 'אנסה שוב בשבוע הבא. אפשר לפתוח את "שחר: משוב מהנסיינים" ולרענן.']); return; }
  const week = Date.now() - 7 * 864e5;
  const rows = (f.rows || []).filter((x) => Date.parse(x.at) >= week);
  const w = f.week || {};
  const lines = [];
  if (!rows.length) lines.push('השבוע לא הגיע משוב מהנסיינים.');
  else {
    lines.push('תשובות שעזרו: ' + (w.helpedPct == null ? 'אין דירוגים' : w.helpedPct + '% (' + w.up + ' 👍, ' + w.down + ' 👎)'));
    const downs = rows.filter((x) => x.kind === 'rating' && x.rating === -1).slice(0, 3);
    if (downs.length) lines.push('', 'מה לא עזר:', ...downs.map((x) => '• ' + (x.text ? '"' + x.text.slice(0, 100) + '" ' : '') + 'על: ' + String(x.answer || '').slice(0, 90)));
    const words = rows.filter((x) => x.kind !== 'rating' && x.text).slice(0, 4);
    if (words.length) lines.push('', 'מה כתבו:', ...words.map((x) => '• ' + (x.question ? x.question.slice(0, 40) + ': ' : '') + '"' + x.text.slice(0, 110) + '"'));
  }
  lines.push('', 'הכל במוניטור: 💼 העסק שלי ← עסקים ← "שחר: משוב מהנסיינים"');
  await run(['push.js', 'שחר: סיכום משוב שבועי']);
  await run(['notify.js', '🌅 שחר: המשוב של השבוע', lines.join('\n')]);
})().catch((e) => { console.error(e); process.exit(1); });
