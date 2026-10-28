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
const { execFile } = require('child_process');

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
  const data = share.readDebts(DATA) || { debts: [] };
  const marks = readMarks();
  const byName = {}; data.debts.forEach(d => byName[d.name] = d.amount);
  let collect = [], paid = 0, collectSum = 0;
  Object.keys(marks).forEach(n => {
    const s = marks[n] || {};
    if (s.status === 'collect') { collect.push(n); collectSum += (byName[n] || 0); }
    else if (s.status === 'paid') paid++;
  });
  const title = 'גבייה: יואל עדכן';
  let body = 'אני על זה: ' + collect.length + ' (' + ils(collectSum) + '), גבה והצ׳ק אצלו: ' + paid + '.';
  const notes = Object.keys(marks).filter(n => (marks[n] || {}).note).map(n => n + ': ' + marks[n].note);
  if (notes.length) body += '\nהערות: ' + notes.slice(0, 6).join(' | ');
  body += '\nהלוח: https://ilay.abaitzik.com/gviya/' + TOKEN + '/';
  execFile(process.execPath, [path.join(ROOT, 'notify.js'), title, body], { cwd: ROOT }, () => {});
}

// --- the board page ---
function page() {
  const data = share.readDebts(DATA) || { debts: [], cheques: [] };
  const debts = data.debts.map((d, i) => ({
    i: i + 1, name: d.name, total: d.amount, first: d.sub || d.first || '',
    inv: (d.inv || []).map(v => ({ n: v.n, d: v.date, a: v.amount, left: v.left }))
  }));
  const cheques = (data.cheques || []).map(c => ({ name: c.name, amount: c.amount, date: c.date, no: c.no, bank: c.bank, note: c.note }));
  const boot = { debts, cheques, marks: readMarks(), token: TOKEN, total: debts.reduce((a, d) => a + d.total, 0) };
  return HTML.replace('__BOOT__', JSON.stringify(boot).replace(/</g, '\\u003c'));
}

