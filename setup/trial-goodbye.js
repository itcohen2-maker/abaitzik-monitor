'use strict';
/*
  18.11.2026, Itzik: when an unpaid trial is deleted (setup/trial-expire.sh), the customer gets one mail:
  all the data was deleted, and they are always welcome to join again. Mail only: WhatsApp goes only to Itzik.
  Run as root with /etc/monitor.env (SMTP), before remove-trial.sh, while the signup record still exists.
  node setup/trial-goodbye.js <id> [--dry]
*/
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const DATA = path.join(HERE, 'data');
const id = process.argv[2] || '';
const DRY = process.argv.includes('--dry');
if (!/^t[a-f0-9]{6}$/.test(id)) { console.log('only trial ids'); process.exit(2); }
let q = null;
try { q = JSON.parse(fs.readFileSync(path.join(DATA, 'signup', 'queue', id + '.json'), 'utf8')); } catch (e) {}
if (!q || !q.email) { console.log('no mail for ' + id); process.exit(0); }
const first = String(q.name || '').trim().split(/\s+/)[0];
const subject = 'המוניטור שלך נמחק';
const text = (first ? first + ', ' : '') + 'שבוע הניסיון במוניטור הסתיים, ולכן המוניטור וכל הנתונים שלך נמחקו.\n\n'
  + 'אתה תמיד מוזמן להצטרף שוב ולנהל את העסק במקום אחד:\nhttps://it-solution.co.il/start\n\n'
  + 'איציק כהן, IT Solution';
if (DRY) { console.log(q.email + '\n' + subject + '\n' + text); process.exit(0); }
require(path.join(HERE, 'lib', 'mailer.js')).send(DATA, { to: q.email, subject, text })
  .then((r) => { console.log('sent ' + id + ' ' + JSON.stringify(r).slice(0, 120)); })
  .catch((e) => { console.log('mail failed ' + id + ' ' + e.message); });
