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

// The page as a string, from a payload. build() feeds it real data; the
// tests feed it a fixture. Replacements use a function so that a "$&" inside
// the JSON or the lib source is not expanded by String.replace.
const LIB = fs.readFileSync(path.join(__dirname, 'lib', 'monitor-logic.js'), 'utf8');
// He asked on 11.9 to mark everything read and start the count from zero.
// A phone that has not applied this stamp yet marks every answer written
// before it as read once, on its next load. Bump the value to reset again.
const RESET_SEEN_AT = '2026-09-11T10:35:00';
function renderPage(payload) {
  const data = JSON.stringify(payload).replace(/</g, '\\u003c');
  return PAGE
    .replace('__LIB__', () => LIB.replace(/<\/script/gi, '<\\/script'))
    .replace('__DATA__', () => data)
    .replace('__NET__', () => JSON.stringify(NET))
    .replace('__CAT__', () => JSON.stringify(CAT));
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

  // Short updates from the pegasus session: what was done, what is
  // happening, what is planned. He asked for a screen that shows only these.
  // `ask` is the part of an update that is waiting on him, and `opts` are the
  // ready answers. He asked to answer on the card itself, not to scroll down
  // and write a message about which update he means.
  const pegasus = loadDocs('pegasus')
    .map(p => ({ at: p.at, did: p.did || '', now: p.now || '', plan: p.plan || '',
                 ask: p.ask || '', opts: Array.isArray(p.opts) ? p.opts : [] }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));
  // How I keep getting better. Each entry is one thing I got wrong or one
  // thing I changed, in his words: what, why, and what it changes for him.
  const improve = loadDocs('improve')
    .map(p => ({ at: p.at, what: p.what || '', why: p.why || '', effect: p.effect || '' }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));
  // One off things he asked for that are not a report and not a chat message:
  // a page to print, a file to keep. He asked for a tile that blinks when one
  // lands so he can find it without asking me where it went.
  const special = loadDocs('special')
    .map(x => ({ at: x.at, title: x.title || '', url: x.url || '',
                 note: x.note || '', copy: x.copy || '' }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));
  const reports = loadDocs('reports')
    .map(r => ({ title: r.title, at: r.at, body: r.body, nets: reportNets(r) }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));

  const chat = loadDocs('chat')
    .map(m => ({ id: m.id, at: m.at, from: m.from, text: m.text, status: m.status || '', re: m.re || '' }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? -1 : 1));

  const openCmds = loadDocs('commands')
    .filter(c => !c.done && /^[0-9]/.test(c.id))
    .map(c => ({ at: c.at, text: c.text }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));
  // Open questions I am waiting on an answer for. This is the part a client
  // sees: the app asks what he wants and changes in front of him.
  const choices = loadDocs('choices')
    .filter(c => !c.answer)
    .map(c => ({ id: c.id, at: c.at, question: c.question, options: c.options || [] }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));
  const food = loadDocs('food')
    .map(f => ({ at: f.at, name: f.name, kcal: f.kcal, protein: f.protein,
                 carbs: f.carbs, fat: f.fat, note: f.note || '' }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));
  const now = loadDocs('status').find(d => d.id === 'now') || null;

  const payload = {
    now: now ? { at: now.at, text: now.text, next: now.next } : null,
    openCmds,
    builtAt: new Date().toISOString(),
    resetSeenAt: RESET_SEEN_AT,
    counts: {
      pending: pending.length,
      replied: replied.length,
      today: repliedToday.length,
      leads: contacts.filter(c => c.status !== 'done').length,
    },
    choices,
    food,
    pending: pending.sort((a, b) => (a.seenAt < b.seenAt ? 1 : -1)),
    replied: replied.sort((a, b) => (a.repliedAt < b.repliedAt ? 1 : -1)),
    contacts,
    reports,
    pegasus,
    improve,
    special,
    chat,
  };

  const html = renderPage(payload);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '', 'utf8');
  // The live strip reads this every forty seconds. It carries what I am doing
  // right now and how many answers are waiting, so the screen can say it
  // without downloading the whole page again.
  fs.writeFileSync(path.join(OUT_DIR, 'version.json'),
    JSON.stringify({
      builtAt: payload.builtAt,
      now: payload.now || null,
      answers: chat.filter(m => m.from === 'claude').length,
    }), 'utf8');
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
 --gold:#f0b429;--fresh:#e6f6ec;--unread:#fdeceb;
 --shadow:0 2px 8px rgba(30,40,70,.07);--r:18px}
/* Three states, not two. With no choice made the phone decides, which is
   what he had until now. A choice stamps data-theme on the root and has to
   win in both directions, so the same tokens are written twice on purpose. */
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#0f1218;--surface:#181d27;--sunk:#141922;
 --ink:#eef1f7;--dim:#9aa5b8;--line:#252c39;--accent:#8ab4f8;--accent-soft:#1b2b45;
 --wait:#fbbc05;--fresh:#12301f;--unread:#331615;--shadow:0 2px 10px rgba(0,0,0,.4)}}
:root[data-theme="dark"]{--ground:#0f1218;--surface:#181d27;--sunk:#141922;
 --ink:#eef1f7;--dim:#9aa5b8;--line:#252c39;--accent:#8ab4f8;--accent-soft:#1b2b45;
 --wait:#fbbc05;--fresh:#12301f;--unread:#331615;--shadow:0 2px 10px rgba(0,0,0,.4)}
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
 background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:13px 15px;box-shadow:var(--shadow)}
.alerts b{display:block;font:500 15px Heebo,sans-serif}
.alerts small{display:block;color:var(--dim);font-size:12.5px;line-height:1.5;margin-top:2px}
.abtn{flex:0 0 auto;text-decoration:none;background:var(--accent);color:#fff;border-radius:10px;
 padding:10px 16px;font:500 14px Heebo,sans-serif;white-space:nowrap}
button.abtn{border:0;cursor:pointer}
.skinrow{display:flex;gap:6px;flex:0 0 auto}
.skb{background:var(--sunk);color:var(--dim);border:1px solid var(--line);border-radius:10px;
 padding:9px 12px;font:500 13.5px Heebo,sans-serif;cursor:pointer;white-space:nowrap}
