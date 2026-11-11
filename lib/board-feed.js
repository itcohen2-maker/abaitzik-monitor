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
function modeOf(inst) { return inst.name === 'abaitzik' ? 'itzik' : 'mine'; }

// What counts as important from Google: invoices, receipts, payments, official or legal mail, leads, meetings. Never marketing.
const IMPORTANT = /חשבונית|קבלה|תשלום|לתשלום|שולם|חוב|רשות המסים|מס הכנסה|ביטוח לאומי|עו״ד|עורך דין|משפט|תביעה|הסכם|חוזה|ליד|פגישה|פגישת|יומן|בנק|invoice|receipt|payment/i;
const NOT_IMPORTANT = /פרסומת|newsletter|וובינר|webinar|מבצע|הנחה|promo/i;

function readPrefs(dataPath, mode) {
  const p = readJson(path.join(dataPath, 'board-prefs.json'), {}) || {};
  const u = p.updates && typeof p.updates === 'object' ? p.updates : {};
  const r = p.report && typeof p.report === 'object' ? p.report : {};
  const arr = (x) => (Array.isArray(x) ? x : []);
  return {
    hideRows: arr(p.hideRows).map(String),
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
      .filter((l) => IMPORTANT.test(l) && !NOT_IMPORTANT.test(l)).slice(0, 4)
      .forEach((l) => out.push({ ic: '✉️', t: clip(l, 110), at: latest.at }));
  }
  const ev = readJson(path.join(dataPath, 'cal', 'events.json'), null);
  const today = dayKey(now);
  if (ev && Array.isArray(ev.events)) {
    const seen = {};
    ev.events.filter((e) => e.start && dayKey(Date.parse(e.start)) === today && !(e.allDay) && Date.parse(e.start) > now - 3600000)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).forEach((e) => {
        const k = hm(Date.parse(e.start)) + (e.title || ''); if (seen[k]) return; seen[k] = 1;
        if (Object.keys(seen).length <= 3 && !NOT_IMPORTANT.test(e.title || '')) out.push({ ic: '📅', t: 'היום ' + hm(Date.parse(e.start)) + ' ' + clip(e.title || 'פגישה', 60), at: new Date(now - 1000).toISOString(), noAgo: true });
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
  // Google first (half of the room, at least), so the manager's lines never push an invoice off the list.
  const max = prefs.updates.max;
  const g = prefs.updates.google ? google.slice(0, prefs.updates.manager ? Math.ceil(max / 2) : max) : [];
  const m = prefs.updates.manager ? mgr.slice(0, max - g.length) : [];
  let lines = g.concat(m);
  lines.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  return { mode, prefs, updates: lines, mailNote: prefs.updates.google ? mailNote : '' };
}

module.exports = { enabled, modeOf, readPrefs, forPage, googleItzik, googleMine, managerItzik, managerMine, IMPORTANT, NOT_IMPORTANT };
