'use strict';
/*
  The monitor's name, changed by its owner from the settings screen (22.11.2026, idea "לאפשר לשנות את שם המוניטור").

  The page sends "שם המוניטור: <name>" and the listener writes it here with no model. instance.json
  is not touched: it is locked on a customer's monitor. build.js reads this file and shows the name
  in the header and in the page title. An empty name goes back to the name from instance.json.
*/
const fs = require('fs');
const path = require('path');
const inst = require('./instance.js');

const FILE = path.join(inst.dataPath, 'status', 'name.json');
const MAX = 30;

// Keeps only plain text: no markup or quotes, one line, at most MAX characters.
function clean(v) {
  const s = String(v || '').replace(/[<>"'`]/g, '').replace(/[\r\n]+/g, ' ').trim();
  return [...s].slice(0, MAX).join('').trim();
}

// The line from the settings box. An empty value is a valid line: it means "back to the original name".
function parse(text) {
  const s = String(text || '').trim();
  const m = /^שם המוניטור\s*:([\s\S]*)$/.exec(s);
  if (!m) return null;
  return { name: clean(m[1]) };
}

function read() {
  try {
    const v = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return clean(v.name);
  } catch (e) { return ''; }
}

function set(name) {
  const v = { name: clean(name), at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(v, null, 1), 'utf8');
  return v;
}

// The name to show: the owner's choice when there is one, otherwise the given default.
function shown(fallback) {
  return read() || fallback;
}

module.exports = { parse, clean, read, set, shown, FILE, MAX };
