'use strict';
/*
  1.11.2026, Itzik: "מצב הדגמה, כך הוא לא יראה מה שיש לי, רק מה שנחליט להראות".
  And after the first version: "רציתי שהמוניטור שלי ייכנס למצב כזה כאילו זה
  המוניטור שלו, והאריחים יהיו מתחת, בדיוק כמו המוניטור שלי". So the demo is his
  own screen: the same header, the same microphone and write box, and under them
  the client's tiles in the monitor's own tile style. Everything of his is hidden
  (the panes, the bottom bar, settings), and every sheet a demo tile opens reads
  only D.demo (data/demo/demo.json, sealed like the business records).

  Live answers: in demo, the write box and the microphone do not go to his chat.
  They go to wa-bridge.js (https://wa.abaitzik.com/api/ask, with the owner code),
  which hands the question to the worker inside a demo frame, and the answer is
  drawn under the microphone when it lands (/api/answer). Turning demo on also
  tells the bridge, so WhatsApp answers in the client's voice too while it is on.

  On:  💼 העסק שלי, "🎬 מצב הדגמה ללקוח", or #demo in the address.
  Off: press and hold the round avatar at the top for two seconds, then
       "יציאה ממצב הדגמה". It stays on across a reload.
*/
const css = `
body.dmo-real .tdy-note,body.dmo-real .tdy-sel,body.dmo-real .tdy-bar,body.dmo-real .tdy-ck{display:none!important}
body.dmo-real .wrap>[data-dmo-hid]{display:none!important}
body.dmo-real #built,body.dmo-real #checked,body.dmo-real #micFirst,body.dmo-real #micFirstBar,body.dmo-real #micSheet,body.dmo-real #setBtn,body.dmo-real #thumbSet,body.dmo-real #homeBtn,body.dmo-real #firstHint,body.dmo-real #talkCard .ways{display:none!important}
#dmoHome{margin:14px 0 24px}
#dmoHome .grid{margin-top:12px}
/* 10.11.2026, Itzik: the demo home looks like the Gemini chat: a big greeting, one big write box in the middle,
   a few suggestion chips under it, and the tiles folded behind one button. Demo mode only. */
body.dmo-real .dmo-greet{margin:9vh 4px 4px;text-align:center;font:800 30px/1.25 Heebo,sans-serif;
 background:linear-gradient(100deg,var(--accent),#7c3aed 60%,#db2777);-webkit-background-clip:text;background-clip:text;color:transparent}
body.dmo-real .dmo-greet small{display:block;margin-top:6px;font:500 16px Heebo,sans-serif;color:var(--dim,#64748b);-webkit-text-fill-color:var(--dim,#64748b)}
body.dmo-real #talkCard{display:flex;flex-direction:column;align-items:stretch;background:transparent;border:0;box-shadow:none;padding:0;margin:18px 0 6px}
body.dmo-real #talkCard .tkHead,body.dmo-real #talkCard .vtxt,body.dmo-real #talkCard .firsthint{display:none!important}
body.dmo-real #talkCard .quickwrite{order:1;gap:10px;align-items:flex-end;padding:10px 12px;border-radius:30px;
 background:var(--surface,#fff);border:1px solid var(--line,#e2e8f0);box-shadow:0 6px 26px rgba(15,27,42,.10)}
body.dmo-real #talkCard .quickwrite textarea{min-height:110px;padding:10px 8px;font-size:18px;background:transparent;border:0;outline:none;resize:none}
body.dmo-real #talkCard .quickwrite button{min-height:46px;border-radius:23px;padding:0 20px}
body.dmo-real #talkCard .mic{order:2;align-self:center;margin-top:14px;width:58px;height:58px;flex:0 0 58px}
.dmo-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:16px 0 0}
.dmo-chip{border:1px solid var(--line,#e2e8f0);background:var(--surface,#fff);color:var(--ink,#0f1b2a);border-radius:999px;
 padding:9px 15px;font:600 14px Heebo,sans-serif;cursor:pointer}
.dmo-tools{margin-top:18px}
.dmo-tools>summary{list-style:none;cursor:pointer;text-align:center;font:700 15px Heebo,sans-serif;color:var(--accent);padding:10px}
.dmo-tools>summary::-webkit-details-marker{display:none}
.dmo-ans{display:flex;flex-direction:column;gap:10px;margin:14px 0 0}
.dmo-ans[hidden]{display:none}
.dmo-qa{background:var(--surface,#fff);border:1px solid var(--line,#e2e8f0);border-radius:18px;padding:12px 14px;box-shadow:var(--shadow,none)}
.dmo-qa .q{font:700 15px/1.45 Heebo,sans-serif;color:var(--ink,#0f1b2a)}
.dmo-qa .a{margin-top:8px;font:400 15px/1.6 Heebo,sans-serif;color:var(--ink,#0f1b2a);white-space:pre-wrap}
.dmo-qa .w{margin-top:8px;font:600 14px Heebo,sans-serif;color:var(--dim,#64748b)}
.dmo-qa .w i{display:inline-block;width:6px;height:6px;margin-inline-start:4px;border-radius:50%;background:currentColor;animation:dmoDot 1.2s infinite}
.dmo-qa .w i:nth-child(2){animation-delay:.2s}.dmo-qa .w i:nth-child(3){animation-delay:.4s}
@keyframes dmoDot{0%,80%,100%{opacity:.2}40%{opacity:1}}
.dmo-fh{font:800 17px Heebo,sans-serif;color:var(--ink,#0f1b2a);margin:2px 4px 0}
.dmo-fl{display:flex;flex-direction:column;gap:10px}
.dmo-hint{font:500 14px/1.5 Heebo,sans-serif;color:var(--dim,#64748b);text-align:center;margin:14px 6px 0}
.dmo-exit{position:fixed;inset:auto 16px calc(18px + env(safe-area-inset-bottom)) 16px;z-index:100000;display:flex;gap:8px;justify-content:center}
.dmo-exit[hidden]{display:none}
.dmo-exit button{border:0;border-radius:14px;padding:12px 18px;font:700 15px Heebo,sans-serif;background:#0f1b2a;color:#fff;cursor:pointer}
.dmo-exit button+button{background:#e2e8f0;color:#0f1b2a}
.dmo-card{background:#fff;color:#0f1b2a;border-radius:16px;padding:14px;margin:10px 0;border:1px solid #e2e8f0;text-align:right}
.dmo-card b{font:700 15px Heebo,sans-serif}
.dmo-card p{margin:6px 0 0;font:400 14.5px/1.55 Heebo,sans-serif;color:#24364b;white-space:pre-wrap}
.dmo-meta{font:500 12.5px Heebo,sans-serif;color:#6b7c90}
.dmo-tag{display:inline-block;font:700 12px Heebo,sans-serif;padding:2px 9px;border-radius:999px;background:#eef2f7;color:#24364b;margin-inline-start:6px}
.dmo-tag.hot{background:#fee2e2;color:#991b1b}.dmo-tag.ok{background:#dcfce7;color:#166534}.dmo-tag.wait{background:#fef3c7;color:#92400e}
.dmo-ai{margin-top:10px;padding:10px 12px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc}
.dmo-ai small{display:block;font:700 12px Heebo,sans-serif;color:#0e7490;margin-bottom:4px}
.dmo-ai p{margin:0;color:#0f1b2a}
.dmo-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.dmo-b{border:0;border-radius:12px;padding:10px 14px;font:700 14px Heebo,sans-serif;cursor:pointer;background:#0f1b2a;color:#fff;text-decoration:none;display:inline-block}
.dmo-b.alt{background:#eef2f7;color:#0f1b2a}
.dmo-b.wa{background:#25d366;color:#05361a}
.dmo-b:disabled{opacity:.55}
.dmo-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
.dmo-k{background:#f4f7fb;border-radius:12px;padding:8px;text-align:center}
.dmo-k b{display:block;font:800 17px Heebo,sans-serif;font-variant-numeric:tabular-nums}
.dmo-k small{font:500 11.5px Heebo,sans-serif;color:#4a5a6e}
@media (max-width:420px){.dmo-kpis{grid-template-columns:repeat(2,1fr)}}
.dmo-pipe{display:flex;flex-direction:column;gap:10px}
.dmo-col{background:#eef2f7;border-radius:14px;padding:8px}
.dmo-col>b{display:block;font:800 14px Heebo,sans-serif;margin:2px 4px 8px;color:#0f1b2a}
.dmo-lead{background:#fff;color:#0f1b2a;border-radius:10px;padding:8px;margin-bottom:8px;font:500 13px/1.45 Heebo,sans-serif;text-align:right}
.dmo-lead b{font:700 14px Heebo,sans-serif}
.dmo-f{display:flex;flex-direction:column;gap:6px;margin:8px 0;text-align:right}
.dmo-f label{font:700 13px Heebo,sans-serif;color:#24364b}
.dmo-f input{font:400 16px Heebo,sans-serif;padding:10px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f1b2a;direction:rtl}
.dmo-f textarea{font:400 16px Heebo,sans-serif;padding:10px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f1b2a;direction:rtl;resize:vertical}
.dmo-up{display:inline-block;background:#06b6d4;color:#0f1b2a;border-radius:12px;padding:10px 14px;font:800 14px Heebo,sans-serif;cursor:pointer;margin:8px 0}
.dmo-up.alt{background:#eef2f7}
.dmo-th{display:flex;flex-wrap:wrap;gap:8px}
.dmo-ti{width:86px;text-align:center}
.dmo-ti img{width:86px;height:86px;object-fit:cover;border-radius:10px;display:block}
.dmo-ti button,.dmo-vr button{border:0;border-radius:8px;background:#e2e8f0;color:#0f1b2a;font:700 12px Heebo,sans-serif;padding:6px 8px;margin-top:4px;cursor:pointer}
.dmo-vr button{margin:0}.dmo-vr button:disabled{opacity:.35}
.dmo-vr{display:flex;align-items:center;gap:6px;background:#eef2f7;border-radius:12px;padding:6px;margin-top:8px;color:#0f1b2a}
.dmo-vr video{width:56px;height:56px;object-fit:cover;border-radius:8px;background:#000}
.dmo-vr span{flex:1;min-width:0;font:600 12px Heebo,sans-serif;word-break:break-all;text-align:right}
.dmo-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.dmo-chip{position:relative;display:inline-block}
.dmo-chip input{position:absolute;opacity:0;pointer-events:none}
.dmo-chip span{display:inline-block;padding:9px 13px;border-radius:999px;background:#eef2f7;color:#0f1b2a;font:700 13px Heebo,sans-serif;cursor:pointer}
.dmo-chip input:checked+span{background:#0f1b2a;color:#fff}
.dmo-items{width:100%;border-collapse:collapse;margin-top:6px}
.dmo-items td{padding:4px 2px;font:700 13px Heebo,sans-serif;color:#24364b}
.dmo-items input{width:100%;box-sizing:border-box;font:400 15px Heebo,sans-serif;padding:8px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f1b2a}
.dmo-q{background:#fff;color:#0f1b2a;border-radius:16px;padding:18px;margin-top:12px;border:1px solid #e2e8f0;text-align:right;direction:rtl}
.dmo-q h3{margin:0;font:800 21px Heebo,sans-serif}
.dmo-q table{width:100%;border-collapse:collapse;margin-top:12px;font:400 14px Heebo,sans-serif}
.dmo-q th,.dmo-q td{border-bottom:1px solid #e2e8f0;padding:7px 4px;text-align:right}
.dmo-q th{font-weight:700;background:#f4f7fb}
.dmo-q .tot td{font-weight:800;border-bottom:0}
.dmo-brand{display:flex;align-items:center;gap:8px;direction:ltr}
.dmo-brand span{width:30px;height:30px;border-radius:9px;background:#06b6d4;color:#0f1b2a;display:flex;align-items:center;justify-content:center;font:900 13px Heebo,sans-serif}
.dmo-brand b{font:800 17px Heebo,sans-serif}.dmo-brand b i{font-style:normal;color:#06b6d4}
#dmoRecBox{position:fixed;inset:0;z-index:2147483600;background:rgba(10,14,22,.55);display:flex;align-items:center;justify-content:center;padding:20px}
.dmo-rc{background:#fff;color:#0f1b2a;border-radius:22px;padding:22px 18px;width:min(440px,100%);text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.35)}
.dmo-rdot{width:74px;height:74px;border-radius:50%;background:#c62828;margin:0 auto 10px;animation:dmoPulse 1.2s infinite}
@keyframes dmoPulse{0%{box-shadow:0 0 0 0 rgba(198,40,40,.55)}70%{box-shadow:0 0 0 22px rgba(198,40,40,0)}100%{box-shadow:0 0 0 0 rgba(198,40,40,0)}}
.dmo-rc b{font:800 20px Heebo,sans-serif;color:#c62828}.dmo-rt{display:block;font:700 15px Heebo,sans-serif;color:#4a5a6e;margin-top:2px;font-variant-numeric:tabular-nums}
.dmo-rs{font:500 13px Heebo,sans-serif;color:#6b7c90;margin:8px 0}
.dmo-rtx{min-height:60px;max-height:34vh;overflow:auto;background:#f4f7fb;border-radius:12px;padding:10px;font:400 15px/1.6 Heebo,sans-serif;text-align:right;margin-bottom:6px}
/* 1.11, Itzik: a plain way back, always visible, below the clock and notch. (restored after an overwrite) */
#dmoBack{display:none}
/* 2.11, Itzik: inside a demo tile the X ran up under the "חזרה למוניטור שלי" bar and there was no way back to the
   demo. While a tile is open the bar steps aside, the X sits below the notch, and a big button at the bottom
   goes back to the demo screen. */
body.dmo-real.dmo-open #dmoBack{display:none!important}
body.dmo-real .ysheet .ytopx{top:calc(env(safe-area-inset-top,0px) + 6px)}
body.dmo-real .ysheet .ycard{padding-bottom:calc(84px + env(safe-area-inset-bottom,0px))}
#dmoSheetBack{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:2147483000;border:0;border-radius:28px;padding:12px 26px;font:800 22px Heebo,sans-serif;background:#0f1b2a;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer}
body.dmo-real #dmoBack{display:flex;position:sticky;top:0;z-index:99999;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 8px;background:#0f1b2a}
#dmoBack button{border:0;border-radius:12px;padding:10px 18px;font:700 15px Heebo,sans-serif;background:#fff;color:#0f1b2a;cursor:pointer}
.dmo-sec{font:800 14px Heebo,sans-serif;color:#0e7490;margin:14px 2px 4px}
.dmo-ics{margin-top:16px}
.c-dnote{background:#fef3c7;font-size:24px;display:flex;align-items:center;justify-content:center}
.c-dfill{background:var(--surface,#fff);border:1px solid var(--line,#e2e8f0);font-size:24px;display:flex;align-items:center;justify-content:center}
.dmo-all{align-self:center;margin-top:2px}
.c-ynet{background:#e21b22!important;color:#fff;font:900 15px Arial,sans-serif!important;letter-spacing:-.5px;border:0!important}
#dmoPrint{display:none}
@media print{
 body.dmo-print>*{display:none!important}
 body.dmo-print>#dmoPrint{display:block!important}
}
`;

