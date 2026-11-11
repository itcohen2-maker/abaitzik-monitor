'use strict';
/*
  11.11.2026, Itzik on Dr. Shulman: "תסמן אותם כדי שנראה באיזה שעות הוא נכנס, כמה זמן, ותעדכן אותי במוניטור באריח מהבהב".
  A customer's page (one with D.visitKey) sends small beacons to wa-bridge.js POST /api/visit: 'start' when it is
  opened or comes back after a while, 'beat' every minute while it is on screen, 'end' when it is hidden.
  Kept on Itzik's side in data/visits/<name>.json { sessions: [{ sid, start, last, dev }] }, newest last.
  The key per customer lives in data/visits/keys.json { <name>: <key> } (Itzik's data) and in the customer's own
  data/status/visit-key.txt (read by its build into the sealed payload). Only a time, a duration and phone/computer.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEEP = 60;            // sessions kept per customer
const MAX_GAP_MS = 5 * 60e3; // a beat this long after the last one starts a new session

function dir(dataPath) { return path.join(dataPath, 'visits'); }
function readJson(f, d) { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j && typeof j === 'object' ? j : d; } catch (e) { return d; } }
function writeJson(f, j) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(j)); fs.renameSync(f + '.tmp', f); }

// The customer name for a key, or null. Constant time compare.
function nameByKey(dataPath, key) {
  const k = String(key || '');
  if (!/^[a-f0-9]{32}$/.test(k)) return null;
  const all = readJson(path.join(dir(dataPath), 'keys.json'), {});
  for (const n of Object.keys(all)) {
    const v = String(all[n] || '');
    if (v.length === k.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(k))) return n;
  }
  return null;
}

function newKey(dataPath, name) {
  if (!/^[a-z0-9-]+$/.test(String(name || ''))) throw new Error('bad name');
  const f = path.join(dir(dataPath), 'keys.json');
  const all = readJson(f, {});
  all[name] = crypto.randomBytes(16).toString('hex');
  writeJson(f, all);
  return all[name];
}

/*
  One beacon. ev: start | beat | end. sid: the page's own session id. dev: phone | computer.
  Returns the session as stored. A beat or end for an unknown sid (the server restarted, the file was cut)
  opens it, so nothing is lost.
*/
function record(dataPath, name, b, now) {
  const t = now || Date.now();
  const sid = /^[a-z0-9]{6,24}$/.test(String(b.sid || '')) ? String(b.sid) : '';
  if (!sid || !/^[a-z0-9-]+$/.test(name)) return null;
  const ev = ['start', 'beat', 'end'].indexOf(b.ev) > -1 ? b.ev : 'beat';
  const dev = b.dev === 'computer' ? 'computer' : 'phone';
  const f = path.join(dir(dataPath), name + '.json');
  const j = readJson(f, { sessions: [] });
  if (!Array.isArray(j.sessions)) j.sessions = [];
  // The page keeps one sid while it stays open; a long pause inside it is stored as sid-<time>, so the latest one counts.
  const mine = j.sessions.filter((x) => x.sid === sid || x.sid.indexOf(sid + '-') === 0);
  let s = mine[mine.length - 1];
  if (s && t - s.last > MAX_GAP_MS) {
    if (ev === 'end') return s;                 // a late end after a long pause adds nothing
    s = null;                                   // came back after a long pause: a new visit
  }
  if (!s) {
    s = { sid: mine.length ? sid + '-' + t.toString(36) : sid, start: t, last: t, dev };
    j.sessions.push(s);
  } else {
    s.last = Math.max(s.last, t);
  }
  j.sessions = j.sessions.slice(-KEEP);
  writeJson(f, j);
  return s;
}

/*
  For Itzik's page: per customer, newest first, with the duration in seconds. Sessions shorter than
  10 seconds still count (he opened it), they show as "פחות מדקה".
*/
function forPage(dataPath) {
  const out = {};
  let files = [];
  try { files = fs.readdirSync(dir(dataPath)).filter((f) => /^[a-z0-9-]+\.json$/.test(f) && f !== 'keys.json'); } catch (e) { return out; }
  files.forEach((f) => {
    const j = readJson(path.join(dir(dataPath), f), { sessions: [] });
    const L = (j.sessions || []).slice().sort((a, b) => b.start - a.start).slice(0, 40)
      .map((s) => ({ id: s.sid, at: new Date(s.start).toISOString(), sec: Math.max(0, Math.round((s.last - s.start) / 1000)), dev: s.dev }));
    if (L.length) out[f.replace(/\.json$/, '')] = L;
  });
  return out;
}

// Itzik's tile is built into his page, so a new visit (and its end, for the duration) asks for one build a minute later.
let pushTimer = null;
function buildSoon() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    try { require('child_process').execFile(process.execPath, [path.join(__dirname, '..', 'push.js'), 'כניסות לקוחות'], { cwd: path.join(__dirname, '..'), timeout: 240000 }, () => {}); } catch (e) { /* the next build carries it */ }
  }, 60000);
  if (pushTimer.unref) pushTimer.unref();
}

module.exports = { record, forPage, nameByKey, newKey, buildSoon, MAX_GAP_MS };
