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
const ch = require('./lib/notify-channels.js');
const codexBridge = require('./codex-bridge.js');
const codexRoute = require('./lib/codex-route.js');
const group = require('./lib/group.js');
const { execFile } = require('child_process');

const TOPIC = 'abaitzik-in-95e62e86c34f4853';
const LIVE = TOPIC + '-live';
const SEEN = path.join(__dirname, 'data', 'ntfy-seen.json');
const DROP = path.join(__dirname, 'data', 'inbox');
const STATUS = path.join(__dirname, 'data', 'status');
const LIVEFILE = path.join(STATUS, 'live.json');
const PULLS = path.join(STATUS, 'pulls.json');
// The chat folder can be pointed somewhere else so the merge can be exercised
// against real files without writing into his actual conversation.
const CHAT = process.env.ABAITZIK_CHAT_DIR
  || path.join(__dirname, 'data', 'chat', 'chat');

/*
  How often the pulse goes out.

  The first version beat every sixty seconds and that was a mistake with a
  cost: a hundred and thirty two messages in two hours exhausted ntfy's free
  daily quota for this machine, which is the same quota the push notifications
  use. The indicator meant to prove the monitor was alive is what knocked its
  own channel over, and from Itzik's phone that looked exactly like the monitor
  falling.

  So the idle pulse is every fifteen minutes, about ninety six a day, which
  leaves the rest of the daily allowance for messages that actually matter. The
  feedback he cares about does not depend on it: every catch beats immediately,
  so seconds after he sends anything the indicator says so by name.
*/
/*
  The idle pulse is hourly now, not every fifteen minutes.

  Even at fifteen minutes it was ninety six messages a day against an
  allowance of about two hundred and fifty, so almost half of Itzik's
  notification budget was being spent on saying "still here". At an hour it is
  twenty four, it draws on its own small ration that cannot touch the
  notifications, and the page has a second source that costs nothing anyway.

  None of this slows down the part he actually watches: a catch still pulses
  immediately, so the answer to "did what I just sent arrive" is still seconds.
*/
const BEAT_MS = 3600000;
// The fallback pulse. Only on a change of shape, never on a clock, because
// every one of these is a commit.
const DOCS_LIVE = path.join(__dirname, 'docs', 'live.json');
const FALLBACK_MIN_GAP = 300000;
let lastFallbackAt = 0;
let lastShape = '';
const BEAT_BACKOFF_MS = 3600000;
let beatBlockedUntil = 0;
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
  // The pulse also carries what is left of today's sending budget. The whole
  // point of the rebuild is that we see the cliff before we walk off it, and
  // the only screen Itzik reads is the one on his phone.
  let money = {};
  let queued = 0;
  try { money = ch.budget(); queued = ch.queueLength(); } catch (e) { /* never block the pulse */ }
  return {
    at: new Date().toISOString(),
    up: Math.round((Date.now() - STARTED) / 1000),
    since: connectedAt ? new Date(connectedAt).toISOString() : '',
    last: lastMsgAt ? new Date(lastMsgAt).toISOString() : '',
    n: received,
    recent: recent,
    budget: money,
    queued: queued
  };
}

// Minimum priority and no tags: this is a pulse, not a notification. If it ever
// starts buzzing his phone the indicator is worse than no indicator at all.
async function beat() {
  const body = beatBody();
  // Two writes that cost nothing and always happen: the local file, and the
  // one next to the page when the state has changed shape.
  writeJson(LIVEFILE, body);
  // Every beat, not only when the state changes shape. The change-only rule
  // meant that through a quiet night the published file stayed hours old, and
  // a page that could not reach ntfy had nothing fresh to read from either
  // source. Hourly beats make this about two dozen small commits a day, which
  // is a fair price for a page that does not lie about being alive.
  publishFallback(body, true);
  // And the fast pulse, which is the only part with a price on it. Its ration
  // is separate from the notifications, so running out here can never mean
  // Itzik stops being reachable.
  const sent = await ch.pulse(JSON.stringify(body));
  if (!sent && !beatBlockedUntil) {
    beatBlockedUntil = Date.now();
    say('הפעימה המהירה לא יוצאת. הדף יקרא את הקובץ במקום, וההתראות לא נפגעות.');
  }
  if (sent) beatBlockedUntil = 0;
}

