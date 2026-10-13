'use strict';
/*
  Quiet hours (Itzik took the idea on 13.10.2026: "שעות שקטות לתשובות והתראות בלילה").

  An answer that lands at two at night used to ring his phone. Inside the quiet
  window a notification is not sent: it is kept here, the answer itself is
  already in the chat, and the first round after the window ends sends one
  push that says how many came in during the night and what they were about.

  Reminders he set himself (pills) and the alarm clock still ring: those are
  the point of ringing at night, and they pass { urgent: true }.

  He sets the window from the settings screen. The page sends the line
  "שעות שקטות 22:00 עד 07:00" or "שעות שקטות כבוי", and the listener writes it
  here with no model. Default, until he changes it: on, 22:00 to 07:00.
*/
const fs = require('fs');
const path = require('path');
const inst = require('./instance.js');

const FILE = path.join(inst.dataPath, 'status', 'quiet.json');
const HELD = path.join(inst.dataPath, 'status', 'quiet-held.json');
const DEFAULT = { on: true, from: '22:00', to: '07:00' };

function readJson(p, d) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; }
}
function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 1), 'utf8');
}

function settings() { return Object.assign({}, DEFAULT, readJson(FILE, {})); }

function mins(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? (+m[1] % 24) * 60 + (+m[2] % 60) : -1;
}
function israelMins(now) {
  const s = (now || new Date()).toLocaleTimeString('en-GB',
    { timeZone: 'Asia/Jerusalem', hour12: false, hour: '2-digit', minute: '2-digit' });
  return mins(s);
}

// True inside the window. A window that crosses midnight (22:00 to 07:00) wraps.
function active(now, cfg) {
  const c = cfg || settings();
  if (!c.on) return false;
  const a = mins(c.from), b = mins(c.to), t = israelMins(now);
  if (a < 0 || b < 0 || a === b) return false;
  return a < b ? (t >= a && t < b) : (t >= a || t < b);
}

function pad(hhmm) {
  const t = mins(hhmm);
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

// The settings line from the page, possibly after a kind word on its own line.
function parse(text) {
  const s = String(text || '').replace(/^[^\n]*\n/, function (first) {
    return /שעות שקטות/.test(first) ? first : '';
  });
  const m = /שעות שקטות\s*[:：]?\s*(?:(כבוי|כבויות|לכבות|בלי)|(\d{1,2}:\d{2})\s*(?:עד|-|–)\s*(\d{1,2}:\d{2}))/.exec(s);
  if (!m) return null;
  if (m[1]) return { on: false };
  if (mins(m[2]) < 0 || mins(m[3]) < 0 || mins(m[2]) === mins(m[3])) return null;
  return { on: true, from: pad(m[2]), to: pad(m[3]) };
}

function set(v) {
  const c = Object.assign(settings(), v, { setAt: new Date().toISOString() });
  writeJson(FILE, c);
  return c;
}

function said(c) {
  return c.on ? 'שעות שקטות מ ' + c.from + ' עד ' + c.to
    + '. בשעות האלה התשובות נכנסות לשיחה בלי צלצול, ובסוף הלילה מגיעה התראה אחת.'
    : 'השעות השקטות כבויות. כל תשובה מצלצלת, גם בלילה.';
}

function hold(title, body) {
  const q = readJson(HELD, []);
  q.push({ at: new Date().toISOString(), title: String(title || ''), body: String(body || '') });
  writeJson(HELD, q.slice(-200));
}
function held() { return readJson(HELD, []); }
function clear() { writeJson(HELD, []); }

// One morning line for everything that was kept.
function summary(q) {
  const titles = [];
  for (const m of q) if (m.title && !titles.includes(m.title)) titles.push(m.title);
  return {
    title: q.length === 1 ? 'הגיע עדכון אחד בלילה' : 'בלילה הגיעו ' + q.length + ' עדכונים',
    body: (q.length === 1 ? (q[0].body || q[0].title) : titles.slice(0, 6).join('\n'))
      + '\nהכל בשיחה במוניטור.'
  };
}

module.exports = { settings, active, parse, set, said, hold, held, clear, summary, FILE, HELD };
