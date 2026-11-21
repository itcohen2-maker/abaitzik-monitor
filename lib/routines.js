'use strict';
/*
  10.11.2026, Itzik: "מנהל לכל מוניטור, והלקוח נכנס לכפתור של המנהל ושם מקליט את כל הבקשות שחוזרות על עצמן."
  The tile "🧑‍💼 מנהלת IT Solution" (build.js, myMgrSheet) saves a routine: one request that comes back on a schedule.
  This file is everything about them that is not the page:

    data/routines/routines/<id>.json   one file per routine, written by the listener (no model),
    dueNow() / tick()                  run by worker.js on its one minute timer, the same timer that answers messages,
    forPage()                          what the sealed page payload carries (D.routines), never the public live.json,
    promptLines()                      what a worker session is told about a message that starts with "שגרה:".

  Two kinds, on purpose:
    remind  a push to the owner's phone at the time. Code only, no model, costs no quota.
    work    "the manager prepares it and brings the answer": a chat message "שגרה: <text>" is written and the normal
            worker answers it, with its quota, its hold and its approval rules. A routine never gets more rights than
            a message typed by hand: sends, payments and deletes still wait for the owner's approval.

  A routine can be paused and deleted from the page. At most MAX_ACTIVE active ones per monitor, and at most
  MAX_WORK_PER_TICK work routines started in one minute, so a morning with many routines cannot burn the day's cap.
  Times are always Asia/Jerusalem: the server clock is UTC.
*/
const fs = require('fs');
const path = require('path');

const TZ = 'Asia/Jerusalem';
const MAX_ACTIVE = 24; // 14.11.2026: agents, each with a few routines (was 8)
const MAX_WORK_PER_TICK = 2;
const LATE_MS = 6 * 3600 * 1000; // a missed time is still done if it is less than 6 hours old, else it waits for the next one
const KINDS = ['remind', 'work'];
const FREQS = ['daily', 'weekly', 'monthly', 'hourly'];
// 14.11.2026: "כל שעה" runs at the chosen minute of every hour from HOUR_FROM to HOUR_TO, not through the night.
const HOUR_FROM = 8, HOUR_TO = 20;

function dirOf(dataPath) { return path.join(dataPath, 'routines', 'routines'); }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), 'utf8');
  fs.renameSync(f + '.tmp', f);
}

