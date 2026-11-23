'use strict';
/*
  23.11.2026, Itzik: "כפתור שלוחצים להחלפת השפה". The owner switches her monitor between Hebrew and Russian from the
  settings screen. The page sends "שפת המוניטור: רוסית" or "שפת המוניטור: עברית" and the listener writes it here with no
  model. instance.json is not touched (it is locked on a customer's monitor); lib/instance.js reads this file on load, so
  the page (lib/i18n.js), the booking page and the monitor's answers follow on the next build and the next run.
*/
const fs = require('fs');
const path = require('path');

const WORDS = { 'רוסית': 'ru', 'עברית': '' };
function file(dataPath) { return path.join(dataPath, 'status', 'lang.json'); }

// The line from the settings box -> { lang: 'ru' | '' } or null.
function parse(text) {
  const m = /^שפת המוניטור\s*:\s*(\S+)\s*$/.exec(String(text || '').trim());
  if (!m || !Object.prototype.hasOwnProperty.call(WORDS, m[1])) return null;
  return { lang: WORDS[m[1]] };
}

// The owner's choice, or null when she never chose (then instance.json decides).
function read(dataPath) {
  try {
    const v = JSON.parse(fs.readFileSync(file(dataPath), 'utf8'));
    return v && (v.lang === 'ru' || v.lang === '') ? v.lang : null;
  } catch (e) { return null; }
}

function set(dataPath, lang) {
  const v = { lang: lang === 'ru' ? 'ru' : '', at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file(dataPath)), { recursive: true });
  fs.writeFileSync(file(dataPath), JSON.stringify(v, null, 1), 'utf8');
  return v;
}

module.exports = { parse, read, set, file, WORDS };
