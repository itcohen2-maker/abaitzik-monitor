'use strict';
/*
  11.11.2026, Itzik: "בן אדם נרשם, מקבל קוד במייל ונכנס". The self signup for a trial monitor
  (plans/2026-11-11-self-signup-trial-sumit.md). Pure file logic, no network: wa-bridge.js calls start()
  and verify() and sends the mail itself (lib/mailer.js).

  data/signup/pending/<emailhash>.json  { name, phone, email, codeHash, exp, tries, at }   a code waits
  data/signup/queue/<id>.json           { id, name, phone, email, at, state:'queued' }    verified, waits for its monitor
  data/signup/limits.json               { ip: { <ip>: [times] }, email: { <hash>: [times] } }
  Codes are kept hashed only. A code lives 15 minutes and allows 5 tries.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CODE_MS = 15 * 60e3;
const TRIES = 5;
const PER_EMAIL_HOUR = 3;
const PER_IP_HOUR = 10;

function dir(dataPath, sub) { return path.join(dataPath, 'signup', sub || ''); }
function readJson(f, d) { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j && typeof j === 'object' ? j : d; } catch (e) { return d; } }
function writeJson(f, j) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(j, null, 1)); fs.renameSync(f + '.tmp', f); }
function hash(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function emailNorm(e) { return String(e || '').trim().toLowerCase(); }
function emailOk(e) { return /^[^\s@<>"']{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/.test(e); }
function phoneNorm(p) { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('972') ? '0' + d.slice(3) : d; }
function phoneOk(p) { return /^05\d{8}$/.test(p); }
function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }

// Sliding one hour window per key. Returns false when the key is over its limit (and does not count it).
function allow(dataPath, kind, key, max, now) {
  const f = dir(dataPath, 'limits.json');
  const j = readJson(f, {});
  j[kind] = j[kind] || {};
  const list = (j[kind][key] || []).filter((t) => now - t < 3600e3);
  if (list.length >= max) return false;
  list.push(now); j[kind][key] = list;
  // Drop keys with nothing left in the window, so the file stays small.
  for (const k of Object.keys(j[kind])) if (!(j[kind][k] || []).some((t) => now - t < 3600e3)) delete j[kind][k];
  writeJson(f, j);
  return true;
}

/*
  A new code for this person. Returns { ok:true, code, email, name } for the mailer (the code never goes back to the
  browser), or { ok:false, error } with error one of: name, phone, email, terms, limit.
*/
function start(dataPath, b, now) {
  const t = now || Date.now();
  const name = clean(b.name, 60), phone = phoneNorm(b.phone), email = emailNorm(b.email);
  if (name.length < 2) return { ok: false, error: 'name' };
  // 11.11, Itzik: a shorter signup, name and mail. The phone is optional; when given it must be a real mobile.
  if (phone && !phoneOk(phone)) return { ok: false, error: 'phone' };
  if (!emailOk(email)) return { ok: false, error: 'email' };
  if (b.terms !== true) return { ok: false, error: 'terms' };
  const eh = hash(email);
  if (!allow(dataPath, 'ip', String(b.ip || '-'), PER_IP_HOUR, t)) return { ok: false, error: 'limit' };
  if (!allow(dataPath, 'email', eh, PER_EMAIL_HOUR, t)) return { ok: false, error: 'limit' };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  writeJson(path.join(dir(dataPath, 'pending'), eh + '.json'), { name, phone, email, codeHash: hash(eh + ':' + code), exp: t + CODE_MS, tries: 0, at: new Date(t).toISOString() });
  return { ok: true, code, email, name };
}

// The trial's id: short, safe as a Linux user and a host name.
function newId() { return 't' + crypto.randomBytes(3).toString('hex'); }

