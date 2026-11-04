'use strict';
/*
  WhatsApp to the monitor, through Meta's official WhatsApp Cloud API.

  1.11.2026, Itzik: "אני רוצה לדבר דרך הוואטסאפ עם המוניטור". He chose the
  official Meta number, not an unofficial link to his own phone, because that
  can get his number blocked (memory: whatsapp-status-tile).

  The way in: Meta posts every message to https://wa.abaitzik.com/webhook.
  The signature is checked with the app secret, the sender must be on the
  allow list, and the text is published to the monitor's ntfy in topic with
  the owner code, exactly like a message typed on the page. The listener and
  the worker then treat it like any other message.

  The way out: the answer the worker writes to data/chat/chat (from claude,
  re ntfy-<id>) is sent back to the same WhatsApp chat. Inside the 24 hour
  window that Meta opens when he writes, a free text reply is allowed.

  Config, never in git: data/wa.json (600)
    { verifyToken, appSecret, token, phoneId, allow: ["9725..."], graph: "v21.0" }
  State: data/status/wa-bridge.json (which ntfy id came from which number,
  and which answers were already sent).

  Run: node wa-bridge.js   (service monitor-wa.service, 127.0.0.1:8796)
*/
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CFG = path.join(ROOT, 'data', 'wa.json');
const STATE = path.join(ROOT, 'data', 'status', 'wa-bridge.json');
const CHAT = path.join(ROOT, 'data', 'chat', 'chat');
const PORT = Number(process.env.WA_PORT || 8796);
const DEMO_FLAG = path.join(ROOT, 'data', 'demo', 'active.json');
const ORIGINS = ['https://itcohen2-maker.github.io'];
/*
  1.11.2026: the client demo (lib/demo-mode.js). While it is on, every question,
  from the page or from WhatsApp, goes to the worker with this frame first, so
  the answer is the client's monitor and never Itzik's own life.
*/
const DEMO_FRAME = '[הדגמה ללקוח, IT Solution] ענה כמו המוניטור העסקי של עסק לדוגמה (יועץ עסקי עצמאי, שי בודק, עם 6 עד 15 לקוחות פעילים מהמלצות. מה שגוזל לו זמן: סיכומי פגישות, תיאום פגישות ומשימות ללקוחות. היומן שלו ב Outlook והמייל Gmail), בפגישת מכירה. '
  + 'קצר, חם, בעברית, בלי מקפים. השתמש רק בנתוני הדוגמה שבקובץ data/demo/demo.json (לקוחות, לידים, מיילים, שיחות פייסבוק, קמפיינים). '
  + 'אסור להזכיר שום דבר אישי או אמיתי של איציק: לא בריאות, לא משפחה, לא לולוס, לא נרות, לא פגסוס, לא שחר, לא לקוחות או אנשים אמיתיים, לא כסף אמיתי. '
  + 'אם מבקשים פעולה (לשלוח, להשהות, להוציא הצעה), תאר שביצעת אותה בנתוני הדוגמה. '
  + 'שתף פעולה עם ההדגמה: אם מבקשים מייל, הצעת מחיר, חשבונית או מסמך, תמציא אותו בצורה אמינה ותואמת לנתוני הדוגמה, '
  + '(סיכום פגישה: type doc, title "סיכום פגישה עם ...", ובטקסט החלטות, משימות ללקוח, משימות שלי ופגישת המשך) ותשים אותו גם במסך המוניטור בפקודה node demo-feed.js add, עם אובייקט JSON כארגומנט אחד או דרך stdin (שדות: type אחד מ mail, quote, invoice, doc, note, lead, meeting, report, task; title; from; subject; text; client; client להצעה ולחשבונית הוא שם האדם שביקשו עבורו ושם העסק שלו מנתוני הדוגמה, למשל "רון שטרן, מסעדה", והוא מה שמופיע ב PDF תחת לכבוד; items כרשימה של [פריט, כמות, מחיר ליחידה לפני מע״מ] להצעה ולחשבונית; phone לליד; when (בעברית, למשל "יום ראשון 8.11, 10:00") ו where לפגישה; kpis כאובייקט של שם וערך לדוח קמפיינים). כל בקשה שמייצרת משהו (מייל, הצעה, חשבונית, ליד חדש, פגישה, דוח, משימה) נכנסת למסך. '
  + 'בתשובה עצמה כתוב בקצרה מה יש בו, ושהוא מחכה במוניטור תחת תשובות, עם שליחה חוזרת, שליחה בוואטסאפ ושמירה לטלפון. השאלה של הלקוח: ';
