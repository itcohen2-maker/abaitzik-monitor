'use strict';
/*
  Which kinds of notification ring the phone (14.11.2026, from the improvements reviewer:
  "לבחור אילו סוגי התראות מגיעים לטלפון").

  There was only one switch, all or nothing. A customer who gets answers,
  reminders, file notices and tasks can tire of all of it and had no way to
  keep only what matters to her. Settings now has one switch per kind, under
  quiet hours. The page sends the line
  "סוגי התראות: תשובות פועל, תזכורות כבוי, קבצים פועל, משימות פועל",
  and the listener writes it here with no model. Default: everything on.

  A muted kind is not sent and not kept for the morning: the answer or the
  reminder is still on the screen. A notification of no known kind (a fault,
  a lead, the quota) always rings. The alarm clock goes straight to ntfy
  (alarm.js) and is never muted here.
*/
const fs = require('fs');
const path = require('path');
const inst = require('./instance.js');

const FILE = path.join(inst.dataPath, 'status', 'alert-kinds.json');
const KINDS = { answers: 'תשובות', reminders: 'תזכורות', files: 'קבצים', tasks: 'משימות' };

function readJson(p, d) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; }
}

function settings(file) {
  const s = readJson(file || FILE, {});
  const out = {};
  for (const k of Object.keys(KINDS)) out[k] = s[k] !== false;
  return out;
}

// The kind of a notification that did not say one, from its title.
function guess(title) {
  const t = String(title || '');
  if (/תזכורת|שגרה/.test(t)) return 'reminders';
  if (/קובץ|קבצים/.test(t)) return 'files';
  if (/משימ/.test(t)) return 'tasks';
  return null;
}

function muted(kind, file) {
  return !!(kind && KINDS[kind] && settings(file)[kind] === false);
}

// The settings line from the page, possibly after a kind word on its own line.
function parse(text) {
  const m = /סוגי התראות\s*[:：]\s*([^\n]+)/.exec(String(text || ''));
  if (!m) return null;
  const v = {};
  for (const k of Object.keys(KINDS)) {
    const r = new RegExp(KINDS[k] + '\\s+(פועל|כבוי)').exec(m[1]);
    if (r) v[k] = r[1] === 'פועל';
  }
  return Object.keys(v).length ? v : null;
}

function set(v, file) {
  const f = file || FILE;
  const c = Object.assign(settings(f), v, { setAt: new Date().toISOString() });
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(c, null, 1), 'utf8');
  return c;
}

function said(c) {
  const on = Object.keys(KINDS).filter(k => c[k] !== false).map(k => KINDS[k]);
  const off = Object.keys(KINDS).filter(k => c[k] === false).map(k => KINDS[k]);
  if (!off.length) return 'כל סוגי ההתראות מצלצלים בטלפון.';
  return (on.length ? 'מצלצלים בטלפון: ' + on.join(', ') + '. ' : 'שום סוג לא מצלצל בטלפון. ')
    + 'בלי צלצול: ' + off.join(', ') + '. הכל עדיין מופיע במוניטור.';
}

module.exports = { KINDS, settings, guess, muted, parse, set, said, FILE };