/*
  The pulse that does not ride the blocked channel.

  The indicator reads ntfy, which is fine until ntfy is the thing that is down:
  then no pulse goes out at all, the pill shows red, and it cannot say the one
  thing that is actually true, which is "I hear you, I just cannot answer". On
  13.9 that is exactly what happened and Itzik read it as the monitor dying.

  So the same state is also written next to the page itself, on GitHub Pages,
  which the page can always read from its own origin with nobody's quota in the
  way. This is a commit, so it is written only when the shape of the state
  changes, never on a timer, and no more than once every five minutes.

  It touches one path and nothing else. A commit limited to a pathspec cannot
  sweep up whatever else is in the working tree, which matters because a
  session may well be editing this repository at the same moment.
*/
function git(args, cb) {
  execFile('git', args, { cwd: __dirname, timeout: 30000 }, function (err, out, errout) {
    cb(err, String(out || '') + String(errout || ''));
  });
}
function shapeOf(body) {
  const b = body.budget || {};
  return [connectedAt ? 'up' : 'down',
    Object.keys(b).map(function (k) {
      return k + (b[k].blockedUntil ? ':blocked' : ':' + (b[k].left > 0 ? 'ok' : 'empty'));
    }).join(','),
    body.queued ? 'queued' : ''].join('|');
}
function publishFallback(body, force) {
  const shape = shapeOf(body);
  if (!force && shape === lastShape) return;
  if (Date.now() - lastFallbackAt < FALLBACK_MIN_GAP) return;
  lastShape = shape;
  lastFallbackAt = Date.now();
  try {
    fs.mkdirSync(path.dirname(DOCS_LIVE), { recursive: true });
    fs.writeFileSync(DOCS_LIVE, JSON.stringify(body, null, 1), 'utf8');
  } catch (e) { return; }
  // The first version went straight to commit with a pathspec. On the very
  // first run the file was untracked, so the commit matched nothing, git said
  // so in words the code did not recognise, the push succeeded with nothing in
  // it, and the listener reported the state as published when it was not. An
  // add first, and a check that a commit actually happened.
  git(['add', '--', 'docs/live.json'], function () {
    git(['commit', '-m', 'live: ' + shape, '--', 'docs/live.json'], function (err, out) {
      if (/nothing to commit|no changes added|did not match/i.test(out)) return;
      if (err) { say('!! מצב המאזין לא נשמר: ' + out.trim().slice(0, 120)); return; }
      push(0);
    });
  });
  function push(attempt) {
    git(['push'], function (err) {
      if (!err) { say('מצב המאזין פורסם לדף: ' + shape); return; }
      if (attempt) { say('!! פרסום מצב המאזין לדף נכשל, ינוסה בשינוי הבא.'); return; }
      // Someone else pushed first. Rebase onto them and try once more, then
      // leave it: the next change carries the same information anyway.
      git(['pull', '--rebase', '--autostash'], function () { push(1); });
    });
  }
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

/*
  Itzik, 16.9: "give me an answer the moment you start working on it, and it
  stays open in red until the answer arrives, then green". Until now his
  message only entered the chat when I answered it, so for the whole wait the
  page showed nothing. Now the listener writes the message into the chat the
  moment it lands, with status working and the time it was received. The page
  renders that as a red line under his words. When I answer, the record turns
  done and the line turns green. No claim is made that was not true: the
  listener really did receive it at that time.
*/
function isSystemText(text) {
  const t = String(text || '');
  return /^You received a file/.test(t) || /^קובץ\n/.test(t) || /^קודקס:/.test(t);
}
/*
  The parts of one send, held open until the last one lands.

  A send that carries a photo, a video, a recording and a line of writing
  arrives here as four separate ntfy messages, seconds apart. The token the
  page stamped on each title is what says they are one thing, and this is the
  file that was opened for that token, so every later part is folded into it
  instead of starting a new conversation.
*/
const groupFiles = new Map();

/*
  The name is stamped to the second, and two things can land inside one second.
  Until now the second one overwrote the first, and a message he sent was gone
  from the page without anything anywhere saying it had been dropped.
*/
function chatName(at) {
  const pad = (n) => String(n).padStart(2, '0');
  const base = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-'
    + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds()) + '-itzik-auto';
  let name = base + '.json';
  for (let i = 2; fs.existsSync(path.join(CHAT, name)); i++) name = base + '-' + i + '.json';
  return name;
}

