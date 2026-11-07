'use strict';
/*
  7.11.2026: what the fast chat knows about this monitor, read fresh on every turn (stage 2b + 3.4 of the
  monitor site plan). Itzik: the chat answered "in general" because it saw nothing of his. Now it gets the
  calendar copy (cal-sync.js), the tasks, the reminders and the future appointments, and the list of
  connections that are not connected, so it can offer one with a button ("חיבור: <id>" at the end of the
  answer, picked up by lib/fast-chat.js). Files it cannot read (a customer's data, owned by his own user)
  are simply missing: the chat then knows less, it never fails.
*/
const fs = require('fs');
const path = require('path');
const TZ = 'Asia/Jerusalem';
const DAY = 86400000;

const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function docs(dir) {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => rd(path.join(dir, f))).filter(Boolean); } catch (e) { return []; }
}
const day = (d) => new Date(d).toLocaleDateString('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric' });
const hm = (d) => new Date(d).toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const iso = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });

function facts(dataPath, now) {
  const out = [];
  const today = iso(now);
  out.push('היום ' + day(now) + ', השעה ' + hm(now) + '.');
  const cal = rd(path.join(dataPath, 'cal', 'events.json'));
  if (cal && Array.isArray(cal.events)) {
    const ev = cal.events.filter((e) => { const t = Date.parse(e.end || e.start); return t >= now - 3600000 && Date.parse(e.start) <= now + 7 * DAY; })
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 15);
    out.push(ev.length ? 'היומן בשבוע הקרוב:\n' + ev.map((e) => '• ' + day(e.start) + (e.allDay ? ', כל היום' : ' ' + hm(e.start)) + ': ' + e.title + (e.where ? ' (' + e.where + ')' : '')).join('\n') : 'ביומן אין אירועים בשבוע הקרוב.');
  }
  const tasks = docs(path.join(dataPath, 'tasks', 'tasks')).filter((t) => t.text && (!t.day || t.day >= iso(now - 7 * DAY)))
    .sort((a, b) => ((a.day || '') < (b.day || '') ? -1 : 1)).slice(0, 15);
  if (tasks.length) out.push('משימות פתוחות:\n' + tasks.map((t) => '• ' + (t.day ? (t.day < today ? 'באיחור, ' : '') + t.day + ': ' : '') + t.text).join('\n'));
  const rem = docs(path.join(dataPath, 'reminders', 'reminders')).filter((r) => r.text && !r.sentAt && Date.parse(r.due) > now)
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due)).slice(0, 10);
  if (rem.length) out.push('תזכורות שקבועות:\n' + rem.map((r) => '• ' + day(r.due) + ' ' + hm(r.due) + ': ' + r.text).join('\n'));
  const ap = docs(path.join(dataPath, 'appts', 'appts')).filter((a) => a.when && Date.parse(a.when) > now - DAY)
    .sort((a, b) => Date.parse(a.when) - Date.parse(b.when)).slice(0, 5);
  if (ap.length) out.push('תורים קרובים:\n' + ap.map((a) => '• ' + day(a.when) + ' ' + hm(a.when) + ': ' + a.what + (a.where ? ' (' + a.where + ')' : '')).join('\n'));
  return out.join('\n\n').slice(0, 4000);
}

/*
  opts: { dataPath, instName, features, setupDir?, tok? }   setupDir+tok: read the setup page directly
  (wa-bridge, Itzik's data/setup) instead of the instance's own snapshot.
*/
function build(opts) {
  const now = opts.now || Date.now();
  let conns = [];
  try {
    const r = require('./connections.js').list(opts.dataPath, opts.instName, opts.features || {}, opts.tok ? { tok: opts.tok, setupDir: opts.setupDir } : null);
    conns = ((r && r.rows) || []).filter((x) => !x.on && !x.soon && (x.link || x.paid))
      .map((x) => ({ id: x.id, title: x.title, link: x.link || '', paid: x.paid || '' }));
  } catch (e) { conns = []; }
  return { text: facts(opts.dataPath, now), conns };
}

module.exports = { build, facts };
