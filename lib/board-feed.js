'use strict';
/*
  11.11.2026, Itzik: "קח את לוח הבקרה ושים אותו במוניטור של איליי, ותן לו שורת צ'אט מתחתיו כדי לשנות את לוח הבקרה
  איך שהוא רוצה, ולהוסיף מתחתיו עדכונים. עדכונים אחרונים מגוגל, רק החשובים. ועדכוני המנהל: מה עשה, מה בדק, בקצרה.
  ובתחתית, אם רוצים, דוח הבוקר. רק אצלי ואצל איליי."

  The "board extras" of the control board: a chat bar, a 🔔 updates list and an optional morning report.
  On only where it is allowed: Itzik's own monitor (name abaitzik) and a monitor whose instance.json says "board": true
  (Ilay). Alon, Dr. Shulman and everyone else get `null` here, so their page has no trace of it.

  Everything is computed at build time and travels only in the sealed payload D.bb, never in the public live.json.

  data/board-prefs.json (the monitor's own, written by a session that answers a "🎛️ בקשה ללוח הבקרה" message):
    hideRows  [row id]                     rows of the tile week to hide (Itzik's rows by id, Ilay's campaigns by id)
    updates   { google: true, manager: true, max: 8 }
    report    { show: bool, includes: [word] }   show the "📰 הדוח של הבוקר"; includes keeps only the blocks whose
                                           heading holds one of the words (empty: the whole report)
    rows      [{ id, ic, n }]               extra rows of the planned posts (Ilay)
    plan      [{ row, date, time, title, state }]  what is planned, state will | hand | ok | wait
  Defaults below: the report is on for Itzik and off for Ilay.
*/
const fs = require('fs');
const path = require('path');

const TZ = 'Asia/Jerusalem';
const DAY = 86400000;

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function noDash(s) { return String(s == null ? '' : s).replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim(); }
function clip(s, n) { const t = noDash(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function dayKey(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }); }
function hm(ms) { return new Date(ms).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }

function enabled(inst) { return !!inst && (inst.name === 'abaitzik' || inst.board === true); }
// 11.11.2026: a clinic (Dr. Shulman, lib/clinic.js) gets its own rows: freelancers, labs, suppliers.
function modeOf(inst) { return inst.name === 'abaitzik' ? 'itzik' : (inst.labCheck || (Array.isArray(inst.screens) && inst.screens.indexOf('gLab') >= 0)) ? 'clinic' : 'mine'; }

// What counts as important from Google: invoices, receipts, payments, official or legal mail, leads, meetings. Never marketing.
const PAY = /חשבונית|קבלה|תשלום|לתשלום|שולם|חוב|רשות המסים|מס הכנסה|ביטוח לאומי|invoice|receipt|payment/i;
const IMPORTANT = /חשבונית|קבלה|תשלום|לתשלום|שולם|חוב|רשות המסים|מס הכנסה|ביטוח לאומי|עו״ד|עורך דין|משפט|תביעה|הסכם|חוזה|ליד|פגישה|פגישת|invoice|receipt|payment/i;
const NOT_IMPORTANT = /פרסומת|newsletter|וובינר|webinar|מבצע|הנחה|promo/i;

function readPrefs(dataPath, mode) {
  const p = readJson(path.join(dataPath, 'board-prefs.json'), {}) || {};
  const u = p.updates && typeof p.updates === 'object' ? p.updates : {};
  const r = p.report && typeof p.report === 'object' ? p.report : {};
  const arr = (x) => (Array.isArray(x) ? x : []);
  return {
    hideRows: arr(p.hideRows).map(String),
    doneHide: arr(p.doneHide).map(String),
    updates: { google: u.google !== false, manager: u.manager !== false, max: Math.min(12, Math.max(3, Number(u.max) || 8)) },
    report: { show: r.show === undefined ? mode === 'itzik' : !!r.show, includes: arr(r.includes).map(String).filter(Boolean) },
    rows: arr(p.rows).filter((x) => x && x.id && x.n).map((x) => ({ id: String(x.id), ic: String(x.ic || '📌'), n: String(x.n).slice(0, 30) })),
    plan: arr(p.plan).filter((x) => x && x.row && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)))
      .map((x) => ({ row: String(x.row), date: String(x.date), time: /^\d{2}:\d{2}$/.test(String(x.time || '')) ? x.time : '', title: clip(x.title || '', 60), state: ['will', 'hand', 'ok', 'wait'].includes(x.state) ? x.state : 'will' })),
  };
}

