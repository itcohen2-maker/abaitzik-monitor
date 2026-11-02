'use strict';
/*
  1.11, Itzik: a morning push when there is a WhatsApp status to post.
  Reads docs/status/queue.json, finds today's item (Israel date). If one exists and
  was not marked posted (/home/monitor/wa-status-done.json, written by listen.js
  recordWaStatusDone), sends one notify. No item: sends nothing.
  Cron (UTC): 30 6 * * 0-5   = 08:30 Israel in winter, Sunday to Friday.
  Usage: node wa-status-morning.js            sends
         node wa-status-morning.js --dry      prints, sends nothing
         node wa-status-morning.js --date YYYY-MM-DD   pretend it is that day
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const di = args.indexOf('--date');
const today = di >= 0 ? args[di + 1] : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const dow = new Date(today + 'T12:00:00Z').getUTCDay();
if (dow === 6) { console.log('Saturday, nothing to send'); process.exit(0); }

let queue = [];
try { queue = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs', 'status', 'queue.json'), 'utf8')); } catch (e) { console.log('queue unreadable'); process.exit(0); }
let done = {};
try { done = JSON.parse(fs.readFileSync('/home/monitor/wa-status-done.json', 'utf8')); } catch (e) {}

const it = queue.find(x => x.date === today);
if (!it) { console.log(today + ': no item, nothing sent'); process.exit(0); }
if (done[it.name]) { console.log(today + ': ' + it.name + ' already posted, nothing sent'); process.exit(0); }

const first = String(it.caption || '').split('\n')[0];
const body = first + ' · מוניטור, אריח סטטוס וואטסאפ';
console.log(today + ': ' + it.name);
console.log('סטטוס להיום | ' + body);
if (dry) process.exit(0);
execFileSync(process.execPath, ['notify.js', 'סטטוס להיום', body], { cwd: __dirname, stdio: 'inherit' });
