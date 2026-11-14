'use strict';
/*
  14.11.2026, Itzik, from the design lab (/p/8e50229ba9f31ee5417b.html): what he chose, now on the monitor. The tiles
  stay as they are ("לא לשנות"); a new thing is marked with a dot, not a number ("נקודה").
    dot        the answers count (546) becomes a quiet dot, and "546 שלא קראת" says "יש תשובות שלא קראת"
    run        sending from the writing box: a line in the microphone's colours runs along it
    glow       while the monitor is thinking about the answer, the box's ring flows; it stops when an answer comes
    drop       a new answer slides in once (the same answer does not jump again on the next refresh)
    radar      a new lead: a red wave goes out of the leads dot, twice
    clock      every new lead says how long it waits (minutes, hours, days; no seconds), red after an hour
    odometer   the money numbers roll to the new sum when it changed since the last visit
    breath     the microphone breathes with a blue glow while it listens
  Every motion says that something happened, ends in under a second (except while waiting), and stops on a phone
  that asked for less motion. Nothing here changes what a button does.
  Page JS rules: a plain string, so no backslashes, no backticks and no dollar-brace in it.
*/
const css = `
/* ---- motion from the design lab (14.11) ---- */
@property --mvAng{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes mvSpin{to{--mvAng:360deg}}
@keyframes mvRun{0%{width:0;opacity:1}80%{width:100%;opacity:1}100%{width:100%;opacity:0}}
@keyframes mvDrop{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}
@keyframes mvPing{0%{transform:scale(1);opacity:.75}100%{transform:scale(3.2);opacity:0}}
@keyframes mvBreath{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(66,133,244,0)}50%{transform:scale(1.07);box-shadow:0 0 22px 4px rgba(66,133,244,.45)}}
/* dot, not a number */
nav.bn .cnt{font-size:0!important;min-width:10px!important;width:10px!important;height:10px!important;padding:0!important;border-radius:50%!important;top:3px!important}
#nbCount.nb-c{font-size:0!important;min-width:14px!important;width:14px!important;height:14px!important;padding:0!important;animation:none!important}
/* run and glow on the writing box */
html body #quickForm.quickwrite.mvRun{position:relative;overflow:hidden}
html body #quickForm.quickwrite.mvRun::after{content:'';position:absolute;bottom:0;right:0;height:3px;width:0;border-radius:3px;pointer-events:none;
 background:linear-gradient(90deg,#4285F4,#EA4335,#FBBC05,#34A853);animation:mvRun 1.1s cubic-bezier(.4,0,.2,1) forwards}
html body #quickForm.quickwrite.mvWait{border:2px solid transparent!important;animation:mvSpin 1.6s linear infinite;
 background:linear-gradient(var(--surface,#fff),var(--surface,#fff)) padding-box,conic-gradient(from var(--mvAng),#4285F4,#EA4335,#FBBC05,#34A853,#4285F4) border-box!important;
 box-shadow:0 6px 26px rgba(66,133,244,.25)!important}
/* a new answer */
.ansc.mvNew{animation:mvDrop .45s cubic-bezier(.2,.8,.2,1)}
/* a new lead */
#lDot{position:relative}
#nL[data-ping] #lDot::after{content:'';position:absolute;inset:0;border-radius:50%;background:#EA4335;animation:mvPing 1.6s ease-out 2;pointer-events:none}
/* the lead clock: how long a new lead waits, no seconds; red after an hour */
.ldWait{display:block;font:700 12px Heebo,sans-serif;color:#e8a100;margin-top:3px;white-space:nowrap}
.ldWait.late{color:#EA4335}
/* the microphone listening */
.mic.on,#micBtn.on{animation:mvBreath 1.2s ease-in-out infinite!important}
@media(prefers-reduced-motion:reduce){html body #quickForm.quickwrite.mvRun::after,html body #quickForm.quickwrite.mvWait,.ansc.mvNew,#nL[data-ping] #lDot::after,.mic.on,#micBtn.on{animation:none!important}}
`;

