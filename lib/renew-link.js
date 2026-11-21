'use strict';
/*
  21.11.2026: the renewal pay link (chat, WhatsApp). HMAC over the tenant and the issue time, 72 hours, a secret of its own
  (DATA/renew-secret.key, created once by the bridge, mode 0600). The link only starts a renewal order for that tenant
  (lib/pay-day.js renewStart); the payment itself is checked in finish, as for every other payment.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TTL = 72 * 3600e3;
const SKEW = 60e3;
const BASE = 'https://wa.abaitzik.com/api/pay/renew/';

function secret(DATA) { return require('./secret-key.js').loadKey(DATA, 'renew-secret.key'); }
function mac(DATA, tenant, ts) { return crypto.createHmac('sha256', secret(DATA)).update('renew:' + tenant + ':' + ts).digest('hex'); }

function issue(DATA, tenant, now) {
  if (!/^[a-z0-9-]+$/.test(String(tenant || ''))) throw new Error('bad tenant');
  const ts = String(now == null ? Date.now() : now);
  return tenant + '.' + ts + '.' + mac(DATA, tenant, ts);
}
// The tenant the link is for, or null (expired, forged, from another install, malformed).
function verify(DATA, tok, now) {
  try { return verifyStrict(DATA, tok, now); } catch (e) { return null; }
}
function verifyStrict(DATA, tok, now) {
  const m = /^([a-z0-9-]+)\.(\d{10,16})\.([a-f0-9]{64})$/.exec(String(tok || ''));
  if (!m) return null;
  const t = now == null ? Date.now() : now, ts = Number(m[2]);
  if (t - ts > TTL || ts - t > SKEW) return null;
  const exp = Buffer.from(mac(DATA, m[1], m[2]));
  const got = Buffer.from(m[3]);
  return exp.length === got.length && crypto.timingSafeEqual(exp, got) ? m[1] : null;
}
function url(DATA, tenant, now) { return BASE + issue(DATA, tenant, now); }

module.exports = { TTL, BASE, issue, verify, url };
