'use strict';
/*
  4.11.2026, Itzik: "נגדיר אותך כמנהל". Every morning the manager goes over the
  same list and the home screen shows what it did: the morning brief and the
  mail behind it, today's calendar, the customers' monitors, new leads, the
  "מה בצלחת" story of the day and the WhatsApp status of the day.

  manager.js (server, 07:25, 13:00, 18:00) calls run() and writes
  data/manager/manager/<YYYYMMDD>.json. build.js hands the file of today to the
  page as D.manager (forPage). The calendar comes from the PC (cal-pull.js
  writes data/manager/cal.json), since only a session on the PC has his
  Google Calendar.

  Pure functions over what gather() read, so tests/manager.test.js can feed
  made up input. No model is called here. Visible copy has no dashes.
*/
const fs = require('fs');
const path = require('path');

const TZ = 'Asia/Jerusalem';
const DAY = 24 * 3600 * 1000;

function noDash(s) {
  return String(s == null ? '' : s).replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim();
}
function clip(s, n) { const t = noDash(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function dayKey(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }); }
function hhmm(ms) { return new Date(ms).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }); }
function weekday(ms) { return new Date(new Date(ms).toLocaleString('en-US', { timeZone: TZ })).getDay(); }

// The morning brief report of today, and its urgent lines (under "דחוף" until the first blank line).
function briefItems(reports, now) {
  const today = dayKey(now);
  const b = (reports || []).filter(r => r && /morning-brief/.test(r._file || '') && r.at && dayKey(Date.parse(r.at)) === today).pop();
  if (!b) {
    return [
      { k: 'brief', icon: '📰', st: 'warn', t: 'דוח הבוקר לא נכתב היום', sub: 'אבדוק למה' },
      { k: 'mail', icon: '✉️', st: 'warn', t: 'המיילים לא נקראו', sub: 'נקראים יחד עם דוח הבוקר' },
    ];
  }
  const lines = String(b.body || '').split('\n');
  const urgent = [];
  if (/^\s*דחוף\s*$/.test(lines[0] || '')) {
    for (let i = 1; i < lines.length && lines[i].trim(); i++) urgent.push(lines[i].trim());
  }
  return [
    { k: 'brief', icon: '📰', st: 'done', t: 'דוח הבוקר מוכן', sub: clip(String(b.title || '').replace(/^דוח בוקר [\d.]+:\s*/, ''), 90), go: 'answers' },
    urgent.length
      ? { k: 'mail', icon: '✉️', st: 'warn', t: 'מיילים: ' + (urgent.length === 1 ? 'דבר אחד דחוף' : urgent.length + ' דברים דחופים'), sub: clip(urgent[0], 110), go: 'answers' }
      : { k: 'mail', icon: '✉️', st: 'done', t: 'מיילים נקראו, אין דחוף', sub: 'הפירוט בדוח הבוקר', go: 'answers' },
  ];
}

