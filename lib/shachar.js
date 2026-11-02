'use strict';
/*
  The Shachar tile (31.10.2026): inviting closed beta testers.

  The page docs/shachar/index.html sends one ntfy message per tap, signed with the owner code:
    Title shachar-invite   {email, note, code}   invite one person
    Title shachar-refresh  {code}                reload the waitlist
  listen.js hands them here. An invite is POSTed to https://shachar.abaitzik.com/api/admin/invite with
  the CRON_SECRET read from a server only file; the waitlist comes from GET /api/admin/waitlist.
  The invitation letter (1.11): one tap on the page approves the email AND the letter. With a Forward Email API
  token in MAIL_TOKEN_FILE the letter is delivered from shachar@abaitzik.com right here (letter 'sent'). Without it
  no mail leaves the server: the page opens the Gmail draft in the same tap and says so (letter.draft, 'draft').
  Refresh and every invite also read GET /api/admin/invite, so invites made straight through the API show as invited.

  State, private (data/ is gitignored): data/shachar/state.json
    { invites: [{email, note, at, status: 'invited' | 'pending', letterAt?, letterMode?: 'sent' | 'draft', letterErr?}], mailAuto, waitlist: [{email, created_at, invited}], waitlistAt }
  build.js seals it with the gate into docs/data/shachar.json, so no email is ever published in clear.

  Retry safe: while the endpoint is not deployed (404) or the secret is missing, an invite stays
  'pending'. Every later invite or refresh retries all pending ones, and so does the page's "נסה שוב".
*/
const fs = require('fs');
const path = require('path');

