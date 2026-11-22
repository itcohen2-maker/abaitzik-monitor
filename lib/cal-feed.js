'use strict';
/*
  22.11.2026, idea he took ("יומן שמתעדכן לבד במקום קובץ חד פעמי"): the appointments screen had one .ics download,
  so a changed or deleted appointment never reached the phone calendar. Here is one subscribed calendar instead:
  wa-bridge.js serves GET /api/cal/<key>.ics, and the phone (webcal://) pulls it again by itself, about hourly.
  Every appointment in data/appts/appts becomes an event, and every task in data/tasks/tasks an all-day event on its day.
  The key in the address is the only protection (a calendar app cannot send a body), so it is compared in constant time
  and kept in data/status/cal-feed-key.txt (mode 600, never in docs/live.json).
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CRLF = '\r\n';

// RFC 5545 text escaping: backslash first, then the separators and newlines.
function esc(s) {
  return String(s == null ? '' : s).replace(/\r/g, '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Lines longer than 75 octets are folded: continuation lines start with one space. Folding counts bytes, not characters,
// so a Hebrew letter (2 bytes in UTF-8) is never cut in half.
function fold(line) {
  const out = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (bytes + n > limit) { out.push(cur); cur = ' ' + ch; bytes = 1 + n; limit = 75; continue; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join(CRLF);
}

function utcStamp(d) { return d.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z'; }
function dayStamp(ymd) { return ymd.replace(/-/g, ''); }
// The day after a YYYY-MM-DD string, computed in UTC so the server's own zone does not matter.
function nextDay(ymd) {
  const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function readJsonDir(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort(); } catch (e) { return []; }
  const out = [];
  for (const n of names) {
    try { out.push(JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))); } catch (e) { /* a broken file is skipped, never breaks the feed */ }
  }
  return out;
}

function apptEvent(a, stamp) {
  const lines = ['BEGIN:VEVENT', 'UID:' + esc(a.id) + '@abaitzik', 'DTSTAMP:' + stamp];
  if (a.noTime) {
    const day = String(a.when || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    lines.push('DTSTART;VALUE=DATE:' + dayStamp(day), 'DTEND;VALUE=DATE:' + dayStamp(nextDay(day)));
  } else {
    const s = new Date(a.when);
    if (isNaN(s.getTime())) return null;
    lines.push('DTSTART:' + utcStamp(s), 'DTEND:' + utcStamp(new Date(s.getTime() + 3600e3)));
  }
  lines.push('SUMMARY:' + esc(a.what || 'תור'));
  if (a.where) lines.push('LOCATION:' + esc(a.where));
  lines.push('END:VEVENT');
  return lines;
}

function taskEvent(t, stamp) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t.day || ''))) return null;
  return ['BEGIN:VEVENT', 'UID:t-' + esc(t.id) + '@abaitzik', 'DTSTAMP:' + stamp,
    'DTSTART;VALUE=DATE:' + dayStamp(t.day), 'DTEND;VALUE=DATE:' + dayStamp(nextDay(t.day)),
    'SUMMARY:' + esc('✅ ' + (t.text || 'משימה')), 'END:VEVENT'];
}

// The whole subscribed calendar as one text (VCALENDAR). dataDir is the monitor's data folder.
function ics(dataDir, now) {
  const stamp = utcStamp(new Date(now || Date.now()));
  const head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//abaitzik//monitor//HE', 'X-WR-CALNAME:המוניטור',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  const body = [];
  for (const a of readJsonDir(path.join(dataDir, 'appts', 'appts'))) { const e = apptEvent(a, stamp); if (e) body.push(...e); }
  for (const t of readJsonDir(path.join(dataDir, 'tasks', 'tasks'))) { const e = taskEvent(t, stamp); if (e) body.push(...e); }
  return head.concat(body, ['END:VCALENDAR']).map(fold).join(CRLF) + CRLF;
}

// The key lives in data/status/cal-feed-key.txt. Created once, on first use.
function keyFile(dataDir) { return path.join(dataDir, 'status', 'cal-feed-key.txt'); }
function key(dataDir) {
  const f = keyFile(dataDir);
  try { const k = fs.readFileSync(f, 'utf8').trim(); if (/^[a-f0-9]{32}$/.test(k)) return k; } catch (e) {}
  const k = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, k, { mode: 0o600 });
  return k;
}

// Constant time comparison; a wrong length is refused before the comparison.
function keyOk(dataDir, given) {
  const want = key(dataDir), g = String(given || '');
  if (g.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(g), Buffer.from(want));
}

module.exports = { ics, key, keyOk, esc, fold };