// Itzik: the lines of today's morning brief that matter (it is already a summary, no raw mail), the calendar of today, new leads.
function googleItzik(dataPath, now) {
  const out = [];
  const reports = path.join(dataPath, 'reports', 'reports');
  let latest = null;
  try {
    const f = fs.readdirSync(reports).filter((x) => /morning-brief\.json$/.test(x)).sort().pop();
    if (f) latest = readJson(path.join(reports, f), null);
  } catch (e) { /* none */ }
  if (latest && latest.body && now - Date.parse(latest.at) < 36 * 3600000) {
    const head = String(latest.body).split(/\n\s*\n/).filter((b) => /^דחוף/.test(b.trim()))[0] || '';
    head.split('\n').map((l) => l.replace(/^\s*\d+\.\s*/, '').trim()).filter((l) => l && !/^דחוף/.test(l))
      .filter((l) => IMPORTANT.test(l) && !NOT_IMPORTANT.test(l) && !/חיבור של השרת|המאזין|תקלה/.test(l))
      .sort((a, b) => (PAY.test(b) ? 1 : 0) - (PAY.test(a) ? 1 : 0)).slice(0, 3)
      .forEach((l) => out.push({ ic: PAY.test(l) ? '🧾' : '✉️', t: clip(l, 110), at: latest.at }));
  }
  const ev = readJson(path.join(dataPath, 'cal', 'events.json'), null);
  const today = dayKey(now);
  if (ev && Array.isArray(ev.events)) {
    const seen = {};
    ev.events.filter((e) => e.start && dayKey(Date.parse(e.start)) === today && !(e.allDay) && Date.parse(e.start) > now - 3600000)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).forEach((e) => {
        const k = hm(Date.parse(e.start)) + (e.title || ''); if (seen[k]) return; seen[k] = 1;
        if (Object.keys(seen).length <= 1 && !NOT_IMPORTANT.test(e.title || '')) out.push({ ic: '📅', t: 'היום ' + hm(Date.parse(e.start)) + ' ' + clip(e.title || 'פגישה', 60), at: new Date(now - 1000).toISOString(), noAgo: true });
      });
  }
  const m = readJson(path.join(dataPath, 'manager', 'manager', dayKey(now).replace(/-/g, '') + '.json'), null);
  const lead = m && (m.items || []).filter((i) => i.k === 'leads')[0];
  if (lead) out.push({ ic: '🔔', t: clip(lead.t, 80), at: m.at });
  return out;
}

// A customer: his own mail triage (data/biz-home/mail.json, mail-sync.js) and calendar, important kinds only, the one line summary, never the body.
function googleMine(dataPath, now) {
  const out = [];
  const mail = readJson(path.join(dataPath, 'biz-home', 'mail.json'), null);
  const connected = Array.isArray(mail);
  if (connected) {
    mail.filter((r) => r && r.tag !== 'פרסומת' && (r.tag === 'דחוף' || r.tag === 'חשוב' || IMPORTANT.test((r.subject || '') + ' ' + (r.text || ''))) && !NOT_IMPORTANT.test(r.subject || ''))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5)
      .forEach((r) => out.push({ ic: r.tag === 'דחוף' ? '🚨' : '✉️', t: clip(r.text || r.subject, 110), at: r.at }));
  }
  const ev = readJson(path.join(dataPath, 'cal', 'events.json'), null);
  const today = dayKey(now);
  if (ev && Array.isArray(ev.events)) {
    ev.events.filter((e) => e.start && dayKey(Date.parse(e.start)) === today && !e.allDay && Date.parse(e.start) > now - 3600000).slice(0, 3)
      .forEach((e) => out.push({ ic: '📅', t: 'היום ' + hm(Date.parse(e.start)) + ' ' + clip(e.title || 'פגישה', 60), at: new Date(now - 1000).toISOString(), noAgo: true }));
  }
  return { lines: out, connected: connected || !!(ev && Array.isArray(ev.events)) };
}