function demoOn() { try { return JSON.parse(fs.readFileSync(DEMO_FLAG, 'utf8')).on === true; } catch (e) { return false; } }

function log(s) { console.log(new Date().toISOString() + ' ' + s); }
function cfg() { return JSON.parse(fs.readFileSync(CFG, 'utf8')); }
function keys() { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'keys.json'), 'utf8')); }
function ownerCode() {
  try { return fs.readFileSync(path.join(ROOT, 'data', 'owner-code.txt'), 'utf8').trim(); } catch (e) { return ''; }
}
function loadState() {
  try { const s = JSON.parse(fs.readFileSync(STATE, 'utf8')); s.pending = s.pending || {}; s.sent = s.sent || {}; s.seen = s.seen || {}; return s; }
  catch (e) { return { pending: {}, sent: {}, seen: {} }; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  // keep it small: only the last 300 of each
  for (const k of ['pending', 'sent', 'seen']) {
    const e = Object.entries(s[k]);
    if (e.length > 300) s[k] = Object.fromEntries(e.slice(-300));
  }
  fs.writeFileSync(STATE, JSON.stringify(s, null, 1));
}

function req(method, url, headers, body) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers }, function (res) {
      const ch = [];
      res.on('data', function (c) { ch.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, body: Buffer.concat(ch) }); });
    });
    r.on('error', reject);
    r.setTimeout(30000, function () { r.destroy(new Error('timeout')); });
    if (body) r.write(body);
    r.end();
  });
}

// Publish into the monitor exactly as the page does: first line the kind, then the text, then the code.
async function toMonitor(kind, text) {
  /*
    1.11, 19:22: ntfy.sh answered 429 (the server's daily allowance ran out) and
    both WhatsApp and the demo box stopped. The bridge runs on the same machine
    as the worker, so it no longer goes through ntfy at all: it writes the
    message straight into data/chat/chat the way listen.js does (already
    verified, status working), and the worker picks it up within a minute.
  */
  const pad = (n) => String(n).padStart(2, '0');
  const at = new Date();
  const base = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-'
    + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds()) + '-itzik-auto';
  let name = base + '.json';
  for (let i = 2; fs.existsSync(path.join(CHAT, name)); i++) name = base + '-' + i + '.json';
  const id = 'wa-' + at.getTime().toString(36) + crypto.randomBytes(3).toString('hex');
  const rec = { at: at.toISOString(), from: 'itzik', text: kind + String.fromCharCode(10) + text, status: 'working',
    ackAt: at.toISOString(), id: id, auto: true, via: 'wa-bridge' };
  fs.mkdirSync(CHAT, { recursive: true });
  fs.writeFileSync(path.join(CHAT, name + '.tmp'), JSON.stringify(rec, null, 1), 'utf8');
  fs.renameSync(path.join(CHAT, name + '.tmp'), path.join(CHAT, name));
  return id;
}

