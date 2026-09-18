'use strict';
/*
  One day of drains is one row, however many sends it took.

  18.9, 08:41: four messages, twenty four seconds apart, each one carrying a
  single number and three times "לא נמדד". He empties one tube, writes it down,
  empties the next. That is how the measuring actually happens, and the screen
  should not argue with it.

  Until now nothing read those messages at all. A session read them by eye and
  wrote the row by hand two hours later, which is exactly the kind of quiet
  manual step that goes missing on a day when no session runs. This file is the
  reading: it turns the line the form sends into numbers, and folds a partial
  send into the row that already exists for that day.

  The one rule that matters here: a number never disappears. "לא נמדד" is
  absence of information, so it leaves what is written alone, and a real number
  that contradicts a real number is written down as a correction in the note
  rather than swallowed. A drain log that loses a number is worse than no log.
*/
const fs = require('fs');
const path = require('path');

const WORDS = /(^|\s)ניקוזים(\s|$)/;

function pad(n) { return String(n).padStart(2, '0'); }

/*
  The body the form sends looks like this:

    ניקוזים
    ניקוזים 1=65 2=לא נמדד 3=0 4=60 · יצא צלול
    <blank>
    קוד 1808

  The kind line, the numbers, and his code. Only the numbers line is read here,
  and a pair is taken only when the value is a number, so "לא נמדד" simply does
  not appear in the result.
*/
function parse(text) {
  const body = String(text || '');
  if (!WORDS.test(body)) return null;
  const line = body.split(/\r?\n/).find(l => /\d\s*=/.test(l) && WORDS.test(l));
  if (!line) return null;
  const vals = [null, null, null, null];
  let found = 0;
  const re = /([1-4])\s*=\s*(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(line))) {
    vals[Number(m[1]) - 1] = Number(m[2]);
    found++;
  }
  if (!found) return null;
  const dot = line.indexOf(' · ');
  const note = dot === -1 ? '' : line.slice(dot + 3).trim();
  return { vals: vals, note: note };
}

// The day a measurement belongs to, in his clock, which is the clock the file
// names and the row stamps are already written in.
function dayOf(at) {
  const d = at instanceof Date ? at : new Date(at);
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
}

function stampOf(at) {
  const d = at instanceof Date ? at : new Date(at);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function isoOf(at) {
  const d = at instanceof Date ? at : new Date(at);
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    + sign + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
}

/*
  Fold one send into the row it belongs to.

  Returns the row as it now stands together with what changed, so the caller
  can say something true about it instead of announcing a write that may not
  have written anything.
*/
function fold(row, vals, at, note) {
  const next = Object.assign({}, row || {});
  const wrote = [];
  const fixed = [];
  vals.forEach(function (v, i) {
    if (typeof v !== 'number') return;
    const key = 'd' + (i + 1);
    const was = next[key];
    if (typeof was === 'number') {
      if (was === v) return;
      fixed.push('ניקוז ' + (i + 1) + ' עודכן מ' + was + ' ל' + v + ' ב' + stampOf(at));
    } else {
      wrote.push(i + 1);
    }
    next[key] = v;
  });
  if (!next.at) next.at = isoOf(at);
  const lines = [];
  if (next.note) lines.push(String(next.note));
  if (note) lines.push(note);
  fixed.forEach(function (l) { lines.push(l); });
  const joined = lines.filter(function (l, i) { return lines.indexOf(l) === i; }).join(' · ');
  if (joined) next.note = joined;
  return { row: next, wrote: wrote, fixed: fixed, changed: wrote.length > 0 || fixed.length > 0 };
}

/*
  The same fold, against the file for that day.

  The file is found by its day prefix rather than by its full name, because the
  name carries the time of the first send and a later send does not know it.
*/
function record(dir, text, at) {
  const parsed = parse(text);
  if (!parsed) return null;
  const when = at instanceof Date ? at : new Date(at || Date.now());
  const day = dayOf(when);
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir)
    .filter(function (f) { return f.indexOf(day + '-') === 0 && /\.json$/.test(f); })
    .sort()[0];
  let row = null;
  if (existing) {
    try { row = JSON.parse(fs.readFileSync(path.join(dir, existing), 'utf8')); }
    catch (e) { row = null; }
  }
  const out = fold(row, parsed.vals, when, parsed.note);
  const file = existing || (day + '-' + pad(when.getHours()) + pad(when.getMinutes()) + '.json');
  if (!out.changed && existing) return Object.assign({ file: file }, out);
  delete out.row.id;
  fs.writeFileSync(path.join(dir, file), JSON.stringify(out.row, null, 2) + '\n', 'utf8');
  return Object.assign({ file: file }, out);
}

function total(row) {
  let t = 0, n = 0;
  [1, 2, 3, 4].forEach(function (i) {
    const v = row && row['d' + i];
    if (typeof v === 'number') { t += v; n++; }
  });
  return n ? t : null;
}

module.exports = { parse, fold, record, total, dayOf };