// Itzik's manager: what it checked and did in its last round, one line each (the lines that are not Google).
function managerItzik(dataPath, now) {
  const m = readJson(path.join(dataPath, 'manager', 'manager', dayKey(now).replace(/-/g, '') + '.json'), null);
  if (!m || !Array.isArray(m.items)) return [];
  const out = [];
  const skip = { brief: 1, mail: 1, cal: 1, leads: 1 };
  m.items.filter((i) => !skip[i.k]).forEach((i) => {
    if (i.st === 'warn') out.push({ ic: '⚠️', t: 'שים לב: ' + clip(i.t, 90), at: m.at });
    else if (i.st === 'done') out.push({ ic: '✓', t: 'בדקתי ותקין: ' + clip(i.t, 90), at: m.at });
  });
  const warn = out.filter((x) => x.ic === '⚠️').slice(0, 3), ok = out.filter((x) => x.ic !== '⚠️').slice(0, 3);
  const round = [{ ic: '🧑‍💼', t: 'הסבב האחרון שלי ב ' + hm(Date.parse(m.at)) + ', ' + m.items.length + ' בדיקות', at: m.at }];
  return round.concat(warn, ok);
}

// A customer: his routines (🧑‍💼 מנהלת IT Solution) and the last look at his ad account.
function managerMine(dataPath, now) {
  const out = [];
  let ads = readJson(path.join(dataPath, 'ads', 'status.json'), null);
  if (ads && ads.ok && ads.at) {
    const camps = [].concat(...(ads.accounts || []).map((a) => a.campaigns || []));
    const on = camps.filter((c) => c.status === 'ACTIVE').length;
    out.push({ ic: '✓', t: 'בדקתי את חשבון המודעות: ' + (on ? on + ' קמפיינים באוויר' : 'אין קמפיין באוויר כרגע'), at: ads.at });
  }
  let routines = [];
  try { routines = require('./routines.js').list(dataPath); } catch (e) { /* none */ }
  routines.filter((r) => r.lastRunAt).sort((a, b) => Date.parse(b.lastRunAt) - Date.parse(a.lastRunAt)).slice(0, 3)
    .forEach((r) => out.push({ ic: '🛠️', t: 'ביצעתי: ' + clip(r.text, 60) + (r.lastResult ? '. ' + clip(r.lastResult, 60) : ''), at: r.lastRunAt }));
  if (!routines.length) out.push({ ic: '🧑‍💼', t: 'עוד אין שגרות. בכפתור מנהלת IT Solution אפשר להגדיר מה אני עושה ובודק כל יום', at: '' });
  return out;
}

// 11.11.2026, Itzik: "בתחתית של לוח הבקרה, מהמייל: אם הגיע משהו מיוחד, אם משהו צריך אישור מיידי או את תשומת ליבי,
// ורשימה של כל הדברים שהמנהל עשה, וזה מתעדכן כל הזמן." Itzik only.
// Mail: data/status/mail-board.json (board-mail.js, every 15 minutes, sender and subject only) plus the manager's last
// mail sweep (manager-work.js through mail-read.js, a reader with no tools), which is already a summary.
function mailItzik(dataPath, now) {
  const mb = readJson(path.join(dataPath, 'status', 'mail-board.json'), null);
  const out = { now: [], look: [], special: [], sweep: null, at: mb && mb.at || '', err: mb && mb.err || '' };
  (mb && Array.isArray(mb.items) ? mb.items : []).forEach((r) => {
    if (!out[r.kind]) return;
    out[r.kind].push({ from: clip(r.from, 40), t: clip(r.subject || '(בלי נושא)', 110), at: r.at, n: r.n || 1 });
  });
  ['now', 'look', 'special'].forEach((k) => { out[k] = out[k].slice(0, 8); });
  const w = readJson(path.join(dataPath, 'manager', 'work', dayKey(now).replace(/-/g, '') + '.json'), null);
  const sw = w && Array.isArray(w.items) ? w.items.filter((i) => i.kind === 'mailsweep' && i.status !== 'failed').pop() : null;
  if (sw) {
    out.sweep = { urgent: sw.status === 'needsItzik', at: sw.when,
      lines: String(sw.line || '').split(' · ').map((l) => clip(l.replace(/[,\s]*\[[\d,\s]+\]/g, '').replace(/<[^>]*>/g, '').replace(/\s+([,.])/g, '$1').replace(/(^|\D)\d{6}(?!\d)/g, '$1קוד'), 160)).filter(Boolean).slice(0, 6) };
  }
  return out;
}

