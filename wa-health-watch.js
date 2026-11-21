'use strict';
/*
  16.11.2026: the WhatsApp check between the manager's rounds (lib/wa-health.js), every 5 minutes
  (monitor-wa-health.timer). No Claude, no message: it reads, and fixes what it can (repair()).

  Itzik, the same day: "אם יש התראה על תקלה, אל תשלח לי הודעה, אלא אם כן ב 10 דקות או ב 5 דקות הקרובות לא הצלחת לתקן."
  So a problem is fixed first and he hears nothing. Only a problem still there 10 minutes after it was first
  seen is pushed, once, with what was tried; and then one more push when it is fixed. A different problem gets
  its own 10 minutes. The push goes through notify.js (ntfy, then mail), never WhatsApp, which may be the
  broken thing. State: data/status/wa-health.json. Log: /var/log/monitor-wa-health.log.
*/
const fs = require('fs');
const path = require('path');
const H = require('./lib/wa-health.js');
const DATA = path.join(__dirname, 'data');
const STATE = path.join(DATA, 'status', 'wa-health.json');
const GRACE = 10 * 60e3;

function push(title, body) {
  try { require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'notify.js'), title, body], { cwd: __dirname, timeout: 60000 }); return true; }
  catch (e) { console.error('notify failed: ' + e.message); process.exitCode = 1; return false; }
}

const now = Date.now();
let prev = {}; try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')) || {}; } catch (e) {}
const h = H.check({ dataPath: DATA, now, isActive: H.isActive });
const probs = H.problems(h);
const sig = probs.map(p => p.replace(/\s*\(".*"\)/, '').replace(/\d+/g, '#')).join('|');
const tries = prev.tries || {};
const fixes = probs.length ? H.repair(h, { dataPath: DATA, tries }) : [];
// keep the tries only of answers still missing
const live = new Set(); (h.monitors || []).forEach(m => (m.items || []).forEach(it => live.add((m.tenant || 'own') + '/' + it.re)));
Object.keys(tries).forEach(k => { if (!live.has(k)) delete tries[k]; });

const s = { at: h.at, active: h.active, monitors: (h.monitors || []).map(m => ({ name: m.name, missed: m.missed })), fails: h.fails, problems: probs, sig, tries,
  firstBad: probs.length ? (sig === prev.sig && prev.firstBad ? prev.firstBad : now) : 0,
  notified: probs.length ? (sig === prev.sig ? !!prev.notified : false) : false,
  tried: probs.length ? Array.from(new Set((sig === prev.sig ? prev.tried || [] : []).concat(fixes))) : [] };

if (probs.length && !s.notified && now - s.firstBad >= GRACE) {
  const body = probs.slice(0, 3).join('\n') + (s.tried.length ? '\nניסיתי: ' + s.tried.join(', ') : '');
  if (push('💬 וואטסאפ: לא הצלחתי לתקן ב 10 דקות', body)) s.notified = true;
}
if (!probs.length && prev.notified) push('💬 וואטסאפ חזר לעבוד', 'כל התשובות יוצאות, אין תקלות ביומן');

fs.writeFileSync(STATE + '.tmp', JSON.stringify(s, null, 1)); fs.renameSync(STATE + '.tmp', STATE);
console.log(new Date(now).toISOString() + ' ' + (probs.length ? probs.join(' | ') + (fixes.length ? ' || תוקן: ' + fixes.join(', ') : '') + (s.notified ? ' || דווח' : '') : (prev.sig && !prev.notified ? 'ok (תוקן בלי התראה)' : prev.notified ? 'ok (חזר, דווח)' : 'ok')));
