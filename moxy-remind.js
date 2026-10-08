'use strict';
/*
  Moxypen reminder push. Itzik, 8.10: three doses a day, 18:00 and 00:00 that
  night, then 08:00, 16:00 and 00:00 every day. Cron runs this every quarter
  hour with TZ=Asia/Jerusalem; it sends once per dose, the first run after the
  dose time, and remembers the last one it sent.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ML = require('./lib/monitor-logic.js');

const STATE = path.join(__dirname, '..', 'moxy-sent.json');
const now = Date.now();
const s = ML.moxySlots(now);
let sent = 0;
try { sent = JSON.parse(fs.readFileSync(STATE, 'utf8')).last || 0; } catch (e) {}
if (!s.last || s.last <= sent || now - s.last > 2 * 3600 * 1000) process.exit(0);
const d = new Date(s.last);
const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
if (process.argv.includes('--dry')) { console.log('would send', hm); process.exit(0); }
execFileSync('node', [path.join(__dirname, 'notify.js'), 'מוקסיפן', 'הגיע הזמן לכדור של ' + hm], { stdio: 'inherit' });
fs.writeFileSync(STATE, JSON.stringify({ last: s.last, at: new Date().toISOString() }));
