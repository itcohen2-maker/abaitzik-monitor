'use strict';
/*
  One way out, with a budget it can count.

  13.9.2026: both notification channels went down inside an hour and nobody
  knew until Itzik asked why the monitor had fallen. Two separate faults with
  the same shape.

  ntfy: a heartbeat I added published every sixty seconds and burned the free
  daily quota. Every send from this machine shares that quota, so the
  indicator killed the notifications.

  FormSubmit: hit its own daily cap independently, and it had always been the
  fallback for exactly this.

  Neither failure was visible. Both callers fired and forgot, so a refusal
  looked identical to a delivery. That is the part being fixed here, not just
  the counting: a message that cannot go out is written to a queue and retried,
  and the caller is told the truth about what happened to it.

  Caps below are deliberately under the real limits, so we run out of budget
  before the service runs out of patience and we can see it coming.
*/
const fs = require('fs');
const path = require('path');

const STATUS = path.join(__dirname, '..', 'data', 'status');
const QUOTA = path.join(STATUS, 'quota.json');
const QUEUE = path.join(STATUS, 'undelivered.json');

// ntfy free is about 250 a day per address; FormSubmit does not publish a
// number, so its cap is a guess kept small on purpose.
/*
  Two channels for reaching him, and a third line that is not a channel at all.

  `beat` is the listener's own pulse. It shares ntfy's address and therefore
  ntfy's daily allowance, which is how 132 pulses took the notifications down
  on 13.9. It gets its own small ration here so it can never again spend what
  the notifications need: when the pulse runs out of ration it simply stops
  pulsing, and the page falls back to the file on our own origin.
*/
const CHANNELS = {
  ntfy: { cap: 150, capPaid: 5000, label: 'ntfy' },
  mail: { cap: 40, label: 'מייל' },
  beat: { cap: 30, capPaid: 1500, label: 'פעימה' }
};
function capOf(k) {
  const c = CHANNELS[k];
  return (paid() && c.capPaid) ? c.capPaid : c.cap;
}

const NTFY_TOPIC = 'abaitzik-cf9044bdcfa8';
const MAILBOX = ['itcohen2', 'gmail.com'].join('@');

/*
  The paid account, when there is one.

  Itzik chose on 13.9 to pay for ntfy rather than keep living under the free
  daily allowance. The token is his and it never touches this repository: it
  is read from data/ntfy-token.txt, which is gitignored like the topic file
  beside it. Nothing here creates or pays for anything.

  With a token present every send is attributed to his account instead of to
  this machine's address, which is what lifts the cap. The local budget stays
  in place anyway, just far higher: a runaway loop should still hit a wall of
  ours before it hits a wall of theirs. That is the whole lesson of today.
*/
const TOKEN_FILE = path.join(__dirname, '..', 'data', 'ntfy-token.txt');
function token() {
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) { return ''; }
}
function paid() { return !!token(); }
function authHeaders() {
  const t = token();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
}

function today() { return new Date().toISOString().slice(0, 10); }
function readJson(p, d) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; }
}
function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 1), 'utf8');
}

function state() {
  const s = readJson(QUOTA, {});
  if (s.day !== today()) return { day: today(), used: {}, blocked: {} };
  return s;
}
function save(s) { writeJson(QUOTA, s); }

// What is left today, per channel, and why a channel is out if it is.
function budget() {
  const s = state();
  const out = {};
  for (const k of Object.keys(CHANNELS)) {
    const used = s.used[k] || 0;
    const until = s.blocked[k] || 0;
    out[k] = {
      label: CHANNELS[k].label,
      used: used,
      cap: capOf(k),
      left: Math.max(0, capOf(k) - used),
      paid: paid(),
      blockedUntil: until > Date.now() ? new Date(until).toISOString() : '',
      // True once the service has refused twice: the wait is until the day
      // turns over, not until the backoff we happen to be sitting in.
      daily: !!((s.daily || {})[k]) && until > Date.now()
    };
  }
  return out;
}

function spend(k) {
  const s = state();
  s.used[k] = (s.used[k] || 0) + 1;
  // It answered, so whatever we believed about it being walled off is stale.
  if (s.strikes) s.strikes[k] = 0;
  if (s.daily) delete s.daily[k];
  delete s.blocked[k];
  save(s);
}
/*
  A service that says no is taken at its word rather than argued with.

  The first version always stood down for exactly an hour and showed that hour
  on the screen. When the refusal is a daily quota rather than a burst limit,
  that hour keeps sliding: Itzik read "blocked until 21:42", waited, and found
  "blocked until 22:58". A time that moves every time you look at it is worse
  than no time at all.

  So a second refusal in a row is treated as what it is, a wall until the day
  turns over, and the screen is told to say that instead of a number it will
  have to take back.
*/
function block(k, ms) {
  const s = state();
  s.strikes = s.strikes || {};
  s.strikes[k] = (s.strikes[k] || 0) + 1;
  s.blocked[k] = Date.now() + (ms || 3600000);
  s.daily = s.daily || {};
  if (s.strikes[k] >= 2) s.daily[k] = true;
  save(s);
}
function usable(k) {
  const s = state();
  if ((s.blocked[k] || 0) > Date.now()) return false;
  return (s.used[k] || 0) < capOf(k);
}

