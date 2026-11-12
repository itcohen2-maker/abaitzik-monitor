'use strict';
/*
  12.11.2026, Itzik: "תוסיף במוניטור אייקון של מצב אישי כמו בסרטון החדש ... בפעם הראשונה תן לו אופציות ותגיד שתמיד
  אפשר לשנות, ואז שם הוא יתן פקודות מה לשים, זה יעבור למנהל המוניטור שלו והמנהל ישים את כל בקשות המיון של המצב האישי.
  המצב האישי יהיה בצבע אחר כמו בסרטון. תוסיף את זה בכל המוניטורים."

  The round icon "🏡 מצב אישי" (build.js, personalSheet) on every monitor, his and every customer's. The page is in the
  calm colours of the ad (~/clip/ad_personal): cream, sage, peach, sand.

    data/personal/state.json           what he picked, the order, a line per tile, tiles the manager added
    data/personal/requests/<id>.json   every "what to put / how to sort" he wrote, open until the manager answers

  Two ways in, on purpose:
    "מצב אישי בחירה: k1,k2"   the first time choice and every change of it. Saved by the listener, no model, silent.
    "מצב אישי בקשה: <text>"   a free request. The listener saves it and leaves the message for the worker, so the
                              monitor's manager (a normal session, with its quota and approval rules) applies it with
                              `node lib/personal.js apply <dataPath> '<json>'` and answers in the answers screen.
*/
const fs = require('fs');
const path = require('path');

// The choices on the first open. The four kids tiles are his final list (12.11): גן ובית ספר, טיולים, בריאות, ספורט.
const CATALOG = [
  { k: 'doctor', i: '🩺', t: 'תורים לרופא', c: '#d6e6cf' },
  { k: 'tickets', i: '🎟️', t: 'כרטיסים והופעות', c: '#e3d9f2' },
  { k: 'shop', i: '🛒', t: 'רשימת קניות', c: '#efe2c6' },
  { k: 'pills', i: '💊', t: 'תרופות ומרשמים', c: '#f8d9c2' },
  { k: 'docs', i: '🛂', t: 'דרכון, רישיון ורכב', c: '#efe2c6' },
  { k: 'bills', i: '🏠', t: 'חשבונות הבית', c: '#f3d3d3' },
  { k: 'growth', i: '📚', t: 'וובינרים, סדנאות וקורסים', c: '#e3d9f2' },
  { k: 'dates', i: '🎂', t: 'ימי הולדת ואירועים', c: '#f8d9c2' },
  { k: 'kidsSchool', i: '🎒', t: 'ילדים: גן ובית ספר', c: '#d6e6cf' },
  { k: 'kidsTrips', i: '🚌', t: 'ילדים: טיולים', c: '#efe2c6' },
  { k: 'kidsHealth', i: '🧸', t: 'ילדים: בריאות', c: '#f3d3d3' },
  { k: 'kidsSport', i: '⚽', t: 'ילדים: ספורט', c: '#d6e6cf' },
];
const PALETTE = ['#d6e6cf', '#f8d9c2', '#efe2c6', '#e3d9f2', '#f3d3d3'];
const MAX_EXTRA = 12;
const MAX_TEXT = 600;

function dir(dataPath) { return path.join(dataPath, 'personal'); }
function stateFile(dataPath) { return path.join(dir(dataPath), 'state.json'); }
function reqDir(dataPath) { return path.join(dir(dataPath), 'requests'); }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), 'utf8');
  fs.renameSync(f + '.tmp', f);
}
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n || 200);

function load(dataPath) {
  const s = readJson(stateFile(dataPath), null) || {};
  return {
    picked: Array.isArray(s.picked) ? s.picked : [],
    order: Array.isArray(s.order) ? s.order : [],
    notes: s.notes && typeof s.notes === 'object' ? s.notes : {},
    extra: Array.isArray(s.extra) ? s.extra : [],
    at: s.at || '',
  };
}
function save(dataPath, s) { s.at = new Date().toISOString(); writeJson(stateFile(dataPath), s); return s; }
function known(s) { return CATALOG.map((c) => c.k).concat(s.extra.map((x) => x.k)); }

// The tiles in the order he sees them: the manager's order first, then the rest of what he picked.
function tiles(s) {
  const all = {};
  CATALOG.forEach((c) => { all[c.k] = c; });
  s.extra.forEach((x) => { all[x.k] = x; });
  const on = s.picked.filter((k) => all[k]).concat(s.extra.map((x) => x.k).filter((k) => s.picked.indexOf(k) < 0));
  const ord = s.order.filter((k) => on.indexOf(k) >= 0);
  on.forEach((k) => { if (ord.indexOf(k) < 0) ord.push(k); });
  return ord.map((k) => ({ k, i: all[k].i, t: all[k].t, c: all[k].c || PALETTE[0], note: clean(s.notes[k] || '', 160) }));
}

// "מצב אישי בחירה: doctor,shop" from the page. Unknown keys are dropped; an empty list is allowed (he cleared it).
function setPicked(dataPath, keys) {
  const s = load(dataPath);
  const ok = known(s);
  const list = String(keys || '').split(/[,\s]+/).filter((k) => ok.indexOf(k) >= 0);
  s.picked = list.filter((k, i) => list.indexOf(k) === i);
  s.chosen = true;
  save(dataPath, s);
  return s.picked;
}

