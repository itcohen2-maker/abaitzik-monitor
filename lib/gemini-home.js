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
body #talkCard .mic{align-self:center}
body #talkCard .vtxt{align-self:center;text-align:center;margin:6px 0 14px}
body #talkCard .quickwrite{order:1;gap:10px;align-items:flex-end;padding:10px 12px 10px 10px;margin:0;border-radius:30px;
 background:var(--surface)!important;border:1px solid var(--line)!important;box-shadow:0 8px 28px rgba(0,0,0,.14)!important}
body #talkCard .quickwrite textarea{min-height:112px;padding:10px 10px;font-size:17px;background:transparent!important;
 border:0!important;outline:none!important;box-shadow:none!important;resize:none}
body #talkCard .quickwrite button{min-height:46px;border-radius:23px;padding:0 22px;box-shadow:none}
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
   if(!chatOk()||isTask(t)){say('זו משימה, נשלחה לביצוע.');return;}
   e.preventDefault();e.stopImmediatePropagation();
   try{fcS.inl=true;}catch(x){}
   if(ta)ta.value='';
   fcSend(t);say('זו שאלה, התשובה כאן למטה תוך כמה שניות.');
  },true);
 }
 if(document.readyState!=='loading')arm();else document.addEventListener('DOMContentLoaded',arm);
})();
`;
module.exports = { css, js };
