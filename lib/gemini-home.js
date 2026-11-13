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
/* 13.11.2026, Itzik: one settings button only, at the bottom of the home screen. */
body #setBtn{display:none!important}
body #thumbSet.gSetBottom{position:static!important;display:block!important;margin:18px auto 8px!important;inset:auto!important;transform:none!important;
 border-radius:999px!important;padding:10px 22px!important;box-shadow:none!important;border:1px solid var(--line)!important;background:var(--surface)!important;color:var(--ink)!important}
body.inner #thumbSet.gSetBottom{display:none!important}
/* 13.11.2026, Itzik: settings small, on the side, without the word: a round ⚙ at the left edge of the page bottom. */
body #thumbSet.gSetBottom{width:44px!important;height:44px!important;min-width:0!important;padding:0!important;margin:18px auto 8px 0!important;
 border-radius:50%!important;font-size:0!important;display:grid!important;place-items:center;opacity:.8}
body #thumbSet.gSetBottom::before{content:"⚙";font-size:21px;line-height:1}
body.inner #thumbSet.gSetBottom{display:none!important}

/* ---- 13.11.2026, Itzik: the home screen like his Gemini (approved on the design page). Only under body.gH. ---- */
body.gH #talkCard{position:relative}
body.gH #talkCard::before{content:none!important}
.gTitle{display:none}
body.gH .gTitle{display:block;text-align:center;font:500 28px/1.3 Heebo,sans-serif;color:var(--ink);opacity:.92;margin:7vh 8px 22px}
body.gH #talkCard .quickwrite{flex-direction:row!important;align-items:center!important;gap:6px!important;padding:6px 8px!important;
 border-radius:32px!important;box-shadow:0 2px 12px rgba(0,0,0,.18)!important}
body.gH #talkCard .quickwrite textarea{order:2;flex:1 1 auto;min-width:0;min-height:26px!important;height:26px;max-height:130px;
 padding:4px 4px!important;font-size:16.5px!important;line-height:1.4;overflow-y:auto}
.gPlus{display:none}
body.gH .gPlus{display:grid;place-items:center;order:1;flex:0 0 40px;width:40px;height:40px;border-radius:50%;border:0!important;
 background:transparent!important;color:var(--ink)!important;font:300 30px/1 Heebo,sans-serif!important;padding:0!important;min-height:40px!important;box-shadow:none!important;cursor:pointer}
body.gH #talkCard .quickwrite .mic{order:3;width:46px!important;height:46px!important;min-height:46px!important;flex:0 0 46px!important;
 box-shadow:none!important;align-self:center!important}
body.gH #talkCard .quickwrite .mic svg{width:22px;height:22px}
body.gH #quickBtn{order:4;display:none!important;flex:0 0 40px;width:40px;min-width:40px;height:40px;min-height:40px!important;
 padding:0!important;border-radius:50%!important;font-size:0!important}
body.gH #quickBtn::after{content:"↑";font:800 21px/1 Heebo,sans-serif}
body.gH #quickForm.gHas #quickBtn{display:grid!important;place-items:center}
body.gH #quickForm.gHas .mic{display:none!important}
body.gH #talkCard .ways{display:none!important}
.gMenu{position:absolute;right:6px;z-index:40;display:flex;flex-direction:column;gap:4px;padding:6px;border-radius:16px;
 background:var(--surface);border:1px solid var(--line);box-shadow:0 10px 30px rgba(0,0,0,.25)}
.gMenu[hidden]{display:none}
.gMenu .way{display:flex!important;flex-direction:row!important;align-items:center;gap:10px;min-height:42px!important;padding:0 14px!important;
 border:0!important;border-radius:12px!important;background:transparent!important;box-shadow:none!important}