// ---- Jerusalem wall clock <-> epoch, without a time zone library ----
const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function parts(ms) {
  const o = {};
  FMT.formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, dow: WD[o.weekday] };
}
function offsetAt(ms) { const p = parts(ms); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000; }
function localToEpoch(y, m, d, h, mi) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t); // the offset at the answer, which settles the day the clocks change
  return t;
}
function addDays(y, m, d, n) { const t = new Date(Date.UTC(y, m - 1, d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() }; }

function matchesDay(s, day) {
  if (s.freq === 'daily') return true;
  if (s.freq === 'weekly') return (s.days || []).indexOf(day.dow) >= 0;
  if (s.freq === 'monthly') return day.d === s.dom;
  return false;
}
function hm(s) { const a = String(s.hm).split(':'); return [+a[0], +a[1]]; }

// 14.11.2026: every moment of an hourly routine on one day
function hourlyTimes(r, day) { const mi = hm(r.sched)[1], out = []; for (let h = HOUR_FROM; h <= HOUR_TO; h++) out.push(localToEpoch(day.y, day.m, day.d, h, mi)); return out; }
// the latest scheduled moment that is not after `now` (epoch ms), or 0
function lastScheduled(r, now) {
  if (r.sched.freq === 'hourly') { const p = parts(now); for (let back = 0; back <= 2; back++) { const day = addDays(p.y, p.m, p.d, -back); const ts = hourlyTimes(r, day).filter((t) => t <= now); if (ts.length) return ts[ts.length - 1]; } return 0; }
  const p = parts(now), [h, mi] = hm(r.sched);
  for (let back = 0; back <= 40; back++) {
    const day = addDays(p.y, p.m, p.d, -back);
    if (!matchesDay(r.sched, day)) continue;
    const t = localToEpoch(day.y, day.m, day.d, h, mi);
    if (t <= now) return t;
  }
  return 0;
}
// the first scheduled moment after `now`, or 0
function nextScheduled(r, now) {
  if (r.sched.freq === 'hourly') { const p = parts(now); for (let ahead = 0; ahead <= 2; ahead++) { const day = addDays(p.y, p.m, p.d, ahead); const ts = hourlyTimes(r, day).filter((t) => t > now); if (ts.length) return ts[0]; } return 0; }
  const p = parts(now), [h, mi] = hm(r.sched);
  for (let ahead = 0; ahead <= 62; ahead++) {
    const day = addDays(p.y, p.m, p.d, ahead);
    if (!matchesDay(r.sched, day)) continue;
    const t = localToEpoch(day.y, day.m, day.d, h, mi);
    if (t > now) return t;
  }
  return 0;
}

// ---- validation: the page sends JSON, the listener checks it here and writes the file ----
function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function validate(o) {
  if (!o || typeof o !== 'object') return { ok: false, why: 'לא הגיע מידע' };
  const text = clean(o.text);
  if (text.length < 3) return { ok: false, why: 'חסר מה לעשות' };
  if (text.length > 400) return { ok: false, why: 'הבקשה ארוכה מדי (עד 400 תווים)' };
  const kind = KINDS.indexOf(o.kind) >= 0 ? o.kind : '';
  if (!kind) return { ok: false, why: 'לא נבחר סוג' };
  const s = o.sched || {};
  if (FREQS.indexOf(s.freq) < 0) return { ok: false, why: 'לא נבחר כל כמה זמן' };
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(s.hm || ''));
  if (!m) return { ok: false, why: 'שעה לא תקינה' };
  const sched = { freq: s.freq, hm: (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2] };
  if (s.freq === 'weekly') {
    const days = Array.from(new Set((Array.isArray(s.days) ? s.days : []).map(Number).filter((n) => n >= 0 && n <= 6))).sort();
    if (!days.length) return { ok: false, why: 'לא נבחר יום בשבוע' };
    sched.days = days;
  }
  if (s.freq === 'monthly') {
    const dom = Number(s.dom);
    if (!(dom >= 1 && dom <= 31)) return { ok: false, why: 'יום בחודש לא תקין' };
    sched.dom = Math.floor(dom);
  }
  const value = { text, kind, sched };
  if (o.agent != null && o.agent !== '') { if (!AGENT_ID.test(String(o.agent))) return { ok: false, why: 'סוכן לא תקין' }; value.agent = String(o.agent); }
  return { ok: true, value };
}

