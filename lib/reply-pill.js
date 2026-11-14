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
.rpill{display:flex!important;flex-wrap:nowrap!important;align-items:center;gap:4px;padding:4px 5px 4px 6px!important;margin-top:6px;
 border-radius:999px!important;background:rgba(127,127,127,.10)!important;border:1px solid rgba(127,127,127,.28)!important;box-shadow:0 2px 10px rgba(0,0,0,.08)}
.rpill:focus-within{border-color:var(--accent,#1a73e8)!important;box-shadow:0 0 0 3px rgba(26,115,232,.18)}
.rpill>input,.rpill>textarea{flex:1 1 auto!important;width:auto!important;min-width:0!important;border:0!important;background:transparent!important;
 outline:none!important;box-shadow:none!important;padding:9px 10px!important;margin:0!important;font:16px Heebo,sans-serif!important;color:inherit!important;border-radius:0!important}
.rpill>textarea{resize:none;min-height:40px;max-height:140px;line-height:1.4}
.rpill .rpMic,.rpill .rpGo{flex:0 0 40px!important;width:40px!important;height:40px!important;min-width:40px!important;min-height:40px!important;
 border-radius:50%!important;border:0!important;padding:0!important;margin:0!important;display:grid!important;place-items:center;cursor:pointer;box-shadow:none!important}
.rpill .rpMic{background:transparent!important;color:inherit!important;font-size:19px!important;line-height:1}
.rpill .rpMic.on{background:#fee2e2!important;animation:rpBeat 1s ease-in-out infinite}
.rpill .rpGo{background:var(--accent,#1a73e8)!important;color:#fff!important;font-size:0!important}
.rpill .rpGo::after{content:"↑";font:800 19px/1 Heebo,sans-serif}
.rpill .rpGo:disabled{opacity:.45}
@keyframes rpBeat{50%{box-shadow:0 0 0 6px rgba(220,38,38,.18)}}
@media(prefers-reduced-motion:reduce){.rpill .rpMic.on{animation:none}}
`;

const js = `
(function(){
 // Every place that takes a note or a reply. Add a selector here and that place gets the pill.
 var RP_SEL=['.bzEd','.ldNoteBox','.rpWant'];
 function texts(b){return Array.prototype.filter.call(b.children,function(e){return (e.tagName==='TEXTAREA'||(e.tagName==='INPUT'&&!/^(checkbox|radio|hidden|file|email|tel|date|time|number)$/i.test(e.type||'')));});}
 function dress(b){
  if(b.classList.contains('rpill')||b.getAttribute('data-rp')==='no')return;
  var t=texts(b),bt=Array.prototype.filter.call(b.children,function(e){return e.tagName==='BUTTON';});
  // only a plain box: one line to write in, one button, nothing else that takes input
  if(t.length!==1||bt.length!==1||b.querySelectorAll('input,textarea,select').length!==1)return;
  var go=bt[0];
  b.classList.add('rpill');
  go.classList.add('rpGo');
  if(!go.getAttribute('aria-label'))go.setAttribute('aria-label',(go.textContent||'שליחה').trim());
  var m=document.createElement('button');m.type='button';m.className='rpMic';m.setAttribute('aria-label','להקליט במקום לכתוב');m.textContent='🎤';
  b.insertBefore(m,go);
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
  var b=m.parentNode,inp=texts(b)[0];if(!inp)return;
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