/*
  Checks the code. { ok:true, id, fresh } puts the person in the queue (fresh false when that email was already queued,
  so a second click does not open a second monitor). Errors: code (wrong), expired, tries, none.
*/
function verify(dataPath, b, now) {
  const t = now || Date.now();
  const email = emailNorm(b.email), code = String(b.code || '').replace(/\D/g, '');
  const eh = hash(email);
  const f = path.join(dir(dataPath, 'pending'), eh + '.json');
  const p = readJson(f, null);
  if (!p) {
    const q = findQueued(dataPath, email);
    return q ? { ok: true, id: q.id, fresh: false } : { ok: false, error: 'none' };
  }
  if (t > p.exp) { try { fs.unlinkSync(f); } catch (e) {} return { ok: false, error: 'expired' }; }
  if (p.tries >= TRIES) { try { fs.unlinkSync(f); } catch (e) {} return { ok: false, error: 'tries' }; }
  const want = Buffer.from(p.codeHash), got = Buffer.from(hash(eh + ':' + code));
  if (code.length !== 6 || !crypto.timingSafeEqual(want, got)) {
    p.tries++;
    if (p.tries >= TRIES) { try { fs.unlinkSync(f); } catch (e) {} return { ok: false, error: 'tries' }; }
    writeJson(f, p);
    return { ok: false, error: 'code' };
  }
  try { fs.unlinkSync(f); } catch (e) {}
  // 11.11: a page token (pt) lets the signup page send the questionnaire and ask how the build goes. Only its hash is kept.
  const pt = crypto.randomBytes(16).toString('hex');
  const q = findQueued(dataPath, email);
  if (q) { const qf = path.join(dir(dataPath, 'queue'), q.id + '.json'); const qq = readJson(qf, q); qq.ptHash = hash('pt:' + pt); writeJson(qf, qq); return { ok: true, id: q.id, fresh: false, pt }; }
  const id = newId();
  writeJson(path.join(dir(dataPath, 'queue'), id + '.json'), { id, name: p.name, phone: p.phone, email, at: new Date(t).toISOString(), state: 'queued', ptHash: hash('pt:' + pt) });
  return { ok: true, id, fresh: true, name: p.name, phone: p.phone, email, pt };
}

// The queue entry behind a page token, or null.
function byToken(dataPath, b) {
  const id = String((b && b.id) || ''), pt = String((b && b.pt) || '');
  if (!/^t[a-f0-9]{6}$/.test(id) || !/^[a-f0-9]{32}$/.test(pt)) return null;
  const qf = path.join(dir(dataPath, 'queue'), id + '.json');
  const q = readJson(qf, null);
  if (!q || !q.ptHash) return null;
  const want = Buffer.from(q.ptHash), got = Buffer.from(hash('pt:' + pt));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  return { q, qf };
}

// 11.11: the questionnaire answers. Kept on the queue entry; signup-personalize.js turns them into his welcome.
function saveProfile(dataPath, b, now) {
  const r = byToken(dataPath, b);
  if (!r) return { ok: false, error: 'token' };
  const prof = require('./signup-profile.js').sanitize(b.answers);
  if (!prof) return { ok: false, error: 'empty' };
  r.q.profile = Object.assign(prof, { at: new Date(now || Date.now()).toISOString() });
  delete r.q.personalized;
  writeJson(r.qf, r.q);
  return { ok: true };
}

// 11.11: how the build goes, for the entry and connect buttons on the signup page.
function status(dataPath, b) {
  const r = byToken(dataPath, b);
  if (!r) return { ok: false, error: 'token' };
  const q = r.q, ready = q.state === 'ready' || q.state === 'mailfail';
  return { ok: true, state: q.state, ready, host: ready ? (q.host || q.id + '.m.it-solution.co.il') : '',
    setup: q.setup ? 'https://form.it-solution.co.il/s/' + q.setup : '' };
}

function findQueued(dataPath, email) {
  let names = [];
  try { names = fs.readdirSync(dir(dataPath, 'queue')).filter((x) => /^t[a-f0-9]{6}\.json$/.test(x)); } catch (e) { return null; }
  for (const n of names) { const q = readJson(path.join(dir(dataPath, 'queue'), n), null); if (q && q.email === email) return q; }
  return null;
}

module.exports = { start, verify, findQueued, saveProfile, status, emailOk, phoneNorm, phoneOk, CODE_MS, TRIES };
