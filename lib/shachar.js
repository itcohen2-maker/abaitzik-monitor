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
    return { invites: Array.isArray(s.invites) ? s.invites : [], waitlist: Array.isArray(s.waitlist) ? s.waitlist : [], waitlistAt: s.waitlistAt || null, mailAuto: !!s.mailAuto, autoOff: !!s.autoOff, autoCapDay: s.autoCapDay || null, readySent: s.readySent && typeof s.readySent === "object" ? s.readySent : {}, loginWait: Array.isArray(s.loginWait) ? s.loginWait : [], feedback: s.feedback && typeof s.feedback === "object" ? s.feedback : null, usage: s.usage && typeof s.usage === "object" ? s.usage : null };
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

// 3.11, Itzik: "אני לא מאשר יותר ידני". Whoever leaves an email on the site is invited and gets this letter.
const LOGIN = 'https://shachar.abaitzik.com/login';
const AUTO_PER_DAY = 25; // a flood of fake emails stops here and Itzik is told
const AUTO_LETTER = {
  subject: 'ברוך הבא לשחר',
  body: 'הי,\n\n'
    + 'בתקופות מאתגרות כולנו מחפשים משהו שירים אותנו, ידחוף קדימה וייתן עוגן קטן. אז בניתי אותו. קוראים לו שחר.\n\n'
    + 'שחר הוא בינה מלאכותית, לא בן אדם. אפשר לכתוב לו בכל רגע: כשקשה וגם כשיש הצלחה קטנה. בכל בוקר הוא שולח דחיפה קטנה כדי להתחיל את היום ברגל ימין.\n\n'
    + 'הכניסה שלך כבר פתוחה. לוחצים על הכפתור, מבקשים קוד, ומקלידים את 6 הספרות שמגיעות למייל. אפשר גם להיכנס עם Google.\n\n'
    + 'אשמח לשמוע מה עובד לך ומה פחות.\n'
    + 'אבא איציק',
};
// 3.11, Itzik: "כדי שלא יצטרכו עוד פעם להיכנס". Who could not get in (the login screen kept the email,
// or an invite that never visited) gets one mail with the button, once entry works again.
const READY_LETTER = {
  subject: 'שחר מוכן, אפשר להיכנס',
  body: 'הי,\n\nתודה על הסבלנות. העדכון של שחר הסתיים, והכניסה שלך פתוחה.\n\n'
    + 'לוחצים על הכפתור, מבקשים קוד, ומקלידים את 6 הספרות שמגיעות למייל.\n\n'
    + 'מחכה לך שם,\nאבא איציק',
};
const SUPA = 'https://alnepfmjkdrwouxqumlw.supabase.co';
const SUPA_ANON = 'sb_publishable_bdP337MMNOS-wd_AdXFzUA_PVhJN-0W'; // public key, the same one the site and the app use
const OWN = /^(itcohen2(\+[^@]*)?@gmail\.com|ilayco10@gmail\.com)$/;