async function waSend(to, text) {
  const c = cfg();
  const body = JSON.stringify({ messaging_product: 'whatsapp', to: to, type: 'text', text: { preview_url: true, body: String(text).slice(0, 4000) } });
  const r = await req('POST', 'https://graph.facebook.com/' + (c.graph || 'v21.0') + '/' + c.phoneId + '/messages',
    { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' }, Buffer.from(body, 'utf8'));
  if (r.status !== 200) throw new Error('graph ' + r.status + ' ' + r.body.toString('utf8').slice(0, 300));
  return true;
}

async function voiceText(mediaId) {
  const c = cfg(), H = { Authorization: 'Bearer ' + c.token };
  const meta = await req('GET', 'https://graph.facebook.com/' + (c.graph || 'v21.0') + '/' + mediaId, H);
  if (meta.status !== 200) throw new Error('media meta ' + meta.status);
  const url = JSON.parse(meta.body.toString('utf8')).url;
  const bin = await req('GET', url, H);
  if (bin.status !== 200 || !bin.body.length) throw new Error('media get ' + bin.status);
  const dir = path.join(ROOT, 'data', 'inbox'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'wa-voice-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '.ogg');
  fs.writeFileSync(file, bin.body);
  const budget = Math.max(180000, Math.round(bin.body.length / 23000 * 2500));
  const run = function () {
    return new Promise(function (ok) {
      require('child_process').execFile('node', ['transcribe.js', file], { cwd: ROOT, timeout: budget }, function (err, out) {
        const line = String(out || '').trim().split(String.fromCharCode(10)).filter(Boolean).pop() || '';
        let text = line; try { const j = JSON.parse(line); text = j.text || ''; } catch (e) {}
        ok(err || /^\(/.test(text) ? '' : text.trim());
      });
    });
  };
  return (await run()) || (await run());
}

async function markRead(id) {
  try {
    const c = cfg();
    await req('POST', 'https://graph.facebook.com/' + (c.graph || 'v21.0') + '/' + c.phoneId + '/messages',
      { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
      Buffer.from(JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: id }), 'utf8'));
  } catch (e) { /* a read mark is a courtesy */ }
}

function sigOk(raw, header) {
  try {
    const want = 'sha256=' + crypto.createHmac('sha256', cfg().appSecret).update(raw).digest('hex');
    const a = Buffer.from(String(header || '')), b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

function textOf(m) {
  if (m.type === 'text') return m.text && m.text.body;
  if (m.type === 'button') return m.button && m.button.text;
  if (m.type === 'interactive') {
    const i = m.interactive || {};
    return (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title);
  }
  if (m.type === 'image' || m.type === 'document' || m.type === 'video') {
    const o = m[m.type] || {};
    return '[' + (m.type === 'image' ? 'תמונה' : m.type === 'video' ? 'סרטון' : 'מסמך') + ' מוואטסאפ' + (o.filename ? ': ' + o.filename : '') + ']' + (o.caption ? ' ' + o.caption : '');
  }
  if (m.type === 'audio') return null;
  return null;
}

/*
  2.11.2026, Itzik: "אם אני מבקש בוואטסאפ שתקריא לי את התשובות, הוואטסאפ יקריא לי".
  Voice answers on WhatsApp, with the monitor's own Hebrew TTS (say.py, Phonikud, personal use only).
    "תקריא לי"            -> from now on every answer also comes as a voice note (and the last answer is read now)
    "תקריא לי: <טקסט>"    -> a voice note of that text, right away
    "בלי הקראה"           -> back to text only
  State: st.voice[number] = true, st.last[number] = the last answer text.
*/
const TTS = '/home/monitor/tts';
function speakable(t) {
  let x = String(t || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>|~]/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (x.length > 1800) x = x.slice(0, 1800).replace(/[^.!?\n]*$/, '') + ' ההמשך בכתב.';
  return x;
}
function run(cmd, args, opts) {
  return new Promise(function (ok, bad) {
    const p = require('child_process').execFile(cmd, args, Object.assign({ timeout: 240000, maxBuffer: 1e7 }, opts || {}), function (err) { err ? bad(err) : ok(); });
    if (opts && opts.input != null) { p.stdin.end(opts.input); }
  });
}
async function ttsOgg(text) {
  const dir = path.join(ROOT, 'data', 'status', 'wa-voice'); fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, 'v-' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'));
  await run(path.join(TTS, 'venv/bin/python'), [path.join(TTS, 'say.py'), base + '.mp3'], { input: text });
  await run('ffmpeg', ['-v', 'error', '-y', '-i', base + '.mp3', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', base + '.ogg']);
  try { fs.unlinkSync(base + '.mp3'); } catch (e) {}
  // keep the folder small
  try { fs.readdirSync(dir).forEach(function (f) { const q = path.join(dir, f); if (Date.now() - fs.statSync(q).mtimeMs > 86400e3) fs.unlinkSync(q); }); } catch (e) {}
  return base + '.ogg';
}
async function waUpload(file, mime) {
  const c = cfg(), b = '----wa' + crypto.randomBytes(8).toString('hex'), NL = '\r\n';
  const part = function (name, val) { return Buffer.from('--' + b + NL + 'Content-Disposition: form-data; name="' + name + '"' + NL + NL + val + NL, 'utf8'); };
  const body = Buffer.concat([
    part('messaging_product', 'whatsapp'), part('type', mime),
    Buffer.from('--' + b + NL + 'Content-Disposition: form-data; name="file"; filename="' + path.basename(file) + '"' + NL + 'Content-Type: ' + mime + NL + NL, 'utf8'),
    fs.readFileSync(file), Buffer.from(NL + '--' + b + '--' + NL, 'utf8')]);
  const r = await req('POST', 'https://graph.facebook.com/' + (c.graph || 'v21.0') + '/' + c.phoneId + '/media',
    { Authorization: 'Bearer ' + c.token, 'Content-Type': 'multipart/form-data; boundary=' + b, 'Content-Length': body.length }, body);
  if (r.status !== 200) throw new Error('media up ' + r.status + ' ' + r.body.toString('utf8').slice(0, 200));
  return JSON.parse(r.body.toString('utf8')).id;
}
async function waVoice(to, text) {
  const t = speakable(text);
  if (!t) return false;
  const file = await ttsOgg(t);
  const id = await waUpload(file, 'audio/ogg');
  const c = cfg();
  const send = function (audio) {
    return req('POST', 'https://graph.facebook.com/' + (c.graph || 'v21.0') + '/' + c.phoneId + '/messages',
      { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
      Buffer.from(JSON.stringify({ messaging_product: 'whatsapp', to: to, type: 'audio', audio: audio }), 'utf8'));
  };
  let r = await send({ id: id, voice: true });
  if (r.status !== 200) r = await send({ id: id });
  if (r.status !== 200) throw new Error('voice send ' + r.status + ' ' + r.body.toString('utf8').slice(0, 200));
  return true;
}
// One voice note at a time, so two long answers don't run the TTS together.
let voiceQ = Promise.resolve();
// 3.11, Itzik: "הוא גם כותב וגם מקריא, פעמיים כל הודעה. צריך רק פעם אחת. אם ביקש
// להקריא, אז בהקראה, ואם לא, אז בכיתוב." An answer goes out once: as a voice note
// when he asked for voice, otherwise as text. If the voice fails, the text goes instead.
function queueVoice(to, text, fallback) {
  voiceQ = voiceQ.then(function () { return waVoice(to, text); })
    .then(function () { log('voice out -> ' + String(to).slice(0, 5) + '...'); })
    .catch(function (e) { log('voice failed: ' + e.message); return waSend(to, fallback ? text : 'לא הצלחתי להקריא הפעם, נסה שוב.').catch(function () {}); });
  return voiceQ;
}
function voiceCommand(t) {
  const x = String(t || '').trim();
  let m = x.match(/^(?:תקריא|תקריאי|הקרא|תקרא)\s+לי\s*[:：\-]\s*([\s\S]+)$/);
  if (m) return { say: m[1] };
  if (/^(?:בלי הקראה|בלי קול|תפסיק להקריא|די להקריא|הפסק להקריא|רק בכתב|לא להקריא)[.!]*$/.test(x)) return { off: true };
  if (/^(?:תקריא|תקריאי|הקרא|תקרא)(?:\s+לי)?(?:\s+את)?(?:\s+ה?תשובות?)?(?:\s+של\s+המוניטור)?[.!]*$/.test(x) || /^(?:הקראה|בקול|הודעות קוליות)[.!]*$/.test(x)) return { on: true };
  return null;
}

async function onMessage(m, contactName) {
  const st = loadState();
  if (st.seen[m.id]) return;
  st.seen[m.id] = Date.now();
  saveState(st);
  const allow = (cfg().allow || []).map(String);
  if (allow.indexOf(String(m.from)) < 0) { log('not on the allow list: ' + String(m.from).slice(0, 5) + '...'); return; }
  markRead(m.id);
  // 1.11, for Shai's demo: "summarize meetings and send tasks", by voice, on WhatsApp.
  // The voice note is downloaded from Meta, transcribed with the monitor's own transcribe.js,
  // and goes on as text, exactly like a typed message.
  if (m.type === 'audio' && m.audio && m.audio.id) {
    await waSend(m.from, '🎙️ קיבלתי את ההקלטה, מתמלל.');
    let heard = '';
    try { heard = await voiceText(m.audio.id); } catch (e) { log('voice failed: ' + e.message); }
    if (!heard) { await waSend(m.from, 'לא הצלחתי לתמלל את ההקלטה. אפשר לשלוח שוב, או לכתוב.'); return; }
    const vid = await toMonitor('וואטסאפ', (demoOn() ? DEMO_FRAME : '') + '🎙️ הודעה קולית מוואטסאפ: ' + heard);
    const sv = loadState(); sv.pending[vid] = { to: m.from, at: Date.now(), name: contactName || '' }; saveState(sv);
    log('voice ' + m.id + ' -> ntfy-' + vid + ' (' + heard.length + ' chars)');
    await waSend(m.from, '✓ שמעתי: "' + (heard.length > 220 ? heard.slice(0, 220) + '...' : heard) + '"' + String.fromCharCode(10) + 'אני עובד על זה.');
    return;
  }
  const t = textOf(m);
  if (!t) {
    await waSend(m.from, m.type === 'audio'
      ? 'קיבלתי הודעה קולית. בינתיים אני קורא רק טקסט בוואטסאפ, אז אפשר לכתוב, או ללחוץ על המיקרופון של המקלדת ולהכתיב.'
      : 'קיבלתי, אבל את סוג ההודעה הזה אני עוד לא קורא. אפשר לכתוב לי אותה במילים?');
    return;
  }
  const vc = voiceCommand(t);
  if (vc) {
    const sv = loadState(); sv.voice = sv.voice || {}; sv.last = sv.last || {};
    if (vc.say) { await waSend(m.from, '🔊 מקריא...'); queueVoice(m.from, vc.say); return; }
    if (vc.off) { delete sv.voice[m.from]; saveState(sv); await waSend(m.from, '✓ חזרנו לכתב בלבד. כדי להקריא שוב: "תקריא לי".'); return; }
    sv.voice[m.from] = true; saveState(sv);
    await waSend(m.from, '🔊 מעכשיו כל תשובה של המוניטור תגיע כהודעה קולית, בלי כתב. לחזרה לכתב: "בלי הקראה".');
    if (sv.last[m.from]) queueVoice(m.from, sv.last[m.from]);
    return;
  }
  const id = await toMonitor('וואטסאפ', demoOn() ? DEMO_FRAME + t : t);
  const s2 = loadState();
  s2.pending[id] = { to: m.from, at: Date.now(), name: contactName || '' };
  // A question that itself asks to be read ("ותקריא לי", "בהקראה") gets this one answer as voice.
  if (/(?:תקריא|תקריאי|הקרא|תקרא|בהקראה|בקול|הודעה קולית)/.test(t)) s2.pending[id].voice = true;
  saveState(s2);
  log('in ' + m.id + ' -> ntfy-' + id);
  await waSend(m.from, '✓ קיבלתי, אני עובד על זה. התשובה תגיע לכאן.');
}

// The answers: claude's chat records that answer a message that came from WhatsApp.
function sweep() {
  const st = loadState();
  const ids = Object.keys(st.pending);
  if (!ids.length) return;
  let files = [];
  try { files = fs.readdirSync(CHAT).filter(function (f) { return f.endsWith('.json') && f.indexOf('claude') > -1; }); } catch (e) { return; }
  const since = Math.min.apply(null, ids.map(function (k) { return st.pending[k].at; })) - 60000;
  files.forEach(function (f) {
    if (st.sent[f]) return;
    const full = path.join(CHAT, f);
    let d;
    try { if (fs.statSync(full).mtimeMs < since) return; d = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { return; }
    if (!d || d.from !== 'claude' || !d.re || !st.pending[d.re] || !d.text) return;
    st.sent[f] = Date.now();
    saveState(st);
    const to = st.pending[d.re].to;
    const s5 = loadState(); s5.last = s5.last || {}; s5.last[to] = d.text; saveState(s5);
    const asVoice = !!((s5.voice && s5.voice[to]) || st.pending[d.re].voice);
    (asVoice ? queueVoice(to, d.text, true) : waSend(to, d.text)).then(function () {
      log('out ' + f + ' -> ' + d.re + (asVoice ? ' (voice)' : ''));
    })
      .catch(function (e) { log('send failed ' + f + ': ' + e.message); const s3 = loadState(); delete s3.sent[f]; saveState(s3); });
  });
  // a question waits for answers for 6 hours, then is let go
  const s4 = loadState(); let ch = false;
  Object.keys(s4.pending).forEach(function (k) { if (Date.now() - s4.pending[k].at > 6 * 3600e3) { delete s4.pending[k]; ch = true; } });
  if (ch) saveState(s4);
}

function readBody(q, max) {
  return new Promise(function (resolve, reject) {
    const ch = []; let n = 0;
    q.on('data', function (c) { n += c.length; if (n > max) { reject(new Error('big')); q.destroy(); } else ch.push(c); });
    q.on('end', function () { resolve(Buffer.concat(ch)); });
    q.on('error', reject);
  });
}
function formNotify(kind, text) { toMonitor(kind, text).then(function (id) { log('form -> ntfy-' + id); }, function (e) { log('form notify failed: ' + e.message); }); }
function codeOk(c) { const o = ownerCode(); return !!o && String(c || '') === o; }
// The demo page talks to the bridge: ask a question, read its answer, turn demo on and off.
async function api(q, s, u) {
  const origin = q.headers.origin || '';
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (ORIGINS.indexOf(origin) > -1) { h['Access-Control-Allow-Origin'] = origin; h['Access-Control-Allow-Headers'] = 'Content-Type'; h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'; }
  if (q.method === 'OPTIONS') { s.writeHead(204, h); return s.end(); }
  if (q.method !== 'POST') { s.writeHead(405, h); return s.end('{}'); }
  let b; try { b = JSON.parse((await readBody(q, 20000)).toString('utf8')); } catch (e) { s.writeHead(400, h); return s.end('{}'); }
  if (!codeOk(b.code)) { s.writeHead(403, h); return s.end('{"error":"code"}'); }
  const send = function (o) { s.writeHead(200, h); s.end(JSON.stringify(o)); };
  if (u.pathname === '/api/demo') {
    fs.mkdirSync(path.dirname(DEMO_FLAG), { recursive: true });
    fs.writeFileSync(DEMO_FLAG, JSON.stringify({ on: !!b.on, at: new Date().toISOString() }));
    log('demo ' + (b.on ? 'on' : 'off'));
    if (b.on) { try { require('./demo-feed.js').save([]); } catch (e) { log('feed clear: ' + e.message); } }
    return send({ on: !!b.on });
  }
  if (u.pathname === '/api/ask') {
    const t = String(b.text || '').trim().slice(0, 2000);
    if (!t) return send({ error: 'empty' });
    const id = await toMonitor('הדגמה', DEMO_FRAME + t);
    
    log('ask -> ntfy-' + id);
    return send({ id: id });
  }
  if (u.pathname === '/api/feed') {
    let items = []; try { items = require('./demo-feed.js').load(); } catch (e) {}
    return send({ items: items });
  }
  if (u.pathname === '/api/answer') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 20).map(String);
    const out = {};
    let files = []; try { files = fs.readdirSync(CHAT).filter(function (f) { return f.endsWith('.json') && f.indexOf('claude') > -1; }); } catch (e) {}
    const recent = files.filter(function (f) { try { return Date.now() - fs.statSync(path.join(CHAT, f)).mtimeMs < 3 * 3600e3; } catch (e) { return false; } });
    recent.forEach(function (f) {
      let d; try { d = JSON.parse(fs.readFileSync(path.join(CHAT, f), 'utf8')); } catch (e) { return; }
      if (d && d.from === 'claude' && d.re && ids.indexOf(d.re) > -1 && d.text) out[d.re] = (out[d.re] ? out[d.re] + String.fromCharCode(10, 10) : '') + d.text;
    });
    return send({ answers: out });
  }
  s.writeHead(404, h); s.end('{}');
}

const server = http.createServer(function (q, s) {
  const u = new URL(q.url, 'http://x');
  // 1.11: client intake forms on form.it-solution.co.il (forms.js).
  const fm = u.pathname.match(/^\/f\/([a-f0-9]{16,40})(\/view)?\/?$/);
  if (fm && q.method === 'GET') { if (fm[2]) require('./form-view.js').serve('./forms.js', fm[1], s); else require('./forms.js').servePage(fm[1], s); return; }
  // 2.11: sign a quote on the phone (sign.js), /q/<token>[/pdf|/signed] and /api/sign.
  const qm = u.pathname.match(/^\/q\/([a-f0-9]{16,40})(?:\/(pdf|signed|view))?\/?$/);
  if (qm && q.method === 'GET') { require('./sign.js').servePage(qm[1], qm[2], s); return; }
  if (u.pathname === '/api/sign') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 600000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',')[0].trim();
      const r = require('./sign.js').handlePost(b, formNotify, ip, q.headers['user-agent']);
      s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body));
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  // 1.11: client setup page (setup.js), /s/<token> and /api/setup.
  const sm = u.pathname.match(/^\/s\/([a-f0-9]{16,40})(\/view)?\/?$/);
  if (sm && q.method === 'GET') { if (sm[2]) require('./form-view.js').serve('./setup.js', sm[1], s); else require('./setup.js').servePage(sm[1], s); return; }
  if (u.pathname === '/api/setup') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 20000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      return Promise.resolve(require('./setup.js').handlePost(b, formNotify)).then(function (r) {
        s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body));
      });
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  if (u.pathname === '/api/form') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 20000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      const r = require('./forms.js').handlePost(b, formNotify);
      s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body));
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  if (u.pathname.indexOf('/api/') === 0) { api(q, s, u).catch(function (e) { log('api: ' + e.message); try { s.writeHead(500); s.end('{}'); } catch (x) {} }); return; }
  if (u.pathname !== '/webhook') { s.writeHead(404); return s.end(); }
  if (q.method === 'GET') {
    let c = {}; try { c = cfg(); } catch (e) {}
    if (u.searchParams.get('hub.mode') === 'subscribe' && c.verifyToken && u.searchParams.get('hub.verify_token') === c.verifyToken) {
      s.writeHead(200, { 'Content-Type': 'text/plain' }); return s.end(u.searchParams.get('hub.challenge') || '');
    }
    s.writeHead(403); return s.end();
  }
  if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
  const ch = []; let size = 0;
  q.on('data', function (c) { size += c.length; if (size < 2e6) ch.push(c); });
  q.on('end', function () {
    const raw = Buffer.concat(ch);
    if (!sigOk(raw, q.headers['x-hub-signature-256'])) { log('bad signature'); s.writeHead(401); return s.end(); }
    s.writeHead(200); s.end('ok');
    let d; try { d = JSON.parse(raw.toString('utf8')); } catch (e) { return; }
    (d.entry || []).forEach(function (e) {
      (e.changes || []).forEach(function (c) {
        const v = c.value || {};
        const name = v.contacts && v.contacts[0] && v.contacts[0].profile && v.contacts[0].profile.name;
        (v.messages || []).forEach(function (m) { onMessage(m, name).catch(function (err) { log('message failed: ' + err.message); }); });
      });
    });
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', function () { log('wa-bridge on 127.0.0.1:' + PORT); });
  setInterval(function () { try { sweep(); } catch (e) { log('sweep: ' + e.message); } }, 5000);
  setInterval(function () { try { require('./forms.js').sweep(formNotify); } catch (e) { log('forms sweep: ' + e.message); } }, 60000);
  setInterval(function () { try { require('./setup.js').sweep(formNotify); } catch (e) { log('setup sweep: ' + e.message); } }, 60000);
}
module.exports = { textOf, sigOk, voiceCommand, speakable };
