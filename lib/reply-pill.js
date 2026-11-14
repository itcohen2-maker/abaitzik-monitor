'use strict';
/*
  14.11.2026, Itzik: "הערה, תגובה וכל הדברים האלה, כמו הפס שיש לנו של ג'מיני ... פס כזה קטן, עם מיקרופון ...
  ככה אני רוצה את זה בכל המוניטור, מתחת לכל תשובה אפשרית, מתחת לכל מקום אפשרי שצריך לתת תגובה".

  One small pill for every place he writes a note or a reply: the line to write in, a microphone, and a round ↑.
  It does not build new boxes. It finds the boxes that are already there (RP_SEL) and dresses them, so every
  handler they had keeps working: the send button stays the same element and only gets the round look.
  A box is dressed only when it has exactly one place to write and one button; anything richer is left as it was.
  To add another place: put its selector in RP_SEL. To take it all off: delete the two lines in build.js.
*/
const css = `
/* ---- the reply pill (14.11) ---- */
.rpill{display:flex!important;flex:1 1 100%;width:100%;box-sizing:border-box;flex-wrap:nowrap!important;align-items:center;gap:4px;padding:4px 5px 4px 6px!important;margin-top:6px;
 border-radius:999px!important;background:rgba(127,127,127,.10)!important;border:1px solid rgba(127,127,127,.28)!important;box-shadow:0 2px 10px rgba(0,0,0,.08)}
.rpill:focus-within{border-color:var(--accent,#1a73e8)!important;box-shadow:0 0 0 3px rgba(26,115,232,.18)}
.rpill.rpill>input,.rpill.rpill.rpill>textarea{flex:1 1 auto!important;width:auto!important;min-width:0!important;border:0!important;background:transparent!important;
 outline:none!important;box-shadow:none!important;padding:9px 10px!important;margin:0!important;font:16px Heebo,sans-serif!important;color:inherit!important;border-radius:0!important}
.rpill>textarea{resize:none;min-height:40px!important;height:40px;max-height:140px;line-height:1.4;align-self:center}
.rpill.rpill button.rpMic,.rpill.rpill button.rpGo{flex:0 0 40px!important;width:40px!important;height:40px!important;min-width:40px!important;min-height:40px!important;
 border-radius:50%!important;border:0!important;padding:0!important;margin:0!important;display:grid!important;place-items:center;cursor:pointer;box-shadow:none!important}
.rpill.rpill button.rpMic{background:transparent!important;color:inherit!important;font-size:19px!important;line-height:1}
.rpill.rpill button.rpMic.on{background:#fee2e2!important;animation:rpBeat 1s ease-in-out infinite}
.rpill.rpill button.rpGo{background:var(--accent,#1a73e8)!important;color:transparent!important;font-size:0!important;line-height:0!important}
.rpill.rpill button.rpGo::after{content:"↑";font:800 19px/1 Heebo,sans-serif;color:#fff}
.rpill.rpill button.rpGo:disabled{opacity:.45}
@keyframes rpBeat{50%{box-shadow:0 0 0 6px rgba(220,38,38,.18)}}
@media(prefers-reduced-motion:reduce){.rpill.rpill button.rpMic.on{animation:none}}
`;

