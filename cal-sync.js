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
  // 7.11: as the monitor's own user (root left root owned files behind). A customer's page is built in place.
  const uid = fs.statSync(src.dir).uid;
  const run = src.tenant ? [process.execPath, 'build.js'] : [process.execPath, 'push.js', 'calendar changed'];
  try { execFileSync('sudo', ['-u', '#' + uid, '-H'].concat(run), { cwd: src.dir, stdio: 'ignore', timeout: 300000 });
    if (src.tenant) execFileSync('chmod', ['-R', 'o+rX', path.join(src.dir, 'docs')]); }
  catch (e) { say(src.name + ': push נכשל ' + e.message.slice(0, 80)); }
}

/*
  7.11: the 🔌 screen of every monitor. A snapshot of its setup page (which steps, which are connected),
  written into its own data/conn/setup.json, since a customer's build cannot read Itzik's data/setup.
*/
function connSnap(src) {
  const def = readJson(path.join(SETUP, src.setup + '.def.json'), null);
  if (!def) return false;
  const st = readJson(path.join(SETUP, src.setup + '.json'), {}).steps || {};
  const steps = [], state = {}, ready = {};
  (def.steps || []).forEach((d) => {
    if (!d.oauth || !d.oauth.provider) return;
    steps.push({ id: d.id, icon: d.icon || '', title: d.title || d.id, oauth: { provider: d.oauth.provider } });
    const s = st[d.id] || {};
    state[d.id] = { got: s.got || '', revokedAt: s.revokedAt || '', who: s.who || '' };
    ready[d.oauth.provider] = oa.ready(d.oauth.provider);
  });
  const next = JSON.stringify({ tok: src.setup, steps, state, ready });
  const f = path.join(src.dir, 'data', 'conn', 'setup.json');
  let old = ''; try { old = fs.readFileSync(f, 'utf8'); } catch (e) {}
  if (old === next || DRY) return false;
  const o = fs.statSync(src.dir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, next);
  for (const x of [path.dirname(f), f]) { try { fs.chownSync(x, o.uid, o.gid); } catch (e) {} }
  return true;
}

/*
  10.11.2026: the Outlook calendar of a client who connected Microsoft on his setup page (src.msStep, written by
  lib/setup-intake.js). Read only: Graph /me/calendarView through the saved refresh token, the same window as Google.
  Scope needed: Calendars.Read or Calendars.ReadWrite (the setup card asks for ReadWrite). Mail is not read.
*/
function msSaved(src) {
  if (!src.msStep) return null;
  const sec = readJson(path.join(SETUP, src.setup + '.secrets.json'), {});
  try { const v = JSON.parse(sec[src.msStep].value); return v && v.provider === 'microsoft' ? v : null; } catch (e) { return null; }
}
// Graph answers in Israel time (Prefer header); a local time becomes an exact instant.
function israelIso(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(local || '');
  if (!m) return '';
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  for (const off of [2, 3]) {
    const t = asUtc - off * 3600000;
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', hour: '2-digit' }).format(new Date(t));
    if (Number(p) === +m[4]) return new Date(t).toISOString();
  }
  return new Date(asUtc - 2 * 3600000).toISOString();
}
async function pullMs(access, now) {
  const out = [];
  let url = 'https://graph.microsoft.com/v1.0/me/calendarView?' + new URLSearchParams({ startDateTime: new Date(now - 7 * DAY).toISOString(),
    endDateTime: new Date(now + 60 * DAY).toISOString(), '$top': '100', '$orderby': 'start/dateTime',
    '$select': 'id,subject,start,end,isAllDay,isCancelled,location,bodyPreview,attendees,onlineMeeting,webLink' });
  for (let i = 0; i < 10 && url; i++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + access, Prefer: 'outlook.timezone="Israel Standard Time"' }, signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    if (!r.ok) throw new Error('outlook ' + r.status + ' ' + String((j.error && (j.error.code || j.error.message)) || '').slice(0, 80));
    (j.value || []).forEach((e) => {
      if (e.isCancelled) return;
      const allDay = !!e.isAllDay;
      out.push({ id: 'ms-' + e.id, src: 'outlook', title: String(e.subject || '(בלי כותרת)').slice(0, 160),
        start: allDay ? String(e.start.dateTime).slice(0, 10) : israelIso(e.start.dateTime), end: allDay ? String(e.end.dateTime).slice(0, 10) : israelIso(e.end.dateTime),
        allDay, where: String((e.location && e.location.displayName) || '').slice(0, 160), note: String(e.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        meet: (e.onlineMeeting && e.onlineMeeting.joinUrl) || '', who: (e.attendees || []).map((a) => a.emailAddress && (a.emailAddress.name || a.emailAddress.address)).filter(Boolean).slice(0, 6) });
    });
    url = j['@odata.nextLink'] || '';
  }
  return out;
}
// Microsoft may rotate the refresh token: keep the new one in the secrets file (same owner, mode 600).
function keepRefresh(src, saved, refresh) {
  if (DRY || !refresh || refresh === saved.refresh_token) return;
  const f = path.join(SETUP, src.setup + '.secrets.json');
  const sec = readJson(f, {}); const st = fs.statSync(f);
  saved.refresh_token = refresh; sec[src.msStep] = { value: JSON.stringify(saved), at: new Date().toISOString() };
  fs.writeFileSync(f + '.tmp', JSON.stringify(sec, null, 1), { mode: 0o600 }); fs.renameSync(f + '.tmp', f);
  try { fs.chownSync(f, st.uid, st.gid); fs.chmodSync(f, 0o600); } catch (e) {}
}

