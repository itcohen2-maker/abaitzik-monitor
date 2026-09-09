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
      source: c.source,
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
/* A class that sets display beats the browser default for [hidden], which is
   how the recording overlay ended up on screen the moment the page opened. */
[hidden]{display:none!important}
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
.facerow{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
.facerow button{background:var(--sunk);color:var(--ink);border:1px solid var(--line);border-radius:10px;
 padding:9px 16px;font:500 14px Heebo,sans-serif;cursor:pointer}
.facerow span{font-size:12.5px;color:var(--dim);font-weight:300}
.install{font-size:12.5px;color:var(--dim);font-weight:300;line-height:1.5;margin:8px 4px 0}
@media(display-mode:standalone){.install{display:none}}
.links{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px;
 margin:20px 0 4px}
.links a{display:flex;align-items:center;gap:9px;text-decoration:none;
 background:var(--surface);border:1px solid var(--line);border-radius:12px;
 padding:11px 13px;color:var(--ink);font:500 14px Heebo,sans-serif;box-shadow:var(--shadow)}
.links a span{font-size:17px}
.links a small{display:block;color:var(--dim);font-weight:300;font-size:12px}
.sent{display:flex;align-items:center;gap:11px;margin-top:12px;padding:12px 15px;border-radius:16px;
 background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);font-size:14px}
.sent .s-dot{width:11px;height:11px;flex:0 0 11px;border-radius:50%;background:var(--wait);
 animation:pulse 1.5s infinite}
