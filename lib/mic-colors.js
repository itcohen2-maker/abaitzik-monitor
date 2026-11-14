'use strict';
/*
  14.11.2026, Itzik: "מיקרופון עדין". The colours around the microphone (blue, red, yellow, green), carried through the
  monitor as thin accents, the "עדין" option of the design page /p/e1b86a7148ec2ae036bb.html. Nothing is filled with
  colour: a thin line under the header and above the bottom bar, a thin ring around the writing box, the send arrow,
  the "עוד כלים" button and the settings button. The tiles are left as they are until he picks a tile style.
  Page JS rules: a plain string, so no backslashes, no backticks and no dollar-brace in it.
*/
const RING = 'conic-gradient(from 0deg,#4285F4,#EA4335,#FBBC05,#34A853,#4285F4)';
const LINE = 'linear-gradient(90deg,#4285F4 0 25%,#EA4335 0 50%,#FBBC05 0 75%,#34A853 0)';
const css = `
/* ---- the microphone's colours, the calm way (14.11) ---- */
.micHd{position:relative;padding-bottom:12px!important}
.micHd::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;border-radius:2px;background:${LINE};opacity:.85;pointer-events:none}
#quickForm{border:1.5px solid transparent!important;background:linear-gradient(var(--surface,#fff),var(--surface,#fff)) padding-box,${RING} border-box!important}
#quickBtn{background:${RING}!important;color:#fff!important}
#bareBtn{border:2px solid transparent!important;color:var(--ink,#1f2430)!important;box-shadow:none!important;
 background:linear-gradient(var(--ground,#f6f8fc),var(--ground,#f6f8fc)) padding-box,${RING} border-box!important}
#thumbSet.gSetBottom{border:1.5px solid transparent!important;background:linear-gradient(var(--surface,#fff),var(--surface,#fff)) padding-box,${RING} border-box!important}
nav.bn{border-top-color:transparent!important}
nav.bn::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:${LINE};opacity:.8;pointer-events:none}
`;
const js = `
(function(){
 // the header (the round letter and the monitor's name) gets the thin four colour line under it
 function hd(){var t=document.querySelector('.hdtext');if(t&&t.parentNode&&!t.parentNode.classList.contains('micHd'))t.parentNode.classList.add('micHd');}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hd);else hd();
 window.addEventListener('load',hd);
})();
`;
module.exports = { css, js };
