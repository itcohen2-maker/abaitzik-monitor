'use strict';
/*
  12.10, Itzik by voice: "the Ramat HaNasi theatre tile should wave only when
  there is an update, when Alon or I did something new. If I update something,
  at Alon's it waves: tell him there is an update of such and such sticker."

  The site logs every save (a name, a story, lines, a recording, an arena) in
  its own Redis and hands the log out at /api/news to whoever holds the news
  key. The watchdog runs `pull` every two minutes on each instance; this asks
  the site at most once in ten minutes (never a loop on a live site), keeps
  only what the other side did, and writes it to data/stknews/stknews. The page
  waves the theatre tile while the newest of those is newer than what this
  device last saw, and says what changed.

  Who is who, and the key: Itzik's instance reads `theatreKey` from
  data/keys.json and is "itzik". A customer's instance reads
  instance.json { "theatre": { "key", "me" } }; Alon's says "me": "alon".
  An instance with neither does nothing.

  Usage: node theatre-news.js pull [--force]
*/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const inst = require('./lib/instance.js');

const SITE = 'https://bubot-theatre.vercel.app';
const EVERY_MS = 10 * 60 * 1000;
const DIR = path.join(inst.dataPath, 'stknews', 'stknews');
const STAMP = path.join(inst.dataPath, 'status', 'theatre-news.json');
const KEEP = 20;

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

function config() {
  const raw = readJson(path.join(__dirname, 'instance.json'), {});
  const t = raw && typeof raw.theatre === 'object' && raw.theatre ? raw.theatre : {};
  const keys = readJson(path.join(inst.dataPath, 'keys.json'), {});
  const key = (typeof keys.theatreKey === 'string' && keys.theatreKey) || (typeof t.key === 'string' && t.key) || '';
  const me = t.me === 'alon' ? 'alon' : 'itzik';
  return key ? { key, me } : null;
}

// Only what the other side did, with a safe id and short text.
// 14.10, Itzik ("עם הבהוב"): what Claude built there (an arena from the PC) is
// logged as "claude" and waves the tile on both sides.
function pick(items, me) {
  return (Array.isArray(items) ? items : [])
    .filter((x) => x && (x.by === 'itzik' || x.by === 'alon' || x.by === 'claude') && x.by !== me
      && /^[A-Za-z0-9_-]{4,64}$/.test(String(x.id || '')) && !isNaN(Date.parse(x.at)) && typeof x.text === 'string' && x.text.trim())
    .map((x) => ({ id: String(x.id), at: new Date(x.at).toISOString(), by: x.by, text: x.text.trim().slice(0, 140) }));
}

// Writes what is new or changed, drops what fell off the newest KEEP. True if anything moved.
function store(list) {
  fs.mkdirSync(DIR, { recursive: true });
  let moved = false;
  const keep = new Set(list.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, KEEP).map((x) => x.id));
  list.filter((x) => keep.has(x.id)).forEach((x) => {
    const f = path.join(DIR, x.id + '.json');
    const old = readJson(f, null);
    if (old && old.at === x.at && old.text === x.text) return;
    fs.writeFileSync(f, JSON.stringify(x, null, 1));
    moved = true;
  });
  fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).forEach((f) => {
    if (!keep.has(f.slice(0, -5))) { fs.unlinkSync(path.join(DIR, f)); moved = true; }
  });
  return moved;
}

async function pull(force) {
  const c = config();
  if (!c) return;
  const st = readJson(STAMP, {});
  if (!force && st.at && Date.now() - Date.parse(st.at) < EVERY_MS) return;
  fs.mkdirSync(path.dirname(STAMP), { recursive: true });
  fs.writeFileSync(STAMP, JSON.stringify({ at: new Date().toISOString(), ok: false }));
  const res = await fetch(SITE + '/api/news', { headers: { 'x-news-key': c.key }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) { console.log('!! חדשות התיאטרון: ' + res.status); return; }
  const body = await res.json();
  const list = pick(body && body.items, c.me);
  const moved = store(list);
  fs.writeFileSync(STAMP, JSON.stringify({ at: new Date().toISOString(), ok: true, n: list.length }));
  if (!moved) return;
  console.log('חדשות התיאטרון: ' + list.length);
  spawn(process.execPath, [path.join(__dirname, 'push.js'), 'theatre: news from the other side'], { cwd: __dirname, detached: true, stdio: 'ignore' }).unref();
}

if (require.main === module) {
  if (process.argv[2] === 'pull') pull(process.argv.includes('--force')).catch((e) => console.log('!! חדשות התיאטרון: ' + String(e.message).slice(0, 120)));
}
module.exports = { pick, config };