// Everything the manager did today, newest first: each task it tried (done, left for Itzik, failed), each work order it
// sent to the PC, the external approvals it followed, and its last round of checks.
function doneItzik(dataPath, now, hide) {
  const day = dayKey(now), dk = day.replace(/-/g, '');
  const out = [];
  const w = readJson(path.join(dataPath, 'manager', 'work', dk + '.json'), null);
  (w && Array.isArray(w.items) ? w.items : []).forEach((i) => {
    if (i.kind === 'mailsweep') {
      out.push(i.status === 'failed'
        ? { ic: '✗', st: 'bad', t: 'ניסיתי לעבור על המיילים ולא הצלחתי', at: i.when }
        : { ic: '📬', st: i.status === 'needsItzik' ? 'warn' : 'ok', t: 'עברתי על המיילים' + (i.status === 'needsItzik' ? ', יש משהו בשבילך (למעלה, במייל)' : ', אין דחוף'), at: i.when });
      return;
    }
    const what = clip(i.text, 70);
    if (i.status === 'done') out.push({ ic: '✓', st: 'ok', t: 'סגרתי: ' + what + (i.line ? '. ' + clip(i.line, 90) : ''), at: i.when });
    else if (i.status === 'needsItzik') out.push({ ic: '✋', st: 'warn', t: 'נשאר לך: ' + what + (i.line ? '. ' + clip(i.line, 90) : ''), at: i.when });
    else out.push({ ic: '✗', st: 'bad', t: 'ניסיתי ולא הצלחתי: ' + what, at: i.when });
  });
  const st = readJson(path.join(dataPath, 'manager', 'state.json'), {}) || {};
  Object.keys(st.fixed || {}).filter((k) => k.indexOf(day + '|') === 0).forEach((k) => {
    out.push({ ic: '🛠️', st: 'ok', t: 'שלחתי למחשב לטפל: ' + clip(k.split('|').slice(2).join(' '), 90), at: st.fixed[k] });
  });
  const ap = Object.keys(st.apprTask || {}).filter((k) => String(st.apprTask[k]).slice(0, 10) === day);
  if (ap.length) out.push({ ic: '🛡️', st: 'ok', t: 'בדקתי ' + ap.length + ' אישורים חיצוניים שמחכים (מטא וגוגל)', at: st.apprTask[ap[0]] });
  if (st.pushed === day && st.pushedAt) out.push({ ic: '📲', st: 'ok', t: 'שלחתי לך את סיכום הבוקר לטלפון', at: st.pushedAt });
  const m = readJson(path.join(dataPath, 'manager', 'manager', dk + '.json'), null);
  if (m && Array.isArray(m.items)) {
    const ok = m.items.filter((i) => i.st === 'done').length, warn = m.items.filter((i) => i.st === 'warn').length;
    out.push({ ic: '🧑‍💼', st: 'ok', t: 'סבב בדיקות ב ' + hm(Date.parse(m.at)) + ': ' + m.items.length + ' בדיקות, ' + ok + ' תקינות' + (warn ? ', ' + warn + ' דורשות תשומת לב' : ''), at: m.at,
      sub: m.items.filter((i) => i.st === 'warn').map((i) => clip(i.t, 80)).slice(0, 5) });
  }
  // k is the key the board sends back when Itzik ticks a line to hide it (prefs doneHide); lines he hid are not listed
  const hid = new Set(hide || []);
  return out.map((x) => Object.assign(x, { k: String(x.at) + "|" + x.t.slice(0, 40) })).filter((x) => !hid.has(x.k))
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)).slice(0, 40);
}

