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
  const sweeps = it.filter(x => x.kind === 'mailsweep' && x.status !== 'failed');
  const last = sweeps[sweeps.length - 1];
  if (last) out.push({ k: 'mailsweep', icon: '📬', st: last.status === 'needsItzik' ? 'warn' : 'done', t: last.status === 'needsItzik' ? 'עברתי על המיילים, יש דבר שמחכה לך' : 'עברתי על המיילים, אין דחוף', sub: clip(last.line, 200), go: 'answers' });
  const done = it.filter(x => x.status === 'done');
  const him = it.filter(x => x.status === 'needsItzik' && x.kind !== 'mailsweep');
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
  const upToday = (Array.isArray(queue) ? queue : []).find(x => x && x.posted && x.date === dayKey(now));
  if (upToday && !q.some(x => x.failed)) return { k: 'linkedin', icon: '💼', st: 'done', t: 'פוסט לינקדין עלה היום', sub: q.length ? 'הבא: ' + q.sort((a, b) => String(a.date).localeCompare(String(b.date)))[0].date.split('-').reverse().slice(0, 2).join('.') : '' };
  if (!q.length) return null;
  const today = dayKey(now), hm = hhmm(now);
  const stuck = q.filter(x => x.approved && overdue(x, now, 60));
  if (stuck.length && !q.some(x => x.failed)) return { k: 'linkedin', icon: '💼', st: 'warn', t: 'פוסט לינקדין אושר אבל לא עלה', sub: 'מתוזמן ל ' + stuck[0].date.split('-').reverse().slice(0, 2).join('.') + ' ' + (stuck[0].time || '09:00') + '. אבדוק' };
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