function addRequest(dataPath, text) {
  const t = clean(text, MAX_TEXT);
  if (!t) return null;
  const id = 'p' + Date.now().toString(36);
  const rec = { id, at: new Date().toISOString(), text: t, state: 'open', answer: '' };
  writeJson(path.join(reqDir(dataPath), id + '.json'), rec);
  return rec;
}
function requests(dataPath) {
  let f = [];
  try { f = fs.readdirSync(reqDir(dataPath)).filter((x) => /\.json$/.test(x)); } catch (e) { return []; }
  return f.map((x) => readJson(path.join(reqDir(dataPath), x), null)).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1));
}

/*
  What the manager runs. patch: { order:[k], notes:{k:text|""}, add:[{t,i}], remove:[k], pick:[k], unpick:[k],
  done:{id, answer} }. Everything optional. Returns a short line for the log.
*/
function apply(dataPath, patch) {
  const p = patch && typeof patch === 'object' ? patch : {};
  const s = load(dataPath);
  const did = [];
  (Array.isArray(p.add) ? p.add : []).forEach((a) => {
    const t = clean(a && a.t, 40);
    if (!t || s.extra.length >= MAX_EXTRA) return;
    const k = 'x' + Date.now().toString(36) + s.extra.length;
    s.extra.push({ k, i: clean(a.i, 4) || '📌', t, c: PALETTE[s.extra.length % PALETTE.length] });
    s.picked.push(k);
    did.push('נוסף ' + t);
  });
  (Array.isArray(p.pick) ? p.pick : []).forEach((k) => { if (known(s).indexOf(k) >= 0 && s.picked.indexOf(k) < 0) { s.picked.push(k); did.push('נבחר ' + k); } });
  const off = [].concat(Array.isArray(p.remove) ? p.remove : [], Array.isArray(p.unpick) ? p.unpick : []);
  off.forEach((k) => {
    const i = s.picked.indexOf(k); if (i >= 0) s.picked.splice(i, 1);
    s.extra = s.extra.filter((x) => x.k !== k);
    did.push('הוסר ' + k);
  });
  if (Array.isArray(p.order)) { s.order = p.order.filter((k) => typeof k === 'string'); did.push('סדר חדש'); }
  if (p.notes && typeof p.notes === 'object') Object.keys(p.notes).forEach((k) => {
    const v = clean(p.notes[k], 160);
    if (v) s.notes[k] = v; else delete s.notes[k];
    did.push('שורה ב ' + k);
  });
  save(dataPath, s);
  if (p.done && p.done.id) {
    const f = path.join(reqDir(dataPath), String(p.done.id).replace(/[^\w-]/g, '') + '.json');
    const r = readJson(f, null);
    if (r) { r.state = 'done'; r.answer = clean(p.done.answer, 300); r.doneAt = new Date().toISOString(); writeJson(f, r); did.push('בקשה טופלה'); }
  }
  return did.join(', ') || 'אין שינוי';
}

// The sealed page payload (D.personal), never the public live.json.
function forPage(dataPath) {
  const s = load(dataPath);
  return {
    chosen: !!readJson(stateFile(dataPath), {}).chosen,
    picked: s.picked,
    tiles: tiles(s),
    catalog: CATALOG.concat(s.extra).map((c) => ({ k: c.k, i: c.i, t: c.t })),
    requests: requests(dataPath).slice(0, 8).map((r) => ({ id: r.id, at: r.at, text: r.text, state: r.state, answer: r.answer || '' })),
  };
}

function promptLines() {
  return [
    'הודעה שמתחילה ב "מצב אישי:" היא בקשה מהכפתור 🏡 מצב אישי: מה לשים במסך האישי ואיך לסדר אותו. אתה המנהל של המוניטור הזה, ואתה מבצע אותה:',
    '  1. קוראים את המצב: node lib/personal.js show data. מזהה הבקשה כתוב בסוף ההודעה בסוגריים [p...].',
    "  2. מבצעים בפקודה אחת: node lib/personal.js apply data '<json>' (כאן בשרת, לא משימה למחשב) עם השדות שצריך: order (סדר מלא של מפתחות), notes ({מפתח: שורה קצרה, ריק מוחק}), add ([{t,i}] אריח חדש), remove/unpick (מפתחות), pick, ותמיד done: {id, answer} עם תשובה קצרה. אחר כך node push.js \"personal\" כדי שהמסך יתעדכן.",
    '  3. התשובה במסך התשובות: שורה אחת, מה סידרת. בלי מקפים. מה שדורש שליחה לאנשים, תשלום או מחיקה של משהו שאינו במסך האישי מחכה לאישור כרגיל.',
    '',
  ];
}

module.exports = { CATALOG, load, tiles, setPicked, addRequest, requests, apply, forPage, promptLines };

if (require.main === module) {
  const [cmd, dp, json] = process.argv.slice(2);
  if (!dp) { console.log('usage: node lib/personal.js show|apply <dataPath> [json]'); process.exit(1); }
  if (cmd === 'show') console.log(JSON.stringify(forPage(dp), null, 1));
  else if (cmd === 'apply') { let p; try { p = JSON.parse(json || '{}'); } catch (e) { console.error('JSON לא תקין: ' + e.message); process.exit(1); } console.log(apply(dp, p)); }
  else { console.error('פקודה לא מוכרת: ' + cmd); process.exit(1); }
}