const BASE = 'https://shachar.abaitzik.com';
const SECRET_FILE = '/home/monitor/.shachar-cron-secret';
const MAIL_TOKEN_FILE = '/home/monitor/.shachar-mail-token';
const MAIL_API = 'https://api.forwardemail.net/v1/emails';
const MAIL_FROM = 'שחר <shachar@abaitzik.com>';
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function statePath(dir) { return path.join(dir, 'shachar', 'state.json'); }
function load(dir) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(dir), 'utf8'));
    return { invites: Array.isArray(s.invites) ? s.invites : [], waitlist: Array.isArray(s.waitlist) ? s.waitlist : [], waitlistAt: s.waitlistAt || null, mailAuto: !!s.mailAuto, feedback: s.feedback && typeof s.feedback === "object" ? s.feedback : null, usage: s.usage && typeof s.usage === "object" ? s.usage : null };
  } catch (e) { return { invites: [], waitlist: [], waitlistAt: null, mailAuto: false }; }
}
function save(dir, s) {
  fs.mkdirSync(path.dirname(statePath(dir)), { recursive: true });
  fs.writeFileSync(statePath(dir), JSON.stringify(s, null, 1), { encoding: 'utf8', mode: 0o600 });
}
function readSecret(file) {
  try { return fs.readFileSync(file, 'utf8').trim() || null; } catch (e) { return null; }
}
function cleanEmail(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

async function call(deps, method, route, secret, body) {
  try {
    const res = await deps.fetch(BASE + route, {
      method: method,
      headers: Object.assign({ authorization: 'Bearer ' + secret }, body ? { 'content-type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    return res.ok ? { ok: true, json: async () => res.json() } : { ok: false, status: res.status };
  } catch (e) { return { ok: false, status: 0 }; }
}

async function pullWaitlist(deps, s, secret) {
  const r = await call(deps, 'GET', '/api/admin/waitlist', secret);
  if (!r.ok) return false;
  let list;
  try { list = await r.json(); } catch (e) { return false; }
  if (!Array.isArray(list)) return false;
  s.waitlist = list.filter((x) => x && cleanEmail(x.email)).map((x) => ({ email: cleanEmail(x.email), created_at: String(x.created_at || ''), invited: !!x.invited }));
  s.waitlistAt = deps.now().toISOString();
  return true;
}

// 1.11, Itzik: "an analyst for Shachar": how many, how long, when, at what hours (motivation-bot /api/admin/usage).
async function pullUsage(deps, s, secret) {
  const r = await call(deps, 'GET', '/api/admin/usage', secret);
  if (!r.ok) return false;
  let j;
  try { j = await r.json(); } catch (e) { return false; }
  if (!j || !Array.isArray(j.hours)) return false;
  s.usage = { ...j, perUser: (j.perUser || []).slice(0, 200) };
  return true;
}

// 1.11: the testers' feedback (👍/👎, notes, answers to Itzik's questions), for the monitor to show and learn from.
async function pullFeedback(deps, s, secret) {
  const r = await call(deps, 'GET', '/api/admin/feedback', secret);
  if (!r.ok) return false;
  let j;
  try { j = await r.json(); } catch (e) { return false; }
  if (!j || !Array.isArray(j.rows)) return false;
  s.feedback = { week: j.week || null, all: j.all || null, at: deps.now().toISOString(),
    rows: j.rows.slice(0, 300).map((x) => ({ kind: String(x.kind || ''), rating: x.rating == null ? null : Number(x.rating),
      text: x.text ? String(x.text).slice(0, 1000) : '', question: x.question ? String(x.question) : '',
      answer: x.answer ? String(x.answer).slice(0, 1200) : '', asked: x.asked ? String(x.asked).slice(0, 600) : '',
      email: x.email ? String(x.email) : '', at: String(x.created_at || '') })) };
  return true;
}

function needSecret(deps) {
  const secret = readSecret(deps.secretFile || SECRET_FILE);
  if (!secret) deps.notify('שחר: חסר קובץ הסוד', 'ההזמנה נשמרה כממתינה. חסר הקובץ ' + (deps.secretFile || SECRET_FILE) + ' בשרת.');
  return secret;
}

// Every real invite in beta_invites, however it was made, becomes an invited record here.
async function pullInvites(deps, s, secret) {
  const r = await call(deps, 'GET', '/api/admin/invite', secret);
  if (!r.ok) return false;
  let j;
  try { j = await r.json(); } catch (e) { return false; }
  const list = j && Array.isArray(j.invites) ? j.invites : null;
  if (!list) return false;
  for (const x of list) {
    const email = x && cleanEmail(x.email);
    if (!email) continue;
    const rec = s.invites.find((i) => i.email === email);
    if (rec) { rec.status = 'invited'; if (!rec.note && x.note) rec.note = String(x.note).slice(0, 500); }
    else s.invites.push({ email: email, note: x.note ? String(x.note).slice(0, 500) : '', at: x.invited_at ? String(x.invited_at) : deps.now().toISOString(), status: 'invited' });
  }
  s.invites.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return true;
}

function cleanLetter(l) {
  if (!l || typeof l !== 'object') return null;
  const subject = String(l.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const body = String(l.body || '').trim().slice(0, 5000);
  if (!subject || !body) return null;
  return { subject: subject, body: body, draft: !!l.draft };
}

function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Deliver the letter from shachar@abaitzik.com through the Forward Email API.
// Returns 'sent', 'no-token', or an error word ('http-502', 'network').
async function sendLetter(deps, email, letter) {
  const token = readSecret(deps.mailTokenFile || MAIL_TOKEN_FILE);
  if (!token) return 'no-token';
  const html = '<div dir="rtl" style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:16px;line-height:1.6">'
    + esc(letter.body).replace(/\n/g, '<br>') + '</div>';
  try {
    const res = await deps.fetch(deps.mailApi || MAIL_API, {
      method: 'POST',
      headers: { authorization: 'Basic ' + Buffer.from(token + ':').toString('base64'), 'content-type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: email, subject: letter.subject, text: letter.body, html: html }),
      signal: AbortSignal.timeout(20000),
    });
    return res.ok ? 'sent' : 'http-' + res.status;
  } catch (e) { return 'network'; }
}

// Apply a waiting letter request to one invite record (the invite itself must already be 'invited').
async function doLetter(deps, rec) {
  const l = rec.letterReq;
  if (l && rec.letterMode === 'sent') { delete rec.letterReq; return; }
  if (!l || rec.status !== 'invited') return;
  if (l.draft) { rec.letterAt = deps.now().toISOString(); rec.letterMode = 'draft'; delete rec.letterErr; delete rec.letterReq; return; }
  const r = await sendLetter(deps, rec.email, l);
  if (r === 'sent') { rec.letterAt = deps.now().toISOString(); rec.letterMode = 'sent'; delete rec.letterErr; delete rec.letterReq; return; }
  rec.letterErr = r;
  // A network or server error keeps the request for the next refresh; anything else is final.
  if (r !== 'network' && !/^http-5/.test(r)) delete rec.letterReq;
}

// POST every pending invite, read back the truth, then deliver letters waiting for an invited record.
async function sync(deps, s, secret) {
  for (const it of s.invites.filter((x) => x.status === 'pending')) {
    const r = await call(deps, 'POST', '/api/admin/invite', secret, { email: it.email, note: it.note || undefined });
    if (r.ok) it.status = 'invited';
  }
  await pullInvites(deps, s, secret);
  const ok = await pullWaitlist(deps, s, secret);
  await pullFeedback(deps, s, secret);
  await pullUsage(deps, s, secret);
  for (const it of s.invites.filter((x) => x.letterReq)) await doLetter(deps, it);
  return ok;
}

async function finish(deps, s) {
  s.mailAuto = !!readSecret(deps.mailTokenFile || MAIL_TOKEN_FILE);
  save(deps.dir, s);
  if (deps.rebuild) deps.rebuild();
}

// Invite one person, with the letter when the tap asks for it (and retry everyone still pending).
async function handleInvite(got, deps) {
  const email = cleanEmail(got && got.email);
  if (!email) return { ok: false, reason: 'bad-email' };
  const note = String((got && got.note) || '').trim().slice(0, 500);
  const letter = cleanLetter(got && got.letter);
  const s = load(deps.dir);
  let rec = s.invites.find((x) => x.email === email);
  if (!rec) { rec = { email: email, note: note, at: deps.now().toISOString(), status: 'pending' }; s.invites.unshift(rec); }
  else { if (note) rec.note = note; rec.status = 'pending'; }
  if (letter && rec.letterMode !== 'sent') rec.letterReq = letter;
  const secret = needSecret(deps);
  if (!secret) { await finish(deps, s); return { ok: false, reason: 'no-secret' }; }
  await sync(deps, s, secret);
  await finish(deps, s);
  if (letter && !letter.draft && rec.letterErr === 'no-token') {
    deps.notify('שחר: אין שליחה אוטומטית', 'האישור נשמר, אבל המכתב ל ' + email + ' לא נשלח כי חסר מפתח שליחה בשרת.');
  }
  return { ok: rec.status === 'invited', status: rec.status, letter: rec.letterMode || rec.letterErr || null };
}

async function handleRefresh(deps) {
  const s = load(deps.dir);
  const secret = needSecret(deps);
  if (!secret) return { ok: false, reason: 'no-secret' };
  const ok = await sync(deps, s, secret);
  await finish(deps, s);
  return { ok: ok };
}

// m is the ntfy message. Unsigned or unparsable messages change nothing.
async function route(m, deps) {
  let got = null;
  try { got = JSON.parse(String(m.message || '')); } catch (e) { got = null; }
  if (!got || typeof got !== 'object' || !deps.ownerCodeOk('קוד ' + String(got.code || ''))) return { ok: false, reason: 'code' };
  return m.title === 'shachar-refresh' ? handleRefresh(deps) : handleInvite(got, deps);
}

module.exports = { route, handleInvite, handleRefresh, pullFeedback, pullUsage, load, cleanEmail, SECRET_FILE, MAIL_TOKEN_FILE, BASE };
