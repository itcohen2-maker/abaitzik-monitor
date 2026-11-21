'use strict';
/*
  10.11.2026, Itzik: the rows of 🎛️ לוח הפרסומים that go up by hand (מה בצלחת, קרוסלות, הרילים שלי, IT Solution).
  When the plan (lib/post-plan.js, data/schedule/plan.json) has a time for today, one phone reminder at that time,
  once a day per row, and only in the 3 hours after it. The WhatsApp status keeps its own reminder (wa-status-morning.js).
  Cron every 10 minutes.   node plan-remind.js --dry   says what it would send.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const plan = require('./lib/post-plan.js');
const DRY = process.argv.includes('--dry');
const SENT = '/home/monitor/plan-remind-sent.json';

const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date());
const g = (k) => p.find((x) => x.type === k).value;
const today = g('year') + '-' + g('month') + '-' + g('day'), hm = g('hour') + ':' + g('minute');
const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));

const P = plan.read(path.join(__dirname, 'data'));
let sent = {}; try { sent = JSON.parse(fs.readFileSync(SENT, 'utf8')); } catch (e) {}
let changed = false;
plan.ROWS.filter((r) => r.kind === 'remind' && r.id !== 'st').forEach((r) => {
  const t = plan.time(P, r.id, dow);
  if (!plan.dueNow(t, hm) || sent[r.id] === today) return;
  const body = 'לפי הלוח, היום ב ' + t + ' מעלים ' + r.n + ' · מוניטור, 🎛️ לוח הפרסומים';
  console.log(today + ' ' + hm + ' ' + r.id + ': ' + body);
  if (DRY) return;
  try { execFileSync(process.execPath, [path.join(__dirname, 'notify.js'), '📅 לפי הלוח', body], { cwd: __dirname, stdio: 'inherit' }); } catch (e) {}
  sent[r.id] = today; changed = true;
});
if (changed) fs.writeFileSync(SENT, JSON.stringify(sent));
