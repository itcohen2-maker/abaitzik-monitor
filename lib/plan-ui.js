'use strict';
/*
  4.11.2026, Itzik approved the monthly action packages: the customer's tile
  "📦 החבילה החודשית". A customer's page only (build.js leaves this out of Itzik's own
  page). It shows actions used out of the package, never dollars, a bar that turns
  orange from 80% and red at 100%, and two ways to ask: upgrade, or an add-on of 200
  actions. Both are change requests (the "בקשה ממנהל" flow), paid in advance, and
  only Itzik's approval, after the payment arrived, changes the plan file.
  Plain strings, so build.js drops them into the page as they are.
*/
const fs = require('fs');
const P = require('./plan.js');

// The tile exists only where a plan file does (lib/plan-io.js stateOf is the same test).
function on(name) {
  if (!name || name === 'abaitzik') return false;
  try { return P.valid(JSON.parse(fs.readFileSync('/srv/monitor-changes/' + name + '.plan.json', 'utf8'))); } catch (e) { return false; }
}

const css = `
#gPack .pkTrack{display:block;height:8px;border-radius:6px;background:rgba(255,255,255,.35);margin-top:7px;overflow:hidden}
#gPack .pkFill{display:block;height:100%;width:0;border-radius:6px;background:#fff;transition:width .5s}
#gPack.warn{background:linear-gradient(180deg,#fb923c,#c2410c)}
#gPack.full{background:linear-gradient(180deg,#ef5350,#b71c1c)}
.pkBig{font:800 22px Heebo,sans-serif;margin:6px 0 8px}
.pkTrack2{height:12px;border-radius:8px;background:var(--sunk,#e5e7eb);overflow:hidden;margin:4px 0 10px}
.pkFill2{display:block;height:100%;width:0;border-radius:8px;background:linear-gradient(90deg,#2dd4bf,#3b82f6)}
.pkFill2.warn{background:#f59e0b}
.pkFill2.full{background:#dc2626}
.pkNote{font:400 15px/1.6 Heebo,sans-serif;margin:0 0 10px}
`;

function tile(name) {
  if (!on(name)) return '';
  return '\n  <button type="button" class="gt g11" id="gPack" hidden><b>📦 החבילה החודשית</b><small id="pkTxt">החודש: טוען</small>'
    + '<span class="pkTrack"><i class="pkFill" id="pkFill"></i></span></button>';
}

// The request texts are made by lib/plan.js, so the button and the parser can not drift apart.
const OPTIONS = {};
P.ORDER.forEach((k) => {
  OPTIONS[k] = P.upgradesFrom(k).map((u) => ({ plan: u.plan, label: u.label, diff: u.diff, text: P.upgradeText(k, u.plan) }));
});

