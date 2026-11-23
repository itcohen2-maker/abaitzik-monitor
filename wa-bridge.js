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
    { verifyToken, appSecret, token, phoneId, allow: ["9725..."], graph: "v21.0",
      kapsoKey, kapsoSecret, kapsoGraph }   (the last three are optional, see below)
  12.11.2026, Itzik decided to connect customers' WhatsApp through Kapso (a BSP) to start selling; the same
  number moves to our own Meta app later. With kapsoKey the calls go through Kapso's Meta compatible proxy
  (lib/wa-api.js); the webhook is Meta's payload, signed with X-Webhook-Signature (kapsoSecret). Without
  kapsoKey everything is Meta direct, exactly as before.
  State: data/status/wa-bridge.json (which ntfy id came from which number,
  and which answers were already sent).

  Run: node wa-bridge.js   (service monitor-wa.service, 127.0.0.1:8796)
*/
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const WA = require('./lib/wa-api.js');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
// 12.11.2026: WA_BRIDGE_DATA lets the tests point the bridge at a temporary data folder.
const CFG = path.join(process.env.WA_BRIDGE_DATA || path.join(ROOT, 'data'), 'wa.json');
// 12.11.2026: the state follows WA_BRIDGE_DATA too, so a test never touches the real one.
const STATE = path.join(process.env.WA_BRIDGE_DATA || path.join(ROOT, 'data'), 'status', 'wa-bridge.json');
// 13.11.2026, Itzik: "במסך התשובות אני מקבל המון תשובות לא רלוונטיות". A test runs the bridge with WA_BRIDGE_DATA set to a
// temp folder, but CHAT was always the real one, so every npm test left a "הוואטסאפ פעיל" answer on his screen.
const CHAT = path.join(process.env.WA_BRIDGE_DATA || path.join(ROOT, 'data'), 'chat', 'chat');
const PORT = Number(process.env.WA_PORT || 8796);
const DEMO_FLAG = path.join(ROOT, 'data', 'demo', 'active.json');
const ORIGINS = ['https://itcohen2-maker.github.io', 'https://shai.it-solution.co.il', 'https://alon.abaitzik.com', 'https://rinat.abaitzik.com', 'https://pablo.it-solution.co.il', 'https://ilay.abaitzik.com', 'https://it-solution.co.il', 'https://www.it-solution.co.il'];
// 11.11.2026: every self signup trial monitor lives at https://<id>.m.it-solution.co.il, so those are allowed by pattern.
// 17.11.2026: the public demo monitor too (lib/public-demo.js); it holds no code, so it reaches only the public /api/demo/*.
// 21.11.2026: and the trade demos (lib/trades.js), exact hosts only.
// 22.11.2026: the dummy of Itzik's own monitor in the new look (setup/owner-dummy.sh), its exact host from setup/owner-dummy.host.
// It carries his own sealed code, so it is his chat; he said nothing worked there before this.
const OWNER_DUMMY = (() => { try { const h = fs.readFileSync(path.join(__dirname, 'setup', 'owner-dummy.host'), 'utf8').trim(); return /^[a-z0-9-]+\.m\.it-solution\.co\.il$/.test(h) ? 'https://' + h : ''; } catch (e) { return ''; } })();
function originOk(o) { return ORIGINS.indexOf(o) > -1 || (!!OWNER_DUMMY && o === OWNER_DUMMY) || o === 'https://demo.m.it-solution.co.il' || require('./lib/trades.js').isDemoOrigin(o) || /^https:\/\/t[a-f0-9]{6}\.m\.it-solution\.co\.il$/.test(String(o || '')); }
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
async function toMonitor(kind, text, re, files) {
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
  // 11.11: a file from WhatsApp is in data/inbox, like a page upload (lib/wa-media.js).
  if (files && files.length) rec.files = files;
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
  const r = await req('POST', WA.base(c) + '/' + c.phoneId + '/messages',
    Object.assign({ 'Content-Type': 'application/json' }, WA.auth(c)), Buffer.from(body, 'utf8'));
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
const WT = require('./lib/wa-tenants.js');
const WM = require('./lib/wa-media.js');
const QK = require('./lib/wa-quick.js');
const groupLib = require('./lib/group.js');
const DATA = process.env.WA_BRIDGE_DATA || path.join(ROOT, 'data');
const LONG = 700;
function pageUrl() {
  try { return require('./lib/instance.js').publicUrl || ''; } catch (e) { return ''; }
}
// 15.11: "files/<name>" in an answer becomes a full link, so it opens from WhatsApp.
function absFiles(text) {
  const base = pageUrl();
  if (!base) return String(text || '');
  // 21.11.2026: a private (sealed) file has no address of its own, the link opens it in the monitor's viewer
  return String(text || '').replace(/(^|[\s(])files\/([^\s)\]]+)/g, function (m, pre, name) {
    const tail = (name.match(/[.,;:!?]+$/) || [''])[0], clean = tail ? name.slice(0, -tail.length) : name;
    let priv = false; try { priv = clean.indexOf('..') < 0 && fs.statSync(path.join(DATA, 'files-private', clean)).isFile(); } catch (e) {}
    // 21.11.2026, Itzik ("1"): a private video goes as a direct link (WhatsApp opens links in its own browser, without the password)
    if (priv) { const vl = require('./lib/video-link.js').linkFor(DATA, clean); if (vl) return pre + vl + tail; }
    return pre + base + (priv ? '#file=' + encodeURIComponent(clean) : 'files/' + clean) + tail;
  });
}
/*
  15.11.2026, Itzik: "כל דבר שמישהו מבקש צירוף של משהו, ואם מצאת, אתה צריך לחבר את זה ולצרף את זה."
  A link is not enough: every files/<name> an answer names goes out after the text as the file itself
  (a PDF as a document, a picture as an image), for Itzik and for every customer. The file is looked up in the
  answering monitor's own data (files-private, then files). Up to 5 files, each up to 95MB (the document cap is 100).
*/
const DOC_MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', txt: 'text/plain', zip: 'application/zip', m4a: 'audio/mp4', mp3: 'audio/mpeg' };
function filesNamed(text, dataDir) {
  const out = [], re = /(^|[\s(])files\/([^\s)\]]+)/g; let m;
  while ((m = re.exec(String(text || ''))) && out.length < 5) {
    const name = m[2].replace(/[.,;:!?]+$/, '');
    if (!name || name.indexOf('..') > -1) continue;
    const hit = ['files-private', 'files'].map(function (d) { return path.join(dataDir, d, name); }).find(function (f) { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
    if (hit && out.indexOf(hit) < 0 && fs.statSync(hit).size <= 95 * 1024 * 1024) out.push(hit);
    // 23.11.2026: a named file the bridge cannot read was skipped in silence (Yosef's quote PDF never went out). Now it is a failure wa-health sees.
    if (!hit) log('file failed ' + name + ': not found or not readable in ' + dataDir);
  }
  return out;
}
async function waSendFiles(to, text, dataDir) {
  for (const f of filesNamed(text, dataDir)) {
    try {
      const ext = path.extname(f).slice(1).toLowerCase(), mime = DOC_MIME[ext] || 'application/octet-stream';
      const kind = /^image\/(jpeg|png)$/.test(mime) ? 'image' : (mime === 'video/mp4' ? 'video' : 'document');
      const id = await waUpload(f, mime), c = cfg();
      const media = kind === 'document' ? { id: id, filename: path.basename(f) } : { id: id };
      const o = { messaging_product: 'whatsapp', to: to, type: kind }; o[kind] = media;
      const r = await req('POST', WA.base(c) + '/' + c.phoneId + '/messages', Object.assign({ 'Content-Type': 'application/json' }, WA.auth(c)), Buffer.from(JSON.stringify(o), 'utf8'));
      log('file ' + path.basename(f) + ' -> ' + String(to).slice(0, 5) + '... ' + r.status + (r.status === 200 ? '' : ' ' + r.body.toString('utf8').slice(0, 160)));
    } catch (e) { log('file failed ' + path.basename(f) + ': ' + e.message.slice(0, 160)); }
  }
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
  const c = cfg(), H = WA.auth(c);
  const meta = await req('GET', WA.mediaMetaUrl(c, mediaId), H);
  if (meta.status !== 200) throw new Error('media meta ' + meta.status);
  const dl = WA.mediaDownload(c, JSON.parse(meta.body.toString('utf8')));
  const bin = await req('GET', dl.url, dl.headers);
  if (bin.status !== 200 || !bin.body.length) throw new Error('media get ' + bin.status);
  const dir = path.join(ROOT, 'data', 'inbox'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'wa-call-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + ext);
  fs.writeFileSync(file, bin.body);
  return file;
}

async function voiceText(mediaId) {
  const c = cfg(), H = WA.auth(c);
  const meta = await req('GET', WA.mediaMetaUrl(c, mediaId), H);
  if (meta.status !== 200) throw new Error('media meta ' + meta.status);
  const dl = WA.mediaDownload(c, JSON.parse(meta.body.toString('utf8')));
  const bin = await req('GET', dl.url, dl.headers);
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
    await req('POST', WA.base(c) + '/' + c.phoneId + '/messages',
      Object.assign({ 'Content-Type': 'application/json' }, WA.auth(c)),
      Buffer.from(JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: id }), 'utf8'));
  } catch (e) { /* a read mark is a courtesy */ }
}

