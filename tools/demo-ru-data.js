'use strict';
/*
  23.11.2026: the Russian cosmetician demo (setup/demo-build.sh beauty-ru). lib/i18n.js translates the page, but the demo's
  invented data (client names, treatments, notes, the morning report, prepared reminders) is seeded in Hebrew by
  lib/demo-trades/beauty.js. This rewrites the string values of the seeded data folder from lib/i18n/ru-demo.json:
  an exact sentence from "full", otherwise the glossary "terms" by substring, longest first (dates and links change every
  day, the names and the sentence frames do not). Demo data only; never run on a customer's data.
  Usage: node tools/demo-ru-data.js <data folder>
*/
const fs = require('fs');
const path = require('path');
const map = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lib', 'i18n', 'ru-demo.json'), 'utf8'));
const full = map.full || {}, terms = Object.entries(map.terms || {}).sort((a, b) => b[0].length - a[0].length);
function tr(s) {
  if (!/[\u0590-\u05FF]/.test(s)) return s;
  if (Object.prototype.hasOwnProperty.call(full, s)) return full[s];
  let o = s;
  for (const [he, ru] of terms) if (o.indexOf(he) >= 0) o = o.split(he).join(ru);
  return o;
}
function walk(x) {
  if (typeof x === 'string') return tr(x);
  if (Array.isArray(x)) return x.map(walk);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = walk(x[k]); return o; }
  return x;
}
let files = 0;
(function dir(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f), st = fs.lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) dir(p);
    else if (/\.json$/.test(f) && st.size < 2e6) {
      let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
      const t = walk(j), a = JSON.stringify(j), b = JSON.stringify(t);
      if (a !== b) { fs.writeFileSync(p, JSON.stringify(t, null, 1)); files++; }
    }
  }
})(process.argv[2]);
console.log('demo-ru-data: ' + files + ' files');