// cal: {at, day, events:[{id, title, start, end, allDay, where}]} written by cal-pull.js.
function todayEvents(cal, now) {
  const today = dayKey(now);
  return ((cal && cal.events) || [])
    .map(e => ({ e, ms: Date.parse(e.start) }))
    .filter(x => x.e && x.e.title && (x.e.allDay ? String(x.e.start).slice(0, 10) === today : !isNaN(x.ms) && dayKey(x.ms) === today))
    .sort((a, b) => (a.e.allDay ? -1 : a.ms) - (b.e.allDay ? -1 : b.ms))
    .map(x => ({ id: String(x.e.id || ''), title: noDash(x.e.title), allDay: !!x.e.allDay, ms: x.ms, where: noDash(x.e.where || '') }));
}
function calItem(cal, now, appts) {
  // 4.11: the monitor's own appointments (data/appts) count too; one already in the calendar is not shown twice.
  const own = (appts || []).filter(x => x && x.what && !isNaN(Date.parse(x.when)) && dayKey(Date.parse(x.when)) === dayKey(now));
  const calOk = cal && cal.at && now - Date.parse(cal.at) <= 20 * 3600 * 1000;
  if (calOk || own.length) {
    const ev = calOk ? todayEvents(cal, now) : [];
    own.forEach(x => { const ms = Date.parse(x.when); if (!ev.some(e => !e.allDay && Math.abs(e.ms - ms) < 3600000)) ev.push({ id: 'appt-' + (x.id || ms), title: noDash(x.what), allDay: !!x.noTime, ms, where: noDash(x.where || '') }); });
    ev.sort((p, q) => (p.allDay ? -1 : p.ms) - (q.allDay ? -1 : q.ms));
    cal = { at: new Date(now).toISOString(), events: [] }; cal._ev = ev;
  }
  if (!cal || !cal.at || now - Date.parse(cal.at) > 20 * 3600 * 1000) {
    return { k: 'cal', icon: '📅', st: 'warn', t: 'היומן לא נקרא הבוקר', sub: 'נקרא מהמחשב, והוא היה כבוי. אנסה שוב', go: 'cal' };
  }
  const ev = cal._ev || todayEvents(cal, now);
  if (!ev.length) return { k: 'cal', icon: '📅', st: 'done', t: 'ביומן: אין כלום היום', sub: '', go: 'cal' };
  return {
    _ev: ev,
    k: 'cal', icon: '📅', st: 'todo',
    t: 'ביומן היום: ' + (ev.length === 1 ? 'דבר אחד' : ev.length + ' דברים'),
    sub: ev.slice(0, 4).map(e => (e.allDay ? '' : hhmm(e.ms) + ' ') + clip(e.title, 50)).join(' · '),
    go: 'cal',
  };
}

function clientsItem(health) {
  const cards = ((health && health.cards) || []).filter(c => c && c.id !== 'abaitzik' && !c.paused);
  if (!cards.length) return { k: 'clients', icon: '👥', st: 'warn', t: 'אין נתונים על הלקוחות', sub: '' };
  const bad = cards.filter(c => (c.problems || []).length);
  if (!bad.length) return { k: 'clients', icon: '👥', st: 'done', t: (cards.length === 1 ? 'הלקוח תקין' : cards.length === 2 ? 'שני הלקוחות תקינים' : 'כל ' + cards.length + ' הלקוחות תקינים'), sub: cards.map(c => noDash(String(c.title || c.id).replace(/^המוניטור של /, ''))).join(', ') };
  return {
    k: 'clients', icon: '👥', st: 'warn',
    t: bad.length === 1 ? 'לקוח אחד עם תקלה' : bad.length + ' לקוחות עם תקלה',
    sub: bad.map(c => noDash(String(c.title || c.id).replace(/^המוניטור של /, '')) + ': ' + clip(c.problems[0], 50)).join(' · ') + '. אני מטפל',
  };
}

// Leads of the last 24 hours: site leads held in the chat, and contacts that are not closed.
function leadsItem(chat, contacts, now, isTest) {
  const t = isTest || (() => false);
  const site = (chat || []).filter(m => m && m.heldWhy === 'lead' && m.at && now - Date.parse(m.at) <= DAY && !t(m.text));
  const other = (contacts || []).filter(c => c && c.status !== 'done' && c.at && now - Date.parse(c.at) <= DAY);
  const n = site.length + other.length;
  if (!n) return { k: 'leads', icon: '🔔', st: 'done', t: 'לידים: אין חדשים מאתמול', sub: '' };
  return { k: 'leads', icon: '🔔', st: 'warn', t: n === 1 ? 'ליד חדש אחד מחכה לך' : n + ' לידים חדשים מחכים לך', sub: 'בעסק שלי, לחזור אליהם היום', go: 'biz' };
}