// header: the X-Hub-Signature-256 value (old callers), or the whole headers object (either signature passes).
function sigOk(raw, header) {
  try {
    const h = header && typeof header === 'object' ? header : { 'x-hub-signature-256': header };
    return WA.sigOk(cfg(), raw, h);
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
  const r = await req('POST', WA.base(c) + '/' + c.phoneId + '/media',
    Object.assign({ 'Content-Type': 'multipart/form-data; boundary=' + b, 'Content-Length': body.length }, WA.auth(c)), body);
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
    return req('POST', WA.base(c) + '/' + c.phoneId + '/messages',
      Object.assign({ 'Content-Type': 'application/json' }, WA.auth(c)),
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
  // 13.11.2026, Itzik: "תענה בטקסט מעכשיו" is the same as "בלי הקראה".
  if (/^(?:תענה|תענו|תשיב|תשיבי)(?:\s+לי)?\s+(?:בטקסט|בכתב)(?:\s+(?:מעכשיו|מהיום|מכאן והלאה|מעתה))?[.!]*$/.test(x)) return { off: true };
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
  if (allow.indexOf(String(m.from)) < 0) {
    // 11.11: a customer's number goes to his own monitor (lib/wa-tenants.js). Itzik's numbers (allow) are checked first.
    const tn = WT.lookup(DATA, m.from);
    // 12.11: the quick connect phrase (lib/wa-quick.js) and "ניתוק" are answered before anything else.
    { const qt = textOf(m);
      if (tn && qt && QK.isDisconnect(qt)) return quickDisconnect(m, tn);
      if (qt && QK.looksLikeConnect(qt) && (!tn || QK.parse(qt))) return quickConnect(m, qt, contactName, tn); }
    if (tn) return tenantMessage(m, tn, contactName);
    // 12.11: on Itzik's own instance a stranger becomes a lead (lib/wa-stranger.js); on any other instance he is still dropped.
    if (isOwnerInstance()) return strangerMessage(m, contactName);
    log('not on the allow list: ' + String(m.from).slice(0, 5) + '...'); return;
  }
  markRead(m.id);
  { const said = alarmTap(m, 'abaitzik'); if (said) { await waSend(m.from, said); return; } }
  // 22.11.2026 (idea 202611172144-quickconnect): his own number sending the quick connect phrase gets a fixed answer, no session.
  { const qt = textOf(m);
    if (qt && QK.looksLikeConnect(qt) && QK.parse(qt)) { log('quick connect from the owner number, answered'); await waSend(m.from, 'המספר הזה כבר מחובר למוניטור שלך ✓. כדי לבדוק חיבור מהיר של לקוח, שולחים את ההודעה מטלפון אחר.'); return; } }
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
  { const mp = WM.partOf(m); if (mp) return mediaIn(m, mp, null, contactName); }
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
  // 14.11: "בנק" / "התחברתי" / "ביטול בנק" run the bank download on the bank computer (lib/bank-flow.js).
  try {
    if (isOwnerInstance() && await require('./lib/bank-flow.js').waTurn({ root: ROOT, dataPath: DATA, text: t, send: (s) => waSend(m.from, s), owner: true })) return;
  } catch (e) { log('bank flow failed: ' + e.message); await waSend(m.from, 'חיבור הבנק נתקע: ' + String(e.message).slice(0, 160)); return; }
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
  // 13.11.2026: "מה המצב" is answered here, in code. A session took it and sometimes ended with no answer (הוחזר לתור).
  if (require('./lib/wa-status-ask.js').isStatusAsk(t)) {
    const SA = require('./lib/wa-status-ask.js');
    const reply = SA.statusReply({ lastOwnAt: (latestOwn(m.from) || {}).at || 0, waiting: Object.keys(loadState().pending || {}).length });
    await waSend(m.from, reply);
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
      fs.writeFileSync(path.join(CHAT, stamp + '-claude-wa-status-' + Date.now().toString(36) + '.json'),
        JSON.stringify({ at: new Date().toISOString(), from: 'claude', text: reply }, null, 1), 'utf8');
    } catch (e) { log('!! status chat note: ' + e.message); }
    log('status question answered in code: ' + m.id);
    return;
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
/*
  11.11.2026: a customer writes to the IT Solution number. Text, a voice note (transcribed here) or a file caption goes
  into his own monitor's queue; a forwarded message also lands at once in his 📋 לטיפול. The answer goes back from
  sweep(). On Meta's test number a reply reaches him only after Itzik approved his number in the App Dashboard.
*/
async function tenantSend(to, text) {
  try { await waSend(to, text); return true; } catch (e) { log('tenant send failed ' + String(to).slice(0, 5) + '...: ' + e.message.slice(0, 160)); return false; }
}
/*
  12.11.2026, Itzik: "כן, תבנה את החיבור המהיר". A customer presses the quick connect link in 🔌 and sends
  "היי, אני רוצה לחבר את הוואטסאפ שלי למוניטור. קוד: <code>" to the shared number. The code resolves his tenant
  (lib/wa-quick.js); the bridge only leaves data/wa-tenants-pending/<tenant>.json, root maps it within a minute
  (setup/wa-kapso-provision.sh, lib/wa-quick-provision.js). He just wrote, so a free text reply is allowed.
  A number mapped to another monitor is never remapped. At most 3 replies a day to one number (QK.allowReply).
  "ניתוק" from a mapped number leaves a remove request.
*/
/*
  12.11.2026, Itzik: "כל מי שכותב למספר ואינו לקוח ייכנס כליד אצלך ויקבל תשובה אוטומטית." See lib/wa-stranger.js.
  The text is stored as data (a biz record, a 📋 לטיפול item, a push) and never reaches a Claude session.
*/
let strangerDeps = null;
async function strangerMessage(m, contactName) {
  markRead(m.id);
  const H = require('./lib/handle.js');
  const d = strangerDeps || {
    handle: function (o) { return H.add(DATA, o); },
    publish: function () { H.publishSoon(); },
    notify: function (title, text) { require('child_process').execFile(process.execPath, [path.join(__dirname, 'notify.js'), '--lead', title, text], { cwd: __dirname, timeout: 60000 }, function (e) { if (e) log('stranger push failed: ' + e.message); }); },
    voice: voiceText,
  };
  try {
    const r = await require('./lib/wa-stranger.js').intake(DATA, m, Object.assign({ name: contactName, textOf: textOf, send: tenantSend, log: log, voice: voiceText }, d));
    log('stranger ' + String(m.from).slice(0, 5) + '...: ' + (r.skipped ? 'skipped ' + r.skipped : (r.created ? 'new lead' : 'appended') + (r.replied ? ', replied' : '') + (r.pushed ? ', pushed' : '')));
  } catch (e) { log('!! stranger lead failed: ' + e.message); }
}
async function quickReply(m, text) {
  if (!QK.allowReply(DATA, m.from)) { log('quick connect: reply limit for ' + String(m.from).slice(0, 5) + '...'); return; }
  await tenantSend(m.from, text);
}
async function quickConnect(m, text, contactName, tn) {
  markRead(m.id);
  const from = String(m.from);
  const tenant = QK.resolve(DATA, QK.parse(text));
  if (!tenant) { log('quick connect: wrong code from ' + from.slice(0, 5) + '...'); return quickReply(m, 'הקוד לא תקין. כדאי לפתוח שוב את 🔌 חיבורים במוניטור וללחוץ על חיבור מהיר.'); }
  if (tn) {
    if (tn.tenant === tenant) return quickReply(m, 'המספר הזה כבר מחובר למוניטור שלך ✓. אפשר לכתוב לי כאן כל בקשה.');
    log('quick connect: ' + from.slice(0, 5) + '... is mapped to ' + tn.tenant + ', refused for ' + tenant);
    return quickReply(m, 'המספר הזה כבר מחובר למוניטור אחר, לכן לא חיברתי אותו. כדאי לפנות אל IT Solution.');
  }
  const other = QK.pendingPhoneOwner(DATA, from);
  if (!WT.norm(from) || (other && other !== tenant)) return quickReply(m, 'לא הצלחתי לחבר את המספר הזה בעצמי. כדאי לפנות אל IT Solution ונסדר את זה.');
  try { QK.writePending(DATA, { op: 'add', tenant, phone: from, name: contactName || '' }); }
  catch (e) { log('!! quick connect pending ' + tenant + ': ' + e.message); return quickReply(m, 'משהו נתקע אצלי. אפשר לנסות שוב בעוד דקה.'); }
  log('quick connect: ' + tenant + ' <- ' + from.slice(0, 5) + '...');
  return quickReply(m, '✓ מחבר אותך למוניטור שלך. תוך דקה אפשר לכתוב לי כאן כל בקשה.');
}
async function quickDisconnect(m, tn) {
  markRead(m.id);
  try { QK.writePending(DATA, { op: 'remove', tenant: tn.tenant, phone: String(m.from) }); }
  catch (e) { log('!! quick disconnect ' + tn.tenant + ': ' + e.message); return; }
  log('quick disconnect: ' + tn.tenant);
  return quickReply(m, '✓ קיבלתי, מנתק את המספר הזה מהמוניטור. אפשר לחבר שוב בכל רגע מ 🔌 חיבורים.');
}
// Root leaves lines here (the confirmation after the number is mapped); sent as free text, once, inside the 24 hour window.
/*
  14.11.2026 (lib/meet-push.js): a message a customer's own monitor sends him first, a chat record with waPush
  (file name with -push), goes to every phone mapped to that monitor in data/wa-tenants.json. Inside 24 hours of
  his last message as text, otherwise through the approved template (cfg.template, monitor_update) as one line.
  Once per phone and record; records older than a day are skipped.
*/
async function waTemplate(to, text) {
  const c = cfg();
  const body = JSON.stringify({ messaging_product: 'whatsapp', to: to, type: 'template', template: { name: c.template || 'monitor_update',
    language: { code: c.templateLang || 'he' }, components: [{ type: 'body', parameters: [{ type: 'text', text: waOut.oneLine(text) }] }] } });
  const r = await req('POST', WA.base(c) + '/' + c.phoneId + '/messages', Object.assign({ 'Content-Type': 'application/json' }, WA.auth(c)), Buffer.from(body, 'utf8'));
  if (r.status !== 200) throw new Error('graph ' + r.status + ' ' + r.body.toString('utf8').slice(0, 200));
  return true;
}
// 14.11.2026: a reminder with its three buttons. Inside 24 hours: interactive reply buttons (free). Outside: the
// approved template monitor_reminder with payloads, and while it waits for Meta, monitor_update without buttons.
async function alarmSend(to, tenant, alarmId, text, open) {
  const c = cfg(), body = String(text).replace(/^⏰ תזכורת(?: \(באיחור\))?: /, '').slice(0, 900);
  const pl = (k) => 'al|' + tenant + '|' + alarmId + '|' + k;
  const post = async (o) => {
    const r = await req('POST', WA.base(c) + '/' + c.phoneId + '/messages', Object.assign({ 'Content-Type': 'application/json' }, WA.auth(c)), Buffer.from(JSON.stringify(o), 'utf8'));
    if (r.status !== 200) throw new Error('graph ' + r.status + ' ' + r.body.toString('utf8').slice(0, 200));
    return true;
  };
  if (open) return post({ messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text: String(text).slice(0, 1000) },
    action: { buttons: [{ type: 'reply', reply: { id: pl('done'), title: '✅ טופל' } }, { type: 'reply', reply: { id: pl('1h'), title: '⏰ עוד שעה' } }, { type: 'reply', reply: { id: pl('tom'), title: 'מחר בבוקר' } }] } } });
  try {
    return await post({ messaging_product: 'whatsapp', to, type: 'template', template: { name: 'monitor_reminder', language: { code: 'he' }, components: [
      { type: 'body', parameters: [{ type: 'text', text: waOut.oneLine(body) }] },
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: pl('done') }] },
      { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: pl('1h') }] },
      { type: 'button', sub_type: 'quick_reply', index: '2', parameters: [{ type: 'payload', payload: pl('tom') }] }] } });
  } catch (e) { log('monitor_reminder not usable yet (' + e.message.slice(0, 80) + '), plain template'); return waTemplate(to, text); }
}
// A tap on one of them: "al|<monitor>|<alarm id>|done|1h|tom". Itzik's own is applied here; a customer's goes to
// data/alarm-cmd for setup/addon-provision.js (root, every minute), since his folder is his. The reply is at once.
function alarmTap(m, tenant) {
  const p = m.type === 'button' ? String((m.button && m.button.payload) || '') : m.type === 'interactive' ? String(((m.interactive || {}).button_reply || {}).id || '') : '';
  const x = /^al\|([a-z0-9-]{1,40})\|(a[a-z0-9]{6,20})\|(done|1h|tom)$/.exec(p);
  if (!x) return null;
  if (x[1] !== tenant) { log('alarm tap for another monitor ' + x[1]); return 'התזכורת הזו לא שייכת למספר הזה.'; }
  const A = require('./lib/alarms.js');
  if (tenant === 'abaitzik') return A.act(DATA, x[2], x[3]).say;
  const d = path.join(DATA, 'alarm-cmd'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, tenant + '-' + Date.now() + '.json'), JSON.stringify({ tenant, id: x[2], action: x[3], at: new Date().toISOString() }));
  if (x[3] === 'done') return '✅ סומן כטופל.';
  const t = x[3] === '1h' ? Date.now() + 3600e3 : A.parseLocal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(Date.now() + 86400e3)) + ' 09:00');
  return '⏰ אזכיר שוב ' + A.when(t) + '.';
}

