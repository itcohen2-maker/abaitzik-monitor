'use strict';
/*
  14.11.2026, the offer page (Small and up): "סיכומי פגישות בזום, גוגל מיט וטימס (דרך פיירפליס): הסיכום מגיע גם
  בוואטסאפ, והמשימות נכנסות ליומן". fireflies-pull.js calls this for every new meeting, in the customer's own folder:
    1. a chat record <stamp>-claude-push.json { from: claude, waPush: true }: he reads it in the monitor, and the
       WhatsApp bridge (wa-bridge.js waPushSweep) sends it to his phone (text inside 24 hours, else the template);
    2. one file per task of his in data/cal/add/: cal-sync.js (root, with his Google connection) puts each one in
       his Google Calendar as an all-day item on the next working day, then moves the file to data/cal/add/done.
  Pure text making here; the two writers take the folder.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NL = '\n';
function text(m) {
  const t = [];
  t.push('🎙️ סיכום הפגישה' + (m.client ? ' עם ' + m.client : (m.title ? ': ' + m.title : '')));
  if (m.summary) t.push(String(m.summary).trim().slice(0, 1200));
  if ((m.decisions || []).length) t.push('מה הוחלט:' + NL + m.decisions.slice(0, 8).map((x) => '• ' + x).join(NL));
  if ((m.tasksMe || []).length) t.push('המשימות שלך (נכנסו ליומן):' + NL + m.tasksMe.slice(0, 10).map((x) => '• ' + x).join(NL));
  if ((m.tasksClient || []).length) t.push('משימות של הלקוח:' + NL + m.tasksClient.slice(0, 10).map((x) => '• ' + x).join(NL));
  if (m.next) t.push('הצעד הבא: ' + m.next);
  return t.join(NL + NL).slice(0, 3800);
}
// The next working day in Israel (Sunday to Thursday), as YYYY-MM-DD.
function nextWorkDay(now) {
  let d = new Date((now == null ? Date.now() : now) + 86400000);
  for (let i = 0; i < 4; i++) {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(d);
    if (wd !== 'Fri' && wd !== 'Sat') break;
    d = new Date(d.getTime() + 86400000);
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
}
function stamp(now) {
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now == null ? Date.now() : now)).forEach((x) => { p[x.type] = x.value; });
  return p.year + p.month + p.day + '-' + p.hour + p.minute + p.second;
}
function write(dataPath, m, now) {
  const at = new Date(now == null ? Date.now() : now).toISOString();
  const cd = path.join(dataPath, 'chat', 'chat');
  fs.mkdirSync(cd, { recursive: true });
  let name = stamp(now) + '-claude-push.json';
  for (let i = 2; fs.existsSync(path.join(cd, name)); i++) name = stamp(now) + '-claude-push-' + i + '.json';
  fs.writeFileSync(path.join(cd, name), JSON.stringify({ at, from: 'claude', text: text(m), status: 'done', waPush: true, id: 'mp-' + crypto.randomBytes(4).toString('hex'), meeting: m.id || '' }, null, 1), { mode: 0o664 });
  const day = nextWorkDay(now), adds = [];
  (m.tasksMe || []).slice(0, 10).forEach((task, i) => {
    const ad = path.join(dataPath, 'cal', 'add'); fs.mkdirSync(ad, { recursive: true });
    const f = path.join(ad, (m.id || 'm') .replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40) + '-' + i + '.json');
    if (fs.existsSync(f)) return;
    fs.writeFileSync(f, JSON.stringify({ title: '✅ ' + String(task).slice(0, 140), date: day, note: 'משימה מהפגישה' + (m.client ? ' עם ' + m.client : '') + ' (סיכום פיירפליס)', at }, null, 1), { mode: 0o664 });
    adds.push(f);
  });
  return { chat: name, adds };
}
module.exports = { text, nextWorkDay, write };
