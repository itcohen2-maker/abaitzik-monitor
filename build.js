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
    .map(r => ({ title: r.title, at: r.at, body: r.body }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? 1 : -1));

  const chat = loadDocs('chat')
    .map(m => ({ at: m.at, from: m.from, text: m.text }))
    .sort((a, b) => ((a.at || '') < (b.at || '') ? -1 : 1));

  const payload = {
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
<title>מוניטור אבא איציק</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&family=Heebo:wght@300;400;500;700&display=swap">
<style>
:root{--ground:#faf7f2;--surface:#fff;--sunk:#f2ede4;--ink:#22201c;--dim:#6e675d;
 --line:#e6e0d5;--accent:#14675a;--accent-soft:#dfece8;--wait:#a8681a;
 --shadow:0 1px 2px rgba(40,32,20,.06)}
@media (prefers-color-scheme:dark){:root{--ground:#191714;--surface:#221f1b;--sunk:#1f1c18;
 --ink:#f0ece5;--dim:#9b9387;--line:#35312b;--accent:#4fb3a0;--accent-soft:#1d3630;
 --wait:#d99b45;--shadow:none}}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);direction:rtl;
 font:400 16px/1.65 Heebo,system-ui,"Segoe UI",Arial,sans-serif}
.wrap{max-width:620px;margin:0 auto;padding:22px 18px 64px}
h1{font:700 27px/1.2 "Frank Ruhl Libre",Georgia,serif;margin:0 0 6px;text-wrap:balance}
.sub{color:var(--dim);font-size:14px;font-weight:300}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:22px 0 26px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:11px;
 padding:13px 14px;box-shadow:var(--shadow)}
.tile .k{font-size:12px;color:var(--dim)}
.tile .v{font:500 28px/1.15 "Frank Ruhl Libre",Georgia,serif;
 font-variant-numeric:tabular-nums;margin-top:3px}
.tile.wait .v{color:var(--wait)}
h2{font:500 15px/1.3 Heebo,sans-serif;margin:0 0 11px;color:var(--dim);letter-spacing:.04em}
section{margin-bottom:30px}
.seg{display:flex;gap:4px;background:var(--sunk);border-radius:10px;padding:4px;margin-bottom:14px}
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
.bub.pend{opacity:.6}
.hint{font-size:13px;color:var(--dim);font-weight:300;margin-top:14px;line-height:1.6}
#msgForm{display:flex;flex-direction:column;gap:10px}
#msgText{width:100%;min-height:74px;resize:vertical;background:var(--surface);
 color:var(--ink);border:1px solid var(--line);border-radius:11px;padding:12px 14px;
 font:400 16px/1.6 Heebo,sans-serif;box-shadow:var(--shadow)}
#msgText::placeholder{color:var(--dim);font-weight:300}
#msgText:focus-visible,#msgBtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#msgBtn{align-self:flex-start;background:var(--accent);color:#fff;border:0;
 border-radius:10px;padding:11px 26px;font:500 15px Heebo,sans-serif;cursor:pointer}
#msgBtn[disabled]{opacity:.5;cursor:default}
.msgsaid{color:var(--accent);font-size:14px;min-height:20px;margin-top:9px}
.note{font-size:13px;color:var(--dim);font-weight:300;border-top:1px solid var(--line);
 padding-top:14px;margin-top:30px}
.note b{color:var(--ink);font-weight:500}
</style>
</head>
<body>
<div class="wrap">
<h1>מוניטור אבא איציק</h1>
<div class="sub">מי פנה, מה נענה, ומה עוד מחכה.</div>

<div class="tiles">
 <div class="tile wait"><div class="k">ממתין לתשובה</div><div class="v" id="tP">0</div></div>
 <div class="tile"><div class="k">נענה היום</div><div class="v" id="tT">0</div></div>
 <div class="tile wait"><div class="k">אנשי קשר פתוחים</div><div class="v" id="tL">0</div></div>
</div>

<div class="seg" role="group" aria-label="מסך">
 <button type="button" id="nQ" aria-pressed="true">התור</button>
 <button type="button" id="nL" aria-pressed="false">אנשי קשר</button>
 <button type="button" id="nR" aria-pressed="false">דוחות</button>
 <button type="button" id="nM" aria-pressed="false">צ׳אט<span class="dot" id="mDot" hidden></span></button>
</div>

<section id="pQ">
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

<section id="pR" hidden>
 <h2>דוחות הסבבים</h2>
 <div id="reports"></div>
</section>

<section id="pM" hidden>
 <div class="thread" id="thread"></div>
 <form id="msgForm">
  <textarea id="msgText" rows="2"
   placeholder="כתוב כאן. תשובה, בקשה, או מישהו חדש שפנה אליך"></textarea>
  <button type="submit" id="msgBtn">שליחה</button>
 </form>
 <div class="msgsaid" id="msgSaid"></div>
 <div class="hint">
  מה שאתה כותב מגיע למייל שלי ואני קורא אותו בסבב הקרוב.
  התשובות שלי מופיעות כאן למעלה.
 </div>
</section>

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
 document.getElementById('built').textContent='עודכן לפני '+ago(D.builtAt)+'.';
}
function pending(){
 try{return JSON.parse(localStorage.getItem('pendingMsgs')||'[]');}catch(e){return[];}
}
function savePending(a){
 try{localStorage.setItem('pendingMsgs',JSON.stringify(a));}catch(e){}
}
function renderThread(){
 var baked=(D.chat||[]).slice();
 var sent=baked.filter(function(m){return m.from==='itzik';})
   .map(function(m){return String(m.text).trim();});
 var still=pending().filter(function(p){return sent.indexOf(p.text.trim())===-1;});
 savePending(still);
 var all=baked.map(function(m){return{at:m.at,from:m.from,text:m.text,pend:false};})
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
   +(m.pend?' · ממתין':'')+'</span>'+esc(m.text)+'</div>';
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
function updateDot(){
 var d=document.getElementById('mDot');if(!d)return;
 var n=newestClaude();
 d.hidden=!(n&&n>chatSeen());
 document.title=(d.hidden?'':'(1) ')+'המוניטור של אבא איציק';
}
function pane(w){
 document.getElementById('pQ').hidden=w!=='q';
 document.getElementById('pL').hidden=w!=='l';
 document.getElementById('pR').hidden=w!=='r';
 document.getElementById('pM').hidden=w!=='m';
 document.getElementById('nQ').setAttribute('aria-pressed',w==='q');
 document.getElementById('nL').setAttribute('aria-pressed',w==='l');
 document.getElementById('nR').setAttribute('aria-pressed',w==='r');
 document.getElementById('nM').setAttribute('aria-pressed',w==='m');
}
document.getElementById('nQ').onclick=function(){pane('q');};
document.getElementById('nL').onclick=function(){pane('l');};
document.getElementById('nR').onclick=function(){pane('r');};
document.getElementById('nM').onclick=function(){pane('m');markChatSeen();};
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
  body:JSON.stringify({_subject:'הודעה מהמוניטור',_template:'table',הודעה:text})
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

pane('q');
render();
renderThread();
updateDot();
</script>
</body>
</html>`;

build();
