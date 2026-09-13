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
const CHANNELS = {
  ntfy: { cap: 180, label: 'ntfy' },
  mail: { cap: 40, label: 'מייל' }
};

const NTFY_TOPIC = 'abaitzik-cf9044bdcfa8';
const MAILBOX = ['itcohen2', 'gmail.com'].join('@');

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
      cap: CHANNELS[k].cap,
      left: Math.max(0, CHANNELS[k].cap - used),
      blockedUntil: until > Date.now() ? new Date(until).toISOString() : ''
    };
  }
  return out;
}

function spend(k) {
  const s = state();
  s.used[k] = (s.used[k] || 0) + 1;
  save(s);
}
// A service that says no is taken at its word for an hour rather than argued
// with, and the fact is written down so the screen can show it.
function block(k, ms) {
  const s = state();
  s.blocked[k] = Date.now() + (ms || 3600000);
  save(s);
}
function usable(k) {
  const s = state();
  if ((s.blocked[k] || 0) > Date.now()) return false;
  return (s.used[k] || 0) < CHANNELS[k].cap;
}

async function viaNtfy(title, body) {
  const res = await fetch('https://ntfy.sh/' + NTFY_TOPIC, {
    method: 'POST',
    headers: { 'Title': encodeURIComponent(title).replace(/%20/g, ' ') },
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

const SENDERS = { ntfy: viaNtfy, mail: viaMail };

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

module.exports = { notify, drain, budget, queueLength: () => readJson(QUEUE, []).length };