.sent.done .s-dot{background:var(--green);animation:none}
.sent b{display:block;font:500 15px Heebo,sans-serif}
.sent small{display:block;color:var(--dim);font-size:12px;font-weight:300}
.newbtn{width:100%;display:flex;align-items:center;gap:12px;margin:14px 0 10px;padding:15px 17px;
 border:0;border-radius:18px;cursor:pointer;text-align:start;color:#fff;font-family:Heebo,sans-serif;
 background:linear-gradient(150deg,#9aa5b8,#6b7688);box-shadow:0 8px 18px rgba(20,30,60,.16)}
.newbtn .nb-l{flex:1;min-width:0}
.newbtn b{display:block;font:800 17px Heebo,sans-serif}
.newbtn small{display:block;font-size:12px;opacity:.92;font-weight:300;margin-top:1px}
.newbtn:active{transform:translateY(2px) scale(.99)}
.newbtn .nb-c{flex:0 0 auto;min-width:34px;height:34px;border-radius:999px;display:grid;place-items:center;
 background:rgba(255,255,255,.25);font:800 16px Heebo,sans-serif;padding:0 9px}
.newbtn.hot{background:linear-gradient(150deg,#ff6b84,var(--red));
 box-shadow:0 10px 26px rgba(234,67,53,.45);animation:nbeat 1.3s infinite}
@keyframes nbeat{
 0%{box-shadow:0 10px 26px rgba(234,67,53,.45)}
 50%{box-shadow:0 10px 40px rgba(234,67,53,.85)}
 100%{box-shadow:0 10px 26px rgba(234,67,53,.45)}}
@media(prefers-reduced-motion:reduce){.newbtn.hot{animation:none}}
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
.seg button[aria-pressed="true"]{background:linear-gradient(150deg,#5aa9fb,var(--blue));color:#fff;
 font-weight:700;box-shadow:0 6px 14px rgba(66,133,244,.4),inset 0 1px 0 rgba(255,255,255,.4)}
.seg button:active{transform:scale(.97)}
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
.bub.fresh{border:2px solid var(--red);box-shadow:0 6px 18px rgba(234,67,53,.25)}
.bub.read{opacity:.72}
.badge{font-style:normal;font-weight:700;background:var(--red);color:#fff;
 padding:1px 8px;border-radius:999px;font-size:11px}
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
.sendrow{display:flex;align-items:center;gap:10px}
.plusbtn{width:48px;height:48px;flex:0 0 48px;border-radius:50%;border:0;cursor:pointer;
 background:linear-gradient(150deg,#5aa9fb,var(--blue));color:#fff;font:300 30px/1 Heebo,sans-serif;
 box-shadow:0 8px 18px rgba(66,133,244,.35),inset 0 2px 0 rgba(255,255,255,.35)}
.plusbtn:active{transform:scale(.94)}
.plusbtn[aria-expanded="true"]{transform:rotate(45deg)}
#msgBtn{align-self:flex-start;background:var(--accent);color:#fff;border:0;
 border-radius:10px;padding:11px 26px;font:500 15px Heebo,sans-serif;cursor:pointer}
#msgBtn[disabled]{opacity:.5;cursor:default}
.msgsaid{color:var(--accent);font-size:14px;min-height:20px;margin-top:9px}
#fileForm{display:flex;flex-direction:column;gap:10px;margin-top:22px;
 border-top:1px solid var(--line);padding-top:18px}
#fileForm h3{margin:0;font:500 15px Heebo,sans-serif;color:var(--ink)}
#fPick{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.pickrow{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pickbtn{border:0;cursor:pointer;border-radius:18px;padding:14px 10px;color:#fff;
 font-family:Heebo,sans-serif;text-align:center;
 box-shadow:0 8px 18px rgba(20,30,60,.18),inset 0 2px 0 rgba(255,255,255,.3)}
.pickbtn span{display:block;font-size:26px;line-height:1;margin-bottom:4px}
.pickbtn b{display:block;font:800 16px Heebo,sans-serif}
.pickbtn small{display:block;font-size:11px;opacity:.9;font-weight:300}
.pickbtn:active{transform:translateY(2px) scale(.985)}
.pb-img{background:linear-gradient(150deg,#5aa9fb,var(--blue))}
.pb-doc{background:linear-gradient(150deg,#7d8ba1,#3f4a5c)}
.pickbtn[aria-pressed="true"]{outline:3px solid var(--ink);outline-offset:2px}
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
.gold{font:800 13.5px Heebo,sans-serif;margin-top:2px;
 background:linear-gradient(90deg,#b8860b,#ffd76e,#f0b429,#fff3c4,#d4a017);
 -webkit-background-clip:text;background-clip:text;color:transparent;
 filter:drop-shadow(0 1px 0 rgba(0,0,0,.25))}
.conn{margin-inline-start:auto;font:700 15px Heebo,sans-serif;color:#fff;
 background:linear-gradient(180deg,#5cc36f,var(--green));
 min-height:44px;padding:0 20px;border-radius:999px;border:0;cursor:pointer;
 box-shadow:0 2px 6px rgba(52,168,83,.4),inset 0 1px 0 rgba(255,255,255,.35)}
.conn:active{background:linear-gradient(180deg,var(--green),#2b8c45);box-shadow:none;transform:translateY(1px)}
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
.urg{flex:0 0 66px;cursor:pointer;border-radius:20px;color:var(--blue);
 font:700 12.5px Heebo,sans-serif;line-height:1.25;
 background:var(--surface);border:2px solid var(--blue);box-shadow:var(--shadow)}
.urg:active{background:linear-gradient(180deg,#6ea8ff,var(--blue));color:#fff}
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
.c-sl{background:linear-gradient(160deg,#f472b6,#be185d)}
.c-vd{background:linear-gradient(160deg,#fbbf24,#d97706)}
.c-hb{background:linear-gradient(160deg,#fbbf24,#b45309)}
.c-add{background:var(--surface);border:2px dashed var(--line);box-shadow:none}
.c-add:after{display:none}

.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:2px}
.gt{border:0;text-align:start;cursor:pointer;border-radius:20px;padding:14px 15px;color:#fff;min-height:84px;
 transition:transform .12s ease,box-shadow .12s ease;
 display:flex;flex-direction:column;justify-content:space-between;font-family:Heebo,sans-serif;
 box-shadow:0 8px 18px rgba(20,30,60,.16),inset 0 2px 0 rgba(255,255,255,.3)}
.gt b{font:700 14px Heebo,sans-serif;display:block}
.gt small{font-size:10.5px;opacity:.92;font-weight:300}
.gt:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.g1{background:linear-gradient(150deg,#5aa9fb,var(--blue))}
.g2{background:linear-gradient(150deg,#ff8a80,var(--red))}
.g3{background:linear-gradient(150deg,#ffd54f,#f9a825);color:#3b2a00}
.g4{background:linear-gradient(150deg,#7d8ba1,#3f4a5c)}
.gt:active{transform:translateY(2px) scale(.985);box-shadow:0 4px 10px rgba(20,30,60,.22)}
.gt:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
.g5{background:linear-gradient(150deg,#b39ddb,#673ab7)}
.g6{background:linear-gradient(150deg,#80deea,#00838f)}

.c-dr{background:#fff;border:1px solid var(--line)}
.item .src{font-size:12.5px;color:var(--accent);font-weight:500;margin-top:4px}
@keyframes hue{0%,100%{background:var(--accent-soft);color:var(--accent)}
 50%{background:color-mix(in srgb,var(--wait) 22%,transparent);color:var(--wait)}}
.bn button.blink,.gt.blink{animation:hue 2.6s ease-in-out infinite;border-radius:10px}
.wn.blink .n{animation:hue 2.6s ease-in-out infinite;border-radius:8px}
.stat{display:flex;gap:6px;margin-top:9px}
.stat button{flex:1;border:1px solid var(--line);background:var(--sunk);color:var(--dim);
 border-radius:9px;padding:7px 4px;font:500 12.5px Heebo,sans-serif;cursor:pointer}
.stat button[aria-pressed="true"]{background:var(--accent-soft);color:var(--accent);border-color:var(--accent)}
.stat button[aria-pressed="true"][data-s="standby"]{background:color-mix(in srgb,var(--wait) 18%,transparent);
 color:var(--wait);border-color:var(--wait)}
.thread{max-height:52vh;overflow-y:auto}
.filebox{background:var(--surface);border:1px solid var(--line);border-radius:13px;
 padding:2px 14px;margin-top:12px;box-shadow:var(--shadow)}

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
.micfab{position:fixed;left:50%;transform:translateX(-50%);
 bottom:calc(84px + env(safe-area-inset-bottom));z-index:40;opacity:.88;touch-action:none;
 width:82px;height:82px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;
 background:conic-gradient(from 0deg,var(--blue),var(--red),var(--yellow),var(--green),var(--blue));
 box-shadow:0 10px 24px rgba(0,0,0,.35)}
.micfab:before{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--surface)}
.micfab svg{position:relative;z-index:1;width:38px;height:38px;stroke:var(--ink)}
.micfab svg rect{fill:var(--ink)}
.micfab.on{background:var(--red);animation:mpulse 1.1s infinite;opacity:1}
.micfab.dragging{opacity:.6;transition:none}
.micfab.placed{left:auto;transform:none}
.micfab.on:before{background:var(--red)}
.micfab.on svg{stroke:#fff}
.micfab.on svg rect{fill:#fff}
.micfab:active{transform:scale(.94)}
.pillbox{text-align:center;padding:10px 0 4px}
.pillbig{width:min(230px,66vw);height:min(230px,66vw);border-radius:50%;border:0;cursor:pointer;
 display:grid;place-items:center;gap:4px;color:#fff;font-family:Heebo,sans-serif;
 background:linear-gradient(180deg,#b39ddb,#5e35b1);
 box-shadow:0 18px 44px rgba(94,53,177,.45),inset 0 4px 0 rgba(255,255,255,.4)}
.pillbig .pb-i{font-size:56px;line-height:1}
.pillbig .pb-t{font:800 22px Heebo,sans-serif}
.pillbig:active{transform:scale(.96)}
.pillbig.done{background:linear-gradient(180deg,#69f0ae,var(--green));
 box-shadow:0 18px 44px rgba(52,168,83,.45),inset 0 4px 0 rgba(255,255,255,.4)}
.pillinfo{margin-top:20px;font-size:16px;color:var(--ink);line-height:1.9}
.pillinfo b{display:block;font:800 22px Heebo,sans-serif;color:var(--accent)}
.pillinfo small{display:block;color:var(--dim);font-size:13px;font-weight:300}
.recwrap{position:fixed;inset:0;z-index:60;display:grid;place-items:center;
 background:rgba(8,10,16,.82);backdrop-filter:blur(6px)}
.recbox{width:min(340px,88vw);background:var(--surface);border-radius:26px;padding:26px 22px 20px;
 text-align:center;box-shadow:0 30px 70px rgba(0,0,0,.5)}
.rectitle{font:700 20px Heebo,sans-serif;color:var(--ink)}
.rectime{font:800 40px "Frank Ruhl Libre",Georgia,serif;color:var(--red);
 font-variant-numeric:tabular-nums;margin:6px 0 16px}
.recbig{width:132px;height:132px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;
 background:linear-gradient(180deg,#ff6b84,var(--red));
 box-shadow:0 14px 34px rgba(234,67,53,.5),inset 0 3px 0 rgba(255,255,255,.45);
 animation:mpulse 1.2s infinite}
.recbig svg{width:52px;height:52px}
.recbig:active{transform:scale(.95)}
.rechint{color:var(--dim);font-size:13.5px;font-weight:300;margin-top:14px}
.reccancel{margin-top:12px;background:var(--sunk);color:var(--ink);border:1px solid var(--line);
 border-radius:12px;padding:11px 26px;font:500 15px Heebo,sans-serif;cursor:pointer;width:100%}
.bn{position:fixed;inset-inline:0;bottom:0;z-index:20;display:flex;justify-content:space-around;
 background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(12px);
 border-top:1px solid var(--line);padding:7px 4px calc(7px + env(safe-area-inset-bottom))}
.bn button{position:relative;background:none;border:0;cursor:pointer;color:var(--dim);
 font:500 10px Heebo,sans-serif;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 10px}
.bn button span{font-size:19px;line-height:1}
.bn button[aria-pressed="true"]{color:#fff;background:linear-gradient(150deg,#5aa9fb,var(--blue));
 border-radius:14px;box-shadow:0 5px 12px rgba(66,133,244,.35)}
.bn button:active{transform:scale(.94)}
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
  <div class="gold">המוניטור בונה את עצמו</div>
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
  <button type="button" id="urgBtn" class="urg"><span aria-hidden="true">📎</span>העלאת<br>קובץ</button>
 </div>

 <div class="sent" id="sentCard" hidden></div>
 <button type="button" id="newBtn" class="newbtn">
  <span class="nb-l"><b id="nbTitle">מה חדש</b><small id="nbSub"></small></span>
  <span class="nb-c" id="nbCount">0</span>
 </button>
 <section class="whatsnew" aria-label="מה חדש">
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
  <a class="ic" href="https://salinda-mobile.vercel.app/" target="_blank" rel="noopener"><span class="c c-sl">
   <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/></svg></span>סלינדה</a>
  <a class="ic" href="https://pegasusgame.vercel.app" target="_blank" rel="noopener"><span class="c c-pg">
   <svg viewBox="0 0 24 24"><path fill="#fff" d="M4 14c2-5 6-8 11-8l5-2-2 5c0 5-3 9-8 11l-1-3-3-1z"/><circle cx="14" cy="10" r="1.3" fill="#6d28d9"/></svg></span>פגסוס</a>
  <button type="button" class="ic" id="icDrive"><span class="c c-dr">
   <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M9.4 3h5.2l6 10.4h-5.2z"/><path fill="#34A853" d="M3 18.6 5.6 14h12.8l-2.6 4.6z"/><path fill="#FBBC05" d="M9.4 3 3 14l2.6 4.6L12 7.6z"/></svg></span>דרייב</button>
  <button type="button" class="ic" id="icVaad"><span class="c c-hb">
   <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg></span>ועד הבית</button>
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
 <div class="tile wait"><div class="k">לידים פתוחים</div><div class="v" id="tL">0</div></div>
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
 <small>מקלידים פעם אחת בנייד שלך והוא נשמר במכשיר. כל הודעה שתשלח תישא אותו, וכל פנייה בלעדיו אני מתעלם ממנה ומדווח לך. הקוד לעולם לא מוצג על המסך, וכדי לשנות אותו צריך אישור בזיהוי פנים.</small>
 <div class="facerow">
  <button type="button" id="faceSetup">הפעלת זיהוי פנים</button>
  <span id="faceState"></span>
 </div>
 <div class="coderow" id="codeRow" hidden>
  <input type="password" id="codeInput" inputmode="numeric" autocomplete="off" placeholder="קוד קצר, למשל 4 ספרות">
  <button type="button" id="codeSave">שמירה</button>
 </div>
 <div class="facerow">
  <button type="button" id="codeChange">שינוי הקוד</button>
 </div>
 <div class="msgsaid" id="codeSaid"></div>
</div>
<div class="install" id="installHint">להתקנה כאפליקציה על מסך הבית: בספארי לוחצים שיתוף ואז "הוספה למסך הבית". באנדרואיד: תפריט ואז "התקנת אפליקציה".</div>

<nav class="links" aria-label="קישורים מהירים">
 <a href="plan.html">
  <span aria-hidden="true">&#128736;</span>
  <div>תכנון 2.0<small>מה נבנה ומה עוד מתוכנן</small></div>
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
 <h2>לידים: מי פנה ורוצה המשך</h2>
 <div id="leads"></div>
</section>

<section id="pD" hidden>
 <h2>גוגל דרייב</h2>
 <div class="hint" style="margin-bottom:12px">קיצורים ישירים לתיקיות שאנחנו עובדים איתן. הכל בחשבון itcohen2.</div>
 <nav class="links" aria-label="תיקיות בדרייב">
  <a href="https://drive.google.com/drive/u/1/folders/1f7q8Hm6r_3IXYORX8slR-40ZEq2tKxB0" target="_blank" rel="noopener">
   <span aria-hidden="true">🎬</span><div>סרטוני סטורי<small>מה בצלחת וההיילייטים</small></div></a>
  <a href="https://drive.google.com/drive/u/1/folders/1VK_2ZFOVVnN6mj2_hwWorFWgmD5Tqvoi" target="_blank" rel="noopener">
   <span aria-hidden="true">📝</span><div>תסריטים<small>תסריט לכל ריל</small></div></a>
  <a href="https://drive.google.com/drive/u/1/folders/1ZG-haqGM-j2WwwB-1PAGKCltDvCqS9Ce" target="_blank" rel="noopener">
   <span aria-hidden="true">📊</span><div>דוח רשת<small>דוחות הניטור</small></div></a>
  <a href="https://drive.google.com/drive/u/1/my-drive" target="_blank" rel="noopener">
   <span aria-hidden="true">📁</span><div>כל הדרייב<small>הדף הראשי</small></div></a>
 </nav>
 <div class="hint" style="margin-top:14px">חסרה תיקייה? תכתוב לי בשורת הבנייה העצמית ואוסיף אותה לכאן.</div>
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

<section id="pV" hidden>
 <h2>ועד הבית</h2>
 <div class="item">
  <div class="top"><span class="who">הגיתית 7</span><span class="chip">24 דירות</span></div>
  <div class="body">קובץ מיסי ועד הבית, לשונית לכל שנה. ינואר עד ספטמבר 2026 כבר הוצלבו מול הבנק.</div>
  <a class="ask" href="https://docs.google.com/spreadsheets/u/1/d/17PUmZuY_Qmb30a0klBBliN6xOrmwMsOH27z_tt7moIM/edit" target="_blank" rel="noopener">פתיחת הקובץ</a>
  <a class="ask" href="https://drive.google.com/drive/u/1/folders/1pLlW7nWGm3lYhMq0P7fzFPn_U1z1trE1" target="_blank" rel="noopener">תיקיית ועד הבית</a>
 </div>
 <div class="item">
  <div class="top"><span class="who">מה פתוח</span></div>
  <div class="body">בן יקר, דירה 6, חייב 1,200 על חודשים 6 עד 9.
יוסי, דירה 17, חייב 600 מינואר ומאפריל.
2,000 מדירה 2 שעוד לא נרשמו בקובץ.
ספטמבר עוד חלקי, רוב התשלומים יורדים ב-10 בחודש.</div>
  <button type="button" class="ask" id="vaadAsk">שאלה על ועד הבית</button>
 </div>
</section>

<section id="pP" hidden>
 <h2>הכדור</h2>
 <div class="pillbox">
  <button type="button" id="pillBig" class="pillbig">
   <span class="pb-i">✓</span>
   <span class="pb-t">לקחתי כדור</span>
  </button>
  <div class="pillinfo" id="pillInfo"></div>
 </div>
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
  <div class="sendrow">
   <button type="button" id="plusBtn" class="plusbtn" aria-label="צירוף תמונה או קובץ">+</button>
   <button type="submit" id="msgBtn">שליחה</button>
  </div>
 </form>
 <div class="msgsaid" id="msgSaid"></div>

 <form id="fileForm" class="filebox" method="POST" enctype="multipart/form-data" hidden>
  <input type="hidden" name="_captcha" value="false">
  <input type="hidden" name="_subject" value="קובץ מהמוניטור">
  <input type="hidden" name="_next" id="fNext" value="">
  <input type="hidden" name="הודעה" id="fNote" value="">
  <input type="hidden" name="קוד" id="fCode" value="">
  <div class="pickrow">
   <button type="button" id="qN" class="pickbtn pb-img" aria-pressed="true">
    <span aria-hidden="true">🖼️</span><b>תמונה</b><small>מכווץ, כמו בוואטסאפ</small></button>
   <button type="button" id="qF" class="pickbtn pb-doc" aria-pressed="false">
    <span aria-hidden="true">📎</span><b>מסמך</b><small>איכות מלאה</small></button>
  </div>
  <input type="file" id="fPick" name="attachment" multiple
   accept="image/*,video/*,audio/*,application/pdf">
  <input type="text" id="fCap" placeholder="כיתוב, לא חובה">
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

<button type="button" id="micFab" class="micfab" aria-label="דבר אליי">
 <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="9" y="3" width="6" height="11" rx="3" fill="#fff" stroke="none"/>
  <path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M8.5 21h7"/>
 </svg>
</button>

<div class="recwrap" id="recModal" hidden>
 <div class="recbox">
  <div class="rectitle" id="recTitle">מדבר אליי</div>
  <div class="rectime" id="recTime">0:00</div>
  <button type="button" id="recBig" class="recbig" aria-label="עצירה ושליחה">
   <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="7" y="7" width="10" height="10" rx="2" fill="#fff" stroke="none"/>
   </svg>
  </button>
  <div class="rechint" id="recHint">לחיצה עוצרת ושולחת אליי</div>
  <button type="button" id="recCancel" class="reccancel">ביטול</button>
 </div>
</div>

<nav class="bn" aria-label="מסכים">
 <button type="button" id="nH" aria-pressed="true"><span aria-hidden="true">🏠</span>בית</button>
 <button type="button" id="nM" aria-pressed="false"><span aria-hidden="true">💬</span>צ׳אט<i class="dot" id="mDot" hidden></i></button>
 <button type="button" id="nQ" aria-pressed="false"><span aria-hidden="true">📈</span>רשתות</button>
 <button type="button" id="nL" aria-pressed="false"><span aria-hidden="true">🎯</span>לידים</button>
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
var SRC={site:'טופס יצירת קשר באתר',tiktok:'הודעה פרטית בטיקטוק',facebook:'פייסבוק',instagram:'אינסטגרם',youtube:'יוטיוב',phone:'טלפון',person:'הכרות אישית'};
var STAT={open:'לטיפול',standby:'סטנד ביי',done:'טופל'};
function leadStatus(c){
 var k=c.name||'';
 try{var o=JSON.parse(localStorage.getItem('leadStatus')||'{}');if(o[k])return o[k];}catch(e){}
 return c.status||'open';
}
function setLeadStatus(name,st){
 var o={};try{o=JSON.parse(localStorage.getItem('leadStatus')||'{}');}catch(e){}
 o[name]=st;
 try{localStorage.setItem('leadStatus',JSON.stringify(o));}catch(e){}
 sendLine('סטטוס ליד: '+name+' · '+(STAT[st]||st));
}
function leadRow(c){
 var st=leadStatus(c);
 var closed=st==='done';
 var subject='פרטים: '+(c.name||'');
 var body='שלח לי את פרטי ההתקשרות ואת מה שסוכם.';
 return '<div class="item lead'+(closed?' closed':'')+'">'
  +'<div class="top"><span class="who">'+esc(c.name||'ללא שם')+'</span>'
  +'<span class="chip">'+esc(NET[c.network]||c.network||'אחר')+'</span>'
  +'<span class="chip">'+esc(STAT[st]||st)+'</span>'
  +'<span>'+ago(c.at)+'</span></div>'
  +'<div class="src">מקור: '+esc(c.source||SRC[c.network]||NET[c.network]||'לא ידוע')+'</div>'
  +(c.note?'<div class="body">'+esc(c.note)+'</div>':'')
  +logHtml(c.log)
  +'<a class="ask" href="mailto:?subject='+encodeURIComponent(subject)
  +'&body='+encodeURIComponent(body)+'">בקשת פרטי התקשרות</a>'
  +'<div class="stat" data-lead="'+esc(c.name||'')+'">'+['open','standby','done'].map(function(k){return '<button type="button" data-s="'+k+'" aria-pressed="'+(k===st)+'">'+STAT[k]+'</button>';}).join('')+'</div>'
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
// A pending copy is dropped once any message of his lands at or after it: I
// rewrite what he said (a recording becomes its transcript), so matching on the
// text itself left the same message showing twice.
function dropSettled(list,baked){
 var mine=baked.filter(function(m){return m.from==='itzik';})
   .map(function(m){return m.at||'';}).sort();
 return list.filter(function(p){
  if(isMail(p))return false;
  return !mine.some(function(at){return at>=p.at;});
 });
}
function renderThread(){
 var seen=chatSeen();
 var baked=(D.chat||[]).filter(function(m){return !isMail(m);});
 var still=dropSettled(pending(),baked);
 savePending(still.concat(pending().filter(isMail)));
 var all=baked.map(function(m){return{at:m.at,from:m.from,text:m.text,status:m.status,pend:false};})
   .concat(still.map(function(p){return{at:p.at,from:'itzik',text:p.text,pend:true};}))
   .sort(function(a,b){return (a.at||'')<(b.at||'')?1:-1;});
 var host=document.getElementById('thread');
 if(!all.length){
  host.innerHTML='<div class="empty">עוד לא דיברנו כאן. תכתוב משהו למטה.</div>';
  return;
 }
 host.innerHTML=all.map(function(m){
  var mine=m.from==='itzik';
  var fresh=!mine&&(m.at||'')>seen;
  return '<div class="bub '+(mine?'you':'me')+(m.pend?' pend':'')+(fresh?' fresh':' read')+'">'
   +'<span class="w">'+(mine?'אתה':'קלוד')+' · '+esc(stamp(m.at))
   +(m.pend?' · נשלח, עוד לא נקרא':'')+statusTag(m)
   +(fresh?' · <em class="badge">חדש</em>':(mine?'':' · נקרא'))+'</span>'+linkify(m.text)+'</div>';
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
function unreadCount(){
 return (D.chat||[]).filter(function(m){return m.from==='claude'&&(m.at||'')>chatSeen();}).length;
}
function renderNew(){
 renderSent();
 var c=unreadCount();
 var btn=document.getElementById('newBtn');
 btn.classList.toggle('hot',c>0);
 document.getElementById('nbCount').textContent=c?c:'✓';
 document.getElementById('nbTitle').textContent=c?'יש מה חדש':'הכל מעודכן';
 document.getElementById('nbSub').textContent=c
  ?(c===1?'תשובה אחת מחכה לך. לחיצה פותחת אותה.':c+' תשובות מחכות לך. לחיצה פותחת אותן.')
  :'אין תשובות שלא קראת.';
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
var PANES={h:'pH',q:'pQ',l:'pL',r:'pR',m:'pM',e:'pE',n:'pN',g:'pG',d:'pD',p:'pP',v:'pV'};
// Itzik set the rhythm on 9.9: every eight hours from the morning dose.
var PILLGAP=8*3600*1000;
function lastPill(){
 var c=(D.chat||[]).filter(function(m){return m.from==='itzik'&&/לקחתי כדור/.test(m.text||'');});
 var local=0;
 try{local=Number(localStorage.getItem('lastPill')||0);}catch(e){}
 var fromChat=c.length?Date.parse(c[c.length-1].at||'')||0:0;
 return Math.max(local,fromChat);
}
function renderPill(){
 var box=document.getElementById('pillInfo');
 var btn=document.getElementById('pillBig');
 if(!box||!btn)return;
 var t=lastPill();
 if(!t){
  btn.className='pillbig';
  box.innerHTML='<b>עוד לא נרשמה מנה</b><small>לחיצה על העיגול מסמנת שלקחת ומתחילה את הספירה למנה הבאה.</small>';
  return;
 }
 var next=t+PILLGAP,left=next-Date.now();
 function hm(x){return x.getHours()+':'+String(x.getMinutes()).padStart(2,'0');}
 btn.className='pillbig'+(left>0?' done':'');
 var when=left>0
  ?('בעוד '+Math.floor(left/3600000)+' שעות ו'+Math.round(left%3600000/60000)+' דקות')
  :'עכשיו';
 box.innerHTML='<b>המנה הבאה '+esc(when)+'</b>'
  +'<div>בשעה '+esc(hm(new Date(next)))+'</div>'
  +'<small>המנה האחרונה נרשמה ב'+esc(hm(new Date(t)))+'. אזכיר לך גם בהתראה לנייד.</small>';
}
// More landing pages are coming, so each one is a line here.
var LANDING=[
 {name:'כלל עשר הדקות',note:'מילת המפתח: שום',url:'https://itzik-site.vercel.app/shum'},
 {name:'שיטת הפירה',note:'מילת המפתח: גזר',url:'https://itzik-site.vercel.app/gezer'},
 {name:'סלינדה',note:'אתר',url:'https://salinda-mobile.vercel.app/'}
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


// One line straight into the same channel the chat uses, for the small
// signals: a lead moved to standby, a folder is missing, and so on.
function sendLine(text){
 fetch('https://formsubmit.co/ajax/'+MAILBOX,{
  method:'POST',
  headers:{'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({_subject:'עדכון מהמוניטור',_template:'table',הודעה:text,קוד:myCode()})
 }).then(function(){
  var p=pending();p.push({at:new Date().toISOString(),text:text});savePending(p);
 }).catch(function(){});
}

// The reports button breathes until he opens it.
function newestReport(){
 var R=D.reports||[];return R.length?(R[0].at||''):'';
}
function reportsSeen(){
 try{return localStorage.getItem('reportsSeen')||'';}catch(e){return'';}
}
function markReportsSeen(){
 try{localStorage.setItem('reportsSeen',newestReport());}catch(e){}
 paintReportDot();
}
function paintReportDot(){
 var fresh=newestReport()&&newestReport()>reportsSeen();
 var n=document.getElementById('nR');if(n)n.classList.toggle('blink',!!fresh);
 var t=document.getElementById('gReports');if(t)t.classList.toggle('blink',!!fresh);
}

function pane(w){
 for(var k in PANES){document.getElementById(PANES[k]).hidden=(k!==w);}
 for(var n in NAVS){document.getElementById(NAVS[n]).setAttribute('aria-pressed',n===w);}
 window.scrollTo(0,0);
}
document.getElementById('reloadBtn').onclick=function(){
 location.replace(location.pathname+'?v='+Date.now());
};
// A short beep when something is waiting. Browsers block audio until the page
// has been touched, so it only ever plays on his own tap, never on load.
function beep(){
 try{
  var A=window.AudioContext||window.webkitAudioContext;if(!A)return;
  var ctx=new A();var o=ctx.createOscillator();var g=ctx.createGain();
  o.type='sine';o.frequency.value=880;g.gain.value=.06;
  o.connect(g);g.connect(ctx.destination);o.start();
  setTimeout(function(){o.stop();ctx.close();},160);
 }catch(e){}
}
// The attach form stays out of the way until the plus is pressed.
document.getElementById('plusBtn').onclick=function(){
 var f=document.getElementById('fileForm');
 var open=f.hidden;
 f.hidden=!open;
 this.setAttribute('aria-expanded',open?'true':'false');
 if(open)f.scrollIntoView({behavior:'smooth',block:'nearest'});
};
document.getElementById('newBtn').onclick=function(){
 if(unreadCount())beep();
 pane('m');renderThread();
 // the marks stay until he leaves the chat, so he can see what was new
 setTimeout(function(){markChatSeen();renderNew();},50);
};
document.getElementById('nH').onclick=function(){pane('h');};
document.getElementById('nQ').onclick=function(){pane('q');};
document.getElementById('nL').onclick=function(){pane('l');};
document.getElementById('nR').onclick=function(){pane('r');markReportsSeen();};
document.getElementById('nM').onclick=function(){pane('m');markChatSeen();};

// Home shortcuts. The mail and "new module" circles have no screen of their
// own yet, so they open the chat with the request already started.
function markSent(kind){
 try{localStorage.setItem('lastSent',JSON.stringify({at:new Date().toISOString(),kind:kind}));}catch(e){}
}
function lastSent(){
 try{return JSON.parse(localStorage.getItem('lastSent')||'null');}catch(e){return null;}
}
var SENTLABEL={text:'הודעה',mail:'בקשת מייל',file:'קובץ',voice:'הקלטה'};
// The status comes from the message I write back into the chat: until it is
// there, the send is still on its way to me.
function renderSent(){
 var L=lastSent();var card=document.getElementById('sentCard');
 if(!L){card.hidden=true;return;}
 card.hidden=false;
 var mine=(D.chat||[]).filter(function(m){return m.from==='itzik'&&(m.at||'')>=L.at;});
 var st=mine.length?(mine[mine.length-1].status||'received'):'';
 var reply=(D.chat||[]).some(function(m){return m.from==='claude'&&(m.at||'')>L.at;});
 var label=SENTLABEL[L.kind]||'הודעה';
 var t,sub,done=false;
 if(st==='done'||reply){t=label+' טופלה';sub='עניתי לך. לחץ כאן כדי לקרוא את התשובה.';done=true;}
 else if(st==='working'){t=label+' בעבודה';sub='קלטתי, אני מטפל.';}
 else if(st){t=label+' התקבלה';sub='נכנסה אליי, מחכה לטיפול.';}
 else{t=label+' נשלחה';sub='בדרך אליי. אני בודק את התיבה כל ארבע דקות.';}
 card.className='sent'+(done?' done':'');
 card.innerHTML='<span class="s-dot"></span><div><b>'+esc(t)+'</b><small>'+esc(sub)+' · '+esc(stamp(L.at))+'</small></div>';
 card.style.cursor=done?'pointer':'';
 card.onclick=done?function(){pane('m');renderThread();markChatSeen();}:null;
}
function myCode(){
 try{return localStorage.getItem('monitorCode')||'';}catch(e){return '';}
}
function showCodeBox(){
 var box=document.getElementById('codeBox');
 box.hidden=false;
 var c=myCode();
 document.getElementById('codeSaid').textContent=c?'קוד שמור במכשיר הזה.':'עוד לא נקבע קוד. תקליד אחד ותשמור.';
 document.getElementById('codeRow').hidden=!!c;
 faceRender();
}
// Face ID through the platform authenticator. There is no server behind this,
// so it gates the screen rather than encrypting anything, and the text below
// says exactly that.
function faceId(){
 try{return localStorage.getItem('faceCred')||'';}catch(e){return '';}
}
function b64(buf){
 var b='';new Uint8Array(buf).forEach(function(c){b+=String.fromCharCode(c);});
 return btoa(b);
}
function unb64(str){
 var raw=atob(str),a=new Uint8Array(raw.length);
 for(var i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);
 return a.buffer;
}
function faceSupported(){
 return !!(window.PublicKeyCredential&&navigator.credentials&&location.protocol==='https:');
}
function faceEnroll(cb){
 if(!faceSupported()){cb(false,'הדפדפן הזה לא תומך בזיהוי פנים.');return;}
 var ch=new Uint8Array(32);crypto.getRandomValues(ch);
 var uid=new Uint8Array(16);crypto.getRandomValues(uid);
 navigator.credentials.create({publicKey:{
  challenge:ch,
  rp:{name:'המוניטור של אבא איציק'},
  user:{id:uid,name:'itzik',displayName:'איציק'},
  pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
  authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},
  timeout:60000,attestation:'none'
 }}).then(function(c){
  try{localStorage.setItem('faceCred',b64(c.rawId));}catch(e){}
  cb(true,'זיהוי פנים מופעל במכשיר הזה.');
 }).catch(function(){cb(false,'ההפעלה בוטלה או נכשלה.');});
}
function faceCheck(cb){
 var id=faceId();
 if(!id){cb(false,'צריך קודם להפעיל זיהוי פנים.');return;}
 var ch=new Uint8Array(32);crypto.getRandomValues(ch);
 navigator.credentials.get({publicKey:{
  challenge:ch,
  allowCredentials:[{type:'public-key',id:unb64(id)}],
  userVerification:'required',timeout:60000
 }}).then(function(){cb(true,'');}).catch(function(){cb(false,'הזיהוי נכשל. לא נפתח.');});
}
function faceRender(){
 var st=document.getElementById('faceState');
 var btn=document.getElementById('faceSetup');
 if(!faceSupported()){st.textContent='לא נתמך בדפדפן הזה.';btn.disabled=true;return;}
 var on=!!faceId();
 st.textContent=on?'מופעל במכשיר הזה.':'עדיין לא הופעל במכשיר הזה.';
 btn.textContent=on?'הפעלה מחדש':'הפעלת זיהוי פנים';
}
document.getElementById('faceSetup').onclick=function(){
 var st=document.getElementById('faceState');
 st.textContent='ממתין לזיהוי...';
 faceEnroll(function(ok,msg){st.textContent=msg;faceRender();});
};
document.getElementById('codeChange').onclick=function(){
 var said=document.getElementById('codeSaid');
 var row=document.getElementById('codeRow');
 if(!faceId()){said.textContent='קודם מפעילים זיהוי פנים, ורק אחר כך אפשר לשנות את הקוד.';return;}
 said.textContent='ממתין לזיהוי פנים...';
 faceCheck(function(ok,msg){
  if(!ok){said.textContent=msg;row.hidden=true;return;}
  row.hidden=false;
  document.getElementById('codeInput').value='';
  said.textContent='זוהית. תקליד קוד חדש ותשמור.';
 });
};
document.getElementById('codeSave').onclick=function(){
 var v=document.getElementById('codeInput').value.trim();
 var said=document.getElementById('codeSaid');
 if(!v){said.textContent='תקליד קוד קודם.';return;}
 try{localStorage.setItem('monitorCode',v);said.textContent='נשמר. מעכשיו כל הודעה מהמכשיר הזה נושאת אותו.';
  document.getElementById('codeInput').value='';
  document.getElementById('codeRow').hidden=true;}
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
document.getElementById('gReports').onclick=function(){pane('r');markReportsSeen();};
document.getElementById('gMail').onclick=function(){pane('e');};
document.getElementById('gPill').onclick=function(){pane('p');renderPill();};
document.getElementById('pillBig').onclick=function(){
 var box=document.getElementById('msgText');
 box.value='לקחתי כדור עכשיו.';
 document.getElementById('msgForm').dispatchEvent(new Event('submit',{cancelable:true}));
 try{localStorage.setItem('lastPill',String(Date.now()));}catch(e){}
 renderPill();
};
document.getElementById('gAsk').onclick=function(){askInChat('');};
wireSlot();
paintReportDot();
document.getElementById('leads').addEventListener('click',function(e){
 var b=e.target.closest?e.target.closest('.stat button'):null;
 if(!b)return;
 var host=b.parentNode;
 var name=host.getAttribute('data-lead');
 var st=b.getAttribute('data-s');
 setLeadStatus(name,st);
 render();
});
document.getElementById('icMail').onclick=function(){pane('e');};
document.getElementById('icDrive').onclick=function(){pane('d');};
document.getElementById('icVaad').onclick=function(){pane('v');};
document.getElementById('vaadAsk').onclick=function(){askInChat('ועד הבית: ');};
document.getElementById('icAdd').onclick=function(){askInChat('מודול חדש שאני רוצה: ');};
document.getElementById('icLand').onclick=function(){pane('g');};
document.getElementById('landList').innerHTML=LANDING.map(function(l){
 return '<div class="item"><div class="top"><span class="who">'+esc(l.name)+'</span>'
  +'<span class="chip">'+esc(l.note)+'</span></div>'
  +'<a class="ask" href="'+esc(l.url)+'" target="_blank" rel="noopener">פתיחת הדף</a></div>';
}).join('')+'<div class="empty">דף נחיתה חדש נכנס לכאן. תשלח לי בצ׳אט את הכתובת ואת מילת המפתח שמפעילה אותו.</div>';
// The old urgent shortcut became the file upload: chat pane, attach form open.
document.getElementById('urgBtn').onclick=function(){
 pane('m');renderThread();
 var f=document.getElementById('fileForm');
 f.hidden=false;
 document.getElementById('plusBtn').setAttribute('aria-expanded','true');
 setTimeout(function(){f.scrollIntoView({behavior:'smooth',block:'center'});},60);
 // Straight into the photo roll. Anything else is one tap away on מסמך.
 // This has to run inside the tap itself: iOS ignores a file picker opened
 // from a timer, because by then the gesture is over.
 openPicker('normal','image/*');
};
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
  markSent('text');renderSent();
  renderThread();
 }).catch(function(){
  said.textContent='השליחה לא עברה. נסה שוב, או שלח מייל רגיל.';
 }).then(function(){btn.disabled=false;});
});

var QMAX=10*1024*1024;
var qMode='normal';
var fPick=document.getElementById('fPick');
var fForm=document.getElementById('fileForm');
var fMeta=document.getElementById('fMeta');
var fSaid=document.getElementById('fSaid');
var fBtn=document.getElementById('fBtn');
function mb(n){return (n/1048576).toFixed(1)+'MB';}
function isImg(f){return !!f&&String(f.type).indexOf('image/')===0;}
function picked(){
 return fPick.files?Array.prototype.slice.call(fPick.files):[];
}
function describe(){
 var list=picked();
 if(!list.length){fMeta.className='fmeta';
  fMeta.textContent='אפשר לבחור כמה קבצים יחד. תמונה מכווצת כמו בוואטסאפ, מסמך נשלח במקור.';return;}
 var total=totalSize(list);
 var allImages=list.every(isImg);
 var t=list.length===1?(list[0].name+' · '+mb(total))
   :(list.length+' קבצים · '+mb(total)+' יחד');
 if(qMode==='normal'&&allImages)t+=' · יכווצו כמו בוואטסאפ';
 else if(qMode==='normal')t+=' · וידאו וקול נשלחים כמו שהם, אין כיווץ בדפדפן';
 else t+=' · נשלח במקור, איכות מלאה';
 var big=total>QMAX&&!(qMode==='normal'&&allImages);
 if(big)t+=' · גדול מדי, המגבלה 10MB יחד';
 fMeta.className='fmeta'+(big?' bad':'');
 fMeta.textContent=t;
}
function setQ(m){
 qMode=m;
 document.getElementById('qF').setAttribute('aria-pressed',m==='full');
 document.getElementById('qN').setAttribute('aria-pressed',m==='normal');
 describe();
}
function openPicker(mode,accept){
 setQ(mode);
 fPick.setAttribute('accept',accept);
 fPick.click();
}
document.getElementById('qN').onclick=function(){openPicker('normal','image/*');};
document.getElementById('qF').onclick=function(){openPicker('full','image/*,video/*,audio/*,application/pdf');};
fPick.addEventListener('change',describe);
function putFiles(list){
 try{var dt=new DataTransfer();list.forEach(function(f){dt.items.add(f);});fPick.files=dt.files;return true;}
 catch(e){return false;}
}
function totalSize(list){
 return list.reduce(function(n,f){return n+f.size;},0);
}
// FormSubmit weighs the whole batch against one 10MB ceiling, so the check is
// on the sum and the message says which files made it up.
function reallySend(list){
 if(!Array.isArray(list))list=[list];
 var total=totalSize(list);
 if(total>QMAX){
  fSaid.textContent=(list.length>1?list.length+' קבצים יחד שוקלים ':'הקובץ שוקל ')+mb(total)
   +' והמגבלה היא 10MB. תשלח פחות קבצים בבת אחת, או תעלה לדרייב ותכתוב לי כאן את השם.';
  fBtn.disabled=false;return;
 }
 if(!putFiles(list)){fSaid.textContent='הדפדפן לא נתן להחליף את הקבצים. תבחר שוב ותשלח.';fBtn.disabled=false;return;}
 document.getElementById('fNext').value=location.href.split('#')[0]+'#sent';
 var cap=document.getElementById('fCap').value.trim();
 var voice=list.length===1&&/^voice-/.test(list[0].name);
 var deflt=voice?'הודעה קולית מהמוניטור'
   :(list.length>1?list.length+' קבצים מהמוניטור':'קובץ מהמוניטור');
 document.getElementById('fNote').value=cap||deflt;
 document.getElementById('fCode').value=myCode();
 markSent(voice?'voice':'file');
 fForm.action='https://formsubmit.co/'+MAILBOX;
 fSaid.textContent=list.length>1?('שולח '+list.length+' קבצים.'):'שולח.';
 fForm.submit();
}
// Images are shrunk one after another so the batch is ready before it is sent.
function shrinkAll(list,done){
 var out=[],i=0;
 (function next(){
  if(i>=list.length){done(out);return;}
  var f=list[i++];
  if(!isImg(f)){out.push(f);return next();}
  shrink(f,function(r){out.push(r);next();});
 })();
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
 var list=picked();
 if(!list.length){fSaid.textContent='קודם תבחר קובץ.';return;}
 fBtn.disabled=true;
 fSaid.textContent=list.length>1?('מכין '+list.length+' קבצים.'):'מכין.';
 if(qMode==='normal')shrinkAll(list,reallySend);
 else reallySend(list);
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
function recClock(){
 var m=Math.floor(recSec/60),ss=recSec%60;
 return m+':'+(ss<10?'0':'')+ss;
}
function recTick(){
 recSec++;
 var t=document.getElementById('recTime');
 if(t)t.textContent=recClock();
 recSaid.textContent='מקליט '+recClock()+'. לחיצה נוספת עוצרת ושולחת.';
 if(recSec>=180)recStop();
}
function recModal(open){
 var m=document.getElementById('recModal');
 if(!m)return;
 m.hidden=!open;
 if(open){
  document.getElementById('recTime').textContent='0:00';
  document.getElementById('recTitle').textContent='מדבר אליי';
  document.getElementById('recHint').textContent='לחיצה עוצרת ושולחת אליי';
 }
}
// Cancelling throws the audio away instead of sending it.
var recAbort=false;
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
   if(recAbort){recAbort=false;recModal(false);recSaid.textContent='ההקלטה בוטלה.';recBtn.disabled=false;return;}
   recModal(false);
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
  recModal(true);
  recBtn.classList.add('on');
  recBtn.disabled=false;
  recBtn.setAttribute('aria-label','עצירת ההקלטה ושליחה');
  recSaid.textContent='מקליט 0:00. לחיצה נוספת עוצרת ושולחת.';
  recTimer=setInterval(recTick,1000);
 }).catch(function(){
  recBtn.disabled=false;recModal(false);
  recSaid.textContent='אין הרשאה למיקרופון. תאשר אותה בהגדרות האתר בדפדפן ותנסה שוב.';
 });
}
function toggleRec(){
 if(rec&&rec.state==='recording'){recStop();return;}
 recStart();
}
recBtn.onclick=toggleRec;
document.getElementById('recBig').onclick=function(){recStop();};
var fabEl=document.getElementById('micFab');
// Drag it anywhere. A press that never moves is still a tap, so recording is
// not lost to a shaky finger.
(function(){
 var sx=0,sy=0,ox=0,oy=0,moved=false,down=false;
 function place(x,y){
  var w=fabEl.offsetWidth,h=fabEl.offsetHeight;
  x=Math.max(6,Math.min(window.innerWidth-w-6,x));
  y=Math.max(6,Math.min(window.innerHeight-h-6,y));
  fabEl.classList.add('placed');
  fabEl.style.left=x+'px';
  fabEl.style.top=y+'px';
  fabEl.style.bottom='auto';
  try{localStorage.setItem('micPos',JSON.stringify({x:x,y:y}));}catch(e){}
 }
 try{
  var saved=JSON.parse(localStorage.getItem('micPos')||'null');
  if(saved)place(saved.x,saved.y);
 }catch(e){}
 fabEl.addEventListener('pointerdown',function(e){
  down=true;moved=false;
  var r=fabEl.getBoundingClientRect();
  sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top;
  fabEl.setPointerCapture(e.pointerId);
 });
 fabEl.addEventListener('pointermove',function(e){
  if(!down)return;
  var dx=e.clientX-sx,dy=e.clientY-sy;
  if(!moved&&Math.abs(dx)+Math.abs(dy)<8)return;
  moved=true;fabEl.classList.add('dragging');
  place(ox+dx,oy+dy);
 });
 fabEl.addEventListener('pointerup',function(e){
  down=false;fabEl.classList.remove('dragging');
  if(!moved)toggleRec();
 });
 fabEl.addEventListener('pointercancel',function(){down=false;fabEl.classList.remove('dragging');});
})();
document.getElementById('recCancel').onclick=function(){
 if(rec&&rec.state==='recording'){recAbort=true;recStop();}
 else{recModal(false);}
};
var micBtn=document.getElementById('micBtn');
var micSaid=document.getElementById('micSaid');
micBtn.onclick=toggleRec;

// recSaid lives in the chat pane; mirror it onto the home screen so the timer
// and any error are visible wherever the recording was started from.
new MutationObserver(function(){
 micSaid.textContent=recSaid.textContent;
 var on=!!(rec&&rec.state==='recording');
 micBtn.classList.toggle('on',on);
 var fab=document.getElementById('micFab');
 if(fab){fab.classList.toggle('on',on);fab.setAttribute('aria-label',on?'מקליט, לחיצה עוצרת':'דבר אליי');}
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
  markSent('mail');renderSent();
  renderMail();renderThread();
 }).catch(function(){
  said.textContent='השליחה לא עברה. נסה שוב.';
 }).then(function(){btn.disabled=false;});
});

render();
renderThread();
renderPill();
renderMail();
updateDot();
pane('h');
</script>
</body>
</html>`;

build();