.skb[aria-pressed="true"]{background:var(--accent);color:#fff;border-color:var(--accent)}
.skb:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button.abtn[disabled]{opacity:.55}
.alerts.ok{border-color:var(--ok,#0B6B5E)}
.alerts.ok b::after{content:" ¹3";color:var(--ok,#0B6B5E)}
.codebox{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
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
.sent{display:flex;align-items:center;gap:11px;margin-top:12px;padding:12px 15px;border-radius:var(--r);
 background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);font-size:14px}
.sent .s-dot{width:11px;height:11px;flex:0 0 11px;border-radius:50%;background:var(--wait);
 animation:pulse 1.5s infinite}
.sent.done .s-dot{background:var(--green);animation:none}
/* While I am on his request the dot runs through every neon there is, so
   the card reads as alive and not as a note that was left behind. */
.sent.working .s-dot{width:14px;height:14px;flex-basis:14px;animation:neon 1.2s linear infinite}
@keyframes neon{0%{background:#39ff14;box-shadow:0 0 10px #39ff14}25%{background:#00f0ff;box-shadow:0 0 12px #00f0ff}
 50%{background:#ff2bd6;box-shadow:0 0 12px #ff2bd6}75%{background:#fff700;box-shadow:0 0 12px #fff700}100%{background:#39ff14;box-shadow:0 0 10px #39ff14}}
@media(prefers-reduced-motion:reduce){.sent.working .s-dot{animation:none;background:#39ff14}}
.peg{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px;margin-bottom:10px;box-shadow:var(--shadow);font-size:15px;line-height:1.5}
.peg .w{color:var(--dim);font-size:12px;margin-bottom:4px;font-variant-numeric:tabular-nums}
.peg b{display:inline-block;min-width:88px;color:var(--accent);font-weight:600}
.sent b{display:block;font:500 15px Heebo,sans-serif}
.sent small{display:block;color:var(--dim);font-size:12px;font-weight:300}
/* The big button he asked for, right under the microphone and in the same
   family: one wide pill in the Google colours, so it reads as a twin of the
   mic and not as another tile. */
/* An update that is waiting on him says so on the card, and carries the answer
   right there: the ready options, and the same voice, text, camera and file
   row as everywhere else. */
.peg.waiting{border-inline-start:4px solid var(--accent)}
.pask{margin-top:11px;padding-top:11px;border-top:1px dashed var(--line)}
.pask .q{font:800 15px Heebo,sans-serif;margin-bottom:9px}
.popts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.popts button{border:1px solid var(--line);background:var(--surface);color:var(--ink);
 border-radius:999px;padding:9px 15px;font:700 14px Heebo,sans-serif;cursor:pointer}
.popts button:active{transform:translateY(1px)}
.popts button[disabled]{opacity:.55;cursor:default}
.growbtn{width:100%;display:flex;align-items:center;gap:13px;margin:12px 0 2px;padding:16px 18px;
 border:0;border-radius:var(--r);cursor:pointer;text-align:start;color:#fff;font-family:Heebo,sans-serif;
 background:linear-gradient(120deg,#4285F4 0%,#34A853 38%,#FBBC05 70%,#EA4335 100%);
 box-shadow:0 10px 24px rgba(66,133,244,.32)}
.growbtn .gb-i{flex:0 0 auto;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;
 background:rgba(255,255,255,.22);font-size:22px}
.growbtn .gb-l{flex:1;min-width:0}
.growbtn b{display:block;font:800 17px Heebo,sans-serif}
.growbtn small{display:block;font-size:12.5px;opacity:.94;font-weight:300;margin-top:1px}
.growbtn .gb-c{flex:0 0 auto;min-width:32px;height:32px;border-radius:999px;display:grid;place-items:center;
 background:rgba(255,255,255,.28);font:800 15px Heebo,sans-serif;padding:0 9px}
.growbtn:active{transform:translateY(2px) scale(.99)}
.grow{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
 padding:14px 16px;margin-bottom:12px;box-shadow:var(--shadow)}
.grow .w{color:var(--dim);font-size:12.5px;margin-bottom:7px}
.grow div.l{margin-top:8px;font-size:15px;line-height:1.55}
.grow div.l b{display:block;font:800 13px Heebo,sans-serif;color:var(--accent);margin-bottom:2px}
.newbtn{width:100%;display:flex;align-items:center;gap:12px;margin:14px 0 10px;padding:15px 17px;
 border:0;border-radius:var(--r);cursor:pointer;text-align:start;color:#fff;font-family:Heebo,sans-serif;
 background:linear-gradient(150deg,#9aa5b8,#6b7688);box-shadow:0 8px 18px rgba(20,30,60,.16)}
.newbtn .nb-l{flex:1;min-width:0}
.newbtn b{display:block;font:800 17px Heebo,sans-serif}
.newbtn small{display:block;font-size:12px;opacity:.92;font-weight:300;margin-top:1px}
.newbtn:active{transform:translateY(2px) scale(.99)}
.newbtn .nb-c{flex:0 0 auto;min-width:34px;height:34px;border-radius:999px;display:grid;place-items:center;
 background:rgba(255,255,255,.25);font:800 16px Heebo,sans-serif;padding:0 9px}
.newbtn.hot{background:linear-gradient(150deg,#ff5570,#c5221f);
 outline:3px solid var(--red);outline-offset:3px;
 box-shadow:0 10px 26px rgba(234,67,53,.55);animation:nbeat 1.1s infinite}
.newbtn.hot b{font-size:20px}
.newbtn.hot .nb-c{background:#fff;color:var(--red);min-width:42px;height:42px;font-size:19px}
@keyframes nbeat{
 0%{box-shadow:0 10px 26px rgba(234,67,53,.5);transform:scale(1)}
 50%{box-shadow:0 14px 46px rgba(234,67,53,.95);transform:scale(1.02)}
 100%{box-shadow:0 10px 26px rgba(234,67,53,.5);transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.newbtn.hot{animation:none}}
/* He asked for a blink that cannot be missed. Two colours, no easing, twice a
   second, on the count and on the badges only, so the page itself stays
   readable while the thing that needs him flashes. */
@keyframes hardblink{
 0%,49%{background:var(--red);color:#fff;box-shadow:0 0 0 4px rgba(234,67,53,.55)}
 50%,100%{background:#fff;color:var(--red);box-shadow:0 0 0 4px rgba(255,255,255,.9)}}
.newbtn.hot .nb-c{animation:hardblink .5s steps(1) infinite}
.gt.glow .flag{animation:hardblink .5s steps(1) infinite}
.th-fresh>summary .badge{animation:hardblink .5s steps(1) infinite}
.bub.fresh .badge{animation:hardblink .5s steps(1) infinite}
.bn button.hasnew,.bn button.hasnew.blink{animation:hardblink .5s steps(1) infinite}
@media(prefers-reduced-motion:reduce){.newbtn.hot .nb-c,.gt.glow .flag,.th-fresh>summary .badge,.bub.fresh .badge,.bn button.hasnew,.bn button.hasnew.blink{animation:none}}
.whatsnew{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
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
 border-radius:var(--r);padding:14px 15px;box-shadow:var(--shadow)}
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
.dot{position:absolute;top:2px;inset-inline-end:4px;width:14px;height:14px;border-radius:50%;
 border:2px solid var(--surface);
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
.report summary .t{font-weight:600;font-size:15px}
.report summary:before{content:"";flex:0 0 auto;width:8px;height:8px;
 border-inline-start:2px solid var(--dim);border-block-end:2px solid var(--dim);
 transform:rotate(45deg);transition:transform .15s ease;margin-inline-end:2px}
.report[open] summary:before{transform:rotate(-45deg) translate(2px,2px);
 border-color:var(--accent)}
.report[open]{box-shadow:0 0 0 2px var(--accent-soft),var(--shadow)}
.report[open] summary{background:var(--accent-soft)}
.report:not([open]) summary:active{background:var(--sunk)}
.report summary .d{margin-inline-start:auto;color:var(--dim);font-size:13px;
 font-weight:300;font-variant-numeric:tabular-nums}
.report .text{padding:12px 14px 14px;font-size:15px;white-space:pre-wrap;
 overflow-wrap:anywhere;border-top:1px solid var(--line)}
.rephint{color:var(--dim);font-size:12.5px;margin-bottom:8px}
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
/* Unread is red and glowing, and it stays that way for days if that is how
   long it takes him to get to it. Touching it turns it green, which is his
   own mark that he dealt with it. */
.bootwarn{margin:0 0 12px;padding:12px 14px;border-radius:12px;border:2px solid var(--red);background:var(--unread);font-size:15px;line-height:1.5}
.bootwarn button{margin-inline-start:8px;padding:6px 14px;border:0;border-radius:999px;background:var(--red);color:#fff;font:inherit;font-size:14px}
.bub.fresh{border:3px solid var(--red);border-inline-start:10px solid var(--red);
 background:var(--unread);animation:bubglow 1.5s ease-in-out infinite}
.bub.fresh .badge{font-size:13px;padding:3px 12px}
@keyframes bubglow{
 0%,100%{box-shadow:0 8px 22px rgba(234,67,53,.35),0 0 0 0 rgba(234,67,53,.65)}
 55%{box-shadow:0 8px 22px rgba(234,67,53,.35),0 0 0 14px rgba(234,67,53,0)}
}
@media(prefers-reduced-motion:reduce){.bub.fresh{animation:none}}
.bub.touched{animation:none;border:2px solid var(--green);background:var(--fresh)}
.badge.ok{background:var(--green)}
.badge.latest{background:#fff;color:var(--red);font-size:14px;padding:3px 12px;border:2px solid var(--red)}
.bub.read{opacity:.72}
.badge{font-style:normal;font-weight:700;background:var(--red);color:#fff;
 padding:1px 8px;border-radius:999px;font-size:11px}
.bub a{color:inherit;text-decoration:underline;word-break:break-all}
.bub.pend{opacity:.6}
/* Answering one message and only that one. Every bubble carries its own row of
   three ways in, because he replies by voice, by writing or by sending a file
   depending on what he has in his hand at that moment. */
.rrow{display:flex;gap:7px;margin-top:9px;flex-wrap:wrap}
.rb{background:var(--surface);color:var(--accent);border:1px solid var(--line);
 border-radius:999px;padding:5px 12px;font:400 12.5px Heebo,sans-serif;cursor:pointer}
.rb:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.rb.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.rform{display:none;flex-direction:column;gap:7px;margin-top:8px}
.rform.open{display:flex}
.rform textarea{width:100%;min-height:56px;resize:vertical;background:var(--surface);
 color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:9px 11px;
 font:400 14px Heebo,sans-serif}
.rform button{align-self:flex-start;background:var(--accent);color:#fff;border:0;
 border-radius:9px;padding:7px 16px;font:500 13px Heebo,sans-serif;cursor:pointer}
.rsaid{font-size:12.5px;color:var(--accent)}
.answering{outline:2px solid var(--accent);outline-offset:2px}
/* The unread screen. Same bubbles, but nothing else on the page competes with
   them, and each one is full width because there is no thread to place it in. */
.ubox{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
.ubox .bub{max-width:100%;align-self:stretch}
/* One card per thread. Red until he touches it, amber while he waits on me,
   green once it is done. The number is its place in the list right now, so
   it changes when a reply lands and the card jumps up. */
.th{flex:none;background:var(--surface);border:2px solid var(--line);border-radius:var(--r);
 margin-bottom:12px;box-shadow:var(--shadow);overflow:hidden}
.th>summary{list-style:none;display:flex;align-items:center;gap:9px;flex-wrap:wrap;
 padding:12px 14px;cursor:pointer;font-size:15px}
.th>summary::-webkit-details-marker{display:none}
.th>summary b{flex:1 1 60%;min-width:0;font-weight:600;line-height:1.35}
.th>summary small{color:var(--dim);font-size:12px;font-variant-numeric:tabular-nums}
.th .num{flex:0 0 auto;min-width:30px;height:30px;border-radius:999px;display:grid;place-items:center;
 background:var(--sunk);color:var(--ink);font:800 14px Heebo,sans-serif;padding:0 8px}
.th .rcopyall{margin-inline-start:auto}
.thbody{display:flex;flex-direction:column;gap:9px;padding:0 14px 14px;border-top:1px solid var(--line)}
.thbody .bub{max-width:92%}
.th-fresh{border-color:var(--red);background:var(--unread);animation:bubglow 1.5s ease-in-out infinite}
.th-fresh .num{background:var(--red);color:#fff}
.th-standby{border-color:#d9a441;background:#fff8ea}
.th-standby .num{background:#f6e7c8;color:#8a5a12}
.th-done{border-color:var(--green)}
.th-done .num{background:var(--fresh);color:var(--green)}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .th-standby{background:#33290f}}
:root[data-theme="dark"] .th-standby{background:#33290f}
@media(prefers-reduced-motion:reduce){.th-fresh{animation:none}}
/* A light running around the thing he is working on. He asked to see that this
   one card, and nothing else, is what has his hand on it right now. */
.busyring{position:relative;isolation:isolate}
.busyring::after{
 content:'';position:absolute;inset:-4px;border-radius:inherit;padding:3px;
 background:conic-gradient(from var(--ang,0deg),transparent 0 62%,var(--accent) 78%,#7ad0ff 88%,transparent 96%);
 -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
 -webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
 mask-composite:exclude;animation:ringspin 1.25s linear infinite;pointer-events:none;z-index:2}
@property --ang{syntax:'<angle>';initial-value:0deg;inherits:false}
@keyframes ringspin{to{--ang:360deg}}
@media(prefers-reduced-motion:reduce){.busyring::after{animation:none;opacity:.5}}
.repreply{padding:0 14px 14px;border-top:1px solid var(--line);margin-top:2px}
.repreply .rrow{margin-top:12px}
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
/* He asked for the two buttons on the right and the name on the left, so the
   text block takes the leftover width and the avatar closes the row. */
.hdtext{flex:1 1 auto;text-align:end}
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
/* One vocabulary for every microphone: red while recording, amber while it is
   on its way to me, green when it landed, grey when it did not. */
#micBtn.sending,#micFab.sending,#recBtn.sending,#recBig.sending{
 background:linear-gradient(180deg,#ffd257,var(--yellow))!important;animation:none!important;opacity:1}
#micBtn.sent,#micFab.sent,#recBtn.sent,#recBig.sent{
 background:linear-gradient(180deg,#5cc36f,var(--green))!important;animation:none!important;opacity:1}
#micBtn.failed,#micFab.failed,#recBtn.failed,#recBig.failed{
 background:#5b6472!important;animation:none!important;opacity:1}
.foodtop{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.foodtop>div{background:var(--surface);border:1px solid var(--line);border-radius:14px;
 padding:12px 6px;text-align:center;box-shadow:var(--shadow)}
.foodtop span{display:block;font:800 22px Heebo,sans-serif;color:var(--accent)}
.foodtop small{display:block;color:var(--dim);font-size:11px;margin-top:2px}
.foodrow{margin-bottom:10px}
.foodcam{width:100%;min-height:56px;border:0;border-radius:18px;cursor:pointer;
 display:flex;align-items:center;justify-content:center;gap:10px;
 font:700 16px Heebo,sans-serif;color:#fff;
 background:linear-gradient(180deg,#5cc36f,var(--green));
 box-shadow:0 4px 12px rgba(52,168,83,.4),inset 0 1px 0 rgba(255,255,255,.35)}
.foodcam:active{background:linear-gradient(180deg,var(--green),#2b8c45);box-shadow:none;transform:translateY(1px)}
.foodcam span{font-size:22px}
.fitem{background:var(--surface);border:1px solid var(--line);border-radius:14px;
 padding:12px 14px;margin-bottom:8px;cursor:pointer}
.fitem .ft{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.fitem b{font:700 15px Heebo,sans-serif}
.fitem .kc{font:800 16px Heebo,sans-serif;color:var(--accent)}
.fitem .macros{color:var(--dim);font-size:12.5px;margin-top:4px}
.fitem .more{display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--line);
 color:var(--dim);font-size:13px;line-height:1.6;white-space:pre-wrap}
.fitem.open .more{display:block}
.quickrow{display:flex;gap:8px;margin-bottom:12px}
.quickrow input{flex:1;min-height:48px;border-radius:14px;padding:0 14px;
 border:1px solid var(--line);background:var(--surface);color:var(--ink);
 font:400 15px Heebo,sans-serif}
.quickrow button{flex:0 0 92px;min-height:48px;border:0;border-radius:999px;cursor:pointer;
 font:700 15px Heebo,sans-serif;color:#fff;
 background:linear-gradient(180deg,#6ea8ff,var(--blue));
 box-shadow:0 2px 6px rgba(66,133,244,.4),inset 0 1px 0 rgba(255,255,255,.3)}
.quickrow button:active{background:linear-gradient(180deg,var(--blue),#1b63d6);box-shadow:none}
.quickrow button[disabled]{opacity:.55}
.nextrep{display:flex;align-items:center;gap:12px;margin-bottom:12px;
 background:var(--surface);border:1px solid var(--line);border-radius:16px;
 padding:12px 14px;box-shadow:var(--shadow)}
.nextrep>div{flex:1}
.nextrep b{display:block;font:700 15px Heebo,sans-serif}
.nextrep small{display:block;color:var(--dim);font-size:12.5px;margin-top:2px}
.nextrep button{flex:0 0 auto;min-height:42px;padding:0 18px;border:0;border-radius:999px;
 cursor:pointer;font:700 14px Heebo,sans-serif;color:#fff;
 background:linear-gradient(180deg,#6ea8ff,var(--blue));
 box-shadow:0 2px 6px rgba(66,133,244,.4),inset 0 1px 0 rgba(255,255,255,.3)}
.nextrep button:active{background:linear-gradient(180deg,var(--blue),#1b63d6);box-shadow:none}
.nextrep button[disabled]{opacity:.55}
.ask{background:var(--surface);border:1px solid var(--line);border-radius:18px;
 padding:14px 16px;margin-bottom:12px;box-shadow:0 0 0 2px var(--gold),var(--shadow)}
.ask .q{font:700 15.5px Heebo,sans-serif;margin-bottom:4px}
.ask .sub{color:var(--dim);font-size:12px;margin-bottom:10px}
.ask .opts{display:flex;flex-wrap:wrap;gap:8px}
.ask .opts button{flex:1 1 44%;min-height:46px;border:0;border-radius:14px;cursor:pointer;
 font:700 14px Heebo,sans-serif;color:#fff;padding:0 12px;
 background:linear-gradient(180deg,#6ea8ff,var(--blue));
 box-shadow:0 2px 6px rgba(66,133,244,.4),inset 0 1px 0 rgba(255,255,255,.3)}
.ask .opts button:active{background:linear-gradient(180deg,var(--blue),#1b63d6);box-shadow:none}
.ask .opts button[disabled]{opacity:.5}
.grip{position:absolute;inset-inline-end:6px;top:6px;z-index:5;
 width:34px;height:34px;border-radius:10px;display:grid;place-items:center;
 font-size:17px;color:#fff;cursor:grab;touch-action:none;
 background:linear-gradient(180deg,#6ea8ff,var(--blue));
 box-shadow:0 2px 6px rgba(0,0,0,.35)}
#pH>.hasgrip{position:relative}
.editbar{position:fixed;z-index:90;inset-inline:0;bottom:0;display:flex;align-items:center;
 gap:12px;justify-content:space-between;
 padding:12px 16px calc(12px + env(safe-area-inset-bottom));
 background:color-mix(in srgb,var(--surface) 96%,transparent);
 border-top:1px solid var(--line);box-shadow:0 -8px 24px rgba(0,0,0,.25)}
.editbar span{font:600 14px Heebo,sans-serif;color:var(--dim)}
.editbar button{min-height:42px;padding:0 22px;border:0;border-radius:999px;cursor:pointer;
 font:700 15px Heebo,sans-serif;color:#fff;
 background:linear-gradient(180deg,#5cc36f,var(--green));
 box-shadow:0 2px 6px rgba(52,168,83,.4),inset 0 1px 0 rgba(255,255,255,.3)}
body.editing .editbox>*{animation:wobble .28s infinite alternate ease-in-out;
 touch-action:none;cursor:grab}
body.editing .bn{display:none}
@keyframes wobble{from{transform:rotate(-.5deg)}to{transform:rotate(.5deg)}}
@media(prefers-reduced-motion:reduce){body.editing .editbox>*{animation:none;
 outline:1px dashed var(--accent);outline-offset:3px}}
.stamp{text-align:center;color:var(--dim);font-size:11px;padding:10px 0 4px}
.toast{position:fixed;z-index:80;inset-inline:16px;bottom:calc(76px + env(safe-area-inset-bottom));
 margin-inline:auto;max-width:360px;text-align:center;
 background:var(--surface);border:1px solid var(--line);border-radius:16px;
 padding:14px 18px;font:600 15px Heebo,sans-serif;color:var(--ink);
 box-shadow:0 12px 30px rgba(0,0,0,.45)}
.toast.good{color:#fff;border:0;font:800 17px Heebo,sans-serif;
 background:linear-gradient(180deg,#5cc36f,var(--green));
 box-shadow:0 0 0 2px var(--gold),0 14px 34px rgba(52,168,83,.45)}
.toast.bad{color:#fff;border:0;background:linear-gradient(180deg,#ff6a5e,var(--red))}
.threadbar{display:flex;justify-content:flex-end;margin-bottom:8px}
.threadbar{gap:8px}
.cpall.pickon{color:#fff;background:linear-gradient(180deg,#5cc36f,var(--green));border-color:transparent}
.picking .bub{cursor:pointer}
.picking .bub:before{content:"";position:absolute;inset-inline-start:8px;top:10px;
 width:20px;height:20px;border-radius:6px;border:2px solid var(--line);background:var(--surface)}
.picking .bub{padding-inline-start:38px;position:relative}
.picking .bub.picked:before{background:var(--green);border-color:var(--green);
 content:"¹3";color:#fff;font:700 14px/17px Heebo,sans-serif;text-align:center}
.cpall.readold{background:var(--green);color:#fff;border-color:var(--green)}
.cpall{font:600 12.5px Heebo,sans-serif;color:var(--accent);cursor:pointer;
 background:var(--surface);border:1px solid var(--line);border-radius:999px;
 min-height:34px;padding:0 14px}
.cpall:active{background:var(--accent);color:#fff;border-color:var(--accent)}
.cp{margin-inline-start:8px;font:600 11px Heebo,sans-serif;color:var(--accent);
 background:transparent;border:1px solid var(--line);border-radius:999px;
 padding:2px 9px;cursor:pointer;vertical-align:middle}
.cp:active{background:var(--accent);color:#fff;border-color:var(--accent)}

/* The lock covers everything, so it is defined before the app it hides. */
.lock{display:none}
.locked .lock{display:grid;position:fixed;inset:0;z-index:99;
 place-items:center;padding:24px;background:var(--bg)}
.locked .wrap,.locked .micfab,.locked .bn,.locked .recwrap{display:none!important}
.lockbox{width:100%;max-width:340px;text-align:center;
 background:var(--surface);border:1px solid var(--line);border-radius:22px;
 padding:30px 22px;box-shadow:var(--shadow)}
.lockbox .em{font-size:44px;line-height:1;margin-bottom:12px}
.lockbox b{display:block;font:700 20px Heebo,sans-serif;margin-bottom:6px}
.lockbox small{display:block;color:var(--dim);font-size:13px;line-height:1.6;margin-bottom:18px}
.lockbox button{width:100%;min-height:48px;border:0;border-radius:999px;cursor:pointer;
 font:700 16px Heebo,sans-serif;color:#fff;
 background:linear-gradient(180deg,#6ea8ff,var(--blue));
 box-shadow:0 2px 8px rgba(66,133,244,.45),inset 0 1px 0 rgba(255,255,255,.35)}
.lockbox button:active{background:linear-gradient(180deg,var(--blue),#1b63d6);box-shadow:none}
.lockbox .alt{margin-top:10px;background:transparent;color:var(--accent);
 box-shadow:none;font-weight:500;font-size:14px;min-height:38px}
.lockrow{display:flex;gap:8px;margin-top:12px}
.lockrow input{flex:1;min-height:46px;text-align:center;border-radius:14px;
 border:1px solid var(--line);background:var(--bg);color:var(--ink);
 font:600 18px Heebo,sans-serif;letter-spacing:.3em}
.lockrow button{flex:0 0 92px}

.conn{margin-inline-start:auto;font:700 15px Heebo,sans-serif;color:#fff;
 background:linear-gradient(180deg,#5cc36f,var(--green));
 min-height:44px;padding:0 20px;border-radius:999px;border:0;cursor:pointer;
 box-shadow:0 2px 6px rgba(52,168,83,.4),inset 0 1px 0 rgba(255,255,255,.35)}
.conn:active{background:linear-gradient(180deg,var(--green),#2b8c45);box-shadow:none;transform:translateY(1px)}
.conn.arr{margin-inline-start:0;margin-inline-end:8px;
 background:linear-gradient(180deg,#6ea8ff,var(--blue));
 box-shadow:0 2px 6px rgba(66,133,244,.4),inset 0 1px 0 rgba(255,255,255,.35)}
.conn.arr:active{background:linear-gradient(180deg,var(--blue),#1b63d6)}
.conn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

.voice{display:flex;align-items:stretch;gap:12px;margin-bottom:14px}
.mic{width:98px;height:98px;flex:0 0 98px;border-radius:50%;border:0;padding:0;cursor:pointer;position:relative;
 display:grid;place-items:center;background:conic-gradient(from 0deg,var(--blue),var(--red),var(--yellow),var(--green),var(--blue));
 box-shadow:0 12px 28px rgba(66,133,244,.35)}
.mic:before{content:"";position:absolute;inset:6px;border-radius:50%;
 background:radial-gradient(circle at 34% 26%,#ffffff 0%,var(--surface) 42%,
  color-mix(in srgb,var(--surface) 82%,#000) 100%);
 box-shadow:inset 0 -6px 12px rgba(0,0,0,.18),inset 0 4px 8px rgba(255,255,255,.9)}
.mic:active{transform:translateY(2px) scale(.97)}
.mic{transition:transform .09s ease}
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

.row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 8px;padding:2px 2px 12px;
 justify-items:center}
.row::-webkit-scrollbar{display:none}
.ic{width:100%;display:flex;flex-direction:column;align-items:center;gap:5px;
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
.gt{border:0;text-align:start;cursor:pointer;border-radius:var(--r);padding:14px 15px;color:#fff;min-height:88px;
 position:relative;overflow:hidden;isolation:isolate;
 transition:transform .09s ease,box-shadow .09s ease,filter .09s ease;
 display:flex;flex-direction:column;justify-content:space-between;font-family:Heebo,sans-serif;
 text-shadow:0 1px 2px rgba(0,0,0,.28);
 box-shadow:0 10px 22px rgba(20,30,60,.22),
  inset 0 1px 0 rgba(255,255,255,.55),
  inset 0 -3px 8px rgba(0,0,0,.22),
  inset 0 0 0 1px rgba(255,255,255,.14)}
/* The sheen: a soft band of light across the upper half, like moulded plastic. */
.gt:after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;
 background:linear-gradient(180deg,rgba(255,255,255,.34) 0%,rgba(255,255,255,.10) 42%,
  rgba(255,255,255,0) 55%,rgba(0,0,0,.10) 100%)}
.gt:active{transform:translateY(2px) scale(.985);filter:saturate(1.15) brightness(.94);
 box-shadow:0 3px 8px rgba(20,30,60,.26),
  inset 0 2px 8px rgba(0,0,0,.32),
  inset 0 0 0 1px rgba(255,255,255,.10)}
.gt.dragging{opacity:.65;transform:scale(1.04);box-shadow:0 18px 34px rgba(0,0,0,.4)}
.gt.dragover{outline:2px dashed rgba(255,255,255,.75);outline-offset:-6px}
#pH>.dragging{opacity:.6;transform:scale(1.02);outline:2px solid var(--accent);
 outline-offset:4px;border-radius:16px}
#pH>.dragover{outline:2px dashed var(--accent);outline-offset:4px;border-radius:16px}
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
.g7{background:linear-gradient(150deg,#7bd88f,#1e8e4a)}
.g8{background:linear-gradient(150deg,#ffb74d,#e65100)}
.g9{background:linear-gradient(150deg,#f48fb1,#ad1457)}
.g10{background:linear-gradient(150deg,#ffe082,#f57f17)}
.g11{background:linear-gradient(150deg,#b9f6ca,#00897b)}
.g12{background:linear-gradient(150deg,#d1c4e9,#5e35b1)}
.g13{background:linear-gradient(150deg,#ffd27f,#ef6c00)}
/* The last thing he asked me for, sitting on the home screen itself. He could
   not find the print page through search and asked to have it pinned. */
.pin{background:linear-gradient(150deg,#fff4e0,#ffe3b8);border:1px solid #f0c987;
 border-radius:12px;padding:9px 12px;margin-top:9px;display:flex;align-items:center;gap:10px}
.pin .t{flex:1;min-width:0}
.pin .k{font:800 10.5px Heebo,sans-serif;color:#a35b00;letter-spacing:.3px}
.pin b{display:block;font:800 14px Heebo,sans-serif;color:#20242c;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pin a{flex:0 0 auto;background:#20242c;color:#fff;text-decoration:none;
 border-radius:999px;padding:8px 15px;font:800 13px Heebo,sans-serif}
/* The screen gets crowded. He asked me to notice which buttons he never uses,
   offer to take them off, and keep one button that remembers what we removed. */
.tidy{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
 padding:13px 15px;margin-top:14px;box-shadow:var(--shadow)}
.tidy b{display:block;font:800 15px Heebo,sans-serif;margin-bottom:4px}
.tidy small{display:block;color:var(--dim);font-size:13px;line-height:1.5;margin-bottom:10px}
.tidy .row2{display:flex;flex-wrap:wrap;gap:8px}
.tidy button{border:1px solid var(--line);background:var(--bg);color:var(--ink);
 border-radius:999px;padding:9px 16px;font:800 13.5px Heebo,sans-serif;cursor:pointer}
.tidy button.go{background:var(--ink);color:#fff;border-color:var(--ink)}
.backbar{display:block;width:100%;margin:0 0 14px;padding:12px 16px;border:0;cursor:pointer;
 border-radius:var(--r);background:var(--ink);color:#fff;font:800 15px Heebo,sans-serif;text-align:start}
.backbar:active{transform:translateY(1px)}
.gsearch{width:100%;margin:14px 0 0;padding:13px 16px;border:1px solid var(--line);border-radius:var(--r);
 background:var(--surface);color:var(--ink);font:400 15px Heebo,sans-serif}
.gres{margin-top:10px}
.gres .r{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
 padding:12px 14px;margin-bottom:9px;cursor:pointer}
.gres .r b{display:block;font:800 13px Heebo,sans-serif;color:var(--accent);margin-bottom:3px}
.gres .r small{display:block;color:var(--dim);font-size:12.5px;margin-bottom:4px}
.gres .r span{display:block;font-size:14.5px;line-height:1.5}
.gres .none{color:var(--dim);font-size:14px;padding:8px 2px}
.spec{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
 padding:14px 16px;margin-bottom:12px;box-shadow:var(--shadow)}
.spec .w{color:var(--dim);font-size:12.5px}
.spec b{display:block;font:800 16px Heebo,sans-serif;margin:4px 0 3px}
.spec small{display:block;color:var(--dim);font-size:13.5px;line-height:1.5}
.cptext{background:var(--bg);border:1px dashed var(--line);border-radius:10px;
 padding:11px 13px;margin-top:10px;font-size:15px;line-height:1.6;white-space:pre-wrap}
.cpbtn{display:inline-block;margin-top:10px;margin-inline-end:8px;border:1px solid var(--line);
 background:var(--surface);color:var(--ink);border-radius:999px;padding:10px 18px;
 font:800 14px Heebo,sans-serif;cursor:pointer}
.spec a{display:inline-block;margin-top:10px;background:#1a73e8;color:#fff;text-decoration:none;
 border-radius:999px;padding:10px 18px;font:800 14px Heebo,sans-serif}
/* A tile with something waiting inside it. He asked for the screen to tell him
   where to look: the reports tile when a report he has not opened is up, the
   pill tile when a dose is due. It stops the moment he opens that screen. */
@keyframes tileglow{
 0%,100%{box-shadow:0 10px 22px rgba(20,30,60,.22),0 0 0 0 rgba(234,67,53,.5),
  inset 0 1px 0 rgba(255,255,255,.55),inset 0 -3px 8px rgba(0,0,0,.22)}
 55%{box-shadow:0 10px 22px rgba(20,30,60,.22),0 0 0 9px rgba(234,67,53,0),
  inset 0 1px 0 rgba(255,255,255,.55),inset 0 -3px 8px rgba(0,0,0,.22)}
}
.gt.glow{animation:tileglow 2.1s ease-out infinite}
.gt .flag{position:absolute;top:9px;inset-inline-end:11px;background:var(--red);color:#fff;
 font:700 10.5px Heebo,sans-serif;padding:2px 8px;border-radius:999px;text-shadow:none}
@media(prefers-reduced-motion:reduce){.gt.glow{animation:none}}
/* On air. He asked to see that someone is actually working, and that an answer
   can land on its own without waiting for the other nine. The strip talks to
   version.json every forty seconds, so it moves while the page stays put. */
.live{display:flex;align-items:center;gap:11px;padding:13px 18px;margin:0 0 14px;
 background:var(--surface);border:1px solid var(--line);border-radius:18px;
 font-size:16px;box-shadow:var(--shadow)}
.live b{font-weight:500;font-size:17px}
.live.busy{border-color:var(--red);box-shadow:0 8px 20px rgba(234,67,53,.18)}
.live span:last-child{color:var(--dim);font-weight:300;margin-inline-start:auto;
 font-size:13.5px;text-align:end;font-variant-numeric:tabular-nums}
.live .pulse{width:13px;height:13px;flex:0 0 13px;border-radius:50%;background:var(--green);
 box-shadow:0 0 0 0 rgba(52,168,83,.55);animation:onair 2s infinite}
.live.busy .pulse{background:var(--red);box-shadow:0 0 0 0 rgba(234,67,53,.55)}
@keyframes onair{
 0%{box-shadow:0 0 0 0 rgba(52,168,83,.5)}
 70%{box-shadow:0 0 0 11px rgba(52,168,83,0)}
 100%{box-shadow:0 0 0 0 rgba(52,168,83,0)}
}
@media(prefers-reduced-motion:reduce){.live .pulse{animation:none}}
/* The idea list. Each one is a real thing the screen could do, with a button
   that asks for it, because a new user does not know what to ask for until he
   sees a sentence that describes his own week. */
.idea{background:var(--surface);border:1px solid var(--line);border-radius:14px;
 padding:15px 17px;margin-bottom:11px;box-shadow:var(--shadow)}
.idea b{display:block;font-size:16px;font-weight:500;margin-bottom:4px}
.idea p{margin:0 0 11px;font-size:14px;color:var(--dim);font-weight:300;line-height:1.6}
.idea button{background:var(--accent);color:#fff;border:0;border-radius:9px;
 padding:8px 17px;font:500 13.5px Heebo,sans-serif;cursor:pointer}
.idea button.done{background:var(--green)}
.ideahead{font-size:13.5px;color:var(--dim);font-weight:300;margin-bottom:14px;line-height:1.65}
.opcard{background:var(--surface);border:1px solid var(--line);border-radius:18px;
 padding:6px 16px;margin-bottom:14px;box-shadow:var(--shadow)}
.opline{display:flex;justify-content:space-between;gap:12px;align-items:baseline;
 padding:12px 0;border-bottom:1px solid var(--line)}
.opline:last-child{border-bottom:0}
.opline span{color:var(--dim);font-size:13px;flex:0 0 auto}
.opline b{font:700 15px Heebo,sans-serif;text-align:end}
.note-i{background:var(--surface);border:1px solid var(--line);border-radius:14px;
 padding:12px 14px;margin-bottom:8px;font-size:14.5px;line-height:1.6;
 white-space:pre-wrap;cursor:pointer}
.note-i small{display:block;color:var(--dim);font-size:11.5px;margin-top:4px}
.lolos{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
.lbtn{display:flex;align-items:center;gap:12px;text-align:start;cursor:pointer;
 border:0;border-radius:18px;padding:14px 16px;color:#fff;text-decoration:none;
 position:relative;overflow:hidden;isolation:isolate;
 text-shadow:0 1px 2px rgba(0,0,0,.28);
 box-shadow:0 8px 18px rgba(20,30,60,.2),inset 0 1px 0 rgba(255,255,255,.5),
  inset 0 -3px 8px rgba(0,0,0,.2)}
.lbtn:after{content:"";position:absolute;inset:0;z-index:-1;
 background:linear-gradient(180deg,rgba(255,255,255,.3),rgba(255,255,255,0) 55%,rgba(0,0,0,.1))}
.lbtn:active{transform:translateY(2px) scale(.99);box-shadow:0 3px 8px rgba(20,30,60,.26),
 inset 0 2px 8px rgba(0,0,0,.3)}
.lbtn span{font-size:26px;line-height:1}
.lbtn b{display:block;font:700 16px Heebo,sans-serif}
.lbtn small{font-size:11.5px;opacity:.93;font-weight:300}
.lb-riv{background:linear-gradient(150deg,#ffb74d,#e65100)}
.lb-cal{background:linear-gradient(150deg,#5aa9fb,var(--blue))}
.lb-x{background:linear-gradient(150deg,#b39ddb,#5e35b1)}

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

/* ===== my answers ===== */
.achips{display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 12px}
.achip{background:var(--surface);border:1px solid var(--line);border-radius:999px;
 padding:8px 14px;font:500 13.5px Heebo,sans-serif;color:var(--dim);cursor:pointer}
.achip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.achip b{font-weight:800}
.asearch{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:12px;
 padding:12px 14px;font:400 15px Heebo,sans-serif;color:var(--ink);margin-bottom:14px}
.ansc{background:var(--surface);border:1px solid var(--line);border-radius:16px;
 padding:13px 15px;margin-bottom:12px;box-shadow:var(--shadow);line-height:1.75;
 border-inline-start:5px solid var(--line)}
.ansc.fresh{border-inline-start-color:var(--red)}
.ansc.done{border-inline-start-color:var(--green)}
.ansc.star{border-inline-start-color:var(--yellow)}
.ansc .w{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--dim);
 font:500 12.5px Heebo,sans-serif;margin-bottom:7px}
.ansc .atxt{white-space:pre-wrap;word-break:break-word}
.arow{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}
.ab{background:var(--sunk);border:1px solid var(--line);border-radius:10px;padding:9px 13px;
 font:500 13px Heebo,sans-serif;color:var(--ink);cursor:pointer}
.ab.on{background:var(--accent);border-color:var(--accent);color:#fff}
.aempty{color:var(--dim);text-align:center;padding:26px 10px;font-weight:300}
.asaid{display:block;color:var(--green);font-size:12.5px;margin-top:7px;min-height:16px}
.bn .cnt{position:absolute;top:-2px;inset-inline-end:0;min-width:19px;height:19px;
 border-radius:10px;background:var(--red);color:#fff;font:800 11px/19px Heebo,sans-serif;
 text-align:center;padding:0 5px;font-style:normal}
.bn .cnt.zero{background:var(--line);color:var(--dim)}
/* ===== bottom nav ===== */
.micfab{position:fixed;left:16px;
 bottom:calc(84px + env(safe-area-inset-bottom));z-index:40;opacity:.95;touch-action:none;
 width:82px;height:82px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;
 background:conic-gradient(from 0deg,var(--blue),var(--red),var(--yellow),var(--green),var(--blue));
 box-shadow:0 10px 24px rgba(0,0,0,.35)}
.micfab:before{content:"";position:absolute;inset:6px;border-radius:50%;
 background:radial-gradient(circle at 34% 26%,#ffffff 0%,var(--surface) 44%,
  color-mix(in srgb,var(--surface) 80%,#000) 100%);
 box-shadow:inset 0 -6px 12px rgba(0,0,0,.2),inset 0 4px 8px rgba(255,255,255,.85)}
.micfab svg{position:relative;z-index:1;width:38px;height:38px;stroke:var(--ink)}
.micfab svg rect{fill:var(--ink)}
.micfab{box-shadow:0 0 0 3px rgba(66,133,244,.28),0 0 26px 6px rgba(66,133,244,.45),
 0 10px 26px rgba(0,0,0,.45)}
.micfab.on{background:var(--red);animation:mpulse 1.1s infinite;opacity:1;
 box-shadow:0 0 0 3px rgba(234,67,53,.32),0 0 34px 10px rgba(234,67,53,.55),
 0 10px 26px rgba(0,0,0,.45)}
.micfab.sending{box-shadow:0 0 0 3px rgba(251,188,5,.32),0 0 30px 8px rgba(251,188,5,.5),
 0 10px 26px rgba(0,0,0,.45)}
.micfab.sent{box-shadow:0 0 0 3px rgba(52,168,83,.35),0 0 34px 10px rgba(52,168,83,.55),
 0 10px 26px rgba(0,0,0,.45)}
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
/* The question before the count starts. He reports late sometimes, and eight
   hours from the tap would drift the next dose. So the tap asks first. */
.sheet{margin-top:14px;padding:14px 16px;border-radius:var(--r);background:var(--surface);
 border:2px solid var(--accent);box-shadow:var(--shadow);display:flex;flex-direction:column;gap:10px}
.sheet b{font:600 16px Heebo,sans-serif;line-height:1.45}
.sheetrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sheetrow label{font-size:13px;color:var(--dim)}
.sheet input[type=time]{font:500 18px Heebo,sans-serif;padding:8px 12px;border-radius:12px;
 border:1px solid var(--line);background:var(--sunk);color:var(--ink)}
.sbtn{border:1px solid var(--line);background:var(--sunk);color:var(--ink);border-radius:999px;
 padding:9px 16px;font:500 14px Heebo,sans-serif;cursor:pointer}
.sbtn.main{background:var(--accent);color:#fff;border-color:var(--accent)}
.sbtn.quiet{align-self:flex-start;background:transparent;color:var(--dim)}
.pillinfo{margin-top:20px;font-size:16px;color:var(--ink);line-height:1.9}
.pillinfo b{display:block;font:800 22px Heebo,sans-serif;color:var(--accent)}
.pillinfo small{display:block;color:var(--dim);font-size:13px;font-weight:300}
/* He talks to me about a message he is looking at, so the recorder must not
   cover it. It floats at the bottom and lets the screen show through, and it
   ignores taps everywhere except on its own buttons. */
.recwrap{position:fixed;inset:0;z-index:60;display:grid;align-items:end;justify-items:center;
 padding-bottom:calc(78px + env(safe-area-inset-bottom));background:transparent;pointer-events:none}
.recbox{width:min(340px,88vw);background:color-mix(in srgb,var(--surface) 78%,transparent);
 backdrop-filter:blur(9px);border:1px solid var(--line);border-radius:26px;padding:16px 20px 14px;
 text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.35);pointer-events:auto}
.rectitle{font:700 20px Heebo,sans-serif;color:var(--ink)}
.rectime{font:800 30px "Frank Ruhl Libre",Georgia,serif;color:var(--red);
 font-variant-numeric:tabular-nums;margin:6px 0 16px}
.recbig{width:96px;height:96px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;
 background:linear-gradient(180deg,#ff6b84,var(--red));
 box-shadow:0 14px 34px rgba(234,67,53,.5),inset 0 3px 0 rgba(255,255,255,.45);
 animation:mpulse 1.2s infinite}
.recbig svg{width:38px;height:38px}
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
/* The emoji row was the one part of the screen that looked like a default.
   These are drawn instead: same stroke weight as the rest of the app, and
   they take the button's own colour, so the selected tab colours its icon. */
.bn button svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.7;
 stroke-linecap:round;stroke-linejoin:round}
.bn button[aria-pressed="true"] svg{stroke-width:2}
/* Something new on a screen he is not looking at. The tab breathes until he
   opens it, and stops the moment he does. */
@keyframes tabnudge{
 0%,100%{transform:translateY(0)}
 50%{transform:translateY(-3px)}
}
.bn button.hasnew svg{animation:tabnudge 1.8s ease-in-out infinite}
.bn button.hasnew{color:var(--red)}
.bn button[aria-pressed="true"].hasnew{color:#fff}
@media(prefers-reduced-motion:reduce){.bn button.hasnew svg{animation:none}}
.bn button[aria-pressed="true"]{color:#fff;background:linear-gradient(150deg,#5aa9fb,var(--blue));
 border-radius:14px;box-shadow:0 5px 12px rgba(66,133,244,.35)}
.bn button:active{transform:scale(.94)}
.bn button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:10px}

</style>
<script>
/* Runs before the body exists on purpose. A skin applied after first paint is a
   white flash on a phone at night, and that flash is the whole complaint. */
(function(){try{
 var t=localStorage.getItem('skin')||'';
 if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);
}catch(e){}})();
</script>
</head>
<body>
<div class="lock" id="lockWrap">
 <div class="lockbox">
  <div class="em" aria-hidden="true">&#128274;</div>
  <b>המוניטור נעול</b>
  <small id="lockSaid">מזדהים כדי להיכנס.</small>
  <button type="button" id="lockFace">כניסה בזיהוי פנים</button>
  <div class="lockrow" id="lockRow" hidden>
   <input type="password" id="lockCode" inputmode="numeric" autocomplete="off" placeholder="הקוד">
   <button type="button" id="lockGo">כניסה</button>
  </div>
  <button type="button" class="alt" id="lockUseCode">כניסה עם הקוד</button>
 </div>
</div>
<script>
// This runs before the page is painted on purpose. Itzik asked for the lock to
// be the first thing on screen, not something that appears a moment later over
// content that was already readable. Nothing here can wait for the main script.
(function(){try{
 if(localStorage.getItem('lockOn')==='1'
   &&(localStorage.getItem('faceCred')||localStorage.getItem('monitorCode'))){
  document.documentElement.className+=' locked';
 }
}catch(e){}})();
</script>
<div class="wrap">
<header class="hd">
 <button type="button" class="conn arr" id="arrangeBtn" title="סידור המסך">סידור</button>
 <button type="button" class="conn" id="reloadBtn" title="טעינה מחדש">רענון</button>
 <div class="hdtext">
  <div class="t">אבא איציק בבנייה עצמית</div>
  <div class="s" id="built"></div>
  <div class="gold">המוניטור בונה את עצמו</div>
 </div>
 <div class="ava" aria-hidden="true"><div>א</div></div>
</header>

<section id="pH">
 <button type="button" id="newBtn" class="newbtn">
  <span class="nb-l"><b id="nbTitle">מה חדש</b><small id="nbSub"></small></span>
  <span class="nb-c" id="nbCount">0</span>
 </button>
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

 <button type="button" id="growBtn" class="growbtn">
  <span class="gb-i" aria-hidden="true">✨</span>
  <span class="gb-l"><b>איך אני משתפר</b><small>מה פיספסתי, מה תיקנתי, ומה זה משנה לך</small></span>
  <span class="gb-c" id="growCount">0</span>
 </button>

  <div class="sent" id="sentCard" hidden></div>
<section class="whatsnew" aria-label="מה חדש">
  <div class="wn" id="wnCmds"></div>
  <div class="wn" id="wnNow"></div>
 </section>

<div class="tiles">
 <div class="tile wait"><div class="k">ממתין לתשובה</div><div class="v" id="tP">0</div></div>
 <div class="tile"><div class="k">נענה היום</div><div class="v" id="tT">0</div></div>
 <div class="tile wait"><div class="k">לידים פתוחים</div><div class="v" id="tL">0</div></div>
</div>

 <div id="askBox"></div>
 <div class="grid" id="blkTiles">
  <button type="button" class="gt g1" id="gChat"><b>💬 פנייה אליי</b><small>צ׳אט, קול, קובץ</small></button>
  <button type="button" class="gt g2" id="gMail"><b>📧 מייל</b><small>בקשה, ואני מחזיר תשובה</small></button>
  <button type="button" class="gt g3" id="gQueue"><b>📊 ניטור רשתות</b><small>מי פנה, מה נענה</small></button>
  <button type="button" class="gt g4" id="gReports"><b>📄 דוחות</b><small>סיכומי הסבבים</small></button>
  <button type="button" class="gt g5" id="gPill"><b>⏰ לקחתי כדור</b><small>מסמן את המנה ומעדכן אותי</small></button>
  <button type="button" class="gt g6" id="gCam"><b>📷 שלח לי תמונה</b><small>נפתחת המצלמה ומצלמים</small></button>
  <button type="button" class="gt g7" id="gFood"><b>🥗 עקוב אחרי התזונה</b><small>מצלמים או כותבים, ואני מחשב</small></button>
  <button type="button" class="gt g8" id="gLolos"><b>🧾 הנהלת חשבונות</b><small>חשבוניות והיומן</small></button>
  <button type="button" class="gt g9" id="gOp"><b>🏥 ניתוח</b><small>מתי, איפה, ומה צריך</small></button>
  <button type="button" class="gt g10" id="gNotes"><b>📝 פתקים</b><small>נכתב, נשמר, לא הולך לאיבוד</small></button>
  <button type="button" class="gt g11" id="gIdeas"><b>💡 רעיונות</b><small>מה עוד המסך הזה יכול לעשות</small></button>
  <button type="button" class="gt g12" id="gPegasus"><b>🐴 פגסוס</b><small>מה נעשה, מה קורה, מה מתוכנן</small></button>
  <button type="button" class="gt g13" id="gSpecial"><b>⭐ בקשות מיוחדות</b><small>מה שביקשת ומוכן, דפים וקבצים</small></button>
 </div>

 <div id="tidyBox"></div>
 <div id="pinBox"></div>

 <input type="search" id="gSearch" class="gsearch" autocomplete="off"
  placeholder="חיפוש בכל מה שכתבתי לך, למשל ראש השנה">
 <div class="gres" id="gResults"></div>

 <div class="row" id="blkIcons" role="group" aria-label="קיצורים">
  <a class="ic" data-net="youtube" href="https://studio.youtube.com/" target="_blank" rel="noopener"><span class="c c-yt">
   <svg viewBox="0 0 24 24"><path fill="#fff" d="M10 8.5v7l6-3.5z"/></svg></span>יוטיוב</a>
  <a class="ic" data-net="tiktok" href="https://www.tiktok.com/@abaitzik" target="_blank" rel="noopener"><span class="c c-tt">
   <svg viewBox="0 0 24 24"><path fill="#fff" d="M13 3h3a4 4 0 0 0 4 4v3a7 7 0 0 1-4-1.3V15a5.5 5.5 0 1 1-5.5-5.5c.3 0 .6 0 .9.1v3.1a2.5 2.5 0 1 0 1.6 2.3z"/></svg></span>טיקטוק</a>
  <a class="ic" data-net="facebook" href="https://www.facebook.com/lolos.lolo.90" target="_blank" rel="noopener"><span class="c c-fb">
   <svg viewBox="0 0 24 24"><path fill="#fff" d="M13.5 21v-7h2.4l.4-3h-2.8V9.2c0-.9.3-1.5 1.5-1.5h1.5V5.1c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8V11H8v3h2.6v7z"/></svg></span>פייסבוק</a>
  <a class="ic" data-net="instagram" href="https://www.instagram.com/abaitzik/" target="_blank" rel="noopener"><span class="c c-ig">
   <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r="1" fill="#fff" stroke="none"/></svg></span>אינסטגרם</a>
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




<div class="install" id="installHint">להתקנה כאפליקציה על מסך הבית: בספארי לוחצים שיתוף ואז "הוספה למסך הבית". באנדרואיד: תפריט ואז "התקנת אפליקציה".</div>

<nav class="links" aria-label="קישורים מהירים">
 <a href="plan.html">
  <span aria-hidden="true">&#128736;</span>
  <div>תכנון 2.0<small>מה נבנה ומה עוד מתוכנן</small></div>
 </a>
</nav>

<div class="alerts" id="alerts">
 <div>
  <b>התראות לנייד</b>
  <small>מתקינים את האפליקציה ntfy, לוחצים על הכפתור, ובוחרים Subscribe. מאז כל תשובה שלי קופצת כמו וואטסאפ.</small>
 </div>
 <a class="abtn" id="ntfyBtn" href="https://ntfy.sh/abaitzik-cf9044bdcfa8" target="_blank" rel="noopener">הפעלת התראות</a>
</div>
<div class="alerts" id="pingBox">
 <div>
  <b>בדיקת חיבור</b>
  <small id="pingSaid">לוחצים, ההודעה יוצאת אליי, והשורה הזאת אומרת מה עבר ומתי חזרתי.</small>
 </div>
 <button type="button" class="abtn" id="pingBtn">בדיקה</button>
</div>
<div class="alerts" id="skinBox">
 <div>
  <b>צבע המסך</b>
  <small id="skinSaid">אפשר להשאיר על מה שהטלפון מחליט, או לקבוע בעצמך.</small>
 </div>
 <div class="skinrow" role="group" aria-label="צבע המסך">
  <button type="button" class="skb" data-skin="auto">הטלפון</button>
  <button type="button" class="skb" data-skin="light">לבן</button>
  <button type="button" class="skb" data-skin="dark">שחור</button>
 </div>
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
 <div class="facerow">
  <button type="button" id="lockToggle">נעילה בפתיחה</button>
  <span id="lockState"></span>
 </div>
 <div class="msgsaid" id="codeSaid"></div>
</div>
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

<section id="pS" hidden>
 <h2>ניתוח</h2>
 <div class="opcard">
  <div class="opline"><span>מתי</span><b id="opWhen">יום ראשון הקרוב</b></div>
  <div class="opline"><span>אשפוז</span><b>במוצאי החג, הערב שלפני</b></div>
  <div class="opline"><span>איפה</span><b>בניין אריסון, קומה 5, כירורגית א׳</b></div>
  <div class="opline"><span>שעה</span><b>16:00</b></div>
 </div>
 <div class="msgsaid" id="opSaid"></div>
 <form class="quickrow" id="opForm">
  <input type="text" id="opText" autocomplete="off" placeholder="להוסיף פרט או לתקן">
  <button type="submit" id="opBtn">שליחה</button>
 </form>
 <div id="opList"></div>
</section>

<section id="pN2" hidden>
 <h2>פתקים</h2>
 <form class="quickrow" id="noteForm">
  <input type="text" id="noteText" autocomplete="off" placeholder="פתק חדש">
  <button type="submit" id="noteBtn">הוספה</button>
 </form>
 <div id="noteList"></div>
 <div class="hint">הפתקים נשמרים במכשיר הזה. לחיצה ארוכה על פתק מוחקת אותו.</div>
</section>

<section id="pU" hidden>
 <h2>מה שלא קראת</h2>
 <div class="ubox" id="unreadBox"></div>
 <div class="hint">נגיעה בהודעה מסמנת שקראת אותה והופכת אותה לירוקה. מה שנשאר אדום עוד מחכה לך.</div>
</section>

<section id="pA" hidden>
 <h2>התשובות שלי</h2>
 <div class="achips" id="aChips"></div>
 <input type="search" id="aSearch" class="asearch" autocomplete="off" placeholder="חיפוש בתוך התשובות">
 <div id="ansBox"></div>
 <div class="hint">כאן שמורות כל התשובות שלי, גם אחרי שקראת אותן. כלום לא נעלם מכאן. אדום זה מה שלא קראת, ירוק זה מה שסימנת כטופל, וצהוב זה מה ששמת עליו כוכב.</div>
</section>

<section id="pI" hidden>
 <h2>רעיונות</h2>
 <div class="ideahead">אלה דברים שהמסך הזה כבר יודע לעשות או שאני יכול לבנות. לחיצה על "רוצה את זה" שולחת לי את הבקשה, ואני בונה ומעדכן.</div>
 <div id="ideaList"></div>
 <form class="quickrow" id="ideaForm">
  <input type="text" id="ideaText" autocomplete="off" placeholder="רעיון משלך">
  <button type="submit" id="ideaBtn">שליחה</button>
 </form>
 <div class="msgsaid" id="ideaSaid"></div>
</section>

<section id="pL2" hidden>
 <h2>הנהלת חשבונות</h2>
 <div class="lolos">
  <a class="lbtn lb-riv" href="https://online.rivhit.co.il/" target="_blank" rel="noopener">
   <span aria-hidden="true">&#129534;</span>
   <div><b>ריווחית אונליין</b><small>חשבוניות, קבלות, לקוחות ויתרות</small></div>
  </a>
  <a class="lbtn lb-cal" href="https://calendar.google.com/calendar/r" target="_blank" rel="noopener">
   <span aria-hidden="true">&#128197;</span>
   <div><b>היומן</b><small>הפגישות וההזמנות</small></div>
  </a>
  <button type="button" class="lbtn lb-x" id="lolosAsk">
   <span aria-hidden="true">&#128269;</span>
   <div><b>בקשת הצלבה</b><small>תשאל אותי מה להצליב ואני בודק</small></div>
  </button>
 </div>
 <div class="hint">
  ריווחית מחוברת דרך אסימון ולא דרך סיסמה. כשתוציא אותו מההגדרות של ריווחית,
  אני אוכל למשוך משם נתונים ולהצליב אותם בלי להיכנס לחשבון בכלל.
 </div>
</section>

<section id="pF" hidden>
 <h2>עקוב אחרי התזונה</h2>
 <div class="foodtop">
  <div><span id="fdKcal">0</span><small>קלוריות היום</small></div>
  <div><span id="fdP">0</span><small>חלבון</small></div>
  <div><span id="fdC">0</span><small>פחמימות</small></div>
  <div><span id="fdF">0</span><small>שומן</small></div>
 </div>
 <div class="foodrow">
  <button type="button" class="foodcam" id="fdCam">
   <span aria-hidden="true">&#128247;</span>צילום של מה שאכלת</button>
  <input type="file" id="fdPick" accept="image/*" capture="environment" hidden>
 </div>
 <form class="quickrow" id="fdForm">
  <input type="text" id="fdText" autocomplete="off" placeholder="או תכתוב לי מה אכלת">
  <button type="submit" id="fdBtn">שליחה</button>
 </form>
 <div class="msgsaid" id="fdSaid"></div>
 <div id="fdList"></div>
 <div class="hint">
  שולחים תמונה או שורה, ואני מחזיר ערך קלורי, חלבון, פחמימות ושומן.
  לחיצה על פריט פותחת את הפירוט המלא.
 </div>
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
  <div class="sheet" id="pillSheet" hidden>
   <b id="pillQ">השעה עכשיו. לקחת את הכדור מוקדם יותר?</b>
   <div class="sheetrow">
    <button type="button" id="pillNow" class="sbtn main">לא, עכשיו</button>
    <button type="button" id="pillEarlier" class="sbtn">כן, בשעה אחרת</button>
   </div>
   <div class="sheetrow" id="pillTimeRow" hidden>
    <label for="pillTime">השעה שבה לקחת</label>
    <input type="time" id="pillTime">
    <button type="button" id="pillOk" class="sbtn main">אישור</button>
   </div>
   <button type="button" id="pillCancel" class="sbtn quiet">ביטול</button>
  </div>
 </div>
</section>

<section id="pG" hidden>
 <h2>דפי נחיתה</h2>
 <div id="landList"></div>
</section>

<section id="pY" hidden>
 <h2>בקשות מיוחדות</h2>
 <div class="rephint">מה שביקשת ואני הכנתי, עם קישור ישיר. החדש למעלה.</div>
 <div id="specBox"></div>
</section>

<section id="pW" hidden>
 <h2>איך אני משתפר</h2>
 <div class="rephint">כל שורה היא דבר אחד שיצא לי לא טוב ומה שיניתי בעקבות זה. החדש למעלה.</div>
 <div id="growBox"></div>
</section>

<section id="pX" hidden>
 <h2>פגסוס</h2>
 <div class="rephint">עדכונים קצרים מהסשן של המשחק. לדבר איתי על זה כאן למטה.</div>
 <div id="pegBox"></div>
</section>

<section id="pR" hidden>
 <h2>דוחות הסבבים</h2>
 <div class="nextrep">
  <div><b id="repNext">הדוח הבא</b><small id="repWhen"></small></div>
  <button type="button" id="repNow">דוח עכשיו</button>
 </div>
 <div class="msgsaid" id="repSaid"></div>
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
 <div class="threadbar">
  <button type="button" id="pickMode" class="cpall">בחירת הודעות</button>
  <button type="button" id="copyPicked" class="cpall pickon" hidden>העתקת הנבחרות</button>
  <button type="button" id="copyAll" class="cpall">העתקת כל השיחה</button>
  <button type="button" id="readOld" class="cpall readold">קראתי את הישנות</button>
 </div>
 <div class="thread" id="thread"></div>
 <form id="msgForm">
  <textarea id="msgText" rows="2"
   placeholder="כתוב כאן. בקשה, תשובה, או כל דבר שבא לך שאדע"></textarea>
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

</section>

<button type="button" id="micFab" class="micfab" aria-label="דבר אליי">
 <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="9" y="3" width="6" height="11" rx="3" fill="#fff" stroke="none"/>
  <path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M8.5 21h7"/>
 </svg>
</button>

<div class="editbar" id="editBar" hidden>
 <span>סידור המסך. גרור מה שתרצה.</span>
 <button type="button" id="swapBlocks">החלפה בין הריבועים לעיגולים</button>
 <button type="button" id="editDone">סיום</button>
</div>

<div class="toast" id="toast" role="status" hidden></div>

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
 <button type="button" id="nH" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.5V20h12v-9.5"/><path d="M10 20v-5h4v5"/></svg>בית</button>
 <button type="button" id="nM" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12.5c0 3.9-3.6 7-8 7a9 9 0 0 1-2.6-.4L5 21l1.2-3.3A6.7 6.7 0 0 1 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z"/></svg>צ׳אט<i class="dot" id="mDot" hidden></i></button>
 <button type="button" id="nQ" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"/><path d="M7 19v-6"/><path d="M12 19V7"/><path d="M17 19v-9"/></svg>רשתות</button>
 <button type="button" id="nL" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>לידים<i class="dot" id="lDot" hidden></i></button>
 <button type="button" id="nR" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8L18.5 8v12.5h-13Z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 13h7M8.5 16.5h4.5"/></svg>דוחות<i class="dot" id="rDot" hidden></i></button>
 <button type="button" id="nA" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v11h-9l-5 3.5v-3.5H4Z"/><path d="M8 10.5h8M8 14h5"/></svg>תשובות<i class="cnt zero" id="aCnt">0</i></button>
</nav>

<div class="stamp"><span id="built"></span></div>
</div>

<script>__LIB__</script>
<script>
var D = __DATA__, NET = __NET__, CAT = __CAT__, tab = 'pending';
// Split so a scraper crawling the page source does not lift a plain address.
// This is obfuscation, not security - anyone reading the code can reassemble it.
var MAILBOX = ['itcohen2','gmail.com'].join('@');
// FormSubmit's free tier has a daily cap, and on a busy day Itzik hits it in
// the middle of a sentence and gets a Rate Limit page instead of a send. ntfy
// takes the same message with no quota, so every send tries the mailbox first
// and falls back here. I poll this topic in the same round as the mailbox.
// The topic sits in the page source, so it is public: every message carries
// his code, and anything unsigned is ignored on my side.
var NTFYIN = 'abaitzik-in-95e62e86c34f4853';
function ntfyText(kind, text) {
 // Headers have to stay ASCII, so the Hebrew all rides in the body.
 return fetch('https://ntfy.sh/' + NTFYIN, {
  method: 'POST', headers: { Title: 'monitor', 'X-Tags': 'memo' },
  // The page is emitted from a template literal, so a backslash escape here
  // would be eaten at build time. The newline is built from its code point.
  body: [kind, text, '', 'קוד ' + myCode()].join(String.fromCharCode(10))
 }).then(function (r) { if (!r.ok) throw new Error('ntfy'); return 'ntfy'; });
}
// Returns which channel carried it, so the page can say so.
function sendText(subject, text, kind) {
 return fetch('https://formsubmit.co/ajax/' + MAILBOX, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ _subject: subject, _template: 'table', 'הודעה': text, 'קוד': myCode() })
 }).then(function (r) {
  if (!r.ok) throw new Error('quota');
  return 'mail';
 }).catch(function () { return ntfyText(kind, text); });
}
// Files do NOT go through FormSubmit's ajax endpoint. It answers 200 and then
// silently drops the attachment, so two recordings arrived as a note with no
// audio and nothing looked wrong at either end. That endpoint is for text.
//
// The bytes go to ntfy, which carries files reliably, and a line goes to the
// mailbox as well so there is a record that a recording existed even if the
// audio expires before I fetch it.
function sendFiles(list, note) {
 // Every upload is checked against what came back. A recording that does not
 // arrive whole must fail here and say so on his screen, because the last time
 // one was dropped silently he kept talking into nothing and then could not
 // remember what he had asked for.
 return list.reduce(function (chain, f) {
  return chain.then(function () {
   return fetch('https://ntfy.sh/' + NTFYIN + '?filename=' + encodeURIComponent(f.name),
    { method: 'PUT', headers: { Title: 'file' }, body: f })
    .then(function (r) {
     if (!r.ok) throw new Error('ntfy');
     return r.json().catch(function () { return null; });
    })
    .then(function (j) {
     var got = j && j.attachment && Number(j.attachment.size);
     if (!got || got < f.size * 0.98) throw new Error('הקובץ לא הגיע שלם');
    });
  });
 }, Promise.resolve()).then(function () {
  return ntfyText('קובץ', note).then(function () {
   // Best effort only: the recording is already delivered by this point, so a
   // blocked mailbox must not turn a successful send into a failure.
   return fetch('https://formsubmit.co/ajax/' + MAILBOX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ _subject: 'קובץ מהמוניטור', _template: 'table',
      'הודעה': note + ' (הקובץ עצמו נשלח בערוץ הקבצים)', 'קוד': myCode() })
   }).catch(function () {}).then(function () { return 'ntfy'; });
  });
 });
}
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
  +'<div class="repreply">'+replyBox('על הדוח "'+(r.title||'דוח')+'" מ'+stamp(r.at))+'</div>'
  +'</details>';
}
// He said the three tiles are not connected to anything: he sends me messages
// and the counter still says nothing. So the first tile now counts what HE
// sent that I have not answered yet, and the second what I answered today.
function myPending(){
 var c=(D.chat||[]).slice().sort(function(a,b){return (a.at||'')<(b.at||'')?-1:1;});
 var last='';
 for(var i=c.length-1;i>=0;i--){if(c[i].from==='claude'){last=c[i].at||'';break;}}
 var n=0;
 for(var j=0;j<c.length;j++){
  if(c[j].from!=='claude'&&(c[j].at||'')>last&&c[j].status!=='done')n++;
 }
 return n;
}
function answeredToday(){
 var d=new Date();
 var day=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 return (D.chat||[]).filter(function(m){
  return m.from==='claude'&&String(m.at||'').slice(0,10)===day;
 }).length;
}
function render(){
 document.getElementById('tP').textContent=myPending();
 document.getElementById('tT').textContent=answeredToday();
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
 var head=R.length>1?'<div class="rephint">הדוח האחרון פתוח. לחיצה על כותרת פותחת דוח קודם.</div>':'';
 document.getElementById('reports').innerHTML=R.length?head+R.map(reportRow).join('')
  :'<div class="empty">עוד לא נכתב דוח.</div>';
 document.getElementById('built').textContent='גרסה '+stamp(D.builtAt)+' · עודכן לפני '+ago(D.builtAt);
 wireBoxes(document.getElementById('reports'));
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
// A thread he answered and is waiting on. Kept per device, cleared by itself
// the moment my reply with the same re lands.
function standbyMap(){
 try{return JSON.parse(localStorage.getItem('chatStandby')||'{}')||{};}catch(e){return {};}
}
function setStandby(key){
 if(!key)return;
 try{
  var m=standbyMap();
  m[key]=new Date().toISOString();
  var keys=Object.keys(m);
  if(keys.length>200){keys.sort().slice(0,keys.length-200).forEach(function(k){delete m[k];});}
  localStorage.setItem('chatStandby',JSON.stringify(m));
 }catch(e){}
}
function threadState(){
 var unread=new Set(unreadList().map(ML.keyOf));
 return {unread:unread,standby:standbyMap()};
}
function bubbleHtml(m,i,fresh,handled){
 var mine=m.from==='itzik';
 var line=(mine?'איציק':'קלוד')+' · '+stamp(m.at)+String.fromCharCode(10)+(m.text||'');
 return '<div class="bub '+(mine?'you':'me')+(m.pend?' pend':'')
  +(fresh?' fresh':(handled?' touched':' read'))+'" data-i="'+i+'"'
  +' data-copy="'+esc(line)+'">'
  +'<span class="w">'+(mine?'אתה':'קלוד')+' · '+esc(stamp(m.at))
  +(m.pend?' · נשלח, עוד לא נקרא':'')+statusTag(m)
  +(fresh?' · <em class="badge">חדש</em>':(mine?'':' · נקרא'))
  +'<button type="button" class="cp" data-i="'+i+'" aria-label="העתקה">העתקה</button>'
  +'</span>'+linkify(m.text)+'</div>';
}
// Copy, paste and send on every reply form, whatever screen it is on.
function pasteRow(){
 return '<div class="rrow"><button type="button" class="rb rpaste">📋 הדבקה</button>'
  +'<button type="submit">שליחה</button></div>';
}
function wirePaste(root){
 Array.prototype.forEach.call((root||document).querySelectorAll('.rpaste'),function(b){
  if(b.getAttribute('data-wired'))return;
  b.setAttribute('data-wired','1');
  b.onclick=function(e){
   e.stopPropagation();e.preventDefault();
   var ta=b.closest('form').querySelector('textarea');
   if(navigator.clipboard&&navigator.clipboard.readText){
    navigator.clipboard.readText().then(function(t){ta.value=(ta.value?ta.value+' ':'')+t;ta.focus();},
     function(){ta.focus();b.textContent='לחיצה ארוכה בתיבה, ואז הדבקה';});
   }else{ta.focus();b.textContent='לחיצה ארוכה בתיבה, ואז הדבקה';}
  };
 });
}
// The unread screen has no data-k on the form, so a reply from there must
// resolve the root itself, the same way the thread cards already are keyed.
function rootKeyFor(m){
 var byKey={};
 (D.chat||[]).forEach(function(x){byKey[ML.keyOf(x)]=x;});
 return ML.rootKeyOf(m,byKey);
}
function renderThread(){
 var unreadKeys=unreadList().map(claudeKey);
 var touched=touchedIds();
 var baked=(D.chat||[]).filter(function(m){return !isMail(m);});
 var still=dropSettled(pending(),baked);
 savePending(still.concat(pending().filter(isMail)));
 var all=baked.map(function(m){return{id:m.id,re:m.re||'',at:m.at,from:m.from,text:m.text,status:m.status,pend:false};})
   .concat(still.map(function(p){return{id:'',re:p.re||'',at:p.at,from:'itzik',text:p.text,pend:true};}));
 var host=document.getElementById('thread');
 if(!all.length){
  host.innerHTML='<div class="empty">עוד לא דיברנו כאן. תכתוב משהו למטה.</div>';
  return;
 }
 var rows=ML.orderThreads(ML.splitThreads(all),threadState());
 var flat=[];
 host.innerHTML=rows.map(function(r,ri){
  var t=r.thread;
  var head=String(t.root.text||'').replace(/\s+/g,' ').trim().slice(0,70);
  var tag=r.status==='fresh'?(ri===0?'<em class="badge latest">האחרונה שהגיעה</em>':'<em class="badge">חדש</em>')
   :r.status==='standby'?'<em class="st st-working">ממתין לתשובה</em>'
   :'<em class="badge ok">נקרא</em>';
  var body=t.msgs.map(function(m){
   var i=flat.push(m)-1;
   var fresh=m.from!=='itzik'&&unreadKeys.indexOf(claudeKey(m))>-1;
   var handled=!fresh&&touched.indexOf(claudeKey(m))>-1;
   return bubbleHtml(m,i,fresh,handled);
  }).join('');
  var ri2=flat.indexOf(t.root);
  var whole=t.msgs.map(function(m){return (m.from==='itzik'?'איציק':'קלוד')+' · '+stamp(m.at)+String.fromCharCode(10)+(m.text||'');}).join(String.fromCharCode(10,10));
  return '<details class="th th-'+r.status+'" data-k="'+esc(t.key)+'"'+(ri===0&&r.status==='fresh'?' open':'')+'>'
   +'<summary><span class="num">'+r.n+'</span><b>'+esc(head)+'</b>'+tag
   +'<small>'+esc(stamp(t.last))+' · '+esc(ago(t.last))+' · '+t.msgs.length+'</small>'
   +'<button type="button" class="cp rcopyall" data-copy="'+esc(whole)+'" aria-label="העתקת השרשור">העתקת השרשור</button>'
   +'</summary>'
   +'<div class="thbody">'+body
   +'<div class="rrow">'
   +'<button type="button" class="rb rmic" data-i="'+ri2+'">🎤 להשיב בקול</button>'
   +'<button type="button" class="rb rtxt" data-i="'+ri2+'">✍️ בכתב</button>'
   +'<button type="button" class="rb rcam" data-i="'+ri2+'">📷 מצלמה</button>'
   +'<button type="button" class="rb rfile" data-i="'+ri2+'">📎 קובץ</button>'
   +'</div>'
   +'<form class="rform" data-i="'+ri2+'" data-k="'+esc(t.key)+'">'
   +'<textarea placeholder="התשובה שלך בשרשור הזה"></textarea>'
   +pasteRow()
   +'<span class="rsaid"></span></form>'
   +'</div></details>';
 }).join('');
 wireReplies(host,flat);
 wirePaste(host);
 if(picking)host.classList.add('picking');
 // Touching a card, or any bubble in it, turns every unread answer in it green.
 Array.prototype.forEach.call(host.querySelectorAll('.th'),function(card){
  var key=card.getAttribute('data-k');
  function touch(){
   var any=false;
   Array.prototype.forEach.call(card.querySelectorAll('.bub.fresh'),function(el){
    var m=flat[Number(el.getAttribute('data-i'))];
    el.classList.remove('fresh');el.classList.add('touched');
    var w=el.querySelector('.w .badge');
    if(w){w.className='badge ok';w.textContent='נקרא';}
    markOneSeen(m);any=true;
   });
   if(any){
    card.classList.remove('th-fresh');card.classList.add('th-done');
    var tag=card.querySelector('summary .badge');
    if(tag){tag.className='badge ok';tag.textContent='נקרא';}
    ringFor(card);renderNew();
   }
  }
  card.querySelector('summary').addEventListener('click',function(e){
   if(e.target.closest&&e.target.closest('.rcopyall'))return;
   touch();
  });
  Array.prototype.forEach.call(card.querySelectorAll('.bub'),function(el){
   el.addEventListener('click',function(){
    if(picking){el.classList.toggle('picked');return;}
    touch();
   });
  });
 });
 Array.prototype.forEach.call(host.querySelectorAll('.cp'),function(b){
  b.onclick=function(e){
   e.stopPropagation();e.preventDefault();
   var t=b.classList.contains('rcopyall')?(b.getAttribute('data-copy')||''):(flat[Number(b.getAttribute('data-i'))].text||'');
   var was=b.textContent;
   var done=function(){b.textContent='הועתק';setTimeout(function(){b.textContent=was;},1400);};
   if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(done,function(){fallbackCopy(t,done);});
   }else fallbackCopy(t,done);
  };
 });
}
// The same three ways in, next to anything I put on his screen: a report, a
// notice, a message. He asked for it beside every one of them, because an
// answer that is not written where the thing is gets lost by the evening.
function replyBox(quote){
 return '<div class="rbox" data-q="'+esc(quote)+'">'
  +'<div class="rrow">'
  +'<button type="button" class="rb bmic">🎤 להשיב בקול</button>'
  +'<button type="button" class="rb btxt">✍️ בכתב</button>'
  +'<button type="button" class="rb bcam">📷 מצלמה</button>'
  +'<button type="button" class="rb bfile">📎 קובץ</button>'
  +'</div>'
  +'<form class="rform"><textarea placeholder="מה יש לך להגיד על זה"></textarea>'
  +pasteRow()+'<span class="rsaid"></span></form>'
  +'</div>';
}
function wireBoxes(root){
 Array.prototype.forEach.call((root||document).querySelectorAll('.rbox'),function(box){
  if(box.getAttribute('data-wired'))return;
  box.setAttribute('data-wired','1');
  wirePaste(box);
  var q=box.getAttribute('data-q')||'';
  var f=box.querySelector('.rform');
  var txt=box.querySelector('.btxt');
  box.querySelector('.bmic').onclick=function(e){
   e.stopPropagation();
   document.getElementById('fCap').value=q;
   toggleRec();
  };
  box.querySelector('.bfile').onclick=function(e){
   e.stopPropagation();
   document.getElementById('fCap').value=q;
   openPicker('full','image/*,video/*,audio/*,application/pdf',true);
  };
  // Straight to the camera. On a phone this opens the lens instead of the
  // gallery, which is what he means when he says he wants to show me something.
  box.querySelector('.bcam').onclick=function(e){
   e.stopPropagation();
   document.getElementById('fCap').value=q;
   shoot(true);
  };
  txt.onclick=function(e){
   e.stopPropagation();
   var open=!f.classList.contains('open');
   f.classList.toggle('open',open);
   txt.classList.toggle('on',open);
   if(open)f.querySelector('textarea').focus();
  };
  f.addEventListener('click',function(e){e.stopPropagation();});
  f.addEventListener('submit',function(e){
   e.preventDefault();
   var box2=f.querySelector('textarea');
   var btn=f.querySelector('button[type=submit]');
   var said=f.querySelector('.rsaid');
   var text=box2.value.trim();
   if(!text)return;
   btn.disabled=true;
   said.textContent='שולח.';
   var card=box.closest('.report')||box.parentNode;
   if(card)card.classList.add('busyring');
   var full=q+String.fromCharCode(10)+text;
   sendText('הערה מהמוניטור',full,'הערה').then(function(how){
    var p=pending();
    p.push({at:new Date().toISOString(),text:full});
    savePending(p);
    box2.value='';
    said.textContent=how==='ntfy'?'נשלח בערוץ הגיבוי.':'נשלח. קלטתי.';
    markSent('text');renderSent();renderThread();
   }).catch(function(){
    said.textContent='שני הערוצים לא ענו. תנסה שוב.';
   }).then(function(){
    btn.disabled=false;
    if(card)card.classList.remove('busyring');
   });
  });
 });
}
// A reply has to say what it is answering, or it arrives here as a sentence
// with no subject. The quote is short on purpose: enough for me to find the
// message, not so much that a voice note becomes a wall of text.
function quoteOf(m){
 var t=String(m.text||'').replace(/\s+/g,' ').trim().slice(0,60);
 return 'תשובה ל' + (m.from==='itzik'?'הודעה שלי':'הודעה שלך') + ' מ' + stamp(m.at)
  + ': "' + t + '"';
}
// Marks which bubble is being answered, so a recording started here is not
// mistaken later for a new subject.
var answering=null;
function markAnswering(el){
 var host=document.getElementById('thread');
 Array.prototype.forEach.call(host.querySelectorAll('.bub,.th'),function(b){
  b.classList.remove('answering');
 });
 if(el)el.classList.add('answering');
}
function wireReplies(host,all){
 function at(b){return all[Number(b.getAttribute('data-i'))];}
 Array.prototype.forEach.call(host.querySelectorAll('.rmic'),function(b){
  b.onclick=function(e){
   e.stopPropagation();
   var m=at(b);
   answering=m;
   var host2=b.closest('.bub')||b.closest('.th');
   markAnswering(host2);
   // The recorder already knows how to send; it just needs to be told what
   // this recording is an answer to. The caption rides along with the audio.
   document.getElementById('fCap').value=quoteOf(m);
   setStandby(rootKeyFor(m));
   toggleRec();
  };
 });
 Array.prototype.forEach.call(host.querySelectorAll('.rcam'),function(b){
  b.onclick=function(e){
   e.stopPropagation();
   var m=at(b);
   answering=m;
   var host2=b.closest('.bub')||b.closest('.th');
   markAnswering(host2);
   document.getElementById('fCap').value=quoteOf(m);
   setStandby(rootKeyFor(m));
   shoot(true);
  };
 });
 Array.prototype.forEach.call(host.querySelectorAll('.rfile'),function(b){
  b.onclick=function(e){
   e.stopPropagation();
   var m=at(b);
   answering=m;
   var host2=b.closest('.bub')||b.closest('.th');
   markAnswering(host2);
   document.getElementById('fCap').value=quoteOf(m);
   setStandby(rootKeyFor(m));
   openPicker('full','image/*,video/*,audio/*,application/pdf',true);
  };
 });
 Array.prototype.forEach.call(host.querySelectorAll('.rtxt'),function(b){
  b.onclick=function(e){
   e.stopPropagation();
   var host2=b.closest('.bub')||b.closest('.th');
   var f=host2.querySelector('.rform');
   var open=!f.classList.contains('open');
   f.classList.toggle('open',open);
   b.classList.toggle('on',open);
   markAnswering(open?host2:null);
   if(open)f.querySelector('textarea').focus();
  };
 });
 Array.prototype.forEach.call(host.querySelectorAll('.rform'),function(f){
  f.addEventListener('click',function(e){e.stopPropagation();});
  f.addEventListener('submit',function(e){
   e.preventDefault();
   var m=at(f);
   var box=f.querySelector('textarea');
   var btn=f.querySelector('button[type=submit]');
   var said=f.querySelector('.rsaid');
   var text=box.value.trim();
   if(!text)return;
   btn.disabled=true;
   said.textContent='שולח.';
   var full=quoteOf(m)+String.fromCharCode(10)+text;
   sendText('תשובה מהמוניטור',full,'תשובה').then(function(how){
    var p=pending();
    p.push({at:new Date().toISOString(),text:full,re:rootKeyFor(m)});
    savePending(p);
    setStandby(f.getAttribute('data-k')||rootKeyFor(m));
    box.value='';
    said.textContent=how==='ntfy'?'נשלח בערוץ הגיבוי.':'נשלח.';
    markTouched(m);markOneSeen(m);
    markSent('text');renderSent();
    // renderThread redraws every bubble, so the confirmation is shown first.
    setTimeout(renderThread,900);
   }).catch(function(){
    said.textContent='שני הערוצים לא ענו. תנסה שוב.';
   }).then(function(){btn.disabled=false;});
  });
 });
}
// Safari refuses the clipboard API in some contexts, so a hidden textarea and
// execCommand stay as the way that always works.
function fallbackCopy(t,done){
 var a=document.createElement('textarea');
 a.value=t;a.setAttribute('readonly','');
 a.style.position='fixed';a.style.opacity='0';
 document.body.appendChild(a);a.select();a.setSelectionRange(0,t.length);
 try{document.execCommand('copy');done();}catch(e){}
 document.body.removeChild(a);
}
// Selecting particular messages. The bubbles are drawn newest first, so the
// copy is reordered oldest first, which is how a transcript reads.
var picking=false;
on('pickMode',function(){
 picking=!picking;
 var host=document.getElementById('thread');
 host.classList.toggle('picking',picking);
 this.textContent=picking?'ביטול בחירה':'בחירת הודעות';
 this.classList.toggle('pickon',picking);
 document.getElementById('copyPicked').hidden=!picking;
 if(!picking)Array.prototype.forEach.call(host.querySelectorAll('.bub'),function(b){
  b.classList.remove('picked');
 });
});
on('copyPicked',function(){
 var b=this;
 var host=document.getElementById('thread');
 var chosen=Array.prototype.slice.call(host.querySelectorAll('.bub.picked'));
 if(!chosen.length){b.textContent='לא סימנת כלום';
  setTimeout(function(){b.textContent='העתקת הנבחרות';},1500);return;}
 var t=chosen.map(function(el){return el.getAttribute('data-copy')||'';})
   .reverse().join(String.fromCharCode(10,10));
 var done=function(){b.textContent='הועתק '+chosen.length;
  setTimeout(function(){b.textContent='העתקת הנבחרות';},1600);};
 if(navigator.clipboard&&navigator.clipboard.writeText){
  navigator.clipboard.writeText(t).then(done,function(){fallbackCopy(t,done);});
 }else fallbackCopy(t,done);
});

document.getElementById('copyAll').onclick=function(){
 var b=this;
 var all=(D.chat||[]).filter(function(m){return !isMail(m);})
  .slice().sort(function(a,b2){return (a.at||'')<(b2.at||'')?-1:1;});
 if(!all.length)return;
 var t=all.map(function(m){
  return (m.from==='itzik'?'איציק':'קלוד')+' · '+stamp(m.at)+String.fromCharCode(10)+(m.text||'');
 }).join(String.fromCharCode(10,10));
 var done=function(){b.textContent='הועתק';setTimeout(function(){b.textContent='העתקת כל השיחה';},1500);};
 if(navigator.clipboard&&navigator.clipboard.writeText){
  navigator.clipboard.writeText(t).then(done,function(){fallbackCopy(t,done);});
 }else fallbackCopy(t,done);
};
function newestClaude(){
 var c=(D.chat||[]).filter(function(m){return m.from==='claude';});
 return c.length?c[c.length-1].at||'':'';
}
function chatSeen(){
 try{return localStorage.getItem('chatSeen')||'';}catch(e){return'';}
}
// Opening the chat used to mark everything read at once. He told me what that
// costs: he opens the screen, does not manage to read it all, and the red is
// gone as if he had. Now nothing is marked by opening. A message stays red
// until he touches it, and turns green the moment he does.
//
// The one exception is the very first time this device shows the chat: the
// whole history would light up red, so it is marked read once and never again.
function markChatSeen(){
 try{
  if(!localStorage.getItem('chatBooted')){
   localStorage.setItem('chatBooted','1');
   localStorage.setItem('chatSeen',newestClaude());
   var seen=seenIds();
   (D.chat||[]).forEach(function(m){
    if(m.from!=='claude')return;
    var k=claudeKey(m);
    if(seen.indexOf(k)<0)seen.push(k);
   });
   if(seen.length>2000)seen=seen.slice(-2000);
   localStorage.setItem('chatSeenIds',JSON.stringify(seen));
  }
 }catch(e){}
 paintDot();
}
// Which bubbles he has already dealt with. Being seen and being handled are
// not the same thing: the first happens once on a new device for the whole
// history, the second only when his finger lands on that message. The green
// has to survive a reload, so it is kept here and not only in the class.
function touchedIds(){
 try{return JSON.parse(localStorage.getItem('chatTouched')||'[]');}catch(e){return [];}
}
function markTouched(m){
 if(!m)return;
 try{
  var t=touchedIds();
  var k=claudeKey(m);
  if(t.indexOf(k)<0)t.push(k);
  if(t.length>2000)t=t.slice(-2000);
  localStorage.setItem('chatTouched',JSON.stringify(t));
 }catch(e){}
}
// One message, when he actually touches it.
function markOneSeen(m){
 markTouched(m);
 try{
  var seen=seenIds();
  var k=claudeKey(m);
  if(seen.indexOf(k)<0)seen.push(k);
  if(seen.length>2000)seen=seen.slice(-2000);
  localStorage.setItem('chatSeenIds',JSON.stringify(seen));
 }catch(e){}
 paintDot();
}
// The ring runs for a moment on whatever he just touched, and stays on while
// something is actually being sent from that card.
function ringFor(el,ms){
 if(!el)return;
 el.classList.add('busyring');
 setTimeout(function(){el.classList.remove('busyring');},ms||1300);
}
function paintDot(){
 var d=document.getElementById('mDot');
 if(d)d.hidden=!unreadList().length;
 paintNew();
 paintAnsCount();
}
// How many reports are newer than the last one he opened. The mark itself
// lives further down in reportsSeen, which keeps the newest timestamp.
function newReports(){
 var cut=reportsSeen();
 return (D.reports||[]).filter(function(r){return (r.at||'')>cut;});
}
// He asked the screen to point at what needs him. A tile glows and wears a
// count, and the tab at the bottom breathes, until he opens that screen.
function paintNew(){
 var msgs=unreadList().length;
 var reps=newReports().length;
 var t=lastPill();
 var pillNow=!t||(Date.now()-t)>=PILLGAP;
 function mark(id,on,label){
  var el=document.getElementById(id);
  if(!el)return;
  el.classList.toggle('glow',!!on);
  var f=el.querySelector(':scope > .flag');
  if(on&&!f){
   f=document.createElement('span');f.className='flag';el.appendChild(f);
  }
  if(f)f.textContent=label||'';
  if(f&&!on)f.remove();
 }
 // The special requests tile blinks until he opens it once for that item.
 var sp=(D.special||[]);
 var spTop=sp.length?(sp[0].at||''):'';
 var spSeen='';
 try{spSeen=localStorage.getItem('specialSeen')||'';}catch(e){}
 mark('gSpecial',!!spTop&&spSeen<spTop,'חדש');
 mark('gChat',msgs>0,String(msgs));
 mark('gReports',reps>0,String(reps));
 mark('gPill',pillNow,'עכשיו');
 var nM=document.getElementById('nM');if(nM)nM.classList.toggle('hasnew',msgs>0);
 var nR=document.getElementById('nR');if(nR)nR.classList.toggle('hasnew',reps>0);
 var rd=document.getElementById('rDot');if(rd)rd.hidden=!reps;
}
// Unread used to mean newer than the last time he opened the chat. That broke
// the moment I wrote a reply with a timestamp earlier than one already there:
// a real answer arrived and the button stayed grey. Seen messages are now
// remembered one by one, so the order they were written in cannot hide one.
function seenIds(){
 try{return JSON.parse(localStorage.getItem('chatSeenIds')||'[]');}catch(e){return [];}
}
function claudeKey(m){return (m.at||'')+'|'+String(m.text||'').slice(0,40);}
function unreadList(){
 var seen=seenIds();
 var cut=chatSeen();
 return (D.chat||[]).filter(function(m){
  if(m.from!=='claude')return false;
  if(seen.indexOf(claudeKey(m))>-1)return false;
  // Anything already on screen before this change counts as read, so he does
  // not get a hundred old answers marked new once.
  if(!seen.length&&cut&&(m.at||'')<=cut)return false;
  return true;
 });
}
function unreadCount(){return unreadList().length;}
function renderNew(){
 renderSent();
 paintAnsCount();
 var c=unreadCount();
 var btn=document.getElementById('newBtn');
 btn.classList.toggle('hot',c>0);
 document.getElementById('nbCount').textContent=c?c:'✓';
 // Said in words as well as in colour. He told me a colour blind person would
 // not notice the old marking at all, and he was right.
 document.getElementById('nbTitle').textContent=c
  ?(c===1?'הודעה אחת שלא קראת':c+' הודעות שלא קראת')
  :'הכל נקרא';
 document.getElementById('nbSub').textContent=c
  ?'לחיצה פותחת אותן, אחת אחת.'
  :'אין תשובות שמחכות לך.';
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
var PANES={x:'pX',a:'pA',h:'pH',q:'pQ',l:'pL',r:'pR',m:'pM',e:'pE',n:'pN',g:'pG',d:'pD',p:'pP',v:'pV',f:'pF',o:'pL2',s:'pS',t:'pN2',i:'pI',u:'pU',w:'pW',y:'pY'};
// Itzik set the rhythm on 9.9: every eight hours from the morning dose.
var PILLGAP=(window.ML&&ML.PILL_GAP)||8*3600*1000;
// The last dose. From the chat it is read out of the message text, because he
// confirms the hour he took it and that hour is what the count runs from.
function lastPill(){
 var c=(D.chat||[]).filter(function(m){return m.from==='itzik'&&/לקחתי כדור/.test(m.text||'');});
 var last=c.length?c[c.length-1]:null;
 var fromChat=last?ML.parsePillTime(last.text,last.at):0;
 var chatAt=last?(Date.parse(last.at||'')||0):0;
 var rec=null;
 try{
  var raw=localStorage.getItem('lastPill')||'';
  rec=raw.charAt(0)==='{'?JSON.parse(raw):(Number(raw)?{taken:Number(raw),recordedAt:Number(raw)}:null);
 }catch(e){rec=null;}
 // The most recent record wins, not the largest hour: a correction to an
 // earlier time is still the newest thing he said.
 if(rec&&rec.taken&&rec.recordedAt>=chatAt)return rec.taken;
 return fromChat||(rec&&rec.taken)||0;
}
function hm(x){return x.getHours()+':'+String(x.getMinutes()).padStart(2,'0');}
function renderPill(){
 var box=document.getElementById('pillInfo');
 var btn=document.getElementById('pillBig');
 if(!box||!btn)return;
 var t=lastPill();
 if(!t){
  btn.className='pillbig';
  box.innerHTML='<b>עוד לא נרשמה מנה</b><small>לחיצה על העיגול שואלת מתי לקחת, ומשם מתחילה הספירה למנה הבאה.</small>';
  return;
 }
 var s=ML.pillState(t,Date.now());
 btn.className='pillbig'+(s.due?'':' done');
 var when=s.due?'עכשיו'
  :('בעוד '+Math.floor(s.left/3600000)+' שעות ו'+Math.round(s.left%3600000/60000)+' דקות');
 box.innerHTML='<b>המנה הבאה '+esc(when)+'</b>'
  +'<div>בשעה '+esc(hm(new Date(s.next)))+'</div>'
  +'<small>המנה האחרונה נרשמה ב'+esc(hm(new Date(t)))+'. אזכיר לך גם בהתראה לנייד.</small>';
}
// The sheet. Nothing is counted until he answers it.
function openPillSheet(){
 var sh=document.getElementById('pillSheet');
 if(!sh)return;
 document.getElementById('pillQ').textContent='השעה עכשיו '+hm(new Date())+'. לקחת את הכדור מוקדם יותר?';
 document.getElementById('pillTimeRow').hidden=true;
 document.getElementById('pillTime').value=hm(new Date()).padStart(5,'0');
 sh.hidden=false;
 sh.scrollIntoView({block:'center'});
}
function closePillSheet(){
 var sh=document.getElementById('pillSheet');
 if(sh)sh.hidden=true;
}
function recordPill(takenMs){
 var box=document.getElementById('msgText');
 box.value='לקחתי כדור בשעה '+hm(new Date(takenMs))+'.';
 document.getElementById('msgForm').dispatchEvent(new Event('submit',{cancelable:true}));
 try{localStorage.setItem('lastPill',JSON.stringify({taken:takenMs,recordedAt:Date.now()}));}catch(e){}
 closePillSheet();
 renderPill();
 paintNew();
}
// More landing pages are coming, so each one is a line here.
var LANDING=[
 {name:'כלל עשר הדקות',note:'מילת המפתח: שום',url:'https://itzik-site.vercel.app/shum'},
 {name:'שיטת הפירה',note:'מילת המפתח: גזר',url:'https://itzik-site.vercel.app/gezer'},
 {name:'סלינדה',note:'אתר',url:'https://salinda-mobile.vercel.app/'}
];
var NAVS={h:'nH',q:'nQ',l:'nL',r:'nR',m:'nM',a:'nA'};

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
   +'<div class="text">'+esc(body)+'</div>'
   +'<div class="repreply">'+replyBox('על הדוח "'+(r.title||'דוח')+'" מ'+stamp(r.at))+'</div>'
   +'</details>';
  }).join('');}
 document.getElementById('netBody').innerHTML=out;
 wireBoxes(document.getElementById('netBody'));
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

// The page is one HTML file, so a phone that cached it keeps showing an old
// screen. version.json is fetched with no-store on every open; when it names
// a newer build than the one baked in here, the page reloads itself once.
// Painted from whatever the last poll brought back. Red pulse while a round is
// running, green while I am listening, and the answer count updates on its own
// so one reply can arrive without waiting for the rest.
var liveSeen=null;
function paintLive(v){
 var bar=document.getElementById('liveBar');
 // The strip was removed from the home screen at his request. Everything else
 // in here still runs, so if it ever comes back nothing needs rewiring.
 if(!bar)return;
 var now=(v&&v.now)||D.now;
 var what=document.getElementById('liveWhat');
 var when=document.getElementById('liveWhen');
 var fresh=now&&now.at&&(Date.now()-Date.parse(now.at))<25*60*1000;
 bar.classList.toggle('busy',!!fresh);
 what.textContent=fresh?(now.text||'עובד עכשיו'):'אני מקשיב לך. אפשר גם לכתוב כאן';
 var n=unreadList().length;
 when.textContent=(n?(n===1?'תשובה אחת מחכה · ':n+' תשובות מחכות · '):'')
  +(now&&now.at?ago(now.at):ago(D.builtAt));
}
function checkFresh(){
 if(!window.fetch)return;
 fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){
  return r.ok?r.json():null;
 }).then(function(v){
  if(v)paintLive(v);
  if(!v||!v.builtAt||v.builtAt===D.builtAt)return;
  // A new build is up. Say so before reloading, so a reply that landed while
  // he was reading does not just make the screen jump under his hands.
  var what=document.getElementById('liveWhat');
  if(what&&liveSeen!==v.builtAt){liveSeen=v.builtAt;what.textContent='יש תשובה חדשה. טוען.';}
  var seen='';
  try{seen=sessionStorage.getItem('reloadedFor')||'';}catch(e){}
  if(seen===v.builtAt)return;
  try{sessionStorage.setItem('reloadedFor',v.builtAt);}catch(e){}
  var go=function(){location.replace(location.pathname+'?b='+encodeURIComponent(v.builtAt));};
  try{
   if(window.caches&&caches.keys){
    caches.keys().then(function(keys){
     return Promise.all(keys.map(function(k){return caches.delete(k);}));
    }).catch(function(){}).then(go);
    return;
   }
  }catch(e){}
  go();
 }).catch(function(){});
}
checkFresh();
paintLive(null);
paintNew();
// Anything he taps says so for a moment: a tile, a report, a reply button.
document.addEventListener('click',function(e){
 var t=e.target.closest?e.target.closest('.gt,.rb,.report > summary'):null;
 if(!t)return;
 ringFor(t.tagName==='SUMMARY'?t.parentNode:t,1200);
},true);
// Forty seconds, not two minutes. He wants to see that something is alive.
setInterval(checkFresh,40000);
setInterval(function(){paintLive(null);paintNew();},20000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)checkFresh();});


// The skin. Three states: let the phone decide, force white, force black. The
// choice lives on the device, like every other per device preference here, so
// his phone and the laptop can differ without fighting each other.
function skinGet(){
 try{return localStorage.getItem('skin')||'auto';}catch(e){return 'auto';}
}
function skinApply(v){
 var r=document.documentElement;
 if(v==='dark'||v==='light')r.setAttribute('data-theme',v);
 else r.removeAttribute('data-theme');
 // The phone paints the status bar from this, so it has to move with the skin
 // or the top strip stays the colour of the theme he just left.
 var m=document.querySelector('meta[name="theme-color"]');
 if(m){
  var dark=v==='dark'||(v==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme:dark)').matches);
  m.setAttribute('content',dark?'#0f1218':'#14675a');
 }
 var said=document.getElementById('skinSaid');
 if(said)said.textContent=v==='auto'?'הטלפון מחליט, לפי מצב לילה שלו.'
  :v==='light'?'לבן קבוע, גם בלילה.':'שחור קבוע, גם ביום.';
 Array.prototype.forEach.call(document.querySelectorAll('.skb'),function(b){
  b.setAttribute('aria-pressed',b.getAttribute('data-skin')===v?'true':'false');
 });
}
function skinBind(){
 Array.prototype.forEach.call(document.querySelectorAll('.skb'),function(b){
  b.addEventListener('click',function(){
   var v=b.getAttribute('data-skin');
   try{if(v==='auto')localStorage.removeItem('skin');else localStorage.setItem('skin',v);}catch(e){}
   skinApply(v);
  });
 });
 skinApply(skinGet());
}
skinBind();

// The connection test. He asked for it after a night where he sent messages and
// could not tell whether anything reached me. A green light that is always green
// would be worse than nothing, so this one is measured end to end: the send is a
// real send and it reports which channel carried it, and the answer only counts
// when a build newer than his tap actually lands on his phone. Nothing here is
// simulated, and if both channels are down the line says so.
function pingState(){
 try{return JSON.parse(localStorage.getItem('pingState')||'{}')||{};}catch(e){return {};}
}
function savePingState(s){
 try{localStorage.setItem('pingState',JSON.stringify(s));}catch(e){}
}
function pingSay(t){
 var e=document.getElementById('pingSaid');if(e)e.textContent=t;
}
function pingPaint(){
 var st=pingState(),box=document.getElementById('pingBox');
 if(!box||!st.at)return;
 var built=D.builtAt||'';
 if(built&&Date.parse(built)>Date.parse(st.at)){
  var m=Math.max(1,Math.round((Date.parse(built)-Date.parse(st.at))/60000));
  box.classList.add('ok');
  pingSay('חזרתי אליך '+(m===1?'דקה':m+' דקות')+' אחרי הלחיצה. החיבור עובד.');
 }else{
  box.classList.remove('ok');
  pingSay('נשלח '+ago(st.at)+' ועוד לא חזרתי. אם עוברת יותר משעה, משהו אצלי תקוע.');
 }
}
function pingBind(){
 var btn=document.getElementById('pingBtn');
 if(!btn)return;
 btn.addEventListener('click',function(){
  btn.disabled=true;
  pingSay('שולח.');
  var at=new Date().toISOString();
  sendText('בדיקת חיבור','בדיקת חיבור מהמוניטור. תחזור אליי כדי שאדע שאתה מחובר.','בדיקה')
  .then(function(how){
   savePingState({at:at});
   document.getElementById('pingBox').classList.remove('ok');
   pingSay((how==='ntfy'?'יצא בערוץ הגיבוי. ':'יצא במייל. ')+'מחכה שאחזור אליך.');
  }).catch(function(){
   pingSay('לא יצא. שני הערוצים לא ענו, ואין טעם ללחוץ שוב עד שיש רשת.');
  }).then(function(){btn.disabled=false;});
 });
 pingPaint();
}
pingBind();
setInterval(pingPaint,60000);

// One line straight into the same channel the chat uses, for the small
// signals: a lead moved to standby, a folder is missing, and so on.
function sendLine(text){
 sendText('עדכון מהמוניטור',text,'עדכון').then(function(){
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
 paintNew();
}
function paintReportDot(){
 var fresh=newestReport()&&newestReport()>reportsSeen();
 var n=document.getElementById('nR');if(n)n.classList.toggle('blink',!!fresh);
 var t=document.getElementById('gReports');if(t)t.classList.toggle('blink',!!fresh);
}

// The two big blocks on the home screen: the square tiles and the round app
// icons. He wanted one above the other and the freedom to flip them whenever,
// without hunting for a grip. One button does it and the order is kept.
function swapHomeBlocks(){
 var tiles=document.getElementById('blkTiles');
 var icons=document.getElementById('blkIcons');
 if(!tiles||!icons||!tiles.parentNode)return;
 var box=tiles.parentNode;
 var kids=Array.prototype.slice.call(box.children);
 if(kids.indexOf(tiles)<kids.indexOf(icons))box.insertBefore(icons,tiles);
 else box.insertBefore(tiles,icons);
 saveOrder(box,'blockOrder');
 toast('הוחלף. אפשר להחליף שוב בכל רגע.');
}
on('swapBlocks',swapHomeBlocks);

// ---- his own order ----
// He asked to arrange the tiles himself. A long press picks one up, and the
// order is kept on the device. This is also the first thing a client will be
// allowed to do on his own copy: add and arrange, never restructure.
// Anything that can be rearranged needs a stable name to be remembered by.
// The tiles already have ids; the blocks on the home screen do not, so they
// are given one from their position the first time they are seen.
function nameChildren(box,prefix){
 Array.prototype.forEach.call(box.children,function(el,i){
  if(!el.id)el.id=prefix+'-'+i;
 });
}
function readOrder(key){
 try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}
}
function saveOrder(box,key){
 if(!box)return;
 var ids=Array.prototype.map.call(box.children,function(el){return el.id;});
 try{localStorage.setItem(key,JSON.stringify(ids));}catch(e){}
}
function applyOrder(box,key){
 var order=readOrder(key);
 if(!box||!order)return;
 order.forEach(function(id){
  var el=document.getElementById(id);
  // Only move a child of this box: an id from an older layout must not drag
  // some unrelated element in here.
  if(el&&el.parentNode===box)box.appendChild(el);
 });
 // Anything added since he last arranged simply stays at the end.
}
// The iPhone method, which is what he asked for and what the first attempt got
// wrong: a long press does not drag anything. It puts the screen into edit
// mode, everything wobbles, and from then on he can move blocks as many times
// as he likes with ordinary drags. A Done bar ends it.
//
// The first version tied the drag to the same press, so letting go ended
// everything and he could only ever move one block one place.
var editing=null;
function armDrag(box,key){
 if(!box)return;
 var hold=null,held=null,startY=0;
 function tidy(){
  Array.prototype.forEach.call(box.children,function(c){c.classList.remove('dragover');});
 }
 function enterEdit(){
  if(editing)return;
  editing={box:box,key:key};
  document.body.classList.add('editing');
  box.classList.add('editbox');
  addHandles(box);
  try{navigator.vibrate&&navigator.vibrate(18);}catch(e){}
  showEditBar();
 }
 box.addEventListener('pointerdown',function(e){
  var t=e.target;
  if(t&&t.closest&&t.closest('input,textarea,select'))return;
  if(editing)return;
  startY=e.clientY;
  hold=setTimeout(enterEdit,500);
 });
 box.addEventListener('pointermove',function(e){
  // A scroll is not a long press.
  if(hold&&Math.abs(e.clientY-startY)>10){clearTimeout(hold);hold=null;}
 });
 ['pointerup','pointercancel','pointerleave'].forEach(function(ev){
  box.addEventListener(ev,function(){clearTimeout(hold);hold=null;});
 });

 // In edit mode a press on the handle picks its block up.
 box.addEventListener('pointerdown',function(e){
  if(!editing||editing.box!==box)return;
  var t=e.target;
  if(box===document.getElementById('pH')&&!(t.classList&&t.classList.contains('grip')))return;
  var el=t;
  while(el&&el.parentNode!==box)el=el.parentNode;
  if(!el)return;
  held=el;el.classList.add('dragging');
  e.preventDefault();
 });
 box.addEventListener('pointermove',function(e){
  if(!held)return;
  e.preventDefault();
  var over=document.elementFromPoint(e.clientX,e.clientY);
  while(over&&over.parentNode!==box)over=over.parentNode;
  if(!over||over===held)return;
  tidy();
  over.classList.add('dragover');
  var kids=Array.prototype.slice.call(box.children);
  if(kids.indexOf(held)<kids.indexOf(over))box.insertBefore(over,held);
  else box.insertBefore(held,over);
 });
 ['pointerup','pointercancel'].forEach(function(ev){
  box.addEventListener(ev,function(){
   if(!held)return;
   held.classList.remove('dragging');held=null;tidy();
   saveOrder(box,key);
  });
 });
 // Nothing is clickable while arranging, exactly as on the phone.
 box.addEventListener('click',function(e){
  if(editing&&editing.box===box){e.preventDefault();e.stopPropagation();}
 },true);
}
// A visible grip on each block, because on a phone there is no other way to
// say move this whole thing rather than move what is inside it.
function addHandles(box){
 if(box!==document.getElementById('pH'))return;
 Array.prototype.forEach.call(box.children,function(el){
  if(el.querySelector&&el.querySelector(':scope > .grip'))return;
  var g=document.createElement('div');
  g.className='grip';
  g.textContent='⠿';
  g.setAttribute('aria-hidden','true');
  el.insertBefore(g,el.firstChild);
  el.classList.add('hasgrip');
 });
}
function dropHandles(){
 Array.prototype.forEach.call(document.querySelectorAll('.grip'),function(g){
  var p=g.parentNode;
  if(p){p.removeChild(g);p.classList.remove('hasgrip');}
 });
}
function showEditBar(){
 var bar=document.getElementById('editBar');
 if(!bar)return;
 bar.hidden=false;
}
function endEdit(){
 if(!editing)return;
 saveOrder(editing.box,editing.key);
 pinHome(document.getElementById('pH'));
 dropHandles();
 editing.box.classList.remove('editbox');
 editing=null;
 document.body.classList.remove('editing');
 var bar=document.getElementById('editBar');
 if(bar)bar.hidden=true;
}

// A short click when a button is pressed. Browsers block audio until the page
// has been touched, so this only ever plays on his own tap.
var actx=null;
function click(){
 try{
  var A=window.AudioContext||window.webkitAudioContext;
  if(!A)return;
  actx=actx||new A();
  var o=actx.createOscillator(),g=actx.createGain();
  o.type='triangle';o.frequency.setValueAtTime(660,actx.currentTime);
  o.frequency.exponentialRampToValueAtTime(240,actx.currentTime+.07);
  g.gain.setValueAtTime(.055,actx.currentTime);
  g.gain.exponentialRampToValueAtTime(.0001,actx.currentTime+.09);
  o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+.1);
 }catch(e){}
}
document.addEventListener('pointerdown',function(e){
 if(e.target.closest&&e.target.closest('.gt,.mic,.micfab,.recbig,.foodcam,.conn'))click();
},{passive:true});

function on2(id,ev,fn){var el=document.getElementById(id);if(el)el.addEventListener(ev,fn);}
function on(id,fn){
 var el=document.getElementById(id);
 if(el)el.onclick=fn;
}
// He said it plainly: my answers vanish. The unread screen empties itself the
// moment he touches a message, and after that the only copy sits buried in the
// thread among his own messages. This screen keeps every answer I ever wrote.
// Nothing here removes a message from view - the filters only narrow it.
var ansFilter='all',ansQ='';
// Two hundred cards, each with a recorder and an attach form, is more than a
// phone should build at once. It draws a page at a time.
var ansShow=30;
function starIds(){
 try{return JSON.parse(localStorage.getItem('chatStar')||'[]');}catch(e){return [];}
}
function isStar(m){return starIds().indexOf(claudeKey(m))>-1;}
function toggleStar(m){
 try{
  var s=starIds(),k=claudeKey(m),i=s.indexOf(k);
  if(i>-1)s.splice(i,1);else s.push(k);
  if(s.length>400)s=s.slice(-400);
  localStorage.setItem('chatStar',JSON.stringify(s));
 }catch(e){}
}
function isDone(m){return touchedIds().indexOf(claudeKey(m))>-1;}
function unDone(m){
 try{
  var t=touchedIds(),k=claudeKey(m),i=t.indexOf(k);
  if(i>-1){t.splice(i,1);localStorage.setItem('chatTouched',JSON.stringify(t));}
 }catch(e){}
}
function allAnswers(){
 return (D.chat||[]).filter(function(m){return m.from==='claude'&&!isMail(m);})
  .slice().sort(function(a,b){return (a.at||'')<(b.at||'')?1:-1;});
}
function isFresh(m){return unreadList().indexOf(m)>-1;}
function ansCounts(){
 var a=allAnswers();
 return {all:a.length,
  fresh:a.filter(isFresh).length,
  star:a.filter(isStar).length,
  done:a.filter(function(m){return isDone(m)&&!isFresh(m);}).length};
}
function ansList(){
 var a=allAnswers();
 if(ansFilter==='fresh')a=a.filter(isFresh);
 if(ansFilter==='star')a=a.filter(isStar);
 if(ansFilter==='done')a=a.filter(function(m){return isDone(m)&&!isFresh(m);});
 if(ansQ){
  var q=ansQ.toLowerCase();
  a=a.filter(function(m){return String(m.text||'').toLowerCase().indexOf(q)>-1;});
 }
 return a;
}
function ansCopy(btn,text){
 var done=function(){var o=btn.textContent;btn.textContent='הועתק';
  setTimeout(function(){btn.textContent=o;},1500);};
 if(navigator.clipboard&&navigator.clipboard.writeText){
  navigator.clipboard.writeText(text).then(done,function(){fallbackCopy(text,done);});
 }else fallbackCopy(text,done);
}
function renderAnswers(){
 var chips=document.getElementById('aChips');
 var host=document.getElementById('ansBox');
 if(!chips||!host)return;
 var c=ansCounts();
 var defs=[['all','הכל',c.all],['fresh','לא נקראו',c.fresh],
  ['star','מסומנות',c.star],['done','טופלו',c.done]];
 chips.innerHTML=defs.map(function(d){
  return '<button type="button" class="achip'+(ansFilter===d[0]?' on':'')
   +'" data-f="'+d[0]+'">'+d[1]+' <b>'+d[2]+'</b></button>';
 }).join('');
 Array.prototype.forEach.call(chips.querySelectorAll('.achip'),function(b){
  b.onclick=function(){ansFilter=b.getAttribute('data-f');ansShow=30;renderAnswers();};
 });
 var full=ansList();
 var list=full.slice(0,ansShow);
 if(!full.length){
  host.innerHTML='<div class="aempty">אין כאן כלום בסינון הזה.</div>';
  return;
 }
 host.innerHTML=list.map(function(m,i){
  var fresh=isFresh(m),done=!fresh&&isDone(m),st=isStar(m);
  return '<div class="ansc'+(fresh?' fresh':(done?' done':''))+(st?' star':'')+'" data-i="'+i+'">'
   +'<span class="w">קלוד · '+esc(stamp(m.at))
   +(fresh?' · <em class="badge">חדש</em>':(done?' · טופל':' · נקרא'))+'</span>'
   +'<div class="atxt">'+linkify(m.text)+'</div>'
   +'<div class="arow">'
   +'<button type="button" class="ab acopy" data-i="'+i+'">העתקה</button>'
   +'<button type="button" class="ab astar'+(st?' on':'')+'" data-i="'+i+'">'
   +(st?'★ מסומן':'☆ סימון')+'</button>'
   +'<button type="button" class="ab adone'+(done?' on':'')+'" data-i="'+i+'">'
   +(done?'✓ טופל':'סמן כטופל')+'</button>'
   +'<button type="button" class="ab aread" data-i="'+i+'"'+(fresh?'':' hidden')+'>קראתי</button>'
   +'</div>'
   +replyBox('בקשר לתשובה שלך מ'+stamp(m.at))
   +'<span class="asaid" data-i="'+i+'"></span>'
   +'</div>';
 }).join('');
 var at=function(b){return list[Number(b.getAttribute('data-i'))];};
 Array.prototype.forEach.call(host.querySelectorAll('.acopy'),function(b){
  b.onclick=function(e){e.stopPropagation();
   var m=at(b);
   ansCopy(b,'קלוד · '+stamp(m.at)+String.fromCharCode(10)+(m.text||''));};
 });
 Array.prototype.forEach.call(host.querySelectorAll('.astar'),function(b){
  b.onclick=function(e){e.stopPropagation();toggleStar(at(b));renderAnswers();};
 });
 Array.prototype.forEach.call(host.querySelectorAll('.adone'),function(b){
  b.onclick=function(e){e.stopPropagation();
   var m=at(b);
   if(isDone(m)&&!isFresh(m))unDone(m);else markOneSeen(m);
   renderAnswers();paintDot();};
 });
 Array.prototype.forEach.call(host.querySelectorAll('.aread'),function(b){
  b.onclick=function(e){e.stopPropagation();markOneSeen(at(b));renderAnswers();paintDot();};
 });
 if(full.length>list.length){
  var more=document.createElement('button');
  more.type='button';more.className='ab';more.style.width='100%';more.style.padding='14px';
  more.textContent='להציג עוד ('+(full.length-list.length)+')';
  more.onclick=function(){ansShow+=30;renderAnswers();};
  host.appendChild(more);
 }
 wireBoxes(host);
}
function paintAnsCount(){
 var el=document.getElementById('aCnt');
 if(!el)return;
 var n=unreadList().length;
 var total=allAnswers().length;
 el.textContent=n?String(n):String(total);
 el.classList.toggle('zero',!n);
}
// Every inner screen gets a way back and its own address. He asked for both:
// a link that opens the screen I am talking about, and a way out of it.
var PANENAME={x:'pegasus',y:'special',w:'improve',r:'reports',a:'answers',m:'chat'};
function paneOf(name){
 for(var k in PANENAME){if(PANENAME[k]===name)return k;}
 return PANES[name]?name:'';
}
function backBar(sec){
 if(sec.id==='pH')return;
 if(sec.querySelector(':scope > .backbar'))return;
 var b=document.createElement('button');
 b.type='button';b.className='backbar';b.textContent='חזרה למסך הבית';
 b.onclick=function(){pane('h');};
 sec.insertBefore(b,sec.firstChild);
}
function pane(w){
 for(var k in PANES){
  var sec=document.getElementById(PANES[k]);
  sec.hidden=(k!==w);
  if(k===w)backBar(sec);
 }
 for(var n in NAVS){document.getElementById(NAVS[n]).setAttribute('aria-pressed',n===w);}
 // The hash is only an incoming address. Writing it on every move made the
 // app reopen on an inner screen and feel like it jumped on its own.
 try{
  if(location.hash&&history&&history.replaceState)history.replaceState(null,'',location.pathname);
 }catch(e){}
 window.scrollTo(0,0);
}
document.getElementById('reloadBtn').onclick=function(){
 // He reported the header still showing a build fifty minutes old after
 // pressing this, so a fresh query string was not enough. Anything the
 // browser has stored for this page is cleared first: a page added to the
 // home screen keeps its own copy that a normal reload never touches.
 var done=function(){location.replace(location.pathname+'?v='+Date.now());};
 try{
  if(window.caches&&caches.keys){
   caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){return caches.delete(k);}));
   }).catch(function(){}).then(done);
   return;
  }
 }catch(e){}
 done();
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
// The big button used to drop him into the full thread, two hundred bubbles
// deep, and he said plainly that he could not find the new messages. It opens
// a screen that holds only what he has not read.
document.getElementById('newBtn').onclick=function(){
 if(unreadCount())beep();
 // Opens the thread cards. The unread ones sit first, newest at the top and
 // labelled as the latest, so he can tell at a glance which answer is the
 // last one and which are older. The flat answers list is still under the
 // תשובות tab.
 pane('m');renderThread();
};
function renderUnread(){
 var host=document.getElementById('unreadBox');
 if(!host)return;
 var list=unreadList();
 if(!list.length){
  host.innerHTML='<div class="empty">אין הודעות חדשות. הכל נקרא.</div>';
  return;
 }
 host.innerHTML=list.map(function(m,i){
  return '<div class="bub me fresh" data-i="'+i+'">'
   +'<span class="w">קלוד · '+esc(stamp(m.at))+' · <em class="badge">חדש</em></span>'
   +linkify(m.text)
   +'<div class="rrow">'
   +'<button type="button" class="rb rmic" data-i="'+i+'">🎤 להשיב בקול</button>'
   +'<button type="button" class="rb rtxt" data-i="'+i+'">✍️ בכתב</button>'
   +'<button type="button" class="rb rcam" data-i="'+i+'">📷 מצלמה</button>'
   +'<button type="button" class="rb rfile" data-i="'+i+'">📎 קובץ</button>'
   +'</div>'
   +'<form class="rform" data-i="'+i+'">'
   +'<textarea placeholder="התשובה שלך להודעה הזאת"></textarea>'
   +pasteRow()
   +'<span class="rsaid"></span></form>'
   +'</div>';
 }).join('');
 wireReplies(host,list);
 wirePaste(host);
 Array.prototype.forEach.call(host.querySelectorAll('.bub'),function(el,n){
  el.addEventListener('click',function(){
   if(!el.classList.contains('fresh'))return;
   el.classList.remove('fresh');
   el.classList.add('touched');
   ringFor(el);
   markOneSeen(list[n]);
   var b=el.querySelector('.badge');
   if(b){b.className='badge ok';b.textContent='נקרא';}
   renderNew();
  });
 });
}
var aSearchEl=document.getElementById('aSearch');
if(aSearchEl)aSearchEl.oninput=function(){ansQ=this.value.trim();ansShow=30;renderAnswers();};
document.getElementById('nH').onclick=function(){pane('h');};
document.getElementById('nQ').onclick=function(){pane('q');};
document.getElementById('nL').onclick=function(){pane('l');};
document.getElementById('nR').onclick=function(){pane('r');markReportsSeen();renderNextReport();};
document.getElementById('nM').onclick=function(){pane('m');markChatSeen();};
document.getElementById('nA').onclick=function(){pane('a');renderAnswers();};

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
// One card per pegasus update, newest first, three lines each. The reply
// box on top is the place he asked for to talk about the game.
// The screen behind the big button: what I got wrong, what I changed, and what
// it changes for him. He asked to be told how I keep improving myself.
function renderImprove(){
 var host=document.getElementById('growBox');
 if(!host)return;
 var G=D.improve||[];
 var c=document.getElementById('growCount');
 if(c)c.textContent=G.length;
 host.innerHTML=replyBox('על השיפורים')+(G.length?G.map(function(u){
  return '<div class="grow"><div class="w">'+esc(stamp(u.at))+' · '+esc(ago(u.at))+'</div>'
   +(u.what?'<div class="l"><b>מה שיניתי</b>'+esc(u.what)+'</div>':'')
   +(u.why?'<div class="l"><b>למה</b>'+esc(u.why)+'</div>':'')
   +(u.effect?'<div class="l"><b>מה זה משנה לך</b>'+esc(u.effect)+'</div>':'')
   +'</div>';
 }).join(''):'<div class="empty">עוד לא רשמתי כאן שיפור.</div>');
 wireBoxes(host);
}

// One search over everything I ever wrote him: chat, reports, the special
// requests and the improvements. He lost the link to the print page in the
// chat and asked for a way to find it again.
function searchAll(q){
 q=(q||'').trim();
 if(q.length<2)return [];
 var out=[];
 function add(kind,pane,title,at,text){
  if((text||'').indexOf(q)<0&&(title||'').indexOf(q)<0)return;
  out.push({kind:kind,pane:pane,title:title,at:at,text:text});
 }
 (D.special||[]).forEach(function(x){add('בקשות מיוחדות','y',x.title,x.at,(x.note||'')+' '+(x.url||''));});
 (D.reports||[]).forEach(function(x){add('דוח','r',x.title,x.at,x.body);});
 (D.chat||[]).forEach(function(x){add(x.from==='claude'?'הודעה ממני':'הודעה ממך','m','',x.at,x.text);});
 (D.improve||[]).forEach(function(x){add('שיפור','w',x.what,x.at,(x.why||'')+' '+(x.effect||''));});
 out.sort(function(a,b){return (a.at||'')<(b.at||'')?1:-1;});
 return out.slice(0,25);
}
function renderSearch(){
 var box=document.getElementById('gResults');
 var inp=document.getElementById('gSearch');
 if(!box||!inp)return;
 var q=inp.value.trim();
 if(q.length<2){box.innerHTML='';return;}
 var hits=searchAll(q);
 if(!hits.length){box.innerHTML='<div class="none">לא מצאתי כלום על '+esc(q)+'</div>';return;}
 box.innerHTML=hits.map(function(h,i){
  var t=String(h.text||'');
  var at=t.indexOf(q);
  var snip=at<0?t.slice(0,150):t.slice(Math.max(0,at-60),at+110);
  return '<div class="r" data-i="'+i+'"><b>'+esc(h.kind)+'</b>'
   +'<small>'+esc(stamp(h.at))+(h.title?' · '+esc(h.title):'')+'</small>'
   +'<span>'+esc(snip)+'</span></div>';
 }).join('');
 Array.prototype.forEach.call(box.querySelectorAll('.r'),function(el){
  el.onclick=function(){
   var h=hits[Number(el.getAttribute('data-i'))];
   pane(h.pane);
   if(h.pane==='y')renderSpecial();
   if(h.pane==='w')renderImprove();
   // Land on the line he searched for, not at the top of a long screen.
   setTimeout(function(){
    var host=document.getElementById(PANES[h.pane]);
    if(!host)return;
    var all=host.querySelectorAll('div,p,li');
    for(var i=0;i<all.length;i++){
     if((all[i].textContent||'').indexOf(q)>=0&&all[i].children.length<3){
      try{all[i].scrollIntoView({block:'center'});}catch(e){}
      all[i].style.outline='3px solid var(--accent)';
      all[i].style.borderRadius='10px';
      setTimeout(function(el2){return function(){el2.style.outline='';};}(all[i]),2600);
      break;
     }
    }
   },60);
  };
 });
}

// Which tile he actually taps, and which ones just take up room. Everything
// here lives in the browser, per device, and nothing is ever deleted: a hidden
// tile is one line away from coming back.
function tileStore(k,d){try{return JSON.parse(localStorage.getItem(k)||'')||d;}catch(e){return d;}}
function tileSave(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function tileLabel(id){
 var el=document.getElementById(id);
 var b=el&&el.querySelector('b');
 return b?b.textContent.replace(/^[^ ]+ /,''):id;
}
function tileIds(){
 return Array.prototype.map.call(document.querySelectorAll('#blkTiles .gt'),function(e){return e.id;});
}
function applyHidden(){
 var hid=tileStore('tilesHidden',[]);
 tileIds().forEach(function(id){
  var el=document.getElementById(id);
  if(el)el.hidden=hid.indexOf(id)>=0;
 });
 var back=document.getElementById('tidyBack');
 if(back)back.hidden=!hid.length;
}
function countTiles(){
 var since=tileStore('tilesSince',0);
 if(!since){since=Date.now();tileSave('tilesSince',since);}
 tileIds().forEach(function(id){
  var el=document.getElementById(id);
  if(!el||el.dataset.counted)return;
  el.dataset.counted='1';
  el.addEventListener('click',function(){
   var u=tileStore('tileUse',{});
   u[id]=(u[id]||0)+1;tileSave('tileUse',u);
  });
 });
}
function renderTidy(){
 var host=document.getElementById('tidyBox');
 if(!host)return;
 applyHidden();
 var since=tileStore('tilesSince',Date.now());
 var days=(Date.now()-since)/86400000;
 var hid=tileStore('tilesHidden',[]);
 var use=tileStore('tileUse',{});
 var snooze=tileStore('tidySnooze',0);
 var cold=tileIds().filter(function(id){return hid.indexOf(id)<0&&!use[id];});
 var parts=[];
 if(hid.length){
  parts.push('<div class="tidy"><b>מה הסתרנו</b>'
   +'<small>'+hid.map(function(id){return esc(tileLabel(id));}).join(', ')+'</small>'
   +'<div class="row2"><button type="button" id="tidyBack">להחזיר הכל</button></div></div>');
 }
 // Three days of use and at least three buttons he never touched, and I ask once.
 if(days>=3&&cold.length>=3&&Date.now()>snooze){
  parts.push('<div class="tidy"><b>המסך עמוס</b>'
   +'<small>שלושה ימים ולא נגעת ב'+cold.length+' כפתורים: '
   +cold.map(function(id){return esc(tileLabel(id));}).join(', ')
   +'. להסיר אותם מהמסך? שום דבר לא נמחק, הם חוזרים בלחיצה.</small>'
   +'<div class="row2"><button type="button" class="go" id="tidyGo">להסיר</button>'
   +'<button type="button" id="tidyNo">להשאיר</button></div></div>');
 }
 host.innerHTML=parts.join('');
 var back=document.getElementById('tidyBack');
 if(back)back.onclick=function(){tileSave('tilesHidden',[]);renderTidy();};
 var go=document.getElementById('tidyGo');
 if(go)go.onclick=function(){tileSave('tilesHidden',hid.concat(cold));renderTidy();};
 var no=document.getElementById('tidyNo');
 if(no)no.onclick=function(){tileSave('tidySnooze',Date.now()+7*86400000);renderTidy();};
}

function renderPin(){
 var host=document.getElementById('pinBox');
 if(!host)return;
 var S=D.special||[];
 if(!S.length){host.innerHTML='';return;}
 // The two most recent, because the thing he is hunting for is usually the
 // last one or the one before it.
 host.innerHTML=S.slice(0,2).map(function(u,i){
  return '<div class="pin"><div class="t"><div class="k">'+(i?'ולפני זה':'האחרון שביקשת')+'</div>'
   +'<b>'+esc(u.title||'')+'</b></div>'
   +(u.url?'<a href="'+esc(u.url)+'">פתיחה</a>':'')
   +'</div>';
 }).join('');
}

function markSpecialSeen(){
 var sp=(D.special||[]);
 if(!sp.length)return;
 try{localStorage.setItem('specialSeen',sp[0].at||'');}catch(e){}
 var el=document.getElementById('gSpecial');
 if(el){el.classList.remove('glow');var f=el.querySelector(':scope > .flag');if(f)f.remove();}
}

function renderSpecial(){
 var host=document.getElementById('specBox');
 if(!host)return;
 var S=D.special||[];
 host.innerHTML=replyBox('על הבקשות')+(S.length?S.map(function(u){
  return '<div class="spec"><div class="w">'+esc(stamp(u.at))+' · '+esc(ago(u.at))+'</div>'
   +'<b>'+esc(u.title)+'</b>'
   +(u.note?'<small>'+esc(u.note)+'</small>':'')
   +(u.copy?'<div class="cptext">'+esc(u.copy)+'</div>'
     +'<button type="button" class="cpbtn" data-t="'+esc(u.copy)+'">העתקת הטקסט</button>':'')
   +(u.url?'<a href="'+esc(u.url)+'">פתיחה</a>':'')
   +'</div>';
 }).join(''):'<div class="empty">עוד אין בקשה מוכנה כאן.</div>');
 Array.prototype.forEach.call(host.querySelectorAll('.cpbtn'),function(b){
  b.onclick=function(){
   var t=b.getAttribute('data-t')||'';
   var done=function(){b.textContent='הועתק';setTimeout(function(){b.textContent='העתקת הטקסט';},1600);};
   if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(done,function(){fallbackCopy(t,done);});
   }else fallbackCopy(t,done);
  };
 });
 wireBoxes(host);
}

function renderPegasus(){
 var host=document.getElementById('pegBox');
 if(!host)return;
 var P=D.pegasus||[];
 host.innerHTML=replyBox('על פגסוס')+(P.length?P.map(function(u,pi){
  return '<div class="peg'+(u.ask?' waiting':'')+'"><div class="w">'+esc(stamp(u.at))+' · '+esc(ago(u.at))+'</div>'
   +(u.did?'<div><b>מה נעשה</b>'+esc(u.did)+'</div>':'')
   +(u.now?'<div><b>מה קורה</b>'+esc(u.now)+'</div>':'')
   +(u.plan?'<div><b>מה מתוכנן</b>'+esc(u.plan)+'</div>':'')
   +(u.ask?'<div class="pask"><div class="q">מחכה לך: '+esc(u.ask)+'</div>'
     +(u.opts.length?'<div class="popts" data-p="'+pi+'">'+u.opts.map(function(o,oi){
        return '<button type="button" data-o="'+oi+'">'+esc(o)+'</button>';}).join('')+'</div>':'')
     +replyBox('פגסוס: '+u.ask)+'</div>':'')
   +'</div>';
 }).join(''):'<div class="empty">עוד אין עדכון מפגסוס.</div>');
 Array.prototype.forEach.call(host.querySelectorAll('.popts'),function(row){
  var u=P[Number(row.getAttribute('data-p'))];
  Array.prototype.forEach.call(row.querySelectorAll('button'),function(b){
   b.onclick=function(){
    var pick=u.opts[Number(b.getAttribute('data-o'))];
    Array.prototype.forEach.call(row.querySelectorAll('button'),function(x){x.disabled=true;});
    b.textContent='נבחר';
    sendText('תשובה מהמוניטור','פגסוס: '+u.ask+' ← '+pick,'בחירה').then(function(){
     toast('נבחר: '+pick+'. אני ממשיך לפי זה.');
    }).catch(function(){
     Array.prototype.forEach.call(row.querySelectorAll('button'),function(x){x.disabled=false;});
     b.textContent=pick;
     toast('הבחירה לא נשלחה. תנסה שוב.');
    });
   };
  });
 });
 wireBoxes(host);
}
on('gPegasus',function(){pane('x');renderPegasus();});
on('growBtn',function(){pane('w');renderImprove();});
on('gSpecial',function(){pane('y');renderSpecial();markSpecialSeen();});
(function(){
 var inp=document.getElementById('gSearch');
 if(inp)inp.oninput=renderSearch;
})();
function renderSent(){
 var L=lastSent();var card=document.getElementById('sentCard');
 if(!L){card.hidden=true;return;}
 card.hidden=false;
 var mine=(D.chat||[]).filter(function(m){return m.from==='itzik'&&(m.at||'')>=L.at;});
 var st=mine.length?(mine[mine.length-1].status||'received'):'';
 var reply=(D.chat||[]).some(function(m){return m.from==='claude'&&(m.at||'')>L.at;});
 var label=SENTLABEL[L.kind]||'הודעה';
 var t,sub,done=false,working=false;
 if(st==='done'||reply){t=label+' טופלה';sub='עניתי לך. לחץ כאן כדי לקרוא את התשובה.';done=true;}
 else if(st==='working'){
  // He said he loses track here: what did I get, and what am I doing with
  // it. So the card names the request and what is happening right now.
  var last=mine[mine.length-1];
  var what=String(last.text||'').replace(/\s+/g,' ').trim().slice(0,70);
  var doing=(D.now&&D.now.text)?D.now.text:'';
  t=label+' בעבודה';
  sub='קיבלתי: '+what+(doing?' · עכשיו: '+doing:'');
  working=true;
 }
 else if(st){t=label+' התקבלה';sub='נכנסה אליי, מחכה לטיפול.';}
 else{t=label+' נשלחה';sub='בדרך אליי. אני בודק את התיבה כל ארבע דקות.';}
 card.className='sent'+(done?' done':'')+(working?' working':'');
 card.innerHTML='<span class="s-dot"></span><div><b>'+esc(t)+'</b><small>'+esc(sub)+' · '+esc(stamp(L.at))+'</small></div>';
 card.style.cursor=done?'pointer':'';
 card.style.cursor=(done||working)?'pointer':'';
 card.onclick=(done||working)?function(){pane('m');renderThread();markChatSeen();}:null;
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
function lockOn(){
 try{return localStorage.getItem('lockOn')==='1';}catch(e){return false;}
}
function lockToggleRender(){
 var st=document.getElementById('lockState');
 var btn=document.getElementById('lockToggle');
 var on=lockOn();
 st.textContent=on?'מופעלת. המוניטור נעול בכל פתיחה.'
  :'כבויה. המוניטור נפתח ישר, בלי זיהוי.';
 btn.textContent=on?'כיבוי הנעילה':'הפעלת הנעילה';
}
document.getElementById('lockToggle').onclick=function(){
 var turningOn=!lockOn();
 if(turningOn&&!faceId()&&!myCode()){
  document.getElementById('lockState').textContent=
   'קודם מגדירים קוד או זיהוי פנים, אחרת אין דרך להיכנס.';
  return;
 }
 try{localStorage.setItem('lockOn',turningOn?'1':'0');}catch(e){}
 lockToggleRender();
};
lockToggleRender();

// ---- the lock ----
// The class was already put on <html> by the early script, so by the time this
// runs the app is hidden. All that is left is a way back in.
//
// This gates the screen on this device. It is not encryption: the page is
// public and the code lives in this browser's storage, so anyone with the
// address still sees the built page. It stops the person standing next to him,
// which is exactly what he asked for. A real gate needs a server.
function locked(){return /(^| )locked( |$)/.test(document.documentElement.className);}
function unlock(){
 document.documentElement.className=
  document.documentElement.className.replace(/(^| )locked( |$)/,' ').trim();
 // The bubbles were laid out while hidden, so the thread is drawn again.
 try{renderThread();renderSent();}catch(e){}
}
function lockSay(t){document.getElementById('lockSaid').textContent=t;}
function lockFaceTry(auto){
 if(!faceId()){
  // No face enrolled on this device, so the code is the only way in.
  document.getElementById('lockFace').hidden=true;
  if(!myCode()){unlock();return;}
  document.getElementById('lockRow').hidden=false;
  document.getElementById('lockUseCode').hidden=true;
  lockSay('תקליד את הקוד האישי כדי להיכנס.');
  return;
 }
 lockSay('ממתין לזיהוי פנים...');
 faceCheck(function(ok){
  if(ok){unlock();return;}
  lockSay(auto?'מזדהים כדי להיכנס.':'הזיהוי נכשל. אפשר לנסות שוב או להיכנס עם הקוד.');
 });
}
if(locked()){
 document.getElementById('lockFace').onclick=function(){lockFaceTry(false);};
 // Offering a code entry when no code was ever set would be a door that opens
 // onto a wall, so it is not offered at all.
 if(!myCode())document.getElementById('lockUseCode').hidden=true;
 document.getElementById('lockUseCode').onclick=function(){
  document.getElementById('lockRow').hidden=false;
  document.getElementById('lockCode').focus();
  lockSay('תקליד את הקוד האישי.');
 };
 var lockGo=function(){
  var v=document.getElementById('lockCode').value.trim();
  if(v&&v===myCode()){unlock();return;}
  document.getElementById('lockCode').value='';
  lockSay('קוד לא נכון.');
 };
 document.getElementById('lockGo').onclick=lockGo;
 document.getElementById('lockCode').addEventListener('keydown',function(e){
  if(e.key==='Enter')lockGo();
 });
 // Face ID is offered the moment the page opens, so in the good case he only
 // looks at the phone and he is in.
 setTimeout(function(){lockFaceTry(true);},220);
}

showCodeBox();

// Straight to the phone camera, no picker in between. Used by the camera tile
// and by the camera button that sits beside every message and every report.
function shoot(auto){
 var f=document.getElementById('fileForm');
 if(f)f.hidden=false;
 var pick=document.getElementById('fPick');
 if(!pick)return;
 autoSend=!!auto;
 setQ('normal');
 pick.setAttribute('accept','image/*');
 pick.setAttribute('capture','environment');
 pick.click();
}
document.getElementById('gCam').onclick=function(){
 pane('m');renderThread();
 shoot();
};

// ---- what he ate ----
// He sends a photo or a line; I look the values up and write the row back into
// the food collection. The screen only adds up and displays what is there.
var REPHOURS=[[8,17],[20,17]];
function nextReport(){
 var now=new Date();
 for(var i=0;i<REPHOURS.length;i++){
  var d=new Date(now);
  d.setHours(REPHOURS[i][0],REPHOURS[i][1],0,0);
  if(d>now)return d;
 }
 var t=new Date(now);
 t.setDate(t.getDate()+1);
 t.setHours(REPHOURS[0][0],REPHOURS[0][1],0,0);
 return t;
}
// Questions I am waiting on. Answering one sends it back through the same
// channel as everything else, and hides the card so it is not asked twice.
function answeredChoices(){
 try{return JSON.parse(localStorage.getItem('choicesDone')||'[]');}catch(e){return [];}
}
function renderAsk(){
 var host=document.getElementById('askBox');
 if(!host)return;
 var done=answeredChoices();
 var open=(D.choices||[]).filter(function(c){return done.indexOf(c.id)<0;});
 if(!open.length){host.innerHTML='';return;}
 var c=open[0];
 host.innerHTML='<div class="ask"><div class="q">'+esc(c.question)+'</div>'
  +'<div class="sub">תבחר אחת, ואני בונה לפי זה</div><div class="opts">'
  +c.options.map(function(o,i){return '<button type="button" data-i="'+i+'">'+esc(o)+'</button>';}).join('')
  +'</div></div>';
 Array.prototype.forEach.call(host.querySelectorAll('button'),function(b){
  b.onclick=function(){
   var pick=c.options[Number(b.getAttribute('data-i'))];
   Array.prototype.forEach.call(host.querySelectorAll('button'),function(x){x.disabled=true;});
   b.textContent='נבחר';
   sendText('תשובה מהמוניטור','בחירה: '+c.question+' ← '+pick,'בחירה').then(function(){
    var d=answeredChoices();d.push(c.id);
    try{localStorage.setItem('choicesDone',JSON.stringify(d));}catch(e){}
    toast('נבחר: '+pick+'. אני בונה לפי זה.');
    setTimeout(renderAsk,900);
   }).catch(function(){
    Array.prototype.forEach.call(host.querySelectorAll('button'),function(x){x.disabled=false;});
    b.textContent=pick;
    toast('הבחירה לא נשלחה. תנסה שוב.');
   });
  };
 });
}
function renderNextReport(){
 var el=document.getElementById('repWhen');
 if(!el)return;
 var d=nextReport();
 var mins=Math.max(0,Math.round((d-new Date())/60000));
 var hh=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
 var when=d.toDateString()===new Date().toDateString()?'היום':'מחר';
 var left=mins<60?('בעוד '+mins+' דקות'):('בעוד '+Math.round(mins/60)+' שעות');
 el.textContent=when+' ב-'+hh+', '+left;
}
setInterval(renderNextReport,60000);
on('repNow',function(){
 var b=this,said=document.getElementById('repSaid');
 b.disabled=true;said.textContent='מבקש.';
 sendText('בקשת דוח מהמוניטור','דוח עכשיו: תן לי דוח רשתות מעודכן','דוח').then(function(){
  said.textContent='ביקשתי. הדוח ייכנס לכאן בסבב הקרוב.';
  toast(said.textContent);
  markSent('text');renderSent();
 }).catch(function(){
  said.textContent='הבקשה לא עברה. תנסה שוב.';
 }).then(function(){b.disabled=false;});
});
document.getElementById('gFood').onclick=function(){pane('f');renderFood();};
on('gLolos',function(){pane('o');});
on('gOp',function(){pane('s');});
on('gNotes',function(){pane('t');renderNotes();});
on('gIdeas',function(){pane('i');renderIdeas();});
// The same list a new client sees on the first visit. Every line is written as
// his week, not as a feature: he recognises the problem before he understands
// the screen. What he taps becomes a request in my inbox.
var IDEAS=[
 {t:'לתעד כל דבר שאני אוכל',d:'מצלמים או אומרים במילה, וזה נרשם עם הקלוריות. בסוף השבוע יש תמונה של מה שבאמת אכלת, בלי לשאול אף אחד.'},
 {t:'לדעת מי פנה ולא קיבל תשובה',d:'כל פנייה מכל מקום נכנסת לתור אחד, ומי שמחכה יותר מדי נצבע.'},
 {t:'דוח בוקר על הטלפון',d:'מה קרה אתמול בעסק, בשלוש שורות, לפני הקפה הראשון.'},
 {t:'תזכורות שלא מפספסים',d:'ביטוח, רישיון, תשלום לספק, מסמך לרשות. המסך זוכר במקומך.'},
 {t:'מה נכנס החודש',d:'הכנסות והוצאות במקום אחד, בלי לחכות לרואה החשבון בסוף הרבעון.'},
 {t:'סריקת חשבוניות וקבלות',d:'מצלמים קבלה והיא נכנסת לרשימה מסודרת, גם לעסק וגם לחשבון הפרטי.'},
 {t:'מי הלקוחות שלי ומאיפה הם הגיעו',d:'רשימה אחת של אנשים, עם המקור שממנו כל אחד הגיע.'},
 {t:'עובד חדש שיודע איך עובדים כאן',d:'מה שכתוב במסך הוא ההדרכה. אין תלות במי שיושב פה חמש שנים.'},
 {t:'הכל נשאר גם כשאני בחופש',d:'המסך ממשיך לענות ולתעד, ואתה קורא כשנוח לך.'},
 {t:'תיק מסודר לעסק',d:'שנתיים של תיעוד מסודר הן ההבדל בין להראות לקונה תיק לבין לספר לו סיפור.'}
];
function ideaKey(t){return 'idea:'+t;}
function ideaDone(){
 try{return JSON.parse(localStorage.getItem('ideasAsked')||'[]');}catch(e){return[];}
}
function renderIdeas(){
 var asked=ideaDone();
 document.getElementById('ideaList').innerHTML=IDEAS.map(function(x,n){
  var on=asked.indexOf(x.t)>-1;
  return '<div class="idea"><b>'+esc(x.t)+'</b><p>'+esc(x.d)+'</p>'
   +'<button type="button" data-i="'+n+'"'+(on?' class="done"':'')+'>'
   +(on?'ביקשת. אני על זה':'רוצה את זה')+'</button></div>';
 }).join('');
 Array.prototype.forEach.call(document.querySelectorAll('#ideaList button'),function(b){
  b.onclick=function(){
   var x=IDEAS[Number(b.getAttribute('data-i'))];
   b.disabled=true;b.textContent='שולח.';
   sendText('רעיון מהמוניטור','רוצה את זה: '+x.t,'רעיון').then(function(){
    var a=ideaDone();
    if(a.indexOf(x.t)<0)a.push(x.t);
    try{localStorage.setItem('ideasAsked',JSON.stringify(a));}catch(e){}
    b.className='done';b.textContent='ביקשת. אני על זה';
    var p=pending();p.push({at:new Date().toISOString(),text:'רוצה את זה: '+x.t});savePending(p);
    markSent('text');renderSent();renderThread();
   }).catch(function(){
    b.textContent='לא נשלח. תנסה שוב';
   }).then(function(){b.disabled=false;});
  };
 });
}
on2('ideaForm','submit',function(e){
 e.preventDefault();
 var box=document.getElementById('ideaText');
 var said=document.getElementById('ideaSaid');
 var t=box.value.trim();
 if(!t)return;
 said.textContent='שולח.';
 sendText('רעיון מהמוניטור','רעיון שלי: '+t,'רעיון').then(function(){
  var p=pending();p.push({at:new Date().toISOString(),text:'רעיון שלי: '+t});savePending(p);
  box.value='';said.textContent='נשלח. אני חוזר אליך עם שתי דרכים לעשות את זה.';
  markSent('text');renderSent();renderThread();
 }).catch(function(){said.textContent='לא נשלח. תבדוק חיבור ותנסה שוב.';});
});

// Anything he adds about the operation goes to me as well as onto the screen,
// so a correction is never only on one device.
document.getElementById('opForm').onsubmit=function(e){
 e.preventDefault();
 var box=document.getElementById('opText');
 var said=document.getElementById('opSaid');
 var v=box.value.trim();
 if(!v)return;
 said.textContent='שולח.';
 sendText('ניתוח','ניתוח: '+v,'ניתוח').then(function(){
  box.value='';said.textContent='נשלח. אני מוסיף את זה.';toast(said.textContent);
 }).catch(function(){said.textContent='לא נשלח. תנסה שוב.';});
};

// Notes live on the device. He asked for somewhere nothing gets lost, and
// that means not depending on a round trip through me to save a line.
function notes(){
 try{return JSON.parse(localStorage.getItem('notes')||'[]');}catch(e){return [];}
}
function saveNotes(list){
 try{localStorage.setItem('notes',JSON.stringify(list));}catch(e){}
}
function renderNotes(){
 var host=document.getElementById('noteList');
 if(!host)return;
 var list=notes();
 if(!list.length){
  host.innerHTML='<div class="empty">אין פתקים. תכתוב אחד למעלה.</div>';
  return;
 }
 host.innerHTML=list.map(function(n,i){
  return '<div class="note-i" data-i="'+i+'">'+esc(n.text)
   +'<small>'+esc(stamp(n.at))+' · לחיצה ארוכה מוחקת</small></div>';
 }).join('');
 Array.prototype.forEach.call(host.querySelectorAll('.note-i'),function(el){
  var hold=null;
  el.addEventListener('pointerdown',function(){
   hold=setTimeout(function(){
    var l=notes();l.splice(Number(el.getAttribute('data-i')),1);saveNotes(l);
    try{navigator.vibrate&&navigator.vibrate(18);}catch(e){}
    renderNotes();toast('הפתק נמחק.');
   },600);
  });
  ['pointerup','pointercancel','pointermove','pointerleave'].forEach(function(ev){
   el.addEventListener(ev,function(){clearTimeout(hold);});
  });
 });
}
document.getElementById('noteForm').onsubmit=function(e){
 e.preventDefault();
 var box=document.getElementById('noteText');
 var v=box.value.trim();
 if(!v)return;
 var l=notes();
 l.unshift({text:v,at:new Date().toISOString()});
 saveNotes(l);box.value='';renderNotes();
};
on('lolosAsk',function(){askInChat('תצליב לי ');});
function todayKey(){return new Date().toISOString().slice(0,10);}
function renderFood(){
 var all=(D.food||[]).filter(function(f){return String(f.at||'').slice(0,10)===todayKey();});
 var sum=function(k){return all.reduce(function(a,f){return a+(Number(f[k])||0);},0);};
 document.getElementById('fdKcal').textContent=Math.round(sum('kcal'));
 document.getElementById('fdP').textContent=Math.round(sum('protein'))+'g';
 document.getElementById('fdC').textContent=Math.round(sum('carbs'))+'g';
 document.getElementById('fdF').textContent=Math.round(sum('fat'))+'g';
 var host=document.getElementById('fdList');
 if(!all.length){
  host.innerHTML='<div class="empty">עוד לא רשמנו היום כלום. תצלם את הצלחת או תכתוב מה אכלת, ואני מחזיר את הערכים.</div>';
  return;
 }
 host.innerHTML=all.map(function(f,i){
  return '<div class="fitem" data-i="'+i+'">'
   +'<div class="ft"><b>'+esc(f.name||'פריט')+'</b>'
   +'<span class="kc">'+Math.round(Number(f.kcal)||0)+' קלוריות</span></div>'
   +'<div class="macros">חלבון '+(Number(f.protein)||0)+'g · פחמימות '+(Number(f.carbs)||0)
   +'g · שומן '+(Number(f.fat)||0)+'g · '+esc(stamp(f.at))+'</div>'
   +(f.note?'<div class="more">'+esc(f.note)+'</div>':'')
   +'</div>';
 }).join('');
 Array.prototype.forEach.call(host.querySelectorAll('.fitem'),function(el){
  el.onclick=function(){el.classList.toggle('open');};
 });
}
document.getElementById('fdCam').onclick=function(){
 document.getElementById('fdPick').click();
};
document.getElementById('fdPick').addEventListener('change',function(){
 var list=this.files?Array.prototype.slice.call(this.files):[];
 if(!list.length)return;
 var said=document.getElementById('fdSaid');
 said.textContent='שולח את התמונה.';
 var typed=document.getElementById('fdText');
 var cap='תזונה: תמונה של מה שאכלתי';
 if(typed&&typed.value.trim()){cap='תזונה: '+typed.value.trim();typed.value='';}
 sendFiles(list,cap).then(function(how){
  said.textContent=how==='ntfy'?'נשלח בערוץ הגיבוי. אני מחשב ומחזיר לך.'
   :'נשלח. אני מחשב ומחזיר לך את הערכים.';
  toast(said.textContent);
  markSent('file');renderSent();
 }).catch(function(){said.textContent='לא נשלח. תבדוק חיבור ותנסה שוב.';});
 this.value='';
});
document.getElementById('fdForm').onsubmit=function(e){
 e.preventDefault();
 var box=document.getElementById('fdText');
 var said=document.getElementById('fdSaid');
 var btn=document.getElementById('fdBtn');
 var text=box.value.trim();
 if(!text)return;
 btn.disabled=true;said.textContent='שולח.';
 sendText('תזונה מהמוניטור','תזונה: '+text,'תזונה').then(function(how){
  box.value='';
  said.textContent='נשלח. אני מחשב ומחזיר לך את הערכים.';
  toast(said.textContent);
  markSent('text');renderSent();
 }).catch(function(){
  said.textContent='שני הערוצים לא ענו. תנסה שוב.';
 }).then(function(){btn.disabled=false;});
};

// The quick write row was removed from the home screen: the microphone card
// already offers writing, and he asked for one thing at the top and not two.
// The handler stays, guarded, so nothing breaks if the row ever returns.
on2('quickForm','submit',function(e){
 e.preventDefault();
 var box=document.getElementById('quickText');
 var said=document.getElementById('quickSaid');
 var btn=document.getElementById('quickBtn');
 if(!box||!said||!btn)return;
 var text=box.value.trim();
 if(!text)return;
 btn.disabled=true;said.textContent='שולח.';
 sendText('הודעה מהמוניטור',text,'הודעה').then(function(how){
  var p=pending();
  p.push({at:new Date().toISOString(),text:text});
  savePending(p);
  box.value='';
  said.textContent=how==='ntfy'?'נשלח בערוץ הגיבוי. הגיע אליי.':'נשלח. קלטתי.';
  markSent('text');renderSent();renderThread();
  toast(said.textContent);
 }).catch(function(){
  said.textContent='שני הערוצים לא ענו. תבדוק חיבור ותנסה שוב.';
 }).then(function(){btn.disabled=false;});
});

function askInChat(prefix){
 pane('m');markChatSeen();
 var box=document.getElementById('msgText');
 box.value=prefix;box.focus();
 try{box.setSelectionRange(box.value.length,box.value.length);}catch(e){}
}
document.getElementById('gChat').onclick=function(){pane('m');markChatSeen();};
document.getElementById('gQueue').onclick=function(){openNet('all');};
document.getElementById('gReports').onclick=function(){pane('r');markReportsSeen();renderNextReport();};
document.getElementById('gMail').onclick=function(){pane('e');};
document.getElementById('gPill').onclick=function(){pane('p');renderPill();openPillSheet();};
document.getElementById('pillBig').onclick=function(){openPillSheet();};
on('pillNow',function(){recordPill(Date.now());});
on('pillEarlier',function(){
 document.getElementById('pillTimeRow').hidden=false;
 document.getElementById('pillTime').focus();
});
on('pillOk',function(){
 var v=document.getElementById('pillTime').value;
 recordPill(ML.resolveTaken(v,Date.now()));
});
on('pillCancel',closePillSheet);
on('gAsk',function(){askInChat('');});
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
 sendText('הודעה מהמוניטור',text,'הודעה').then(function(how){
  var p=pending();
  p.push({at:new Date().toISOString(),text:text});
  savePending(p);
  box.value='';
  said.textContent=how==='ntfy'?'נשלח בערוץ הגיבוי. הגיע אליי.':'נשלח.';
  markSent('text');renderSent();
  renderThread();
 }).catch(function(){
  said.textContent='שני הערוצים לא ענו. תבדוק חיבור ותנסה שוב.';
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
// Two things were broken when the picker was opened from a reply row next to a
// message. The file input lives inside a form that starts hidden, and a phone
// ignores a click on an input inside a hidden container, so nothing happened
// at all. And even when it did open, the send button was inside that same
// hidden form, so a chosen photo had nowhere to go.
//
// The form is opened first, and a pick started from a reply sends itself.
var autoSend=false;
function openPicker(mode,accept,auto){
 var f=document.getElementById('fileForm');
 if(f)f.hidden=false;
 autoSend=!!auto;
 setQ(mode);
 fPick.setAttribute('accept',accept);
 fPick.click();
}
document.getElementById('qN').onclick=function(){openPicker('normal','image/*');};
document.getElementById('qF').onclick=function(){openPicker('full','image/*,video/*,audio/*,application/pdf');};
fPick.addEventListener('change',function(){
 describe();
 if(!autoSend)return;
 autoSend=false;
 var list=picked();
 if(!list.length)return;
 fBtn.disabled=true;
 sendSay(list.length>1?('מכין '+list.length+' קבצים.'):'מכין.');
 if(qMode==='normal')shrinkAll(list,reallySend);
 else reallySend(list);
});
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
 var cap=document.getElementById('fCap').value.trim();
 if(!cap){
  var m=document.getElementById('msgText');
  if(m&&m.value.trim()){cap=m.value.trim();m.value='';}
 }
 var voice=list.length===1&&/^voice-/.test(list[0].name);
 var deflt=voice?'הודעה קולית מהמוניטור'
   :(list.length>1?list.length+' קבצים מהמוניטור':'קובץ מהמוניטור');
 markSent(voice?'voice':'file');
 sendSay(list.length>1?('שולח '+list.length+' קבצים.'):'שולח.');
 // This used to be a plain form.submit(), which navigated away. When the
 // mailbox was over quota the whole page became a Rate Limit notice and the
 // recording was simply lost. Sending in place keeps the page, and lets the
 // backup channel take over without him noticing.
 sendFiles(list,cap||deflt).then(function(how){
  document.getElementById('fCap').value='';
  paintMics('ok');
  sendSay(how==='ntfy'?'נשלח בערוץ הגיבוי. הגיע אליי.':'נשלח. קלטתי.');
  var q=pending();
  q.push({at:new Date().toISOString(),text:cap||deflt});
  savePending(q);
  renderSent();renderThread();
 }).catch(function(){
  paintMics('bad');
  sendSay('ההקלטה לא הגיעה שלמה ולא נשמרה. תקליט שוב עכשיו, לפני שתשכח מה אמרת.');
 }).then(function(){fBtn.disabled=false;});
}
function sendSay(t){
 fSaid.textContent=t;
 var r=document.getElementById('recSaid');
 if(r)r.textContent=t;
 toast(t);
}
// Floats above every screen, because the microphone floats above every screen.
var toastTimer=null;
function toast(t){
 var el=document.getElementById('toast');
 if(!el)return;
 el.textContent=t;
 el.className='toast'+(/נשלח|קלטתי|הגיע/.test(t)?' good':(/לא ענו|לא נשלח/.test(t)?' bad':''));
 el.hidden=false;
 clearTimeout(toastTimer);
 toastTimer=setTimeout(function(){el.hidden=true;},4000);
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
// Arriving from a push notification. He taps the banner, lands in the chat,
// and then cannot find the message it was about: the thread is long and the
// answer sits among two hundred others. Now the screen jumps to the first
// unread bubble and lights it for a moment.
function jumpToUnread(){
 var host=document.getElementById('thread');
 if(!host)return;
 var el=host.querySelector('.bub.fresh');
 if(!el)return;
 try{el.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){el.scrollIntoView();}
 ringFor(el,2200);
}
// A push notification lands here. Straight to the unread screen, which is the
// only place he asked for: what is new, and nothing else.
if(location.hash==='#new'){
 pane('m');renderThread();
 setTimeout(function(){markChatSeen();renderNew();},50);
}
if(location.hash==='#chat'){
 pane('m');markChatSeen();
 setTimeout(jumpToUnread,350);
}
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
 if(recSec>=480)recStop();
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
 freeScreen();
 paintMics('send');
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
   if(recAbort){recAbort=false;recModal(false);recSaid.textContent='ההקלטה בוטלה.';recBtn.disabled=false;paintMics('idle');return;}
   recModal(false);
   var type=(rec&&rec.mimeType)||'audio/webm';
   var b=new Blob(recChunks,{type:type});
   if(!b.size){recSaid.textContent='לא נקלט כלום. תנסה שוב.';recBtn.disabled=false;paintMics('bad');return;}
   var ext=type.indexOf('mp4')>-1?'m4a':(type.indexOf('ogg')>-1?'ogg':'webm');
   // The name used to come from toISOString, which is UTC. Every memo then
   // carried a time three hours behind his, and a pill he took at 10:00 was
   // filed at 07:00. The stamp is built from the phone's own clock instead.
   var d=new Date(),p2=function(n){return (n<10?'0':'')+n;};
   var stampName='voice-'+d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())
    +p2(d.getHours())+p2(d.getMinutes())+p2(d.getSeconds())+'.'+ext;
   var file=new File([b],stampName,{type:type});
   recSaid.textContent='ההקלטה מוכנה, '+mb(file.size)+'. שולח.';
   recBtn.disabled=false;
   fBtn.disabled=true;
   reallySend(file);
  };
  rec.start();
  holdScreen();
  recModal(true);
  recBtn.disabled=false;
  paintMics('rec');
  recBtn.setAttribute('aria-label','עצירת ההקלטה ושליחה');
  recSaid.textContent='מקליט 0:00. לחיצה נוספת עוצרת ושולחת. עד שמונה דקות.';
  recTimer=setInterval(recTick,1000);
 }).catch(function(){
  recBtn.disabled=false;recModal(false);
  recSaid.textContent='אין הרשאה למיקרופון. תאשר אותה בהגדרות האתר בדפדפן ותנסה שוב.';
 });
}
// Keeping the screen alive while recording. Without it the phone sleeps and
// the recording ends mid sentence, which is exactly what he was seeing.
var wakeLock=null;
function holdScreen(){
 try{
  if(!navigator.wakeLock)return;
  navigator.wakeLock.request('screen').then(function(l){
   wakeLock=l;
   // iOS drops the lock when the tab is backgrounded, so take it again.
   l.addEventListener('release',function(){wakeLock=null;});
  }).catch(function(){});
 }catch(e){}
}
function freeScreen(){
 try{if(wakeLock){wakeLock.release();wakeLock=null;}}catch(e){}
}
document.addEventListener('visibilitychange',function(){
 if(document.visibilityState==='visible'&&rec&&rec.state==='recording')holdScreen();
});

function toggleRec(){
 if(rec&&rec.state==='recording'){recStop();return;}
 recStart();
}
recBtn.onclick=toggleRec;
document.getElementById('recBig').onclick=function(){recStop();};
var fabEl=document.getElementById('micFab');
// Drag it anywhere. A press that never moves is still a tap, so recording is
// not lost to a shaky finger.
// The microphone used to be draggable and it kept ending up over something
// else. He asked for it fixed at the bottom left, so the position is now in
// the stylesheet and any spot saved from the draggable version is cleared.
(function(){
 try{
  localStorage.removeItem('micPos');
  localStorage.removeItem('micCentred');
 }catch(e){}
 fabEl.addEventListener('click',function(){toggleRec();});
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
}).observe(recSaid,{childList:true,characterData:true,subtree:true});

// idle, rec, send, ok, bad. Every microphone on the page wears the same one.
var micTimer=null;
function paintMics(state){
 clearTimeout(micTimer);
 var ids=['micBtn','micFab','recBtn','recBig'];
 var label={rec:'מקליט, לחיצה עוצרת ושולחת',send:'שולח אליי',
  ok:'נשלח',bad:'לא נשלח',idle:'דבר אליי'}[state]||'דבר אליי';
 ids.forEach(function(id){
  var el=document.getElementById(id);
  if(!el)return;
  el.classList.remove('on','sending','sent','failed');
  if(state==='rec')el.classList.add('on');
  if(state==='send')el.classList.add('sending');
  if(state==='ok')el.classList.add('sent');
  if(state==='bad')el.classList.add('failed');
  el.setAttribute('aria-label',label);
 });
 // The finished states are a flash, not a mode, so they clear themselves.
 if(state==='ok'||state==='bad')micTimer=setTimeout(function(){paintMics('idle');},2600);
}
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
 host.innerHTML=all.map(function(m,i){
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
 sendText('בקשת מייל מהמוניטור',full,'בקשת מייל').then(function(how){
  var q=pending();
  q.push({at:new Date().toISOString(),text:full});
  savePending(q);
  box.value='';
  said.textContent=how==='ntfy'?'נשלח בערוץ הגיבוי. אני בודק כל ארבע דקות.'
   :'נשלח. אני בודק את התיבה כל ארבע דקות.';
  markSent('mail');renderSent();
  renderMail();renderThread();
 }).catch(function(){
  said.textContent='שני הערוצים לא ענו. תבדוק חיבור ותנסה שוב.';
 }).then(function(){btn.disabled=false;});
});

// Whatever he has dragged around, two things do not move: what is unread is
// always the first thing under the title, and the phone alerts and the
// personal code are always the last things on the screen.
function pinHome(home){
 if(!home)return;
 var top=document.getElementById('newBtn');
 if(top&&top.parentNode===home)home.insertBefore(top,home.firstChild);
 ['alerts','codeBox'].forEach(function(id){
  var el=document.getElementById(id);
  if(el&&el.parentNode===home)home.appendChild(el);
 });
}
(function(){
 var grid=document.querySelector('.grid');
 var home=document.getElementById('pH');
 if(grid){nameChildren(grid,'tile');applyOrder(grid,'tileOrder');armDrag(grid,'tileOrder');}
 if(home){nameChildren(home,'blk');applyOrder(home,'blockOrder');pinHome(home);armDrag(home,'blockOrder');}
})();
on('editDone',endEdit);
// The explicit way into arranging, for when the long press is not obvious.
on('arrangeBtn',function(){
 if(editing){endEdit();return;}
 var home=document.getElementById('pH');
 if(!home)return;
 pane('h');
 editing={box:home,key:'blockOrder'};
 document.body.classList.add('editing');
 home.classList.add('editbox');
 addHandles(home);
 showEditBar();
 toast('סידור המסך. גרור מהידית הכחולה.');
});
// Boot. Every one of these draws a different part of the page, and until now a
// throw in any of them stopped the rest, including the pane() at the end that
// decides which screen is visible. The result on his phone was a blank page and
// "the site is not coming up", with nothing to say what happened. Each step is
// now on its own, and the screen opens even if one of them fails.
// One button for the backlog: every answer of mine up to the cutoff (or all
// of them) becomes read and handled, the count drops to zero, and only what
// arrives afterwards turns red again.
function markAllRead(cutoff){
 try{
  var seen=seenIds(),t=touchedIds();
  (D.chat||[]).forEach(function(m){
   if(m.from!=='claude')return;
   if(cutoff&&(m.at||'')>cutoff)return;
   var k=claudeKey(m);
   if(seen.indexOf(k)<0)seen.push(k);
   if(t.indexOf(k)<0)t.push(k);
  });
  localStorage.setItem('chatSeenIds',JSON.stringify(seen.slice(-2000)));
  localStorage.setItem('chatTouched',JSON.stringify(t.slice(-2000)));
  localStorage.setItem('chatSeen',newestClaude());
 }catch(e){}
 paintDot();renderNew();renderThread();
}
on('readOld',function(){markAllRead();toast('הכל סומן כנקרא. מה שיגיע מעכשיו יהיה אדום.');});
var bootFailed=[];
function boot(name,fn){try{fn();}catch(e){bootFailed.push(name);try{console.error('boot '+name,e);}catch(_){}}}
boot('report',renderNextReport);
boot('pegasus',renderPegasus);
boot('improve',renderImprove);
boot('special',renderSpecial);
boot('pin',renderPin);
boot('tidy',function(){countTiles();renderTidy();});
// A link like #pegasus or #special lands straight on that screen.
boot('hash',function(){
 var h=(location.hash||'').replace('#','');
 if(!h)return;
 var k=paneOf(h);
 if(!k||k==='h')return;
 pane(k);
 if(k==='x')renderPegasus();
 if(k==='y'){renderSpecial();markSpecialSeen();}
 if(k==='w')renderImprove();
});
boot('ask',renderAsk);
boot('items',render);
boot('thread',renderThread);
boot('pill',renderPill);
boot('mail',renderMail);
boot('dot',updateDot);
// The last word on which screen opens. This runs after everything else, so a
// plain pane('h') here quietly undid the notification landing above: he tapped
// the banner and got the home screen with no sign of what was new.
boot('reset',function(){
 var stamp=D.resetSeenAt||'';
 if(!stamp)return;
 var done='';
 try{done=localStorage.getItem('seenResetAt')||'';}catch(e){}
 if(done>=stamp)return;
 markAllRead(stamp);
 try{localStorage.setItem('seenResetAt',stamp);}catch(e){}
});
boot('pane',function(){
 if(location.hash==='#new'){pane('m');renderThread();}
 else if(location.hash==='#chat'){pane('m');}
 else pane('h');
});
// If the pane itself could not be chosen, the page would be blank. Home is the
// one screen that is always in the HTML, so it is the floor to fall back to.
if(bootFailed.indexOf('pane')>-1){try{pane('h');}catch(e){var h=document.getElementById('pH');if(h)h.hidden=false;}}
if(bootFailed.length){
 var w=document.createElement('div');
 w.className='bootwarn';
 w.innerHTML='<b>חלק מהמסך לא נטען.</b><br>מה שכן נטען עובד. תלחץ רענון, ואם זה חוזר תגיד לי.'
  +' <button type="button" id="bootReload">רענון</button>';
 var host=document.getElementById('pH')||document.body;
 host.insertBefore(w,host.firstChild);
 var rb=document.getElementById('bootReload');
 if(rb)rb.onclick=function(){location.reload();};
}
</script>
</body>
</html>`;

module.exports = { renderPage, build };
if (require.main === module) build();
