'use strict';
/*
  25.11.2026, Itzik: "את כל הדוגמאות שביקשנו מצליל, איפה יכולה לעלות לנו אותם?" ... "כן דף העלאה".
  A private upload page for Raindrop Productions (Tslil): https://form.it-solution.co.il/u/<20 hex>.
  The token lives in data/rd-upload/token.txt only (this repo is public). The files are kept in
  data/rd-upload/files/<item>/, never in git and never served back: real documents (Ministry of Defense
  quotes) must not sit on a public address. The server moves them to Itzik's Drive (itcohen2) by API, lib/my-drive.js, and deletes them here (toDrive).
  The home computer is only a fallback for a file still here after 10 minutes, drive G:
  (C:\Users\User\work\raindrop-pull\pull.js, scheduled task RaindropPull every 5 minutes).

  GET  /u/<tok>          the page: the seven items, an upload button by each, what already arrived.
  GET  /u/<tok>/state    { items: [{ n, files: [{ name, size, at }] }] }
  POST /api/rd-upload    raw file body, headers x-tok, x-item (1..7), x-name (encodeURIComponent).
  sweep(notify)          once a minute: one message for everything uploaded since the last one.
  Limits: 25 MB a file, 300 MB in all (the disk is small), known document and image types only.
*/
const fs = require('fs');
const path = require('path');

const ITEMS = [
  'גיליון תקציב אמיתי אחד של אירוע שכבר הסתיים, קובץ האקסל כמו שהוא',
  'הצעת מחיר אחת בפורמט משהב״ט, כמו שנשלחה ליחידה',
  'גיליון אחד של ספקים או אטרקציות, כולל מחיר ספק מול מחיר צה״ל',
  'דוגמה למסמך עם פק״א ולמסמך עם ימ״מ',
  'הלוגו בקובץ ברור, ואם יש, צבעי המותג',
  'רשימה של מי יעבוד במערכת: שם, תפקיד וטלפון',
  'העתק של תעודת משלוח',
];
/** The Drive folder of each item, under ריינדרופ הפקות / דוגמאות מצליל (the same names the PC fallback uses) */
const FOLDERS = ['1. גיליון תקציב', '2. הצעת מחיר משהב״ט', '3. ספקים ואטרקציות', '4. פק״א וימ״מ', '5. לוגו וצבעים', '6. משתמשים', '7. תעודת משלוח'];
const DRIVE_ROOT = ['ריינדרופ הפקות', 'דוגמאות מצליל'];
const EXT = /\.(pdf|xlsx|xlsm|xls|csv|doc|docx|txt|jpg|jpeg|png|heic|heif|webp|svg|ai|eps|zip)$/i;
const MAX_FILE = 25 * 1024 * 1024;
const MAX_ALL = 300 * 1024 * 1024;