function recordIncoming(m) {
  const gid = group.groupOf(m.title);
  const held = gid ? groupFiles.get(gid) : null;
  const attach = m.attachment ? String(m.attachment.name || '') : '';
  let caption = '';
  // The caption line of a file send starts with the word קובץ, which is what
  // isSystemText turns away. Inside a group that line is the message: it is the
  // sentence he typed or spoke over the files, so it is the one thing here that
  // must not be dropped.
  if (!m.attachment && m.message && (gid || !isSystemText(m.message))) {
    // A caption arrives as the same body every text send uses: a kind line,
    // the words, a blank line and his code. Only the words belong in the chat.
    caption = gid ? group.captionFrom(m.message) : String(m.message);
  }
  if (!attach && !caption.trim()) return false;

  if (held) {
    // A part of a send that is already on the page. Widen it, do not repeat it.
    if (attach) held.files.push(attach);
    if (caption.trim()) held.caption = caption.trim();
    let rec;
    try { rec = JSON.parse(fs.readFileSync(path.join(CHAT, held.name), 'utf8')); }
    catch (e) { groupFiles.delete(gid); return false; }
    // Never rewrite a message that was already answered. If a session closed it
    // between the first part and the last, the late part opens its own line.
    if (rec.status === 'done') { groupFiles.delete(gid); return false; }
    rec.text = group.groupText(held.caption, held.files);
    rec.files = held.files.slice();
    try { fs.writeFileSync(path.join(CHAT, held.name), JSON.stringify(rec, null, 1), 'utf8'); }
    catch (e) { say('!! לא עודכן בצ׳אט: ' + e.message); return false; }
    say('צורף לאותה הודעה: ' + rec.text.slice(0, 60));
    if (attach && group.isAudio(attach)) {
      transcribeLater(path.join(DROP, attach), held.name);
    }
    return true;
  }

  const files = attach ? [attach] : [];
  const text = attach ? group.groupText(caption, files) : caption;
  if (!text) return false;
  const at = new Date();
  const name = chatName(at);
  const rec = { at: at.toISOString(), from: 'itzik', text: text, status: 'working',
    ackAt: at.toISOString(), id: 'ntfy-' + m.id, auto: true };
  if (files.length) rec.files = files.slice();
  try {
    fs.mkdirSync(CHAT, { recursive: true });
    fs.writeFileSync(path.join(CHAT, name), JSON.stringify(rec, null, 1), 'utf8');
    say('נרשם בצ׳אט עם אישור קבלה: ' + text.slice(0, 60));
    if (gid) groupFiles.set(gid, { name: name, files: files, caption: caption.trim() });
    if (attach && group.isAudio(attach)) {
      transcribeLater(path.join(DROP, attach), name);
    }
    return true;
  } catch (e) { say('!! לא נרשם בצ׳אט: ' + e.message); return false; }
}

