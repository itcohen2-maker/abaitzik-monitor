'use strict';
/*
  The listener. This is the thing that was missing.

  Until 13.9 nothing on this machine touched the backup channel. The page sent
  to ntfy, ntfy held the message, and it reached the machine only when a Claude
  session happened to type `node inbox.js`. On 13.9 six of Itzik's voice memos
  sat there, the oldest for ninety seven minutes, and he was right to call it
  what it was.

  So this holds the connection open instead of asking now and then. ntfy's
  stream endpoint pushes a message the moment it is published, which makes the
  arrival immediate rather than "within a minute". Attachments are downloaded
  the same way inbox.js downloads them, into the same folder, against the same
  seen mark, so the two cannot fight over what has already been read.

  Two things are written for the screen:
    data/status/live.json   the heartbeat, so anything local can tell it is up
    data/status/pulls.json  the last hundred arrivals, with their times

  And the same heartbeat goes out on a second ntfy topic, at minimum priority
  so it never buzzes his phone. That is what the indicator on the page reads:
  his phone cannot see a file on this machine, but it can see that topic.

  Usage: node listen.js
*/
const fs = require('fs');
const path = require('path');

const TOPIC = 'abaitzik-in-95e62e86c34f4853';
const LIVE = TOPIC + '-live';
const SEEN = path.join(__dirname, 'data', 'ntfy-seen.json');
const DROP = path.join(__dirname, 'data', 'inbox');
const STATUS = path.join(__dirname, 'data', 'status');
const LIVEFILE = path.join(STATUS, 'live.json');
const PULLS = path.join(STATUS, 'pulls.json');

const BEAT_MS = 60000;
const STARTED = Date.now();
let received = 0;
let lastMsgAt = 0;
let connectedAt = 0;

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 1), 'utf8');
}
function say(line) {
  console.log(new Date().toLocaleTimeString('he-IL') + '  ' + line);
}

// The seen mark is shared with inbox.js on purpose: whichever of the two reads
// a message first, the other must not hand it over a second time.
function mark() { return readJson(SEEN, { time: 0, ids: [] }); }
function remember(m) {
  const s = mark();
  const ids = m.time === s.time ? s.ids.concat([m.id]) : [m.id];
  writeJson(SEEN, { time: Math.max(s.time || 0, m.time), ids: ids });
}

// Every arrival is written down with its time, because "it arrived" and "it
// arrived at 15:29" are not the same claim, and he asked for the second one.
function logPull(kind, text) {
  const list = readJson(PULLS, []);
  list.push({ at: new Date().toISOString(), kind: kind, text: String(text || '').slice(0, 120) });
  writeJson(PULLS, list.slice(-100));
}

function beatBody() {
  // The five most recent arrivals travel with the pulse. His phone cannot read
  // pulls.json on this machine, and "when did it last actually pick something
  // up" is the question the indicator has to answer.
  const recent = readJson(PULLS, []).slice(-5)
    .map(function (r) { return { at: r.at, kind: r.kind }; });
  return {
    at: new Date().toISOString(),
    up: Math.round((Date.now() - STARTED) / 1000),
    since: connectedAt ? new Date(connectedAt).toISOString() : '',
    last: lastMsgAt ? new Date(lastMsgAt).toISOString() : '',
    n: received,
    recent: recent
  };
}

// Minimum priority and no tags: this is a pulse, not a notification. If it ever
// starts buzzing his phone the indicator is worse than no indicator at all.
async function beat() {
  const body = beatBody();
  writeJson(LIVEFILE, body);
  try {
    await fetch('https://ntfy.sh/' + LIVE, {
      method: 'POST',
      headers: { 'Priority': 'min', 'Title': 'live', 'X-Tags': 'none' },
      body: JSON.stringify(body)
    });
  } catch (e) { /* the pulse is allowed to miss; the file above still moved */ }
}

async function saveAttachment(m) {
  const out = path.join(DROP, m.attachment.name);
  const res = await fetch(m.attachment.url);
  const bin = Buffer.from(await res.arrayBuffer());
  const expected = Number(m.attachment.size) || 0;
  const real = res.ok && bin.length > 1024 && (!expected || bin.length >= expected * 0.9);
  if (real) {
    fs.mkdirSync(DROP, { recursive: true });
    fs.writeFileSync(out, bin);
    say('קובץ נשמר: ' + m.attachment.name + ' (' + bin.length + ')');
    logPull('file', m.attachment.name);
    return true;
  }
  // Three hours is all ntfy keeps an attachment. Listening removes the reason
  // this ever happened, but a loss still has to be loud rather than silent.
  say('!! ההקלטה אבדה: ' + m.attachment.name + ' (' + res.status + ', ' + bin.length + ')');
  logPull('lost', m.attachment.name);
  return false;
}

async function handle(m) {
  const seen = mark();
  if (m.time === seen.time && seen.ids.includes(m.id)) return;
  received++;
  lastMsgAt = Date.now();
  say('הודעה: ' + String(m.message || '(צרופה)').slice(0, 80));
  if (m.attachment) await saveAttachment(m);
  if (m.message) logPull('text', m.message);
  remember(m);
  await beat();
}

/*
  One long connection.

  ntfy sends a keepalive every 45 seconds. The dangerous failure is not a
  socket that closes, which throws and reconnects on its own: it is a socket
  the machine still believes is open after the nightly sleep, which yields
  nothing and never errors. The listener would sit there looking connected
  while Itzik's messages piled up on the server, which is the exact failure
  this whole thing exists to end. So silence longer than two and a half minutes
  is treated as death and the connection is torn down and rebuilt.
*/
const STALL_MS = 150000;
async function connect() {
  const since = mark().time || 'all';
  const ac = new AbortController();
  let lastEvent = Date.now();
  const watchdog = setInterval(function () {
    if (Date.now() - lastEvent > STALL_MS) {
      say('הזרם שתק ' + Math.round((Date.now() - lastEvent) / 1000) + ' שניות. מנתק ומתחבר מחדש.');
      ac.abort();
    }
  }, 15000);
  try {
    const res = await fetch('https://ntfy.sh/' + TOPIC + '/json?since=' + since,
      { signal: ac.signal });
    if (!res.ok || !res.body) throw new Error('ntfy ' + res.status);
    connectedAt = Date.now();
    lastEvent = Date.now();
    say('מחובר לערוץ. מאזין.');
    await beat();
    let buf = '';
    for await (const chunk of res.body) {
      lastEvent = Date.now();
      buf += Buffer.from(chunk).toString('utf8');
      let i;
      while ((i = buf.indexOf(String.fromCharCode(10))) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let m;
        try { m = JSON.parse(line); } catch (e) { continue; }
        if (m.event === 'message') await handle(m);
      }
    }
    throw new Error('הזרם נסגר');
  } finally {
    clearInterval(watchdog);
  }
}

(async () => {
  setInterval(beat, BEAT_MS);
  let wait = 2000;
  for (;;) {
    try {
      await connect();
      wait = 2000;
    } catch (e) {
      say('נותק: ' + e.message + '. מנסה שוב בעוד ' + Math.round(wait / 1000) + ' שניות.');
      connectedAt = 0;
      await beat();
      await new Promise(r => setTimeout(r, wait));
      wait = Math.min(wait * 2, 60000);
    }
  }
})();