// plate: the queue of /home/monitor/plate-queue.json (order, posted, postedAt, name).
function plateItem(queue, now) {
  const q = Array.isArray(queue) ? queue.slice() : [];
  const today = dayKey(now);
  const up = q.find(x => x && x.postedAt && dayKey(Date.parse(x.postedAt)) === today);
  if (up) return { k: 'plate', icon: '🍽️', st: 'done', t: 'מה בצלחת עלה היום', sub: clip(up.name, 60), go: 'plate' };
  const next = q.filter(x => x && !x.posted).sort((a, b) => (a.order || 0) - (b.order || 0))[0];
  if (!next) return { k: 'plate', icon: '🍽️', st: 'warn', t: 'מה בצלחת: אין סטורי מוכן בתור', sub: 'אכין את הבאים' };
  return { k: 'plate', icon: '🍽️', st: 'todo', t: 'להעלות היום מה בצלחת', sub: clip(next.name, 60) + '. אחרי ההעלאה ✅ עלה באריח', go: 'plate' };
}

// 8.11: what the manager closed by himself today (manager-work.js), and what stays with Itzik.
function workItems(work) {
  const it = (work && work.items) || [];
  const out = [];
  const done = it.filter(x => x.status === 'done');
  const him = it.filter(x => x.status === 'needsItzik');
  if (done.length) out.push({ k: 'work', icon: '🛠️', st: 'done', t: 'עשיתי לבד: ' + (done.length === 1 ? 'דבר אחד' : done.length + ' דברים'), sub: clip(done.map(x => x.text + ': ' + x.line).join(' · '), 160), go: 'reminders' });
  if (him.length) out.push({ k: 'work2', icon: '🙋', st: 'warn', t: 'נשאר לך: ' + (him.length === 1 ? 'דבר אחד' : him.length + ' דברים'), sub: clip(him.map(x => x.text + ': ' + x.line).join(' · '), 160), go: 'reminders' });
  return out;
}

// status: docs/status/queue.json [{date, topic, caption, posted?}]. Saturday is a day off (whatsapp-status-tile).
function statusItem(queue, now) {
  if (weekday(now) === 6) return { k: 'status', icon: '📲', st: 'done', t: 'סטטוס וואטסאפ: שבת, לא מעלים', sub: '' };
  const today = dayKey(now);
  const it = (Array.isArray(queue) ? queue : []).find(x => x && x.date === today);
  if (!it) return { k: 'status', icon: '📲', st: 'warn', t: 'סטטוס וואטסאפ להיום לא הוכן', sub: 'אכין אותו עכשיו', go: 'status' };
  if (it.posted) return { k: 'status', icon: '📲', st: 'done', t: 'סטטוס וואטסאפ עלה', sub: noDash(it.topic || ''), go: 'status' };
  return { k: 'status', icon: '📲', st: 'todo', t: 'להעלות סטטוס וואטסאפ', sub: 'מוכן באריח: ' + noDash(it.topic || '') + ', 3 נגיעות', go: 'status' };
}

// 9.11: LinkedIn posts wait for his approval in the "🔔 לאישורך" strip, and nothing reminded him.
// queue: data/linkedin/queue.json [{id, date, time, approved?, posted?, failed?}]. Nothing in the queue: no line at all.
function linkedinItem(queue, now) {
  const q = (Array.isArray(queue) ? queue : []).filter(x => x && !x.posted);
  if (!q.length) return null;
  const today = dayKey(now), hm = hhmm(now);
  const failed = q.filter(x => x.failed);
  if (failed.length) return { k: 'linkedin', icon: '💼', st: 'warn', t: 'פוסט לינקדין לא עלה', sub: clip(String(failed[0].failed), 90) };
  const wait = q.filter(x => !x.approved).sort((a, b) => String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))));
  if (wait.length) {
    const f = wait[0], d = String(f.date || '').split('-');
    const due = f.date < today || (f.date === today && (f.time || '09:00') <= hm);
    const when = d.length === 3 ? d[2] + '.' + d[1] + ' ב ' + (f.time || '09:00') : '';
    return { k: 'linkedin', icon: '💼', st: f.date <= today ? 'warn' : 'todo',
      t: wait.length === 1 ? 'פוסט לינקדין מחכה לאישורך' : wait.length + ' פוסטים בלינקדין מחכים לאישורך',
      sub: (due ? 'הזמן שלו עבר, הוא לא יעלה בלי אישור. ' : '') + 'מתוזמן ל ' + when + '. הכרטיס ברצועה 🔔 לאישורך' };
  }
  const next = q.sort((a, b) => String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))))[0];
  return { k: 'linkedin', icon: '💼', st: 'done', t: 'פוסט לינקדין אושר', sub: 'יעלה לבד ב ' + next.date.split('-').reverse().slice(0, 2).join('.') + ' ' + (next.time || '09:00') };
}

