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
// 10.11.2026: the days and hour come from 🎛️ לוח הפרסומים (lib/post-plan.js, row st; default Sunday to Friday 08:30).
// Cron every 10 minutes: one send a day, in the 3 hours after the planned time. --date skips the clock.
const PLAN = require('./lib/post-plan.js');
const T = PLAN.time(PLAN.read(path.join(__dirname, 'data')), 'st', dow);
if (!T) process.exit(0);
const SENT = '/home/monitor/wa-status-morning-sent.json';
if (di < 0) {
  let sentDay = ''; try { sentDay = JSON.parse(fs.readFileSync(SENT, 'utf8')).date || ''; } catch (e) {}
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (!PLAN.dueNow(T, hm) || sentDay === today) process.exit(0);
}

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
if (di < 0) fs.writeFileSync(SENT, JSON.stringify({ date: today }));
