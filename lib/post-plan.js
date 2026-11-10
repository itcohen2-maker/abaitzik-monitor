'use strict';
/*
  10.11.2026, Itzik: "מסך אחד, שבצד אחד מראה את כל הרשתות, וצד שני את כל השבוע ... וכל רשת מסומן לידה ביום מתי
  זה עולה, ואפשרויות לשינוי ולעריכת הלוח". The week plan behind 🎛️ לוח הפרסומים (build.js boardSheet).

  data/schedule/plan.json   { at, rows: { <row id>: { days: [sun..sat, "HH:MM" or ""] } } }
  A row missing from the file keeps its default below. The page sends a change through ntfy (Title post-plan,
  signed with the owner code), listen.js recordPostPlan calls save(). Who reads it:
    ai-he, ai-en  ai-post.js posts that channel on a day with a time, from that time
    st            wa-status-morning.js reminds at that time
    pl, car, me, it   plan-remind.js reminds at that time (these go up by hand)
    nr, li        their own queues carry a time per item (save() changes an item's time)
    ads           the paid campaign runs all day, nothing to schedule
*/
const fs = require('fs');
const path = require('path');

const WEEK = (t) => [t, t, t, t, t, t, ''];
const ROWS = [
  { id: 'st', ic: '📲', n: 'סטטוס וואטסאפ', kind: 'remind', tab: 'st', def: WEEK('08:30') },
  { id: 'ai-he', ic: '📸', n: 'itsolution.ai', sub: 'AI עברית', kind: 'auto', tab: 'ai', def: WEEK('20:00') },
  { id: 'ai-en', ic: '📸', n: 'itsolution.global', sub: 'AI אנגלית', kind: 'auto', tab: 'ai', def: WEEK('20:00') },
  { id: 'nr', ic: '🕯️', n: 'candle.times', sub: 'נרות', kind: 'items', tab: 'nr' },
  { id: 'li', ic: '💼', n: 'לינקדין', kind: 'items', tab: '' },
  { id: 'ads', ic: '📣', n: 'ממומן מטא', kind: 'always', tab: 'ads' },
  { id: 'pl', ic: '🍽️', n: 'מה בצלחת', sub: 'סטורי', kind: 'remind', tab: 'pl', def: WEEK('') },
  { id: 'car', ic: '🎠', n: 'קרוסלות', kind: 'remind', tab: 'car', def: WEEK('') },
  { id: 'me', ic: '🎬', n: 'הרילים שלי', kind: 'remind', tab: 'me', def: WEEK('') },
  { id: 'it', ic: '💻', n: 'רילים IT Solution', kind: 'remind', tab: 'it', def: WEEK('') },
];
const HM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function file(dataPath) { return path.join(dataPath, 'schedule', 'plan.json'); }

function read(dataPath) {
  let f = {};
  try { f = JSON.parse(fs.readFileSync(file(dataPath), 'utf8')) || {}; } catch (e) {}
  const rows = {};
  ROWS.forEach((r) => {
    if (!r.def) return;
    const got = f.rows && f.rows[r.id] && Array.isArray(f.rows[r.id].days) ? f.rows[r.id].days : null;
    rows[r.id] = { days: (got && got.length === 7 ? got : r.def).map((t) => (HM.test(String(t)) ? String(t) : '')) };
  });
  return { at: f.at || '', rows };
}

// the time of a row on a weekday (0 = Sunday), or '' when nothing is planned
function time(plan, id, dow) { const r = plan.rows[id]; return r ? r.days[dow] || '' : ''; }

// minutes since midnight; a reminder is sent only in the 3 hours after its time (a late edit sends nothing old)
function mins(hm) { const p = String(hm).split(':'); return (+p[0]) * 60 + (+p[1]); }
function dueNow(t, hm) { return !!t && mins(hm) >= mins(t) && mins(hm) < mins(t) + 180; }

/*
  got: { rows?: { <id>: { days: [7] } }, items?: [{ kind: "li" | "nr", id, time }] }
  root: the monitor folder (data/ and docs/ are under it). Returns a short line for the log.
*/
function save(root, got) {
  const dataPath = path.join(root, 'data');
  const cur = read(dataPath);
  const said = [];
  Object.keys((got && got.rows) || {}).forEach((id) => {
    const r = ROWS.find((x) => x.id === id && x.def);
    const d = got.rows[id] && got.rows[id].days;
    if (!r || !Array.isArray(d) || d.length !== 7) return;
    cur.rows[id] = { days: d.map((t) => (HM.test(String(t)) ? String(t) : '')) };
    said.push(id);
  });
  cur.at = new Date().toISOString();
  fs.mkdirSync(path.dirname(file(dataPath)), { recursive: true });
  fs.writeFileSync(file(dataPath), JSON.stringify(cur, null, 1));
  const Q = { li: path.join(dataPath, 'linkedin', 'queue.json'), nr: path.join(root, 'docs', 'ner', 'queue.json') };
  const items = Array.isArray(got && got.items) ? got.items.slice(0, 40) : [];
  Object.keys(Q).forEach((k) => {
    const mine = items.filter((x) => x && x.kind === k && HM.test(String(x.time)));
    if (!mine.length) return;
    let q; try { q = JSON.parse(fs.readFileSync(Q[k], 'utf8')); } catch (e) { return; }
    let n = 0;
    mine.forEach((x) => {
      const it = q.find((y) => (k === 'li' ? y.id : y.name) === x.id && !y.posted);
      if (it && it.time !== x.time) { it.time = x.time; n++; said.push(k + ':' + x.id + ' ' + x.time); }
    });
    if (n) fs.writeFileSync(Q[k], JSON.stringify(q, null, 1));
  });
  return said.join(', ') || 'בלי שינוי';
}

module.exports = { ROWS, read, time, dueNow, save };
