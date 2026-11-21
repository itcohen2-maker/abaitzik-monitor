'use strict';
/*
  12.11.2026, Itzik: "כן, תבנה את החיבור המהיר". A customer with no Facebook connects his WhatsApp in 10 seconds:
  the 🔌 row opens wa.me/<shared number>?text=<the connect phrase with his code>, he presses send, and Itzik's
  bridge (wa-bridge.js) maps his phone to his own monitor.

  The code: base32(HMAC-SHA256(his fast chat key, "wa-quick:<tenant>")), 10 characters. His page already holds the
  key (data/fc-key.txt, D.fcKey) and the server keeps the same key in data/fastchat/tenants.json, so the page builds
  the link and the bridge resolves the tenant with no new secret and no stored table. 50 bits, not guessable
  without the key.

  Files (Itzik's instance data):
    data/wa-tenants-pending/<tenant>.json   { op: 'add'|'remove', tenant, phone, name, at }   bridge writes, root reads
    data/wa-tenants-done/<tenant>-<ts>.json the same plus doneAt / err, root moves it there
    data/wa-outbox/<id>.json                { to, text }  root writes, the bridge sweep sends (inside the 24 hour window)
    data/status/wa-unknown.json             { <phone>: { day, n } }  at most 3 replies a day to a number we do not know
  The customer's own data/conn/wa.json { phone, via: 'shared', at } tells his page it is connected (root writes it).
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WT = require('./wa-tenants.js');

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CODE_LEN = 10;
const MAX_REPLIES_PER_DAY = 3;
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const TENANT_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

function b32(buf, n) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5 && out.length < n) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; }
    val &= 0xff;
  }
  return out;
}
// The short code of a tenant, from his fast chat key. '' when either is missing.
function code(key, tenant) {
  if (typeof key !== 'string' || key.length < 16 || !TENANT_RE.test(String(tenant || ''))) return '';
  return b32(crypto.createHmac('sha256', key).update('wa-quick:' + tenant).digest(), CODE_LEN);
}
const PHRASE = 'היי, אני רוצה לחבר את הוואטסאפ שלי למוניטור. קוד: ';
function link(c) { return c ? 'https://wa.me/' + WT.SHARED_PHONE + '?text=' + encodeURIComponent(PHRASE + c) : ''; }

// Marks and direction characters WhatsApp or a keyboard may add around words.
const clean = (t) => String(t || '').replace(/[‎‏‪-‮⁦-⁩]/g, '');
// Does the message look like an attempt to connect (so a wrong code deserves one polite answer)?
function looksLikeConnect(text) { const t = clean(text); return /לחבר את הוואטסאפ|קוד\s*:/.test(t); }
// The code in the message, uppercase, or ''.
function parse(text) {
  const m = clean(text).match(/קוד\s*:?\s*([A-Za-z2-7]{10})(?![A-Za-z0-9])/);
  return m ? m[1].toUpperCase() : '';
}
function isDisconnect(text) { return /^\s*(?:ניתוק|תתנתק|להתנתק|תנתק אותי|תתנתקו)[.!\s]*$/.test(clean(text)); }

// The tenant a code belongs to, or ''. Every tenant key is tried, constant time per comparison.
function resolve(DATA, c) {
  c = String(c || '').toUpperCase();
  if (!/^[A-Z2-7]{10}$/.test(c)) return '';
  const fc = rd(path.join(DATA, 'fastchat', 'tenants.json'), {}) || {};
  let found = '';
  Object.keys(fc).forEach((t) => {
    const exp = code(fc[t] && fc[t].key, t);
    if (exp && crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(c)) && !found) found = t;
  });
  return found;
}

const pendDir = (DATA) => path.join(DATA, 'wa-tenants-pending');
function pendingOf(DATA, tenant) { return rd(path.join(pendDir(DATA), tenant + '.json'), null); }
// A phone waiting in another tenant's pending file.
function pendingPhoneOwner(DATA, phone) {
  let r = '';
  try { fs.readdirSync(pendDir(DATA)).forEach((f) => { const o = rd(path.join(pendDir(DATA), f), null); if (o && o.op !== 'remove' && o.phone === phone) r = o.tenant; }); } catch (e) { /* none */ }
  return r;
}
function writePending(DATA, rec) {
  if (!TENANT_RE.test(String(rec.tenant || ''))) throw new Error('bad tenant');
  fs.mkdirSync(pendDir(DATA), { recursive: true });
  const f = path.join(pendDir(DATA), rec.tenant + '.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(Object.assign({ at: new Date().toISOString() }, rec), null, 1), { mode: 0o600 });
  fs.renameSync(f + '.tmp', f);
  return f;
}

// Per number: at most 3 replies a day to a sender we do not know. Returns true when one more reply is allowed (and counts it).
function allowReply(DATA, phone, now) {
  const f = path.join(DATA, 'status', 'wa-unknown.json');
  const day = new Date(now || Date.now()).toISOString().slice(0, 10);
  let o = rd(f, {}) || {};
  const r = o[phone] && o[phone].day === day ? o[phone] : { day, n: 0 };
  if (r.n >= MAX_REPLIES_PER_DAY) return false;
  r.n++;
  o[phone] = r;
  Object.keys(o).forEach((k) => { if (o[k].day !== day) delete o[k]; });
  if (Object.keys(o).length > 2000) o = { [phone]: r };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o), { mode: 0o600 });
  fs.renameSync(f + '.tmp', f);
  return true;
}

// 052 ••• 4881 for 972528074881
function mask(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!/^9725\d{8}$/.test(d)) return '';
  return '0' + d.slice(3, 5) + ' ••• ' + d.slice(-4);
}

function outbox(DATA, to, text) {
  const dir = path.join(DATA, 'wa-outbox');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex') + '.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify({ to, text }), { mode: 0o660 });
  fs.renameSync(f + '.tmp', f);
  return f;
}

module.exports = { code, link, parse, resolve, isDisconnect, looksLikeConnect, pendingOf, pendingPhoneOwner, writePending, allowReply, mask, outbox, PHRASE, pendDir, TENANT_RE };