function build(inp) {
  const now = inp.now;
  const items = [
    ...briefItems(inp.reports, now),
    calItem(inp.cal, now, inp.appts),
    clientsItem(inp.health),
    leadsItem(inp.chat, inp.contacts, now, inp.isTest),
    plateItem(inp.plate, now),
    statusItem(inp.status, now),
    linkedinItem(inp.linkedin, now),
    ...workItems(inp.work),
  ].filter(Boolean);
  const ci = items.find(i => i.k === 'cal');
  const events = (ci && ci._ev) || todayEvents(inp.cal, now);
  if (ci) delete ci._ev;
  return { at: new Date(now).toISOString(), day: dayKey(now), items, events };
}

// One push line per open item: what is left for him today.
function pushText(m) {
  const open = m.items.filter(i => i.st !== 'done');
  if (!open.length) return null;
  return { title: 'המנהל: ' + (open.length === 1 ? 'דבר אחד להיום' : open.length + ' דברים להיום'), body: open.map(i => i.t + (i.sub ? ': ' + i.sub : '')).join('\n') };
}

// Timed calendar events today that still deserve a reminder 30 minutes before.
function alarmsDue(m, now, sent) {
  return (m.events || []).filter(e => !e.allDay && !isNaN(e.ms) && e.ms - 30 * 60000 > now + 60000 && !(sent || []).includes(m.day + '|' + e.id));
}

function forPage(dataPath, now) {
  const f = path.join(dataPath, 'manager', 'manager', dayKey(now).replace(/-/g, '') + '.json');
  try { const m = JSON.parse(fs.readFileSync(f, 'utf8')); return { at: m.at, items: m.items }; } catch (e) { return null; }
}

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function readAll(dataPath, dir, since) {
  const full = path.join(dataPath, dir, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter(f => f.endsWith('.json')).filter(f => !since || f >= since)
    .map(f => { const d = readJson(path.join(full, f), null); if (d && typeof d === 'object') d._file = f; return d; }).filter(Boolean);
}

function gather(dataPath, repo, now) {
  const since = dayKey(now - 2 * DAY).replace(/-/g, '');
  return {
    now,
    reports: readAll(dataPath, 'reports', since),
    chat: readAll(dataPath, 'chat', since),
    contacts: readAll(dataPath, 'contacts'),
    health: readJson(path.join(dataPath, 'status', 'health-board.json'), null),
    cal: readJson(path.join(dataPath, 'manager', 'cal.json'), null),
    appts: readAll(dataPath, 'appts'),
    plate: readJson('/home/monitor/plate-queue.json', readJson(path.join(repo, 'docs', 'plate', 'queue.json'), [])),
    status: readJson(path.join(repo, 'docs', 'status', 'queue.json'), []),
    linkedin: readJson(path.join(repo, 'data', 'linkedin', 'queue.json'), []),
    work: readJson(path.join(dataPath, 'manager', 'work', dayKey(now).replace(/-/g, '') + '.json'), null),
    isTest: require('./biz.js').isTestLead,
  };
}

module.exports = { noDash, dayKey, briefItems, todayEvents, calItem, clientsItem, leadsItem, plateItem, statusItem, linkedinItem, workItems, build, pushText, alarmsDue, forPage, gather };
