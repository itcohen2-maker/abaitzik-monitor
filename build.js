'use strict';
// Generates docs/index.html: a standalone page with the data baked in, for
// GitHub Pages. No server, no database, opens in any browser.
//
// Privacy note: GitHub Pages on a free account serves from a PUBLIC repo, so
// surnames are shortened to an initial and the page asks not to be indexed.
// Itzik still recognises everyone; a search engine cannot build a profile.

const fs = require('fs');
const path = require('path');
const store = require('./lib/store');

const OUT_DIR = path.join(__dirname, 'docs');
const NET = { facebook: 'פייסבוק', instagram: 'אינסטגרם', tiktok: 'טיקטוק', youtube: 'יוטיוב' };
const CAT = {
  blessing: 'ברכה', encouragement: 'עידוד', personal: 'אישי', pain: 'שיתוף כאב',
  medical_advice: 'המלצה רפואית', offer_help: 'הצעת עזרה', donation: 'שאלת תרומות',
};

function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || 'ללא שם';
  return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join(' ');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Contacts and reports are pulled from the artifact database into data/, which
// is gitignored. Only the fields below reach docs/. Phone numbers and email
// addresses never do - Itzik asks for those by mail, one person at a time.
function loadDocs(dir) {
  const full = path.join(__dirname, 'data', dir, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const doc = JSON.parse(fs.readFileSync(path.join(full, f), 'utf8'));
      doc.id = f.replace(/\.json$/, '');
      return doc;
    });
}

// Which networks a report talks about. An explicit `network` field on the
// document wins; otherwise the title and body are scanned for the four names,
// so older reports written as free text still sort themselves.
const NET_WORDS = {
  youtube: /יוטיוב|youtube/i,
  tiktok: /טיקטוק|tiktok/i,
  facebook: /פייסבוק|facebook/i,
  instagram: /אינסטגרם|instagram/i,
};
function reportNets(r) {
  if (Array.isArray(r.network)) return r.network;
  if (typeof r.network === 'string' && r.network) return [r.network];
  const t = (r.title || '') + ' ' + (r.body || '');
  return Object.keys(NET_WORDS).filter(k => NET_WORDS[k].test(t));
}

function build() {
  const state = store.load();
  const items = Object.values(state.items).map(i => ({
    network: i.network,
    author: shortName(i.author),
    text: i.text,
    category: i.category,
    seenAt: i.seenAt,
    repliedAt: i.repliedAt,
    replyText: i.replyText,
  }));

  const replied = items.filter(i => i.repliedAt);
  const pending = items.filter(i => !i.repliedAt);
  const today = new Date().toDateString();
  const repliedToday = replied.filter(i => new Date(i.repliedAt).toDateString() === today);

  const contacts = loadDocs('contacts')
    .map(c => ({
      name: c.name,
      network: c.network,
      note: c.note,
      at: c.at,
      status: c.status,
      log: Array.isArray(c.log) ? c.log : [],
    }))
    .sort((a, b) => {
      if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
      return (a.at || '') < (b.at || '') ? 1 : -1;
    });

  const reports = loadDocs('reports')
    .map(r => ({ title: r.title, at: r.at, body: r.body, nets: reportNets(r) }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));

  const chat = loadDocs('chat')
    .map(m => ({ at: m.at, from: m.from, text: m.text, status: m.status || '' }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? -1 : 1));

  const openCmds = loadDocs('commands')
    .filter(c => !c.done && /^[0-9]/.test(c.id))
    .map(c => ({ at: c.at, text: c.text }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));
  const now = loadDocs('status').find(d => d.id === 'now') || null;

  const payload = {
    now: now ? { at: now.at, text: now.text, next: now.next } : null,
    openCmds,
    builtAt: new Date().toISOString(),
    counts: {
      pending: pending.length,
      replied: replied.length,
      today: repliedToday.length,
      leads: contacts.filter(c => c.status !== 'done').length,
    },
    pending: pending.sort((a, b) => (a.seenAt < b.seenAt ? 1 : -1)),
    replied: replied.sort((a, b) => (a.repliedAt < b.repliedAt ? 1 : -1)),
    contacts,
    reports,
    chat,
  };

  const html = PAGE
    .replace('__DATA__', JSON.stringify(payload).replace(/</g, '\\u003c'))
    .replace('__NET__', JSON.stringify(NET))
    .replace('__CAT__', JSON.stringify(CAT));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '', 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'version.json'),
    JSON.stringify({ builtAt: payload.builtAt }), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
  console.log('built docs/index.html |', items.length, 'items,',
    payload.counts.pending, 'pending,', payload.counts.replied, 'replied,',
    contacts.length, 'contacts,', reports.length, 'reports');
}

const PAGE = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta name="theme-color" content="#14675a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="המוניטור">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<title>אבא איציק בבנייה עצמית</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&family=Heebo:wght@300;400;500;700&display=swap">
<style>
:root{--blue:#4285F4;--red:#EA4335;--yellow:#FBBC05;--green:#34A853;
 --ground:#f6f8fc;--surface:#fff;--sunk:#eef2fa;--ink:#1f2430;--dim:#5f6b7f;
 --line:#e3e9f4;--accent:#1a73e8;--accent-soft:#e8f0fe;--wait:#e37400;
 --shadow:0 2px 8px rgba(30,40,70,.07)}
