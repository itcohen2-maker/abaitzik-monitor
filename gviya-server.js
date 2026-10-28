'use strict';
/*
  לוח הגבייה של יואל, 28.10.2026. איציק ביקש דף שהוא שולח ליואל, יואל מסמן מי
  לגבות / מי שילם ומוסיף הערות, וכל שמירה מעדכנת את איציק (push).

  שירות קטן בלי תלויות, מאחורי Caddy על ilay.abaitzik.com תחת /gviya/*.
  המצב משותף (כולם רואים את אותם סימונים), כך שגם איציק פותח את אותו קישור ורואה
  מה יואל סימן. רשימת החייבים נקראת חיה מ data/rivhit/rivhit דרך lolos-share,
  אז היא תמיד מעודכנת כמו ה PDF.

  מסלולים (token בכתובת = הסוד; מי שיש לו את הקישור נכנס):
    GET  /gviya/<token>/           דף הלוח
    GET  /gviya/<token>/state      { marks, at }
    POST /gviya/<token>/mark       { name, status, note }  -> שומר ודוחף לאיציק
    GET  /gviya/health             ללא token
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const GDIR = path.join(DATA, 'gviya');
const MARKS = path.join(GDIR, 'marks.json');
const TOKF = path.join(GDIR, 'token.txt');
const PORT = 8795;
const share = require('./lib/lolos-share.js');

fs.mkdirSync(GDIR, { recursive: true });
let TOKEN;
try { TOKEN = fs.readFileSync(TOKF, 'utf8').trim(); } catch (e) {}
if (!TOKEN) { TOKEN = crypto.randomBytes(9).toString('hex'); fs.writeFileSync(TOKF, TOKEN + '\n'); }
const MAIL_TO = '100lolos@gmail.com';
const MAIL_SUBJECT = 'לולוס · עדכוני גבייה מיואל';

function readMarks() { try { return JSON.parse(fs.readFileSync(MARKS, 'utf8')); } catch (e) { return {}; } }
function writeMarks(m) { fs.writeFileSync(MARKS, JSON.stringify(m, null, 1) + '\n'); }
function ils(n) { return '₪ ' + Math.round(n).toLocaleString('en-US'); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// --- push to Itzik, debounced so a burst of marks becomes one message ---
let pushTimer = null, pushSince = 0;
function schedulePush() {
  const now = Date.now();
  if (!pushSince) pushSince = now;
  if (pushTimer) clearTimeout(pushTimer);
  const waited = now - pushSince;
  const delay = waited > 90000 ? 0 : 25000; // force after 90s of activity
  pushTimer = setTimeout(sendPush, delay);
}
function sendPush() {
  pushTimer = null; pushSince = 0;
  // מתג: שליחה מתבצעת רק אם קיים הקובץ data/gviya/live. בלי זה הלוח נשמר בשקט, בלי push/מייל.
  if (!fs.existsSync(path.join(GDIR, 'live'))) return;
  const data = share.readDebts(DATA) || { debts: [] };
  const marks = readMarks();
  const byName = {}; data.debts.forEach(d => byName[d.name] = d.amount);
  const collect = [], paid = [];
  Object.keys(marks).forEach(n => {
    const s = marks[n] || {};
    if (s.status === 'collect') collect.push({ n, a: byName[n] || 0, note: s.note || '' });
    else if (s.status === 'paid') paid.push({ n, note: s.note || '', when: s.paidWhen || '' });
  });
  const collectSum = collect.reduce((a, c) => a + c.a, 0);
  const link = 'https://lolos.abaitzik.com/gviya/' + TOKEN + '/';
  let body = 'עדכון גבייה מיואל — ' + new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) + '\n\n';
  body += '✋ אני על זה (' + collect.length + ', ' + ils(collectSum) + '):\n';
  body += (collect.length ? collect.map(c => ' • ' + c.n + ' — ' + ils(c.a) + (c.note ? '  [' + c.note + ']' : '')).join('\n') : ' —');
  body += '\n\n✅ גבה, הצ׳ק אצלו (' + paid.length + '):\n';
  body += (paid.length ? paid.map(c => ' • ' + c.n + (c.when ? ' · ' + c.when : '') + (c.note ? '  [' + c.note + ']' : '')).join('\n') : ' —');
  const cmts = [];
  Object.keys(marks).forEach(n => { const cs = (marks[n] || {}).comments; if (Array.isArray(cs) && cs.length) { const l = cs[cs.length - 1]; cmts.push(' • ' + n + ' — ' + (l.w ? l.w + ': ' : '') + l.t); } });
  if (cmts.length) body += '\n\n💬 תגובות אחרונות:\n' + cmts.slice(0, 8).join('\n');
  body += '\n\nהלוח: ' + link;
  // push קצר לאיציק
  let short = 'אני על זה: ' + collect.length + ' (' + ils(collectSum) + '), גבה והצ׳ק אצלו: ' + paid.length + '.';
  if (collect.length) short += '\n' + collect.slice(0, 4).map(c => '• ' + c.n).join('\n');
  short += '\n' + link;
  execFile(process.execPath, [path.join(ROOT, 'notify.js'), 'גבייה: יואל עדכן', short], { cwd: ROOT }, () => {});
  // מייל מפורט ל 100lolos דרך SMTP 587, נושא קבוע => שרשור בתיבה המשותפת
  try {
    const mp = spawn('python3', [path.join(ROOT, 'tools', 'lolos-mail-send.py'), MAIL_TO, MAIL_SUBJECT], { cwd: ROOT });
    mp.on('error', () => {}); mp.stdin.on('error', () => {});
    mp.stdin.write(body); mp.stdin.end();
  } catch (e) {}
}

// --- the board page ---
function page() {
  const data = share.readDebts(DATA) || { debts: [], cheques: [] };
  const debts = data.debts.map((d, i) => ({
    i: i + 1, name: d.name, total: d.amount, first: d.sub || d.first || '',
    inv: (d.inv || []).map(v => ({ n: v.n, d: v.date, a: v.amount, left: v.left }))
  }));
  const cheques = (data.cheques || []).map(c => ({ name: c.name, amount: c.amount, date: c.date, no: c.no, bank: c.bank }));
  const boot = { debts, cheques, marks: readMarks(), token: TOKEN, total: debts.reduce((a, d) => a + d.total, 0) };
  return HTML.replace('__BOOT__', JSON.stringify(boot).replace(/</g, '\\u003c'));
}

const HTML = `<!DOCTYPE html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>גבייה לולוס</title>
<style>
:root{--bg:#f3f5f8;--card:#fff;--ink:#1d2735;--sub:#6b7684;--accent:#2d6cdf;--paid:#1ca167;--paidbg:#e7f6ee;--collect:#e0842b;--collectbg:#fdf1e3;--future:#3b6fb0;--chip:#eef2f7;--line:#e3e8ef;--shadow:0 1px 3px rgba(20,30,50,.08)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0}
body{font-family:-apple-system,"Segoe UI",Arial,"Noto Sans Hebrew",sans-serif;background:var(--bg);color:var(--ink);padding:0 14px 40px;line-height:1.4}
.wrap{max-width:720px;margin:0 auto}
header{padding:18px 2px 8px}h1{font-size:21px;margin:0 0 2px}.date{color:var(--sub);font-size:13px}
.hello{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 15px;margin:12px 0;font-size:14.5px;box-shadow:var(--shadow)}
.hello b{color:var(--accent)}
.sync{font-size:12px;color:var(--sub);margin:2px 2px 0;min-height:16px}
.sync.ok{color:var(--paid)}.sync.err{color:#c0392b}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);padding:9px 0;margin-bottom:4px}
.bar .box{background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);display:flex;justify-content:space-around;text-align:center;padding:9px 6px}
.bar .n{font-size:17px;font-weight:700;display:block}.bar .l{font-size:11px;color:var(--sub)}
.c{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);margin:10px 0;overflow:hidden;transition:.2s}
.c.s-collect{border:2px solid var(--collect);border-right:7px solid var(--collect);background:#ffe3c2;box-shadow:0 3px 12px rgba(224,132,43,.3)}
.c.s-paid{border:2px solid var(--paid);border-right:7px solid var(--paid);background:#cdeedd;box-shadow:0 3px 12px rgba(28,161,103,.28)}
.c.s-future{border:2px solid var(--future);border-right:7px solid var(--future);background:#dde9f6;box-shadow:0 3px 12px rgba(59,111,176,.22)}
.badge{font-size:0;margin:0 15px 12px}
.badge.bc,.badge.bp{display:inline-block;font-size:12px;font-weight:800;padding:4px 12px;border-radius:20px;color:#fff;white-space:nowrap}
.badge.bc{background:var(--collect)}
.badge.bp{background:var(--paid)}
.badge.bf{background:var(--future)}
.whenrow{display:none;padding:0 15px 10px;font-size:13px;color:var(--sub);align-items:center;gap:8px}
.whenrow input,.duerow input{font-family:inherit;font-size:13.5px;padding:5px 9px;border:1px solid var(--line);border-radius:8px;background:#fbfcfe;color:var(--ink)}
.duerow{display:none;padding:0 15px 10px;font-size:13px;color:var(--sub);align-items:center;gap:8px}
.bfut{display:block;width:calc(100% - 30px);margin:2px 15px 4px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);font-weight:600;padding:9px 4px;border-radius:10px;font-family:inherit;font-size:13.5px;cursor:pointer}
.bfut.on{background:var(--future);border-color:var(--future);color:#fff}
.top{display:flex;align-items:baseline;gap:9px;padding:13px 15px 8px}
.idx{color:#b3bcc9;font-size:13px;min-width:20px;font-weight:600}.nm{flex:1;font-size:16px;font-weight:600}.amt{font-size:16.5px;font-weight:700;white-space:nowrap}
.first{font-size:11.5px;color:var(--sub);padding:0 15px 0 46px}
.invs{padding:4px 15px 2px 46px}.inv{display:flex;justify-content:space-between;font-size:12.5px;color:var(--sub);padding:2px 0;border-top:1px dashed var(--line)}
.inv .of{font-size:11px;opacity:.75}
.acts{display:flex;gap:8px;padding:10px 15px}
.acts button{flex:1;border:1.5px solid var(--line);background:var(--card);color:var(--ink);font-size:14px;font-weight:600;padding:9px 4px;border-radius:10px;cursor:pointer;font-family:inherit}
.acts .b-paid.on{background:var(--paid);border-color:var(--paid);color:#fff}
.acts .b-collect.on{background:var(--collect);border-color:var(--collect);color:#fff}
.noteWrap{padding:0 15px 13px}
.notelbl{font-size:12px;font-weight:700;color:var(--sub);margin:8px 0 2px}
.mebar{font-size:13px;color:var(--sub);margin:4px 2px 2px;display:flex;align-items:center;gap:8px}
.mebar input{flex:1;max-width:240px;font-family:inherit;font-size:13.5px;padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink)}
.thread{padding:0 15px}
.cmt{background:#eef3f9;border-radius:10px;padding:7px 11px;margin:6px 0}
.cmt .cmeta{font-size:11px;color:var(--sub);margin-bottom:2px}
.cmt .ctext{font-size:14px;white-space:pre-wrap;word-break:break-word}
.addc{display:flex;gap:8px;padding:4px 15px 14px}
.addc input{flex:1;font-family:inherit;font-size:14px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#fbfcfe;color:var(--ink)}
.addc button{border:0;background:var(--accent);color:#fff;font-weight:700;padding:0 16px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px}
textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:14px;font-family:inherit;resize:vertical;min-height:38px;background:#fbfcfe;color:var(--ink)}
textarea::placeholder{color:#aab3c0}
h2{font-size:15px;margin:22px 2px 4px;color:var(--sub)}
.cq{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:6px 15px;margin:8px 0}
.cq .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:9px 0;border-top:1px solid var(--line);font-size:13.5px}
.cq .row:first-child{border-top:0}.cq .cn{font-weight:600}.cq .meta{color:var(--sub);font-size:11.5px}.cq .ca{font-weight:700;white-space:nowrap}
.cq .done{font-size:11.5px;color:var(--paid);font-weight:700;margin-top:3px}
.sharebar{text-align:center;margin:26px 0 6px}
.sharebtn{border:0;background:none;font-size:11px;opacity:.22;padding:4px 6px;cursor:pointer;font-family:inherit;filter:grayscale(1)}
.sharebtn:hover,.sharebtn:active{opacity:.85;filter:none}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#1d2735;color:#fff;padding:10px 18px;border-radius:30px;font-size:13.5px;opacity:0;transition:.25s;pointer-events:none;z-index:9}
.toast.on{opacity:1}
</style></head><body><div class="wrap">
<header><h1>גבייה לולוס</h1><div class="date" id="date"></div></header>
<div class="hello">יואל, לכל לקוח סַמֵּן <b>✋ אני על זה</b> או <b>✅ גביתי, הצ׳ק אצלי</b>, ואפשר להוסיף תגובה מתחת לשם. <b>כל סימון נשמר ונשלח אוטומטית, ומעדכן את הטופס אצל כולם — גם אצל איציק וגם אצל יואל.</b> לא צריך לשלוח כלום.</div><div class="sync" id="sync"></div>
<div class="bar"><div class="box">
<div><span class="n" id="cCollect">0</span><span class="l">אני על זה</span></div>
<div><span class="n" id="cPaid">0</span><span class="l">גביתי</span></div>
<div><span class="n" id="cNone">0</span><span class="l">לא סומן</span></div>
<div><span class="n" id="openTot">0</span><span class="l">נותר ₪</span></div>
</div></div>
<div class="mebar">אני: <input id="meInput" placeholder="השם שלך (יואל / איציק)" autocomplete="off"></div>
<div id="list"></div>
<h2>צ׳קים עתידיים שנמצאים אצלנו</h2><div class="cq" id="cqBox"></div>
<div class="sharebar"><button type="button" id="shareBtn2" class="sharebtn" aria-label="שיתוף">🔗</button></div>
</div>
<div class="toast" id="toast"></div>
<script id="boot" type="application/json">__BOOT__</script>
<script>
var B=JSON.parse(document.getElementById('boot').textContent);
var BASE='/gviya/'+B.token+'/';
(function(){var sb=document.getElementById('shareBtn2');if(!sb)return;sb.onclick=function(){if(navigator.share){navigator.share({title:'גבייה לולוס',url:location.href}).catch(function(){});}else{window.open('https://wa.me/?text='+encodeURIComponent('גבייה לולוס: '+location.href),'_blank');}};})();
var marks=B.marks||{};
var ME=(function(){try{return localStorage.getItem('gviya-me')||'';}catch(e){return '';}})();
(function(){var mi=document.getElementById('meInput');if(mi){mi.value=ME;mi.oninput=function(){ME=mi.value;try{localStorage.setItem('gviya-me',ME);}catch(e){}};}})();
function ils(n){return '₪ '+Math.round(n).toLocaleString('en-US');}
function fmtD(s){var p=(s||'').split('-');return p.length===3?p[2]+'.'+p[1]:(s||'');}
document.getElementById('date').textContent='נכון ל '+new Date().toLocaleDateString('he-IL')+' · '+B.debts.length+' לקוחות · סה״כ '+ils(B.total);
var list=document.getElementById('list');
B.debts.forEach(function(d){
  var card=document.createElement('div');card.className='c';card.dataset.name=d.name;
  var invs=d.inv.map(function(v){var p=(v.left!=null&&v.left!==v.a);return '<div class="inv"><span>חשבונית '+v.n+' · '+v.d+'</span><span>'+ils(p?v.left:v.a)+(p?' <span class="of">מתוך '+ils(v.a)+'</span>':'')+'</span></div>';}).join('');
  card.innerHTML='<div class="top"><span class="idx">'+d.i+'</span><span class="nm">'+esc(d.name)+'</span><span class="amt">'+ils(d.total)+'</span></div>'+
   (d.first?'<div class="first">'+esc(d.first)+'</div>':'')+'<div class="invs">'+invs+'</div>'+
   '<div class="acts"><button class="b-collect">✋ אני על זה</button><button class="b-paid">✅ גביתי, הצ׳ק אצלי</button></div>'+'<div class="rowtag" data-badge></div>'+'<div class="whenrow"><span>נגבה בתאריך</span> <input type="date" class="whend"></div>'+
   '<div class="notelbl" style="padding:0 15px">💬 תגובות</div>'+'<div class="thread" data-thread></div>'+'<div class="addc"><input class="cin" placeholder="כתוב תגובה..." autocomplete="off"><button type="button" class="cadd">שלח</button></div>';
  var st=marks[d.name]||{};
  var bc=card.querySelector('.b-collect'),bp=card.querySelector('.b-paid');
  var wd=card.querySelector('.whend'); if(st.paidWhen)wd.value=st.paidWhen;
  wd.onchange=function(){marks[d.name]=Object.assign(marks[d.name]||{},{paidWhen:wd.value});applyStatus(card,(marks[d.name]||{}).status);save(d.name,{paidWhen:wd.value});};
  bc.onclick=function(){setStatus(d.name,card,(cur(d.name)==='collect')?null:'collect');};
  bp.onclick=function(){setStatus(d.name,card,(cur(d.name)==='paid')?null:'paid');};
  renderThread(card,d.name);
  var cin=card.querySelector('.cin'),cadd=card.querySelector('.cadd');
  function sendC(){var txt=(cin.value||'').trim();if(!txt)return;addComment(d.name,txt,card);cin.value='';}
  cadd.onclick=sendC;
  cin.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();sendC();}});
  applyStatus(card,st.status);list.appendChild(card);
});
var cq=document.getElementById('cqBox');
cq.innerHTML=(B.cheques.length?B.cheques:[]).map(function(c){var owes=B.debts.some(function(d){return d.name===c.name;});var done=owes?'<div class="done" style="color:var(--sub)">✓ הצ׳ק נגבה · ללקוח נותר חוב פתוח ברשימה</div>':'<div class="done">✓ הסתיים הטיפול, הכרטיס נסגר · לא קיים יותר חוב</div>';return '<div class="row"><div><span class="cn">'+esc(c.name)+'</span><div class="meta">צ׳ק '+esc(c.no||'')+(c.bank?' · '+esc(c.bank):'')+'</div>'+done+'</div><div style="text-align:left"><div class="ca">'+ils(c.amount)+'</div><div class="meta">לפירעון '+esc(c.date||'')+'</div></div></div>';}).join('')||'<div class="row"><span class="meta">אין</span></div>';
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function fmtT(iso){try{var d=new Date(iso);return d.toLocaleDateString('he-IL')+' '+d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});}catch(e){return '';}}
function renderThread(card,name){
  var m=marks[name]||{};var el=card.querySelector('[data-thread]');if(!el)return;
  var items=[];
  if(m.note&&String(m.note).trim())items.push({w:'משרד',t:m.note,at:m.at||''});
  (m.comments||[]).forEach(function(c){items.push(c);});
  el.innerHTML=items.length?items.map(function(c){return '<div class="cmt"><div class="cmeta"><b>'+esc(c.w||'אורח')+'</b>'+(c.at?' · '+fmtT(c.at):'')+'</div><div class="ctext">'+esc(c.t||'')+'</div></div>';}).join(''):'';
}
function addComment(name,text,card){
  var who=(ME||'').trim()||'אורח';
  var c={w:who,t:text,at:new Date().toISOString()};
  marks[name]=marks[name]||{};marks[name].comments=(marks[name].comments||[]).concat([c]);
  renderThread(card,name);setSync('שומר…');
  fetch(BASE+'mark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,addComment:c})})
   .then(function(r){if(!r.ok)throw 0;return r.json();})
   .then(function(){setSync('נשמר ✓','ok');toast('תגובה נשמרה');})
   .catch(function(){setSync('לא נשמר — נסה שוב','err');});
}
function cur(name){return (marks[name]||{}).status||null;}
function applyStatus(card,status){
  card.classList.toggle('s-paid',status==='paid');card.classList.toggle('s-collect',status==='collect');
  card.querySelector('.b-paid').classList.toggle('on',status==='paid');
  card.querySelector('.b-collect').classList.toggle('on',status==='collect');
  var m=marks[card.dataset.name]||{};
  var wr=card.querySelector('.whenrow'),wd=card.querySelector('.whend');
  if(wr){wr.style.display=status==='paid'?'flex':'none';if(wd&&m.paidWhen&&document.activeElement!==wd)wd.value=m.paidWhen;}
  var b=card.querySelector('[data-badge]');
  if(b){if(status==='collect'){b.className='badge bc';b.textContent='✋ אני על זה';}else if(status==='paid'){b.className='badge bp';b.textContent='✅ נגבה'+(m.paidWhen?' · '+fmtD(m.paidWhen):'');}else{b.className='badge';b.textContent='';}}
}
function setStatus(name,card,status){var patch={status:status};if(status==='paid'&&!(marks[name]||{}).paidWhen){patch.paidWhen=new Date().toISOString().slice(0,10);}marks[name]=Object.assign(marks[name]||{},patch);applyStatus(card,status);tally();save(name,patch);}
function tally(){var c=0,p=0,open=0;B.debts.forEach(function(d){var s=(marks[d.name]||{}).status;if(s==='collect'){c++;open+=d.total;}else if(s==='paid'){p++;}else{open+=d.total;}});
  document.getElementById('cCollect').textContent=c;document.getElementById('cPaid').textContent=p;
  document.getElementById('cNone').textContent=B.debts.length-c-p;document.getElementById('openTot').textContent=Math.round(open).toLocaleString('en-US');}
var sync=document.getElementById('sync');
function setSync(t,cls){sync.textContent=t;sync.className='sync '+(cls||'');}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(function(){t.classList.remove('on');},1500);}
function save(name,patch){
  marks[name]=Object.assign(marks[name]||{},patch);
  setSync('שומר…');
  fetch(BASE+'mark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({name:name},patch))})
   .then(function(r){if(!r.ok)throw 0;return r.json();})
   .then(function(){setSync('נשמר ✓','ok');toast('נשמר');})
   .catch(function(){setSync('לא נשמר — נסה שוב','err');});
}
tally();
// רענון עדין: מושך סימונים חדשים (אם איציק או יואל במכשיר אחר) כל 20 שניות
setInterval(function(){fetch(BASE+'state').then(function(r){return r.json();}).then(function(s){
  if(!s||!s.marks)return;marks=s.marks;
  document.querySelectorAll('.c').forEach(function(card){var name=card.dataset.name;applyStatus(card,(marks[name]||{}).status);var cin=card.querySelector('.cin');if(document.activeElement!==cin)renderThread(card,name);});
  tally();}).catch(function(){});},15000);
</script></body></html>`;

function send(res, code, type, body) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
function json(res, code, obj) { send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  if (p === '/gviya/health') return json(res, 200, { ok: true });
  const m = p.match(/^\/gviya\/([0-9a-f]{8,})\/(.*)$/);
  if (!m || m[1] !== TOKEN) return send(res, 404, 'text/plain; charset=utf-8', 'לא נמצא');
  const rest = m[2];
  if (req.method === 'GET' && (rest === '' )) return send(res, 200, 'text/html; charset=utf-8', page());
  if (req.method === 'GET' && rest === 'state') return json(res, 200, { marks: readMarks(), at: new Date().toISOString() });
  if (req.method === 'POST' && rest === 'mark') {
    let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let o; try { o = JSON.parse(b); } catch (e) { return json(res, 400, { err: 'bad' }); }
      if (!o || typeof o.name !== 'string') return json(res, 400, { err: 'name' });
      const marks = readMarks();
      const cur = marks[o.name] || {};
      if ('status' in o) cur.status = (o.status === 'collect' || o.status === 'paid' || o.status === 'future') ? o.status : null;
      if ('note' in o) cur.note = String(o.note || '').slice(0, 2000);
      if ('paidWhen' in o) cur.paidWhen = String(o.paidWhen || '').slice(0, 20);
      if ('dueWhen' in o) cur.dueWhen = String(o.dueWhen || '').slice(0, 20);
      if (o.addComment && typeof o.addComment.t === 'string' && o.addComment.t.trim()) {
        if (!Array.isArray(cur.comments)) cur.comments = [];
        cur.comments.push({ w: String(o.addComment.w || 'אורח').slice(0, 40), t: String(o.addComment.t).slice(0, 2000), at: new Date().toISOString() });
        cur.comments = cur.comments.slice(-100);
      }
      cur.at = new Date().toISOString();
      marks[o.name] = cur; writeMarks(marks);
      schedulePush();
      return json(res, 200, { ok: true });
    });
    return;
  }
  return send(res, 404, 'text/plain; charset=utf-8', 'לא נמצא');
});
server.listen(PORT, '127.0.0.1', () => console.log('gviya on ' + PORT + ' token ' + TOKEN));
