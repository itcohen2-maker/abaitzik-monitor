'use strict';
/*
  24.10.2026, stage 6 (Web Push). The server side: keeps the phone subscriptions and
  sends one notification to every subscribed phone.

  The keys come from the environment (VAPID_PUBLIC, VAPID_PRIVATE). Without both the
  channel is off and notify-channels.js never offers it. setup/vapid.md says how to
  make them once. The web-push package is loaded only when a send happens, so the
  rest of the monitor, and the tests, run without it installed.

  A subscription arrives from the page as one line "מנוי התראות: {...}" inside a
  normal send (the kind line, the words, a blank line and the code), and listen.js
  stores it here instead of passing it to Claude. Whoever holds a subscription gets
  every notification, so listen.js checks the owner code before it saves one.
*/
const fs = require('fs');
const path = require('path');
const inst = require('./instance.js');

const PREFIX = 'מנוי התראות:';
const MAX_BODY = 500; // a push payload is capped at 4KB; the rest of a long answer stays in the chat

function subsPath() { return path.join(inst.dataPath, 'push', 'subs.json'); }

function keys() {
  return { pub: process.env.VAPID_PUBLIC || '', priv: process.env.VAPID_PRIVATE || '' };
}
function enabled() { const k = keys(); return !!(k.pub && k.priv); }

// No file yet means no phone has subscribed: an empty list, not an error. A file
// that exists but does not parse is an error and is thrown to the caller.
function readSubs() {
  let raw;
  try { raw = fs.readFileSync(subsPath(), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('push: subs.json is not a list');
  return list;
}
function writeSubs(list) {
  fs.mkdirSync(path.dirname(subsPath()), { recursive: true });
  fs.writeFileSync(subsPath(), JSON.stringify(list, null, 1), 'utf8');
}
function count() { return readSubs().length; }
function ready() { return enabled() && count() > 0; }

// Checks one subscription as the browser made it. Returns { sub } or { error }.
function check(sub) {
  if (!sub || typeof sub !== 'object') return { error: 'not an object' };
  const endpoint = String(sub.endpoint || '');
  if (!/^https:\/\/\S+$/.test(endpoint)) return { error: 'endpoint is not an https address' };
  const k = sub.keys || {};
  if (!k.p256dh || !k.auth) return { error: 'keys are missing' };
  return { sub: { endpoint: endpoint, keys: { p256dh: String(k.p256dh), auth: String(k.auth) } } };
}

// Reads the subscription line out of a message body. Returns null when the message
// has no such line, { sub } when it is valid, and { error } when the line is broken.
function fromMessage(text) {
  const line = String(text || '').split('\n').map(function (l) { return l.trim(); })
    .find(function (l) { return l.startsWith(PREFIX); });
  if (!line) return null;
  let parsed;
  try { parsed = JSON.parse(line.slice(PREFIX.length).trim()); }
  catch (e) { return { error: 'the JSON does not parse: ' + e.message }; }
  return check(parsed);
}

// One entry per phone: a second subscription from the same browser replaces the first.
function saveSub(sub) {
  const list = readSubs().filter(function (s) { return s.endpoint !== sub.endpoint; });
  list.push(Object.assign({ at: new Date().toISOString() }, sub));
  writeSubs(list);
  return list.length;
}
function dropSub(endpoint) {
  writeSubs(readSubs().filter(function (s) { return s.endpoint !== endpoint; }));
}

// The JSON the service worker reads. The click link is used only when it is https.
function payloadFor(title, body, opts) {
  const o = opts || {};
  const p = {
    title: String(title || 'המוניטור'),
    body: String(body || '').slice(0, MAX_BODY),
    url: /^https:\/\//.test(String(o.click || '')) ? String(o.click) : inst.publicUrl,
  };
  if (o.tag) p.tag = String(o.tag);
  if (typeof o.badge === 'number') p.badge = o.badge;
  return JSON.stringify(p);
}

// web-push is loaded here, not at the top, so a missing package is one clear error
// on the channel instead of a crash of the whole monitor.
function loadLib() {
  try { return require('web-push'); }
  catch (e) { throw new Error('push: web-push is not available (npm install, see setup/vapid.md): ' + e.message); }
}

/*
  Sends one notification to every subscribed phone. A phone that answers 404 or 410
  has removed its subscription, so it is dropped. Any other refusal is logged with its
  status. The call succeeds when at least one phone got it, and throws otherwise, so
  the caller can fall back to the next channel. The error carries the first status.
*/
async function sendAll(title, body, opts) {
  const wp = loadLib();
  const list = readSubs();
  if (!list.length) throw new Error('push: no subscribed phone');
  const k = keys();
  if (!k.pub || !k.priv) throw new Error('push: VAPID_PUBLIC or VAPID_PRIVATE is not set');
  wp.setVapidDetails(inst.publicUrl, k.pub, k.priv);
  const payload = payloadFor(title, body, opts);
  let sent = 0;
  const failures = [];
  // One at a time: a dropped phone rewrites the list, and two writes at once would lose one.
  for (const s of list) {
    try {
      await wp.sendNotification(s, payload, { TTL: 3600, urgency: 'high' });
      sent++;
    } catch (e) {
      failures.push(e);
      if (e.statusCode === 404 || e.statusCode === 410) {
        dropSub(s.endpoint);
        console.warn('push: a phone removed its subscription (' + e.statusCode + '), it is dropped');
      } else {
        console.warn('push: refused with ' + (e.statusCode || 'no status') + ': ' + e.message);
      }
    }
  }
  if (sent === 0) {
    const err = new Error('push: 0 of ' + list.length + ' phones reached');
    err.statusCode = failures.length ? failures[0].statusCode : undefined;
    throw err;
  }
  return { sent: sent, failed: failures.length };
}

module.exports = {
  PREFIX, enabled, ready, count, check, fromMessage, saveSub, dropSub,
  readSubs, payloadFor, sendAll, subsPath,
};
