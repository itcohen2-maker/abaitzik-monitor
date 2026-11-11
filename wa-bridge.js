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
const ORIGINS = ['https://itcohen2-maker.github.io', 'https://shai.it-solution.co.il', 'https://alon.abaitzik.com', 'https://rinat.abaitzik.com', 'https://pablo.it-solution.co.il', 'https://ilay.abaitzik.com', 'https://it-solution.co.il', 'https://www.it-solution.co.il'];
// 11.11.2026: every self signup trial monitor lives at https://<id>.m.it-solution.co.il, so those are allowed by pattern.
function originOk(o) { return ORIGINS.indexOf(o) > -1 || /^https:\/\/t[a-f0-9]{6}\.m\.it-solution\.co\.il$/.test(String(o || '')); }
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
async function toMonitor(kind, text, re) {
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
  // 4.11: a quoted reply continues its thread on the page (monitor-chat-threads-re).
  if (re) rec.re = re;
  fs.mkdirSync(CHAT, { recursive: true });
  fs.writeFileSync(path.join(CHAT, name + '.tmp'), JSON.stringify(rec, null, 1), 'utf8');
  fs.renameSync(path.join(CHAT, name + '.tmp'), path.join(CHAT, name));
  return id;
}

// Returns Meta's id of the sent message (wamid). With mem, the id is remembered
// (lib/wa-out.js), so a reply that quotes this message continues mem.re.
async function waSend(to, text, mem) {
  const c = cfg();
  const body = JSON.stringify({ messaging_product: 'whatsapp', to: to, type: 'text', text: { preview_url: true, body: String(text).slice(0, 4000) } });
  const r = await req('POST', 'https://graph.facebook.com/' + (c.graph || 'v21.0') + '/' + c.phoneId + '/messages',
    { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' }, Buffer.from(body, 'utf8'));
  if (r.status !== 200) throw new Error('graph ' + r.status + ' ' + r.body.toString('utf8').slice(0, 300));
  let id = ''; try { id = JSON.parse(r.body.toString('utf8')).messages[0].id; } catch (e) {}
  if (mem && id) { try { waOut.remember(DATA, id, mem); } catch (e) { log('remember failed: ' + e.message); } }
  return id || true;
}

/*
  4.11.2026, the plan after the Instinct comparison. WhatsApp is the front door,
  the monitor is where everything is seen. So:

  A long answer comes as its opening and a link straight to it on the monitor
  (#ans=<question id>, build.js), never as a wall of text. "הכל" sends the
  whole of the last long answer here after all.

  A reply that quotes one of my messages (m.context.id) continues that thread:
  the new record carries re = the question it continues, and the quoted text
  goes along so the session knows what "this" is. A message with no quote opens
  a new task, as before.
*/
const waOut = require('./lib/wa-out.js');
const DATA = path.join(ROOT, 'data');
const LONG = 700;
function pageUrl() {
  try { return require('./lib/instance.js').publicUrl || ''; } catch (e) { return ''; }
}
function shortOf(text, re) {
  const t = String(text || '').trim();
  if (t.length <= LONG) return null;
  const first = t.split(/\n\s*\n/)[0];
  let s = first.length > 380 ? first.slice(0, 380) : first;
  if (s.length < first.length) {
    const cut = Math.max(s.lastIndexOf('. '), s.lastIndexOf('.\n'), s.lastIndexOf('? '));
    s = cut > 120 ? s.slice(0, cut + 1) : s.replace(/\s+\S*$/, '') + '…';
  }
  const url = pageUrl();
  return s + '\n\n' + (url ? 'התשובה המלאה במוניטור: ' + url + '#ans=' + encodeURIComponent(re) + '\n' : '')
    + 'או כתוב "הכל" ואשלח אותה כאן.';
}
function isAllCommand(t) { return /^\s*(?:הכל|את הכל|הכול|שלח הכל|תשלח הכל|את כל התשובה|כל התשובה|המשך)[.!]*\s*$/.test(String(t || '')); }
async function sendLongParts(to, text, mem) {
  // WhatsApp takes 4096 characters; long answers go in parts, cut on a paragraph.
  let rest = String(text || '');
  while (rest.length) {
    let part = rest;
    if (rest.length > 3800) {
      const cut = rest.lastIndexOf('\n\n', 3800);
      part = rest.slice(0, cut > 1000 ? cut : 3800);
    }
    await waSend(to, part, mem);
    rest = rest.slice(part.length).replace(/^\s+/, '');
  }
}

// 6.11: a call recording (lib/call-analysis.js). Download with its own extension.
async function mediaFile(mediaId, ext) {
  const c = cfg(), H = { Authorization: 'Bearer ' + c.token };
  const meta = await req('GET', 'https://graph.facebook.com/' + (c.graph || 'v21.0') + '/' + mediaId, H);
  if (meta.status !== 200) throw new Error('media meta ' + meta.status);
  const bin = await req('GET', JSON.parse(meta.body.toString('utf8')).url, H);
  if (bin.status !== 200 || !bin.body.length) throw new Error('media get ' + bin.status);
  const dir = path.join(ROOT, 'data', 'inbox'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'wa-call-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + ext);
  fs.writeFileSync(file, bin.body);
  return file;
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

// 6.11: sales training, the monitor plays the customer (lib/sales-train.js).
const ST = require('./lib/sales-train.js');
function writeChat(text) {
  const now = new Date();
  const f = now.toISOString().replace(/[^0-9]/g, '').slice(0, 8) + '-' + now.toISOString().replace(/[^0-9]/g, '').slice(8, 14) + '-claude-train.json';
  fs.writeFileSync(path.join(CHAT, f), JSON.stringify({ at: now.toISOString(), from: 'claude', status: 'done', text: text }, null, 1), 'utf8');
  require('child_process').execFile('node', ['push.js', 'chat: sales training'], { cwd: ROOT, timeout: 240000 }, function () {});
}
async function trainTurn(to, t) {
  const st = loadState(); st.train = st.train || {};
  let tr = st.train[to];
  const s0 = ST.startOf(t);
  if (s0) {
    let biz = ''; try { biz = JSON.parse(fs.readFileSync(path.join(ROOT, 'instance.json'), 'utf8')).business || ''; } catch (e) {}
    st.train[to] = { scenario: s0.scenario, business: biz, turns: [], last: Date.now() }; saveState(st);
    await waSend(to, '🎭 מתחילים אימון מכירות. אני הלקוח' + (s0.scenario ? ' (' + s0.scenario + ')' : '') + '. אתה פותח את השיחה, בכתב או בהקלטה.' + String.fromCharCode(10) + '"סיימנו" לציון, "עצור אימון" ליציאה.');
    return true;
  }
  if (!ST.active(tr)) { if (tr) { delete st.train[to]; saveState(st); } return false; }
  if (ST.isStop(t)) { delete st.train[to]; saveState(st); await waSend(to, 'האימון נעצר, בלי ציון.'); return true; }
  if (ST.isEnd(t)) {
    await waSend(to, '📝 מסכם ונותן ציון, כחצי דקה.');
    let res = ''; try { res = await ST.score(tr); } catch (e) { log('train score: ' + e.message); }
    const s2 = loadState(); if (s2.train) delete s2.train[to]; saveState(s2);
    if (!res) { await waSend(to, 'לא הצלחתי לחשב ציון הפעם. אפשר להתחיל שוב: "אימון מכירות".'); return true; }
    const f = ST.keep(DATA, tr, res);
    writeChat('🎭 אימון מכירות' + (tr.scenario ? ': ' + tr.scenario : '') + String.fromCharCode(10, 10) + res + String.fromCharCode(10, 10) + 'השיחה המלאה: files/' + f);
    await waSend(to, res);
    return true;
  }
  tr.turns.push({ who: 'me', t: t }); tr.last = Date.now(); saveState(st);
  let r = ''; try { r = await ST.customerTurn(tr); } catch (e) { log('train turn: ' + e.message); }
  if (!r) { await waSend(to, '(תקלה רגעית, הלקוח לא ענה. אפשר לכתוב שוב.)'); return true; }
  const s3 = loadState(); const t3 = s3.train && s3.train[to];
  if (t3) { t3.turns.push({ who: 'client', t: r }); t3.last = Date.now(); saveState(s3); }
  await waSend(to, r);
  return true;
}

// 7.11: chat mode per number (st.chat[number] = {at}): text and voice go to the fast chat (lib/fast-chat.js), shared with the page.
// It ends by itself after 30 minutes without a message. Only where the owner feature is on (Itzik's own monitor).
const CHAT_IDLE_MS = 30 * 60e3;
function chatLive(to) { const c = (loadState().chat || {})[to]; return !!(c && c.at && Date.now() - c.at < CHAT_IDLE_MS); }
async function chatReply(to, text) {
  const sv = loadState();
  if (sv.voice && sv.voice[to]) { sv.last = sv.last || {}; sv.last[to] = text; saveState(sv); return queueVoice(to, text, true); }
  return waSend(to, text);
}
async function chatTurn(to, t, m) {
  const FCm = require('./lib/fast-chat.js');
  let inst = {}; try { inst = require('./lib/instance.js'); } catch (e) {}
  let on = false; try { on = require('./lib/features.js').read(DATA, inst.name).fastChat === true; } catch (e) {}
  if (!on) return false;
  const st = loadState(); st.chat = st.chat || {};
  if (FCm.chatOn(t)) { st.chat[to] = { at: Date.now() }; saveState(st); await waSend(to, "עברנו לשיחה. כל מה שתכתוב יענה מיד. 'מצב בקשות' כדי לחזור."); return true; }
  if (FCm.chatOff(t)) { delete st.chat[to]; saveState(st); await waSend(to, 'חזרנו לבקשות. כל הודעה נכנסת לתור לביצוע.'); return true; }
  if (!chatLive(to)) { if (st.chat[to]) { delete st.chat[to]; saveState(st); } return false; }
  if (demoOn()) return false;
  if (m && m.context && m.context.id) return false; // a quoted reply continues that thread, in the normal flow
  if ((isAllCommand(t) && !/^\s*המשך/.test(t)) || voiceCommand(t)) return false;
  st.chat[to].at = Date.now(); saveState(st);
  if (FCm.isTodoCmd(t)) {
    const r = await FCm.todoLast(DATA, toMonitor);
    await waSend(to, r.status === 200 ? (r.json.dup ? '✓ כבר נשלח לביצוע' : '✓ נשלח לביצוע') : 'אין עדיין מה להעביר לביצוע.');
    return true;
  }
  let biz = ''; try { biz = JSON.parse(fs.readFileSync(path.join(ROOT, 'instance.json'), 'utf8')).business || ''; } catch (e) {}
  const th0 = FCm.load(DATA);
  const ending = th0.mode === 'sales' && ST.isEnd(t);
  if (ending) await waSend(to, '📝 מסכם ונותן ציון, כחצי דקה.');
  const r = await FCm.turn(DATA, t, { via: 'wa', context: () => chatContext(null), owner: inst.name === 'abaitzik', business: biz || (inst.profile && inst.profile.business) || '' });
  if (ending && r.mode === 'chat' && r.reply) {
    const sc = th0.sales && th0.sales.scenario;
    writeChat('🎭 אימון מכירות' + (sc ? ': ' + sc : '') + String.fromCharCode(10, 10) + r.reply + (r.kept ? String.fromCharCode(10, 10) + 'השיחה המלאה: files/' + r.kept : ''));
  }
  if (r.reply) await chatReply(to, r.reply);
  return true;
}

async function onMessage(m, contactName) {
  const st = loadState();
  if (st.seen[m.id]) return;
  st.seen[m.id] = Date.now();
  saveState(st);
  const allow = (cfg().allow || []).map(String);
  if (allow.indexOf(String(m.from)) < 0) { log('not on the allow list: ' + String(m.from).slice(0, 5) + '...'); return; }
  markRead(m.id);
  // 4.11: Meta's 24 hour window opens with his message; lib/wa-out.js reads this.
  { const sl = loadState(); sl.lastIn = sl.lastIn || {}; sl.lastIn[m.from] = Date.now(); saveState(sl); }
  // 1.11, for Shai's demo: "summarize meetings and send tasks", by voice, on WhatsApp.
  // The voice note is downloaded from Meta, transcribed with the monitor's own transcribe.js,
  // and goes on as text, exactly like a typed message.
  const CA = require('./lib/call-analysis.js');
  if (CA.isCall(m)) {
    const o = m[m.type] || {};
    await waSend(m.from, '📞 קיבלתי את הקלטת השיחה. מתמלל ומנתח, בשיחה ארוכה זה לוקח כמה דקות.');
    let r = { text: '', seconds: 0 };
    try { r = await CA.transcribe(ROOT, await mediaFile(o.id, CA.extOf(m))); } catch (e) { log('call failed: ' + e.message); }
    if (!r.text) { await waSend(m.from, 'לא הצלחתי לתמלל את השיחה. אפשר לשלוח את הקובץ שוב.'); return; }
    const txt = CA.keep(DATA, o.filename || '', r.text);
    const cid = await toMonitor('וואטסאפ', CA.request({ name: o.filename || '', seconds: r.seconds, txt: txt, transcript: r.text }) + (o.caption ? String.fromCharCode(10, 10) + 'מה שהוא כתב עם הקובץ: ' + o.caption : ''));
    const sc = loadState(); sc.pending[cid] = { to: m.from, at: Date.now(), name: contactName || '' }; saveState(sc);
    log('call ' + m.id + ' -> ntfy-' + cid + ' (' + r.seconds + 's, ' + r.text.length + ' chars)');
    await waSend(m.from, '✓ תמללתי ' + (r.seconds ? 'כ ' + Math.max(1, Math.round(r.seconds / 60)) + ' דקות' : 'את השיחה') + '. הניתוח יגיע לכאן.');
    return;
  }
  if (m.type === 'audio' && m.audio && m.audio.id) {
    const training = ST.active((loadState().train || {})[m.from]);
    const inChat = chatLive(m.from);
    if (!training && !inChat) await waSend(m.from, '🎙️ קיבלתי את ההקלטה, מתמלל.');
    let heard = '';
    try { heard = await voiceText(m.audio.id); } catch (e) { log('voice failed: ' + e.message); }
    if (!heard) { await waSend(m.from, 'לא הצלחתי לתמלל את ההקלטה. אפשר לשלוח שוב, או לכתוב.'); return; }
    if (await chatTurn(m.from, heard, m)) return;
    if (training && await trainTurn(m.from, heard)) return;
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
  if (await chatTurn(m.from, t, m)) return;
  if (await trainTurn(m.from, t)) return;
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
  // 4.11: "הכל" sends the whole of a long answer that came here short (the quoted one, else the last).
  const quoted = m.context && m.context.id ? waOut.recall(DATA, m.context.id) : null;
  if (isAllCommand(t)) {
    const sa = loadState(); sa.long = sa.long || {};
    const full = (quoted && quoted.re && sa.long[quoted.re]) || (sa.lastLong && sa.lastLong[m.from] && sa.long[sa.lastLong[m.from]]);
    if (full) { await sendLongParts(m.from, full, { re: (quoted && quoted.re) || sa.lastLong[m.from], text: full.slice(0, 1500) }); return; }
  }
  // 4.11: a quoted reply continues that thread; the quoted text goes along as context.
  let body = t, re = '';
  if (quoted) {
    re = quoted.re || '';
    body = 'בהמשך להודעה שלך בוואטסאפ: "' + String(quoted.text || '').replace(/\s+/g, ' ').slice(0, 400) + '"' + String.fromCharCode(10) + t;
  } else {
    // Not quoted, but the last thing here was the monitor speaking first (the daily
    // message or an alert): a short answer like "תטפל בליד" is about that.
    const lastOwn = latestOwn(m.from);
    if (lastOwn && (lastOwn.kind === 'daily' || lastOwn.kind === 'alert') && Date.now() - lastOwn.at < 12 * 3600e3) {
      body = t + String.fromCharCode(10, 10) + '(ההקשר: ההודעה האחרונה שהמוניטור שלח לו בוואטסאפ, ביוזמתו: "' + String(lastOwn.text || '').replace(/\s+/g, ' ').slice(0, 600) + '")';
    }
  }
  const id = await toMonitor('וואטסאפ', demoOn() ? DEMO_FRAME + body : body, re);
  const s2 = loadState();
  s2.pending[id] = { to: m.from, at: Date.now(), name: contactName || '' };
  if (re) s2.pending[id].re = re;
  // A question that itself asks to be read ("ותקריא לי", "בהקראה") gets this one answer as voice.
  if (/(?:תקריא|תקריאי|הקרא|תקרא|בהקראה|בקול|הודעה קולית)/.test(t)) s2.pending[id].voice = true;
  saveState(s2);
  log('in ' + m.id + ' -> ntfy-' + id + (re ? ' (continues ' + re + ')' : ''));
  await waSend(m.from, re ? '✓ קיבלתי, ממשיך מאותה שיחה. התשובה תגיע לכאן.' : '✓ קיבלתי, אני עובד על זה. התשובה תגיע לכאן.');
}
// The newest message the monitor itself sent to this number (lib/wa-out.js keeps them).
function latestOwn(to) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(path.join(DATA, 'status', 'wa-out.json'), 'utf8')); } catch (e) { return null; }
  let best = null;
  Object.keys(j).forEach(function (k) { const r = j[k]; if (r && (!best || r.at > best.at)) best = r; });
  return best;
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
    // 4.11: the thread a quoted reply continues is the question's own thread (its re), else the question.
    const root = st.pending[d.re].re || d.re;
    const short = asVoice ? null : shortOf(d.text, d.re);
    if (short) {
      const sl = loadState(); sl.long = sl.long || {}; sl.lastLong = sl.lastLong || {};
      sl.long[d.re] = d.text; sl.lastLong[to] = d.re;
      const lk = Object.keys(sl.long); if (lk.length > 30) lk.slice(0, lk.length - 30).forEach(function (k) { delete sl.long[k]; });
      saveState(sl);
    }
    const mem = { re: root, text: d.text.slice(0, 1500) };
    (asVoice ? queueVoice(to, d.text, true) : waSend(to, short || d.text, mem)).then(function () {
      log('out ' + f + ' -> ' + d.re + (asVoice ? ' (voice)' : ''));
    })
      .catch(function (e) { log('send failed ' + f + ': ' + e.message); const s3 = loadState(); delete s3.sent[f]; saveState(s3); });
  });
  // a question waits for answers for 6 hours, then is let go
  const s4 = loadState(); let ch = false;
  Object.keys(s4.pending).forEach(function (k) { if (Date.now() - s4.pending[k].at > 6 * 3600e3) { delete s4.pending[k]; ch = true; } });
  if (ch) saveState(s4);
}