// 11.11.2026, Itzik, for Dr. Shulman: the same 📬 block as his own, from the customer's mail triage (mail-sync.js,
// data/biz-home/mail.json: one line summary, never the body). דחוף is for now, חשוב or an important kind is for attention,
// a person (not a system) who wrote is special. Marketing is left out.
const ROBOT_FROM = /no.?reply|noreply|notification|mailer|news|info@|support@|marketing|hello@|team@|updates@|bounce|automated/i;
function mailMine(dataPath) {
  const f = path.join(dataPath, 'biz-home', 'mail.json');
  const mail = readJson(f, null);
  const out = { now: [], look: [], special: [], sweep: null, at: '' };
  if (!Array.isArray(mail)) return null;
  // no "checked at": mail-sync.js checks every 15 minutes but writes the file only when new mail came
  mail.filter((r) => r && r.tag !== 'פרסומת' && !NOT_IMPORTANT.test(r.subject || ''))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).forEach((r) => {
      const from = clip(String(r.from || '').replace(/<[^>]*>/g, '').replace(/"/g, ''), 40);
      const row = { from, t: clip(r.text || r.subject || '', 110), at: r.at, n: 1 };
      if (r.tag === 'דחוף') out.now.push(row);
      else if (r.tag === 'חשוב' || IMPORTANT.test((r.subject || '') + ' ' + (r.text || ''))) out.look.push(row);
      else if (!ROBOT_FROM.test(r.from || '')) out.special.push(row);
    });
  ['now', 'look', 'special'].forEach((k) => { out[k] = out[k].slice(0, 6); });
  return out;
}
function doneMine(dataPath, now) {
  return managerMine(dataPath, now).filter((x) => x.at).map((x, i) => ({ ic: x.ic, st: 'ok', t: x.t, at: x.at, k: 'm' + i + '-' + String(x.at).slice(0, 16) }));
}

function forPage(inst, now) {
  if (!enabled(inst)) return null;
  const mode = modeOf(inst), dp = inst.dataPath;
  const prefs = readPrefs(dp, mode);
  let google = [], mgr = [], mailNote = '';
  if (mode === 'itzik') { google = googleItzik(dp, now); mgr = managerItzik(dp, now); }
  else {
    const g = googleMine(dp, now); google = g.lines;
    if (!g.connected) mailNote = 'עדכוני גוגל ומייל יופיעו כאן אחרי שמחברים את גוגל במסך 🔌 חיבורים';
    mgr = managerMine(dp, now);
  }
  // Google first (three fifths of the room), so the manager's lines never push an invoice off the list.
  const max = prefs.updates.max;
  const g = prefs.updates.google ? google.slice(0, prefs.updates.manager ? Math.ceil(max * 0.6) : max) : [];
  const m = prefs.updates.manager ? mgr.slice(0, max - g.length) : [];
  let lines = g.concat(m);
  lines.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  const res = { mode, prefs, updates: lines, mailNote: prefs.updates.google ? mailNote : '' };
  if (mode === 'itzik') { res.mail = mailItzik(dp, now); res.done = doneItzik(dp, now, prefs.doneHide); }
  // 11.11.2026, Itzik: "תשלח את זה גם לאיליי": every customer board gets the same bottom (mail, manager, ask line)
  if (mode === 'clinic' || mode === 'mine') { res.mail = mailMine(dp) || { none: true, now: [], look: [], special: [], sweep: null, at: '' }; res.done = doneMine(dp, now); }
  return res;
}

module.exports = { enabled, modeOf, readPrefs, forPage, googleItzik, googleMine, managerItzik, managerMine, mailItzik, doneItzik, mailMine, doneMine, IMPORTANT, NOT_IMPORTANT };