async function one(src, now) {
  const saved = savedFor(src);
  const ms = msSaved(src);
  // 7.11: never connected is not "cut": no status file, so the 📅 icon keeps opening Google as before.
  if (!saved && !ms) { say(src.name + ': אין חיבור גוגל בדף ההקמה'); return; }
  let events = [], flip = false, googleOk = false;
  if (saved) {
    const c = await oa.check(saved);
    if (!c.ok) {
      say(src.name + ': החיבור לגוגל לא עובד (' + c.error + ')');
      // Only a cut connection asks for a new tap; a passing failure keeps the last copy quietly.
      if (c.revoked && status(src, false, 'revoked')) publish(src);
      if (!ms) return;
    } else {
      flip = status(src, true); googleOk = true;
      events = (await pull(c.access, now)).map((e) => Object.assign({ src: 'google' }, e));
    }
  }
  let msOk = false;
  if (ms) {
    try {
      const c = await oa.check(ms);
      if (!c.ok) say(src.name + ': החיבור למיקרוסופט לא עובד (' + c.error + ')');
      else { keepRefresh(src, ms, c.refresh); events = events.concat(await pullMs(c.access, now)); msOk = true; }
    } catch (e) { say(src.name + ': יומן אאוטלוק ' + e.message.slice(0, 100)); }
  }
  // a failed side keeps the last copy quietly: nothing is written when no source answered
  if (!googleOk && !msOk) return;
  if (saved && !googleOk || ms && !msOk) {
    const old0 = readJson(path.join(src.dir, 'data', 'cal', 'events.json'), {});
    const tag = saved && !googleOk ? 'google' : 'outlook';
    events = events.concat((old0.events || []).filter((e) => (e.src || 'google') === tag));
  }
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
  fs.writeFileSync(file + '.tmp', JSON.stringify({ at: new Date(now).toISOString(), who: (saved || ms).who || '', hash, events }));
  fs.renameSync(file + '.tmp', file);
  for (const f of [path.dirname(file), file, path.join(path.dirname(file), 'checked.json')]) { try { fs.chownSync(f, st.uid, st.gid); } catch (e) {} }
  publish(src);
}

(async () => {
  const now = Date.now();
  for (const src of readJson(SOURCES, [])) {
    try { if (connSnap(src)) publish(src); } catch (e) { say(src.name + ': חיבורים ' + e.message.slice(0, 80)); }
    try { await one(src, now); } catch (e) { say(src.name + ': ' + e.message.slice(0, 120)); }
  }
})();