const js = `
(function(){
 // Every place that takes a note or a reply. Add a selector here and that place gets the pill.
 // .bzEd: notes in my business (leads too). .fv-cmt: under a video or picture. .pjFbox/.pjNewReq: the project board.
 // .icbox: a comment on an idea. .rform: the answer under every message and thread.
 var RP_SEL=['.bzEd','.fv-cmt','.pjFbox','.pjNewReq','.icbox','.rform'];
 function isText(e){return e.tagName==='TEXTAREA'||(e.tagName==='INPUT'&&!/^(checkbox|radio|hidden|file|email|tel|date|time|number|submit|button)$/i.test(e.type||''));}
 function texts(b){return Array.prototype.filter.call(b.querySelectorAll('input,textarea'),isText);}
 // The box keeps its own look and its own show and hide (some are closed until opened); only an inner line is
 // added: the place to write, the microphone and the send button move into it. Same elements, same handlers.
 function dress(b){
  if(b.getAttribute('data-rp'))return;
  var t=texts(b);
  if(t.length!==1||b.querySelectorAll('select').length){b.setAttribute('data-rp','no');return;}
  var go=null;
  if(b.tagName==='FORM'){var sb=b.querySelectorAll('button[type=submit]');if(sb.length===1)go=sb[0];}
  else{var bt=Array.prototype.filter.call(b.querySelectorAll('button'),function(x){return !x.classList.contains('rpMic');});if(bt.length===1)go=bt[0];}
  if(!go){b.setAttribute('data-rp','no');return;}
  b.setAttribute('data-rp','1');
  var w=document.createElement('div');w.className='rpill';
  t[0].parentNode.insertBefore(w,t[0]);
  w.appendChild(t[0]);
  var m=document.createElement('button');m.type='button';m.className='rpMic';m.setAttribute('aria-label','להקליט במקום לכתוב');m.textContent='🎤';
  w.appendChild(m);
  go.classList.add('rpGo');
  if(!go.getAttribute('aria-label'))go.setAttribute('aria-label',(go.textContent||'שליחה').trim());
  w.appendChild(go);
  if(t[0].tagName==='TEXTAREA'){t[0].rows=1;t[0].addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px';});}
 }
 function up(){
  try{Array.prototype.forEach.call(document.querySelectorAll(RP_SEL.join(',')),dress);}catch(e){}
 }
 var q=0;function soon(){if(q)return;q=requestAnimationFrame(function(){q=0;up();});}
 try{new MutationObserver(soon).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
 up();window.addEventListener('load',up);
 window.rpDress=up;
 // Enter in a one line pill sends, like the button.
 document.addEventListener('keydown',function(e){
  if(e.key!=='Enter'||e.shiftKey||e.isComposing)return;
  var i=e.target;if(!i||i.tagName!=='INPUT')return;
  var b=i.parentNode;if(!b||!b.classList||!b.classList.contains('rpill'))return;
  var g=b.querySelector('.rpGo');if(!g)return;
  e.preventDefault();g.click();
 },true);
 // The microphone: speech into the line, in Hebrew. Where the browser has no speech (the app on some iPhones),
 // the line opens with the keyboard, and the keyboard's own microphone does it.
 var rec=null,recBtn=null;
 function stop(){try{rec&&rec.stop();}catch(e){}rec=null;if(recBtn)recBtn.classList.remove('on');recBtn=null;}
 document.addEventListener('click',function(e){
  var m=e.target&&e.target.closest?e.target.closest('.rpill .rpMic'):null;if(!m)return;
  e.preventDefault();e.stopPropagation();
  var b=m.parentNode,inp=b.querySelector('input,textarea');if(!inp)return;
  if(recBtn===m){stop();return;}
  stop();
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){inp.focus();if(typeof toast==='function')toast('לוחצים על המיקרופון במקלדת ומדברים.');return;}
  var base=inp.value?inp.value.replace(/ +$/,'')+' ':'';
  try{
   rec=new SR();rec.lang='he-IL';rec.interimResults=true;rec.continuous=false;
   rec.onresult=function(ev){var s='';for(var i=0;i<ev.results.length;i++)s+=ev.results[i][0].transcript;inp.value=base+s;try{inp.dispatchEvent(new Event('input',{bubbles:true}));}catch(x){}};
   rec.onerror=function(ev){var w=ev&&ev.error;stop();if(w==='not-allowed'||w==='service-not-allowed'){inp.focus();if(typeof toast==='function')toast('אין גישה למיקרופון. אפשר ללחוץ על המיקרופון במקלדת.');}};
   rec.onend=function(){if(recBtn===m)stop();};
   recBtn=m;m.classList.add('on');rec.start();
  }catch(x){stop();inp.focus();}
 },true);
})();
`;

module.exports = { css, js };
