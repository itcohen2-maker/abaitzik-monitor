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
})();
`;
module.exports = { css, js };