function root(DATA) { return path.join(DATA, 'rd-upload'); }
function token(DATA) { try { const t = fs.readFileSync(path.join(root(DATA), 'token.txt'), 'utf8').trim(); return /^[a-f0-9]{20}$/.test(t) ? t : ''; } catch (e) { return ''; } }
function tokOk(DATA, t) {
  const a = token(DATA), b = String(t || '');
  return !!a && a.length === b.length && require('crypto').timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function logFile(DATA) { return path.join(root(DATA), 'uploads.json'); }
function loadLog(DATA) { try { return JSON.parse(fs.readFileSync(logFile(DATA), 'utf8')); } catch (e) { return { files: [] }; } }
function saveLog(DATA, l) { fs.mkdirSync(root(DATA), { recursive: true }); const f = logFile(DATA); fs.writeFileSync(f + '.tmp', JSON.stringify(l, null, 1)); fs.renameSync(f + '.tmp', f); }

/** A file name that is safe on disk: no folders, no control characters, Hebrew kept. */
function safeName(n) {
  let s = String(n || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/^\.+/, '').trim().slice(-120);
  return s || 'file';
}

/** One upload. body is a Buffer. Returns { status, body }. */
function handleUpload(DATA, h, body, opts) {
  const now = (opts && opts.now) || Date.now();
  if (!tokOk(DATA, h.tok)) return { status: 403, body: { ok: false } };
  const n = Number(h.item);
  if (!Number.isInteger(n) || n < 1 || n > ITEMS.length) return { status: 400, body: { ok: false, error: 'item' } };
  let name; try { name = safeName(decodeURIComponent(String(h.name || ''))); } catch (e) { return { status: 400, body: { ok: false } }; }
  if (!EXT.test(name)) return { status: 415, body: { ok: false, error: 'type' } };
  if (!body || !body.length) return { status: 400, body: { ok: false, error: 'empty' } };
  if (body.length > MAX_FILE) return { status: 413, body: { ok: false, error: 'big' } };
  const log = loadLog(DATA);
  // only what is still here counts: the home computer moves the files to Drive and deletes them (work/raindrop-pull/pull.js)
  let used = 0;
  try { fs.readdirSync(path.join(root(DATA), 'files')).forEach((d) => { fs.readdirSync(path.join(root(DATA), 'files', d)).forEach((f) => { used += fs.statSync(path.join(root(DATA), 'files', d, f)).size; }); }); } catch (e) { /* nothing yet */ }
  if (used + body.length > MAX_ALL) return { status: 507, body: { ok: false, error: 'full' } };
  const dir = path.join(root(DATA), 'files', String(n));
  fs.mkdirSync(dir, { recursive: true });
  const stored = new Date(now).toISOString().replace(/[:.]/g, '-') + '_' + name;
  fs.writeFileSync(path.join(dir, stored), body, { mode: 0o640 });
  log.files.push({ item: n, name, stored, size: body.length, at: new Date(now).toISOString(), reported: false });
  saveLog(DATA, log);
  return { status: 200, body: { ok: true } };
}

function state(DATA) {
  const log = loadLog(DATA);
  return { items: ITEMS.map((t, i) => ({ n: i + 1, files: log.files.filter((f) => f.item === i + 1).map((f) => ({ name: f.name, size: f.size, at: f.at })) })) };
}

function sweep(DATA, notify, opts) {
  const log = loadLog(DATA);
  const fresh = log.files.filter((f) => !f.reported);
  if (!fresh.length) return 0;
  const have = new Set(log.files.map((f) => f.item));
  const missing = ITEMS.map((t, i) => i + 1).filter((n) => !have.has(n));
  const text = (fresh.length === 1 ? 'קובץ חדש' : fresh.length + ' קבצים חדשים') + ' בדף ההעלאה של ריינדרופ:\n'
    + fresh.slice(0, 10).map((f) => '• ' + f.item + '. ' + ITEMS[f.item - 1].split(',')[0] + ': ' + f.name).join('\n')
    + (fresh.length > 10 ? '\nועוד ' + (fresh.length - 10) + '.' : '')
    + '\n' + (missing.length ? 'עוד חסרים: ' + missing.join(', ') + '.' : 'כל שבעת הפריטים הגיעו.')
    + '\nהקבצים עוברים לדרייב שלך (itcohen2), לתיקייה ריינדרופ הפקות / דוגמאות מצליל.';
  fresh.forEach((f) => { f.reported = true; });
  saveLog(DATA, log);
  try { notify('קבצים מריינדרופ', text); } catch (e) { /* kept in the log */ }
  if (opts && opts.wa) { try { Promise.resolve(opts.wa(text)).catch(function () {}); } catch (e) { /* push went */ } }
  return fresh.length;
}

/*
  Every file still on disk goes to Itzik's Drive (lib/my-drive.js) and is deleted here only after Drive
  reports the same size. drive is { ready(), put(buf, name, parts) }; injected in the tests.
  One run at a time; a file that fails stays and is tried next minute (and by the PC fallback after 10 minutes).
*/
let moving = false;
async function toDrive(DATA, drive) {
  if (moving || !drive || !drive.ready()) return 0;
  moving = true;
  let n = 0;
  try {
    const base = path.join(root(DATA), 'files');
    let dirs = []; try { dirs = fs.readdirSync(base); } catch (e) { return 0; }
    for (const d of dirs) {
      const item = Number(d); if (!(item >= 1 && item <= ITEMS.length)) continue;
      for (const stored of fs.readdirSync(path.join(base, d))) {
        const fp = path.join(base, d, stored);
        const buf = fs.readFileSync(fp);
        const orig = stored.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z_/, '');
        const r = await drive.put(buf, orig, DRIVE_ROOT.concat(FOLDERS[item - 1]));
        if (!r || r.size !== buf.length) continue;
        fs.unlinkSync(fp);
        const log = loadLog(DATA); const e = log.files.find((f) => f.stored === stored);
        if (e) { e.drive = r.link || r.id; saveLog(DATA, log); }
        n++;
      }
    }
  } finally { moving = false; }
  return n;
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function page(tok) {
  const items = ITEMS.map((t, i) => '<li class="it" data-n="' + (i + 1) + '"><div class="hd"><span class="num">' + (i + 1) + '</span><span class="tx">' + esc(t) + '</span><span class="ok" hidden>✓</span></div>'
    + '<ul class="fl"></ul><label class="btn">העלאת קובץ<input type="file" multiple hidden></label><div class="msg"></div></li>').join('');
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>ריינדרופ הפקות: העלאת דוגמאות</title>'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" rel="stylesheet">'
    + '<style>*{box-sizing:border-box}body{margin:0;background:#f5f4f1;color:#151515;font:16px/1.55 Heebo,system-ui,sans-serif}'
    + 'header{background:#000;color:#fff;padding:18px 16px}header h1{margin:0;font-size:21px;font-weight:800}header p{margin:4px 0 0;color:#ddd;font-size:15px}'
    + 'main{max-width:680px;margin:0 auto;padding:16px 16px 48px}ol{list-style:none;margin:0;padding:0}'
    + '.it{background:#fff;border:1px solid #e4e2dc;border-radius:16px;padding:14px;margin:0 0 12px}.it.done{border-color:#16a34a}'
    + '.hd{display:flex;gap:10px;align-items:flex-start}.num{flex:none;width:28px;height:28px;border-radius:50%;background:#f97316;color:#fff;font-weight:800;display:grid;place-items:center;font-size:14px}'
    + '.tx{flex:1;font-weight:500}.ok{color:#16a34a;font-weight:800;font-size:20px}'
    + '.fl{list-style:none;margin:8px 0 0;padding:0 38px 0 0;font-size:14px;color:#555}.fl li::before{content:"📎 "}'
    + '.btn{display:inline-block;margin:10px 38px 0 0;background:#151515;color:#fff;border-radius:12px;padding:9px 16px;font-weight:700;cursor:pointer}'
    + '.msg{margin:6px 38px 0 0;font-size:14px}.msg.err{color:#b91c1c}.msg.go{color:#b45309}'
    + 'footer{text-align:center;color:#888;font-size:13px;margin-top:20px}</style></head><body>'
    + '<header><h1>ריינדרופ הפקות: העלאת דוגמאות</h1><p>ליד כל פריט יש כפתור העלאה. אפשר להעלות מהטלפון או מהמחשב, כמה קבצים לכל פריט, ובכמה פעמים.</p></header>'
    + '<main><ol>' + items + '</ol><footer>הקבצים נשמרים אצלנו בלבד ומשמשים רק לבניית המערכת. IT Solution</footer></main>'
    + '<script>(function(){var T=' + JSON.stringify(tok) + ';'
    + 'function kb(n){return n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB"}'
    + 'function draw(s){s.items.forEach(function(it){var li=document.querySelector(".it[data-n=\\""+it.n+"\\"]");var ul=li.querySelector(".fl");ul.innerHTML="";'
    + 'it.files.forEach(function(f){var x=document.createElement("li");x.textContent=f.name+" ("+kb(f.size)+")";ul.appendChild(x)});'
    + 'li.classList.toggle("done",it.files.length>0);li.querySelector(".ok").hidden=!it.files.length})}'
    + 'function load(){fetch("/u/"+T+"/state",{cache:"no-store"}).then(function(r){return r.json()}).then(draw).catch(function(){})}'
    + 'document.querySelectorAll(".it input").forEach(function(inp){inp.addEventListener("change",function(){var li=inp.closest(".it"),n=li.getAttribute("data-n"),m=li.querySelector(".msg"),fs=[].slice.call(inp.files),i=0;'
    + 'function next(){if(i>=fs.length){inp.value="";load();return}var f=fs[i++];m.className="msg go";m.textContent="מעלה את "+f.name+"...";'
    + 'if(f.size>26214400){m.className="msg err";m.textContent=f.name+" גדול מ 25 MB. אפשר לשלוח אותו בוואטסאפ.";return next()}'
    + 'fetch("/api/rd-upload",{method:"POST",headers:{"x-tok":T,"x-item":n,"x-name":encodeURIComponent(f.name),"Content-Type":"application/octet-stream"},body:f})'
    + '.then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(r.ok){m.className="msg";m.textContent="✓ "+f.name+" הועלה. תודה!"}'
    + 'else{m.className="msg err";m.textContent=j.error==="type"?"סוג הקובץ "+f.name+" לא נתמך. אפשר PDF, אקסל, וורד או תמונה.":j.error==="big"?f.name+" גדול מ 25 MB.":"ההעלאה של "+f.name+" לא הצליחה, נסו שוב."}next()})})'
    + '.catch(function(){m.className="msg err";m.textContent="ההעלאה של "+f.name+" לא הצליחה, בדקו חיבור ונסו שוב.";next()})}next()})});load()})();</script></body></html>';
}

/** GET /u/<tok>[/state] */
function serve(DATA, tok, sub, s) {
  if (!tokOk(DATA, tok)) { s.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return s.end('לא נמצא'); }
  const h = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (sub === 'state') { s.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, h)); return s.end(JSON.stringify(state(DATA))); }
  s.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, h)); s.end(page(tok));
}

module.exports = { ITEMS, FOLDERS, DRIVE_ROOT, toDrive, MAX_FILE, handleUpload, state, sweep, serve, safeName, page };