// 9.11.2026, Itzik: the manager makes sure there are videos for "מה בצלחת" and the WhatsApp statuses, that the
// candle posts on Instagram work, and that LinkedIn has a post going up or gone up. Read only checks of the
// queues and of the media files on disk; nothing is posted or sent from here.
function hasFile(repo, dir, f) { try { return !!f && fs.statSync(path.join(repo, 'docs', dir, f)).size > 1000; } catch (e) { return false; } }
function minutes(hm) { const p = String(hm || '09:00').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
function overdue(x, now, graceMin) { // an item whose date and hour passed more than graceMin minutes ago
  const today = dayKey(now);
  if (x.date < today) return true;
  return x.date === today && minutes(x.time) + graceMin < minutes(hhmm(now));
}

function plateStockItem(queue, repo) {
  if (!repo || !Array.isArray(queue)) return null;
  const left = queue.filter(x => x && !x.posted);
  const ready = left.filter(x => hasFile(repo, 'plate', x.file));
  const missing = left.length - ready.length;
  if (missing) return { k: 'platestock', icon: '🎞️', st: 'warn', t: 'מה בצלחת: חסר קובץ וידאו ל ' + missing + ' מהסטוריז בתור', sub: 'אבדוק ואשלים', go: 'plate' };
  if (ready.length < 3) return { k: 'platestock', icon: '🎞️', st: 'warn', t: 'מה בצלחת: נשארו רק ' + ready.length + ' סרטונים מוכנים', sub: 'אכין עוד', go: 'plate' };
  return { k: 'platestock', icon: '🎞️', st: 'done', t: 'מה בצלחת: ' + ready.length + ' סרטונים מוכנים בתור', sub: '', go: 'plate' };
}

function statusStockItem(queue, repo, now) {
  if (!repo || !Array.isArray(queue)) return null;
  const miss = [];
  for (let i = 0; i < 3; i++) { // today and the next two days, Saturday is a day off
    const ms = now + i * DAY, d = dayKey(ms);
    if (weekday(ms) === 6) continue;
    const it = queue.find(x => x && x.date === d);
    if (!it || !hasFile(repo, 'status', it.file)) miss.push(d.split('-').reverse().slice(0, 2).join('.') + (it ? ' (חסר קובץ)' : ''));
  }
  if (miss.length) return { k: 'statusstock', icon: '🎬', st: 'warn', t: 'סטטוס וואטסאפ: לא מוכן ל ' + miss.join(', '), sub: 'אכין', go: 'status' };
  return { k: 'statusstock', icon: '🎬', st: 'done', t: 'סטטוסים לשלושת הימים הקרובים מוכנים', sub: '', go: 'status' };
}

// candles on Instagram: ner-queue.json (waiting) and ner-posted.json (what went out, failed set on an error).
function candlesItem(queue, posted, repo, now) {
  if (!repo || !Array.isArray(queue)) return null;
  const pl = (Array.isArray(posted) ? posted : Object.values(posted || {})).filter(x => x && x.date);
  const late = queue.filter(x => x && !x.posted && overdue(x, now, 90));
  const today = dayKey(now), from = dayKey(now - 3 * DAY);
  const failed = pl.filter(x => x.failed && x.date >= from);
  const noFile = queue.filter(x => x && !x.posted && x.date >= today && x.date <= dayKey(now + 2 * DAY) && !hasFile(repo, 'ner', x.file));
  const last = pl.filter(x => x.posted).map(x => x.date).sort().pop();
  if (failed.length) return { k: 'candles', icon: '🕯️', st: 'warn', t: 'נרות באינסטגרם: ' + failed.length + ' פרסומים נכשלו', sub: clip(String(failed[0].name) + ': ' + String(failed[0].failed), 90) };
  if (late.length) return { k: 'candles', icon: '🕯️', st: 'warn', t: 'נרות באינסטגרם: ' + late.length + ' פוסטים לא עלו בזמן', sub: clip(late[0].name + ' ' + late[0].date.split('-').reverse().slice(0, 2).join('.') + ' ' + late[0].time, 90) };
  if (noFile.length) return { k: 'candles', icon: '🕯️', st: 'warn', t: 'נרות: חסר קובץ וידאו ל ' + noFile.length + ' פרסומים הקרובים', sub: clip(noFile[0].name, 60) };
  if (!last || last < dayKey(now - 2 * DAY)) return { k: 'candles', icon: '🕯️', st: 'warn', t: 'נרות באינסטגרם: לא עלה כלום ב יומיים האחרונים', sub: last ? 'האחרון עלה ב ' + last.split('-').reverse().slice(0, 2).join('.') : '' };
  return { k: 'candles', icon: '🕯️', st: 'done', t: 'נרות באינסטגרם עובד', sub: 'האחרון עלה ב ' + last.split('-').reverse().slice(0, 2).join('.') + ', בתור ' + queue.filter(x => x && !x.posted).length };
}

// 10.11.2026, Itzik: a returned form that needs him must blink in the monitor, and the manager makes sure it lands there.
// h: lib/handle.js summary {n, oldest, hours}. No open item: no line. The tile itself never depends on quiet hours.
function handleItem(h) {
  if (!h || !h.n) return null;
  const o = h.oldest || {};
  const age = h.hours >= 24 ? Math.floor(h.hours / 24) + ' ימים' : h.hours >= 1 ? Math.floor(h.hours) + ' שעות' : 'פחות משעה';
  return { k: 'handle', icon: '📋', st: 'warn', t: h.n === 1 ? 'פריט אחד מחכה לטיפול שלך' : h.n + ' פריטים מחכים לטיפול שלך',
    sub: clip((o.who || '') + ': ' + (o.title || ''), 80) + '. הוותיק ביותר מחכה ' + age + '. האריח 📋 לטיפול במסך הראשי', go: o.link || 'answers', hours: h.hours };
}

// 10.11.2026, Itzik: a returned setup form is pulled into the customer's monitor, and this is the manager's duty (lib/setup-intake.js).
function intakeItems(sum, now) { try { return require('./setup-intake.js').managerLines(sum, now); } catch (e) { return []; } }

// 10.11.2026, Itzik: always check in Vercel that we are not building too much deployment history (it is also the manager's job).
// vh: data/status/vercel-history.json, written daily by vercel-check.js on the PC. undefined: this is not Itzik's monitor, no line.
function vercelItem(vh, now) {
  if (vh === undefined) return null;
  const base = { k: 'vercel', icon: '▲' };
  if (!vh || !Array.isArray(vh.projects)) return Object.assign(base, { st: 'warn', t: 'ורסל: בדיקת היסטוריית הפריסות עוד לא רצה', sub: 'המשימה AbaItzikVercelCheck במחשב, node vercel-check.js' });
  const age = now - Date.parse(vh.at);
  if (!(age < 36 * 3600e3)) return Object.assign(base, { st: 'warn', t: 'ורסל: בדיקת הפריסות לא רצה יותר מיום וחצי', sub: 'המחשב כבוי, או שהמשימה AbaItzikVercelCheck נעצרה' });
  const bad = vh.projects.filter(p => p.count > 30 || p.last24 > 6).sort((a, b) => b.count - a.count);
  if (bad.length) {
    const b = bad[0];
    return Object.assign(base, { st: 'warn', t: 'ורסל: ' + b.name + ' שומר ' + b.count + ' פריסות, ' + b.last24 + ' ב 24 שעות האחרונות',
      sub: clip((bad.length > 1 ? 'עוד ' + (bad.length - 1) + ' פרויקטים. ' : '') + 'לאחד תיקונים לפריסה אחת, ולמחוק פריסות ישנות באישורך (להשאיר 5)', 110) });
  }
  const top = vh.projects[0];
  return Object.assign(base, { st: 'done', t: 'ורסל: היסטוריית הפריסות תקינה', sub: top ? 'הגדול ביותר: ' + top.name + ', ' + top.count + ' פריסות' : '' });
}

// 10.11.2026, Itzik: the agent that walks every monitor and presses every button is part of the manager's job.
// gs: data/status/guard-summary.json, written by /home/monitor/monitor-guard/run.sh (4 times a day). undefined: not Itzik's monitor.
function guardItem(gs, now) {
  if (gs === undefined) return null;
  const base = { k: 'guard', icon: '🖱️' };
  if (!gs || !Array.isArray(gs.monitors) || !gs.monitors.length) return Object.assign(base, { st: 'warn', t: 'בודק הלחיצות עוד לא רץ', sub: 'monitor-guard.timer בשרת' });
  if (!(now - Date.parse(gs.at) < 9 * 3600e3)) return Object.assign(base, { st: 'warn', t: 'בודק הלחיצות לא רץ יותר מ 9 שעות', sub: 'monitor-guard.timer בשרת' });
  const bad = gs.monitors.filter(m => m.fails > 0);
  const n = gs.monitors.reduce((a, m) => a + (m.checked || 0), 0);
  if (bad.length) {
    const tot = bad.reduce((a, m) => a + m.fails, 0);
    return Object.assign(base, { st: 'warn', t: 'בודק הלחיצות: ' + tot + ' כפתורים לא עובדים ב ' + bad.length + ' מוניטורים',
      sub: clip(bad.map(m => m.name + ': ' + m.fails).join(', ') + '. ' + ((bad[0].first || [])[0] || ''), 120) });
  }
  return Object.assign(base, { st: 'done', t: 'בודק הלחיצות: הכל עובד', sub: gs.monitors.length + ' מוניטורים, ' + n + ' כפתורים נבדקו' });
}

function build(inp) {
  const now = inp.now;
  const items = [
    ...briefItems(inp.reports, now),
    calItem(inp.cal, now, inp.appts),
    clientsItem(inp.health),
    handleItem(inp.handle),
    ...intakeItems(inp.intake, now),
    leadsItem(inp.chat, inp.contacts, now, inp.isTest),
    plateItem(inp.plate, now),
    statusItem(inp.status, now),
    linkedinItem(inp.linkedin, now),
    plateStockItem(inp.plate, inp.repo), statusStockItem(inp.status, inp.repo, now), candlesItem(inp.nerQueue, inp.nerPosted, inp.repo, now),
    vercelItem(inp.vercel, now),
    guardItem(inp.guard, now),
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
    handle: require('./handle.js').summary(dataPath, now),
    isTest: require('./biz.js').isTestLead,
    repo,
    guard: (() => { try { return require('./instance.js').name === 'abaitzik' ? readJson(path.join(dataPath, 'status', 'guard-summary.json'), null) : undefined; } catch (e) { return undefined; } })(),
    vercel: (() => { try { return require('./instance.js').name === 'abaitzik' ? readJson(path.join(dataPath, 'status', 'vercel-history.json'), null) : undefined; } catch (e) { return undefined; } })(),
    nerQueue: readJson('/home/monitor/ner-queue.json', null),
    nerPosted: readJson('/home/monitor/ner-posted.json', null),
  };
}

module.exports = { guardItem, vercelItem, intakeItems, handleItem, noDash, dayKey, briefItems, todayEvents, calItem, clientsItem, leadsItem, plateItem, statusItem, linkedinItem, workItems, build, pushText, alarmsDue, forPage, gather };