const js = `
(function(){
 var RM=false;try{RM=window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
 function ss(k,v){try{if(v===undefined)return sessionStorage.getItem(k);sessionStorage.setItem(k,v);}catch(e){return null;}}
 function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v);}catch(e){return null;}}
 // ---- the dot: "546 שלא קראת" says that there are unread answers, without the number ----
 function unreadText(){var s=document.getElementById('nbSub');if(!s)return;var t=s.textContent||'';
  var m=/^[0-9]+ (.*)$/.exec(t.trim());if(m&&m[1].indexOf('שלא קראת')===0)s.textContent='יש תשובות שלא קראת';}
 // ---- run and glow ----
 var waitT=null,form=null;
 function stopWait(){if(form)form.classList.remove('mvWait');if(waitT){clearTimeout(waitT);waitT=null;}}
 function onSend(){
  form=document.getElementById('quickForm');if(!form)return;
  var ta=form.querySelector('textarea');if(ta&&!ta.value.trim())return;
  form.classList.remove('mvRun');void form.offsetWidth;form.classList.add('mvRun');
  setTimeout(function(){if(form)form.classList.remove('mvRun');},1300);
  if(RM)return;
  setTimeout(function(){if(!form)return;form.classList.add('mvWait');waitT=setTimeout(stopWait,25000);},900);
 }
 document.addEventListener('submit',function(e){if(e.target&&e.target.id==='quickForm')onSend();},true);
 document.addEventListener('click',function(e){var b=e.target.closest?e.target.closest('#quickBtn'):null;if(b)onSend();},true);
 // ---- watching the page: a chat answer stops the glow, a new answer slides in, a lead pings ----
 var seen={};try{seen=JSON.parse(ss('mvSeen')||'{}');}catch(e){}
 function keyOf(c){var t=c.querySelector('.atxt');return (c.getAttribute('data-i')||'')+'|'+((t&&t.textContent)||c.textContent||'').slice(0,60);}
 function answers(){
  var nw=0;Array.prototype.forEach.call(document.querySelectorAll('.ansc.fresh'),function(c){var k=keyOf(c);
   if(!seen[k]){seen[k]=1;nw++;if(!RM&&c.getBoundingClientRect().height>4){c.classList.remove('mvNew');void c.offsetWidth;c.classList.add('mvNew');}}});
  if(nw)ss('mvSeen',JSON.stringify(seen));
 }
 var leadOn=null;
 function lead(){var d=document.getElementById('lDot');if(!d)return;var on=d.offsetWidth>0&&getComputedStyle(d).display!=='none';
  if(on&&leadOn===false||on&&leadOn===null&&ss('mvLead')!=='1'){var nb=document.getElementById('nL');if(nb){nb.removeAttribute('data-ping');void nb.offsetWidth;nb.setAttribute('data-ping','1');setTimeout(function(){nb.removeAttribute('data-ping');},3400);}ss('mvLead','1');}
  if(!on)ss('mvLead','0');leadOn=on;}
 // ---- the money rolls to its new sum ----
 function money(){
  var g=document.getElementById('homeMoneyGrid');if(!g)return;
  Array.prototype.forEach.call(g.querySelectorAll('b,strong,span'),function(e,i){
   if(e.children.length||e.getAttribute('data-mv'))return;var t=(e.textContent||'').trim(),m=/^([0-9][0-9,]*)( ?₪)?$/.exec(t);if(!m)return;
   e.setAttribute('data-mv','1');
   var to=+m[1].split(',').join(''),k='mvMoney'+i,from=+(ls(k)||to);ls(k,String(to));
   if(RM||from===to||!isFinite(from))return;
   var t0=null,fmt=function(n){return Math.round(n).toLocaleString('en-US')+(m[2]||'');};
   function step(ts){if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/900);p=1-Math.pow(1-p,3);e.textContent=fmt(from+(to-from)*p);if(p<1)requestAnimationFrame(step);}
   requestAnimationFrame(step);
  });
 }
 // ---- the lead clock (14.11, "בלי שניות") ----
 function waitTxt(ms){var mi=Math.max(0,Math.floor(ms/60000));if(mi<60)return 'מחכה '+(mi<1?'פחות מדקה':mi+' דק׳');var h=Math.floor(mi/60);
  if(h<24)return 'מחכה '+h+':'+('0'+(mi%60)).slice(-2)+' שע׳';var d=Math.floor(h/24);return 'מחכה '+(d===1?'יום':d+' ימים');}
 function leadClock(){var now=Date.now();Array.prototype.forEach.call(document.querySelectorAll('.ldRow.ldNew[data-at]'),function(r){
  var at=Date.parse(r.getAttribute('data-at'));if(!at)return;var sm=r.querySelector('summary');if(!sm)return;var sp=sm.querySelector('span');if(!sp)return;
  var w=sp.querySelector('.ldWait');if(!w){w=document.createElement('em');w.className='ldWait';sp.appendChild(w);}
  var tx=waitTxt(now-at);if(w.textContent!==tx)w.textContent=tx;w.classList.toggle('late',now-at>3600000);});}
 setInterval(function(){try{leadClock();}catch(e){}},60000);
 var chatN=-1;
 function chat(){var n=document.querySelectorAll('.fcb:not(.me)').length;if(chatN>=0&&n>chatN)stopWait();chatN=n;}
 var q=0;function tick(){q=0;try{unreadText();answers();lead();money();chat();leadClock();}catch(e){}}
 function soon(){if(q)return;q=requestAnimationFrame(tick);}
 try{new MutationObserver(soon).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick);else tick();
 window.addEventListener('load',tick);
})();
`;
module.exports = { css, js };