const HTML = `<!DOCTYPE html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>לולוס · גבייה</title>
<style>
:root{--bg:#f3f5f8;--card:#fff;--ink:#1d2735;--sub:#6b7684;--accent:#2d6cdf;--paid:#1ca167;--paidbg:#e7f6ee;--collect:#e0842b;--collectbg:#fdf1e3;--chip:#eef2f7;--line:#e3e8ef;--shadow:0 1px 3px rgba(20,30,50,.08)}
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
.c.s-paid{border-color:var(--paid);background:var(--paidbg)}.c.s-collect{border-color:var(--collect);background:var(--collectbg)}
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
textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:14px;font-family:inherit;resize:vertical;min-height:38px;background:#fbfcfe;color:var(--ink)}
textarea::placeholder{color:#aab3c0}
h2{font-size:15px;margin:22px 2px 4px;color:var(--sub)}
.cq{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:6px 15px;margin:8px 0}
.cq .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:9px 0;border-top:1px solid var(--line);font-size:13.5px}
.cq .row:first-child{border-top:0}.cq .cn{font-weight:600}.cq .meta{color:var(--sub);font-size:11.5px}.cq .ca{font-weight:700;white-space:nowrap}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#1d2735;color:#fff;padding:10px 18px;border-radius:30px;font-size:13.5px;opacity:0;transition:.25s;pointer-events:none;z-index:9}
.toast.on{opacity:1}
</style></head><body><div class="wrap">
<header><h1>לולוס · חשבונות פתוחים לגבייה</h1><div class="date" id="date"></div></header>
<div class="hello">יואל, לכל לקוח סַמֵּן <b>✋ אני על זה</b> או <b>✅ גביתי, הצ׳ק אצלי</b>, ואפשר לכתוב הערה מתחת לשם. <b>כל סימון נשמר ונשלח לאיציק אוטומטית</b> — לא צריך לשלוח כלום.</div>
<button id="shareBtn" style="width:100%;border:0;border-radius:11px;padding:11px;font-size:14px;font-weight:700;background:#25d366;color:#fff;cursor:pointer;font-family:inherit;margin-bottom:4px">📤 שלח את הדף הזה בוואטסאפ</button>
<div class="sync" id="sync"></div>
<div class="bar"><div class="box">
<div><span class="n" id="cCollect">0</span><span class="l">אני על זה</span></div>
<div><span class="n" id="cPaid">0</span><span class="l">גביתי</span></div>
<div><span class="n" id="cNone">0</span><span class="l">לא סומן</span></div>
<div><span class="n" id="openTot">0</span><span class="l">נותר ₪</span></div>
</div></div>
<div id="list"></div>
<h2>צ׳קים שכבר בידינו (לא לגבות)</h2><div class="cq" id="cqBox"></div>
</div>
<div class="toast" id="toast"></div>
<script id="boot" type="application/json">__BOOT__</script>
<script>
var B=JSON.parse(document.getElementById('boot').textContent);
var BASE='/gviya/'+B.token+'/';
document.getElementById('shareBtn').onclick=function(){window.open('https://wa.me/?text='+encodeURIComponent('דף הגבייה של לולוס, סַמֵּן מי לגבות:'+String.fromCharCode(10)+location.href),'_blank');};
var marks=B.marks||{};
function ils(n){return '₪ '+Math.round(n).toLocaleString('en-US');}
document.getElementById('date').textContent='נכון ל '+new Date().toLocaleDateString('he-IL')+' · '+B.debts.length+' לקוחות · סה״כ '+ils(B.total);
var list=document.getElementById('list');
B.debts.forEach(function(d){
  var card=document.createElement('div');card.className='c';card.dataset.name=d.name;
  var invs=d.inv.map(function(v){var p=(v.left!=null&&v.left!==v.a);return '<div class="inv"><span>חשבונית '+v.n+' · '+v.d+'</span><span>'+ils(p?v.left:v.a)+(p?' <span class="of">מתוך '+ils(v.a)+'</span>':'')+'</span></div>';}).join('');
  card.innerHTML='<div class="top"><span class="idx">'+d.i+'</span><span class="nm">'+esc(d.name)+'</span><span class="amt">'+ils(d.total)+'</span></div>'+
   (d.first?'<div class="first">'+esc(d.first)+'</div>':'')+'<div class="invs">'+invs+'</div>'+
   '<div class="acts"><button class="b-collect">✋ אני על זה</button><button class="b-paid">✅ גביתי, הצ׳ק אצלי</button></div>'+
   '<div class="noteWrap"><textarea placeholder="הערה: עם מי דיברת, מה הובטח, מתי לחזור..."></textarea></div>';
  var st=marks[d.name]||{};
  var bc=card.querySelector('.b-collect'),bp=card.querySelector('.b-paid'),ta=card.querySelector('textarea');
  ta.value=st.note||'';
  bc.onclick=function(){setStatus(d.name,card,(cur(d.name)==='collect')?null:'collect');};
  bp.onclick=function(){setStatus(d.name,card,(cur(d.name)==='paid')?null:'paid');};
  var t=null;ta.oninput=function(){clearTimeout(t);t=setTimeout(function(){save(d.name,{note:ta.value});},700);};
  applyStatus(card,st.status);list.appendChild(card);
});
var cq=document.getElementById('cqBox');
cq.innerHTML=(B.cheques.length?B.cheques:[]).map(function(c){return '<div class="row"><div><span class="cn">'+esc(c.name)+'</span><div class="meta">צ׳ק '+esc(c.no||'')+(c.bank?' · '+esc(c.bank):'')+(c.note?' · '+esc(c.note):'')+'</div></div><div style="text-align:left"><div class="ca">'+ils(c.amount)+'</div><div class="meta">'+esc(c.date||'')+'</div></div></div>';}).join('')||'<div class="row"><span class="meta">אין</span></div>';
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function cur(name){return (marks[name]||{}).status||null;}
function applyStatus(card,status){
  card.classList.toggle('s-paid',status==='paid');card.classList.toggle('s-collect',status==='collect');
  card.querySelector('.b-paid').classList.toggle('on',status==='paid');
  card.querySelector('.b-collect').classList.toggle('on',status==='collect');
}
function setStatus(name,card,status){marks[name]=Object.assign(marks[name]||{},{status:status});applyStatus(card,status);tally();save(name,{status:status});}
function tally(){var c=0,p=0,open=0;B.debts.forEach(function(d){var s=(marks[d.name]||{}).status;if(s==='collect'){c++;open+=d.total;}else if(s==='paid'){p++;}else{open+=d.total;}});
  document.getElementById('cCollect').textContent=c;document.getElementById('cPaid').textContent=p;
  document.getElementById('cNone').textContent=B.debts.length-c-p;document.getElementById('openTot').textContent=Math.round(open).toLocaleString('en-US');}
var sync=document.getElementById('sync');
function setSync(t,cls){sync.textContent=t;sync.className='sync '+(cls||'');}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(function(){t.classList.remove('on');},1500);}
function save(name,patch){
  marks[name]=Object.assign(marks[name]||{},patch);
  setSync('שומר…');
  fetch(BASE+'mark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({name:name},marks[name]))})
   .then(function(r){if(!r.ok)throw 0;return r.json();})
   .then(function(){setSync('נשמר ונשלח לאיציק ✓','ok');toast('נשמר');})
   .catch(function(){setSync('לא נשמר — נסה שוב','err');});
}
tally();
// רענון עדין: מושך סימונים חדשים (אם איציק או יואל במכשיר אחר) כל 20 שניות
setInterval(function(){fetch(BASE+'state').then(function(r){return r.json();}).then(function(s){
  if(!s||!s.marks)return;marks=s.marks;
  document.querySelectorAll('.c').forEach(function(card){var st=marks[card.dataset.name]||{};applyStatus(card,st.status);var ta=card.querySelector('textarea');if(document.activeElement!==ta&&(ta.value||'')!==(st.note||''))ta.value=st.note||'';});
  tally();}).catch(function(){});},20000);
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
      if ('status' in o) cur.status = (o.status === 'collect' || o.status === 'paid') ? o.status : null;
      if ('note' in o) cur.note = String(o.note || '').slice(0, 2000);
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
