'use strict';
/*
  10.11.2026, Itzik: "turn every monitor to the new form, like the demo, mine included. Do not change the colours
  of my tiles and not the colours of the icons, only the general look."
  The home screen of EVERY monitor: one big greeting, one big write box in the middle, then the AI answers.
  CSS only for the look, and it never touches the tiles (.gt) or the round icons (.ic .c).
  Later the same day: the microphone keeps its original design (no rule here touches it), and the two write
  boxes became one: see the js below.
  To take it off, delete the two lines in build.js that require this file.
*/
const css = `
/* ---- the new form of the home screen (10.11): all monitors ---- */
body .hd{margin:4px 0 6px!important}
body .hd .s{opacity:.7}
body #talkCard{display:flex!important;flex-direction:column;align-items:stretch;gap:0;background:transparent!important;
 border:0!important;box-shadow:none!important;padding:0!important;margin:0 0 14px!important}
body #talkCard::before{content:"במה אפשר לעזור?";display:block;order:0;text-align:center;margin:5vh 4px 22px;
 font:800 32px/1.2 Heebo,sans-serif;background:linear-gradient(100deg,var(--accent),#7c3aed 60%,#db2777);
 -webkit-background-clip:text;background-clip:text;color:transparent}
body #talkCard .tkHead,body #talkCard .firsthint{display:none!important}
/* the microphone sits inside the write line, on its left, like Gemini, and keeps its own original look (ring, colours) */
body #talkCard .vtxt{display:none!important}
body #talkCard .quickwrite .mic{order:3;align-self:flex-end;margin:0 2px 0 0!important;width:60px!important;height:60px!important;
 min-height:60px!important;flex:0 0 60px!important;padding:0!important;border:0!important;border-radius:50%!important;display:grid!important;place-items:center;
 background:conic-gradient(from 0deg,var(--blue),var(--red),var(--yellow),var(--green),var(--blue))!important;
 box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 28%,transparent)!important}
body #talkCard .quickwrite .mic svg{width:28px;height:28px}
body #talkCard .quickwrite{order:1;gap:10px;align-items:flex-end;padding:10px 12px 10px 10px;margin:0;border-radius:30px;
 background:var(--surface)!important;border:1px solid var(--line)!important;box-shadow:0 8px 28px rgba(0,0,0,.14)!important}
body #talkCard .quickwrite textarea{min-height:112px;padding:10px 10px;font-size:17px;background:transparent!important;
 border:0!important;outline:none!important;box-shadow:none!important;resize:none}
body #talkCard .quickwrite button:not(.mic){min-height:46px;border-radius:23px;padding:0 22px;box-shadow:none}
body #talkCard .ways{order:3;justify-content:center;gap:8px;margin-top:14px}
body #talkCard .way{min-height:40px;padding:0 16px;border-radius:999px;background:transparent!important;
 border:1px solid var(--line)!important;box-shadow:none!important;color:var(--dim)}
body #talkCard .way b{font-size:14px;font-weight:600;color:var(--dim)}
/* one write box: the AI line keeps only its answers, its own header and input are gone */
body .fcrow{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;margin:6px 0 10px!important}
body #fcRow .fch,body #fcRow .fcQuick{display:none!important}
body .reloadbig{border:0!important;background:transparent!important;box-shadow:none!important;color:var(--dim)!important;
 margin:0 auto 8px!important;height:36px}
body .morebtn{border-radius:999px!important;box-shadow:none!important}
.qwRoute{font:500 13px Heebo,sans-serif;color:var(--dim);text-align:center;margin:8px 4px 0;order:4}

/* ---- 13.11.2026, Itzik: "like Gemini": the write line is a bar at the bottom of the home screen and the answers
   screen (body.gDock): + (photo, file), the text, the microphone, and a round send arrow that shows once there is text.
   The greeting on top is "שלום, <name>" in the gradient and "במה אפשר לעזור?" under it. ---- */
body.gDock #talkCard::before{content:none!important}
.gGreet{text-align:center;margin:6vh 4px 8px}
.gGreet b{display:block;font:800 34px/1.15 Heebo,sans-serif;background:linear-gradient(100deg,#4285F4,#9b72cb 55%,#d96570);
 -webkit-background-clip:text;background-clip:text;color:transparent}
.gGreet span{display:block;font:600 24px/1.3 Heebo,sans-serif;color:var(--dim);margin-top:6px}
body.gDock #quickForm{position:fixed!important;left:10px;right:10px;bottom:92px;z-index:70;max-width:620px;margin:0 auto!important;
 display:flex!important;flex-direction:row!important;align-items:flex-end!important;gap:6px!important;padding:6px 8px!important;
 border-radius:28px!important;background:var(--surface)!important;border:1px solid var(--line)!important;
 box-shadow:0 6px 24px rgba(0,0,0,.16)!important}
body.gDock #quickForm textarea{flex:1 1 auto;min-height:40px!important;height:40px;max-height:132px;padding:9px 6px!important;font-size:16.5px!important;line-height:1.35;overflow-y:auto}
body.gDock #quickForm .mic{width:40px!important;height:40px!important;min-height:40px!important;flex:0 0 40px!important;box-shadow:none!important}
body.gDock #quickForm .mic svg{width:20px;height:20px}
body.gDock #quickBtn{flex:0 0 40px;width:40px;min-width:40px;height:40px;min-height:40px!important;padding:0!important;border-radius:50%!important;
 font-size:0!important;display:none!important;place-items:center}
body.gDock #quickBtn::after{content:"↑";font:800 21px/1 Heebo,sans-serif}
body.gDock #quickForm.gHas #quickBtn{display:grid!important}
body.gDock #quickForm.gHas .mic{display:none!important}
.gPlus{flex:0 0 40px;width:40px;height:40px;border-radius:50%;border:0;background:var(--sunk);color:var(--ink);font:500 26px/1 Heebo,sans-serif;cursor:pointer;display:none}
body.gDock .gPlus{display:block}
.gMenu{position:fixed;right:14px;bottom:150px;z-index:71;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:18px;
 background:var(--surface);border:1px solid var(--line);box-shadow:0 10px 30px rgba(0,0,0,.2)}
.gMenu[hidden]{display:none}
.gMenu .way{display:flex!important;flex-direction:row!important;align-items:center;gap:10px;min-height:42px!important;padding:0 14px!important;
 border:0!important;border-radius:12px!important;background:transparent!important;box-shadow:none!important}
.gMenu .way small{display:none}
body.gDock #talkCard .ways{display:none!important}
body.gDock #pH,body.gDock #pA{padding-bottom:96px}
body.gDock #quickSaid:not(:empty),body.gDock #qwRoute:not(:empty){position:fixed;left:16px;right:16px;bottom:148px;z-index:69;text-align:center;
 background:var(--surface);border-radius:12px;padding:6px 10px;box-shadow:0 4px 14px rgba(0,0,0,.12)}
body.gDock #ansDock{bottom:150px!important}
body.gDock #pcPill,body.gDock #livePill{transform:translateY(-62px)}
`;
/*
  10.11.2026, Itzik: "one box. The monitor has to tell what is a question for the chat and what is a task to do."
  A question (consulting, explaining, writing a text) goes to the fast AI chat and is answered here in seconds.
  A task (send, schedule, publish, delete, update, build, upload, print, check in a system) goes to the request
  queue, exactly as the box always did. When unsure it is a question: the chat answers and has
  "להעביר לביצוע" if it turns out to be work. Demo mode keeps its own handler. Without the AI chat on this
  monitor everything goes to the queue as before.
*/
const js = `
(function(){
 var TASK=/(^|\\s)(ת?שלח|תשלחי|ת?קבע|תזמן|ת?פרסם|תעלה|העלה|ת?מחק|תעדכן|עדכן|תשנה|שנה|תבנה|בנה|תוסיף|הוסף|תדפיס|הדפס|תזכיר לי|תזכורת|תרשום|רשום|תבדוק|בדוק|תכין|הכן|תסדר|סדר|תתקן|תקן|תחבר|חבר|תוריד|הורד|תעביר|העבר|תפתח|פתח|תזמין|הזמן|תחייב|תגבה)(\\s|$|[.,!])/;
 var ASK=/^\\s*(מה|איך|למה|מדוע|האם|כמה|מתי|איפה|מי|תסביר|הסבר|תייעץ|מה דעתך|יש לך רעיון|תן לי רעיון)/;
 function isTask(t){t=String(t||'').trim();if(!t)return false;if(/[?？]\\s*$/.test(t)||ASK.test(t))return false;return TASK.test(t);}
 function chatOk(){var r=document.getElementById('fcRow');return !!(r&&!r.hidden&&typeof fcSend==='function');}
 function say(msg){var c=document.getElementById('talkCard');if(!c)return;var l=document.getElementById('qwRoute');
  if(!l){l=document.createElement('div');l.id='qwRoute';l.className='qwRoute';c.appendChild(l);}l.textContent=msg;clearTimeout(say.t);say.t=setTimeout(function(){l.textContent='';},6000);}
 function arm(){
  var f=document.getElementById('quickForm');if(!f||f.dataset.oneBox)return;f.dataset.oneBox='1';
  f.addEventListener('submit',function(e){
   if(document.body.classList.contains('dmo-real'))return;
   var ta=f.querySelector('textarea'),t=ta?ta.value:'';
   if(!String(t).trim())return;
   var busy=false;try{busy=!!fcS.busy;}catch(x){}
   // 10.11: while the chat still waits for an answer (or got stuck) a new message goes to the queue, so it is never lost
   if(!chatOk()||isTask(t)||busy){say(busy?'השיחה עוד עונה על השאלה הקודמת, אז זה נשלח לביצוע.':'זו משימה, נשלחה לביצוע.');return;}
   e.preventDefault();e.stopImmediatePropagation();
   try{fcS.inl=true;}catch(x){}
   if(ta)ta.value='';
   fcSend(t);say('זו שאלה, התשובה כאן למטה תוך כמה שניות.');
  },true);
 }
 // the microphone moves into the write line (RTL: last child = left side). It keeps its id and listeners; type="button".
 function micIn(){var m=document.getElementById('micBtn'),f=document.getElementById('quickForm');if(m&&f&&m.parentNode!==f)f.appendChild(m);}

 // 13.11.2026, Itzik: "like Gemini". The write line becomes a bar at the bottom of the home screen and the answers
 // screen. The same form moves nothing: only a class on the body, so sending, recording and files work as before.
 function gDock(){
  var h=document.getElementById('pH'),a=document.getElementById('pA');
  var on=!!((h&&!h.hidden)||(a&&!a.hidden));
  document.body.classList.toggle('gDock',on);
  if(!on){var mm=document.getElementById('gMenu');if(mm)mm.hidden=true;}
 }
 function gBuild(){
  var f=document.getElementById('quickForm'),c=document.getElementById('talkCard');if(!f||!c||f.dataset.gDock)return;f.dataset.gDock='1';
  var ta=f.querySelector('textarea');
  var nm=String((ta&&ta.getAttribute('placeholder'))||'').split(',')[0].trim();
  var g=document.createElement('div');g.className='gGreet';
  var gb=document.createElement('b');gb.textContent=nm&&nm.length<20?'שלום, '+nm:'שלום';
  var gs=document.createElement('span');gs.textContent='במה אפשר לעזור?';
  g.appendChild(gb);g.appendChild(gs);c.insertBefore(g,c.firstChild);
  var plus=document.createElement('button');plus.type='button';plus.className='gPlus';plus.setAttribute('aria-label','תמונה, צילום או קובץ');plus.textContent='+';
  f.insertBefore(plus,f.firstChild);
  var menu=document.createElement('div');menu.id='gMenu';menu.className='gMenu';menu.hidden=true;
  ['wShoot','urgBtn'].forEach(function(id){var w=document.getElementById(id);if(w)menu.appendChild(w);});
  document.body.appendChild(menu);
  plus.addEventListener('click',function(e){e.preventDefault();menu.hidden=!menu.hidden;});
  menu.addEventListener('click',function(){setTimeout(function(){menu.hidden=true;},50);});
  document.addEventListener('click',function(e){if(!menu.hidden&&!menu.contains(e.target)&&e.target!==plus)menu.hidden=true;});
  if(ta){
   ta.setAttribute('rows','1');
   var fit=function(){f.classList.toggle('gHas',!!ta.value.trim());if(!document.body.classList.contains('gDock'))return;ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,132)+'px';};
   ta.addEventListener('input',fit);f.addEventListener('submit',function(){setTimeout(fit,60);});setInterval(fit,1500);
  }
  ['pH','pA'].forEach(function(id){var el=document.getElementById(id);if(el&&window.MutationObserver)new MutationObserver(gDock).observe(el,{attributes:true,attributeFilter:['hidden']});});
  gDock();
 }
 function boot(){arm();micIn();gBuild();}
 if(document.readyState!=='loading')boot();else document.addEventListener('DOMContentLoaded',boot);
})();
`;
module.exports = { css, js };
