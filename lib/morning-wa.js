'use strict';
/*
  10.11.2026, Itzik: "אם ההתראה של הבוקר לא נפתחה בבוקר, שלח לי וואטסאפ".
  The WhatsApp fallback of the manager's morning push. It runs inside wa-daily.js (timer 08:30 Israel), so he
  never gets two near identical WhatsApps: when the fallback fires, the manager's open lines and the new open
  loops of wa-daily go out as ONE message; when it does not fire, wa-daily behaves as before.

  Decision (decide, pure): send only when the manager pushed this morning (state.json pushed = today, pushedAt),
  there is no open of the monitor since that push (lib/owner-open.js), nothing was sent today yet
  (data/status/morning-wa.json { day, sentAt, via }), it is not Saturday (the same rule as wa-daily), and the
  manager card of today has open lines.
*/
const fs = require('fs');
const path = require('path');
const M = require('./manager.js');
const OO = require('./owner-open.js');

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function stateFile(dataPath) { return path.join(dataPath, 'status', 'morning-wa.json'); }

/*
  in: { day, weekday (0 = Sunday), pushedDay, pushedAt (ms or 0), lastOpenAt (ms or 0), sentDay, openLines (count) }
  out: { send, reason }
*/
function decide(i) {
  if (i.sentDay === i.day) return { send: false, reason: 'already-sent' };
  if (i.weekday === 6) return { send: false, reason: 'saturday' };
  if (i.pushedDay !== i.day) return { send: false, reason: 'no-morning-push' };
  if ((i.lastOpenAt || 0) >= (i.pushedAt || 0)) return { send: false, reason: 'opened' };
  if (!(i.openLines > 0)) return { send: false, reason: 'nothing-open' };
  return { send: true, reason: 'not-opened' };
}

const MAX_LINES = 6;
// 13.11.2026, Itzik: only requests that wait for him (the handle list and his own open requests), not status updates.
const REQUEST_KEYS = new Set(['handle', 'work2']);
// The open lines of the card in short form: title, and the sub when it is short. No dashes (visible copy).
function lines(card) {
  const open = ((card && card.items) || []).filter((i) => i && i.st !== 'done' && REQUEST_KEYS.has(i.k));
  const out = open.slice(0, MAX_LINES).map((i) => {
    const sub = i.sub ? M.noDash(String(i.sub).split('\n')[0].replace(/^[•\s]+/, '')) : '';
    const s = sub.length > 60 ? sub.slice(0, 59) + '…' : sub;
    return '• ' + M.noDash(i.t) + (s ? ': ' + s : '');
  });
  if (open.length > MAX_LINES) out.push('• ועוד ' + (open.length - MAX_LINES));
  return out;
}

// extra: the text wa-daily built for the new open loops (or null). It carries its own link; otherwise add one.
function text(card, url, extra) {
  const l = lines(card);
  let s = 'לא ראיתי שפתחת את המוניטור הבוקר. מה שמחכה לך:\n' + l.join('\n');
  s += extra ? '\n\n' + extra : (url ? '\n\nהכל במוניטור: ' + url : '');
  return s;
}

function weekdayOf(day) { return new Date(day + 'T12:00:00Z').getUTCDay(); }
function dayKey(ms) { return M.dayKey(ms); }

// Reads the disk and decides. now in ms. Returns { day, d (decision), card, lines, input }.
function check(dataPath, now) {
  const day = dayKey(now);
  const st = readJson(path.join(dataPath, 'manager', 'state.json'), {});
  const card = readJson(path.join(dataPath, 'manager', 'manager', day.replace(/-/g, '') + '.json'), null);
  // A push of an older build has no pushedAt: the beginning of that day counts, so any open that day is an open.
  const pushedAt = st.pushed === day ? (Date.parse(st.pushedAt || '') || Date.parse(day + 'T00:00:00+02:00')) : 0;
  const input = {
    day, weekday: weekdayOf(day), pushedDay: st.pushed || '', pushedAt,
    lastOpenAt: OO.lastOpenAt(dataPath),
    sentDay: (readJson(stateFile(dataPath), {}) || {}).day || '',
    openLines: card ? lines(card).length : 0,
  };
  return { day, d: decide(input), card, input };
}

function markSent(dataPath, day, via) {
  const f = stateFile(dataPath);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ day, sentAt: new Date().toISOString(), via }, null, 1));
}

module.exports = { decide, lines, text, check, markSent, stateFile, weekdayOf };