const AGENT_ID = /^a[a-z0-9]{4,20}$/;
// ---- 14.11.2026: agents. data/routines/agents.json: [{ id, name, role, c }] ----
function agentsFile(dataPath) { return path.join(dataPath, 'routines', 'agents.json'); }
function agents(dataPath) { const a = readJson(agentsFile(dataPath), []); return Array.isArray(a) ? a.filter((x) => x && AGENT_ID.test(String(x.id))) : []; }
const MAX_AGENTS = 24; // 14.11: his fixed agents and the manager name are saved here too
// add or update one agent (by id). Returns { ok, agent } or { ok:false, why }
function agentSave(dataPath, o) {
  if (!o || !AGENT_ID.test(String(o.id))) return { ok: false, why: 'סוכן לא תקין' };
  const name = clean(o.name).slice(0, 24), role = clean(o.role).slice(0, 80);
  if (!name) return { ok: false, why: 'חסר שם לסוכן' };
  const L = agents(dataPath), i = L.findIndex((x) => x.id === o.id);
  const c = Math.max(0, Math.min(3, Number(o.c) || 0));
  if (i < 0) { if (L.length >= MAX_AGENTS) return { ok: false, why: 'כבר יש ' + MAX_AGENTS + ' סוכנים' }; L.push({ id: String(o.id), name, role, c, createdAt: new Date().toISOString() }); }
  else { L[i].name = name; if (o.role != null) L[i].role = role; }
  writeJson(agentsFile(dataPath), L);
  return { ok: true, agent: L[i < 0 ? L.length - 1 : i] };
}
// removes the agent and its routines
function agentRemove(dataPath, id) {
  if (!AGENT_ID.test(String(id))) return false;
  const L = agents(dataPath), n = L.filter((x) => x.id !== id);
  if (n.length === L.length) return false;
  writeJson(agentsFile(dataPath), n);
  list(dataPath).filter((r) => r.agent === id).forEach((r) => remove(dataPath, r.id));
  return true;
}
// 14.11.2026: "להריץ עכשיו". The routine is due on the next minute, once, and keeps its own schedule.
function runNow(dataPath, id) {
  if (!/^r[a-z0-9]{4,20}$/.test(String(id))) return false;
  const f = path.join(dirOf(dataPath), id + '.json'), r = readJson(f, null);
  if (!r) return false;
  r.runNow = true; writeJson(f, r); return true;
}
function list(dataPath) {
  let files = [];
  try { files = fs.readdirSync(dirOf(dataPath)); } catch (e) { return []; }
  return files.filter((f) => /\.json$/.test(f)).map((f) => readJson(path.join(dirOf(dataPath), f), null)).filter((r) => r && r.id && r.sched)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}
function newId() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

// add: returns { ok, id } or { ok:false, why }
function add(dataPath, o, now) {
  const v = validate(o);
  if (!v.ok) return v;
  if (list(dataPath).filter((r) => r.state === 'active').length >= MAX_ACTIVE) {
    return { ok: false, why: 'כבר יש ' + MAX_ACTIVE + ' שגרות פעילות. עוצרים או מוחקים אחת לפני שמוסיפים.' };
  }
  const id = newId();
  const rec = Object.assign({ id, state: 'active', createdAt: new Date(now || Date.now()).toISOString(), lastRunAt: null, lastResult: '' }, v.value);
  writeJson(path.join(dirOf(dataPath), id + '.json'), rec);
  return { ok: true, id, rec };
}
function setState(dataPath, id, state) {
  if (!/^r[a-z0-9]{4,20}$/.test(String(id))) return false;
  const f = path.join(dirOf(dataPath), id + '.json'), r = readJson(f, null);
  if (!r) return false;
  if (state === 'active' && list(dataPath).filter((x) => x.state === 'active' && x.id !== id).length >= MAX_ACTIVE) return false;
  r.state = state;
  writeJson(f, r);
  return true;
}
function remove(dataPath, id) {
  if (!/^r[a-z0-9]{4,20}$/.test(String(id))) return false;
  try { fs.unlinkSync(path.join(dirOf(dataPath), id + '.json')); return true; } catch (e) { return false; }
}

// routines whose latest scheduled moment has come and was not run yet
function dueNow(dataPath, now) {
  return list(dataPath).filter((r) => r.state === 'active' || r.runNow).map((r) => {
    if (r.runNow) return { r, at: now };
    const at = lastScheduled(r, now);
    const since = Date.parse(r.lastRunAt || r.createdAt) || 0;
    return at && at > since && now - at < LATE_MS ? { r, at } : null;
  }).filter(Boolean);
}
function markRun(dataPath, r, now, result) {
  const f = path.join(dirOf(dataPath), r.id + '.json'), cur = readJson(f, null);
  if (!cur) return;
  cur.lastRunAt = new Date(now).toISOString();
  cur.lastResult = result;
  delete cur.runNow;
  // 14.11.2026: the last runs, for "עבודת המנהל" (what was done today)
  cur.runs = [{ at: cur.lastRunAt, result }].concat(Array.isArray(cur.runs) ? cur.runs : []).slice(0, 12);
  writeJson(f, cur);
}