/*
  4.11.2026: one number per monitor.

  Itzik's bridge is the only one Meta talks to (wa.abaitzik.com/webhook). Each
  customer's monitor runs its own wa-bridge.js on its own port, as its own user,
  with its own data/wa.json (its phoneId, its token, its owner on allow). Itzik's
  data/wa.json lists them:  "routes": { "<phone_number_id>": { "port": 8811, "tenant": "shai" } }
  The raw body goes on unchanged with Meta's signature, so the customer's bridge
  checks it with the same app secret. Each bridge acts only on its own number:
  what is not its own is either routed (Itzik's) or dropped, never mixed.
  Set up with setup/wa-tenant.sh <tenant>.
*/
function route(pid) {
  let c = {}; try { c = cfg(); } catch (e) { return 'unknown'; }
  if (!pid || !c.phoneId || pid === String(c.phoneId)) return 'mine';
  return c.routes && c.routes[pid] ? 'other' : 'unknown';
}
function forward(pid, raw, sig) {
  const r = (cfg().routes || {})[pid];
  const x = http.request({ method: 'POST', hostname: '127.0.0.1', port: r.port, path: '/webhook',
    headers: { 'Content-Type': 'application/json', 'Content-Length': raw.length, 'X-Hub-Signature-256': sig || '' } }, function (res) {
    res.resume(); log('routed to ' + (r.tenant || r.port) + ': ' + res.statusCode);
  });
  x.on('error', function (e) { log('!! route to ' + (r.tenant || r.port) + ' failed: ' + e.message); });
  x.setTimeout(10000, function () { x.destroy(new Error('timeout')); });
  x.end(raw);
}

