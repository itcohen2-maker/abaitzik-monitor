'use strict';
/*
  23.11.2026, Itzik: "המודעה כל פעם מופיעה, למשל עורך דין שעיה רוצה ממך תגובה, אני מוחק ואז היא מופיעה עוד פעם".
  ✓ בוצע and ✕ לא רלוונטי on a mail line of the manager were kept only on the phone (localStorage, keyed by the line's
  text and day), and the server kept nothing. So every round (the morning brief, the mail sweep of 07:25, 13:00, 18:00)
  wrote the same mail again with slightly other words, and it came back.

  One store on the server, by mail number (uid): data/status/mail-board-seen.json, the same file "✓ ראיתי" on the
  board already writes. listen.js adds to it with no model, and every place that shows mail honors it:
  lib/board-feed.js mailItzik (the board), manager-work.js mailSweep (the sweep itself, its status and the
  "נשאר לך" mail), lib/manager.js applySeen (the manager card, also at build time). A new mail has a new uid,
  so it still shows, even from the same sender. "brief:<day>" closes the brief's mail line for that day only.
*/
const fs = require('fs');
const path = require('path');

const fileOf = (dataPath) => path.join(dataPath, 'status', 'mail-board-seen.json');

function read(dataPath) {
  try { return new Set((JSON.parse(fs.readFileSync(fileOf(dataPath), 'utf8')) || []).map(String)); } catch (e) { return new Set(); }
}

function add(dataPath, keys) {
  const f = fileOf(dataPath);
  let L = []; try { L = JSON.parse(fs.readFileSync(f, 'utf8')) || []; } catch (e) { /* first one */ }
  (keys || []).map(String).filter(Boolean).forEach((k) => { if (!L.includes(k)) L.push(k); });
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(L.slice(-2000)));
  fs.renameSync(f + '.tmp', f);
  return L;
}

// Mail numbers as the reader writes them: [47280] or [47268, 47262]
function uidsIn(s) {
  const out = [];
  String(s || '').replace(/\[(\d{3,9}(?:\s*,\s*\d{3,9})*)\]/g, (m, g) => { g.split(/\s*,\s*/).forEach((u) => out.push(u)); return m; });
  return out;
}

// The " · " parts of a sweep line whose mails were all closed are dropped. A part with no mail number stays.
function filterLine(line, seen) {
  return String(line || '').split(' · ').filter((p) => { const u = uidsIn(p); return !u.length || !u.every((x) => seen.has(x)); }).join(' · ');
}

// Was there a mail in the line, and is every one of them closed now?
function allClosed(line, seen) {
  const u = uidsIn(line);
  return u.length > 0 && u.every((x) => seen.has(x));
}

function briefKey(day) { return 'brief:' + day; }

module.exports = { read, add, uidsIn, filterLine, allClosed, briefKey, fileOf };