@media (prefers-color-scheme:dark){:root{--ground:#0f1218;--surface:#181d27;--sunk:#141922;
 --ink:#eef1f7;--dim:#9aa5b8;--line:#252c39;--accent:#8ab4f8;--accent-soft:#1b2b45;
 --wait:#fbbc05;--shadow:0 2px 10px rgba(0,0,0,.4)}}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);direction:rtl;
 font:400 16px/1.65 Heebo,system-ui,"Segoe UI",Arial,sans-serif;
 background-image:radial-gradient(120% 60% at 100% 0,var(--accent-soft) 0,transparent 60%);
 background-repeat:no-repeat}
.wrap{max-width:620px;margin:0 auto;padding:18px 16px 96px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.mark{width:42px;height:42px;flex:0 0 42px;border-radius:13px;display:grid;place-items:center;
 background:linear-gradient(145deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#000));
 color:#fff;font:700 19px/1 "Frank Ruhl Libre",Georgia,serif;box-shadow:0 6px 18px rgba(0,0,0,.18)}
h1{font:700 27px/1.2 "Frank Ruhl Libre",Georgia,serif;margin:0;text-wrap:balance}
.sub{color:var(--dim);font-size:14px;font-weight:300}
.pill{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:4px 11px;
 border-radius:999px;background:var(--accent-soft);color:var(--accent);
 font:500 12px Heebo,sans-serif}
.pill i{width:7px;height:7px;border-radius:50%;background:var(--accent);
 animation:pulse 2.4s infinite;font-style:normal}
.alerts{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;
 background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:13px 15px;box-shadow:var(--shadow)}
.alerts b{display:block;font:500 15px Heebo,sans-serif}
.alerts small{display:block;color:var(--dim);font-size:12.5px;line-height:1.5;margin-top:2px}
.abtn{flex:0 0 auto;text-decoration:none;background:var(--accent);color:#fff;border-radius:10px;
 padding:10px 16px;font:500 14px Heebo,sans-serif;white-space:nowrap}
.codebox{background:var(--surface);border:1px solid var(--line);border-radius:14px;
 padding:13px 15px;margin-top:14px;box-shadow:var(--shadow)}
.codebox b{display:block;font:500 15px Heebo,sans-serif}
.codebox small{display:block;color:var(--dim);font-size:12.5px;line-height:1.5;margin:2px 0 9px}
.coderow{display:flex;gap:8px}
#codeInput{flex:1;background:var(--sunk);color:var(--ink);border:1px solid var(--line);
 border-radius:10px;padding:9px 12px;font:400 16px Heebo,sans-serif}
#codeSave{background:var(--accent);color:#fff;border:0;border-radius:10px;padding:9px 18px;
 font:500 14px Heebo,sans-serif;cursor:pointer}
.install{font-size:12.5px;color:var(--dim);font-weight:300;line-height:1.5;margin:8px 4px 0}
@media(display-mode:standalone){.install{display:none}}
.links{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px;
 margin:20px 0 4px}
.links a{display:flex;align-items:center;gap:9px;text-decoration:none;
 background:var(--surface);border:1px solid var(--line);border-radius:12px;
 padding:11px 13px;color:var(--ink);font:500 14px Heebo,sans-serif;box-shadow:var(--shadow)}
.links a span{font-size:17px}
.links a small{display:block;color:var(--dim);font-weight:300;font-size:12px}
.whatsnew{background:var(--surface);border:1px solid var(--line);border-radius:13px;
 padding:14px 16px 8px;margin-top:18px;box-shadow:var(--shadow)}
.whatsnew h2{margin-bottom:8px}
.wn{display:flex;gap:10px;align-items:baseline;padding:7px 0;border-top:1px solid var(--line);font-size:15px}
.wn:first-of-type{border-top:0}
.wn .n{font:500 20px/1 "Frank Ruhl Libre",Georgia,serif;min-width:26px;text-align:center;color:var(--accent)}
.wn .n.hot{color:#e5484d}
.wn .n.zero{color:var(--dim)}
.wn small{color:var(--dim);font-weight:300;display:block;font-size:13px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:22px 0 26px}
.tile{position:relative;overflow:hidden;background:var(--surface);border:1px solid var(--line);
 border-radius:13px;padding:14px 15px;box-shadow:var(--shadow)}
.tile:before{content:"";position:absolute;inset-block-start:0;inset-inline:0;height:3px;
 background:var(--accent);opacity:.85}
.tile.wait:before{background:var(--wait)}
.tile .k{font-size:12px;color:var(--dim)}
.tile .v{font:500 28px/1.15 "Frank Ruhl Libre",Georgia,serif;
 font-variant-numeric:tabular-nums;margin-top:3px}
.tile.wait .v{color:var(--wait)}
h2{font:500 15px/1.3 Heebo,sans-serif;margin:0 0 11px;color:var(--dim);letter-spacing:.04em}
section{margin-bottom:30px}
.seg{display:flex;gap:4px;background:var(--sunk);border-radius:12px;padding:4px;margin-bottom:14px;
 border:1px solid var(--line)}
.seg button{flex:1;position:relative;background:transparent;color:var(--dim);border:0;border-radius:7px;
 padding:8px 4px;font:500 14px Heebo,sans-serif;cursor:pointer}
.dot{position:absolute;top:4px;inset-inline-end:6px;width:9px;height:9px;border-radius:50%;
 background:#e5484d;box-shadow:0 0 0 0 rgba(229,72,77,.7);animation:pulse 1.4s infinite}
@keyframes pulse{
 0%{box-shadow:0 0 0 0 rgba(229,72,77,.7)}
 70%{box-shadow:0 0 0 7px rgba(229,72,77,0)}
 100%{box-shadow:0 0 0 0 rgba(229,72,77,0)}}
@media(prefers-reduced-motion:reduce){.dot{animation:none}}
.seg button[aria-pressed="true"]{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
.seg button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.item{background:var(--surface);border:1px solid var(--line);border-radius:11px;
 padding:12px 14px;margin-bottom:9px;box-shadow:var(--shadow);
 border-inline-start:3px solid var(--line)}
.item.answered{border-inline-start-color:var(--accent)}
.item.pain{border-inline-start-color:var(--wait)}
.item .top{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;
 font-size:13px;color:var(--dim);margin-bottom:5px}
.item .who{color:var(--ink);font-weight:500;font-size:14px}
.chip{background:var(--sunk);border-radius:999px;padding:1px 9px;font-size:11px;color:var(--dim)}
.item .body{font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}
.item .said{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);
 font-size:14px;color:var(--accent)}
.empty{color:var(--dim);font-size:15px;font-weight:300;padding:16px 2px}
.item.lead{border-inline-start-color:var(--wait)}
.item.lead.closed{border-inline-start-color:var(--accent)}
.log{list-style:none;margin:10px 0 0;padding:0 11px 0 0;border-inline-start:1px solid var(--line)}
.log li{position:relative;padding:0 13px 9px 0;font-size:14px;overflow-wrap:anywhere}
.log li:last-child{padding-bottom:0}
.log li::before{content:"";position:absolute;inset-inline-start:-15px;top:8px;
 width:6px;height:6px;border-radius:50%;background:var(--line)}
.log li:last-child::before{background:var(--accent)}
.log .d{display:block;color:var(--dim);font-size:12px;font-weight:300;
 font-variant-numeric:tabular-nums}
.ask{display:inline-block;margin-top:10px;background:transparent;color:var(--accent);
 border:1px solid var(--line);border-radius:8px;padding:6px 14px;
 font:400 13px Heebo,sans-serif;text-decoration:none}
.ask:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.report{background:var(--surface);border:1px solid var(--line);border-radius:11px;
 margin-bottom:9px;box-shadow:var(--shadow);overflow:hidden}
.report summary{cursor:pointer;padding:12px 14px;list-style:none;
 display:flex;gap:8px;align-items:baseline}
.report summary::-webkit-details-marker{display:none}
.report summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.report summary .t{font-weight:500;font-size:15px}
.report summary .d{margin-inline-start:auto;color:var(--dim);font-size:13px;
 font-weight:300;font-variant-numeric:tabular-nums}
.report .text{padding:12px 14px 14px;font-size:15px;white-space:pre-wrap;
 overflow-wrap:anywhere;border-top:1px solid var(--line)}
.copyrow{display:flex;align-items:center;gap:11px;padding:0 14px 13px}
.copyrow button{background:transparent;color:var(--accent);border:1px solid var(--line);
 border-radius:8px;padding:6px 14px;font:400 13px Heebo,sans-serif;cursor:pointer}
.copyrow button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.copyrow .msg{font-size:13px;color:var(--accent)}
.thread{display:flex;flex-direction:column;gap:9px;margin-bottom:16px}
.bub{max-width:82%;padding:10px 13px;border-radius:14px;font-size:15px;
 white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:var(--shadow)}
.bub .w{display:block;color:var(--dim);font-size:11px;font-weight:300;
 margin-bottom:3px;font-variant-numeric:tabular-nums}
.bub.me{align-self:flex-start;background:var(--accent-soft);
 border-bottom-inline-start-radius:4px}
.bub.you{align-self:flex-end;background:var(--surface);
 border:1px solid var(--line);border-bottom-inline-end-radius:4px}
.st{font-style:normal;font-weight:500;padding:1px 7px;border-radius:999px;font-size:11.5px}
.st-received{background:var(--sunk);color:var(--dim)}
.st-working{background:#f6e7c8;color:#8a5a12}
.st-done{background:var(--accent-soft);color:var(--accent)}
.bub a{color:inherit;text-decoration:underline;word-break:break-all}
.bub.pend{opacity:.6}
.hint{font-size:13px;color:var(--dim);font-weight:300;margin-top:14px;line-height:1.6}
#msgForm,#mailForm{display:flex;flex-direction:column;gap:10px}
#mailText{width:100%;min-height:64px;resize:vertical;background:var(--surface);
 color:var(--ink);border:1px solid var(--line);border-radius:11px;padding:12px 14px;
 font:400 16px/1.6 Heebo,sans-serif;box-shadow:var(--shadow)}
#mailBtn{align-self:flex-start;background:var(--red);color:#fff;border:0;
 border-radius:10px;padding:11px 26px;font:500 15px Heebo,sans-serif;cursor:pointer}
#mailBtn[disabled]{opacity:.5;cursor:default}
#mailThread{margin-top:16px}
#msgText{width:100%;min-height:74px;resize:vertical;background:var(--surface);
 color:var(--ink);border:1px solid var(--line);border-radius:11px;padding:12px 14px;
 font:400 16px/1.6 Heebo,sans-serif;box-shadow:var(--shadow)}
#msgText::placeholder{color:var(--dim);font-weight:300}
#msgText:focus-visible,#msgBtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#msgBtn{align-self:flex-start;background:var(--accent);color:#fff;border:0;
 border-radius:10px;padding:11px 26px;font:500 15px Heebo,sans-serif;cursor:pointer}
#msgBtn[disabled]{opacity:.5;cursor:default}
.msgsaid{color:var(--accent);font-size:14px;min-height:20px;margin-top:9px}
#fileForm{display:flex;flex-direction:column;gap:10px;margin-top:22px;
 border-top:1px solid var(--line);padding-top:18px}
#fileForm h3{margin:0;font:500 15px Heebo,sans-serif;color:var(--ink)}
#fPick{font:400 14px Heebo,sans-serif;color:var(--dim)}
#fCap{background:var(--surface);color:var(--ink);border:1px solid var(--line);
 border-radius:11px;padding:11px 14px;font:400 16px Heebo,sans-serif;box-shadow:var(--shadow)}
#fBtn{align-self:flex-start;background:var(--accent);color:#fff;border:0;
 border-radius:10px;padding:11px 26px;font:500 15px Heebo,sans-serif;cursor:pointer}