/*
  tick(dataPath, now, hooks, opts)
    hooks.push(title, body)   a phone push (remind routines)
    hooks.chat(text, id)      a chat message for the worker (work routines), id is unique per run
    opts.only                 'remind' | 'work': the worker runs reminders before its quota guards (they cost nothing)
                              and work routines after them (a held monitor starts none)
  returns what it did, for the log.
*/
function tick(dataPath, now, hooks, opts) {
  const only = opts && opts.only, did = [];
  let work = 0;
  dueNow(dataPath, now).forEach((x) => {
    const r = x.r;
    if (only && only !== r.kind) return;
    try {
      if (r.kind === 'remind') {
        hooks.push('⏰ ' + r.text, 'שגרה שלך, ' + labelOf(r.sched));
        markRun(dataPath, r, now, 'נשלחה תזכורת');
        did.push('תזכורת: ' + r.text);
      } else if (r.kind === 'work') {
        if (work >= MAX_WORK_PER_TICK) return; // the next minute takes it, it is still due
        work++;
        hooks.chat('שגרה: ' + r.text, 'routine-' + r.id + '-' + x.at);
        markRun(dataPath, r, now, 'נשלח למנהל, התשובה במסך התשובות');
        did.push('עבודה: ' + r.text);
      }
    } catch (e) { did.push('נכשלה ' + r.id + ': ' + e.message); }
  });
  return did;
}

const DAY_NAME = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
function labelOf(s) {
  if (s.freq === 'hourly') return 'כל שעה, מ ' + String(HOUR_FROM).padStart(2, '0') + ':' + String(s.hm).split(':')[1] + ' עד ' + HOUR_TO + ':' + String(s.hm).split(':')[1];
  if (s.freq === 'daily') return 'כל יום ב ' + s.hm;
  if (s.freq === 'weekly') return 'כל ' + (s.days || []).map((d) => DAY_NAME[d]).join(' ו') + ' ב ' + s.hm;
  return 'ב ' + s.dom + ' לחודש ב ' + s.hm;
}

// what the page gets: no file names, no server paths
function forPage(dataPath, now) {
  return list(dataPath).map((r) => ({ id: r.id, text: r.text, kind: r.kind, sched: r.sched, state: r.state, label: labelOf(r.sched), agent: r.agent || '', runNow: !!r.runNow,
    runs: (Array.isArray(r.runs) ? r.runs : r.lastRunAt ? [{ at: r.lastRunAt, result: r.lastResult || '' }] : []).slice(0, 6),
    next: r.state === 'active' ? new Date(nextScheduled(r, now)).toISOString() : '', lastRunAt: r.lastRunAt || '', lastResult: r.lastResult || '' }));
}

function agentsForPage(dataPath) { return agents(dataPath).map((a) => ({ id: a.id, name: a.name, role: a.role || '', c: a.c || 0 })); }
function promptLines() {
  return [
    'הודעה שמתחילה ב "שגרה:" לא נכתבה ביד: היא נוצרה לבד, בזמן שהלקוח קבע בכפתור 🧑‍💼 מנהלת IT Solution (שגרה חוזרת מסוג עבודה). מה עושים:',
    '  1. מבצעים את מה שכתוב אחרי "שגרה:" כמו בקשה רגילה, ובאותם כללים בדיוק: שליחה לאנשים, תשלום, מחיקה ושינוי במוניטור לא מבוצעים, מכינים טיוטה או בקשת אישור.',
    '  2. התשובה קצרה ומוכנה לקריאה בטלפון, בלי שאלות פתוחות אם אפשר להחליט לבד. התשובה מופיעה במסך התשובות של הלקוח.',
    '  3. "מנהלת IT Solution" היא הכפתור של הלקוח. "המנהל" ב "בקשה ממנהל:" הוא בעל המערכת שמאשר שינויים. לא לבלבל ביניהם.',
    '',
  ];
}

module.exports = { agents, agentSave, agentRemove, runNow, agentsForPage, MAX_AGENTS, validate, add, list, setState, remove, dueNow, markRun, tick, forPage, promptLines, labelOf, lastScheduled, nextScheduled, parts, localToEpoch, MAX_ACTIVE };
