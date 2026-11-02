'use strict';
/*
  The 🩺 board. Itzik, 12.10, after eight of his messages sat held all
  afternoon: "תקים אפליקציה לבדוק מה כל הקלקולים האלה".

  Every instance's watchdog already writes data/status/watchdog.json: the
  problems now, a history of faults, what waits, what is held and why, and when
  the worker last moved (a customer's file holds times and counts only, never
  words). This gathers his own and every customer's into one file,
  data/status/health-board.json, which the build puts in his sealed payload for
  the "🩺 תקלות" tile. It reads nothing else of a customer's folder.

  Runs from Itzik's watchdog every two minutes. When the colour of any monitor
  changes it publishes, through push.js like every writer, so a red card is on
  his phone without waiting for the next answer to rebuild the page.

  Usage: node health-board.js [--dry]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const STATUS = path.join(inst.dataPath, 'status');
const OUT = path.join(STATUS, 'health-board.json');
const TENANTS = path.join(inst.dataPath, 'tenants', 'tenants');
// The watchdog writes every two minutes; ten minutes without it is a fault of its own.
const STALE_MS = 10 * 60 * 1000;

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function active(unit) {
  if (process.platform === 'win32' || !unit) return null;
  try { return execFileSync('systemctl', ['is-active', unit], { encoding: 'utf8' }).trim() === 'active'; }
  catch (e) { return false; }
}

function card(id, title, dir, listener, now, paused) {
  const w = readJson(path.join(dir, 'data', 'status', 'watchdog.json'), null);
  const problems = (w && w.problems || []).slice();
  const up = active(listener);
  if (up === false) problems.unshift('המאזין לא רץ');
  if (!w) problems.push('השומר לא כתב דוח');
  else if (now - Date.parse(w.at) > STALE_MS) problems.push('השומר לא רץ מאז ' + new Date(w.at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }));
  const b = (w && w.board) || {};
  return {
    id, title, paused: !!paused,
    ok: paused || !problems.length,
    listener: up,
    problems,
    waiting: b.waiting || [],
    held: b.held || [],
    worker: b.worker || {},
    speed: (w && w.speed) || null,
    history: ((w && w.history) || []).slice(-20).reverse(),
    at: (w && w.at) || '',
  };
}

function run(now, dry) {
  now = now || Date.now();
  const cards = [card('abaitzik', 'המוניטור שלך', path.join(__dirname), 'monitor-listen', now, false)];
  let files = [];
  try { files = fs.readdirSync(TENANTS).filter((f) => f.endsWith('.json')); } catch (e) {}
  files.sort().forEach((f) => {
    const t = readJson(path.join(TENANTS, f), null);
    if (!t || !t.dir) return;
    const paused = readJson(path.join(t.dir, 'instance.json'), {}).paused === true;
    cards.push(card(t.id, t.title || t.id, t.dir, t.listener, now, paused));
  });
  const board = { at: new Date(now).toISOString(), cards };
  if (dry) return board;
  const prev = readJson(OUT, { cards: [] });
  const sig = (b) => (b.cards || []).map((c) => c.id + ':' + (c.ok ? 1 : 0) + ':' + c.held.length).join(',');
  const tmp = OUT + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(board, null, 1));
  fs.renameSync(tmp, OUT);
  if (sig(prev) !== sig(board) && process.platform !== 'win32') {
    try { execFileSync('node', ['push.js', 'health board changed'], { cwd: __dirname, stdio: 'ignore', timeout: 240000 }); }
    catch (e) { console.log('!! לוח התקלות לא פורסם: ' + String(e.message).slice(0, 120)); }
  }
  return board;
}

if (require.main === module) {
  const b = run(Date.now(), process.argv.includes('--dry'));
  b.cards.forEach((c) => console.log((c.ok ? 'תקין  ' : 'תקלה  ') + c.title + (c.problems.length ? ': ' + c.problems.join(' · ') : '')
    + (c.held.length ? ' | נעצרו ' + c.held.length : '') + (c.waiting.length ? ' | מחכות ' + c.waiting.length : '')));
}
module.exports = { run, card };
