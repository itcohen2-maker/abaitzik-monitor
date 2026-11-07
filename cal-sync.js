'use strict';
/*
  7.11.2026, Itzik: "אני רוצה שתעתיק את היומן, וכל דבר שנמצא ביומן של הלקוח יהיה בתוך המוניטור"
  (like Noam at Revora, whose screen keeps a copy of the Google calendar).

  Every 10 minutes: for each monitor in data/cal/sources.json, read the primary Google
  calendar through the connection made on its setup page (lib/oauth.js, scope calendar.events),
  from 7 days back to 60 days ahead, and write <monitor>/data/cal/events.json.
  Only when the events really changed, push.js rebuilds that monitor's page, so the
  📅 יומן icon there opens the copy. Reading only: nothing in the calendar is changed.

  sources.json: [{ "name": "abaitzik", "dir": "/home/monitor/abaitzik-monitor", "setup": "<page token>", "step": "<card id>" }]
  A client is added when he taps the Google card on his setup page.
  node cal-sync.js [--dry]     Timer: monitor-cal.timer (root). Log /var/log/monitor-cal.log
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const oa = require('./lib/oauth.js');
const HERE = __dirname;
const SETUP = path.join(HERE, 'data', 'setup');
const SOURCES = path.join(HERE, 'data', 'cal', 'sources.json');
const DRY = process.argv.includes('--dry');
const DAY = 86400000;

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function say(s) { console.log(new Date().toISOString().slice(0, 16) + ' ' + s); }

function savedFor(src) {
  const sec = readJson(path.join(SETUP, src.setup + '.secrets.json'), {});
  try { const v = JSON.parse(sec[src.step].value); return v && v.provider === 'google' ? v : null; } catch (e) { return null; }
}

async function pull(access, now) {
  const out = [];
  let page = '';
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      timeMin: new Date(now - 7 * DAY).toISOString(), timeMax: new Date(now + 60 * DAY).toISOString() });
    if (page) q.set('pageToken', page);
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + q, {
      headers: { Authorization: 'Bearer ' + access }, signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    if (!r.ok) throw new Error('google ' + r.status + ' ' + String((j.error && j.error.message) || '').slice(0, 80));
    (j.items || []).forEach((e) => {
      if (e.status === 'cancelled') return;
      const allDay = !!(e.start && e.start.date);
      out.push({ id: e.id, title: String(e.summary || '(בלי כותרת)').slice(0, 160),
        start: allDay ? e.start.date : (e.start && e.start.dateTime) || '', end: allDay ? e.end.date : (e.end && e.end.dateTime) || '',
        allDay, where: String(e.location || '').slice(0, 160), note: String(e.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
        meet: e.hangoutLink || '', who: (e.attendees || []).filter((a) => !a.self).map((a) => a.displayName || a.email).slice(0, 6) });
    });
    page = j.nextPageToken || '';
    if (!page) break;
  }
  return out;
}

// status.json tells the page whether the copy is alive, and where to tap to connect again.
function status(src, ok, why) {
  const f = path.join(src.dir, 'data', 'cal', 'status.json');
  const next = { ok, why: why || '', connect: ok ? '' : 'https://form.it-solution.co.il/oauth/google/start?t=' + src.setup + '&s=' + src.step };
  const old = readJson(f, null);
  if (old && old.ok === next.ok && old.why === next.why) return false;
  if (DRY) return false;
  const st = fs.statSync(src.dir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  try { fs.chownSync(path.dirname(f), st.uid, st.gid); } catch (e) {}
  fs.writeFileSync(f, JSON.stringify(next)); try { fs.chownSync(f, st.uid, st.gid); } catch (e) {}
  return true;
}
function publish(src) {
  try { execFileSync(process.execPath, ['push.js', 'calendar changed'], { cwd: src.dir, stdio: 'ignore', timeout: 300000 }); }
  catch (e) { say(src.name + ': push נכשל ' + e.message.slice(0, 80)); }
}

async function one(src, now) {
  const saved = savedFor(src);
  if (!saved) { say(src.name + ': אין חיבור גוגל בדף ההקמה'); if (status(src, false, 'none')) publish(src); return; }
  const c = await oa.check(saved);
  if (!c.ok) {
    say(src.name + ': החיבור לגוגל לא עובד (' + c.error + ')');
    // Only a cut connection asks for a new tap; a passing failure keeps the last copy quietly.
    if (c.revoked && status(src, false, 'revoked')) publish(src);
    return;
  }
  const flip = status(src, true);
  const events = await pull(c.access, now);
  const file = path.join(src.dir, 'data', 'cal', 'events.json');
  const old = readJson(file, {});
  const hash = crypto.createHash('sha1').update(JSON.stringify(events)).digest('hex');
  const changed = old.hash !== hash;
  say(src.name + ': ' + events.length + ' אירועים' + (changed ? ', השתנה' : ', בלי שינוי'));
  if (DRY) { if (changed) console.log(JSON.stringify(events.slice(0, 3))); return; }
  // The time of the last check is kept in a side file, so an unchanged calendar does not rebuild the page.
  const st = fs.statSync(src.dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(file), 'checked.json'), JSON.stringify({ at: new Date(now).toISOString() }));
  if (!changed) { if (flip) publish(src); return; }
  fs.writeFileSync(file + '.tmp', JSON.stringify({ at: new Date(now).toISOString(), who: saved.who || '', hash, events }));
  fs.renameSync(file + '.tmp', file);
  for (const f of [path.dirname(file), file, path.join(path.dirname(file), 'checked.json')]) { try { fs.chownSync(f, st.uid, st.gid); } catch (e) {} }
  publish(src);
}

(async () => {
  const now = Date.now();
  for (const src of readJson(SOURCES, [])) {
    try { await one(src, now); } catch (e) { say(src.name + ': ' + e.message.slice(0, 120)); }
  }
})();