// Can a new person sign up right now? Supabase answers this on a public endpoint.
async function signupOpen(deps) {
  try {
    const res = await deps.fetch(SUPA + '/auth/v1/settings', { headers: { apikey: SUPA_ANON }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return false;
    const j = await res.json();
    return j && j.disable_signup === false;
  } catch (e) { return false; }
}

async function pullLoginWait(deps, s, secret) {
  const r = await call(deps, 'GET', '/api/admin/login-wait', secret);
  if (!r.ok) return false;
  let list;
  try { list = await r.json(); } catch (e) { return false; }
  if (!Array.isArray(list)) return false;
  s.loginWait = list.map((x) => cleanEmail(x && x.email)).filter(Boolean);
  return true;
}

// Once entry is open: everyone waiting, and every invite that never visited, gets READY_LETTER once.
async function readyLetters(deps, s, secret) {
  await pullLoginWait(deps, s, secret);
  const visited = new Set(((s.usage && s.usage.perUser) || []).map((u) => String(u.email || '').toLowerCase()));
  const sent = s.readySent || (s.readySent = {});
  const who = new Set([...(s.loginWait || []), ...s.invites.filter((i) => i.status === 'invited').map((i) => i.email)]);
  const todo = [...who].filter((e) => !OWN.test(e) && !visited.has(e) && !sent[e]);
  if (!todo.length) return;
  if (!(await signupOpen(deps))) { s.entryClosed = deps.now().toISOString(); return; }
  for (const e of todo) {
    if (!s.invites.some((i) => i.email === e && i.status === 'invited')) {
      const r = await call(deps, 'POST', '/api/admin/invite', secret, { email: e, note: 'login wait' });
      if (!r.ok) continue;
      s.invites.unshift({ email: e, note: 'חיכה לכניסה', at: deps.now().toISOString(), status: 'invited', auto: true });
    }
    const res = await sendLetter(deps, e, READY_LETTER);
    if (res === 'sent') sent[e] = deps.now().toISOString();
  }
  delete s.entryClosed;
}

function loginUrl(email) { return LOGIN + '?email=' + encodeURIComponent(email); }

function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Deliver the letter from shachar@abaitzik.com through the Forward Email API.
// Returns 'sent', 'no-token', or an error word ('http-502', 'network').
async function sendLetter(deps, email, letter) {
  const token = readSecret(deps.mailTokenFile || MAIL_TOKEN_FILE);
  if (!token) return 'no-token';
  // 3.11: a designed letter with one big button to the login page, the email already filled in.
  const url = loginUrl(email);
  const text = letter.body + '\n\nהכניסה לשחר: ' + url;
  const paras = esc(letter.body).split(/\n\n+/).map((p) => '<p style="margin:0 0 16px">' + p.replace(/\n/g, '<br>') + '</p>').join('');
  const html = '<div dir="rtl" style="background:#FFF6E6;padding:24px 12px;font-family:Heebo,Arial,sans-serif">'
    + '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:28px 24px;direction:rtl;text-align:right;color:#2B2118;font-size:17px;line-height:1.65">'
    + '<div style="text-align:center;font-size:40px;font-weight:900;color:#2B2118;margin-bottom:4px">שחר</div>'
    + '<div style="text-align:center;font-size:15px;color:#A84A22;margin-bottom:22px">כאן בשבילך</div>'
    + paras
    + '<div style="text-align:center;margin:26px 0 8px"><a href="' + esc(url) + '" style="display:inline-block;background:#F5A623;color:#2B2118;font-weight:800;font-size:20px;text-decoration:none;padding:16px 40px;border-radius:40px">להיכנס לשחר</a></div>'
    + '<p style="text-align:center;font-size:13px;color:#8A7060;margin:18px 0 0">שחר הוא בינה מלאכותית, לא תחליף לטיפול מקצועי.<br>במצב חירום: מד״א 101, ער״ן 1201.</p>'
    + '</div><div style="text-align:center;font-size:12px;color:#8A7060;margin-top:14px">IT Solution</div></div>';
  try {
    const res = await deps.fetch(deps.mailApi || MAIL_API, {
      method: 'POST',
      headers: { authorization: 'Basic ' + Buffer.from(token + ':').toString('base64'), 'content-type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: email, subject: letter.subject, text: text, html: html }),
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

// 3.11: every waitlist email that is not invited yet is invited now, with the welcome letter.
// The list comes from the Shachar server (the site's saved signups), never from the push text.
async function autoInvite(deps, s, secret) {
  if (s.autoOff) return;
  const today = deps.now().toISOString().slice(0, 10);
  let used = s.invites.filter((x) => x.auto && String(x.at).slice(0, 10) === today).length;
  for (const w of s.waitlist.filter((x) => !x.invited)) {
    if (s.invites.some((x) => x.email === w.email)) continue;
    if (used >= AUTO_PER_DAY) {
      if (s.autoCapDay !== today) { s.autoCapDay = today; deps.notify('שחר: עצרתי הזמנות אוטומטיות', 'היום נרשמו יותר מ ' + AUTO_PER_DAY + ' כתובות. השאר מחכות לאישור שלך בעסק שלי ← שחר.'); }
      break;
    }
    const rec = { email: w.email, note: 'אוטומטי מהאתר', at: deps.now().toISOString(), status: 'pending', auto: true, letterReq: AUTO_LETTER };
    s.invites.unshift(rec);
    used++;
    const r = await call(deps, 'POST', '/api/admin/invite', secret, { email: w.email, note: 'auto from site' });
    if (r.ok) { rec.status = 'invited'; w.invited = true; }
  }
}

// POST every pending invite, read back the truth, then deliver letters waiting for an invited record.
async function sync(deps, s, secret) {
  for (const it of s.invites.filter((x) => x.status === 'pending')) {
    const r = await call(deps, 'POST', '/api/admin/invite', secret, { email: it.email, note: it.note || undefined });
    if (r.ok) it.status = 'invited';
  }
  await pullInvites(deps, s, secret);
  const ok = await pullWaitlist(deps, s, secret);
  if (ok) await autoInvite(deps, s, secret);
  await pullFeedback(deps, s, secret);
  await pullUsage(deps, s, secret);
  for (const it of s.invites.filter((x) => x.letterReq)) await doLetter(deps, it);
  await readyLetters(deps, s, secret);
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

module.exports = { AUTO_LETTER, READY_LETTER, loginUrl, sendLetter, route, handleInvite, handleRefresh, pullFeedback, pullUsage, load, cleanEmail, SECRET_FILE, MAIL_TOKEN_FILE, BASE };