const js = `
var PK_OPT=${JSON.stringify(OPTIONS)};
var PK_ADD=${JSON.stringify(P.addonText())};
var PK_ADD_ACTIONS=${P.ADDON.actions};
var PK_ADD_PRICE=${P.ADDON.price};
var PK_SAY=${JSON.stringify(P.SAY)};
function pkData(){
 // The pulse is fresher than the page when it is recent; otherwise the page's own count.
 var fresh=liveLast&&liveLast.plan&&(Date.now()-Date.parse(liveLast.at))/1000<4800;
 return fresh?liveLast.plan:((typeof D==='object'&&D&&D.plan)||null);
}
function paintPack(){
 var b=document.getElementById('gPack');if(!b)return;
 var p=pkData();
 if(!p){b.hidden=true;return;}
 b.hidden=false;
 var pct=Math.max(0,Math.min(100,p.pct||0));
 b.className='gt g11'+(p.level!=='ok'?' warn':'');
 var t=document.getElementById('pkTxt');if(t)t.textContent=p.trial?(p.level==='ended'?'שבוע הניסיון הסתיים · לחיצה להמשך':'שבוע ניסיון: '+p.used+' מתוך '+p.total+' פעולות'):'החודש: '+p.used+' מתוך '+p.total+' פעולות';
 var f=document.getElementById('pkFill');if(f)f.style.width=pct+'%';
}
setInterval(function(){try{paintPack();}catch(e){}},20000);
on('gPack',function(){
 var p=pkData();if(!p)return;
 /* 11.11.2026: the self signup trial. Two ways on: the entry package (390, paid through Sumit once it is connected,
    until then a request to the manager), or a request for an offer on a bigger package. */
 if(p.trial){
  var end='';try{end=new Date(p.endsAt).toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'numeric'});}catch(e){}
  var th='<div class="pkBig">'+p.used+' מתוך '+p.total+' פעולות בשבוע הניסיון</div>'
   +'<div class="pkTrack2"><i class="pkFill2'+(p.level!=='ok'?' warn':'')+'" style="width:'+Math.max(0,Math.min(100,p.pct||0))+'%"></i></div>'
   +'<p class="pkNote">'+esc(p.level==='ended'?PK_SAY.trialEnd:p.level==='warn'?PK_SAY.trialWarn:'שבוע הניסיון נגמר '+(end?'ב'+end:'בעוד שבוע')+', או אחרי '+p.total+' פעולות. השיחה עם המוניטור והאימונים לא נספרים.')+'</p>'
   +'<button type="button" class="yb yb1" data-tr="pay">להמשיך בחבילת הכניסה, 390 ₪ לחודש</button>'
   +'<button type="button" class="yb" data-tr="offer">אני רוצה הצעה לחבילה גדולה יותר</button>';
  shipOpen('pkSheet','📦 שבוע הניסיון',th,function(w){
   w.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-tr]');if(!b)return;
    var a=b.getAttribute('data-tr');
    var text=a==='pay'?'רוצה להמשיך בחבילת הכניסה, 390 ₪ לחודש':'רוצה הצעה לחבילה גדולה יותר';
    b.disabled=true;
    /* 11.11.2026: the entry package is paid on SUMIT's page (wa-bridge /api/pay/start, the visit key in the body).
       When payment is not connected yet, the same request goes to the manager. */
    var viaPay=(a==='pay'&&D&&D.visitKey)?fetch('https://wa.abaitzik.com/api/pay/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:D.visitKey})}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}):Promise.resolve(null);
    viaPay.then(function(j){
     var hostOk=false;try{var hu=new URL(j&&j.url);hostOk=hu.protocol==='https:'&&(hu.hostname==='sumit.co.il'||hu.hostname.slice(-12)==='.sumit.co.il');}catch(e){}
     if(hostOk){toast('עוברים לעמוד התשלום המאובטח');location.href=j.url;return;}
     return sendOrHold('בקשה ממנהל','בקשה ממנהל: '+text,'משימה').then(function(){
     markSent('text',text);w.remove();toast(a==='pay'?'קיבלנו. נשלח לך קישור לתשלום ונמשיך מאיפה שעצרת.':'קיבלנו. נחזור אליך עם הצעה.');
    }).catch(function(){b.disabled=false;toast('לא נשלח. תבדוק חיבור ותנסה שוב.');});
    });
   });
  });
  return;
 }
 var cls=p.level!=='ok'?' warn':'';
 var opts=PK_OPT[p.plan]||[];
 var h='<div class="pkBig">'+p.used+' מתוך '+p.total+' פעולות החודש</div>'
  +'<div class="pkTrack2"><i class="pkFill2'+cls+'" style="width:'+Math.max(0,Math.min(100,p.pct||0))+'%"></i></div>'
  +'<p class="pkNote">'+esc(p.level==='full'?PK_SAY.full:p.level==='warn'?PK_SAY.warn:'חבילת '+p.label+(p.extra?', כולל תוספת של '+p.extra+' פעולות':'')+'. הספירה מתחילה מחדש בכל חודש.')+'</p>'
  +(opts.length?'<button type="button" class="yb yb1" data-pk="up">לשדרג</button><div id="pkUp" hidden>'
    +opts.map(function(o,i){return '<button type="button" class="yb" data-pk="upgo" data-i="'+i+'">לחבילת '+esc(o.label)+', תשלום ההפרש מראש: '+o.diff.toLocaleString('he-IL')+' ₪</button>';}).join('')
    +'</div>':'')
  +'<button type="button" class="yb" data-pk="add">תוספת '+PK_ADD_ACTIONS+' פעולות, '+PK_ADD_PRICE+' ₪ מראש</button>'
  +'<p class="pkNote"><small>הכל משולם מראש. הבקשה מגיעה למנהל, והחבילה מתעדכנת אחרי שהתשלום הגיע.</small></p>';
 shipOpen('pkSheet','📦 החבילה החודשית',h,function(w){
  w.addEventListener('click',function(e){
   var b=e.target.closest&&e.target.closest('[data-pk]');if(!b)return;
   var a=b.getAttribute('data-pk');
   if(a==='up'){var u=document.getElementById('pkUp');if(u)u.hidden=!u.hidden;return;}
   var text=a==='add'?PK_ADD:(opts[+b.getAttribute('data-i')]||{}).text;
   if(!text)return;
   b.disabled=true;
   sendOrHold('בקשה ממנהל','בקשה ממנהל: '+text,'משימה').then(function(r){
    markSent('text',text);w.remove();toast(r==='held'?HELD_SAY:'הבקשה נשלחה למנהל. החבילה תתעדכן אחרי שהתשלום יגיע.');
   }).catch(function(){b.disabled=false;toast('לא נשלח. תבדוק חיבור ותנסה שוב.');});
  });
 });
});
`;

module.exports = { on, css, tile, js, OPTIONS };
