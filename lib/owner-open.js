'use strict';
/*
  10.11.2026, Itzik: "אם ההתראה של הבוקר לא נפתחה בבוקר, שלח לי וואטסאפ".
  The page of Itzik's own monitor sends a small beacon (wa-bridge.js, POST /api/owner-open, owner code in the
  body, never in the URL) when it loads, when it becomes visible, and when a push notification is clicked.
  Here the last open times are kept in data/status/owner-open.json { lastAt, lastSrc, recent: [{at, src}] }.
  lib/morning-wa.js asks hasOpenSince() before it sends the WhatsApp fallback.
  Nothing personal is stored: a time and one of a few source words.
*/
const fs = require('fs');
const path = require('path');

const SRC = ['load', 'visible', 'push'];
const MIN_GAP_MS = 20000; // a burst of beacons (load + visible) is one open

function file(dataPath) { return path.join(dataPath, 'status', 'owner-open.json'); }
function read(dataPath) {
  try { const j = JSON.parse(fs.readFileSync(file(dataPath), 'utf8')); if (j && typeof j === 'object') return j; } catch (e) {}
  return { lastAt: 0, lastSrc: '', recent: [] };
}

function record(dataPath, src, now) {
  const t = now || Date.now();
  const s = SRC.indexOf(src) > -1 ? src : 'load';
  const j = read(dataPath);
  if (j.lastAt && t - j.lastAt >= 0 && t - j.lastAt < MIN_GAP_MS && j.lastSrc === s) return j;
  j.lastAt = t; j.lastSrc = s;
  j.recent = (Array.isArray(j.recent) ? j.recent : []).concat([{ at: t, src: s }]).slice(-30);
  fs.mkdirSync(path.dirname(file(dataPath)), { recursive: true });
  const f = file(dataPath);
  fs.writeFileSync(f + '.tmp', JSON.stringify(j));
  fs.renameSync(f + '.tmp', f);
  return j;
}

function lastOpenAt(dataPath) { return Number(read(dataPath).lastAt) || 0; }
function hasOpenSince(dataPath, sinceMs) { return lastOpenAt(dataPath) >= sinceMs; }

module.exports = { record, read, lastOpenAt, hasOpenSince, file, SRC };