#fBtn[disabled]{opacity:.5;cursor:default}
.fmeta{font-size:13px;color:var(--dim);font-weight:300;min-height:18px}
.fmeta.bad{color:#e5484d}
#recWrap{display:flex;align-items:center;gap:12px;margin-top:6px}
#recBtn{width:54px;height:54px;flex:0 0 54px;border-radius:50%;border:0;cursor:pointer;
 background:var(--accent);color:#fff;font-size:22px;line-height:1;box-shadow:var(--shadow)}
#recBtn.on{background:#e5484d;animation:pulse 1.4s infinite}
#recBtn[disabled]{opacity:.5;cursor:default}
#recSaid{font-size:14px;color:var(--dim);font-weight:300}
@media(prefers-reduced-motion:reduce){#recBtn.on{animation:none}}
.note{font-size:13px;color:var(--dim);font-weight:300;border-top:1px solid var(--line);
 padding-top:14px;margin-top:30px}
.note b{color:var(--ink);font-weight:500}

/* ===== home screen ===== */
.hd{display:flex;align-items:center;gap:11px;margin-bottom:14px}
.ava{width:46px;height:46px;flex:0 0 46px;border-radius:50%;padding:3px;
 background:conic-gradient(var(--blue),var(--red),var(--yellow),var(--green),var(--blue))}
.ava div{width:100%;height:100%;border-radius:50%;background:var(--surface);display:grid;place-items:center;
 font:700 19px "Frank Ruhl Libre",Georgia,serif;color:var(--ink)}
.hd .t{font:700 19px/1.15 Heebo,sans-serif}
.hd .s{font-size:12px;color:var(--dim);font-weight:300}
.conn{margin-inline-start:auto;font:500 11.5px Heebo,sans-serif;color:#fff;background:var(--green);
 padding:5px 13px;border-radius:999px;border:0;cursor:pointer}
.conn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

.voice{display:flex;align-items:stretch;gap:12px;margin-bottom:14px}
.mic{width:98px;height:98px;flex:0 0 98px;border-radius:50%;border:0;padding:0;cursor:pointer;position:relative;
 display:grid;place-items:center;background:conic-gradient(from 0deg,var(--blue),var(--red),var(--yellow),var(--green),var(--blue));
 box-shadow:0 12px 28px rgba(66,133,244,.35)}
.mic:before{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--surface)}
.mic svg{position:relative;z-index:1;width:42px;height:42px}
.mic.on{animation:mpulse 1.2s infinite}
.mic.on:before{background:#fdecea}
@keyframes mpulse{50%{box-shadow:0 12px 40px rgba(234,67,53,.6)}}
.mic[disabled]{opacity:.55;cursor:default}
.vtxt{flex:1;display:flex;flex-direction:column;justify-content:center}
.vtxt b{font:700 16px Heebo,sans-serif}
.vtxt small{color:var(--dim);font-size:12px;line-height:1.5;font-weight:300}
.urg{flex:0 0 66px;border:0;cursor:pointer;border-radius:20px;color:#fff;
 font:700 12.5px Heebo,sans-serif;line-height:1.25;
 background:linear-gradient(180deg,#ff6a5e,var(--red));
 box-shadow:0 10px 22px rgba(234,67,53,.38),inset 0 2px 0 rgba(255,255,255,.45)}
.urg span{font-size:19px;display:block;margin-bottom:2px}

.row{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 10px;
 scrollbar-width:none;-webkit-overflow-scrolling:touch}
.row::-webkit-scrollbar{display:none}
.ic{flex:0 0 62px;display:flex;flex-direction:column;align-items:center;gap:5px;
 font:500 10.5px Heebo,sans-serif;color:var(--dim);text-decoration:none;background:none;border:0;
 padding:0;cursor:pointer}
.ic .c{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;position:relative;
 box-shadow:0 8px 16px rgba(20,30,60,.22),inset 0 2px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.16)}
.ic .c:after{content:"";position:absolute;top:6px;left:12px;right:12px;height:15px;border-radius:50%;
 background:linear-gradient(180deg,rgba(255,255,255,.5),rgba(255,255,255,0))}
.ic svg{width:28px;height:28px;position:relative;z-index:1}
.ic:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:12px}
.c-yt{background:#ff0033}.c-tt{background:#111}.c-fb{background:#1877f2}
.c-ig{background:linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)}
.c-wa{background:#25d366}.c-gm{background:#fff;border:1px solid var(--line)}
.c-st{background:linear-gradient(160deg,#4285F4,#0b57d0)}
.c-pg{background:linear-gradient(160deg,#a78bfa,#6d28d9)}
.c-vd{background:linear-gradient(160deg,#fbbf24,#d97706)}
.c-add{background:var(--surface);border:2px dashed var(--line);box-shadow:none}
.c-add:after{display:none}

.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:2px}
.gt{border:0;text-align:start;cursor:pointer;border-radius:18px;padding:12px 13px;color:#fff;min-height:76px;
 display:flex;flex-direction:column;justify-content:space-between;font-family:Heebo,sans-serif;
 box-shadow:0 8px 18px rgba(20,30,60,.16),inset 0 2px 0 rgba(255,255,255,.3)}
.gt b{font:700 14px Heebo,sans-serif;display:block}
.gt small{font-size:10.5px;opacity:.92;font-weight:300}
.gt:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.g1{background:linear-gradient(150deg,#5aa9fb,var(--blue))}
.g2{background:linear-gradient(150deg,#ff8a80,var(--red))}
.g3{background:linear-gradient(150deg,#ffd54f,#f9a825);color:#3b2a00}
.g4{background:linear-gradient(150deg,#69f0ae,var(--green))}
.g5{background:linear-gradient(150deg,#b39ddb,#673ab7)}
.g6{background:linear-gradient(150deg,#80deea,#00838f)}

/* ===== self build slot ===== */
.slot{display:flex;gap:12px;align-items:flex-start;padding:4px 0 10px}
.slot .plus{flex:0 0 44px;height:44px;border-radius:14px;border:2px dashed var(--line);
 background:var(--sunk);color:var(--dim);font:300 26px/1 Heebo,sans-serif;display:grid;place-items:center}
.slot b{display:block;font:500 15px Heebo,sans-serif}
.slot small{display:block;color:var(--dim);font-weight:300;font-size:13px;line-height:1.55;margin-top:2px}
.slotForm{display:flex;gap:7px;align-items:center;margin-top:4px}
.slotForm input{flex:1;min-width:0;background:var(--sunk);border:1px solid var(--line);border-radius:11px;
 padding:11px 13px;color:var(--ink);font:400 15px Heebo,sans-serif}
.slotForm button{flex:0 0 auto;border:0;border-radius:11px;padding:11px 14px;cursor:pointer;
 background:var(--accent);color:#fff;font:500 14px Heebo,sans-serif}
.slotForm button.ghost{background:var(--sunk);color:var(--ink);border:1px solid var(--line);font-size:17px}
#slotSaid{color:var(--dim);font-size:13px;font-weight:300;margin-top:7px;min-height:18px}

/* ===== bottom nav ===== */
.bn{position:fixed;inset-inline:0;bottom:0;z-index:20;display:flex;justify-content:space-around;
 background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(12px);
 border-top:1px solid var(--line);padding:7px 4px calc(7px + env(safe-area-inset-bottom))}
.bn button{position:relative;background:none;border:0;cursor:pointer;color:var(--dim);
 font:500 10px Heebo,sans-serif;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 10px}
.bn button span{font-size:19px;line-height:1}
.bn button[aria-pressed="true"]{color:var(--accent)}
.bn button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:10px}

</style>
</head>
<body>
<div class="wrap">
<header class="hd">
 <div class="ava" aria-hidden="true"><div>א</div></div>
 <div>
  <div class="t">אבא איציק בבנייה עצמית</div>
  <div class="s" id="built"></div>
 </div>
 <button type="button" class="conn" id="reloadBtn" title="טעינה מחדש">רענון</button>
</header>

<section id="pH">
 <div class="voice">
  <button type="button" id="micBtn" class="mic" aria-label="דבר אליי">
   <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="var(--ink)" stroke="none"/>
    <path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M8.5 21h7"/>
   </svg>
  </button>
  <div class="vtxt">
   <b>דבר אליי</b>
   <small id="micSaid">לוחצים, מדברים, לוחצים שוב. ההקלטה נשלחת אליי מיד.</small>
  </div>
  <button type="button" id="urgBtn" class="urg"><span aria-hidden="true">🚨</span>דחוף</button>
 </div>

 <section class="whatsnew" aria-label="מה חדש">
  <div class="wn" id="wnChat"></div>
  <div class="wn" id="wnCmds"></div>
  <div class="wn" id="wnNow"></div>
 </section>

 <div class="row" role="group" aria-label="קיצורים">
  <a class="ic" data-net="youtube" href="https://studio.youtube.com/" target="_blank" rel="noopener"><span class="c c-yt">
   <svg viewBox="0 0 24 24"><path fill="#fff" d="M10 8.5v7l6-3.5z"/></svg></span>יוטיוב</a>
  <a class="ic" data-net="tiktok" href="https://www.tiktok.com/@abaitzik" target="_blank" rel="noopener"><span class="c c-tt">
   <svg viewBox="0 0 24 24"><path fill="#fff" d="M13 3h3a4 4 0 0 0 4 4v3a7 7 0 0 1-4-1.3V15a5.5 5.5 0 1 1-5.5-5.5c.3 0 .6 0 .9.1v3.1a2.5 2.5 0 1 0 1.6 2.3z"/></svg></span>טיקטוק</a>
  <a class="ic" data-net="facebook" href="https://www.facebook.com/lolos.lolo.90" target="_blank" rel="noopener"><span class="c c-fb">
   <svg viewBox="0 0 24 24"><path fill="#fff" d="M13.5 21v-7h2.4l.4-3h-2.8V9.2c0-.9.3-1.5 1.5-1.5h1.5V5.1c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8V11H8v3h2.6v7z"/></svg></span>פייסבוק</a>
  <a class="ic" data-net="instagram" href="https://www.instagram.com/abaitzik/" target="_blank" rel="noopener"><span class="c c-ig">
   <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r="1" fill="#fff" stroke="none"/></svg></span>אינסטגרם</a>
  <a class="ic" href="https://web.whatsapp.com" target="_blank" rel="noopener"><span class="c c-wa">
   <svg viewBox="0 0 24 24"><path fill="#fff" d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3zm0 2a7 7 0 1 1-3.6 13l-.3-.2-2.4.6.7-2.3-.2-.3A7 7 0 0 1 12 5zm-2.6 3.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.3s1 2.7 1.2 2.9c.1.2 2 3.1 4.9 4.2 2.4.9 2.9.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4l-.5-.3-1.9-.9c-.3-.1-.4-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.5-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5z"/></svg></span>וואטסאפ</a>
  <button type="button" class="ic" id="icMail"><span class="c c-gm">
   <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M4 7v11h3V9.8z"/><path fill="#34A853" d="M20 7v11h-3V9.8z"/><path fill="#EA4335" d="M4 7l8 6 8-6v-1.5L12 11 4 5.5z"/><path fill="#FBBC05" d="M4 5.5L12 11l8-5.5V5H4z"/></svg></span>מייל</button>
  <a class="ic" href="https://itzik-site.vercel.app/" target="_blank" rel="noopener"><span class="c c-st">
   <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/></svg></span>האתר</a>
  <button type="button" class="ic" id="icLand"><span class="c c-vd">
   <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5"/></svg></span>דפי נחיתה</button>
  <a class="ic" href="https://pegasusgame.vercel.app" target="_blank" rel="noopener"><span class="c c-pg">
   <svg viewBox="0 0 24 24"><path fill="#fff" d="M4 14c2-5 6-8 11-8l5-2-2 5c0 5-3 9-8 11l-1-3-3-1z"/><circle cx="14" cy="10" r="1.3" fill="#6d28d9"/></svg></span>פגסוס</a>
  <button type="button" class="ic" id="icAdd"><span class="c c-add">
   <svg viewBox="0 0 24 24" fill="none" stroke="var(--dim)" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>חדש</button>
 </div>

 <section class="whatsnew" aria-label="בנייה עצמית">
  <h2>המוניטור בונה את עצמו</h2>
  <div class="slot">
   <div class="plus" aria-hidden="true">+</div>
   <div>
    <b>איזו אפליקציה תרצה שאוסיף כאן?</b>
    <small>המקום הזה שמור. תכתוב או תקליט מה חסר לך, זה מגיע אליי, ואני מוסיף בסבב הקרוב. לא רק אפליקציות, כל דבר שתרצה שיהיה במסך הזה.</small>
   </div>
  </div>
  <form id="slotForm" class="slotForm">
   <input id="slotText" type="text" placeholder="מה להוסיף לי למוניטור?" autocomplete="off">
   <button type="button" class="ghost" id="slotMic" aria-label="להקליט במקום לכתוב">🎤</button>
   <button type="submit">שלח</button>
  </form>
  <div id="slotSaid"></div>
 </section>

 <div class="grid">
  <button type="button" class="gt g1" id="gChat"><b>💬 פנייה אליי</b><small>צ׳אט, קול, קובץ</small></button>
  <button type="button" class="gt g2" id="gMail"><b>📧 מייל</b><small>בקשה, ואני מחזיר תשובה</small></button>
  <button type="button" class="gt g3" id="gQueue"><b>📊 ניטור רשתות</b><small>מי פנה, מה נענה</small></button>
  <button type="button" class="gt g4" id="gReports"><b>📄 דוחות</b><small>סיכומי הסבבים</small></button>
  <button type="button" class="gt g5" id="gPill"><b>⏰ לקחתי כדור</b><small>מסמן את המנה ומעדכן אותי</small></button>
  <button type="button" class="gt g6" id="gAsk"><b>❓ שאלה מהירה</b><small>כל דבר, אני עונה בצ׳אט</small></button>
 </div>

<div class="tiles">
 <div class="tile wait"><div class="k">ממתין לתשובה</div><div class="v" id="tP">0</div></div>
 <div class="tile"><div class="k">נענה היום</div><div class="v" id="tT">0</div></div>
 <div class="tile wait"><div class="k">אנשי קשר פתוחים</div><div class="v" id="tL">0</div></div>
</div>

<div class="alerts" id="alerts">
 <div>
  <b>התראות לנייד</b>
  <small>מתקינים את האפליקציה ntfy, לוחצים על הכפתור, ובוחרים Subscribe. מאז כל תשובה שלי קופצת כמו וואטסאפ.</small>
 </div>
 <a class="abtn" id="ntfyBtn" href="https://ntfy.sh/abaitzik-cf9044bdcfa8" target="_blank" rel="noopener">הפעלת התראות</a>
</div>
<div class="codebox" id="codeBox" hidden>
 <b>קוד אישי</b>
 <small>מקלידים פעם אחת בנייד שלך והוא נשמר במכשיר. כל הודעה שתשלח תישא אותו, וכל פנייה בלעדיו אני מתעלם ממנה ומדווח לך. הקוד לא נמצא בקוד של הדף.</small>
 <div class="coderow">
  <input type="text" id="codeInput" inputmode="numeric" autocomplete="off" placeholder="קוד קצר, למשל 4 ספרות">
  <button type="button" id="codeSave">שמירה</button>
 </div>
 <div class="msgsaid" id="codeSaid"></div>
</div>
<div class="install" id="installHint">להתקנה כאפליקציה על מסך הבית: בספארי לוחצים שיתוף ואז "הוספה למסך הבית". באנדרואיד: תפריט ואז "התקנת אפליקציה".</div>

<nav class="links" aria-label="קישורים מהירים">
 <a href="plan.html">
  <span aria-hidden="true">&#128736;</span>
  <div>תכנון 2.0<small>המסך החדש, לאישורך</small></div>
 </a>
</nav>
</section>

<section id="pQ" hidden>
 <div class="seg" role="group" aria-label="סינון">
  <button type="button" id="bP" aria-pressed="true">ממתין</button>
  <button type="button" id="bD" aria-pressed="false">נענה</button>
 </div>
 <div id="list"></div>
</section>

<section id="pL" hidden>
 <h2>מי יצר קשר ורוצה המשך</h2>
 <div id="leads"></div>
</section>

<section id="pN" hidden>
 <h2>ניטור לפי רשת</h2>
 <div class="seg" id="netSeg" role="group" aria-label="בחירת רשת">
  <button type="button" data-net="all" aria-pressed="true">הכל</button>
  <button type="button" data-net="youtube" aria-pressed="false">יוטיוב</button>
  <button type="button" data-net="tiktok" aria-pressed="false">טיקטוק</button>
  <button type="button" data-net="facebook" aria-pressed="false">פייסבוק</button>
  <button type="button" data-net="instagram" aria-pressed="false">אינסטגרם</button>
 </div>
 <div id="netBody"></div>
</section>

<section id="pG" hidden>
 <h2>דפי נחיתה</h2>
 <div id="landList"></div>
</section>

<section id="pR" hidden>
 <h2>דוחות הסבבים</h2>
 <div id="reports"></div>
</section>

<section id="pE" hidden>
 <h2>מייל</h2>
 <div class="hint" style="margin-bottom:12px">
  כותבים כאן בקשה בשפה חופשית, ואני מחפש בתיבה ומחזיר את התשובה לכאן.
  לדוגמה: הגיע משהו מבית חולים? תמצא את המייל מהעירייה מהשנה שעברה. מי שלח לי קובץ בשבוע האחרון?
 </div>
 <form id="mailForm">
  <textarea id="mailText" rows="2" placeholder="מה לחפש לך בתיבה?"></textarea>
  <button type="submit" id="mailBtn">שליחת הבקשה</button>
 </form>
 <div class="msgsaid" id="mailSaid"></div>
 <div class="thread" id="mailThread"></div>
</section>

<section id="pM" hidden>
 <div class="thread" id="thread"></div>
 <form id="msgForm">
  <textarea id="msgText" rows="2"
   placeholder="כתוב כאן. תשובה, בקשה, או מישהו חדש שפנה אליך"></textarea>
  <button type="submit" id="msgBtn">שליחה</button>
 </form>
 <div class="msgsaid" id="msgSaid"></div>

 <form id="fileForm" method="POST" enctype="multipart/form-data">
  <h3>שליחת קובץ</h3>
  <input type="hidden" name="_captcha" value="false">
  <input type="hidden" name="_subject" value="קובץ מהמוניטור">
  <input type="hidden" name="_next" id="fNext" value="">
  <input type="hidden" name="הודעה" id="fNote" value="">
  <input type="hidden" name="קוד" id="fCode" value="">
  <div class="seg" role="group" aria-label="איכות">
   <button type="button" id="qF" aria-pressed="true">מתוך קובץ</button>
   <button type="button" id="qN" aria-pressed="false">רגיל</button>
  </div>
  <input type="file" id="fPick" name="attachment"
   accept="image/*,video/*,audio/*,application/pdf">
  <input type="text" id="fCap" placeholder="מה זה? לא חובה">
  <div class="fmeta" id="fMeta">מתוך קובץ שולח את המקור בלי לגעת בו. רגיל מכווץ תמונות.</div>
  <button type="submit" id="fBtn">שליחת הקובץ</button>
  <div id="recWrap">
   <button type="button" id="recBtn" aria-label="הקלטת הודעה קולית">&#127908;</button>
   <span id="recSaid">לחיצה מתחילה הקלטה. לחיצה שנייה עוצרת ושולחת.</span>
  </div>
 </form>
 <div class="msgsaid" id="fSaid"></div>

 <div class="hint">
  מה שאתה כותב מגיע למייל שלי ואני קורא אותו בסבב הקרוב.
  התשובות שלי מופיעות כאן למעלה.
 </div>
</section>

<nav class="bn" aria-label="מסכים">
 <button type="button" id="nH" aria-pressed="true"><span aria-hidden="true">🏠</span>בית</button>
 <button type="button" id="nM" aria-pressed="false"><span aria-hidden="true">💬</span>צ׳אט<i class="dot" id="mDot" hidden></i></button>
 <button type="button" id="nQ" aria-pressed="false"><span aria-hidden="true">📈</span>רשתות</button>
 <button type="button" id="nL" aria-pressed="false"><span aria-hidden="true">👥</span>אנשי קשר</button>
 <button type="button" id="nR" aria-pressed="false"><span aria-hidden="true">📄</span>דוחות</button>
</nav>

<div class="note">
 <b>הכלל האדום.</b> לא פונים למי שלא פנה. כל שורה כאן היא מישהו שהגיב,
 ענה לסטורי או שלח הודעה. שעות שקט בין 23:00 ל־07:00.
 <br><br>
 שמות משפחה של מגיבים מקוצרים לאות אחת, ו<b>טלפונים ומיילים לא נמצאים בדף הזה בכלל</b>,
 כי הוא פתוח לכל מי שיש לו הקישור. פרטי התקשרות מגיעים במייל.
 <span id="built"></span>
</div>
</div>

<script>
var D = __DATA__, NET = __NET__, CAT = __CAT__, tab = 'pending';
// Split so a scraper crawling the page source does not lift a plain address.
// This is obfuscation, not security - anyone reading the code can reassemble it.
var MAILBOX = ['itcohen2','gmail.com'].join('@');
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
 return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function ago(iso){if(!iso)return'';var d=Date.parse(iso);if(isNaN(d))return'';
 var s=(Date.now()-d)/1000;if(s<90)return'עכשיו';if(s<3600)return Math.round(s/60)+' דקות';
 if(s<86400)return Math.round(s/3600)+' שעות';return Math.round(s/86400)+' ימים';}
function row(i){
 var cls='item'+(i.repliedAt?' answered':(i.category==='pain'?' pain':''));
 return '<div class="'+cls+'"><div class="top"><span class="who">'+esc(i.author)+'</span>'
  +'<span class="chip">'+esc(NET[i.network]||i.network)+'</span>'
  +(i.category?'<span class="chip">'+esc(CAT[i.category]||i.category)+'</span>':'')
  +'<span>'+ago(i.repliedAt||i.seenAt)+'</span></div>'
  +'<div class="body">'+esc(i.text)+'</div>'
  +(i.replyText?'<div class="said">'+esc(i.replyText)+'</div>':'')+'</div>';
}
function stamp(iso){var d=new Date(iso);if(isNaN(d.getTime()))return'';
 function p(n){return (n<10?'0':'')+n;}
 return p(d.getDate())+'.'+p(d.getMonth()+1)+' '+p(d.getHours())+':'+p(d.getMinutes());}
function logHtml(log){
 if(!log||!log.length)return'';
 return '<ol class="log">'+log.slice().sort(function(a,b){
   return (a.at||'')<(b.at||'')?-1:1;
 }).map(function(e){
   return '<li><span class="d">'+esc(stamp(e.at))+'</span>'+esc(e.text)+'</li>';
 }).join('')+'</ol>';
}
function leadRow(c){
 var closed=c.status==='done';
 var subject='פרטים: '+(c.name||'');
 var body='שלח לי את פרטי ההתקשרות ואת מה שסוכם.';
 return '<div class="item lead'+(closed?' closed':'')+'">'
  +'<div class="top"><span class="who">'+esc(c.name||'ללא שם')+'</span>'
  +'<span class="chip">'+esc(NET[c.network]||c.network||'אחר')+'</span>'
  +'<span class="chip">'+(closed?'טופל':'ממתין')+'</span>'
  +'<span>'+ago(c.at)+'</span></div>'
  +(c.note?'<div class="body">'+esc(c.note)+'</div>':'')
  +logHtml(c.log)
  +'<a class="ask" href="mailto:?subject='+encodeURIComponent(subject)
  +'&body='+encodeURIComponent(body)+'">בקשת פרטי התקשרות</a>'
  +'</div>';
}
function reportRow(r,n){
 return '<details class="report"'+(n===0?' open':'')+'>'
  +'<summary><span class="t">'+esc(r.title||'דוח')+'</span>'
  +'<span class="d">'+esc(stamp(r.at))+'</span></summary>'
  +'<div class="text">'+esc(r.body)+'</div>'
  +'<div class="copyrow"><button type="button" data-copy="'+n+'">העתקת הדוח</button>'
  +'<span class="msg" data-copied="'+n+'"></span></div>'
  +'</details>';
}
function render(){
 document.getElementById('tP').textContent=D.counts.pending;
 document.getElementById('tT').textContent=D.counts.today;
 document.getElementById('tL').textContent=D.counts.leads||0;
 document.getElementById('bP').setAttribute('aria-pressed',tab==='pending');
 document.getElementById('bD').setAttribute('aria-pressed',tab==='done');
 var rows=tab==='pending'?D.pending:D.replied;
 document.getElementById('list').innerHTML=rows.length?rows.map(row).join('')
  :'<div class="empty">'+(tab==='pending'?'התור ריק. כל מי שפנה קיבל תשובה.':'עוד לא נשלחו תשובות.')+'</div>';
 var C=D.contacts||[];
 document.getElementById('leads').innerHTML=C.length?C.map(leadRow).join('')
  :'<div class="empty">אף אחד ברשימה עדיין.</div>';
 var R=D.reports||[];
 document.getElementById('reports').innerHTML=R.length?R.map(reportRow).join('')
  :'<div class="empty">עוד לא נכתב דוח.</div>';
 document.getElementById('built').textContent='גרסה '+stamp(D.builtAt)+' · עודכן לפני '+ago(D.builtAt);
}
function pending(){
 try{return JSON.parse(localStorage.getItem('pendingMsgs')||'[]');}catch(e){return[];}
}
function savePending(a){
 try{localStorage.setItem('pendingMsgs',JSON.stringify(a));}catch(e){}
}
function linkify(t){
 var parts=String(t==null?'':t).split(new RegExp('(https?://[^ <>]+)','g'));
 return parts.map(function(x,i){
  if(i%2){return '<a href="'+esc(x)+'" target="_blank" rel="noopener">'+esc(x)+'</a>';}
  return esc(x);
 }).join('');
}
var STATUS={received:'התקבל',working:'בעבודה',done:'בוצע'};
function statusTag(m){
 if(m.from!=='itzik'||!m.status||!STATUS[m.status])return '';
 return ' · <em class="st st-'+m.status+'">'+STATUS[m.status]+'</em>';
}
function renderThread(){
 var baked=(D.chat||[]).filter(function(m){return !isMail(m);});
 var sent=baked.filter(function(m){return m.from==='itzik';})
   .map(function(m){return String(m.text).trim();});
 var still=pending().filter(function(p){return sent.indexOf(p.text.trim())===-1&&!isMail(p);});
 savePending(still);
 var all=baked.map(function(m){return{at:m.at,from:m.from,text:m.text,status:m.status,pend:false};})
   .concat(still.map(function(p){return{at:p.at,from:'itzik',text:p.text,pend:true};}))
   .sort(function(a,b){return (a.at||'')<(b.at||'')?-1:1;});
 var host=document.getElementById('thread');
 if(!all.length){
  host.innerHTML='<div class="empty">עוד לא דיברנו כאן. תכתוב משהו למטה.</div>';
  return;
 }
 host.innerHTML=all.map(function(m){
  var mine=m.from==='itzik';
  return '<div class="bub '+(mine?'you':'me')+(m.pend?' pend':'')+'">'
   +'<span class="w">'+(mine?'אתה':'קלוד')+' · '+esc(stamp(m.at))
   +(m.pend?' · נשלח, עוד לא נקרא':'')+statusTag(m)+'</span>'+linkify(m.text)+'</div>';
 }).join('');
}
function newestClaude(){
 var c=(D.chat||[]).filter(function(m){return m.from==='claude';});
 return c.length?c[c.length-1].at||'':'';
}
function chatSeen(){
 try{return localStorage.getItem('chatSeen')||'';}catch(e){return'';}
}
function markChatSeen(){
 try{localStorage.setItem('chatSeen',newestClaude());}catch(e){}
 var d=document.getElementById('mDot');if(d)d.hidden=true;
}
function renderNew(){
 var c=(D.chat||[]).filter(function(m){return m.from==='claude'&&(m.at||'')>chatSeen();}).length;
 var el=document.getElementById('wnChat');
 el.innerHTML='<span class="n '+(c?'hot':'zero')+'">'+c+'</span><div>'+(c?'תשובות שעוד לא קראת':'אין תשובות שלא קראת')+'<small>לחיצה על צ׳אט פותחת אותן</small></div>';
 var K=D.openCmds||[];
 document.getElementById('wnCmds').innerHTML='<span class="n '+(K.length?'':'zero')+'">'+K.length+'</span><div>'+(K.length?'משימות פתוחות ממך':'אין משימות פתוחות')+(K.length?'<small>'+esc(K[0].text).slice(0,90)+'</small>':'')+'</div>';
 var N=D.now;
 document.getElementById('wnNow').innerHTML='<span class="n">·</span><div>'+(N?esc(N.text):'שקט כרגע')+(N&&N.next?'<small>הבא בתור: '+esc(N.next)+'</small>':'')+(N?'<small>'+esc(stamp(N.at))+'</small>':'')+'</div>';
}
function updateDot(){
 renderNew();
 var d=document.getElementById('mDot');if(!d)return;
 var n=newestClaude();
 d.hidden=!(n&&n>chatSeen());
 document.title=(d.hidden?'':'(1) ')+'אבא איציק בבנייה עצמית';
}
var PANES={h:'pH',q:'pQ',l:'pL',r:'pR',m:'pM',e:'pE',n:'pN',g:'pG'};
// More landing pages are coming, so each one is a line here.
var LANDING=[
 {name:'שיטת הפירה',note:'מילת המפתח: גזר',url:'https://itzik-site.vercel.app/gezer'}
];
var NAVS={h:'nH',q:'nQ',l:'nL',r:'nR',m:'nM'};

// Per network monitoring. Tapping a network circle opens its own screen:
// what is waiting there, and only the report lines about that network.
var APPS={youtube:{t:'יוטיוב סטודיו',u:'https://studio.youtube.com/'},
 tiktok:{t:'טיקטוק סטודיו',u:'https://www.tiktok.com/tiktokstudio/comment'},
 facebook:{t:'מנהל התגובות',u:'https://www.facebook.com/professional_dashboard/engagement/comments_manager/'},
 instagram:{t:'אינסטגרם',u:'https://www.instagram.com/abaitzik/'}};
var HOT={personal:1,pain:1,offer_help:1,donation:1,medical_advice:1};
var curNet='all';
function netLines(body,k){
 var re=NETRE[k];if(!re)return body;
 var keep=String(body||'').split(String.fromCharCode(10)).filter(function(l){return re.test(l);});
 return keep.join(String.fromCharCode(10));
}
var NETRE={youtube:/יוטיוב|youtube/i,tiktok:/טיקטוק|tiktok/i,
 facebook:/פייסבוק|facebook/i,instagram:/אינסטגרם|instagram/i};
function renderNet(){
 var seg=document.getElementById('netSeg');
 var bs=seg.querySelectorAll('button');
 for(var i=0;i<bs.length;i++){bs[i].setAttribute('aria-pressed',bs[i].getAttribute('data-net')===curNet);}
 var all=curNet==='all';
 var pend=(D.pending||[]).filter(function(x){return all||x.network===curNet;});
 var done=(D.replied||[]).filter(function(x){return all||x.network===curNet;});
 var hot=pend.filter(function(x){return HOT[x.category];});
 var out='';
 var app=APPS[curNet];
 out+='<div class="alerts"><div><b>'+(all?'כל הרשתות':esc(NET[curNet]))+'</b>'
  +'<small>'+pend.length+' ממתינים, '+hot.length+' מהם דחופים, '+done.length+' נענו.</small></div>'
  +(app?'<a class="abtn" href="'+app.u+'" target="_blank" rel="noopener">'+app.t+'</a>':'')+'</div>';
 out+='<h2 style="margin-top:22px">מה דחוף</h2>';
 out+=hot.length?hot.map(row).join(''):'<div class="empty">אין כרגע משהו דחוף כאן.</div>';
 var R=(D.reports||[]).filter(function(r){return all||(r.nets||[]).indexOf(curNet)>-1;});
 out+='<h2 style="margin-top:26px">מה נכתב בדוחות</h2>';
 if(!R.length){out+='<div class="empty">עוד לא נכתב דוח על הרשת הזאת.</div>';}
 else{out+=R.map(function(r,n){
  var body=all?r.body:netLines(r.body,curNet);
  if(!String(body||'').trim())body=r.body;
  return '<details class="report"'+(n===0?' open':'')+'>'
   +'<summary><span class="t">'+esc(r.title||'דוח')+'</span>'
   +'<span class="d">'+esc(stamp(r.at))+'</span></summary>'
   +'<div class="text">'+esc(body)+'</div></details>';
  }).join('');}
 document.getElementById('netBody').innerHTML=out;
}
function openNet(k){curNet=k||'all';pane('n');renderNet();}
document.getElementById('netSeg').addEventListener('click',function(e){
 var b=e.target.closest?e.target.closest('[data-net]'):null;
 if(!b)return;curNet=b.getAttribute('data-net');renderNet();
});
(function(){
 var ics=document.querySelectorAll('.ic[data-net]');
 for(var i=0;i<ics.length;i++){
  ics[i].addEventListener('click',function(ev){ev.preventDefault();openNet(this.getAttribute('data-net'));});
 }
})();

// The open slot. Whatever Itzik types or says here lands in the same chat
// channel as everything else, so the monitor grows from his own requests.
function wireSlot(){
 var f=document.getElementById('slotForm');
 if(!f)return;
 f.addEventListener('submit',function(e){
  e.preventDefault();
  var box=document.getElementById('slotText');
  var v=box.value.trim();
  if(!v)return;
  var m=document.getElementById('msgText');
  m.value='בנייה עצמית: '+v;
  document.getElementById('msgForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  box.value='';
  document.getElementById('slotSaid').textContent='נשלח. אני מוסיף את זה ומעדכן אותך במייל.';
 });
 document.getElementById('slotMic').onclick=function(){
  pane('m');markChatSeen();
  var mb=document.getElementById('micBtn');if(mb)mb.click();
 };
}


// The page is one HTML file, so a phone that cached it keeps showing an old
// screen. version.json is fetched with no-store on every open; when it names
// a newer build than the one baked in here, the page reloads itself once.
function checkFresh(){
 if(!window.fetch)return;
 fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){
  return r.ok?r.json():null;
 }).then(function(v){
  if(!v||!v.builtAt||v.builtAt===D.builtAt)return;
  var seen='';
  try{seen=sessionStorage.getItem('reloadedFor')||'';}catch(e){}
  if(seen===v.builtAt)return;
  try{sessionStorage.setItem('reloadedFor',v.builtAt);}catch(e){}
  location.replace(location.pathname+'?b='+encodeURIComponent(v.builtAt));
 }).catch(function(){});
}
checkFresh();
setInterval(checkFresh,120000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)checkFresh();});

function pane(w){
 for(var k in PANES){document.getElementById(PANES[k]).hidden=(k!==w);}
 for(var n in NAVS){document.getElementById(NAVS[n]).setAttribute('aria-pressed',n===w);}
 window.scrollTo(0,0);
}
document.getElementById('reloadBtn').onclick=function(){
 location.replace(location.pathname+'?v='+Date.now());
};
document.getElementById('nH').onclick=function(){pane('h');};
document.getElementById('nQ').onclick=function(){pane('q');};
document.getElementById('nL').onclick=function(){pane('l');};
document.getElementById('nR').onclick=function(){pane('r');};
document.getElementById('nM').onclick=function(){pane('m');markChatSeen();};

// Home shortcuts. The mail and "new module" circles have no screen of their
// own yet, so they open the chat with the request already started.
function myCode(){
 try{return localStorage.getItem('monitorCode')||'';}catch(e){return '';}
}
function showCodeBox(){
 var box=document.getElementById('codeBox');
 box.hidden=false;
 var c=myCode();
 document.getElementById('codeSaid').textContent=c?('הקוד שמור במכשיר הזה: '+c):'עוד לא נקבע קוד במכשיר הזה.';
 if(c)document.getElementById('codeInput').value=c;
}
document.getElementById('codeSave').onclick=function(){
 var v=document.getElementById('codeInput').value.trim();
 var said=document.getElementById('codeSaid');
 if(!v){said.textContent='תקליד קוד קודם.';return;}
 try{localStorage.setItem('monitorCode',v);said.textContent='נשמר. מעכשיו כל הודעה מהמכשיר הזה נושאת אותו.';}
 catch(e){said.textContent='הדפדפן לא נתן לשמור. נסה בלי גלישה פרטית.';}
};
showCodeBox();

function askInChat(prefix){
 pane('m');markChatSeen();
 var box=document.getElementById('msgText');
 box.value=prefix;box.focus();
 try{box.setSelectionRange(box.value.length,box.value.length);}catch(e){}
}
document.getElementById('gChat').onclick=function(){pane('m');markChatSeen();};
document.getElementById('gQueue').onclick=function(){openNet('all');};
document.getElementById('gReports').onclick=function(){pane('r');};
document.getElementById('gMail').onclick=function(){pane('e');};
document.getElementById('gPill').onclick=function(){askInChat('לקחתי כדור עכשיו. ');};
document.getElementById('gAsk').onclick=function(){askInChat('');};
wireSlot();
document.getElementById('icMail').onclick=function(){pane('e');};
document.getElementById('icAdd').onclick=function(){askInChat('מודול חדש שאני רוצה: ');};
document.getElementById('icLand').onclick=function(){pane('g');};
document.getElementById('landList').innerHTML=LANDING.map(function(l){
 return '<div class="item"><div class="top"><span class="who">'+esc(l.name)+'</span>'
  +'<span class="chip">'+esc(l.note)+'</span></div>'
  +'<a class="ask" href="'+esc(l.url)+'" target="_blank" rel="noopener">פתיחת הדף</a></div>';
}).join('')+'<div class="empty">דף נחיתה חדש נכנס לכאן. תשלח לי בצ׳אט את הכתובת ואת מילת המפתח שמפעילה אותו.</div>';
document.getElementById('urgBtn').onclick=function(){askInChat('דחוף: ');};
document.getElementById('bP').onclick=function(){tab='pending';render();};
document.getElementById('bD').onclick=function(){tab='done';render();};

document.getElementById('reports').addEventListener('click',function(e){
 var b=e.target.closest?e.target.closest('[data-copy]'):null;
 if(!b)return;
 var r=(D.reports||[])[Number(b.getAttribute('data-copy'))];
 if(!r)return;
 var said=document.querySelector('[data-copied="'+b.getAttribute('data-copy')+'"]');
 var text=(r.title||'דוח')+'\\n\\n'+(r.body||'');
 function ok(){if(said)said.textContent='הועתק.';}
 function bad(){if(said)said.textContent='ההעתקה לא עברה. סמן ידנית.';}
 if(navigator.clipboard&&navigator.clipboard.writeText){
  navigator.clipboard.writeText(text).then(ok,bad);return;
 }
 var ta=document.createElement('textarea');
 ta.value=text;ta.setAttribute('readonly','');
 ta.style.position='fixed';ta.style.opacity='0';
 document.body.appendChild(ta);ta.select();
 try{document.execCommand('copy')?ok():bad();}catch(err){bad();}
 document.body.removeChild(ta);
});

document.getElementById('msgForm').addEventListener('submit',function(e){
 e.preventDefault();
 var box=document.getElementById('msgText');
 var btn=document.getElementById('msgBtn');
 var said=document.getElementById('msgSaid');
 var text=box.value.trim();
 if(!text)return;
 btn.disabled=true;
 said.textContent='שולח.';
 fetch('https://formsubmit.co/ajax/'+MAILBOX,{
  method:'POST',
  headers:{'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({_subject:'הודעה מהמוניטור',_template:'table',הודעה:text,קוד:myCode()})
 }).then(function(r){
  if(!r.ok)throw new Error('bad');
  var p=pending();
  p.push({at:new Date().toISOString(),text:text});
  savePending(p);
  box.value='';
  said.textContent='נשלח.';
  renderThread();
 }).catch(function(){
  said.textContent='השליחה לא עברה. נסה שוב, או שלח מייל רגיל.';
 }).then(function(){btn.disabled=false;});
});

var QMAX=10*1024*1024;
var qMode='full';
var fPick=document.getElementById('fPick');
var fForm=document.getElementById('fileForm');
var fMeta=document.getElementById('fMeta');
var fSaid=document.getElementById('fSaid');
var fBtn=document.getElementById('fBtn');
function mb(n){return (n/1048576).toFixed(1)+'MB';}
function isImg(f){return !!f&&String(f.type).indexOf('image/')===0;}
function describe(){
 var f=fPick.files&&fPick.files[0];
 if(!f){fMeta.className='fmeta';
  fMeta.textContent='מתוך קובץ שולח את המקור בלי לגעת בו. רגיל מכווץ תמונות.';return;}
 var big=f.size>QMAX;
 var t=f.name+' · '+mb(f.size);
 if(qMode==='normal'&&isImg(f))t+=' · יכווץ לפני השליחה';
 else if(qMode==='normal')t+=' · וידאו וקול נשלחים כמו שהם, אין כיווץ בדפדפן';
 else t+=' · נשלח במקור';
 if(big&&!(qMode==='normal'&&isImg(f)))t+=' · גדול מדי, המגבלה 10MB';
 fMeta.className='fmeta'+((big&&!(qMode==='normal'&&isImg(f)))?' bad':'');
 fMeta.textContent=t;
}
function setQ(m){
 qMode=m;
 document.getElementById('qF').setAttribute('aria-pressed',m==='full');
 document.getElementById('qN').setAttribute('aria-pressed',m==='normal');
 describe();
}
document.getElementById('qF').onclick=function(){setQ('full');};
document.getElementById('qN').onclick=function(){setQ('normal');};
fPick.addEventListener('change',describe);
function putFile(file){
 try{var dt=new DataTransfer();dt.items.add(file);fPick.files=dt.files;return true;}
 catch(e){return false;}
}
function reallySend(file){
 if(file.size>QMAX){
  fSaid.textContent='הקובץ '+mb(file.size)+' והמגבלה היא 10MB. תשלח קטע קצר יותר, או תעלה לדרייב ותכתוב לי כאן את השם.';
  fBtn.disabled=false;return;
 }
 if(!putFile(file)){fSaid.textContent='הדפדפן לא נתן להחליף את הקובץ. תבחר מתוך קובץ ותשלח שוב.';fBtn.disabled=false;return;}
 document.getElementById('fNext').value=location.href.split('#')[0]+'#sent';
 var cap=document.getElementById('fCap').value.trim();
 var voice=/^voice-/.test(file.name);
 document.getElementById('fNote').value=cap||(voice?'הודעה קולית מהמוניטור':'קובץ מהמוניטור');
 document.getElementById('fCode').value=myCode();
 fForm.action='https://formsubmit.co/'+MAILBOX;
 fSaid.textContent='שולח.';
 fForm.submit();
}
function shrink(file,done){
 var url=URL.createObjectURL(file);var im=new Image();
 im.onload=function(){
  var max=1600,w=im.width,h=im.height;
  var r=Math.min(1,max/Math.max(w,h));
  var c=document.createElement('canvas');
  c.width=Math.round(w*r);c.height=Math.round(h*r);
  c.getContext('2d').drawImage(im,0,0,c.width,c.height);
  c.toBlob(function(b){
   URL.revokeObjectURL(url);
   if(!b){done(file);return;}
   var dot=file.name.lastIndexOf('.');var base=dot>0?file.name.slice(0,dot):file.name;var n=base+'.jpg';
   done(new File([b],n,{type:'image/jpeg'}));
  },'image/jpeg',0.75);
 };
 im.onerror=function(){URL.revokeObjectURL(url);done(file);};
 im.src=url;
}
fForm.addEventListener('submit',function(e){
 e.preventDefault();
 var f=fPick.files&&fPick.files[0];
 if(!f){fSaid.textContent='קודם תבחר קובץ.';return;}
 fBtn.disabled=true;fSaid.textContent='מכין.';
 if(qMode==='normal'&&isImg(f))shrink(f,reallySend);
 else reallySend(f);
});
if(location.hash==='#chat'){pane('m');markChatSeen();}
if(location.hash==='#sent'){
 fSaid.textContent='הקובץ נשלח. הוא מחכה לי במייל.';
 pane('m');
}
var rec=null,recChunks=[],recTimer=null,recSec=0,recStream=null;
var recBtn=document.getElementById('recBtn');
var recSaid=document.getElementById('recSaid');
function recPickType(){
 var want=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'];
 if(!window.MediaRecorder||!MediaRecorder.isTypeSupported)return '';
 for(var i=0;i<want.length;i++){if(MediaRecorder.isTypeSupported(want[i]))return want[i];}
 return '';
}
function recTick(){
 recSec++;
 var m=Math.floor(recSec/60),ss=recSec%60;
 recSaid.textContent='מקליט '+m+':'+(ss<10?'0':'')+ss+'. לחיצה נוספת עוצרת ושולחת.';
 if(recSec>=180)recStop();
}
function recStop(){
 if(rec&&rec.state!=='inactive')rec.stop();
}
function recCleanup(){
 if(recTimer){clearInterval(recTimer);recTimer=null;}
 if(recStream){recStream.getTracks().forEach(function(t){t.stop();});recStream=null;}
 recBtn.classList.remove('on');
}
function recStart(){
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){
  recSaid.textContent='הדפדפן הזה לא תומך בהקלטה. תשלח קובץ קול דרך בחירת קובץ.';return;
 }
 recBtn.disabled=true;
 navigator.mediaDevices.getUserMedia({audio:true}).then(function(st){
  recStream=st;recChunks=[];recSec=0;
  var mt=recPickType();
  try{rec=mt?new MediaRecorder(st,{mimeType:mt}):new MediaRecorder(st);}
  catch(e){rec=new MediaRecorder(st);}
  rec.ondataavailable=function(ev){if(ev.data&&ev.data.size)recChunks.push(ev.data);};
  rec.onstop=function(){
   recCleanup();
   var type=(rec&&rec.mimeType)||'audio/webm';
   var b=new Blob(recChunks,{type:type});
   if(!b.size){recSaid.textContent='לא נקלט כלום. תנסה שוב.';recBtn.disabled=false;return;}
   var ext=type.indexOf('mp4')>-1?'m4a':(type.indexOf('ogg')>-1?'ogg':'webm');
   var stampName='voice-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'')+'.'+ext;
   var file=new File([b],stampName,{type:type});
   recSaid.textContent='ההקלטה מוכנה, '+mb(file.size)+'. שולח.';
   recBtn.disabled=false;
   fBtn.disabled=true;
   reallySend(file);
  };
  rec.start();
  recBtn.classList.add('on');
  recBtn.disabled=false;
  recBtn.setAttribute('aria-label','עצירת ההקלטה ושליחה');
  recSaid.textContent='מקליט 0:00. לחיצה נוספת עוצרת ושולחת.';
  recTimer=setInterval(recTick,1000);
 }).catch(function(){
  recBtn.disabled=false;
  recSaid.textContent='אין הרשאה למיקרופון. תאשר אותה בהגדרות האתר בדפדפן ותנסה שוב.';
 });
}
function toggleRec(){
 if(rec&&rec.state==='recording'){recStop();return;}
 recStart();
}
recBtn.onclick=toggleRec;
var micBtn=document.getElementById('micBtn');
var micSaid=document.getElementById('micSaid');
micBtn.onclick=toggleRec;

// recSaid lives in the chat pane; mirror it onto the home screen so the timer
// and any error are visible wherever the recording was started from.
new MutationObserver(function(){
 micSaid.textContent=recSaid.textContent;
 var on=!!(rec&&rec.state==='recording');
 micBtn.classList.toggle('on',on);
 micBtn.setAttribute('aria-label',on?'עצירת ההקלטה ושליחה':'דבר אליי');
}).observe(recSaid,{childList:true,characterData:true,subtree:true});
// The mail pane is the same channel as the chat, filtered to the mail thread:
// every message on either side that starts with "מייל:" belongs here.
var MAILTAG='מייל:';
function isMail(m){return String(m.text||'').indexOf(MAILTAG)===0;}
function mailBody(t){return String(t).slice(MAILTAG.length).trim();}
function renderMail(){
 var baked=(D.chat||[]).filter(isMail);
 var still=pending().filter(isMail);
 var all=baked.map(function(m){return{at:m.at,from:m.from,text:m.text,pend:false};})
  .concat(still.map(function(p){return{at:p.at,from:'itzik',text:p.text,pend:true};}))
  .sort(function(a,b){return (a.at||'')<(b.at||'')?-1:1;});
 var host=document.getElementById('mailThread');
 if(!all.length){
  host.innerHTML='<div class="empty">עוד לא ביקשת ממני כלום מהתיבה.</div>';
  return;
 }
 host.innerHTML=all.map(function(m){
  var mine=m.from==='itzik';
  return '<div class="bub '+(mine?'you':'me')+(m.pend?' pend':'')+'">'
   +'<span class="w">'+(mine?'אתה':'קלוד')+' · '+esc(stamp(m.at))
   +(m.pend?' · נשלח, עוד לא נקרא':'')+'</span>'+linkify(mailBody(m.text))+'</div>';
 }).join('');
}
document.getElementById('mailForm').addEventListener('submit',function(e){
 e.preventDefault();
 var box=document.getElementById('mailText');
 var btn=document.getElementById('mailBtn');
 var said=document.getElementById('mailSaid');
 var text=box.value.trim();
 if(!text)return;
 var full=MAILTAG+' '+text;
 btn.disabled=true;
 said.textContent='שולח.';
 fetch('https://formsubmit.co/ajax/'+MAILBOX,{
  method:'POST',
  headers:{'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({_subject:'בקשת מייל מהמוניטור',_template:'table',הודעה:full,קוד:myCode()})
 }).then(function(r){
  if(!r.ok)throw new Error('bad');
  var q=pending();
  q.push({at:new Date().toISOString(),text:full});
  savePending(q);
  box.value='';
  said.textContent='נשלח. אני בודק את התיבה כל ארבע דקות.';
  renderMail();renderThread();
 }).catch(function(){
  said.textContent='השליחה לא עברה. נסה שוב.';
 }).then(function(){btn.disabled=false;});
});

render();
renderThread();
renderMail();
updateDot();
pane('h');
</script>
</body>
</html>`;

build();