function readBody(q, max) {
  return new Promise(function (resolve, reject) {
    const ch = []; let n = 0;
    q.on('data', function (c) { n += c.length; if (n > max) { reject(new Error('big')); q.destroy(); } else ch.push(c); });
    q.on('end', function () { resolve(Buffer.concat(ch)); });
    q.on('error', reject);
  });
}
// 4.11, איציק: "איך לא נתת לי שום התראה, לא בווילון". toMonitor רק כותב לצ׳אט כהודעה שלו, בלי push.
// לכן כל אירוע מטופס (חתימה, הצעה, הקמה) יוצא גם כהתראה לטלפון דרך notify.js.
function formNotify(kind, text) {
  try { require("child_process").execFile(process.execPath, [path.join(__dirname, "notify.js"), "✍️ " + kind, String(text).split(String.fromCharCode(10)).slice(0, 3).join(String.fromCharCode(10))], { cwd: __dirname, timeout: 60000 }, function (e) { if (e) log("form push failed: " + e.message); }); } catch (e) { log("form push failed: " + e.message); }
  toMonitor(kind, text).then(function (id) { log('form -> ntfy-' + id); }, function (e) { log('form notify failed: ' + e.message); }); }
function codeOk(c) { const o = ownerCode(); return !!o && String(c || '') === o; }
/*
  7.11: every customer's monitor has the fast chat. Its key sits in its own data/fc-key.txt (sealed in its
  page) and here in data/fastchat/tenants.json { name: { key, dir, business } }. Its thread lives here under
  data/fastchat/t/<name>; "להעביר לביצוע" lands in its own request queue (an ACL lets this user write there).
*/
// 7.11: what the chat knows (lib/chat-context.js). A customer: his setup page from sources.json, his data if readable.
function chatContext(tn) {
  const F = require('./lib/features.js');
  if (!tn) { let n = ''; try { n = require('./lib/instance.js').name; } catch (e) {} return require('./lib/chat-context.js').build({ dataPath: DATA, instName: n, features: F.read(DATA, n) }); }
  let src = null; try { src = JSON.parse(fs.readFileSync(path.join(DATA, 'cal', 'sources.json'), 'utf8')).find((x) => x.name === tn.name) || null; } catch (e) {}
  return require('./lib/chat-context.js').build({ dataPath: path.join(tn.dir, 'data'), instName: tn.name, features: F.read(path.join(tn.dir, 'data'), tn.name),
    tok: src && src.setup, setupDir: path.join(DATA, 'setup') });
}
// 11.11.2026: who pays for a monitor: the self signup record when there is one, else the tenant record.
function payWho(id) {
  const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
  const q = /^t[a-f0-9]{6}$/.test(id) ? rj(path.join(DATA, 'signup', 'queue', id + '.json')) : null;
  const t = rj(path.join(DATA, 'tenants', 'tenants', id + '.json')) || {};
  const host = (q && q.host) || t.host || '';
  return { name: (q && q.name) || t.title || id, email: (q && q.email) || '', phone: (q && q.phone) || '', home: host ? 'https://' + host + '/' : null };
}
/*
  11.11.2026: back from SUMIT. The payment is checked with SUMIT itself (never trusted from the URL), once per payment id:
  the monitor moves from trial to the entry package, the monthly charge starts next month on the saved card, and Itzik
  gets a 📋 לטיפול line. Then the customer goes back to his monitor.
*/
async function payDone(u, s) {
  const P = require('./lib/sumit.js');
  const pid = String(u.searchParams.get('OG-PaymentID') || '').replace(/\D/g, '');
  const ext = String(u.searchParams.get('OG-ExternalIdentifier') || '');
  if (!pid || !/^[a-z0-9-]+$/.test(ext)) throw new Error('bad return params');
  const dir = path.join(DATA, 'pay'); fs.mkdirSync(dir, { recursive: true });
  const rec = path.join(dir, pid + '.json');
  const who = payWho(ext);
  if (!fs.existsSync(rec)) {
    const p = await P.getPayment(pid);
    if (!P.paymentOk(p)) throw new Error('payment ' + pid + ' not valid');
    const out = { at: new Date().toISOString(), tenant: ext, paymentId: Number(pid), customerId: p.CustomerID, amount: p.Amount, recurring: null };
    fs.writeFileSync(rec, JSON.stringify(out, null, 1));
    // The package: entry from now on (the plan file is read by the customer's worker and page).
    const pf = '/srv/monitor-changes/' + ext + '.plan.json';
    let st = {}; try { st = JSON.parse(fs.readFileSync(pf, 'utf8')); } catch (e) {}
    const month = require('./lib/plan.js').monthOf();
    st = Object.assign({}, st, { plan: 'entry', month, extra: 0, applied: st.applied || [], history: (st.history || []).concat([{ at: out.at, kind: 'paid', plan: 'entry', paymentId: Number(pid) }]) });
    delete st.start;
    fs.writeFileSync(pf + '.tmp', JSON.stringify(st, null, 1)); fs.renameSync(pf + '.tmp', pf);
    try { out.recurring = await P.startRecurring(p.CustomerID); } catch (e) { out.recurringError = e.message; log('pay recurring: ' + e.message); }
    fs.writeFileSync(rec, JSON.stringify(out, null, 1));
    try { require('./lib/handle.js').complete({ key: 'paid-' + pid, kind: 'lead', who: who.name, title: 'שילם על חבילת הכניסה (' + p.Amount + ' ₪).' + (out.recurringError ? ' החיוב החודשי לא נפתח, לפתוח בסאמיט.' : ' החיוב החודשי נפתח מהחודש הבא.'), link: 'biz' }); } catch (e) { log('pay handle: ' + e.message); }
    log('paid ' + ext + ' ' + pid);
  }
  s.writeHead(302, { Location: who.home ? who.home + '?paid=1' : 'https://it-solution.co.il/trial/?paid=1' });
  s.end();
}
function tenantByKey(c) {
  c = String(c || ''); if (c.length < 24) return null;
  let all = {}; try { all = JSON.parse(fs.readFileSync(path.join(DATA, 'fastchat', 'tenants.json'), 'utf8')) || {}; } catch (e) { return null; }
  for (const n of Object.keys(all)) { const t = all[n]; if (t && t.key && t.key.length === c.length && crypto.timingSafeEqual(Buffer.from(t.key), Buffer.from(c))) return Object.assign({ name: n }, t); }
  return null;
}
function tenantToMonitor(tn) {
  return async function (kind, text) {
    const dir = path.join(tn.dir, 'data', 'chat', 'chat');
    const pad = (n) => String(n).padStart(2, '0');
    const at = new Date();
    const base = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-' + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds()) + '-itzik-auto';
    let name = base + '.json';
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = base + '-' + i + '.json';
    const id = 'fc-' + at.getTime().toString(36) + crypto.randomBytes(3).toString('hex');
    const rec = { at: at.toISOString(), from: 'itzik', text: kind + String.fromCharCode(10) + text, status: 'working', ackAt: at.toISOString(), id: id, auto: true, via: 'fast-chat' };
    fs.writeFileSync(path.join(dir, name + '.tmp'), JSON.stringify(rec, null, 1), { encoding: 'utf8', mode: 0o664 });
    fs.renameSync(path.join(dir, name + '.tmp'), path.join(dir, name));
    log('fast chat todo -> ' + tn.name + ' ' + id);
    return id;
  };
}
// The demo page talks to the bridge: ask a question, read its answer, turn demo on and off.
async function api(q, s, u) {
  const origin = q.headers.origin || '';
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (originOk(origin)) { h['Access-Control-Allow-Origin'] = origin; h['Access-Control-Allow-Headers'] = 'Content-Type'; h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'; }
  if (q.method === 'OPTIONS') { s.writeHead(204, h); return s.end(); }
  if (q.method !== 'POST') { s.writeHead(405, h); return s.end('{}'); }
  let b; try { b = JSON.parse((await readBody(q, 20000)).toString('utf8')); } catch (e) { s.writeHead(400, h); return s.end('{}'); }
  // 11.11.2026: the self signup (lib/signup.js). Public, no code: the email code is the check. A verified signup waits in
  // data/signup/queue/ for its trial monitor (setup/signup-provision.sh), and lands in Itzik's 📋 לטיפול.
  if (u.pathname === '/api/signup' || u.pathname === '/api/signup/verify' || u.pathname === '/api/signup/profile' || u.pathname === '/api/signup/status') {
    const S = require('./lib/signup.js'), M = require('./lib/mailer.js');
    const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '-').split(',')[0].trim();
    const send = function (code, o) { s.writeHead(code, h); s.end(JSON.stringify(o)); };
    try {
      // 11.11: the questionnaire while the monitor is built, and the build status (both need the page token from verify)
      if (u.pathname === '/api/signup/profile') { const r = S.saveProfile(DATA, b); return send(r.ok ? 200 : 400, r); }
      if (u.pathname === '/api/signup/status') { const r = S.status(DATA, b); return send(r.ok ? 200 : 400, r); }
      if (u.pathname === '/api/signup') {
        const r = S.start(DATA, Object.assign({}, b, { ip }));
        if (!r.ok) return send(r.error === 'limit' ? 429 : 400, { error: r.error });
        const m = await M.send(DATA, Object.assign({ to: r.email }, M.codeMail(r.name, r.code)));
        log('signup code ' + (m.ok ? 'sent' : 'not sent (' + m.error + ')'));
        return send(m.ok ? 200 : 503, m.ok ? { ok: true } : { error: 'mail' });
      }
      const v = S.verify(DATA, b);
      if (!v.ok) return send(400, { error: v.error });
      if (v.fresh) {
        try { require('./lib/handle.js').complete({ key: 'signup-' + v.id, kind: 'lead', who: v.name, title: 'נרשם לשבוע ניסיון ואימת מייל (' + (v.phone || v.email) + '). המוניטור שלו נפתח עכשיו.', link: 'biz' }); } catch (e) { log('signup handle: ' + e.message); }
      }
      // 11.11: the page shows an entry button to the monitor being built (the login code goes only by mail)
      return send(200, { ok: true, id: v.id, pt: v.pt, host: v.id ? v.id + '.m.it-solution.co.il' : '' });
    } catch (e) { log('signup: ' + e.message); return send(500, { error: 'server' }); }
  }
  // 11.11.2026: the entry package payment. The customer's page sends its visit key in the body (never the URL); we open a
  // SUMIT payment page for that monitor. Without SUMIT credentials: 503, and the page sends a request to Itzik instead.
  if (u.pathname === '/api/pay/start') {
    const vn = require('./lib/visits.js').nameByKey(DATA, b.key);
    if (!vn) { s.writeHead(403, h); return s.end('{"error":"key"}'); }
    const P = require('./lib/sumit.js');
    if (!P.ready()) { s.writeHead(503, h); return s.end('{"error":"pay"}'); }
    try {
      const who = payWho(vn);
      const url = await P.beginEntry({ tenant: vn, name: who.name, email: who.email, phone: who.phone, redirect: 'https://wa.abaitzik.com/api/pay/done', cancel: who.home });
      s.writeHead(200, h); return s.end(JSON.stringify({ url }));
    } catch (e) { log('pay start: ' + e.message); s.writeHead(502, h); return s.end('{"error":"pay"}'); }
  }
  // 11.11: a customer's page says when it is open and for how long (lib/visits.js), with its own visit key.
  if (u.pathname === '/api/visit') {
    const V = require('./lib/visits.js');
    const vn = V.nameByKey(DATA, b.key);
    if (!vn) { s.writeHead(403, h); return s.end('{"error":"key"}'); }
    try { V.record(DATA, vn, b); if (b.ev === 'start' || b.ev === 'end') V.buildSoon(); } catch (e) { log('visit: ' + e.message); }
    s.writeHead(200, h); return s.end('{"ok":true}');
  }
  // 7.11: a customer's monitor talks to its own chat with its own key (data/fastchat/tenants.json).
  if (/^\/api\/chat(\/thread|\/todo)?$/.test(u.pathname) && !codeOk(b.code)) {
    const tn = tenantByKey(b.code);
    if (!tn) { s.writeHead(403, h); return s.end('{"error":"code"}'); }
    // 11.11.2026: a customer's chat and trainings run on the customers' API key, never on Itzik's subscription.
    let cst; try { cst = require('./lib/sales-train.js').forCustomer(); } catch (e) { log('customer chat: ' + e.message); s.writeHead(503, h); return s.end('{"error":"key"}'); }
    const r = await require('./lib/fast-chat.js').chatApi(u.pathname, b, { llm: cst.llm, salesTrain: cst, dataPath: path.join(DATA, 'fastchat', 't', tn.name),
      toMonitor: tenantToMonitor(tn), owner: false, business: tn.business || '', enabled: true, context: () => chatContext(tn) });
    s.writeHead(r.status, h); return s.end(JSON.stringify(r.json));
  }
  if (!codeOk(b.code)) { s.writeHead(403, h); return s.end('{"error":"code"}'); }
  const send = function (o) { s.writeHead(200, h); s.end(JSON.stringify(o)); };
  // 10.11: Itzik's own monitor page says it was opened (lib/owner-open.js). Only the owner code gets here.
  if (u.pathname === '/api/owner-open') {
    try { require('./lib/owner-open.js').record(DATA, String(b.src || 'load')); } catch (e) { log('owner-open: ' + e.message); }
    return send({ ok: true });
  }
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
  if (u.pathname === '/api/chat' || u.pathname === '/api/chat/thread' || u.pathname === '/api/chat/todo') {
    // 7.11: fast consulting chat (lib/fast-chat.js), after the code check above.
    let inst = {}; try { inst = require('./lib/instance.js'); } catch (e) {}
    const bizOf = function (i) { let raw = ''; try { raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'instance.json'), 'utf8')).business || ''; } catch (e) {} return raw || (i.profile && i.profile.business) || ''; };
    let enabled = false; try { enabled = require('./lib/features.js').read(DATA, inst.name).fastChat === true; } catch (e) {}
    const r = await require('./lib/fast-chat.js').chatApi(u.pathname, b, { dataPath: DATA, toMonitor: toMonitor, owner: inst.name === 'abaitzik', business: bizOf(inst), enabled: enabled, context: () => chatContext(null) });
    s.writeHead(r.status, h); return s.end(JSON.stringify(r.json));
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
  if (fm && q.method === 'GET') { if (fm[2]) require('./owner-mark.js').setCookie(s); if (fm[2]) require('./form-view.js').serve('./forms.js', fm[1], s); else require('./forms.js').servePage(fm[1], s); return; }
  // 4.11: sign an existing document (docsign.js), /d/<signer token>[/signed|/pN.png] and /api/docsign.
  const dm = u.pathname.match(/^\/d\/([a-f0-9]{16,40})(?:\/(signed|p\d{1,2}\.png))?\/?$/);
  if (dm && q.method === 'GET') { require('./docsign.js').serve(dm[1], dm[2], s); return; }
  if (u.pathname === '/api/docsign') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 700000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',')[0].trim();
      require('./docsign.js').handlePost(b, formNotify, ip, q.headers['user-agent'], function (r) { s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body)); });
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  // 8.11: a client signs the agreement (with its security annex) and the clinic NDA together (agrsign.js), /a/<token>[/view|/signed] and /api/agr.
  const am = u.pathname.match(/^\/a\/([a-f0-9]{16,40})(?:\/(view|signed))?\/?$/);
  if (am && q.method === 'GET') { require('./agrsign.js').serve(am[1], am[2], s); return; }
  if (u.pathname === '/api/agr') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 700000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',')[0].trim();
      require('./agrsign.js').handlePost(b, formNotify, ip, q.headers['user-agent'], function (r) { s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body)); });
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  // 5.11: the IT Solution NDA, signed on the phone (ndasign.js), /n/<token>[/pdf|/signed] and /api/nda.
  const nm = u.pathname.match(/^\/n\/([a-f0-9]{16,40})(?:\/(pdf|signed))?\/?$/);
  if (nm && q.method === 'GET') { require('./ndasign.js').serve(nm[1], nm[2], s); return; }
  if (u.pathname === '/api/nda') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 700000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',')[0].trim();
      require('./ndasign.js').handlePost(b, formNotify, ip, q.headers['user-agent'], function (r) { s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body)); });
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  // 2.11: sign a quote on the phone (sign.js), /q/<token>[/pdf|/signed] and /api/sign.
  const qm = u.pathname.match(/^\/q\/([a-f0-9]{16,40})(?:\/(pdf|signed|view))?\/?$/);
  if (qm && q.method === 'GET') { require('./sign.js').servePage(qm[1], qm[2], s); return; }
  if (u.pathname.replace(/\/$/, '') === '/terms' && q.method === 'GET') { require('./sign.js').serveTerms(s); return; }
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
  // 5.11: "Connect with Google / Facebook" on the setup page (lib/oauth.js, setup.js).
  const om = u.pathname.match(/^\/oauth\/(google|meta|microsoft|fireflies|linkedin|tiktok)\/(start|callback)\/?$/);
  if (om && q.method === "GET") {
    if (om[2] === "start" && !require("./setup.js").gateOk(u.searchParams.get("t"), q)) { s.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); return s.end("צריך להיכנס עם הסיסמה של הטופס"); }
    if (om[2] === "start") require("./setup.js").oauthStart(om[1], u.searchParams, s);
    else require("./setup.js").oauthCallback(om[1], u.searchParams, s, formNotify).catch(function (e) { log("oauth: " + e.message); try { s.writeHead(500); s.end(); } catch (x) {} });
    return;
  }
  // 9.11: a customer's video for Meta, a signed address that stops working after a few hours (lib/social-media.js).
  if (u.pathname.indexOf('/m/') === 0 && (q.method === 'GET' || q.method === 'HEAD')) { require('./lib/social-media.js').serve(u.pathname, q, s); return; }
  // 1.11: client setup page (setup.js), /s/<token> and /api/setup.
  const sm = u.pathname.match(/^\/s\/([a-f0-9]{16,40})(\/view)?\/?$/);
  if (sm && q.method === 'GET') { if (sm[2]) require('./owner-mark.js').setCookie(s); if (sm[2]) require('./form-view.js').serve('./setup.js', sm[1], s); else require('./setup.js').servePage(sm[1], s, q); return; }
  // 9.11: the password box of a protected setup page (setup.js handleGate).
  if (u.pathname === '/api/setup-gate') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 2000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      const r = require('./setup.js').handleGate(b, q, formNotify);
      const h = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }; if (r.cookie) h['Set-Cookie'] = r.cookie;
      s.writeHead(r.status, h); s.end(JSON.stringify(r.body));
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  // 8.11: files from an upload card of a setup page (setup.js handleFile), up to 20MB as base64.
  if (u.pathname === '/api/setup-file') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 28 * 1024 * 1024).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      if (!require('./setup.js').gateOk(b && b.t, q)) { s.writeHead(403); return s.end('{}'); }
      const r = require('./setup.js').handleFile(b, formNotify);
      s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body));
    }).catch(function () { try { s.writeHead(413); s.end('{}'); } catch (e) {} });
    return;
  }
  if (u.pathname === '/api/setup') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 20000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      if (!require('./setup.js').gateOk(b && b.t, q)) { s.writeHead(403); return s.end('{}'); }
      return Promise.resolve(require('./setup.js').handlePost(b, formNotify, require('./owner-mark.js').meta(q))).then(function (r) {
        s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body));
      });
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  if (u.pathname === '/api/form') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 20000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      const r = require('./forms.js').handlePost(b, formNotify, require('./owner-mark.js').meta(q));
      s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body));
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  // 11.11.2026: SUMIT sends the customer back here after paying (lib/sumit.js). GET, so it is handled before api().
  if (u.pathname === '/api/pay/done' && q.method === 'GET') { payDone(u, s).catch(function (e) { log('pay done: ' + e.message); try { s.writeHead(302, { Location: 'https://it-solution.co.il/trial/?pay=error' }); s.end(); } catch (x) {} }); return; }
  if (u.pathname.indexOf('/api/') === 0) { api(q, s, u).catch(function (e) {
    log('api: ' + e.message);
    try {
      const o = q.headers.origin || '';
      const eh = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
      if (originOk(o)) { eh['Access-Control-Allow-Origin'] = o; eh['Access-Control-Allow-Headers'] = 'Content-Type'; eh['Access-Control-Allow-Methods'] = 'POST, OPTIONS'; }
      s.writeHead(500, eh); s.end('{}');
    } catch (x) {}
  }); return; }
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
    const forwarded = {};
    (d.entry || []).forEach(function (e) {
      (e.changes || []).forEach(function (c) {
        const v = c.value || {};
        // 4.11: every customer on their own number. Meta sends all numbers to this one webhook;
        // a message to another number goes to that customer's own bridge, never into this monitor.
        const pid = String((v.metadata && v.metadata.phone_number_id) || '');
        const dest = route(pid);
        if (dest === 'other') { if (!forwarded[pid]) { forwarded[pid] = 1; forward(pid, raw, q.headers['x-hub-signature-256']); } return; }
        if (dest === 'unknown') { if ((v.messages || []).length) log('message for an unknown number ' + pid.slice(0, 6) + '..., dropped'); return; }
        const name = v.contacts && v.contacts[0] && v.contacts[0].profile && v.contacts[0].profile.name;
        (v.messages || []).forEach(function (m) { onMessage(m, name).catch(function (err) { log('message failed: ' + err.message); }); });
        // 6.11: delivery reports, so "I did not get it" can be checked. Failures say why.
        (v.statuses || []).forEach(function (x) { if (x.status !== 'read') log('status ' + x.status + ' ' + String(x.id || '').slice(-12) + (x.errors && x.errors[0] ? ' ' + x.errors[0].code + ' ' + (x.errors[0].title || '') + ' ' + ((x.errors[0].error_data && x.errors[0].error_data.details) || '') : '')); });
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
module.exports = { textOf, sigOk, voiceCommand, speakable, shortOf, isAllCommand, route };