const js = `
var DMO_API='https://wa.abaitzik.com/api/';
var DMO_TILES=[
 ['meet','gMyDay','🎙️ סיכומי פגישות','מדברים אחרי הפגישה, המוניטור מסכם ושולח משימות'],
 ['clients','g8','👥 הלקוחות שלי','מה פתוח מול כל לקוח, ומתי נפגשים'],
 ['cal','g18','📅 פגישות ויומן','קביעת פגישות, זימונים ותזכורות'],
 ['wa','g16','💬 וואטסאפ','מדברים עם המוניטור, והוא עונה ומבצע'],
 ['mail','g10','✉️ מייל','ממוין לפי דחיפות, עם טיוטת תשובה'],
 ['quote','gInv','🧾 הצעת מחיר','הצעה מעוצבת ב PDF בדקה'],
 ['ads','gTom','📣 קמפיינים ללקוחות','כמה הוצאנו, כמה לידים, ומה לשפר'],
 ['camp','g13','📣 קמפיין מתמונות וסרטון','מעלים חומר, ומקבלים טיוטה, קהל ותקציב'],
 ['day','gNer','☀️ מה יש לי היום','מה דחוף, ולמי לחזור']
];
var dmoPend={},dmoTimer=null;
function dmoData(){var a=(window.D&&D.demo)||[];var o={};a.forEach(function(r){if(r&&r.kind){(o[r.kind]=o[r.kind]||[]).push(r);}});return o;}
function dmoOn(){try{return localStorage.getItem('demoMode')==='1';}catch(e){return false;}}
function dmoMoney(n){n=Number(n)||0;return '₪'+n.toLocaleString('he-IL',{maximumFractionDigits:0});}
function dmoNum(n){return (Number(n)||0).toLocaleString('he-IL');}
function dmoTag(s){var c=/דחוף|חם|חדש/.test(s)?'hot':/סגור|שולם|נסגר|פעיל/.test(s)?'ok':/ממתין|מחכה|בטיפול|מושהה/.test(s)?'wait':'';return '<span class="dmo-tag '+c+'">'+esc(s)+'</span>';}
function dmoInput(){return document.querySelector('#quickForm textarea,#quickForm input[type=text],#quickForm input:not([type])');}
function dmoApi(name,body){
 body=body||{};body.code=(typeof sendCode==='function')?sendCode():'';
 return fetch(DMO_API+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw new Error('api '+r.status);return r.json();});
}
function dmoReset(){try{localStorage.removeItem('dmoIcons');localStorage.removeItem('dmoNotes');}catch(e){}}
function dmoStart(){
 try{localStorage.setItem('demoMode','1');}catch(e){}
 dmoReset();
 [].forEach.call(document.querySelectorAll('.ysheet'),function(s){s.remove();});
 dmoApi('demo',{on:true}).catch(function(){});
 ensure('demo',function(){dmoApply();});
}
function dmoApply(){
 var wrap=document.querySelector('.wrap'),talk=document.getElementById('talkCard');if(!wrap||!talk)return;
 document.body.classList.add('dmo-real');
 [].forEach.call(wrap.children,function(c){
  if(c.tagName==='HEADER'||c===talk||c.id==='toast'||c.id==='recModal'||c.id==='dmoHome'||c.id==='dmoGreet'||c.id==='dmoNav')return;
  c.setAttribute('data-dmo-hid','1');
 });
 [].forEach.call(document.body.children,function(c){if(c.id==='offBar')c.setAttribute('data-dmo-hid','1');});
 var t=document.querySelector('.hd .t'),s=document.getElementById('built'),av=document.querySelector('.hd .ava div');
 if(t)t.textContent='המוניטור העסקי שלך';
 if(t&&!document.getElementById('dmoSub')){var sub=document.createElement('div');sub.className='s';sub.id='dmoSub';sub.textContent='IT Solution · מחובר לוואטסאפ, פייסבוק, מייל וקמפיינים';t.parentNode.insertBefore(sub,t.nextSibling);}
 var ck=document.getElementById('checked');if(ck)ck.hidden=true;
 if(av)av.textContent='IT';
 var qi=dmoInput();if(qi)qi.setAttribute('placeholder','כתוב לי מה אתה צריך');
 var h=document.getElementById('dmoHome');
 if(!h){h=document.createElement('section');h.id='dmoHome';talk.parentNode.insertBefore(h,talk.nextSibling);}
 h.innerHTML='<button type="button" id="dmoAnsBtn" class="newbtn"><span class="nb-l"><b>💬 תשובות</b><small id="dmoAnsSub"></small></span><span class="nb-c" id="dmoAnsNum">0</span></button>'
  +'<div class="dmo-ans" id="dmoAns" hidden></div><div class="dmo-ans" id="dmoFeed" hidden style="display:none"><div class="dmo-fl"></div></div>'
  +'<div class="dmo-hint dmo-chips">'+['תסכם לי את הפגישה עם מיכל','מה פתוח לי מול הלקוחות?','תקבע פגישה עם רון ביום חמישי'].map(function(q){return '<button type="button" class="dmo-chip" data-chip="'+q+'">'+q+'</button>';}).join('')+'</div>'
  +'<details class="dmo-tools"><summary>📂 הכלים שלי</summary><div class="grid">'+DMO_TILES.map(function(x){return '<button type="button" class="gt '+x[1]+'" data-dmo="'+x[0]+'"><b>'+x[2]+'</b><small>'+x[3]+'</small></button>';}).join('')+'</div></details>'
  +'<div class="row dmo-ics" id="dmoIcons"></div>'
  +'';
 if(!document.getElementById('dmoGreet')){var g=document.createElement('div');g.id='dmoGreet';g.className='dmo-greet';g.innerHTML='שלום, במה אפשר לעזור?<small>כתוב לי כל דבר, או דבר אליי</small>';talk.parentNode.insertBefore(g,talk);}
 [].forEach.call(h.querySelectorAll('.dmo-chip'),function(b){b.onclick=function(){var qi2=dmoInput();if(qi2){qi2.value=b.getAttribute('data-chip');qi2.focus();}};});
 dmoExitBar();
 dmoBackBar();
 dmoIcons();
 dmoFeedSeed();
 dmoNavBar(wrap);
 dmoFeedSeen={};dmoFeedStart();
 window.scrollTo(0,0);
}
function dmoSheetWatch(){
 if(window.dmoSheetObs)return;
 var last=null;
 function topSheet(){var sh=document.querySelectorAll('body > .ysheet'),i;for(i=sh.length-1;i>=0;i--){if(!sh[i].hidden&&getComputedStyle(sh[i]).display!=='none')return sh[i];}return null;}
 function sync(){
  var top=document.body.classList.contains('dmo-real')?topSheet():null,open=!!top;
  if(open===last)return;
  last=open;
  if(open)document.body.classList.add('dmo-open');else document.body.classList.remove('dmo-open');
  var btn=document.getElementById('dmoSheetBack');
  if(open&&!btn){
   btn=document.createElement('button');btn.type='button';btn.id='dmoSheetBack';btn.setAttribute('aria-label','סגירה');btn.textContent='→ ✕';
   btn.onclick=function(){var t=topSheet();if(!t)return;var x=t.querySelector('.ycard > .yx')||t.querySelector('[data-a="x"]')||t.querySelector('.ytopx');if(x)x.click();if(document.body.contains(t))t.remove();};
   document.body.appendChild(btn);
  }else if(!open&&btn)btn.remove();
 }
 window.dmoSheetObs=new MutationObserver(function(){setTimeout(sync,0);});
 window.dmoSheetObs.observe(document.body,{childList:true});
 sync();
}
function dmoBackBar(){
 dmoSheetWatch();
 var k=document.getElementById('dmoBack');if(k)return;
 k=document.createElement('div');k.id='dmoBack';
 k.innerHTML='<button type="button">→ חזרה למוניטור שלי</button>';
 k.querySelector('button').onclick=dmoExit;
 document.body.insertBefore(k,document.body.firstChild);
}
function dmoExitBar(){
 var b=document.getElementById('dmoExit');
 if(!b){
  b=document.createElement('div');b.className='dmo-exit';b.id='dmoExit';b.hidden=true;
  b.innerHTML='<button type="button" id="dmoOff">יציאה ממצב הדגמה</button><button type="button" id="dmoStay">ביטול</button>';
  document.body.appendChild(b);
  b.querySelector('#dmoOff').onclick=dmoExit;
  b.querySelector('#dmoStay').onclick=function(){b.hidden=true;};
 }
 // 1.11, Itzik: the avatar ran off the top of the screen and he could not get out.
 // Three places now, any one of them: the avatar, the words next to the microphone,
 // and the line under the tiles. Two seconds of holding, then the exit bar.
 [document.querySelector('.hd .ava'),document.querySelector('#talkCard .vtxt'),document.querySelector('#dmoHome .dmo-hint')].forEach(function(el){
  if(!el||el.getAttribute('data-dmo-hold'))return;el.setAttribute('data-dmo-hold','1');
  var tm=null;function hold(){tm=setTimeout(function(){if(document.body.classList.contains('dmo-real'))b.hidden=false;},2000);}
  function rel(){if(tm){clearTimeout(tm);tm=null;}}
  el.addEventListener('touchstart',hold,{passive:true});el.addEventListener('touchend',rel);el.addEventListener('touchcancel',rel);el.addEventListener('touchmove',rel,{passive:true});
  el.addEventListener('mousedown',hold);el.addEventListener('mouseup',rel);el.addEventListener('mouseleave',rel);
  el.addEventListener('contextmenu',function(e){if(document.body.classList.contains('dmo-real'))e.preventDefault();});
  el.style.webkitUserSelect='none';el.style.userSelect='none';el.style.webkitTouchCallout='none';
 });
}
function dmoExit(){
 try{localStorage.removeItem('demoMode');}catch(e){}
 var gone=false,done=function(){if(gone)return;gone=true;location.replace(location.pathname);};
 dmoApi('demo',{on:false}).then(done,done);
 setTimeout(done,2500);
}
function dmoAsk(text){
 text=String(text||'').trim();if(!text)return;
 var box=document.getElementById('dmoAns');if(!box)return;box.hidden=false;
 var k='q'+Date.now(),el=document.createElement('div');el.className='dmo-qa';el.id=k;
 el.innerHTML='<div class="q">'+esc(text)+'</div><div class="w">המוניטור עובד על זה<i></i><i></i><i></i></div>';
 box.insertBefore(el,box.firstChild);
 dmoApi('ask',{text:text}).then(function(r){if(!r||!r.id)throw new Error('no id');dmoPend[r.id]=k;dmoPoll();},function(){
  var w=el.querySelector('.w');if(w)w.textContent='אין חיבור כרגע. אפשר לנסות שוב בעוד רגע.';
 });
}
function dmoPoll(){
 if(dmoTimer)return;
 dmoTimer=setInterval(function(){
  var ids=Object.keys(dmoPend);if(!ids.length){clearInterval(dmoTimer);dmoTimer=null;return;}
  dmoApi('answer',{ids:ids}).then(function(r){
   var a=(r&&r.answers)||{};
   Object.keys(a).forEach(function(id){
    var el=document.getElementById(dmoPend[id]);delete dmoPend[id];if(!el)return;
    var w=el.querySelector('.w');if(w)w.remove();
    var d=document.createElement('div');d.className='a';d.textContent=a[id];el.appendChild(d);
    var qq=el.querySelector('.q');dmoQA.push({q:qq?qq.textContent:'',a:a[id]});dmoPaintCnt();
   });
  }).catch(function(){});
 },4000);
}
// 1.11, Itzik: "אין לי את המוקאפ האדום של ההקלטה, וברגע שאני מפסיק לדבר זה אוטומטית נשלח".
// The demo microphone now opens a red recording window like the real one, keeps listening
// through pauses (it restarts itself when the browser stops it), and sends only on "סיום ושליחה".
var dmoRec=null;
function dmoMic(){
 if(dmoRec)return;
 var R=window.SpeechRecognition||window.webkitSpeechRecognition,qi=dmoInput();
 if(!R){if(qi)qi.focus();toast('ללחוץ על המיקרופון שבמקלדת ולדבר.');return;}
 var ov=document.createElement('div');ov.id='dmoRecBox';
 ov.innerHTML='<div class="dmo-rc"><div class="dmo-rdot"></div><b>מקליט</b><span class="dmo-rt">0:00</span>'
  +'<p class="dmo-rs">מדברים בחופשיות, גם עם הפסקות. שום דבר לא נשלח עד שלוחצים.</p><div class="dmo-rtx"></div>'
  +'<div class="dmo-row" style="justify-content:center"><button type="button" class="dmo-b" id="dmoRecSend" style="background:#c62828">⏹ סיום ושליחה</button><button type="button" class="dmo-b alt" id="dmoRecNo">ביטול</button></div></div>';
 document.body.appendChild(ov);
 var st={done:'',live:'',stop:false,send:false,t0:Date.now()},tx=ov.querySelector('.dmo-rtx'),tm=ov.querySelector('.dmo-rt');
 var tick=setInterval(function(){var s=Math.floor((Date.now()-st.t0)/1000);tm.textContent=Math.floor(s/60)+':'+('0'+s%60).slice(-2);},500);
 function paint(){tx.textContent=(st.done+' '+st.live).trim()||'...';}
 function start(){
  var sr;try{sr=new R();}catch(e){return finish();}
  sr.lang='he-IL';sr.interimResults=true;sr.continuous=true;
  sr.onresult=function(ev){var fin='',live='';for(var i=ev.resultIndex;i<ev.results.length;i++){if(ev.results[i].isFinal)fin+=ev.results[i][0].transcript+' ';else live+=ev.results[i][0].transcript;}st.done=(st.done+' '+fin).trim();st.live=live;paint();};
  sr.onerror=function(ev){if(ev&&ev.error==='not-allowed'){st.stop=true;tx.textContent='אין הרשאה למיקרופון. אפשר לכתוב בתיבה.';}};
  sr.onend=function(){if(st.live){st.done=(st.done+' '+st.live).trim();st.live='';}if(st.stop)finish();else setTimeout(start,150);};
  st.sr=sr;try{sr.start();}catch(e){setTimeout(start,400);}
 }
 function finish(){
  if(!dmoRec)return;dmoRec=null;clearInterval(tick);ov.remove();
  var mb=document.getElementById('micBtn');if(mb)mb.classList.remove('on');
  var text=(st.done+' '+st.live).trim();
  if(st.send&&text)dmoAsk(text);
 }
 ov.querySelector('#dmoRecSend').onclick=function(){st.send=true;st.stop=true;try{st.sr.stop();}catch(e){finish();}setTimeout(finish,1500);};
 ov.querySelector('#dmoRecNo').onclick=function(){st.send=false;st.stop=true;try{st.sr.abort();}catch(e){}finish();};
 dmoRec=st;var mb=document.getElementById('micBtn');if(mb)mb.classList.add('on');
 start();
}
document.addEventListener('submit',function(e){
 if(!document.body.classList.contains('dmo-real'))return;
 if(!e.target||e.target.id!=='quickForm')return;
 e.preventDefault();e.stopImmediatePropagation();
 var qi=dmoInput(),v=qi?qi.value:'';if(qi)qi.value='';dmoAsk(v);
},true);
document.addEventListener('click',function(e){
 var ic=e.target&&e.target.closest&&e.target.closest('#icDemo');
 if(ic){e.preventDefault();e.stopImmediatePropagation();if(!document.body.classList.contains('dmo-real'))dmoStart();return;}
 if(!document.body.classList.contains('dmo-real'))return;
 var c=e.target.closest?e.target:null;if(!c)return;
 if(c.closest('#micBtn')){e.preventDefault();e.stopImmediatePropagation();dmoMic();return;}
 if(c.closest('#quickBtn')){e.preventDefault();e.stopImmediatePropagation();var qi=dmoInput(),v=qi?qi.value:'';if(qi)qi.value='';dmoAsk(v);return;}
 var t=c.closest('[data-dmo]');
 if(t){e.preventDefault();e.stopImmediatePropagation();dmoSheet(t.getAttribute('data-dmo'));return;}
},true);
// 3.11, Itzik: "שלחתי בוואטסאפ סיכום פגישה, והוא כתב את זה בתשובות, אבל לא הכניס
// את זה לאריח סיכומי פגישות". What the monitor makes in the demo (the feed) now
// also lands in the tile it belongs to, newest first: a summary in meetings, a
// meeting in the calendar and today, a task or lead under the client, a mail in mail.
function dmoMerge(d){
 var o={};Object.keys(d).forEach(function(k){o[k]=(d[k]||[]).slice();});
 var NL=String.fromCharCode(10),F=Object.keys(dmoFeedItems).filter(function(k){return k.indexOf('seed')!==0;}).map(function(k){return dmoFeedItems[k];});
 F.sort(function(a,b){return String(a.at||'').localeCompare(String(b.at||''));});
 function day(it){try{var t=new Date(it.at);return isNaN(t)?'':t.toLocaleDateString('he-IL')+' '+t.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});}catch(e){return '';}}
 function cli(name){if(!name)return null;var c=null;(o.client||[]).forEach(function(x){if(!c&&x.name&&(x.name===name||x.name.indexOf(name)>-1||name.indexOf(x.name)>-1))c=x;});
  if(!c){c={name:name,biz:'',status:'חדש',last:'',next:'',open:''};o.client=[c].concat(o.client||[]);}
  else{var i=o.client.indexOf(c);c=Object.assign({},c);o.client[i]=c;}return c;}
 function after(t,k){var m=t.indexOf(':');return m>-1?t.slice(m+1).trim():t;}
 F.forEach(function(it){
  var ty=it.type,ti=String(it.title||''),tx=String(it.text||'');
  if(ty==='doc'&&ti.indexOf('סיכום')>-1||ty==='note'&&ti.indexOf('סיכום פגישה')>-1){
   var m={client:it.client||ti.replace('סיכום פגישה עם','').trim(),when:day(it),summary:'',decisions:[],tasksClient:[],tasksMe:[],next:''};
   tx.split(NL).forEach(function(l){l=l.trim();if(!l)return;
    if(l.indexOf('החלט')===0)m.decisions.push(after(l));
    else if(l.indexOf('משימות ללקוח')===0||l.indexOf('משימות של הלקוח')===0)m.tasksClient.push(after(l));
    else if(l.indexOf('משימות שלי')===0||l.indexOf('משימות אצלי')===0)m.tasksMe.push(after(l));
    else if(l.indexOf('פגישת המשך')===0||l.indexOf('המשך')===0)m.next=after(l);
    else m.summary+=(m.summary?' ':'')+l;});
   o.meet=[m].concat(o.meet||[]);
   var c=cli(m.client);if(c){c.last=m.when;if(m.next)c.next=m.next;if(m.tasksMe.length)c.open=m.tasksMe.join(', ');}
  } else if(ty==='meeting'){
   o.slot=[{when:it.when||day(it),who:it.client||'',what:ti+(it.where?' · '+it.where:'')}].concat(o.slot||[]);
   var c2=cli(it.client);if(c2&&it.when)c2.next=it.when+(it.where?', '+it.where:'');
  } else if(ty==='task'){
   var c3=cli(it.client);if(c3)c3.open=ti;
  } else if(ty==='lead'){
   var c4=cli(it.client||ti);if(c4){c4.status='ליד חדש';if(tx)c4.biz=c4.biz||tx;}
   o.crm=[{name:it.client||ti,what:tx||ti,src:'וואטסאפ',stage:'ליד חדש'}].concat(o.crm||[]);
  } else if(ty==='quote'||ty==='invoice'){
   o.made=[it].concat(o.made||[]);
   var c5=cli(it.client);if(c5)c5.open=(ty==='invoice'?'חשבונית':'הצעת מחיר')+' נשלחה, מחכה לתשובה';
  } else if(ty==='mail'){
   o.mail=[{from:it.from||it.client||'',subject:it.subject||ti,when:day(it),text:tx,tag:'חדש'}].concat(o.mail||[]);
  }
 });
 return o;
}
function dmoSheet(key){
 var d=dmoMerge(dmoData()),h='',label='';
 if(key==='wa'){
  label='💬 וואטסאפ';
  h='<div class="dmo-card"><b>נסו עכשיו</b><p>שולחים הודעה למספר של המוניטור ורואים את התשובה מגיעה בזמן אמת.</p><div class="dmo-row"><a class="dmo-b wa" href="https://wa.me/15550165387" target="_blank" rel="noopener">פתיחת וואטסאפ עם המוניטור</a></div></div>'
   +(d.wa||[]).map(function(m){return '<div class="dmo-card"><span class="dmo-meta">'+esc(m.who||'')+'</span><p>'+esc(m.text||'')+'</p></div>';}).join('');
 } else if(key==='fb'){
  label='📘 שיחות מפייסבוק';
  h=(d.fb||[]).map(function(m){return '<div class="dmo-card"><b>'+esc(m.name||'')+'</b>'+(m.tag?dmoTag(m.tag):'')+'<div class="dmo-meta">'+esc(m.when||'')+'</div><p>'+esc(m.text||'')+'</p>'
    +(m.reply?'<div class="dmo-ai"><small>✨ תשובה מוצעת</small><p>'+esc(m.reply)+'</p></div><div class="dmo-row"><button type="button" class="dmo-b" data-dmo-act="send">לשלוח את התשובה</button><button type="button" class="dmo-b alt" data-dmo-act="crm">להוסיף ללידים</button></div>':'')+'</div>';}).join('');
 } else if(key==='mail'){
  label='✉️ מייל';
  h=(d.mail||[]).map(function(m){return '<div class="dmo-card"><b>'+esc(m.from||'')+'</b>'+(m.tag?dmoTag(m.tag):'')+'<div class="dmo-meta">'+esc(m.subject||'')+(m.when?' · '+esc(m.when):'')+'</div><p>'+esc(m.text||'')+'</p>'
    +(m.reply?'<div class="dmo-ai"><small>✨ טיוטת תשובה</small><p>'+esc(m.reply)+'</p></div><div class="dmo-row"><button type="button" class="dmo-b" data-dmo-act="send">לשלוח</button></div>':'')+'</div>';}).join('');
 } else if(key==='ads'){
  label='📣 קמפיינים';
  var A=d.ads||[],sp=0,ld=0,ck=0;A.forEach(function(c){sp+=Number(c.spend)||0;ld+=Number(c.leads)||0;ck+=Number(c.clicks)||0;});
  h='<div class="dmo-card"><b>'+esc(((d.adsMeta||[])[0]||{}).range||'החודש')+'</b><div class="dmo-kpis"><div class="dmo-k"><b>'+dmoMoney(sp)+'</b><small>הוצאה</small></div><div class="dmo-k"><b>'+dmoNum(ck)+'</b><small>קליקים</small></div><div class="dmo-k"><b>'+dmoNum(ld)+'</b><small>לידים</small></div><div class="dmo-k"><b>'+(ld?dmoMoney(sp/ld):'אין')+'</b><small>לליד</small></div></div></div>'
   +A.map(function(c){return '<div class="dmo-card"><b>'+esc(c.name||'')+'</b>'+(c.status?dmoTag(c.status):'')
    +'<div class="dmo-kpis"><div class="dmo-k"><b>'+dmoMoney(c.spend)+'</b><small>הוצאה</small></div><div class="dmo-k"><b>'+dmoNum(c.impressions)+'</b><small>חשיפות</small></div><div class="dmo-k"><b>'+dmoNum(c.clicks)+'</b><small>קליקים</small></div><div class="dmo-k"><b>'+dmoNum(c.leads)+'</b><small>לידים</small></div></div>'
    +(c.tip?'<div class="dmo-ai"><small>✨ המלצה</small><p>'+esc(c.tip)+'</p></div>':'')
    +'<div class="dmo-row"><button type="button" class="dmo-b alt" data-dmo-act="pause">להשהות</button><button type="button" class="dmo-b alt" data-dmo-act="budget">להגדיל תקציב</button></div></div>';}).join('');
 } else if(key==='camp'){
  // 10.11.2026: what the customer gets after uploading photos or a video. An example, every detail made up.
  label='📣 קמפיין מתמונות וסרטון';
  h=dmoCampHtml();
 } else if(key==='crm'){
  label='👥 לקוחות ולידים';
  var cols=['ליד חדש','בשיחה','הצעת מחיר','נסגר'],L=d.crm||[];
  h='<div class="dmo-pipe">'+cols.map(function(c){var it=L.filter(function(r){return r.stage===c;});
    return '<div class="dmo-col"><b>'+esc(c)+' ('+it.length+')</b>'+it.map(function(r){return '<div class="dmo-lead"><b>'+esc(r.name||'')+'</b><br>'+esc(r.what||'')+'<br><span class="dmo-meta">'+esc(r.src||'')+(r.amount?' · '+dmoMoney(r.amount):'')+'</span>'+(r.next?'<br><span class="dmo-meta">⏰ '+esc(r.next)+'</span>':'')+'</div>';}).join('')+'</div>';}).join('')+'</div>';
 } else if(key==='quote'){
  label='🧾 הצעת מחיר';
  var q=((d.quote||[])[0])||{};
  h='<div class="dmo-card"><div class="dmo-f"><label>שם הלקוח</label><input id="dqName" value="'+esc(q.client||'')+'"></div>'
   +'<div class="dmo-f"><label>נושא</label><input id="dqSub" value="'+esc(q.subject||'')+'"></div>'
   +'<table class="dmo-items" id="dqItems"><tr><td style="width:55%">פריט</td><td>כמות</td><td>מחיר</td></tr>'
   +(q.items||[['','1','']]).concat([['','','']]).map(function(it){return '<tr><td><input value="'+esc(it[0]||'')+'"></td><td><input inputmode="decimal" value="'+esc(String(it[1]||''))+'"></td><td><input inputmode="decimal" value="'+esc(String(it[2]||''))+'"></td></tr>';}).join('')+'</table>'
   +'<div class="dmo-row"><button type="button" class="dmo-b alt" data-dmo-act="qrow">+ שורה</button><button type="button" class="dmo-b" data-dmo-act="qmake">להפיק הצעה</button></div></div><div id="dqOut"></div>';
  // 3.11: quotes and invoices he asked for in WhatsApp sit on top, each opens as the PDF.
  if((d.made||[]).length)h='<div class="dmo-card"><b>הופקו מהוואטסאפ ('+d.made.length+')</b></div>'
   +d.made.map(function(it){return '<div class="dmo-card" data-fid="'+esc(it.id)+'">'+dmoFeedHtml(it)+'</div>';}).join('')
   +'<div class="dmo-card"><b>הצעה חדשה</b></div>'+h;
 } else if(key==='meet'){
  label='🎙️ סיכומי פגישות';
  h='<div class="dmo-card"><b>איך זה עובד</b><p>מסיימים פגישה, שולחים למוניטור הודעה קולית בוואטסאפ ("סיכום הפגישה עם...") או מקליטים את הפגישה עצמה. המוניטור מסכם, מוציא החלטות ומשימות, שולח ללקוח את המשימות שלו, ומזכיר לך את שלך.</p></div>'
   +(d.meet||[]).map(function(m){var li=function(a){return (a||[]).map(function(x){return '<p>• '+esc(x)+'</p>';}).join('');};
    return '<div class="dmo-card"><b>'+esc(m.client||'')+'</b><div class="dmo-meta">'+esc(m.when||'')+'</div><p>'+esc(m.summary||'')+'</p>'
     +'<div class="dmo-ai"><small>✅ הוחלט</small>'+li(m.decisions)+'</div>'
     +'<div class="dmo-ai" style="background:#fef3c7;border-color:#fcd34d"><small style="color:#92400e">📋 משימות ללקוח</small>'+li(m.tasksClient)+'</div>'
     +'<div class="dmo-ai" style="background:#eef2f7;border-color:#cbd5e1"><small style="color:#24364b">🙋 משימות שלי</small>'+li(m.tasksMe)+'</div>'
     +'<div class="dmo-meta" style="margin-top:8px">📅 פגישת המשך: '+esc(m.next||'')+'</div>'
     +'<div class="dmo-row"><button type="button" class="dmo-b wa" data-dmo-act="send">💬 לשלוח ללקוח את המשימות</button><button type="button" class="dmo-b alt" data-dmo-act="cal">📅 לקבוע המשך</button></div></div>';}).join('');
 } else if(key==='clients'){
  label='👥 הלקוחות שלי';
  h=(d.client||[]).map(function(c){return '<div class="dmo-card"><b>'+esc(c.name||'')+'</b>'+(c.status?dmoTag(c.status):'')+'<div class="dmo-meta">'+esc(c.biz||'')+'</div>'
    +'<p>🗓️ פגישה אחרונה: '+esc(c.last||'')+'<br>📅 הבאה: '+esc(c.next||'')+'<br>📌 פתוח: '+esc(c.open||'')+'</p>'
    +'<div class="dmo-row"><button type="button" class="dmo-b wa" data-dmo-act="send">💬 הודעה</button><button type="button" class="dmo-b alt" data-dmo-act="cal">📅 לקבוע פגישה</button></div></div>';}).join('');
 } else if(key==='cal'){
  label='📅 פגישות ויומן';
  h='<div class="dmo-card"><b>לקבוע פגישה במשפט אחד</b><p>"תקבע לי פגישה עם רון ביום חמישי אחרי 12". המוניטור בודק ביומן מתי אתה פנוי, שולח זימון, ומזכיר ללקוח יום לפני.</p></div>'
   +(d.slot||[]).map(function(x){return '<div class="dmo-card"><b>'+esc(x.when||'')+'</b><div class="dmo-meta">'+esc(x.who||'')+'</div><p>'+esc(x.what||'')+'</p><div class="dmo-row"><button type="button" class="dmo-b alt" data-dmo-act="remind">🔔 תזכורת ללקוח</button></div></div>';}).join('');
 } else if(key==='day'){
  label='☀️ מה יש לי היום';
  var hot=(d.mail||[]).filter(function(m){return /דחוף|חם/.test(m.tag||'');}),op=(d.client||[]).filter(function(c){return c.open;}),sl=(d.slot||[]).slice(0,2);
  h='<div class="dmo-card"><b>פגישות קרובות</b>'+sl.map(function(x){return '<p>• '+esc(x.when)+': '+esc(x.who)+', '+esc(x.what)+'</p>';}).join('')+'</div>'
   +'<div class="dmo-card"><b>דחוף ('+hot.length+')</b>'+hot.map(function(m){return '<p>• '+esc(m.from||'')+': '+esc(m.subject||'')+'</p>';}).join('')+'</div>'
   +'<div class="dmo-card"><b>פתוח מול לקוחות ('+op.length+')</b>'+op.map(function(c){return '<p>• '+esc(c.name)+': '+esc(c.open)+'</p>';}).join('')+'</div>';
 }
 shipOpen('dmoSheet',label,h||'<p>אין עדיין נתונים כאן.</p>',function(el){el.addEventListener('click',dmoAct);if(key==='camp'){el.addEventListener('change',dmoCampChange);dmoCampSounds();}});
 if(key==='quote')dmoQuote();
}
// 10.11.2026, Itzik: the campaign sheet was only an explanation. Now it has the real controls:
// photos, videos to join in order, what to make, the post text and the sound. In the demo the
// files stay in this browser only (nothing is uploaded), and the draft is built from the choices.
var dmoC={ph:[],vd:[],au:null};
var DMO_MAKE=['מודעה','סטורי','ריל','פוסט','קרוסלה','סרטון מכל החומרים'];
function dmoCampHtml(){
 dmoC={ph:[],vd:[],au:null};
 return '<div class="dmo-card"><b>איך זה עובד</b><p>מעלים תמונות וסרטונים, בוחרים מה לעשות, כותבים מה חשוב ובוחרים צליל. המוניטור מכין טיוטה, ושום דבר לא עולה בלי אישור שלך.</p></div>'
  +'<div class="dmo-card"><b>1. תמונות</b><div><label class="dmo-up">＋ העלאת תמונות<input type="file" id="dcPh" accept="image/*" multiple hidden></label></div><div class="dmo-th" id="dcPhL"></div></div>'
  +'<div class="dmo-card"><b>2. סרטונים</b><p class="dmo-meta">אפשר להעלות כמה סרטונים. הסדר כאן הוא הסדר בסרטון המחובר.</p><div><label class="dmo-up">＋ העלאת סרטונים<input type="file" id="dcVd" accept="video/*" multiple hidden></label></div><div id="dcVdL"></div>'
  +'<label class="dmo-chip" style="margin-top:8px"><input type="checkbox" id="dcJoin" checked><span>לחבר את הסרטונים לסרטון אחד</span></label></div>'
  +'<div class="dmo-card"><b>3. מה להכין</b><div class="dmo-chips" id="dcMk">'+DMO_MAKE.map(function(x){return '<label class="dmo-chip"><input type="checkbox" value="'+esc(x)+'"><span>'+esc(x)+'</span></label>';}).join('')+'</div></div>'
  +'<div class="dmo-card"><b>4. מה חשוב להגיד</b><div class="dmo-f"><label>תיאור לפוסט, או מה שחשוב לך שיופיע</label><textarea id="dcTx" rows="4" placeholder="למשל: נפתחת קבוצה חדשה, שבוע ראשון בחצי מחיר"></textarea></div></div>'
  +'<div class="dmo-card"><b>5. צליל</b><div class="dmo-chips" id="dcSn"><label class="dmo-chip"><input type="radio" name="dcSnd" value="" checked><span>בלי מוזיקה</span></label></div>'
  +'<p class="dmo-meta" id="dcNoLib" hidden>אוסף הצלילים שלנו עוד ריק. אפשר להעלות צליל משלך, או להוסיף מוזיקה בזמן הפרסום מאוסף הצלילים של Meta, בחינם.</p>'
  +'<div><label class="dmo-up alt">＋ העלאת צליל משלי<input type="file" id="dcAu" accept="audio/*" hidden></label></div><div id="dcAuL"></div></div>'
  +'<div class="dmo-row" style="margin:10px 0"><button type="button" class="dmo-b" data-dmo-act="dcmake">להכין טיוטה</button></div><div id="dcOut"></div>';
}
function dmoCampPaint(){
 var w=document.getElementById('dmoSheet');if(!w)return;
 var ph=w.querySelector('#dcPhL'),vd=w.querySelector('#dcVdL'),au=w.querySelector('#dcAuL');
 if(ph)ph.innerHTML=dmoC.ph.map(function(f,i){return '<div class="dmo-ti"><img src="'+f.url+'" alt=""><button type="button" data-dmo-act="dcrm" data-k="ph" data-i="'+i+'">מחיקה</button></div>';}).join('');
 if(vd)vd.innerHTML=dmoC.vd.map(function(f,i){return '<div class="dmo-vr"><b>'+(i+1)+'</b><video src="'+f.url+'#t=0.1" muted playsinline preload="metadata"></video><span>'+esc(f.name)+'</span>'
  +'<button type="button" data-dmo-act="dcup" data-i="'+i+'"'+(i===0?' disabled':'')+'>▲</button><button type="button" data-dmo-act="dcdn" data-i="'+i+'"'+(i===dmoC.vd.length-1?' disabled':'')+'>▼</button><button type="button" data-dmo-act="dcrm" data-k="vd" data-i="'+i+'">✕</button></div>';}).join('');
 if(au)au.innerHTML=dmoC.au?'<div class="dmo-vr"><span>'+esc(dmoC.au.name)+'</span><audio src="'+dmoC.au.url+'" controls preload="none" style="max-width:100%"></audio><label class="dmo-chip"><input type="checkbox" id="dcRight"><span>הצליל שלי ויש לי זכויות עליו</span></label><button type="button" data-dmo-act="dcrm" data-k="au" data-i="0">✕</button></div>':'';
}
function dmoCampChange(e){
 var t=e.target;if(!t||t.type!=='file'||!t.files)return;
 var fl=[].slice.call(t.files);
 if(t.id==='dcPh')fl.forEach(function(f){dmoC.ph.push({name:f.name,file:f,url:URL.createObjectURL(f)});});
 else if(t.id==='dcVd')fl.forEach(function(f){dmoC.vd.push({name:f.name,file:f,url:URL.createObjectURL(f)});});
 else if(t.id==='dcAu'&&fl[0]){if(dmoC.au)URL.revokeObjectURL(dmoC.au.url);dmoC.au={name:fl[0].name,file:fl[0],url:URL.createObjectURL(fl[0])};
  var r=document.querySelector('#dcSn input:checked');if(r)r.checked=false;}
 t.value='';dmoCampPaint();
}
function dmoCampMove(i,d){var j=i+d;if(j<0||j>=dmoC.vd.length)return;var x=dmoC.vd[i];dmoC.vd[i]=dmoC.vd[j];dmoC.vd[j]=x;dmoCampPaint();}
function dmoCampRm(k,i){
 var a=k==='au'?null:dmoC[k];
 if(k==='au'){if(dmoC.au)URL.revokeObjectURL(dmoC.au.url);dmoC.au=null;var r=document.querySelector('#dcSn input');if(r&&!document.querySelector('#dcSn input:checked'))r.checked=true;}
 else{URL.revokeObjectURL(a[i].url);a.splice(i,1);}
 dmoCampPaint();
}
function dmoCampMake(e){
 var w=document.getElementById('dmoSheet');if(!w)return;
 var mk=[].slice.call(w.querySelectorAll('#dcMk input:checked')).map(function(x){return x.value;});
 var tx=((w.querySelector('#dcTx')||{}).value||'').trim();
 var join=!!(w.querySelector('#dcJoin')||{}).checked;
 var sel=w.querySelector('#dcSn input:checked'),sn='',sid='';
 if(dmoC.au){
  if(!(w.querySelector('#dcRight')||{}).checked){toast('לסמן שיש לך זכויות על הצליל שהעלית, או להסיר אותו.');return;}
  sn='צליל משלי: '+dmoC.au.name+' (הלקוח מאשר שיש לו זכויות עליו)';
 } else if(sel&&sel.value){sid=sel.value;sn='צליל: '+(sel.getAttribute('data-t')||sel.value);}
 var o=w.querySelector('#dcOut');if(!o)return;
 if(!dmoC.ph.length&&!dmoC.vd.length&&!tx){toast('להעלות לפחות תמונה או סרטון, או לכתוב מה חשוב.');return;}
 if(!mk.length)mk=['מודעה ממומנת'];
 var files=dmoC.ph.map(function(x){return x.file;}).concat(dmoC.vd.map(function(x){return x.file;}));
 if(dmoC.au)files.push(dmoC.au.file);
 var order=dmoC.vd.map(function(x,i){return (i+1)+'. '+x.name;});
 var note='[הדגמה] קמפיין: '+mk.join(', ')+(tx?' | '+tx:'')+(sn?' | '+sn:'')
  +(dmoC.ph.length?' | תמונות: '+dmoC.ph.map(function(x){return x.name;}).join(', '):'')
  +(order.length?' | סדר הסרטונים: '+order.join(', ')+(join&&dmoC.vd.length+dmoC.ph.length>1?' | לחבר הכול לסרטון אחד':''):'');
 var btn=e&&e.target;if(btn)btn.disabled=true;
 o.innerHTML='<div class="dmo-card"><b>שולח את החומרים למוניטור</b><p class="dmo-meta">'+files.length+' קבצים. לא לסגור את הדף עד שההעלאה נגמרת.</p></div>';
 o.scrollIntoView({behavior:'smooth'});
 var go=files.length?sendAll(files,note):sendText('קמפיין',note,'משימה');
 go.then(function(){
  try{markSent(files.length?'file':'text',note);}catch(x){}
  o.innerHTML='<div class="dmo-card"><span class="dmo-tag ok">נשלח</span><b> המוניטור מכין את הטיוטה</b><p>קיבלתי '+dmoC.ph.length+' תמונות ו '+dmoC.vd.length+' סרטונים. להכין: '+mk.map(esc).join(', ')+'.'
   +(join&&dmoC.vd.length+dmoC.ph.length>1?' הכול יחובר לסרטון אחד לפי הסדר.':'')+(sn?' '+esc(sn)+'.':'')+'</p>'
   +'<p class="dmo-meta">הטיוטה תופיע במסך "תשובות" בעוד כמה דקות, עם הסרטון המחובר, גרסאות כיתוב ותיאור לפוסט. שום דבר לא עולה בלי אישור שלך.</p>'
   +'<div class="dmo-row"><button type="button" class="dmo-b" id="dcToAns">לפתוח את התשובות</button></div></div>';
  var ta=document.getElementById('dcToAns');if(ta)ta.onclick=function(){var s=document.getElementById('dmoSheet');if(s)s.remove();var b2=document.getElementById('dmoAnsBtn');if(b2)b2.click();};
 }).catch(function(){
  if(btn)btn.disabled=false;
  o.innerHTML='<div class="dmo-card"><b>לא נשלח</b><p>בדוק חיבור ונסה שוב. החומרים שבחרת נשארו כאן.</p></div>';
 });
}
function dmoCampSounds(){
 fetch('sounds/index.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():[];}).then(function(list){
  var box=document.getElementById('dcSn');if(!box||!Array.isArray(list))return;
  var ok=list.filter(function(s){return s&&s.id&&s.file;});
  if(!ok.length){var n=document.getElementById('dcNoLib');if(n)n.hidden=false;return;}
  ok.forEach(function(s){
   var d=document.createElement('div');d.style.cssText='width:100%;margin-top:6px';
   d.innerHTML='<label class="dmo-chip"><input type="radio" name="dcSnd" value="'+esc(s.id)+'" data-t="'+esc(s.title||s.id)+'"><span>'+esc(s.title||s.id)+(s.mood?' · '+esc(s.mood):'')+'</span></label>'
    +'<audio controls preload="none" src="sounds/'+esc(s.file)+'" style="width:100%;margin-top:4px"></audio>';
   box.appendChild(d);
  });
 }).catch(function(){});
}
function dmoQuote(){
 var w=document.getElementById('dmoSheet');if(!w)return '';
 var rows=[].slice.call(w.querySelectorAll('#dqItems tr')).slice(1).map(function(tr){var i=tr.querySelectorAll('input');return [i[0].value.trim(),Number(i[1].value)||0,Number(i[2].value)||0];}).filter(function(r){return r[0]&&r[1]&&r[2];});
 var sum=0;rows.forEach(function(r){sum+=r[1]*r[2];});
 var vat=Math.round(sum*0.18),today=new Date().toLocaleDateString('he-IL'),no='Q'+new Date().toISOString().slice(2,10).split('-').join('');
 var nm=(w.querySelector('#dqName')||{}).value||'',sb=(w.querySelector('#dqSub')||{}).value||'';
 var html='<div class="dmo-q"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><h3>הצעת מחיר</h3><div class="dmo-meta">מספר '+esc(no)+' · '+esc(today)+'</div></div><div class="dmo-brand"><span>IT</span><b>IT<i>solution</i></b></div></div>'
  +'<p style="margin:14px 0 0;font:600 15px Heebo,sans-serif">לכבוד: '+esc(nm)+'</p>'+(sb?'<p style="margin:4px 0 0;font:400 14px Heebo,sans-serif">הנדון: '+esc(sb)+'</p>':'')
  +'<table><tr><th>פריט</th><th>כמות</th><th>מחיר</th><th>סה״כ</th></tr>'
  +rows.map(function(r){return '<tr><td>'+esc(r[0])+'</td><td>'+r[1]+'</td><td>'+dmoMoney(r[2])+'</td><td>'+dmoMoney(r[1]*r[2])+'</td></tr>';}).join('')
  +'<tr><td colspan="3">סה״כ לפני מע״מ</td><td>'+dmoMoney(sum)+'</td></tr><tr><td colspan="3">מע״מ 18%</td><td>'+dmoMoney(vat)+'</td></tr><tr class="tot"><td colspan="3">סה״כ לתשלום</td><td>'+dmoMoney(sum+vat)+'</td></tr></table>'
  +'<p class="dmo-meta" style="margin-top:14px">ההצעה בתוקף ל 30 יום. תנאי תשלום: שוטף + 30&rlm;.</p></div>';
 var o=w.querySelector('#dqOut');if(o)o.innerHTML=html+'<div class="dmo-row"><button type="button" class="dmo-b" data-dmo-act="qpdf">הורדה כ PDF</button></div>';
 return html;
}
function dmoAct(e){
 var t=e.target.closest&&e.target.closest('[data-dmo-act]');if(!t)return;
 var a=t.getAttribute('data-dmo-act');
 if(a==='send'){t.disabled=true;t.textContent='נשלח ✓';return;}
 if(a==='crm'){t.disabled=true;t.textContent='נוסף ללידים ✓';return;}
 if(a==='cal'){t.disabled=true;t.textContent='זימון נשלח ✓';toast('המוניטור בדק ביומן, מצא שעה פנויה ושלח זימון.');return;}
 if(a==='remind'){t.disabled=true;t.textContent='תזכורת תישלח יום לפני ✓';return;}
 if(a==='pause'){t.disabled=true;t.textContent='הושהה ✓';toast('בגרסה המלאה זה עובר למנהל המודעות, רק אחרי אישור שלך.');return;}
 if(a==='budget'){toast('המוניטור שואל קודם בכמה ועד מתי. שום שינוי בכסף בלי אישור שלך.');return;}
 if(a==='dcmake'){dmoCampMake(e);return;}
 if(a==='dcup'){dmoCampMove(Number(t.getAttribute('data-i')),-1);return;}
 if(a==='dcdn'){dmoCampMove(Number(t.getAttribute('data-i')),1);return;}
 if(a==='dcrm'){dmoCampRm(t.getAttribute('data-k'),Number(t.getAttribute('data-i')));return;}
 if(a==='qrow'){var tb=document.querySelector('#dqItems tbody')||document.querySelector('#dqItems');tb.insertAdjacentHTML('beforeend','<tr><td><input></td><td><input inputmode="decimal"></td><td><input inputmode="decimal"></td></tr>');return;}
 if(a==='qmake'){dmoQuote();var o=document.getElementById('dqOut');if(o)o.scrollIntoView({behavior:'smooth'});return;}
 if(a==='qpdf'){
  var html=dmoQuote(),p=document.getElementById('dmoPrint');
  if(!p){p=document.createElement('div');p.id='dmoPrint';document.body.appendChild(p);}
  p.innerHTML=html;document.body.classList.add('dmo-print');
  setTimeout(function(){window.print();setTimeout(function(){document.body.classList.remove('dmo-print');},500);},50);
 }
}
// 1.11, Itzik: what the monitor made up in the demo (a mail, a quote, an invoice) shows here live, with buttons.
var dmoFeedSeen={},dmoFeedT=null,dmoFeedItems={};
function dmoFeedStart(){if(dmoFeedT)return;dmoFeedPull();dmoFeedT=setInterval(dmoFeedPull,5000);}
function dmoFeedPull(){
 if(!document.body.classList.contains('dmo-real'))return;
 dmoApi('feed',{}).then(function(r){
  var a=(r&&r.items)||[],box=document.getElementById('dmoFeed');if(!box)return;
  a.forEach(function(it){
   if(dmoFeedSeen[it.id])return;dmoFeedSeen[it.id]=1;dmoFeedItems[it.id]=it;
   box.hidden=false;
   var el=document.createElement('div');el.className='dmo-qa dmo-fi';el.setAttribute('data-fid',it.id);
   el.innerHTML=dmoFeedHtml(it);
   var list=box.querySelector('.dmo-fl');list.insertBefore(el,list.firstChild);
   try{toast('📥 הגיע למוניטור: '+(it.title||''));}catch(e){}
   dmoPaintCnt();
  });
 }).catch(function(){});
}
function dmoWhen(w){w=String(w||'');if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(w)){var d=new Date(w);if(!isNaN(d))return d.toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'numeric'})+', '+d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});}return w;}
function dmoFeedHtml(it){
 var ic={campaign:'📣',mail:'✉️',quote:'🧾',invoice:'🧾',doc:'📄',note:'📝',lead:'👤',meeting:'📅',report:'📊',task:'✅'}[it.type]||'📄',NL=String.fromCharCode(10);
 var h='<div class="q">'+ic+' '+esc(it.title||'')+'</div>';
 if(it.type==='mail'){
  h+='<div class="dmo-meta">'+(it.from?'מאת: '+esc(it.from):'')+(it.subject?' · '+esc(it.subject):'')+'</div><div class="a">'+esc(it.text||'')+'</div>'
   +'<div class="dmo-row"><button type="button" class="dmo-b" data-fa="reply">↩️ להשיב</button><button type="button" class="dmo-b alt" data-fa="resend">🔁 שליחה חוזרת</button><button type="button" class="dmo-b wa" data-fa="wa">💬 בוואטסאפ</button><button type="button" class="dmo-b alt" data-fa="save">📥 שמירה לטלפון</button></div>';
 } else if(it.type==='quote'||it.type==='invoice'){
  var sum=0;(it.items||[]).forEach(function(r){sum+=r[1]*r[2];});
  h+='<div class="dmo-meta">'+(it.client?'לכבוד: '+esc(it.client):'')+(it.subject?' · '+esc(it.subject):'')+'</div>'
   +'<div class="a">'+(it.items||[]).map(function(r){return '• '+esc(r[0])+(r[1]>1?' × '+r[1]:'')+': '+dmoMoney(r[1]*r[2]);}).join(NL)
   +NL+'סה״כ כולל מע״מ: '+dmoMoney(sum+Math.round(sum*0.18))+'</div>'
   +(it.text?'<div class="dmo-meta" style="margin-top:6px">'+esc(it.text)+'</div>':'')
   +'<div class="dmo-row"><button type="button" class="dmo-b" data-fa="open">📄 פתיחה ו PDF</button><button type="button" class="dmo-b wa" data-fa="wa">💬 בוואטסאפ</button><button type="button" class="dmo-b alt" data-fa="mail">✉️ במייל</button><button type="button" class="dmo-b alt" data-fa="resend">🔁 שליחה חוזרת</button></div>';
 } else if(it.type==='lead'){
  h+='<div class="dmo-meta">'+esc(it.client||it.from||'')+(it.phone?' · '+esc(it.phone):'')+'</div><div class="a">'+esc(it.text||'')+'</div>'
   +'<div class="dmo-row">'+(it.phone?'<a class="dmo-b" href="tel:'+esc(it.phone)+'">📞 להתקשר</a>':'')+'<button type="button" class="dmo-b wa" data-fa="wa">💬 בוואטסאפ</button><button type="button" class="dmo-b alt" data-fa="stage">➡️ להעביר לבשיחה</button></div>';
 } else if(it.type==='meeting'){
  h+='<div class="dmo-meta">'+esc(dmoWhen(it.when))+(it.where?' · '+esc(it.where):'')+'</div><div class="a">'+esc(it.text||'')+'</div>'
   +'<div class="dmo-row"><button type="button" class="dmo-b" data-fa="cal">📅 ליומן</button><button type="button" class="dmo-b wa" data-fa="wa">💬 זימון בוואטסאפ</button><button type="button" class="dmo-b alt" data-fa="resend">🔔 תזכורת ללקוח</button></div>';
 } else if(it.type==='report'){
  var K=it.kpis||{};
  h+='<div class="dmo-kpis">'+Object.keys(K).map(function(k){return '<div class="dmo-k"><b>'+esc(K[k])+'</b><small>'+esc(k)+'</small></div>';}).join('')+'</div>'
   +(it.text?'<div class="dmo-ai"><small>✨ המלצה</small><p>'+esc(it.text)+'</p></div>':'')
   +'<div class="dmo-row"><button type="button" class="dmo-b wa" data-fa="wa">💬 בוואטסאפ</button><button type="button" class="dmo-b alt" data-fa="mail">✉️ במייל</button><button type="button" class="dmo-b alt" data-fa="save">📥 שמירה לטלפון</button></div>';
 } else if(it.type==='campaign'){
  var MI={video:'🎬',image:'🖼️',audio:'🎵'};
  h+='<div class="dmo-meta">'+(it.goal?'מטרה: '+esc(it.goal):'')+(it.audience?' · קהל: '+esc(it.audience):'')+(it.budget?' · תקציב: '+esc(it.budget):'')+'</div>'
   +(it.media&&it.media.length?'<div class="dmo-row">'+it.media.map(function(m){return '<button type="button" class="dmo-b alt" data-fa="media" data-u="'+esc(m.u)+'">'+(MI[m.k]||'📄')+' '+esc(m.t||'פתיחה')+'</button>';}).join('')+'</div>':'')
   +(it.versions||[]).map(function(v,i){return '<div class="dmo-ai"><small>✨ גרסה '+(i+1)+'</small><p>'+esc(v)+'</p></div>';}).join('')
   +(it.text?'<div class="dmo-ai"><small>✨ תיאור לפוסט</small><p>'+esc(it.text)+'</p></div>':'')
   +(it.sound?'<p class="dmo-meta">צליל: '+esc(it.sound)+'</p>':'')+(it.fit?'<p class="dmo-meta">התאמה: '+esc(it.fit)+'</p>':'')
   +'<div class="dmo-row"><button type="button" class="dmo-b" data-fa="approve">לאשר את הטיוטה</button><button type="button" class="dmo-b alt" data-fa="change">לבקש שינוי</button><button type="button" class="dmo-b wa" data-fa="wa">💬 בוואטסאפ</button></div>';
 } else if(it.type==='task'){
  h+='<div class="dmo-meta">'+esc(it.when||'')+'</div><div class="a">'+esc(it.text||'')+'</div>'
   +'<div class="dmo-row"><button type="button" class="dmo-b" data-fa="done">✅ בוצע</button><button type="button" class="dmo-b alt" data-fa="later">⏰ להזכיר מחר</button></div>';
 } else {
  h+=(it.from?'<div class="dmo-meta">'+esc(it.from)+'</div>':'')+'<div class="a">'+esc(it.text||'')+'</div>'
   +'<div class="dmo-row"><button type="button" class="dmo-b wa" data-fa="wa">💬 בוואטסאפ</button><button type="button" class="dmo-b alt" data-fa="save">📥 שמירה לטלפון</button></div>';
 }
 return h;
}
function dmoDocHtml(kind,client,subject,rows){
 var sum=0;rows.forEach(function(r){sum+=r[1]*r[2];});
 var vat=Math.round(sum*0.18),today=new Date().toLocaleDateString('he-IL'),stamp=new Date().toISOString().slice(2,10).split('-').join('');
 var inv=kind==='invoice';
 return '<div class="dmo-q"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><h3>'+(inv?'חשבונית':'הצעת מחיר')+'</h3><div class="dmo-meta">מספר '+(inv?'INV':'Q')+esc(stamp)+' · '+esc(today)+'</div></div><div class="dmo-brand"><span>IT</span><b>IT<i>solution</i></b></div></div>'
  +'<p style="margin:14px 0 0;font:600 15px Heebo,sans-serif">לכבוד: '+esc(client||'')+'</p>'+(subject?'<p style="margin:4px 0 0;font:400 14px Heebo,sans-serif">הנדון: '+esc(subject)+'</p>':'')
  +'<table><tr><th>פריט</th><th>כמות</th><th>מחיר</th><th>סה״כ</th></tr>'
  +rows.map(function(r){return '<tr><td>'+esc(r[0])+'</td><td>'+r[1]+'</td><td>'+dmoMoney(r[2])+'</td><td>'+dmoMoney(r[1]*r[2])+'</td></tr>';}).join('')
  +'<tr><td colspan="3">סה״כ לפני מע״מ</td><td>'+dmoMoney(sum)+'</td></tr><tr><td colspan="3">מע״מ 18%</td><td>'+dmoMoney(vat)+'</td></tr><tr class="tot"><td colspan="3">סה״כ'+(inv?'':' לתשלום')+'</td><td>'+dmoMoney(sum+vat)+'</td></tr></table>'
  +'<p class="dmo-meta" style="margin-top:14px">'+(inv?'תודה! התשלום התקבל.':'ההצעה בתוקף ל 30 יום. תנאי תשלום: שוטף + 30&rlm;.')+'</p></div>';
}
function dmoItemText(it){
 var NL=String.fromCharCode(10);
 if(it.type==='mail')return (it.subject?it.subject+NL:'')+(it.from?'מאת: '+it.from+NL+NL:'')+(it.text||'');
 if(it.type==='quote'||it.type==='invoice'){var sum=0,t=(it.type==='invoice'?'חשבונית':'הצעת מחיר')+' ל'+(it.client||'')+NL;(it.items||[]).forEach(function(r){sum+=r[1]*r[2];t+='• '+r[0]+(r[1]>1?' × '+r[1]:'')+': '+dmoMoney(r[1]*r[2])+NL;});return t+'סה״כ כולל מע״מ: '+dmoMoney(sum+Math.round(sum*0.18));}
 return (it.title?it.title+NL:'')+(it.text||'');
}
document.addEventListener('click',function(e){
 var b=e.target.closest&&e.target.closest('[data-fa]');if(!b)return;
 var card=b.closest('[data-fid]'),it=card&&dmoFeedItems[card.getAttribute('data-fid')];if(!it)return;
 e.preventDefault();e.stopImmediatePropagation();
 var a=b.getAttribute('data-fa'),txt=dmoItemText(it);
 if(a==='media'){var mu=b.getAttribute('data-u');if(typeof fileView==='function'&&fileView(mu.indexOf('files/')===0?mu.slice(6):mu))return;window.open(mu,'_blank');return;}
 if(a==='approve'){b.disabled=true;b.textContent='אושר ✓';toast('בגרסה המלאה זה יוצא לפרסום רק אחרי האישור הזה. בהדגמה לא פורסם כלום.');return;}
 if(a==='change'){var qc=dmoInput();if(qc){qc.value='בקמפיין "'+(it.title||'')+'" תשנה: ';qc.focus();window.scrollTo({top:0,behavior:'smooth'});}return;}
 if(a==='wa'){window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank');return;}
 if(a==='mail'){location.href='mailto:?subject='+encodeURIComponent(it.title||'')+'&body='+encodeURIComponent(txt);return;}
 if(a==='resend'){b.disabled=true;b.textContent='נשלח ✓';return;}
 if(a==='stage'){b.disabled=true;b.textContent='עבר לבשיחה ✓';return;}
 if(a==='done'){b.disabled=true;b.textContent='בוצע ✓';card.style.opacity='.6';return;}
 if(a==='later'){b.disabled=true;b.textContent='אזכיר מחר ✓';return;}
 if(a==='cal'){window.open('https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(it.title||'פגישה')+'&details='+encodeURIComponent(dmoWhen(it.when)+' '+(it.text||''))+'&location='+encodeURIComponent(it.where||''),'_blank');return;}
 if(a==='reply'){var qi=dmoInput();if(qi){qi.value='תנסח תשובה ל'+(it.from||'')+' על "'+(it.subject||it.title||'')+'"';qi.focus();window.scrollTo({top:0,behavior:'smooth'});}return;}
 if(a==='save'){var bl=new Blob([txt],{type:'text/plain;charset=utf-8'}),u=URL.createObjectURL(bl),l=document.createElement('a');l.href=u;l.download=(it.title||'מסמך')+'.txt';document.body.appendChild(l);l.click();l.remove();setTimeout(function(){URL.revokeObjectURL(u);},4000);b.textContent='נשמר ✓';return;}
 if(a==='open'){
  var html=dmoDocHtml(it.type,it.client,it.subject,it.items||[]);
  shipOpen('dmoDoc',(it.type==='invoice'?'🧾 חשבונית':'🧾 הצעת מחיר'),html+'<div class="dmo-row"><button type="button" class="dmo-b" id="dmoDocPdf">הורדה כ PDF</button></div>',function(el){
   el.querySelector('#dmoDocPdf').onclick=function(){var p=document.getElementById('dmoPrint');if(!p){p=document.createElement('div');p.id='dmoPrint';document.body.appendChild(p);}p.innerHTML=html;document.body.classList.add('dmo-print');setTimeout(function(){window.print();setTimeout(function(){document.body.classList.remove('dmo-print');},500);},50);};
  });
 }
},true);

// 1.11, Itzik: "תוסיף מוקאפ של תשובות במוניטור הדגמה". The demo gets its own bottom bar in the
// monitor's style (his real one stays hidden: its counter is his private answers), with
// "תשובות" opening every answer of the demo: ready examples, what came in live, and what was asked.
var dmoQA=[],dmoAnsSeen=0;
function dmoAnsItems(){
 var seed=((window.D&&D.demo)||[]).filter(function(r){return r.kind==='ans';}).map(function(r,i){var o={};for(var k in r)o[k]=r[k];o.id='seed'+i;o.type=r.type||'note';return o;});
 seed.forEach(function(o){dmoFeedItems[o.id]=o;});
 var live=Object.keys(dmoFeedItems).filter(function(k){return k.indexOf('seed')!==0;}).map(function(k){return dmoFeedItems[k];}).sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));});
 return {live:live,seed:seed};
}
function dmoAnsCount(){var a=dmoAnsItems();return a.live.length+a.seed.length+dmoQA.length;}
function dmoPaintCnt(){
 var n=Math.max(0,dmoAnsCount()-dmoAnsSeen),c=document.getElementById('dmoCnt');
 if(c){c.textContent=n;c.classList.toggle('zero',!n);}
 var num=document.getElementById('dmoAnsNum'),sub=document.getElementById('dmoAnsSub');
 if(num)num.textContent=n;
 if(sub){var a=dmoAnsItems(),top=a.live[0]||a.seed[0];sub.textContent=n?(n===1?'תשובה אחת חדשה':n+' תשובות חדשות')+(top?': '+(top.title||''):''):'אין חדש. לחיצה פותחת את כל התשובות';}
}
function dmoNavBar(wrap){
 var n=document.getElementById('dmoNav');
 if(!n){
  n=document.createElement('nav');n.className='bn';n.id='dmoNav';n.setAttribute('aria-label','מסכים');
  n.innerHTML='<button type="button" data-dn="home" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.5V20h12v-9.5"/><path d="M10 20v-5h4v5"/></svg>בית</button>'
   +'<button type="button" data-dn="ans" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v11h-9l-5 3.5v-3.5H4Z"/><path d="M8 10.5h8M8 14h5"/></svg>תשובות<i class="cnt" id="dmoCnt">0</i></button>'
   +'<button type="button" data-dn="clients" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c2.4.2 4.2 1.8 4.8 4.8"/></svg>לקוחות</button>'
   +'<button type="button" data-dn="cal" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>יומן</button>';
  wrap.appendChild(n);
  n.addEventListener('click',function(e){
   var b=e.target.closest&&e.target.closest('[data-dn]');if(!b)return;
   e.preventDefault();e.stopImmediatePropagation();
   var k=b.getAttribute('data-dn');
   [].forEach.call(n.querySelectorAll('[data-dn]'),function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
   if(k==='home'){window.scrollTo({top:0,behavior:'smooth'});return;}
   if(k==='ans'){dmoAnswers();return;}
   dmoSheet(k);
  },true);
 }
 dmoPaintCnt();
}
function dmoAnswers(){
 var a=dmoAnsItems(),h='';
 dmoAnsSeen=dmoAnsCount();dmoPaintCnt();
 if(dmoQA.length)h+='<div class="dmo-sec">שאלת עכשיו</div>'+dmoQA.slice().reverse().map(function(x){return '<div class="dmo-card"><b>'+esc(x.q)+'</b><p>'+esc(x.a||'המוניטור עובד על זה...')+'</p></div>';}).join('');
 if(a.live.length)h+='<div class="dmo-sec">הגיע עכשיו</div>'+a.live.map(function(it){return '<div class="dmo-qa dmo-fi" data-fid="'+esc(it.id)+'">'+dmoFeedHtml(it)+'</div>';}).join('');
 h+='<div class="dmo-sec">מהימים האחרונים</div>'+a.seed.map(function(it){return '<div class="dmo-qa dmo-fi" data-fid="'+esc(it.id)+'">'+(it.when?'<div class="dmo-meta">'+esc(it.when)+'</div>':'')+dmoFeedHtml(it)+'</div>';}).join('');
 shipOpen('dmoSheet','💬 תשובות',h,function(){});
}

// 1.11, Itzik: "תבנה לי מתחת אייקונים ריקים שאפשר יהיה למלא אותם כמו אצלי. גם במוניטור לדוגמה אייקון של פתקים".
// The circles row of the demo, in his monitor's own round style: 📝 פתקים, then empty circles
// that the client fills (a name, an emoji picked from the name). A filled circle asks the monitor
// about that subject; a long press empties it. All kept on this device only (dmoIcons, dmoNotes).
var DMO_EMO=[[/דוח|דו״ח|דוחות/,'📊'],[/ספק/,'🚚'],[/גבי|חוב|תשלום|כסף/,'💰'],[/חשבונ/,'🧾'],[/משימ/,'✅'],[/לקוח/,'👥'],[/פגיש|יומן/,'📅'],[/מייל/,'✉️'],[/הרצא|סדנ/,'🎤'],[/שיווק|קמפיין|פייסבוק/,'📣'],[/מסמ|חוז|הסכם/,'📄'],[/צוות|עובד/,'🧑‍💼']];
function dmoGet(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}
function dmoSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function dmoIcons(){
 var row=document.getElementById('dmoIcons');if(!row)return;
 var ics=dmoGet('dmoIcons',[null,null,null,null,null,null,null]);
 // 1.11, Itzik: "תעשה לי גם אייקון אחד דוגמה, נגיד ynet". Seeded once into the first empty circle.
 if(!dmoGet('dmoYnet',false)){var fe=ics.indexOf(null);if(fe>-1)ics[fe]={n:'ynet',e:'📰',url:'https://www.ynet.co.il'};dmoSet('dmoIcons',ics);dmoSet('dmoYnet',true);}
 // 10.11.2026, Itzik: the three trainings and the notes app are icons on every monitor, the demo too.
 var h='<button type="button" class="ic" data-dic="fcs"><span class="c c-fcs">🎯</span>אימון מכירות</button>'
  +'<button type="button" class="ic" data-dic="fcc"><span class="c c-fcc">🧭</span>אימון עסקי</button>'
  +'<button type="button" class="ic" data-dic="fcp"><span class="c c-fcp">🌿</span>אימון אישי</button>'
  +'<button type="button" class="ic" data-dic="notes"><span class="c c-dnote">📝</span>פתקים</button>';
 ics.forEach(function(x,i){
  h+=x?'<button type="button" class="ic" data-dic="'+i+'"><span class="c c-dfill'+(x.url&&/ynet/.test(x.url)?' c-ynet':'')+'">'+(x.url&&/ynet/.test(x.url)?'ynet':esc(x.e))+'</span>'+esc(x.n)+'</button>'
      :'<button type="button" class="ic" data-dic="'+i+'"><span class="c c-add"><svg viewBox="0 0 24 24" fill="none" stroke="var(--dim)" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>להוסיף</button>';
 });
 row.innerHTML=h;
 [].forEach.call(row.querySelectorAll('[data-dic]'),function(b){
  var k=b.getAttribute('data-dic'),tm=null,long=false;
  if(k!=='notes'&&ics[+k]){
   var hold=function(){long=false;tm=setTimeout(function(){long=true;var a=dmoGet('dmoIcons',ics);a[+k]=null;dmoSet('dmoIcons',a);dmoIcons();toast('האייקון התרוקן');},900);};
   var rel=function(){if(tm){clearTimeout(tm);tm=null;}};
   b.addEventListener('touchstart',hold,{passive:true});b.addEventListener('touchend',rel);b.addEventListener('mousedown',hold);b.addEventListener('mouseup',rel);b.addEventListener('mouseleave',rel);
  }
  b.addEventListener('click',function(e){
   e.preventDefault();e.stopImmediatePropagation();if(long){long=false;return;}
   if(k==='fcs'){window.scrollTo({top:0,behavior:'smooth'});return dmoAsk('אימון מכירות');}
   if(k==='fcc'){window.scrollTo({top:0,behavior:'smooth'});return dmoAsk('אימון עסקי');}
   if(k==='fcp'){window.scrollTo({top:0,behavior:'smooth'});return dmoAsk('אימון אישי');}
   if(k==='notes')return dmoNotes();
   var x=dmoGet('dmoIcons',ics)[+k];
   if(x&&x.url){window.open(x.url,'_blank','noopener');return;}
   if(x){window.scrollTo({top:0,behavior:'smooth'});dmoAsk('תראה לי מה יש על '+x.n);return;}
   var ask=(typeof uiPrompt==='function')?uiPrompt('מה לשים באייקון הזה? למשל: דוחות, ספקים, גבייה, משימות',''):Promise.resolve(window.prompt('מה לשים באייקון הזה?',''));
   Promise.resolve(ask).then(function(v){
    v=String(v||'').trim().slice(0,18);if(!v)return;
    var e2='⭐';DMO_EMO.forEach(function(m){if(e2==='⭐'&&m[0].test(v))e2=m[1];});
    var a=dmoGet('dmoIcons',ics);a[+k]={n:v,e:e2};dmoSet('dmoIcons',a);dmoIcons();toast('נוסף: '+e2+' '+v);
   });
  },true);
 });
}
function dmoNotes(){
 var notes=dmoGet('dmoNotes',[{t:'להתקשר לרון אחרי הפגישה בבנק',at:'היום'},{t:'רעיון לסדנה: תמחור לבעלי סטודיו',at:'אתמול'}]);
 var h='<div class="dmo-card"><textarea id="dmoNoteIn" rows="3" placeholder="פתק חדש: לכתוב, או ללחוץ על המיקרופון של המקלדת" style="width:100%;box-sizing:border-box;font:400 16px Heebo,sans-serif;padding:10px;border-radius:10px;border:1px solid #cbd5e1;direction:rtl"></textarea>'
  +'<div class="dmo-row"><button type="button" class="dmo-b" id="dmoNoteAdd">שמירה</button><button type="button" class="dmo-b alt" id="dmoNoteAsk">✨ שהמוניטור יסדר את הפתק</button></div></div>'
  +notes.map(function(n,i){return '<div class="dmo-card"><div class="dmo-meta">'+esc(n.at||'')+'</div><p>'+esc(n.t)+'</p><div class="dmo-row"><button type="button" class="dmo-b alt" data-dn-del="'+i+'">🗑 למחוק</button><button type="button" class="dmo-b wa" data-dn-wa="'+i+'">💬 בוואטסאפ</button></div></div>';}).join('');
 shipOpen('dmoSheet','📝 פתקים',h,function(el){
  var inp=el.querySelector('#dmoNoteIn');
  el.querySelector('#dmoNoteAdd').onclick=function(){var v=inp.value.trim();if(!v)return inp.focus();notes.unshift({t:v,at:'עכשיו'});dmoSet('dmoNotes',notes);dmoNotes();};
  el.querySelector('#dmoNoteAsk').onclick=function(){var v=inp.value.trim();if(!v)return inp.focus();notes.unshift({t:v,at:'עכשיו'});dmoSet('dmoNotes',notes);var x=el.querySelector('[data-a="x"]');if(x)x.click();dmoAsk('תסדר לי את הפתק הזה ותגיד מה לעשות איתו: '+v);};
  el.addEventListener('click',function(e){var d=e.target.closest&&e.target.closest('[data-dn-del],[data-dn-wa]');if(!d)return;
   if(d.hasAttribute('data-dn-del')){notes.splice(+d.getAttribute('data-dn-del'),1);dmoSet('dmoNotes',notes);dmoNotes();}
   else{window.open('https://wa.me/?text='+encodeURIComponent(notes[+d.getAttribute('data-dn-wa')].t),'_blank');}});
 });
}

// 1.11, Itzik: "תוסיף לי מוקאפ תשובות מתחת למיקרופון". The answers list sits under the
// microphone from the first moment: the ready examples first, anything new lands on top.
function dmoFeedSeed(){
 var b=document.getElementById('dmoAnsBtn');if(!b)return;
 if(!b.getAttribute('data-w')){b.setAttribute('data-w','1');b.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();dmoAnswers();},true);}
 dmoPaintCnt();
}
function dmoBoot(){if(/[?&]exitdemo/.test(location.search)){dmoExit();return;}if(/[?&]resetdemo/.test(location.search)){dmoReset();dmoApi('demo',{on:true}).catch(function(){});try{localStorage.setItem('demoMode','1');}catch(e){}}if(location.hash==='#demo'||dmoOn()){try{localStorage.setItem('demoMode','1');}catch(e){}ensure('demo',function(){dmoApply();});}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(dmoBoot,0);});else setTimeout(dmoBoot,0);
`;

module.exports = { css, js };
