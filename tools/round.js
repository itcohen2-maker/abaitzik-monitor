#!/usr/bin/env node
'use strict';
/*
  One monitoring round over a window, not a snapshot.

  28.9, Itzik sent a photo of two alerts on his phone next to my "תקין":
  "איך יכול להיות תקין?". A round that looks only at the present misses every
  alert sent to him since the last one. This reads the window.

  Usage (on the server, in the repo): node tools/round.js [minutes=25]
  Prints one JSON object: services, events in the window, today's answer times,
  late answers, unanswered messages, watchdog problems, git state.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MIN = Number(process.argv[2]) || 25;
const ROOT = path.join(__dirname, '..');
const CHAT = path.join(ROOT, 'data', 'chat', 'chat');
const now = Date.now();
const since = now - MIN * 60000;
const UNITS = ['monitor-listen', 'monitor-worker.timer', 'monitor-watchdog.timer', 'monitor-keepalive.timer',
  'monitor-tenants.timer', 'monitor-listen-ily', 'monitor-worker-ily.timer'];
const PATTERN = /!!|הוחזר לתור|בלי תשובה|מצא תקלה|לא עלה|נכשל/;
const LATE_MIN = 10;

function sh(cmd, args) { try { return execFileSync(cmd, args, { encoding: 'utf8' }).trim(); } catch (e) { return String(e.stdout || e.message).trim(); } }

// Log lines carry HH:MM:SS (UTC) and no date. Walk back from the end and stop
// at the first line older than the window, or at a jump forward in time,
// which means the line belongs to an earlier day.
function windowLines(file) {
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split('\n').slice(-2000); } catch (e) { return []; }
  const today = new Date(now).toISOString().slice(0, 10);
  const out = [];
  let prev = Infinity;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^(\d{2}:\d{2}:\d{2})\s/);
    if (!m) continue;
    const t = Date.parse(today + 'T' + m[1] + 'Z');
    if (t > now + 60000 || t > prev + 60000) break;
    if (t < since) break;
    prev = t;
    if (PATTERN.test(lines[i])) out.unshift(lines[i].slice(0, 200));
  }
  return out;
}

const services = {};
UNITS.forEach((u) => { services[u] = sh('systemctl', ['is-active', u]); });

const events = [].concat(
  windowLines('/var/log/monitor-worker.log').map((l) => 'worker ' + l),
  windowLines('/var/log/monitor-watchdog.log').map((l) => 'watchdog ' + l),
  windowLines('/var/log/monitor-keepalive.log').map((l) => 'keepalive ' + l),
);

let all = [];
try {
  all = fs.readdirSync(CHAT).filter((f) => f.endsWith('.json'))
    .map((f) => { try { return Object.assign({ f }, JSON.parse(fs.readFileSync(path.join(CHAT, f), 'utf8'))); } catch (e) { return null; } })
    .filter(Boolean);
} catch (e) {}
const answeredAt = {};
all.filter((m) => m.from === 'claude' && m.re).forEach((m) => {
  const t = Date.parse(m.at);
  if (!answeredAt[m.re] || t < answeredAt[m.re]) answeredAt[m.re] = t;
});
const mine = all.filter((m) => m.from === 'itzik' && Date.parse(m.at) > now - 24 * 3600000);
const times = mine.map((m) => {
  const a = answeredAt[m.id];
  return { file: m.f, status: m.status, minutes: a ? Math.round((a - Date.parse(m.at)) / 60000) : null, waiting: a ? null : Math.round((now - Date.parse(m.at)) / 60000) };
});
const late = times.filter((t) => t.minutes !== null && t.minutes > LATE_MIN);
const unanswered = times.filter((t) => t.minutes === null);

let problems = null;
try { problems = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'status', 'watchdog.json'), 'utf8')).problems; } catch (e) {}

const minutes = times.map((t) => t.minutes).filter((x) => x !== null).sort((a, b) => a - b);
console.log(JSON.stringify({
  at: new Date(now).toISOString(),
  windowMinutes: MIN,
  servicesDown: Object.keys(services).filter((u) => services[u] !== 'active'),
  events,
  last24h: { messages: times.length, median: minutes.length ? minutes[Math.floor(minutes.length / 2)] : null, max: minutes.length ? minutes[minutes.length - 1] : null },
  late,
  unanswered,
  watchdogProblems: problems,
  git: sh('git', ['-C', ROOT, 'status', '-sb']).split('\n')[0],
}, null, 1));