.gMenu .way small{display:none}
.gChips{display:none}
body.gH .gChips{display:flex;gap:8px;justify-content:center;margin-top:12px;order:5}
.gChips button{font:500 15px Heebo,sans-serif;color:var(--dim);background:transparent;border:1px solid transparent;border-radius:999px;padding:7px 16px;cursor:pointer}
.gChips button[aria-pressed="true"]{background:var(--sunk);color:var(--ink);border-color:var(--line)}
.gSay{display:none}
body.gH .gSay{display:block;color:var(--dim);font-size:13px;text-align:center;margin-top:8px;order:6}
body.gH #bareBtn{display:block;width:auto!important;min-width:0!important;margin:14px auto 6px!important;padding:12px 34px!important}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) body.gH{background-image:radial-gradient(ellipse 80% 45% at 50% 38%,rgba(43,75,216,.30),transparent 70%);background-attachment:fixed}}
:root[data-theme="dark"] body.gH{background-image:radial-gradient(ellipse 80% 45% at 50% 38%,rgba(43,75,216,.30),transparent 70%);background-attachment:fixed}
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
   // 13.11.2026: the chips decide (שיחה / משימה). Without the chips (old look) the guess stays.
   var chosen=document.body.classList.contains('gH')?gMode():(isTask(t)?'משימה':'שיחה');
   if(!chatOk()||chosen==='משימה'||busy){say(busy?'השיחה עוד עונה על השאלה הקודמת, אז זה נשלח לביצוע.':'משימה, נשלחה לביצוע.');return;}
   e.preventDefault();e.stopImmediatePropagation();
   try{fcS.inl=true;}catch(x){}
   if(ta)ta.value='';
   fcSend(t);say('זו שאלה, התשובה כאן למטה תוך כמה שניות.');
  },true);
 }
 // the microphone moves into the write line (RTL: last child = left side). It keeps its id and listeners; type="button".
 function micIn(){var m=document.getElementById('micBtn'),f=document.getElementById('quickForm');if(m&&f&&m.parentNode!==f)f.appendChild(m);}
 // after the home screen, not inside it: the home screen hides its children until עוד כלים
 function gSet(){var t=document.getElementById('thumbSet'),h=document.getElementById('pH');if(!t||!h)return;t.classList.add('gSetBottom');if(h.nextSibling!==t)h.parentNode.insertBefore(t,h.nextSibling);}

 // 13.11.2026, Itzik: the Gemini home. The form, the microphone and the two buttons stay the same elements with the
 // same listeners: here they only get a title, a + menu, the two chips (שיחה / משימה) and a send arrow.
 function gMode(){try{return localStorage.getItem('gMode')==='משימה'?'משימה':'שיחה';}catch(x){return 'שיחה';}}
 function gHome(){
  var f=document.getElementById('quickForm'),c=document.getElementById('talkCard');if(!f||!c||f.dataset.gH)return;f.dataset.gH='1';
  var ta=f.querySelector('textarea');
  var nm=String((ta&&ta.getAttribute('placeholder'))||'').split(',')[0].trim();
  var t=document.createElement('div');t.className='gTitle';t.textContent=(nm&&nm.length<20?'שלום '+nm+', ':'')+'ממה להתחיל?';
  c.insertBefore(t,c.firstChild);
  var plus=document.createElement('button');plus.type='button';plus.className='gPlus';plus.setAttribute('aria-label','צילום או קובץ');plus.textContent='+';
  f.insertBefore(plus,f.firstChild);
  var menu=document.createElement('div');menu.className='gMenu';menu.id='gMenu';menu.hidden=true;
  ['wShoot','urgBtn'].forEach(function(id){var w=document.getElementById(id);if(w)menu.appendChild(w);});
  c.appendChild(menu);
  var place=function(){menu.style.top=(f.offsetTop+f.offsetHeight+6)+'px';};
  plus.addEventListener('click',function(e){e.preventDefault();place();menu.hidden=!menu.hidden;});
  menu.addEventListener('click',function(){setTimeout(function(){menu.hidden=true;},60);});
  document.addEventListener('click',function(e){if(!menu.hidden&&!menu.contains(e.target)&&e.target!==plus)menu.hidden=true;});
  var chips=document.createElement('div');chips.className='gChips';chips.setAttribute('role','group');chips.setAttribute('aria-label','שיחה או משימה');
  var say=document.createElement('div');say.className='gSay';
  var paint=function(){var m=gMode();Array.prototype.forEach.call(chips.children,function(b){b.setAttribute('aria-pressed',b.textContent===m?'true':'false');});
   say.textContent=m==='משימה'?'משימה: נשלח לביצוע, התשובה במסך התשובות':'שיחה: תשובה כאן תוך כמה שניות';};
  ['שיחה','משימה'].forEach(function(m){var b=document.createElement('button');b.type='button';b.textContent=m;
   b.addEventListener('click',function(){try{localStorage.setItem('gMode',m);}catch(x){}paint();});chips.appendChild(b);});
  f.parentNode.insertBefore(chips,f.nextSibling);chips.parentNode.insertBefore(say,chips.nextSibling);paint();
  if(ta){ta.setAttribute('rows','1');
   var fit=function(){f.classList.toggle('gHas',!!ta.value.trim());ta.style.height='auto';ta.style.height=Math.min(Math.max(ta.scrollHeight,26),130)+'px';};
   ta.addEventListener('input',fit);f.addEventListener('submit',function(){setTimeout(fit,80);});setInterval(fit,1500);}
  // רענן goes down to the settings button, so עוד כלים sits right under the explanation line
  var rb=document.getElementById('reloadBtn'),h=document.getElementById('pH');if(rb&&h)h.parentNode.insertBefore(rb,h.nextSibling);
  document.body.classList.add('gH');
 }
 function boot(){arm();micIn();gSet();try{gHome();}catch(x){}}
 if(document.readyState!=='loading')boot();else document.addEventListener('DOMContentLoaded',boot);
})();
`;
module.exports = { css, js };
