'use strict';
/*
  21.11.2026 security review: the trade launch price is decided by a token the server issues (wa-bridge GET /api/day/token,
  answered only to the it-solution.co.il origin), never by the ref text a client types. The token is HMAC-signed with a
  per-install secret (DATA/day-secret.key, created once), lives two hours, and is checked again at signup.
  Honest limit: a client that can call the endpoint with the right Origin gets a token. The check raises the bar; it is
  not proof that a person used the page.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TTL = 2 * 3600e3;
const SKEW = 60e3;

function secret(DATA) { return require('./secret-key.js').loadKey(DATA, 'day-secret.key'); }
function mac(DATA, ts) { return crypto.createHmac('sha256', secret(DATA)).update('day:' + ts).digest('hex'); }

function issue(DATA, now) {
  const ts = String(now == null ? Date.now() : now);
  return ts + '.' + mac(DATA, ts);
}
function verify(DATA, tok, now) {
  try { return verifyStrict(DATA, tok, now); } catch (e) { return false; }
}
function verifyStrict(DATA, tok, now) {
  const m = /^(\d{10,16})\.([a-f0-9]{64})$/.exec(String(tok || ''));
  if (!m) return false;
  const t = now == null ? Date.now() : now, ts = Number(m[1]);
  if (t - ts > TTL || ts - t > SKEW) return false;
  const exp = Buffer.from(mac(DATA, m[1]));
  const got = Buffer.from(m[2]);
  return exp.length === got.length && crypto.timingSafeEqual(exp, got);
}

module.exports = { TTL, issue, verify };
