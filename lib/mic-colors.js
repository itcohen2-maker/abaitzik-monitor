'use strict';
/*
  14.11.2026, Itzik: "מיקרופון עדין". The colours around the microphone (blue, red, yellow, green), carried through the
  monitor as thin accents, the "עדין" option of the design page /p/e1b86a7148ec2ae036bb.html. Nothing is filled with
  colour: a thin line above the bottom bar (the one under the header went, 14.11), a thin ring around the writing box, the send arrow,
  the "עוד כלים" button and the settings button. The tiles are left as they are until he picks a tile style.
  Page JS rules: a plain string, so no backslashes, no backticks and no dollar-brace in it.
*/
const RING = 'conic-gradient(from 0deg,#4285F4,#EA4335,#FBBC05,#34A853,#4285F4)';
const LINE = 'linear-gradient(90deg,#4285F4 0 25%,#EA4335 0 50%,#FBBC05 0 75%,#34A853 0)';
const css = `
/* ---- the microphone's colours, the calm way (14.11) ---- */
/* 14.11.2026, Itzik: "הכותרת תמיד יוצאת מוסתרת ואת הפס הצבעוני תסיר". No line under the header, and the page starts
   below the phone's status bar (the app is full screen, viewport-fit=cover). */
.wrap:has(>header.hd){padding-top:max(18px,calc(env(safe-area-inset-top) + 10px))!important}
html body #quickForm.quickwrite{border:1.5px solid transparent!important;background:linear-gradient(var(--surface,#fff),var(--surface,#fff)) padding-box,${RING} border-box!important}
html body #quickForm #quickBtn{background:${RING}!important;color:#fff!important}
html body #bareBtn{border:2px solid transparent!important;color:var(--ink,#1f2430)!important;box-shadow:none!important;
 background:linear-gradient(var(--ground,#f6f8fc),var(--ground,#f6f8fc)) padding-box,${RING} border-box!important}
/* 14.11.2026, Itzik: "את המתאר מסביב לכפתור הגדרות תוריד": no ring, no circle, no shadow. Only the ⚙. */
html body #thumbSet.gSetBottom{border:0!important;background:transparent!important;box-shadow:none!important}
/* 14.11.2026, Itzik: "הוא לא ממורכז". The gear sits exactly in the middle of its place, whatever the text beside it does. */
html body #thumbSet.gSetBottom{position:relative!important;padding:0!important}
/* 14.11.2026, Itzik: "לוק נקי כמה שיותר". The ⚙ leaves the home screen: the circle at the top opens the settings. */
html body #thumbSet.gSetBottom{display:none!important}
#hdAva{cursor:pointer}
/* 14.11.2026, Itzik: "כל החלונות שנפתחים, למשל טאבים בתוך אריחים, צריכים להיפתח על מסך מלא ולא חלק שיראו מאחורה את הרקע".
   Every sheet (ysheet and its card) fills the whole screen: no margin, no rounded top, no page showing behind. */
html body .ysheet{padding:0!important;align-items:stretch!important;justify-content:stretch!important;background:var(--bg,#fff)!important}
html body .ysheet .ycard{max-width:none!important;width:100%!important;height:100%!important;min-height:100%!important;max-height:none!important;border-radius:0!important;box-shadow:none!important;box-sizing:border-box!important;padding-top:calc(env(safe-area-inset-top,0px) + 14px)!important;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 18px)!important}
/* the same for the other kinds: the tile colour sheet (long press), the ? help sheet and the board editor */
html body .tsh{align-items:stretch!important;background:var(--bg,#fff)!important}
html body .tsh-in{max-width:none!important;height:100%!important;border-radius:0!important;box-shadow:none!important;box-sizing:border-box!important;overflow-y:auto!important;padding-top:calc(env(safe-area-inset-top,0px) + 18px)!important;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 22px)!important}
html body .qhsheet{top:0!important;max-height:none!important;max-width:none!important;border-radius:0!important;padding-top:calc(env(safe-area-inset-top,0px) + 18px)!important}
html body .qhsheet .qh-x{top:calc(env(safe-area-inset-top,0px) + 8px)!important}
html body #bdEd{align-items:stretch!important;background:#07080f!important}
html body #bdEd .box{max-width:none!important;height:100%!important;border-radius:0!important;border:0!important;overflow-y:auto!important;padding-top:calc(env(safe-area-inset-top,0px) + 18px)!important}
/* 17.11.2026, Itzik: "התצוגה של המוניטור בדפדפן שוב מתפרסת על כל המסך ואמרנו שיהיה תצוגה צרה". On a computer the full screen
   sheets keep the background full, but their content stays as narrow as the home screen (620), centred. Phones unchanged. */
@media (min-width:700px){html body .ysheet .ycard,html body .tsh-in,html body #bdEd .box{max-width:620px!important;margin-left:auto!important;margin-right:auto!important}
html body .qhsheet{max-width:620px!important;left:0!important;right:0!important;margin:0 auto!important}}
/* 14.11.2026, Itzik chose: the two floating pills (מאזין, המחשב דלוק) become one dot on the circle. */
html body #livePill,html body #pcPill{display:none!important}
#hdAva{position:relative;overflow:visible!important}
#hdAva .avDot{position:absolute;bottom:-1px;left:-1px;width:11px;height:11px;border-radius:50%;border:2px solid var(--bg,#fff);display:none;z-index:2}
#hdAva .avDot.ok{display:block;background:var(--green,#1e9e5a)}
#hdAva .avDot.warn{display:block;background:#e0a11b}
#hdAva .avDot.bad{display:block;background:#e5484d}
.setLive{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:6px 0 12px;font-size:13px;color:var(--dim);cursor:pointer}
.setLive i{width:9px;height:9px;border-radius:50%;display:inline-block;background:var(--dim)}
.setLive i.ok{background:var(--green,#1e9e5a)}.setLive i.warn{background:#e0a11b}.setLive i.bad{background:#e5484d}
html body #thumbSet.gSetBottom::before{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;margin:0!important;line-height:1!important;display:block!important}
nav.bn{border-top-color:transparent!important}
nav.bn::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:${LINE};opacity:.8;pointer-events:none}
`;
const js = `
(function(){
 // the header (the round letter and the monitor's name) gets the thin four colour line under it
 function hd(){var t=document.querySelector('.hdtext');if(t&&t.parentNode&&!t.parentNode.classList.contains('micHd'))t.parentNode.classList.add('micHd');}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hd);else hd();
 window.addEventListener('load',hd);
 // 14.11.2026: the circle at the top opens the settings (the ⚙ is gone from the home screen)
 function goSet(e){if(e)e.preventDefault();try{pane('z');}catch(x){var t=document.getElementById('thumbSet');if(t)t.click();}}
 document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#hdAva'))goSet(e);});
 document.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&e.target&&e.target.id==='hdAva')goSet(e);});
 // 14.11.2026: the listener and the computer as one dot on the circle, and as a line at the top of the settings
 function has(el,c){return !!(el&&el.classList&&el.classList.contains(c));}
 function liveDot(){var a=document.getElementById('hdAva');if(!a)return;
  var lp=document.getElementById('livePill'),pc=document.getElementById('pcPill');
  var lt=((document.getElementById('lpText')||{}).textContent||'').trim(),pt=((document.getElementById('pcText')||{}).textContent||'').trim();
  var c=(has(lp,'down')||has(pc,'off'))?'bad':has(lp,'mute')?'warn':has(lp,'up')?'ok':'';
  var d=a.querySelector('.avDot');if(!d){d=document.createElement('span');d.setAttribute('aria-hidden','true');a.appendChild(d);}d.className='avDot '+c;
  a.setAttribute('aria-label','הגדרות'+(lt?', '+lt:'')+(pt?', '+pt:''));
  var z=document.getElementById('pZ');if(!z)return;var s=document.getElementById('setLive');
  if(!s){s=document.createElement('div');s.id='setLive';s.className='setLive';s.setAttribute('role','button');s.tabIndex=0;
   s.addEventListener('click',function(){var b=document.getElementById('livePill');if(b)b.click();});z.insertBefore(s,z.firstChild);}
  var lc=has(lp,'down')?'bad':has(lp,'mute')?'warn':has(lp,'up')?'ok':'',pcc=has(pc,'off')?'bad':has(pc,'on')?'ok':'';
  s.innerHTML=(lt?'<span><i class="'+lc+'"></i> '+lt+'</span>':'')+(pt&&pc&&pc.offsetParent!==undefined?'<span><i class="'+pcc+'"></i> '+pt+'</span>':'');
  s.hidden=!lt&&!pt;}
 setInterval(liveDot,3000);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',liveDot);else liveDot();
})();
`;
module.exports = { css, js };
