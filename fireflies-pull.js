'use strict';
/*
  3.11.2026: a customer's recorded meetings into "🎙️ סיכומי פגישות" (lib/biz-home.js).

  Shai records every Zoom meeting in Fireflies (Business plan, API). Run in the
  customer's own folder, as the customer's user, by the timer
  monitor-fireflies-<id>.timer every 30 minutes (setup/enable-fireflies.sh <id>).

  The key is data/keys.json "firefliesKey". No key: it leaves without a word.
  It asks Fireflies for transcripts since the newest one it has, and only when a
  transcript it has not seen comes back with its summary ready does it write
  anything: the meeting into data/biz-home/meetings.json, a new client into
  clients.json when no client matched, then node push.js (build and publish) and
  one push to the phone. A round with nothing new runs no model, builds nothing
  and sends nothing. A transcript whose summary is not ready yet is left for the
  next round.

    node fireflies-pull.js          one round
    node fireflies-pull.js --dry    print what would be written, write nothing
    node fireflies-pull.js --days N look back N days on the first round (default 14)
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');
const bh = require('./lib/biz-home.js');

const API = 'https://api.fireflies.ai/graphql';
const DRY = process.argv.includes('--dry');
const daysArg = process.argv.indexOf('--days');
const DAYS = daysArg > -1 ? Math.max(1, Number(process.argv[daysArg + 1]) || 14) : 14;
const STATE = path.join(bh.dirOf(inst.dataPath), 'fireflies-state.json');

const QUERY = 'query Recent($fromDate: DateTime, $limit: Int) { transcripts(fromDate: $fromDate, limit: $limit) {'
  + ' id title date duration organizer_email participants'
  + ' meeting_attendees { displayName email name }'
  + ' summary { overview short_summary action_items keywords shorthand_bullet } } }';

function log(s) { console.log(new Date().toISOString().slice(0, 19) + '  ' + s); }
function keyOf() {
  try { const k = JSON.parse(fs.readFileSync(path.join(inst.dataPath, 'keys.json'), 'utf8')); return typeof k.firefliesKey === 'string' ? k.firefliesKey.trim() : ''; } catch (e) { return ''; }
}
function readState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) || {}; } catch (e) { return {}; } }
function saveState(s) { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE + '.tmp', JSON.stringify(s, null, 1)); fs.renameSync(STATE + '.tmp', STATE); }

// The owner, so his own action items are "mine" and he is never made a client.
function owner() {
  const b = bh.bizInfo(__dirname);
  const emails = [b.email, inst.mailbox].filter((e) => e && /@/.test(e));
  let names = [inst.owner];
  try { const k = JSON.parse(fs.readFileSync(path.join(inst.dataPath, 'keys.json'), 'utf8')); if (Array.isArray(k.firefliesOwnerNames)) names = names.concat(k.firefliesOwnerNames); if (k.firefliesOwnerEmail) emails.push(k.firefliesOwnerEmail); } catch (e) { /* none */ }
  return { emails, names: names.filter(Boolean) };
}

async function ask(key, vars) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ query: QUERY, variables: vars }), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.errors) throw new Error('fireflies ' + r.status + ' ' + JSON.stringify((j && j.errors) || '').slice(0, 300));
  return (j.data && j.data.transcripts) || [];
}

async function main() {
  const key = keyOf();
  if (!key) return; // not connected yet: quiet
  const st = readState();
  st.seen = st.seen || {};
  const from = st.since || new Date(Date.now() - DAYS * 864e5).toISOString();
  let list;
  try { list = await ask(key, { fromDate: from, limit: 50 }); } catch (e) {
    // One quiet retry, then a line in the log only (iron rule: no error message before checking again).
    try { list = await ask(key, { fromDate: from, limit: 50 }); } catch (e2) { log('!! ' + e2.message); st.lastError = { at: new Date().toISOString(), msg: e2.message.slice(0, 200) }; if (!DRY) saveState(st); process.exitCode = 1; return; }
  }
  const fresh = list.filter((t) => t && t.id && !st.seen[t.id]);
  const ready = fresh.filter((t) => t.summary && (t.summary.overview || t.summary.action_items || t.summary.short_summary));
  st.lastRun = new Date().toISOString(); delete st.lastError;
  if (!ready.length) { if (!DRY) saveState(st); return; }

  const own = owner();
  let meetings = bh.readList(inst.dataPath, 'meet'), clients = bh.readList(inst.dataPath, 'client');
  const titles = [];
  for (const t of ready.sort((a, b) => Number(a.date) - Number(b.date))) {
    const { meeting, newClient } = bh.meetingFromTranscript(t, { clients, ownerEmails: own.emails, ownerNames: own.names });
    if (newClient && !clients.some((c) => c.id === newClient.id)) clients = clients.concat([newClient]);
    meetings = bh.upsert(meetings, meeting);
    st.seen[t.id] = meeting.at || new Date().toISOString();
    titles.push((meeting.client || meeting.title));
    log('meeting ' + t.id + ' -> ' + (meeting.client || 'לא שויך'));
  }
  // The newest finished transcript moves the window; anything still processing stays inside it.
  const pending = fresh.filter((t) => ready.indexOf(t) < 0);
  const newest = ready.map((t) => Number(t.date) || Date.parse(t.date)).filter((n) => !isNaN(n)).map((n) => new Date(n).toISOString()).sort().pop();
  if (!pending.length && newest) st.since = new Date(Date.parse(newest) - 6 * 3600e3).toISOString();
  if (DRY) { console.log(JSON.stringify({ meetings: meetings.slice(0, ready.length), clients }, null, 1)); return; }
  bh.writeList(inst.dataPath, 'meet', meetings);
  bh.writeList(inst.dataPath, 'client', clients);
  saveState(st);
  const msg = titles.length === 1 ? 'סיכום חדש: ' + titles[0] : titles.length + ' סיכומי פגישות חדשים';
  try { execFileSync(process.execPath, ['push.js', 'פיירפליס: ' + msg], { cwd: __dirname, stdio: 'inherit', timeout: 180000 }); } catch (e) { log('!! push: ' + e.message); }
  try { execFileSync(process.execPath, ['notify.js', '🎙️ סיכומי פגישות', msg + '. במסך הבית, באריח סיכומי פגישות.'], { cwd: __dirname, stdio: 'inherit', timeout: 60000 }); } catch (e) { log('!! notify: ' + e.message); }
}

if (require.main === module) main().catch((e) => { log('!! ' + e.message); process.exitCode = 1; });
module.exports = { QUERY };
