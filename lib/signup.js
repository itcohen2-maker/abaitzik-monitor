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
// 12.11.2026: hagitit7@gmail.con got a code that could never arrive. A known typo in the ending, or in a big
// provider's name, is refused, so the page says the address looks wrong before a code goes nowhere.
const TYPO = /\.(con|cmo|ocm|vom|xom|comm|cm|om|co\.il\.com)$|@(g?mial|gmai|gamil|gmal|gnail|gmaill|gmail\.co|gmail\.cm|gmail\.om|hotmial|hotmail\.con|yahooo|walla\.co\.l|walla\.com)(\.|$)/;
// 17.11.2026: hagitit7@gmail..com passed and its code went nowhere. Two dots in a row, or a dot or dash at the edge
// of the domain or of the name, is refused too.
const BAD_DOTS = /\.\.|^\.|\.@|@[.-]|-\.|\.-/;
function emailOk(e) { return /^[^\s@<>"']{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/.test(e) && !TYPO.test(e) && !BAD_DOTS.test(e); }
function phoneNorm(p) { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('972') ? '0' + d.slice(3) : d; }
function phoneOk(p) { return /^05\d{8}$/.test(p); }
// 12.11, Itzik: a referrer's tag (shai) from ?ref= on /start. Lowercase letters, digits, - and _ only.
function refNorm(r) { r = String(r || '').trim().toLowerCase(); return /^[a-z0-9_-]{1,24}$/.test(r) ? r : ''; }
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
  // 17.11.2026, Itzik: the phone is required again (Noam asks it too), so a trial that never came in can get a call.
  if (!phone || !phoneOk(phone)) return { ok: false, error: 'phone' };
  if (!emailOk(email)) return { ok: false, error: 'email' };
  if (b.terms !== true) return { ok: false, error: 'terms' };
  const eh = hash(email);
  if (!allow(dataPath, 'ip', String(b.ip || '-'), PER_IP_HOUR, t)) return { ok: false, error: 'limit' };
  if (!allow(dataPath, 'email', eh, PER_EMAIL_HOUR, t)) return { ok: false, error: 'limit' };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  writeJson(path.join(dir(dataPath, 'pending'), eh + '.json'), { name, phone, email, codeHash: hash(eh + ':' + code), exp: t + CODE_MS, tries: 0, at: new Date(t).toISOString(), ref: refNorm(b.ref) });
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
  writeJson(path.join(dir(dataPath, 'queue'), id + '.json'), { id, name: p.name, phone: p.phone, email, at: new Date(t).toISOString(), state: 'queued', ptHash: hash('pt:' + pt), ref: p.ref || '' });
  if (p.ref) refCount(dataPath, p.ref, 'signups', t, { id, name: p.name, email });
  return { ok: true, id, fresh: true, name: p.name, phone: p.phone, email, pt, ref: p.ref || '' };
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

/*
  17.11.2026, the short signup (four questions on /start). The other questions are asked inside the monitor, in the
  "🚀 בוא נתחיל" card (build.js firstSteps), from the page's visit key. ask: which of them have no answer yet.
  save: the new answers merge into the same queue profile, and signup-personalize.js applies them within a minute
  (personal tiles, the morning reminder, the answer style, profile.md), exactly as answers given at signup.
*/
const MORE = ['bizName', 'team', 'from', 'tools', 'start', 'style', 'personal'];
function moreProfile(dataPath, tenant, b, now) {
  if (!/^t[a-f0-9]{6}$/.test(String(tenant || ''))) return { ok: false, error: 'tenant' };
  const qf = path.join(dir(dataPath, 'queue'), tenant + '.json');
  const q = readJson(qf, null);
  if (!q) return { ok: true, ask: [] }; // not a self signup: nothing to ask
  const p = q.profile || {};
  const has = (k) => (Array.isArray(p[k]) ? p[k].length > 0 : !!p[k]) || (p.moreSkipped || []).indexOf(k) >= 0;
  // a skip alone (no answers) is saved too, else the skipped question came back on the next open (17.11, found in the test)
  if (!b || (!b.answers && !Array.isArray(b.skipped))) return { ok: true, ask: MORE.filter((k) => !has(k)) };
  const a = {}; MORE.forEach((k) => { if (b.answers && b.answers[k] != null) a[k] = b.answers[k]; });
  const merged = require('./signup-profile.js').sanitize(Object.assign({}, p, a)) || {};
  const skipped = Array.from(new Set([].concat(p.moreSkipped || [], (Array.isArray(b.skipped) ? b.skipped : []).filter((k) => MORE.indexOf(k) >= 0))));
  q.profile = Object.assign({}, p, merged, { moreSkipped: skipped, at: new Date(now || Date.now()).toISOString() });
  delete q.personalized;
  writeJson(qf, q);
  return { ok: true, ask: MORE.filter((k) => !((Array.isArray(q.profile[k]) ? q.profile[k].length > 0 : !!q.profile[k]) || skipped.indexOf(k) >= 0)) };
}

// 11.11: how the build goes, for the entry and connect buttons on the signup page.
function status(dataPath, b) {
  const r = byToken(dataPath, b);
  if (!r) return { ok: false, error: 'token' };
  const q = r.q, ready = q.state === 'ready' || q.state === 'mailfail';
  const host = ready ? (q.host || q.id + '.m.it-solution.co.il') : '';
  // 17.11.2026: the personal link (#k=) goes only to the page holding this signup's token, and only once it is ready.
  const enter = ready && q.enter ? 'https://' + host + '/#k=' + encodeURIComponent(q.enter) : '';
  return { ok: true, state: q.state, ready, host, enter,
    setup: q.setup ? 'https://form.it-solution.co.il/s/' + q.setup : '' };
}

function findQueued(dataPath, email) {
  let names = [];
  try { names = fs.readdirSync(dir(dataPath, 'queue')).filter((x) => /^t[a-f0-9]{6}\.json$/.test(x)); } catch (e) { return null; }
  // 17.11.2026: a removed trial (setup/remove-trial.sh marks it removed) no longer counts, so the same mail can start over.
  for (const n of names) { const q = readJson(path.join(dir(dataPath, 'queue'), n), null); if (q && q.email === email && q.state !== 'removed') return q; }
  return null;
}

/*
  12.11: the referral tracker. data/signup/refs/<ref>.json { ref, visits, signups, days:{YYYY-MM-DD:{visits,signups}}, people:[...] }.
  A visit is one browser once a day (the page sends it once per day from localStorage), so it is a rough count, not a fingerprint.
*/
function refCount(dataPath, ref, kind, now, person) {
  ref = refNorm(ref); if (!ref) return null;
  const f = path.join(dir(dataPath, 'refs'), ref + '.json');
  const j = readJson(f, { ref, visits: 0, signups: 0, days: {}, people: [] });
  const day = new Date(now || Date.now()).toISOString().slice(0, 10);
  j[kind] = (j[kind] || 0) + 1;
  j.days[day] = j.days[day] || { visits: 0, signups: 0 }; j.days[day][kind]++;
  if (person) j.people.push(Object.assign({ at: new Date(now || Date.now()).toISOString() }, person));
  j.last = new Date(now || Date.now()).toISOString();
  writeJson(f, j); return j;
}
function refVisit(dataPath, b, now) {
  const ref = refNorm(b.ref); if (!ref) return { ok: false, error: 'ref' };
  if (!allow(dataPath, 'refip', String(b.ip || '-') + ':' + ref, 20, now || Date.now())) return { ok: true };
  refCount(dataPath, ref, 'visits', now); return { ok: true };
}

module.exports = { moreProfile, MORE, refNorm, refCount, refVisit, start, verify, findQueued, saveProfile, status, emailOk, phoneNorm, phoneOk, CODE_MS, TRIES };