function waPushSweep() {
  let map = {}; try { map = JSON.parse(fs.readFileSync(path.join(DATA, 'wa-tenants.json'), 'utf8')) || {}; } catch (e) { map = {}; }
  // 14.11.2026: Itzik's own monitor too (his reminders), to the first number on allow.
  if (isOwnerInstance()) { const own = String(((cfg().allow || [])[0]) || ''); if (/^\d{8,15}$/.test(own)) map = Object.assign({}, map, { [own]: { tenant: 'abaitzik', dir: ROOT } }); }
  const st = loadState(); st.pushed = st.pushed || {}; let ch = false;
  Object.keys(map).forEach(function (phone) {
    const t = map[phone]; if (!t || !t.tenant || !t.dir || !/^\d{8,15}$/.test(phone)) return;
    let files = []; try { files = fs.readdirSync(WT.chatDir(t)).filter(function (f) { return f.indexOf('-push') > -1 && f.endsWith('.json'); }); } catch (e) { return; }
    files.forEach(function (f) {
      const k = phone + '/' + t.tenant + '/' + f; if (st.pushed[k]) return;
      const full = path.join(WT.chatDir(t), f); let d = null;
      try { if (Date.now() - fs.statSync(full).mtimeMs > 24 * 3600e3) { st.pushed[k] = 1; ch = true; return; } d = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { return; }
      if (!d || !d.waPush || d.from !== 'claude' || !d.text) return;
      st.pushed[k] = Date.now(); ch = true;
      const open = st.lastIn && st.lastIn[phone] && Date.now() - st.lastIn[phone] < 23.5 * 3600e3;
      (d.alarm && d.alarmId ? alarmSend(phone, t.tenant, d.alarmId, d.text, open) : open ? tenantSend(phone, String(d.waText || d.text)) : waTemplate(phone, d.waText || d.text)).then(function (ok) { log('wa push ' + t.tenant + ' ' + f + (open ? ' text' : ' template') + (ok === false ? ' (not delivered)' : '')); })
        .catch(function (e) { log('wa push failed ' + t.tenant + ' ' + f + ': ' + e.message.slice(0, 160)); });
    });
  });
  if (ch) { const ks = Object.keys(st.pushed); if (ks.length > 600) ks.slice(0, ks.length - 600).forEach(function (k) { delete st.pushed[k]; }); saveState(st); }
}
function outboxSweep() {
  const dir = path.join(DATA, 'wa-outbox');
  let fl = []; try { fl = fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f); }).slice(0, 10); } catch (e) { return; }
  fl.forEach(function (f) {
    const full = path.join(dir, f);
    let o = null; try { o = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { return; }
    try { fs.unlinkSync(full); } catch (e) { return; }
    if (!o || !/^\d{8,15}$/.test(String(o.to || '')) || !o.text) return;
    tenantSend(String(o.to), String(o.text).slice(0, 1500));
  });
}
async function tenantMessage(m, tn, contactName) {
  markRead(m.id);
  { const sl = loadState(); sl.lastIn = sl.lastIn || {}; sl.lastIn[m.from] = Date.now(); saveState(sl); }
  { const said = alarmTap(m, tn.tenant); if (said) { await tenantSend(m.from, said); return; } }
  { const mp = WM.partOf(m); if (mp) return mediaIn(m, mp, tn, contactName); }
  let t = textOf(m);
  if (!t && m.type === 'audio' && m.audio && m.audio.id) {
    let heard = ''; try { heard = await voiceText(m.audio.id); } catch (e) { log('tenant voice failed: ' + e.message); }
    if (heard) t = '🎙️ הודעה קולית מוואטסאפ: ' + heard;
  }
  if (!t) { await tenantSend(m.from, 'קיבלתי, אבל את סוג ההודעה הזה אני עוד לא קורא. אפשר לכתוב לי אותה במילים?'); return; }
  // 14.11: "בנק" from a customer runs the bank program on his computer (lib/bank-flow.js, setup/enable-bank.sh).
  // His monitor without data/bank/config.json gets it as an ordinary message.
  try {
    const r = await require('./lib/bank-flow.js').waTurn({ dataPath: path.join(tn.dir, 'data'), chatDir: WT.chatDir(tn), text: t, send: (s) => tenantSend(m.from, s) });
    if (r) {
      if (r.chatId) { const sb = loadState(); sb.pending[r.chatId] = { to: m.from, at: Date.now(), name: contactName || '', tenant: tn.tenant, dir: tn.dir }; saveState(sb); }
      log('tenant bank ' + tn.tenant + ' ' + m.id + (r.chatId ? ' -> ' + r.chatId : ''));
      return;
    }
  } catch (e) { log('!! tenant bank ' + tn.tenant + ': ' + e.message); await tenantSend(m.from, 'חיבור הבנק נתקע אצלי. אפשר לנסות שוב בעוד כמה דקות.'); return; }
  const fw = WT.forwarded(m);
  let id;
  try { id = WT.write(tn, 'וואטסאפ', WT.request(fw, t)); } catch (e) { log('!! tenant queue ' + tn.tenant + ': ' + e.message); await tenantSend(m.from, 'משהו נתקע אצלי. אפשר לכתוב את זה במסך הבית של המוניטור, ואני מטפל.'); return; }
  if (fw) WT.handleItem(tn, m.id, t, contactName);
  const s = loadState();
  s.pending[id] = { to: m.from, at: Date.now(), name: contactName || '', tenant: tn.tenant, dir: tn.dir };
  saveState(s);
  log('tenant in ' + tn.tenant + ' ' + m.id + ' -> ' + id + (fw ? ' (forwarded)' : ''));
  await tenantSend(m.from, fw ? '✓ קיבלתי את ההודעה שהעברת. היא כבר ב 📋 לטיפול במוניטור, וטיוטת תשובה תגיע לכאן.' : '✓ קיבלתי, אני עובד על זה. התשובה תגיע לכאן.');
}
/*
  11.11.2026, Itzik: a file sent in the WhatsApp chat reaches the monitor itself, not a line about it.
  Downloaded from Meta (lib/wa-media.js, up to 25 MB), saved in that monitor's data/inbox (his own or the customer's),
  and queued with files:[name] exactly like a page upload. A customer's PDF is also noted for the lab check.
*/
async function mediaIn(m, part, tn, contactName) {
  const send = tn ? tenantSend : waSend;
  const shown = WM.shown(m, part);
  let got;
  try { got = await WM.download(req, cfg(), part.id); } catch (e) {
    log('media failed ' + (tn ? tn.tenant : 'own') + ': ' + e.message.slice(0, 120));
    await send(m.from, e.big ? 'הקובץ גדול מ 25MB ולכן לא נקלט. אפשר להעלות אותו במוניטור, בכפתור 📎 העלאת קובץ.' : 'לא הצלחתי להוריד את הקובץ. אפשר לשלוח אותו שוב?');
    return;
  }
  let name;
  try { name = WM.save(tn ? path.join(tn.dir, 'data') : DATA, WM.nameFor(m, part, got.mime), got.buf, { labNote: !!tn }); } catch (e) {
    log('!! media save ' + (tn ? tn.tenant : 'own') + ': ' + e.message);
    await send(m.from, 'משהו נתקע אצלי בשמירת הקובץ. אפשר להעלות אותו במוניטור, בכפתור 📎 העלאת קובץ.');
    return;
  }
  const cap = String(part.caption || '').trim();
  const text = groupLib.groupText(cap, [name]);
  let id;
  if (tn) {
    const fw = WT.forwarded(m);
    try { id = WT.write(tn, 'וואטסאפ', WT.request(fw, text), [name]); } catch (e) {
      log('!! tenant queue ' + tn.tenant + ': ' + e.message);
      await send(m.from, 'הקובץ נשמר, אבל משהו נתקע בתור. אפשר לכתוב במוניטור מה לעשות איתו, ואני מטפל.');
      return;
    }
    if (fw) WT.handleItem(tn, m.id, (cap ? cap + ' ' : '') + '(' + shown + ')', contactName);
  } else {
    id = await toMonitor('וואטסאפ', (demoOn() ? DEMO_FRAME : '') + text, '', [name]);
  }
  const s = loadState();
  s.pending[id] = tn ? { to: m.from, at: Date.now(), name: contactName || '', tenant: tn.tenant, dir: tn.dir } : { to: m.from, at: Date.now(), name: contactName || '' };
  saveState(s);
  log('file ' + (tn ? tn.tenant : 'own') + ' ' + m.id + ' -> ' + id + ' (' + got.buf.length + ' bytes)');
  let lab = false;
  if (tn && /\.pdf$/i.test(name)) { try { lab = JSON.parse(fs.readFileSync(path.join(tn.dir, 'instance.json'), 'utf8')).labCheck === true; } catch (e) {} }
  await send(m.from, '✓ קיבלתי את הקובץ ' + shown + '. ' + (lab ? 'אם זה דוח מעבדה, הוא נבדק לכפילויות ברבע השעה הקרובה והתוצאה תופיע בתשובות. ' : '') + 'התשובה תגיע לכאן.');
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
  outboxSweep();
  try { pageTasksSweep(); } catch (e) { log('page tasks: ' + e.message); }
  try { waPushSweep(); } catch (e) { log('wa push: ' + e.message); }
  const st = loadState();
  const ids = Object.keys(st.pending);
  if (!ids.length) return;
  // 11.11: Itzik's queue, and the queue of every customer who wrote from his own number (pending.dir).
  const queues = {};
  ids.forEach(function (k) { const p = st.pending[k]; const q = p.dir ? WT.chatDir(p) : CHAT; (queues[q] = queues[q] || []).push(k); });
  Object.keys(queues).forEach(function (q) { sweepQueue(st, q, queues[q]); });
  // a question waits for answers for 6 hours, then is let go
  const s4 = loadState(); let ch = false;
  Object.keys(s4.pending).forEach(function (k) { if (Date.now() - s4.pending[k].at > 6 * 3600e3) { delete s4.pending[k]; ch = true; } });
  if (ch) saveState(s4);
}
/*
  19.11.2026, Itzik: "אם הוא חיבר את הוואטסאפ, אז יהיה בוואטסאפ, ואם לא, אז יהיה במסך התשובות". A task sent from the
  page of a customer whose WhatsApp is connected (wa-tenants.json) goes on the waiting list with page: true, so
  sweepQueue sends its answer there, as fast chat tasks already do (16.11). The "received" note that listen.js
  writes under a campaign (kind ack, no re) goes out at once.
*/
function pageTasksSweep() {
  let map = {}; try { map = JSON.parse(fs.readFileSync(path.join(DATA, 'wa-tenants.json'), 'utf8')) || {}; } catch (e) { return; }
  const st = loadState(); st.ackSent = st.ackSent || {}; let ch = false;
  Object.keys(map).forEach(function (phone) {
    const t = map[phone]; if (!t || !t.approved || !t.dir || !t.tenant) return;
    const dir = path.join(t.dir, 'data', 'chat', 'chat');
    let files = []; try { files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); }); } catch (e) { return; }
    files.forEach(function (f) {
      let d; try { if (Date.now() - fs.statSync(path.join(dir, f)).mtimeMs > 15 * 60e3) return; d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return; }
      if (!d) return;
      if (d.from === 'itzik' && d.auto && d.id && /^(ntfy|up)-/.test(d.id) && d.status === 'working' && !st.pending[d.id] && !st.sent['page:' + d.id]) {
        st.pending[d.id] = { to: phone, at: Date.now(), name: '', tenant: t.tenant, dir: t.dir, page: true };
        st.sent['page:' + d.id] = Date.now(); ch = true;
        log('page task ' + t.tenant + ' ' + d.id + ' -> answer to WhatsApp');
      }
      const ak = t.tenant + '/' + f;
      if (d.from === 'claude' && d.kind === 'ack' && d.ackOf && d.text && !st.ackSent[ak]) {
        st.ackSent[ak] = Date.now(); ch = true;
        const open = st.lastIn && st.lastIn[phone] && Date.now() - st.lastIn[phone] < 23.5 * 3600e3;
        (open ? tenantSend(phone, d.text) : waTemplate(phone, d.text)).then(function (ok) { log('ack out ' + t.tenant + ' ' + f + (ok === false ? ' (not delivered)' : '')); }, function (e) { log('ack out ' + t.tenant + ': ' + e.message); });
      }
    });
  });
  if (ch) saveState(st);
}
function sweepQueue(st, Q, ids) {
  const mine = Q === CHAT;
  let files = [];
  try { files = fs.readdirSync(Q).filter(function (f) { return f.endsWith('.json') && f.indexOf('claude') > -1; }); } catch (e) { return; }
  const since = Math.min.apply(null, ids.map(function (k) { return st.pending[k].at; })) - 60000;
  files.forEach(function (f) {
    const sk = mine ? f : st.pending[ids[0]].tenant + '/' + f;
    if (st.sent[sk]) return;
    const full = path.join(Q, f);
    let d;
    try { if (fs.statSync(full).mtimeMs < since) return; d = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { return; }
    if (!d || d.from !== 'claude' || !d.re || !st.pending[d.re] || !d.text) return;
    if (!mine && ids.indexOf(d.re) < 0) return;
    st.sent[sk] = Date.now();
    saveState(st);
    if (!mine) {
      // A customer: the whole answer here (his monitor link is not Itzik's), in parts when long.
      const to = st.pending[d.re].to, txt = String(d.text);
      const parts = []; for (let i = 0; i < txt.length && parts.length < 4; i += 3800) parts.push(txt.slice(i, i + 3800));
      // 16.11: a page task's answer outside the customer's 24 hours goes as the one line template.
      const pg = st.pending[d.re].page, open = st.lastIn && st.lastIn[to] && Date.now() - st.lastIn[to] < 23.5 * 3600e3;
      if (pg && !open) { waTemplate(to, txt).then(function (ok) { log('tenant out ' + st.pending[d.re].tenant + ' ' + f + ' template' + (ok === false ? ' (not delivered)' : '')); }, function (e) { log('tenant out failed ' + f + ': ' + e.message.slice(0, 160)); }); return; }
      (async function () { for (const p of parts) { if (!(await tenantSend(to, p))) return false; } await waSendFiles(to, txt, path.resolve(Q, '..', '..')); return true; })().then(function (ok) {
        log('tenant out ' + st.pending[d.re].tenant + ' ' + f + (ok ? '' : ' (not delivered)'));
      });
      return;
    }
    const to = st.pending[d.re].to;
    // 15.11 (Itzik): a file path in WhatsApp is not a link. files/<name> becomes the full address on the monitor.
    const body = absFiles(d.text);
    const s5 = loadState(); s5.last = s5.last || {}; s5.last[to] = body; saveState(s5);
    const asVoice = !!((s5.voice && s5.voice[to]) || st.pending[d.re].voice);
    // 4.11: the thread a quoted reply continues is the question's own thread (its re), else the question.
    const root = st.pending[d.re].re || d.re;
    const short = asVoice ? null : shortOf(body, d.re);
    if (short) {
      const sl = loadState(); sl.long = sl.long || {}; sl.lastLong = sl.lastLong || {};
      sl.long[d.re] = body; sl.lastLong[to] = d.re;
      const lk = Object.keys(sl.long); if (lk.length > 30) lk.slice(0, lk.length - 30).forEach(function (k) { delete sl.long[k]; });
      saveState(sl);
    }
    const mem = { re: root, text: body.slice(0, 1500) };
    // 16.11: a page task's answer goes through sendOwner, which falls back to the template outside the 24 hours.
    const pageAns = !!st.pending[d.re].page && !asVoice;
    (asVoice ? queueVoice(to, body, true) : pageAns ? waOut.sendOwner(DATA, short || body, { re: root, kind: 'answer' }) : waSend(to, short || body, mem)).then(function () {
      return waSendFiles(to, d.text, path.resolve(Q, '..', '..'));
    }).then(function () {
      log('out ' + f + ' -> ' + d.re + (asVoice ? ' (voice)' : ''));
    })
      .catch(function (e) { log('send failed ' + f + ': ' + e.message); const s3 = loadState(); delete s3.sent[f]; saveState(s3); });
  });
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
// hs: the incoming headers; Meta's and Kapso's signatures both go on, so a tenant bridge can verify either.
function forward(pid, raw, hs) {
  const r = (cfg().routes || {})[pid];
  if (typeof hs === 'string') hs = { 'x-hub-signature-256': hs };
  hs = hs || {};
  const fh = { 'Content-Type': 'application/json', 'Content-Length': raw.length, 'X-Hub-Signature-256': hs['x-hub-signature-256'] || '' };
  if (hs['x-webhook-signature']) fh['X-Webhook-Signature'] = hs['x-webhook-signature'];
  if (hs['x-idempotency-key']) fh['X-Idempotency-Key'] = hs['x-idempotency-key'];
  const x = http.request({ method: 'POST', hostname: '127.0.0.1', port: r.port, path: '/webhook',
    headers: fh }, function (res) {
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
/*
  12.11.2026 security: the owner code opens /api/* from anywhere, so a wrong code is counted per address.
  30 wrong codes in 15 minutes lock that address for 30 minutes. An empty code (a page still loading) and the
  previous code (data/owner-code.prev.txt, a page opened before a rotation) are refused without counting,
  so Itzik's own phone never locks itself out. Compared in constant time.
*/
function codeOk(c) {
  const o = ownerCode(), x = String(c || '');
  return !!o && x.length === o.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(o));
}
const codeFails = new Map();
// Caddy sets X-Forwarded-For itself; the last entry is the address it saw.
function realIp(q) { return String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '-').split(',').pop().trim(); }
function codeLocked(q) { const r = codeFails.get(realIp(q)); return !!(r && r.until > Date.now()); }
function codeFail(q, c) {
  const x = String(c || '');
  if (!x) return;
  try { if (x === fs.readFileSync(path.join(ROOT, 'data', 'owner-code.prev.txt'), 'utf8').trim()) return; } catch (e) {}
  const ip = realIp(q), now = Date.now();
  let r = codeFails.get(ip);
  if (!r || now - r.first > 15 * 60e3) r = { n: 0, first: now, until: 0 };
  r.n++;
  if (r.n >= 30 && !r.until) { r.until = now + 30 * 60e3; log('code lock ' + ip); }
  codeFails.set(ip, r);
  if (codeFails.size > 5000) codeFails.clear();
}
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
  const PG = require('./lib/pay-guard.js');
  const pid = String(u.searchParams.get('OG-PaymentID') || '').replace(/\D/g, '');
  const ext = String(u.searchParams.get('OG-ExternalIdentifier') || '');
  if (!pid || !/^[a-z0-9-]+$/.test(ext)) throw new Error('bad return params');
  const dir = path.join(DATA, 'pay'); fs.mkdirSync(dir, { recursive: true });
  const rec = path.join(dir, pid + '.json');
  const who = payWho(ext);
  const pf = '/srv/monitor-changes/' + ext + '.plan.json';
  const writePlanFile = (t, st) => { const f = '/srv/monitor-changes/' + t + '.plan.json'; fs.writeFileSync(f + '.tmp', JSON.stringify(st, null, 1)); fs.renameSync(f + '.tmp', f); };
  const oid = String(u.searchParams.get('o') || '');
  // 21.11.2026 (security review): a payment id is one tenant's, for good; the browser's tenant is only a hint.
  const done = (() => { try { return JSON.parse(fs.readFileSync(rec, 'utf8')); } catch (e) { return null; } })();
  if (done && done.tenant !== ext) throw new Error('payment ' + pid + ' belongs to another tenant');
  // Reserved on disk before the first await: a double click or a second return cannot start a second standing order.
  const lock = done ? null : PG.reserve(DATA, pid);
  // 3rd review: the payment is being recorded by another request: a neutral page, never the paid redirect.
  if (!done && !lock) { s.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return s.end('התשלום בבדיקה. אפשר לחזור למוניטור בעוד דקה.'); }
  try {
    // 4th review: the record is checked again under the lock; a payment recorded meanwhile is not processed twice.
    if (!done && lock && !fs.existsSync(rec)) {
      if (oid) {
        // A trade package (lib/pay-day.js finish): the order decides the plan and the price, checked with SUMIT.
        const PL = require('./lib/plan.js'), A = require('./lib/addons.js'), PD = require('./lib/pay-day.js');
        let st = {}; try { st = JSON.parse(fs.readFileSync(pf, 'utf8')); } catch (e) {}
        const r = await PD.finish({ DATA, P, PL, A, now: Date.now(), writePlan: writePlanFile, readPlan: (t) => { try { return JSON.parse(fs.readFileSync('/srv/monitor-changes/' + t + '.plan.json', 'utf8')); } catch (e) { return null; } }, lookup: (cid) => P.getCustomer(cid).then((c) => (c && c.ExternalIdentifier) || ''), owner: (t) => { try { require('./lib/handle.js').complete({ key: 'pay-unverified-' + pid, kind: 'lead', who: ext, title: t, link: 'biz' }); } catch (e) { log('pay owner: ' + e.message); } } }, { tenant: ext, pid, oid, state: st, who });
        const out = { at: new Date().toISOString(), tenant: ext, paymentId: Number(pid), customerId: r.out.customerId, amount: r.out.amount, plan: r.out.plan, price: r.out.price, recurring: r.out.recurring };
        if (r.out.recurringError) { out.recurringError = r.out.recurringError; log('pay recurring: ' + r.out.recurringError); }
        PG.recordWrite(DATA, pid, out);
        try { require('./lib/handle.js').complete({ key: 'paid-' + pid, kind: 'lead', who: who.name, title: 'שילם על חבילת ' + PL.PACKAGES[r.out.plan].label + ' (' + r.out.amount + ' ₪).' + (out.recurringError ? ' החיוב החודשי לא נפתח, לפתוח בסאמיט.' : ' החיוב החודשי נפתח מהחודש הבא.'), link: 'biz' }); } catch (e) { log('pay handle: ' + e.message); }
        log('paid ' + ext + ' ' + pid + ' ' + r.out.plan);
      } else {
        const p = await P.getPayment(pid);
        PG.touch(lock);
        const chk = await PG.checkPayment(DATA, p, ext, Date.now(), { lookup: (cid) => require('./lib/sumit.js').getCustomer(cid).then((c) => (c && c.ExternalIdentifier) || ''), owner: (t) => { try { require('./lib/handle.js').complete({ key: 'pay-unverified-' + pid, kind: 'lead', who: ext, title: t, link: 'biz' }); } catch (e) { log('pay owner: ' + e.message); } } });
        if (!chk.ok) throw new Error('payment ' + pid + ' ' + chk.why);
        // Entry (no order): a payment page this tenant opened within 24 hours, always.
        if (!PG.startRecent(DATA, ext, Date.now())) throw new Error('payment ' + pid + ' without a recent start');
        const bound = PG.bindCustomer(DATA, ext, p.CustomerID);
        if (!bound.ok) throw new Error('payment ' + pid + ' customer ' + bound.why);
        const PO = require('./lib/pay-offer.js'), of = PO.live(ext);
        if (!P.paymentOk(p, of ? PO.total(of) : 0)) throw new Error('payment ' + pid + ' not valid');
        const out = { at: new Date().toISOString(), tenant: ext, paymentId: Number(pid), customerId: p.CustomerID, amount: p.Amount, recurring: null };
        PG.assertOwned(lock);
        PG.recordWrite(DATA, pid, out);
        // The package: entry from now on (the plan file is read by the customer's worker and page).
        let st = {}; try { st = JSON.parse(fs.readFileSync(pf, 'utf8')); } catch (e) {}
        // 21.11.2026 security review: one helper writes the plan AND its price, and clears a stop (lib/plan.js applyEntryPayment).
        const priorState = st; // before the entry payment changes it: a paid customer already has a standing order
        const newPlan = (of && of.plan) || 'entry';
        st = require('./lib/plan.js').applyEntryPayment(st, newPlan, pid, Date.now());
        writePlanFile(ext, st);
        if (of) { try { PO.markPaid(ext, Number(pid)); } catch (e) { log('pay offer: ' + e.message); } }
        try {
          // 5th review (1, 4): the entry standing order is decided by the customer's Sumit orders (skip only when a healthy one exists;
          // a failing one is cancelled first; an offer replaces the package's order). The id is recorded on the plan file.
          const er = await require('./lib/plan.js').entryRecurring(P, p.CustomerID, priorState, of, { touch: () => PG.touch(lock) });
          out.recurring = er.res;
          // fix6: read again before writing (the usage counter may have written it during the SUMIT calls).
          if (er.id) { let cur = st; try { cur = JSON.parse(fs.readFileSync(pf, 'utf8')) || st; } catch (e) {} writePlanFile(ext, Object.assign({}, cur, { packageOrder: { id: er.id } })); }
        } catch (e) { out.recurringError = e.message; log('pay recurring: ' + e.message); }
        PG.recordWrite(DATA, pid, out);
        try { require('./lib/handle.js').complete({ key: 'paid-' + pid, kind: 'lead', who: who.name, title: (of ? 'שילם: ' + of.items.map(function (x) { return x.name; }).join(' + ') + ' (' : 'שילם על חבילת הכניסה (') + p.Amount + ' ₪).' + (out.recurringError ? ' החיוב החודשי לא נפתח, לפתוח בסאמיט.' : ' החיוב החודשי נפתח מהחודש הבא.'), link: 'biz' }); } catch (e) { log('pay handle: ' + e.message); }
        log('paid ' + ext + ' ' + pid);
      }
    }
  } finally { PG.release(lock); }
  s.writeHead(302, { Location: who.home ? who.home + '?paid=1' : 'https://it-solution.co.il/trial/?paid=1' });
  s.end();
}
// 21.11.2026: the renewal pay link (chat, WhatsApp; lib/renew-link.js). Starts his renewal order and goes to SUMIT.
async function renewGet(tok, s) {
  const RL = require('./lib/renew-link.js'), PD = require('./lib/pay-day.js'), P = require('./lib/sumit.js');
  const tenant = RL.verify(DATA, tok, Date.now());
  if (!tenant) { s.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return s.end('הקישור פג או לא תקין. בקשו קישור חדש ממני.'); }
  const r = await PD.renewStart({ DATA, P, PL: require('./lib/plan.js'), A: require('./lib/addons.js'), now: Date.now(), tenant,
    state: require('./lib/plan-io.js').stateOf(tenant), who: payWho(tenant) });
  if (r.status !== 200) { s.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' }); return s.end('אין חיוב פתוח לחידוש. אם חושבים שזו טעות, כתבו לנו.'); }
  s.writeHead(302, { Location: r.body.url }); s.end();
}
/*
  14.11.2026: back from SUMIT after an add-on or upgrade (lib/addons.js). Checked with SUMIT itself, once per
  payment id: the plan file changes at once, the monthly part becomes a standing order from next month (an upgrade
  first cancels the package's old one), and what needs root or the customer's computer is queued for
  setup/addon-provision.sh. Itzik only reads a line in 📋; nothing waits for him.
*/
async function addonDone(u, s) {
  // 14.11.2026: the logic lives in lib/addon-pay.js, tested end to end against a fake SUMIT (tests/addon-pay.test.js).
  const oid = u.pathname.split('/').pop();
  let who = { home: null, name: '' };
  try { who = payWho(JSON.parse(fs.readFileSync(path.join(DATA, 'pay', 'orders', oid + '.json'), 'utf8')).tenant); } catch (e) {}
  const r = await require('./lib/addon-pay.js').done({ DATA, P: require('./lib/sumit.js'), PIO: require('./lib/plan-io.js'), now: Date.now(),
    lookup: (cid) => require('./lib/sumit.js').getCustomer(cid).then((c) => (c && c.ExternalIdentifier) || ''),
    owner: (t) => { try { require('./lib/handle.js').complete({ key: 'addon-unverified-' + oid, kind: 'lead', who: '', title: t, link: 'biz' }); } catch (e) { log('addon owner: ' + e.message); } } }, oid,
    u.searchParams.get('OG-PaymentID'), String(u.searchParams.get('OG-ExternalIdentifier') || ''));
  if (r.out) {
    const o = r.order, out = r.out;
    if (out.recurringError) log('addon recurring: ' + out.recurringError);
    try { require('./lib/handle.js').complete({ key: 'paid-' + out.paymentId, kind: 'lead', who: who.name, title: 'שילם ' + out.amount + ' ₪: ' + o.title + '. נפתח לבד.' + (out.recurringError ? ' החיוב החודשי לא עודכן: ' + out.recurringError : (o.monthly ? ' החיוב החודשי מתעדכן מהחודש הבא.' : '')), link: 'biz' }); } catch (e) { log('addon handle: ' + e.message); }
    log('addon paid ' + o.tenant + ' ' + o.kind + ' ' + out.paymentId);
  }
  s.writeHead(302, { Location: (who.home || 'https://it-solution.co.il/') + r.qs }); s.end();
}
// 14.11.2026 (lib/csign.js): his client opened or signed; a message in the customer's own monitor, and a 📋 line if that fails.
function csignTell(tenant, text) {
  try {
    if (!/^[a-z0-9-]{1,32}$/.test(String(tenant || ''))) throw new Error('bad tenant');
    let dir = ''; try { dir = JSON.parse(fs.readFileSync(path.join(DATA, 'tenants', 'tenants', tenant + '.json'), 'utf8')).dir || ''; } catch (e) {}
    if (!dir) dir = '/home/' + tenant + '/' + tenant + '-monitor';
    const cd = path.join(dir, 'data', 'chat', 'chat');
    const pad = (n) => String(n).padStart(2, '0'); const at = new Date();
    const base = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-' + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds()) + '-claude-csign';
    let name = base + '.json'; for (let i = 2; fs.existsSync(path.join(cd, name)); i++) name = base + '-' + i + '.json';
    fs.writeFileSync(path.join(cd, name + '.tmp'), JSON.stringify({ at: at.toISOString(), from: 'claude', text, status: 'done', id: 'cs-' + at.getTime().toString(36) }, null, 1), { encoding: 'utf8', mode: 0o664 });
    fs.renameSync(path.join(cd, name + '.tmp'), path.join(cd, name));
    log('csign tell ' + tenant);
  } catch (e) {
    log('csign tell ' + tenant + ' failed: ' + e.message);
    try { require('./lib/handle.js').complete({ key: 'csign-' + tenant + '-' + Date.now(), kind: 'lead', who: tenant, title: 'הודעת חתימה לא נכנסה למוניטור של הלקוח: ' + String(text).slice(0, 120), link: 'biz' }); } catch (x) {}
  }
}
/*
  22.11.2026 (lib/book-page.js): the public booking page of a business. THE BRIDGE ONLY PROXIES. It never reads or writes inside a
  tenant's folder for this feature (a tenant owns its folder and could plant links, pipes and locks there): it asks the tenant's
  own agent (lib/book-agent.js, run by that tenant's listener as the tenant's own user) over /var/lib/monitor-book/<tenant>/s.sock,
  asynchronously, with a timeout. The platform keeps only link -> tenant (data/book/links).
*/
function bookSock(tenant) { return /^[a-z0-9-]{1,32}$/.test(String(tenant || '')) ? '/var/lib/monitor-book/' + tenant + '/s.sock' : ''; }
let bookApi = null;
function BOOK() {
  if (!bookApi) bookApi = require('./lib/book-page.js').create({ DATA, sockPath: bookSock, sockDir: (t) => '/var/lib/monitor-book/' + t, log, demo: { request: (r) => require('./lib/book-demo.js').request(r) } });
  return bookApi;
}
function bookRoute(q, u, s) {
  const origin = q.headers.origin || '';
  const h = { 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (u.pathname === '/api/book/link' && originOk(origin)) { h['Access-Control-Allow-Origin'] = origin; h['Access-Control-Allow-Headers'] = 'Content-Type'; h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'; }
  if (q.method === 'OPTIONS' && u.pathname === '/api/book/link') { s.writeHead(204, h); return s.end(); }
  const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',').pop().trim();
  const send = (r) => { s.writeHead(r.status, Object.assign({ 'Content-Type': r.type }, h, r.headers || {})); s.end(r.body); };
  const fail = () => { try { s.writeHead(503, h); s.end(); } catch (e) {} };
  const query = {}; u.searchParams.forEach((v, k) => { query[k] = v; });
  if (q.method === 'GET') { BOOK().handle({ method: 'GET', path: u.pathname, query, body: null, ip }).then(send, fail); return; }
  if (q.method !== 'POST') { s.writeHead(405, h); return s.end(); }
  readBody(q, 8192).then(function (raw) {
    let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400, h); return s.end('{}'); }
    if (u.pathname === '/api/book/link') {
      const vn = require('./lib/visits.js').nameByKey(DATA, b && b.key);
      if (!vn) { s.writeHead(403, Object.assign({ 'Content-Type': 'application/json' }, h)); return s.end('{"error":"key"}'); }
      return BOOK().makeLink(vn).then(function (r) { s.writeHead(r.ok ? 200 : 503, Object.assign({ 'Content-Type': 'application/json' }, h)); s.end(JSON.stringify(r.ok ? { link: r.link } : { error: r.error })); }, fail);
    }
    BOOK().handle({ method: 'POST', path: u.pathname, query, body: b, ip }).then(send, fail);
  }).catch(function () { try { s.writeHead(400, h); s.end('{}'); } catch (e) {} });
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
    // 16.11.2026: a customer whose WhatsApp is connected gets the answer to a page task there too (as Itzik does).
    try {
      let map = {}; try { map = JSON.parse(fs.readFileSync(path.join(DATA, 'wa-tenants.json'), 'utf8')) || {}; } catch (e) {}
      const phone = Object.keys(map).find(function (p) { return map[p] && map[p].tenant === tn.name && map[p].dir; });
      if (phone) { const sp = loadState(); sp.pending[id] = { to: phone, at: Date.now(), name: '', tenant: tn.name, dir: map[phone].dir, page: true }; saveState(sp); log('page task ' + tn.name + ' ' + id + ' -> answer to WhatsApp'); }
    } catch (e) { log('!! page task pending ' + tn.name + ': ' + e.message); }
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
  // 17.11.2026: the "🚀 בוא נתחיל" questions inside a customer's monitor (lib/signup.js moreProfile), by his visit key.
  if (u.pathname === '/api/start/more') {
    const vn = require('./lib/visits.js').nameByKey(DATA, b.key);
    if (!vn) { s.writeHead(403, h); return s.end('{"error":"key"}'); }
    const r = require('./lib/signup.js').moreProfile(DATA, vn, b);
    s.writeHead(r.ok ? 200 : 400, h); return s.end(JSON.stringify(r));
  }
  // 17.11.2026: the public demo monitor (lib/demo-chat.js). Public, no code, the owner instance only. Never his queue or thread.
  if (/^\/api\/demo\/(chat|hit|wa|camp)$/.test(u.pathname)) {
    if (!isOwnerInstance()) { s.writeHead(404, h); return s.end('{}'); }
    const r = await require('./lib/demo-chat.js').api(u.pathname, b, { dataPath: DATA, ip: realIp(q), origin: q.headers.origin || '' });
    s.writeHead(r.status, h); return s.end(JSON.stringify(r.json));
  }
  // 11.11.2026: the self signup (lib/signup.js). Public, no code: the email code is the check. A verified signup waits in
  // data/signup/queue/ for its trial monitor (setup/signup-provision.sh), and lands in Itzik's 📋 לטיפול.
  if (u.pathname === '/api/signup' || u.pathname === '/api/signup/verify' || u.pathname === '/api/signup/profile' || u.pathname === '/api/signup/status' || u.pathname === '/api/signup/ref') {
    const S = require('./lib/signup.js'), M = require('./lib/mailer.js');
    const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '-').split(',').pop().trim();
    const send = function (code, o) { s.writeHead(code, h); s.end(JSON.stringify(o)); };
    try {
      // 11.11: the questionnaire while the monitor is built, and the build status (both need the page token from verify)
      if (u.pathname === '/api/signup/profile') { const r = S.saveProfile(DATA, b); return send(r.ok ? 200 : 400, r); }
      // 12.11: a visit from a referrer's link (?ref=shai), counted in data/signup/refs/
      if (u.pathname === '/api/signup/ref') { const r = S.refVisit(DATA, Object.assign({}, b, { ip })); return send(r.ok ? 200 : 400, r); }
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
        try { require('./lib/handle.js').complete({ key: 'signup-' + v.id, kind: 'lead', who: v.name, title: 'נרשם לשבוע ניסיון ואימת מייל (' + (v.phone || v.email) + ')' + (v.ref ? ', הגיע דרך הקישור של ' + v.ref : '') + '. המוניטור שלו נפתח עכשיו.', link: 'biz' }); } catch (e) { log('signup handle: ' + e.message); }
        // 13.11.2026, Itzik: "אני צריך שזה הכל יתנקז למקום אחד". Every trial signup is also a row in the leads table.
        try { require('./lib/leads.js').addFound(DATA, { src: 'signup', key: 'signup:' + v.id, name: v.name, phone: v.phone, email: v.email, text: 'נרשם לשבוע ניסיון ואימת מייל' + (v.ref ? ', דרך הקישור של ' + v.ref : '') }); } catch (e) { log('signup lead: ' + e.message); }
      }
      // 11.11: the page shows an entry button to the monitor being built (the login code goes only by mail)
      return send(200, { ok: true, id: v.id, pt: v.pt, host: v.id ? v.id + '.m.it-solution.co.il' : '' });
    } catch (e) { log('signup: ' + e.message); return send(500, { error: 'server' }); }
  }
  // 11.11.2026: the entry package payment. The customer's page sends its visit key in the body (never the URL); we open a
  // SUMIT payment page for that monitor. Without SUMIT credentials: 503, and the page sends a request to Itzik instead.
  // 21.11.2026 security review: the launch token for the /day/ page (lib/day-token.js). Only the it-solution.co.il origin gets one.
  if (u.pathname === '/api/day/token') {
    const og = String((q.headers && q.headers.origin) || '');
    if (og !== 'https://it-solution.co.il' && og !== 'https://www.it-solution.co.il') { s.writeHead(403, h); return s.end('{"error":"origin"}'); }
    let tok = '';
    try { tok = require('./lib/day-token.js').issue(DATA); } catch (e) { log('day token: ' + e.message); s.writeHead(503, h); return s.end('{"error":"key"}'); }
    s.writeHead(200, Object.assign({}, h, { 'Access-Control-Allow-Origin': og })); return s.end(JSON.stringify({ tok }));
  }
  // 21.11.2026: the 📦 sheet's renewal button (a paid customer with a failed charge or a stop): his own package, his price.
  if (u.pathname === '/api/pay/renew') {
    const vn = require('./lib/visits.js').nameByKey(DATA, b.key);
    if (!vn) { s.writeHead(403, h); return s.end('{"error":"key"}'); }
    const P = require('./lib/sumit.js');
    if (!P.ready()) { s.writeHead(503, h); return s.end('{"error":"pay"}'); }
    try {
      const r = await require('./lib/pay-day.js').renewStart({ DATA, P, PL: require('./lib/plan.js'), A: require('./lib/addons.js'), now: Date.now(), tenant: vn, state: require('./lib/plan-io.js').stateOf(vn), who: payWho(vn) });
      s.writeHead(r.status, h); return s.end(JSON.stringify(r.body || {}));
    } catch (e) { log('renew start: ' + e.message); s.writeHead(502, h); return s.end('{"error":"pay"}'); }
  }
  if (u.pathname === '/api/pay/start') {
    const vn = require('./lib/visits.js').nameByKey(DATA, b.key);
    if (!vn) { s.writeHead(403, h); return s.end('{"error":"key"}'); }
    const P = require('./lib/sumit.js');
    if (!P.ready()) { s.writeHead(503, h); return s.end('{"error":"pay"}'); }
    try {
      const who = payWho(vn);
      // 12.11.2026: a customer with an offer that Itzik turned on pays its own lines (lib/pay-offer.js).
      const of = require('./lib/pay-offer.js').live(vn);
      // 21.11.2026: a trade customer (lib/plan.js isDaySource, from /day/) pays the package he chose, solo or pro, at the
      // server's own price. He never gets the 390 entry from this route, and a plan he did not choose is refused.
      const PL = require('./lib/plan.js'), st = require('./lib/plan-io.js').stateOf(vn);
      // 21.11.2026 security review: a stopped paid customer who is not a trade one is not sent to the 390 entry (it would downgrade him).
      if (st && st.suspended && st.plan !== 'trial' && !PL.isDaySource(st)) { s.writeHead(409, h); return s.end('{"error":"renew"}'); }
      // 21.11.2026: the trade packages (lib/pay-day.js start): solo or pro at the server's price, only for a trade trial.
      if (!of) {
        const r = await require('./lib/pay-day.js').start({ DATA, P, PL, A: require('./lib/addons.js'), now: Date.now(), tenant: vn, state: st, who, plan: String(b.plan || '') });
        if (r.status) { s.writeHead(r.status, h); return s.end(JSON.stringify(r.body || {})); }
      }
      // 21.11.2026: the start record the entry payment checks (lib/pay-guard.js startRecent, 24 hours).
      require('./lib/pay-guard.js').startWrite(DATA, vn, Date.now());
      const url = await P.beginEntry({ tenant: vn, name: (of && of.name) || who.name, email: (of && of.email) || who.email, phone: who.phone, items: of ? of.items : null, redirect: 'https://wa.abaitzik.com/api/pay/done', cancel: who.home });
      s.writeHead(200, h); return s.end(JSON.stringify({ url }));
    } catch (e) { log('pay start: ' + e.message); s.writeHead(502, h); return s.end('{"error":"pay"}'); }
  }
  /*
    14.11.2026, Itzik: every add-on and upgrade is paid on SUMIT and opens by itself (lib/addons.js).
    The page sends its visit key, what it wants and the answers (which software, which bank and kind).
    The order is kept here, SUMIT's page opens, and /api/pay/addon-done/<order> checks and applies it.
  */
  if (u.pathname === '/api/pay/addon') {
    const vn = require('./lib/visits.js').nameByKey(DATA, b.key);
    if (!vn) { s.writeHead(403, h); return s.end('{"error":"key"}'); }
    const P = require('./lib/sumit.js'), A = require('./lib/addons.js');
    if (!P.ready()) { s.writeHead(503, h); return s.end('{"error":"pay"}'); }
    const ans = b.answers && typeof b.answers === 'object' ? { software: String(b.answers.software || ''), bank: String(b.answers.bank || ''), kind: String(b.answers.kind || '') } : {};
    const q = A.quote(require('./lib/plan-io.js').stateOf(vn), String(b.what || ''), ans, require('./lib/bank-flow.js').BANKS);
    if (!q.ok) {
      // A bank the program does not read yet: the customer hears it honestly and Itzik sees the demand.
      if (q.why === 'unsupported') { try { require('./lib/handle.js').complete({ key: 'addon-unsup-' + vn + '-' + ans.bank + '-' + ans.kind, kind: 'lead', who: payWho(vn).name, title: 'ביקש חיבור לבנק שהתוכנה עוד לא קוראת: ' + q.bankName + ', ' + q.kindName + '. לא חויב.', link: 'biz' }); } catch (e) { log('addon unsup: ' + e.message); } }
      s.writeHead(409, h); return s.end(JSON.stringify({ error: q.why, bankName: q.bankName || '', kindName: q.kindName || '' }));
    }
    try {
      const who = payWho(vn);
      const oid = crypto.randomBytes(9).toString('hex');
      const od = path.join(DATA, 'pay', 'orders'); fs.mkdirSync(od, { recursive: true });
      fs.writeFileSync(path.join(od, oid + '.json'), JSON.stringify(Object.assign({ id: oid, tenant: vn, at: new Date().toISOString(), status: 'open' }, q), null, 1), { mode: 0o600 });
      const url = await P.beginEntry({ tenant: vn, name: who.name, email: who.email, phone: who.phone, items: q.items, redirect: 'https://wa.abaitzik.com/api/pay/addon-done/' + oid, cancel: who.home });
      log('addon order ' + vn + ' ' + q.kind + ' ' + oid);
      s.writeHead(200, h); return s.end(JSON.stringify({ url }));
    } catch (e) { log('addon start: ' + e.message); s.writeHead(502, h); return s.end('{"error":"pay"}'); }
  }
  // 11.11: a customer's page says when it is open and for how long (lib/visits.js), with its own visit key.
  if (u.pathname === '/api/visit') {
    const V = require('./lib/visits.js');
    const vn = V.nameByKey(DATA, b.key);
    if (!vn) { s.writeHead(403, h); return s.end('{"error":"key"}'); }
    try { V.record(DATA, vn, b); if (b.ev === 'start' || b.ev === 'end') V.buildSoon(); } catch (e) { log('visit: ' + e.message); }
    s.writeHead(200, h); return s.end('{"ok":true}');
  }
  // 12.11.2026, Itzik: the free AI diagnosis must be fully automatic. The page it-solution.co.il/ai posts seven answers here;
  // lib/diag.js validates and queues them (honeypot, one per email per 24 hours, a limit per address) and answers at once.
  // diag.js (timer, every minute) writes and mails the diagnosis. Public like /api/signup, Itzik's own instance only.
  if (u.pathname === '/api/diag') {
    if (!isOwnerInstance()) { s.writeHead(404, h); return s.end('{}'); }
    let r; try { r = require('./lib/diag.js').intake(DATA, b, realIp(q)); } catch (e) { log('diag: ' + e.message); r = { status: 500, json: { error: 'server' } }; }
    s.writeHead(r.status, h); return s.end(JSON.stringify(r.json));
  }
  // 7.11: a customer's monitor talks to its own chat with its own key (data/fastchat/tenants.json).
  if (codeLocked(q)) { s.writeHead(429, h); return s.end('{"error":"wait"}'); }
  // 12.11: the campaign sheet's interviewer (lib/camp-ask.js), for the owner and every customer, always on the customers' API key.
  if (u.pathname === '/api/chat/camp') {
    const own = codeOk(b.code), tn = own ? null : tenantByKey(b.code);
    if (!own && !tn) { codeFail(q, b.code); s.writeHead(403, h); return s.end('{"error":"code"}'); }
    let cst; try { cst = require('./lib/sales-train.js').forCustomer(); } catch (e) { log('camp ask: ' + e.message); s.writeHead(503, h); return s.end('{"error":"key"}'); }
    let ownBiz = ''; if (own) { try { ownBiz = JSON.parse(fs.readFileSync(path.join(ROOT, 'instance.json'), 'utf8')).business || ''; } catch (e) {} }
    const r = await require('./lib/camp-ask.js').ask(cst.llm, b, { name: own ? 'owner' : tn.name, business: own ? ownBiz : (tn.business || '') });
    s.writeHead(r.status, h); return s.end(JSON.stringify(r.json));
  }
  if (/^\/api\/chat(\/thread|\/todo)?$/.test(u.pathname) && !codeOk(b.code)) {
    const tn = tenantByKey(b.code);
    if (!tn) { codeFail(q, b.code); s.writeHead(403, h); return s.end('{"error":"code"}'); }
    // 21.11.2026 security review: every message the bridge accepts for a tenant is counted (lib/meter.js), in the bridge's own data.
    // 2nd review (7): counted for every accepted message, and never for a free tile message.
    if (u.pathname === '/api/chat' && require('./lib/meter.js').countable(String(b.text || ''))) { try { require('./lib/meter.js').bump(DATA, require('./lib/plan-io.js').SPOOL, tn.name, Date.now()); } catch (e) { log('meter: ' + e.message); } }
    // 11.11.2026: a customer's chat and trainings run on the customers' API key, never on Itzik's subscription.
    let cst; try { cst = require('./lib/sales-train.js').forCustomer(); } catch (e) { log('customer chat: ' + e.message); s.writeHead(503, h); return s.end('{"error":"key"}'); }
    const r = await require('./lib/fast-chat.js').chatApi(u.pathname, b, { llm: cst.llm, salesTrain: cst, dataPath: path.join(DATA, 'fastchat', 't', tn.name),
      toMonitor: tenantToMonitor(tn), owner: false, business: tn.business || '', enabled: true, context: () => chatContext(tn) });
    s.writeHead(r.status, h); return s.end(JSON.stringify(r.json));
  }
  if (!codeOk(b.code)) { codeFail(q, b.code); s.writeHead(403, h); return s.end('{"error":"code"}'); }
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
    // 16.11.2026, Itzik: "אני לא מקבל עדכונים בוואטסאפ פתאום". A task sent from the page's chat box went into the
    // queue with no WhatsApp address, so its answer stayed on the page only. On his own monitor it now waits like a
    // WhatsApp question, and sweep() sends the answer to his number (text inside the 24 hours, else the template).
    const pageToMonitor = async function (kind, text, re, files) {
      const id = await toMonitor(kind, text, re, files);
      try {
        const own = isOwnerInstance() ? String(((cfg().allow || [])[0]) || '') : '';
        if (/^d{8,15}$/.test(own)) { const sp = loadState(); sp.pending[id] = { to: own, at: Date.now(), name: '', page: true }; saveState(sp); log('page task ' + id + ' -> answer to WhatsApp'); }
      } catch (e) { log('!! page task pending: ' + e.message); }
      return id;
    };
    const r = await require('./lib/fast-chat.js').chatApi(u.pathname, b, { dataPath: DATA, toMonitor: pageToMonitor, owner: inst.name === 'abaitzik', business: bizOf(inst), enabled: enabled, context: () => chatContext(null) });
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

/*
  12.11.2026, Itzik: a customer connects his own WhatsApp number from 🔌, through Kapso (lib/kapso.js).
  Itzik's instance only, it is the public one (wa.abaitzik.com).
  1. GET /api/wa/connect?t=<tenant id>&c=<his code>: the code is checked against data/tenants/tenants/<t>.json `code`
     when it has one, and against the fast chat key of that tenant (data/fastchat/tenants.json, the same key his page
     already holds as D.fcKey and lib/connections.js puts in the link), constant time, then a 302 to a fresh Kapso setup link.
     A wrong code counts per address (10 in 15 minutes lock it for 30 minutes), and so does too many requests.
  2. POST /kapso/project (also /api/kapso/project): Kapso's project webhook. Signed with kapsoProjectSecret
     (data/kapso.json). On whatsapp.phone_number.created it leaves data/kapso/pending/<tenant>.json for
     setup/wa-kapso-provision.sh, registers the per number webhook to /webhook, and pushes Itzik one line.
     The answer is 200 at once, the slow work comes after; X-Idempotency-Key makes a repeat harmless.
*/
const KAPSO_DIR = path.join(DATA, 'kapso');
let ownerForTest = null; // 12.11.2026: a test says which instance this is
function isOwnerInstance() { if (ownerForTest !== null) return ownerForTest; try { return require('./lib/instance.js').name === 'abaitzik'; } catch (e) { return false; } }
function connectPage(s, status, msg) {
  s.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  s.end('<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>חיבור וואטסאפ</title>'
    + '<body style="font-family:Heebo,Arial,sans-serif;max-width:420px;margin:12vh auto;padding:0 16px;text-align:center"><h2>' + msg + '</h2>'
    + '<p><a href="https://it-solution.co.il">חזרה לאתר IT Solution</a></p></body></html>');
}
function sha(x) { return crypto.createHash('sha256').update(String(x)).digest(); }
function connectCodeOk(t, c) {
  t = String(t || ''); c = String(c || '');
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(t) || c.length < 8) return false;
  const exp = [];
  try { const r = JSON.parse(fs.readFileSync(path.join(DATA, 'tenants', 'tenants', t + '.json'), 'utf8')); if (r && typeof r.code === 'string' && r.code.length >= 8) exp.push(r.code); } catch (e) { return false; }
  try { const f = JSON.parse(fs.readFileSync(path.join(DATA, 'fastchat', 'tenants.json'), 'utf8')); if (f && f[t] && typeof f[t].key === 'string' && f[t].key.length >= 16) exp.push(f[t].key); } catch (e) { /* none */ }
  let ok = false;
  exp.forEach(function (e) { if (crypto.timingSafeEqual(sha(e), sha(c))) ok = true; });
  return ok;
}
const connHits = new Map();
function connBump(q, fail) {
  const ip = realIp(q), now = Date.now();
  let r = connHits.get(ip);
  if (!r || now - r.first > 15 * 60e3) r = { first: now, n: 0, f: 0, until: 0 };
  r.n++; if (fail) r.f++;
  if (!r.until && (r.f >= 10 || r.n >= 40)) { r.until = now + 30 * 60e3; log('connect lock ' + ip); }
  connHits.set(ip, r);
  if (connHits.size > 5000) connHits.clear();
  return r;
}
async function waConnect(q, s, u) {
  if (!isOwnerInstance()) return connectPage(s, 404, 'הדף לא נמצא');
  if (q.method !== 'GET') { s.writeHead(405); return s.end(); }
  const pre = connHits.get(realIp(q));
  if (pre && pre.until > Date.now()) return connectPage(s, 429, 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד חצי שעה.');
  const t = u.searchParams.get('t'), c = u.searchParams.get('c');
  if (!connectCodeOk(t, c)) { connBump(q, true); return connectPage(s, 403, 'הקישור לא תקין. כדאי לפתוח שוב את החיבורים מתוך המוניטור.'); }
  const r = connBump(q, false);
  if (r.until > Date.now()) return connectPage(s, 429, 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד חצי שעה.');
  let url;
  try { url = await require('./lib/kapso.js').setupLink(DATA, String(t)); }
  catch (e) { log('connect failed for ' + t + ': ' + String(e.message).replace(/[0-9a-f]{24,}/gi, '...')); return connectPage(s, 502, 'לא הצלחנו לפתוח את החיבור כרגע. נסו שוב בעוד דקה, ואם זה חוזר, כתבו לנו במוניטור.'); }
  s.writeHead(302, { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  s.end();
}
function kapsoSeen(key) {
  const f = path.join(KAPSO_DIR, 'seen.json');
  let o = {}; try { o = JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch (e) {}
  if (key && o[key]) return true;
  if (key) {
    o[key] = Date.now();
    const e = Object.entries(o); if (e.length > 500) o = Object.fromEntries(e.slice(-500));
    fs.mkdirSync(KAPSO_DIR, { recursive: true });
    fs.writeFileSync(f + '.tmp', JSON.stringify(o), { mode: 0o600 }); fs.renameSync(f + '.tmp', f);
  }
  return false;
}
let pushItzik = function (title, text) {
  try { require('child_process').execFile(process.execPath, [path.join(__dirname, 'notify.js'), title, text], { cwd: __dirname, timeout: 60000 }, function (e) { if (e) log('kapso push failed: ' + e.message); }); } catch (e) { log('kapso push failed: ' + e.message); }
};
async function kapsoEvent(raw, headers) {
  const K = require('./lib/kapso.js');
  let d; try { d = JSON.parse(raw.toString('utf8')); } catch (e) { return 'bad json'; }
  const hv = function (n) { const k = Object.keys(headers || {}).find(function (x) { return x.toLowerCase() === n; }); return k ? String(headers[k]) : ''; };
  const ev = hv('x-webhook-event') || d.event || '';
  if (kapsoSeen(hv('x-idempotency-key'))) return 'duplicate';
  if (ev !== 'whatsapp.phone_number.created') return 'ignored ' + ev;
  const phoneId = String(d.phone_number_id || '');
  const tenant = K.tenantOf(DATA, d.customer);
  if (!/^\d{5,25}$/.test(phoneId) || !tenant) { log('kapso: number event without a known customer'); return 'unknown'; }
  const pf = path.join(KAPSO_DIR, 'pending', tenant + '.json');
  let same = null;
  try { same = JSON.parse(fs.readFileSync(pf, 'utf8')); } catch (e) {}
  if (!same) { try { same = JSON.parse(fs.readFileSync(path.join(KAPSO_DIR, 'done', tenant + '.json'), 'utf8')); } catch (e) {} }
  if (same && String(same.phoneId) === phoneId) return 'already';
  const display = await K.phoneDisplay(DATA, phoneId);
  const rec = { tenantId: tenant, phoneId: phoneId, display: display, at: new Date().toISOString(), hook: '' };
  fs.mkdirSync(path.dirname(pf), { recursive: true });
  fs.writeFileSync(pf + '.tmp', JSON.stringify(rec, null, 1), { mode: 0o600 }); fs.renameSync(pf + '.tmp', pf);
  try {
    await K.registerNumberWebhook(DATA, phoneId, cfg().kapsoSecret);
    rec.hook = 'ok';
  } catch (e) { rec.hook = 'failed'; log('kapso hook failed for ' + tenant + ': ' + e.message); }
  if (fs.existsSync(pf)) { fs.writeFileSync(pf + '.tmp', JSON.stringify(rec, null, 1), { mode: 0o600 }); fs.renameSync(pf + '.tmp', pf); }
  const t = K.tenantRec(DATA, tenant) || {};
  pushItzik('💬 חיבור וואטסאפ', '💬 ' + (t.title || tenant) + ' חיבר וואטסאפ ' + (display || ''));
  return 'pending';
}
function kapsoProject(q, s) {
  if (!isOwnerInstance()) { s.writeHead(404); s.end(); return Promise.resolve(); }
  if (q.method !== 'POST') { s.writeHead(405); s.end(); return Promise.resolve(); }
  return readBody(q, 300000).then(function (raw) {
    const secret = require('./lib/kapso.js').cfg(DATA).kapsoProjectSecret;
    if (!require('./lib/kapso.js').verifyProjectWebhook(raw, q.headers, secret)) { log('kapso project: bad signature'); s.writeHead(401); s.end(); return; }
    s.writeHead(200); s.end('ok');
    return kapsoEvent(raw, q.headers).then(function (r) { log('kapso project: ' + r); }, function (e) { log('kapso project failed: ' + e.message); });
  }, function () { s.writeHead(400); s.end(); });
}

const server = http.createServer(function (q, s) {
  const u = new URL(q.url, 'http://x');
  // 22.11.2026 (lib/cal-feed.js): the subscribed calendar of the appointments and tasks. A calendar app cannot send a body,
  // so the key is in the address; a wrong key gets 404 with no body, and nothing else is answered here.
  const calm = u.pathname.match(/^\/api\/cal\/([^/]+)\.ics$/);
  if (calm && q.method === 'GET') {
    let ok = false; try { ok = require('./lib/cal-feed.js').keyOk(DATA, calm[1]); } catch (e) { log('cal feed: ' + e.message); }
    if (!ok) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' });
    return s.end(require('./lib/cal-feed.js').ics(DATA));
  }
  // 14.11.2026 (lib/partner.js): Facebook through partner access until Meta's App Review. GET the page, POST the Page link.
  if ((u.pathname === '/api/partner' && q.method === 'GET') || (u.pathname === '/api/partner/claim' && q.method === 'POST')) {
    (async function () {
      const PT = require('./lib/partner.js');
      let t = u.searchParams.get('t') || '', c = u.searchParams.get('c') || '', input = '';
      if (q.method === 'POST') { const f = new URLSearchParams((await readBody(q, 4000)).toString('utf8')); t = f.get('t') || ''; c = f.get('c') || ''; input = String(f.get('page') || '').trim().slice(0, 300); }
      if (!connectCodeOk(t, c)) { connBump(q, true); return connectPage(s, 403, 'הקישור לא תקין. פותחים אותו מחדש מתוך 🔌 במוניטור.'); }
      if (connBump(q, false).until > Date.now()) return connectPage(s, 429, 'יותר מדי ניסיונות. נסו שוב בעוד חצי שעה.');
      const dir = path.join(DATA, 'partner');
      const cf = path.join(dir, 'claims', t + '.json');
      let claim = null; try { claim = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch (e) {}
      let link = null; try { link = JSON.parse(fs.readFileSync(path.join(dir, 'links', t + '.json'), 'utf8')); } catch (e) {}
      if (q.method === 'POST') {
        if (!PT.pageRef(input)) { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); return s.end(PT.page(t, c, { input }, link).replace('<form', '<p class="err">זה לא נראה כמו קישור לדף פייסבוק. פותחים את הדף בפייסבוק ומעתיקים את הכתובת מלמעלה.</p><form')); }
        claim = { input, at: new Date().toISOString() };
        fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, JSON.stringify(claim, null, 1));
        log('partner claim ' + t);
      }
      s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      s.end(PT.page(t, c, claim, link));
    })().catch(function (e) { log('partner: ' + e.message); try { connectPage(s, 500, 'משהו השתבש, נסו שוב.'); } catch (x) {} });
    return;
  }
  if (u.pathname === '/api/wa/connect') { waConnect(q, s, u).catch(function (e) { log('connect: ' + e.message); try { connectPage(s, 500, 'משהו השתבש, נסו שוב.'); } catch (x) {} }); return; }
  if (u.pathname === '/kapso/project' || u.pathname === '/api/kapso/project') { kapsoProject(q, s); return; }
  // 12.11: a referrer's (affiliate) form and table, /r/<token>[/t] and /api/ref-lead (affiliates.js).
  const rm = u.pathname.match(/^\/r\/([a-f0-9]{16,40})(?:\/(t))?\/?$/);
  if (rm && q.method === 'GET') { require('./affiliates.js').serve(rm[1], rm[2], s); return; }
  if (u.pathname === '/api/ref-lead') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    // 12.11: the referrer's signature on his terms comes the same way ({ sign:1 }), so the body may hold a PNG.
    readBody(q, 450000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400, { 'Content-Type': 'application/json' }); return s.end('{}'); }
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '-').split(',').pop().trim();
      const A = require('./affiliates.js');
      const r = b && b.sign ? A.handleSign(b, ip, q.headers['user-agent'], function (k, t) { formNotify(k, t); }) : A.handleLead(b, ip, function (k, t) { formNotify(k, t); });
      if (r.ok && !(b && b.sign)) { try { require('child_process').execFile(process.execPath, [path.join(__dirname, 'push.js'), 'leads: affiliate'], { cwd: __dirname, timeout: 120000 }, function () {}); } catch (e) {} }
      s.writeHead(r.ok ? 200 : (r.error === 'limit' ? 429 : 400), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); s.end(JSON.stringify(r));
    }, function () { s.writeHead(400); s.end(); });
    return;
  }
  // 1.11: client intake forms on form.it-solution.co.il (forms.js).
  const fm = u.pathname.match(/^\/f\/([a-f0-9]{16,40})(\/view)?\/?$/);
  if (fm && q.method === 'GET') { if (fm[2]) require('./owner-mark.js').setCookie(s, q); if (fm[2]) require('./form-view.js').serve('./forms.js', fm[1], s); else require('./forms.js').servePage(fm[1], s); return; }
  // 4.11: sign an existing document (docsign.js), /d/<signer token>[/signed|/pN.png] and /api/docsign.
  const dm = u.pathname.match(/^\/d\/([a-f0-9]{16,40})(?:\/(signed|p\d{1,2}\.png))?\/?$/);
  if (dm && q.method === 'GET') { require('./docsign.js').serve(dm[1], dm[2], s); return; }
  if (u.pathname === '/api/docsign') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 700000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',').pop().trim();
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
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',').pop().trim();
      require('./agrsign.js').handlePost(b, formNotify, ip, q.headers['user-agent'], function (r) { s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body)); });
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  // 15.11.2026: a one-time link that marks a device of Itzik's as his (owner-mark.js issue).
  const mk = u.pathname.match(/^\/l\/m\/([a-f0-9]{32})\/?$/);
  if (mk && q.method === 'GET') {
    const okm = require('./owner-mark.js').redeem(mk[1], s);
    s.writeHead(okm ? 200 : 410, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end('<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;text-align:center;padding:60px 16px;font-size:20px">' + (okm ? '✅ המכשיר הזה מסומן עכשיו כשלך.' : 'הקישור כבר שומש או שפג תוקפו.') + '</body></html>');
    return;
  }
  // 15.11.2026: a page locked to one phone, with a tracker (lib/ledger-lock.js), /l/<token>[/view] and /api/ledger.
  const lm = u.pathname.match(/^\/l\/([a-f0-9]{20})(?:\/(view))?\/?$/);
  if (lm && q.method === 'GET') { require('./lib/ledger-lock.js').serve(lm[1], lm[2], q, s, formNotify); return; }
  if (u.pathname === '/api/ledger') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 10000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      require('./lib/ledger-lock.js').handlePost(b, q, function (r) { s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body)); });
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
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',').pop().trim();
      require('./ndasign.js').handlePost(b, formNotify, ip, q.headers['user-agent'], function (r) { s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body)); });
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  // 14.11.2026: a customer's own quote, signed by his client (lib/csign.js), /c/<token>[/signed|/view] and /api/csign.
  const cm = u.pathname.match(/^\/c\/([a-f0-9]{24})(?:\/(signed|view))?\/?$/);
  if (cm && q.method === 'GET') { require('./lib/csign.js').servePage(DATA, cm[1], cm[2], s); return; }
  if (u.pathname === '/api/csign') {
    if (q.method !== 'POST') { s.writeHead(405); return s.end(); }
    readBody(q, 600000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400); return s.end('{}'); }
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',').pop().trim();
      const r = require('./lib/csign.js').handlePost(DATA, b, ip, q.headers['user-agent'], csignTell);
      s.writeHead(r.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r.body));
    }).catch(function () { try { s.writeHead(400); s.end('{}'); } catch (e) {} });
    return;
  }
  // 14.11.2026: the customer's page asks for a signing link (his visit key, the quote as fields, his logo). Big body, own CORS.
  if (u.pathname === '/api/csign/create') {
    const origin = q.headers.origin || '';
    const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (originOk(origin)) { h['Access-Control-Allow-Origin'] = origin; h['Access-Control-Allow-Headers'] = 'Content-Type'; h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'; }
    if (q.method === 'OPTIONS') { s.writeHead(204, h); return s.end(); }
    if (q.method !== 'POST') { s.writeHead(405, h); return s.end('{}'); }
    readBody(q, 600000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400, h); return s.end('{}'); }
      const vn = require('./lib/visits.js').nameByKey(DATA, b.key);
      if (!vn) { s.writeHead(403, h); return s.end('{"error":"key"}'); }
      const C = require('./lib/csign.js');
      const r = C.create(DATA, vn, b, require('./lib/plan-io.js').stateOf(vn));
      if (!r.ok) { s.writeHead(r.why === 'limit' ? 409 : 400, h); return s.end(JSON.stringify({ error: r.why, limit: r.limit || 0 })); }
      log('csign link ' + vn);
      s.writeHead(200, h); s.end(JSON.stringify({ link: r.link, left: r.left }));
    }).catch(function () { try { s.writeHead(400, h); s.end('{}'); } catch (e) {} });
    return;
  }
  // 22.11.2026 (lib/book-page.js): the public booking page, /b/<link>, /b/a/<link>.<tok> and /api/book*.
  if (/^\/b\/[a-f0-9]/.test(u.pathname) || /^\/api\/book(\/|$)/.test(u.pathname)) { bookRoute(q, u, s); return; }
  /*
    16.11.2026: a quote made in 🧾 is kept on our side, data/tenant-quotes/<customer>/biz-home/quotes.json (lib/biz-home.js
    addQuote), not only on the phone that made it. This service runs as monitor and can not write into a customer's home,
    so it stays here, like the signatures, and /api/quote/list hands it back to his page. Same visit key check as
    /api/csign/create.
  */
  if (u.pathname === '/api/quote/save' || u.pathname === '/api/quote/list') {
    const origin = q.headers.origin || '';
    const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (originOk(origin)) { h['Access-Control-Allow-Origin'] = origin; h['Access-Control-Allow-Headers'] = 'Content-Type'; h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'; }
    if (q.method === 'OPTIONS') { s.writeHead(204, h); return s.end(); }
    if (q.method !== 'POST') { s.writeHead(405, h); return s.end('{}'); }
    readBody(q, 200000).then(function (raw) {
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { s.writeHead(400, h); return s.end('{}'); }
      const vn = require('./lib/visits.js').nameByKey(DATA, b.key);
      if (!vn || !/^[a-z0-9-]{1,32}$/.test(String(vn))) { s.writeHead(403, h); return s.end('{"error":"key"}'); }
      const qdir = path.join(DATA, 'tenant-quotes', String(vn));
      if (u.pathname === '/api/quote/list') {
        let l = []; try { l = require('./lib/biz-home.js').readList(qdir, 'quote').slice(-40); } catch (e) { /* none yet */ }
        s.writeHead(200, h); return s.end(JSON.stringify({ quotes: l }));
      }
      let r = null; try { r = require('./lib/biz-home.js').addQuote(qdir, b.q, 'owner'); } catch (e) { log('!! quote save ' + vn + ': ' + e.message); }
      if (!r) { s.writeHead(400, h); return s.end('{"error":"quote"}'); }
      log('quote saved ' + vn + ' ' + r.id);
      s.writeHead(200, h); s.end(JSON.stringify({ ok: true, id: r.id }));
    }).catch(function () { try { s.writeHead(400, h); s.end('{}'); } catch (e) {} });
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
      const ip = String(q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',').pop().trim();
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
  if (sm && q.method === 'GET') { if (sm[2]) require('./owner-mark.js').setCookie(s, q); if (sm[2]) require('./form-view.js').serve('./setup.js', sm[1], s); else require('./setup.js').servePage(sm[1], s, q); return; }
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
  // 14.11.2026: back from SUMIT after an add-on or upgrade (addonDone).
  if (/^\/api\/pay\/renew\/[a-z0-9.-]+$/.test(u.pathname) && q.method === 'GET') { renewGet(u.pathname.split('/').pop(), s).catch(function (e) { log('renew get: ' + e.message); try { s.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); s.end('החיוב לא נפתח כרגע. נסו שוב בעוד דקה.'); } catch (x) {} }); return; }
  if (/^\/api\/pay\/addon-done\/[a-f0-9]{18}$/.test(u.pathname) && q.method === 'GET') { addonDone(u, s).catch(function (e) { log('addon done: ' + e.message); try { s.writeHead(302, { Location: 'https://it-solution.co.il/offer/?pay=error' }); s.end(); } catch (x) {} }); return; }
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
    if (!sigOk(raw, q.headers)) { log('bad signature'); s.writeHead(401); return s.end(); }
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
        if (dest === 'other') { if (!forwarded[pid]) { forwarded[pid] = 1; forward(pid, raw, q.headers); } return; }
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
module.exports = { api, connectCodeOk, waConnect, kapsoProject, kapsoEvent, textOf, sigOk, voiceCommand, speakable, shortOf, isAllCommand, route, onMessage, sweep, outboxSweep, _set: function (o) { if (o.push) pushItzik = o.push; if (o.waSend) waSend = o.waSend; if (o.markRead) markRead = o.markRead; if (o.stranger !== undefined) strangerDeps = o.stranger; if (o.owner !== undefined) ownerForTest = o.owner; } };