/*
  A Hebrew title, readable on his phone.

  HTTP headers are latin-1, so a Hebrew title cannot travel as itself. The
  old line percent-encoded it, which is legal and unreadable: on 19.9 he got
  a screenful of notifications titled "%D7%94%D7%95%D7%93..." and had no idea
  what any of them were about until he opened them.

  RFC 2047 is the way a header carries other alphabets, and ntfy decodes it.
  ASCII titles are left alone so nothing that already worked changes.
*/
function headerTitle(title) {
  const t = String(title || '');
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(t)) return t;
  return '=?UTF-8?B?' + Buffer.from(t, 'utf8').toString('base64') + '?=';
}

async function viaNtfy(title, body) {
  const res = await fetch('https://ntfy.sh/' + NTFY_TOPIC, {
    method: 'POST',
    headers: Object.assign({ 'Title': headerTitle(title) },
      authHeaders()),
    body: body
  });
  if (res.status === 429) { block('ntfy'); throw new Error('ntfy 429 quota'); }
  if (!res.ok) throw new Error('ntfy ' + res.status);
  spend('ntfy');
}

async function viaMail(title, body) {
  const payload = JSON.stringify({ _subject: title, name: 'המוניטור', message: body });
  const res = await fetch('https://formsubmit.co/ajax/' + MAILBOX, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://itcohen2-maker.github.io',
      'Referer': 'https://itcohen2-maker.github.io/abaitzik-monitor/'
    },
    body: payload
  });
  const text = await res.text();
  if (res.status === 429 || /rate limit/i.test(text)) {
    block('mail'); throw new Error('formsubmit 429 quota');
  }
  if (!res.ok) throw new Error('formsubmit ' + res.status);
  spend('mail');
}

const NTFY_LIVE = 'abaitzik-in-95e62e86c34f4853-live';
async function viaBeat(title, body) {
  const res = await fetch('https://ntfy.sh/' + NTFY_LIVE, {
    method: 'POST',
    headers: Object.assign({ 'Priority': 'min', 'Title': 'live', 'X-Tags': 'none' },
      authHeaders()),
    body: body
  });
  if (res.status === 429) { block('beat'); throw new Error('ntfy 429 quota'); }
  if (!res.ok) throw new Error('ntfy ' + res.status);
  spend('beat');
}

const SENDERS = { ntfy: viaNtfy, mail: viaMail, beat: viaBeat };

// The pulse, budgeted. Returns false when there is no ration left, which is a
// normal state and not an error: the page reads the file instead.
async function pulse(body) {
  if (!usable('beat')) return false;
  try { await viaBeat('live', body); return true; } catch (e) { return false; }
}

function queueAdd(title, body) {
  const q = readJson(QUEUE, []);
  q.push({ at: new Date().toISOString(), title: title, body: body, tries: 0 });
  writeJson(QUEUE, q.slice(-200));
}

/*
  Send, and say what really happened.

  Returns { ok, channel, tried } and never throws at the caller: a caller that
  has to remember to check an exception is a caller that will forget, which is
  how this whole failure started. When nothing gets through the message goes on
  the queue instead of into the air, and drain() picks it up later.
*/
async function notify(title, body) {
  const tried = [];
  for (const k of ['ntfy', 'mail']) {
    if (!usable(k)) { tried.push(k + ':no budget'); continue; }
    /* jshint ignore:line */
    try {
      await SENDERS[k](title, body);
      return { ok: true, channel: k, tried: tried };
    } catch (e) {
      tried.push(k + ':' + e.message);
    }
  }
  queueAdd(title, body);
  return { ok: false, channel: '', tried: tried, queued: true };
}

// Anything that could not go out, retried when a channel comes back. Kept
// small and quiet: three failed attempts and it stays on the queue for a human
// rather than looping forever.
async function drain() {
  const q = readJson(QUEUE, []);
  if (!q.length) return { sent: 0, left: 0 };
  const left = [];
  let sent = 0;
  for (const m of q) {
    if (m.tries >= 3) { left.push(m); continue; }
    const r = await notifyOnce(m.title, m.body);
    if (r.ok) sent++;
    else { m.tries++; left.push(m); }
  }
  writeJson(QUEUE, left);
  return { sent: sent, left: left.length };
}

// The same as notify() but without re-queueing, so drain cannot grow the queue
// it is trying to empty.
async function notifyOnce(title, body) {
  for (const k of ['ntfy', 'mail']) {
    if (!usable(k)) continue;
    try {
      await SENDERS[k](title, body);
      return { ok: true, channel: k };
    } catch (e) { /* try the next channel */ }
  }
  return { ok: false, channel: '' };
}

module.exports = { notify, drain, budget, pulse, paid, queueLength: () => readJson(QUEUE, []).length };
