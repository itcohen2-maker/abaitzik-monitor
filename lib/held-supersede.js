'use strict';
/*
  15.11.2026: a voice note went out twice about ten seconds apart. The first copy
  came without the personal code and was held; the second came with it and went
  through. Nothing closed the held copy, so it sat as "held" for eight hours and
  the watchdog reported a message lost that was not lost. When a coded voice note
  arrives, an unverified voice note still held from the last ten minutes is the
  same send: it is closed and points to the one that went through.
*/
const fs = require('fs');
const path = require('path');

const WINDOW_MS = 10 * 60 * 1000;
const VOICE = /^הודעה קולית/;

// Closes the held copies of the voice note `rec` (saved as `recName` in chatDir). Returns how many were closed.
function supersede(chatDir, recName, rec) {
  if (!rec || rec.from !== 'itzik' || !VOICE.test(String(rec.text || ''))) return 0;
  const at = Date.parse(rec.at);
  if (!Number.isFinite(at)) return 0;
  let closed = 0;
  let names = [];
  try { names = fs.readdirSync(chatDir).filter((f) => f.endsWith('.json') && f !== recName); } catch (e) { return 0; }
  for (const f of names) {
    let old;
    try { old = JSON.parse(fs.readFileSync(path.join(chatDir, f), 'utf8')); } catch (e) { continue; }
    if (old.from !== 'unverified' || old.status !== 'held' || !VOICE.test(String(old.text || ''))) continue;
    const gap = at - Date.parse(old.at);
    if (!(gap >= 0 && gap <= WINDOW_MS)) continue;
    old.status = 'done';
    old.mergedInto = recName;
    try { fs.writeFileSync(path.join(chatDir, f), JSON.stringify(old, null, 1), 'utf8'); closed++; } catch (e) { /* kept as held; the watchdog says so */ }
  }
  return closed;
}

module.exports = { supersede, WINDOW_MS };
