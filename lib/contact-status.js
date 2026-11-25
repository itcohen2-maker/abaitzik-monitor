'use strict';
/*
  25.11.2026: the status buttons on the old contacts screen (data/contacts/contacts) were saved only in the browser
  (localStorage leadStatus), so the phone never saw what was set on the PC. The page now sends
  "סטטוס ליד: <name> · <לטיפול|בהמתנה|טופל>" and the listener applies it here, with no model and silently.
  Only the status field and updatedAt change. A file is never deleted.
*/
const fs = require('fs');
const path = require('path');

const MAP = { 'לטיפול': 'open', 'בהמתנה': 'standby', 'טופל': 'done', open: 'open', standby: 'standby', done: 'done' };

function parse(text) {
  const m = /^\s*סטטוס ליד\s*:\s*(.{1,120}?)\s*·\s*(לטיפול|בהמתנה|טופל|open|standby|done)\s*$/.exec(String(text || '').replace(/\n\s*קוד[^\n]*$/, ''));
  return m ? { name: m[1], status: MAP[m[2]] } : null;
}

function apply(dataPath, name, status, now) {
  if (!MAP[status]) return { ok: false, reply: 'סטטוס לא מוכר.' };
  const dir = path.join(dataPath, 'contacts', 'contacts');
  let hit = 0;
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (e) { /* none */ }
  files.forEach((f) => {
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return; }
    if (!r || String(r.name || '') !== name) return;
    r.status = MAP[status]; r.updatedAt = new Date(now || Date.now()).toISOString();
    fs.writeFileSync(path.join(dir, f), JSON.stringify(r, null, 2), 'utf8');
    hit++;
  });
  return { ok: hit > 0, hit, reply: hit ? 'הסטטוס נשמר.' : 'לא מצאתי את הליד.' };
}

module.exports = { parse, apply };