/*
  What he said, on his screen, before anyone has answered him.

  Itzik, 17.9: "you said within three minutes I get an answer from the monitor.
  Why is that not happening." A recording used to reach the page as the line
  "voice note: voice-20260917075848.webm" and stayed that way until a session
  finished, which is between four and twelve minutes later. For all that time
  the page could not even show that the words had arrived, let alone which
  words, and a red line quoting a filename back at him is indistinguishable
  from a message that fell on the floor.

  Whisper needs about twenty seconds for a note of his length. That is cheap
  enough to spend here, and it buys two separate things: he sees his own
  sentence on the page within roughly half a minute, and the session that
  answers it is handed the text instead of a filename, so it no longer spends
  its own first minute transcribing.

  It runs detached from the stream on purpose. The listener must never block on
  it: a transcript that fails or takes too long costs the note nothing, because
  the record is already written and the session can still transcribe for
  itself.
*/
function transcribeLater(audio, file) {
  const started = Date.now();
  execFile('node', ['transcribe.js', audio], { cwd: __dirname, timeout: 180000 },
    function (err, out) {
      const text = String(out || '').trim().split(String.fromCharCode(10)).filter(Boolean).pop() || '';
      if (err || !text || /^\(/.test(text)) {
        say('!! תמלול מיידי נכשל: ' + path.basename(audio));
        return;
      }
      const full = path.join(CHAT, file);
      let rec;
      try { rec = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { return; }
      // Never overwrite an answer. If a session already got here and closed the
      // message, its transcript is the one that was acted on.
      if (rec.note || rec.status === 'done') return;
      rec.note = 'תמלול: ' + text;
      try { fs.writeFileSync(full, JSON.stringify(rec, null, 1), 'utf8'); } catch (e) { return; }
      say('תומלל ב' + Math.round((Date.now() - started) / 1000) + ' שניות: ' + text.slice(0, 60));
      publishChat();
    });
}
let publishing = false, publishAgain = false;
function publishChat() {
  if (publishing) { publishAgain = true; return; }
  publishing = true;
  execFile('node', ['build.js'], { cwd: __dirname, timeout: 120000 }, function (err, out) {
    if (err) { say('!! build נכשל: ' + String(out).slice(0, 120)); return finish(); }
    git(['add', '--', 'data/chat', 'docs'], function () {
      git(['commit', '-m', 'listener: received, working on it'], function (err2, out2) {
        if (/nothing to commit/i.test(out2)) return finish();
        if (err2) { say('!! commit נכשל: ' + out2.trim().slice(0, 120)); return finish(); }
        git(['push'], function (err3) {
          if (!err3) { say('אישור הקבלה פורסם לדף'); return finish(); }
          git(['pull', '--rebase', '--autostash'], function () {
            git(['push'], function (err4) {
              say(err4 ? '!! פרסום אישור הקבלה נכשל' : 'אישור הקבלה פורסם לדף (אחרי rebase)');
              finish();
            });
          });
        });
      });
    });
  });
  function finish() {
    publishing = false;
    if (publishAgain) { publishAgain = false; publishChat(); }
  }
}

async function handle(m) {
  const seen = mark();
  if (m.time === seen.time && seen.ids.includes(m.id)) return;
  received++;
  lastMsgAt = Date.now();
  say('הודעה: ' + String(m.message || '(צרופה)').slice(0, 80));
  if (m.attachment) await saveAttachment(m);
  if (m.message) logPull('text', m.message);
  const routed = await codexRoute.route(m, codexBridge);
  if (routed.matched) {
    say(routed.duplicate ? 'בקשת קודקס כבר נמסרה: ' + routed.sourceId
      : 'בקשת קודקס נמסרה לשיחה: ' + routed.sourceId);
  } else if (recordIncoming(m)) {
    publishChat();
  }
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

// Whatever could not go out while the channels were down is retried on the
// same clock as the pulse. Nothing here shouts: if it still cannot go out it
// stays on the queue and the count travels on the next beat.
async function drainQueue() {
  try {
    const before = ch.queueLength();
    if (!before) return;
    const r = await ch.drain();
    if (r.sent) say('נשלחו ' + r.sent + ' הודעות שהמתינו בתור. נשארו ' + r.left + '.');
  } catch (e) { /* the queue survives to the next round */ }
}

/*
  Only ever one of me.

  There are two things that start this now, a scheduled task and a shortcut in
  the Startup folder, and for a while both were live at once. Two listeners
  means two pulses, two sets of commits and twice the spend against the daily
  allowance, which is the exact shape of the fault that started all of this. A
  lock file settles it: the second one to arrive says so and leaves.

  The lock holds a pid, so a lock left behind by a process that was killed is
  recognised as stale rather than blocking the restart forever.
*/
const LOCK = path.join(STATUS, 'listen.lock');
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function claimLock() {
  try {
    const held = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    if (held.pid && held.pid !== process.pid && alive(held.pid)) return false;
  } catch (e) { /* no lock, or an unreadable one: take it */ }
  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8');
  return true;
}
function releaseLock() {
  try {
    const held = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    if (held.pid === process.pid) fs.unlinkSync(LOCK);
  } catch (e) { /* nothing to release */ }
}
['exit', 'SIGINT', 'SIGTERM'].forEach(function (sig) {
  process.on(sig, function () { releaseLock(); if (sig !== 'exit') process.exit(0); });
});

module.exports = { recordIncoming, isSystemText };

/*
  Requiring this file must not open a connection or claim the lock. A test that
  exercises the merge would otherwise become a second listener.
*/
if (require.main === module) (async () => {
  if (!claimLock()) {
    say('מאזין אחר כבר רץ. יוצא בלי לעשות כלום.');
    return;
  }
  try {
    const mailbox = await codexBridge.ensureMailbox();
    say(mailbox.started ? 'תיבת קודקס הופעלה מחדש.' : 'תיבת קודקס מחוברת.');
  } catch (e) {
    // Keep listening even if Codex is temporarily unavailable. An explicitly
    // addressed request will remain unseen by remember() and retry after the
    // stream reconnects.
    say('!! תיבת קודקס לא זמינה: ' + e.message);
  }
  setInterval(beat, BEAT_MS);
  setInterval(drainQueue, BEAT_MS);
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
