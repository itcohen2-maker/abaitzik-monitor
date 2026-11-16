'use strict';
/*
  16.11.2026: the WhatsApp check between the manager's rounds (lib/wa-health.js), every 30 minutes
  (monitor-wa-health.timer). It costs nothing: no Claude, no message, only reading. It pushes through
  notify.js (ntfy, then mail, never WhatsApp, which may be the broken thing) only when the list of problems
  changes: once when something breaks, once when it is fixed. State: data/status/wa-health.json.
*/
const fs = require('fs');
const path = require('path');
const H = require('./lib/wa-health.js');
const DATA = path.join(__dirname, 'data');
const STATE = path.join(DATA, 'status', 'wa-health.json');

const h = H.check({ dataPath: DATA, isActive: H.isActive });
const probs = H.problems(h);
let prev = {}; try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')) || {}; } catch (e) {}
const sig = probs.map(p => p.replace(/\s*\(".*"\)/, '').replace(/\d+/g, '#')).join('|');
const out = Object.assign({}, h, { problems: probs, sig, since: sig === prev.sig ? prev.since || h.at : h.at });
fs.writeFileSync(STATE + '.tmp', JSON.stringify(out, null, 1)); fs.renameSync(STATE + '.tmp', STATE);
if (sig !== (prev.sig || '') && prev.at) {
  const title = probs.length ? '💬 וואטסאפ: משהו לא עובד' : '💬 וואטסאפ חזר לעבוד';
  const body = probs.length ? probs.slice(0, 3).join('\n') : 'כל התשובות יוצאות, אין תקלות ביומן';
  try { require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'notify.js'), title, body], { cwd: __dirname, timeout: 60000 }); }
  catch (e) { console.error('notify failed: ' + e.message); process.exitCode = 1; }
}
console.log(new Date().toISOString() + ' ' + (probs.length ? probs.join(' | ') : 'ok'));
