'use strict';
/*
  24.10.2026, Itzik approved direction A, "זכוכית רכה" (docs/help-designs.html).
  A customer's page only (build.js leaves this out of Itzik's own page): the quota
  capsule, the round help button, the help sheet with its questions and the two buttons
  that reach Itzik. Plain strings, so build.js drops them into the page as they are.
  Every answer below names only what exists on the customer's screen.
*/
const FAQ = [
  ['איפה הקובץ ששלחת לי?', 'כל קובץ נמצא אצל 📁 הקבצים שלי. מהמסך הראשי לוחצים עליו. יש שם שלוש לשוניות: הכל, מה שנשלח אליך ומה ששלחת.'],
  ['איך מורידים קובץ?', 'מהמסך הראשי לוחצים על 📁 הקבצים שלי, ואז על הקובץ. מופיע כפתור, במחשב "הורדה למחשב" ובנייד "שמירה בטלפון".'],
  ['איך שולחים תמונה או קובץ?', 'בכפתור 📎 צרף שליד כפתור השליחה. אפשר לבחור כמה קבצים יחד. במחשב אפשר גם להדביק תמונה שהועתקה עם Ctrl+V.'],
  ['איך אני יודע שהבקשה נשלחה?', 'הודעה שכתבת לא יוצאת מיד, יש כמה שניות לתיקון או לביטול, ואז היא יוצאת. מהמסך הראשי לוחצים על "איזה הוראות שלחתי למוניטור", ושם רואים את מצב כל בקשה: התקבל, בעבודה או בוצע.'],
  ['למה עוד לא ענו לי?', 'בקשה גדולה לוקחת כמה דקות. אם עבר זמן רב, לוחצים למטה על "עוד לא ענה לי" והפנייה עוברת לאיציק.'],
  ['איך מוסיפים משהו לתשובה שקיבלתי?', 'מתחת לתשובה יש כפתור "להשיב". כותבים או מקליטים, וההמשך נכנס לאותה שיחה.'],
  ['איך מבטלים בקשה ששלחתי?', 'מהמסך הראשי לוחצים על "איזה הוראות שלחתי למוניטור", ושם על "ביטול הבקשה" בכרטיס שלה, ולוחצים עוד פעם לאישור. הבקשה נעצרת ולא תטופל.'],
  ['המחשב שלי דלוק, למה כתוב שהוא כבוי?', 'המוניטור צריך שהמחשב יהיה דלוק ומחובר לאינטרנט. אם כתוב "המחשב כבוי" למרות שהוא דלוק, מכבים ומדליקים אותו ומחכים 2 דקות.'],
  ['למה צריך אישור מנהל?', 'שינויים במערכת עצמה עוברים דרך איציק כדי ששום דבר לא יישבר. בקשות עבודה רגילות לא צריכות אישור.'],
  ['כמה עוד נשאר לי להיום?', 'הפס בראש המסך מראה כמה נשאר מהמכסה של היום, באחוזים. כשנשארו 20 אחוז מופיעה התראה, וכשהמכסה נגמרת העבודה נעצרת עד שאיציק מאשר.'],
];

const css = `
.qhbar{margin:0 0 12px;padding:9px 14px;border-radius:999px;background:color-mix(in srgb,var(--surface) 78%,transparent);
 -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid var(--line);color:var(--ink);
 font:700 14px Heebo,sans-serif;display:flex;align-items:center;gap:10px;box-shadow:0 4px 14px rgba(79,124,255,.12)}
.qhbar[hidden]{display:none}
.qhbar .qh-track{flex:1;height:10px;border-radius:8px;background:var(--sunk);overflow:hidden}
.qhbar .qh-fill{display:block;height:100%;width:var(--left,100%);border-radius:8px;background:linear-gradient(90deg,#2dd4bf,#3b82f6);transition:width .5s,background .4s}
.qhbar.warn{background:#fff7e6;border-color:#f59e0b;color:#92400e}
.qhbar.warn .qh-fill{background:#f59e0b}
.qhbar.full{background:#eceef2;border-color:#9ca3af;color:#4b5563}
.qhbar.full .qh-fill{background:#9ca3af}
.qhbar.full .qh-track{display:none}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .qhbar.warn{background:#3a2a0b;color:#fbbf24}:root:not([data-theme="light"]) .qhbar.full{background:#232831;color:#aab3c2}}
:root[data-theme="dark"] .qhbar.warn{background:#3a2a0b;color:#fbbf24}:root[data-theme="dark"] .qhbar.full{background:#232831;color:#aab3c2}
.qhbtn{position:fixed;z-index:58;inset-inline-start:max(10px,env(safe-area-inset-left));bottom:calc(122px + env(safe-area-inset-bottom));
 width:58px;height:58px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.7);cursor:pointer;
 background:rgba(255,255,255,.6);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:#1d2b64;
 font:800 24px Heebo,sans-serif;box-shadow:0 8px 24px rgba(79,124,255,.35);animation:qhbreathe 6s ease-in-out infinite;transition:opacity .2s}
@keyframes qhbreathe{50%{box-shadow:0 8px 34px rgba(79,124,255,.6)}}
.qhbtn.away{opacity:0;pointer-events:none}
.qhbtn[hidden]{display:none}
.qhshade{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:opacity .3s}
.qhshade.on{opacity:1;pointer-events:auto}
.qhsheet{position:fixed;z-index:91;inset-inline:0;bottom:0;max-height:82vh;overflow-y:auto;margin-inline:auto;max-width:620px;
 transform:translateY(105%);transition:transform .42s cubic-bezier(.2,.9,.25,1.15);padding:10px 16px calc(22px + env(safe-area-inset-bottom));
 border-radius:24px 24px 0 0;background:color-mix(in srgb,var(--surface) 88%,transparent);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);
 color:var(--ink);box-shadow:0 -10px 30px rgba(0,0,0,.2);visibility:hidden}
.qhsheet.on{transform:none;visibility:visible}
.qhsheet .qh-grab{width:40px;height:5px;border-radius:3px;margin:0 auto 10px;opacity:.35;background:currentColor}
.qhsheet h3{margin:0 0 10px;font:800 18px Heebo,sans-serif}
.qhsheet .qh-x{position:absolute;top:10px;inset-inline-end:14px;border:0;background:none;font-size:22px;cursor:pointer;color:inherit;min-width:44px;min-height:44px}
.qhq{display:block;width:100%;text-align:start;font:600 15px Heebo,sans-serif;padding:12px;margin:6px 0;border-radius:12px;cursor:pointer;
 border:1px solid var(--line);background:var(--surface);color:var(--ink)}
.qhq[aria-expanded="true"]{border-color:#4f7cff}
.qha{margin:-2px 4px 8px;padding:10px 12px;border-radius:12px;background:var(--sunk);font:400 15px/1.6 Heebo,sans-serif}
.qha[hidden]{display:none}
.qhhuman{display:block;width:100%;margin-top:8px;padding:13px;border:0;border-radius:12px;background:#4f7cff;color:#fff;font:800 15px Heebo,sans-serif;cursor:pointer}
.qhhuman.alt{background:transparent;color:#4f7cff;border:1.5px solid #4f7cff}
.qhform{margin-top:8px}
.qhform textarea{width:100%;box-sizing:border-box;min-height:84px;padding:10px;border-radius:12px;border:1px solid var(--line);font:400 16px Heebo,sans-serif;background:var(--surface);color:var(--ink)}
@media (prefers-reduced-motion:reduce){.qhbtn{animation:none}.qhsheet,.qhshade,.qhbar .qh-fill{transition:none}}
`;

const bar = '<div class="qhbar" data-qh="bar" role="status" aria-live="polite" hidden><span class="qh-t"></span><span class="qh-track"><i class="qh-fill"></i></span></div>';

const html = `
<button type="button" class="qhbtn" id="qhBtn" aria-label="עזרה" aria-haspopup="dialog">?</button>
<div class="qhshade" id="qhShade"></div>
<div class="qhsheet" id="qhSheet" role="dialog" aria-modal="true" aria-labelledby="qhTitle" aria-hidden="true">
 <div class="qh-grab"></div>
 <button type="button" class="qh-x" id="qhX" aria-label="סגירה">✕</button>
 <h3 id="qhTitle">במה אפשר לעזור?</h3>
 <div id="qhList"></div>
 <button type="button" class="qhhuman alt" id="qhNoAns">עוד לא ענה לי</button>
 <button type="button" class="qhhuman alt" id="qhBank" hidden>🏦 אני רוצה לחבר את הבנק</button>
 <button type="button" class="qhhuman" id="qhHuman">לא מצאתי, תעביר לאיציק</button>
 <form class="qhform" id="qhForm" hidden>
  <textarea id="qhText" rows="3" maxlength="500" placeholder="מה לא מצאת? כמה מילים מספיקות" aria-label="מה לא מצאת"></textarea>
  <button type="submit" class="qhhuman">שליחה לאיציק</button>
 </form>
</div>
`;

const js = `
var QH_FAQ=${JSON.stringify(FAQ)};
(function(){
 var $=function(id){return document.getElementById(id);};
 function snd(n){
  if(typeof sfxOn!=='function'||!sfxOn())return;
  try{
   var c=sfxCtx();if(!c)return;
   if(n==='open'){sfxTone(520,880,0,0.16,0.09);sfxTone(1320,0,0.09,0.22,0.04,'triangle');}
   else if(n==='tap'){sfxTone(1400,0,0,0.05,0.06,'triangle');}
   else if(n==='warn'){sfxTone(660,0,0,0.2,0.09,'triangle');sfxTone(523,0,0.22,0.28,0.08,'triangle');}
   else if(n==='block'){sfxTone(196,140,0,0.3,0.12);sfxTone(98,0,0,0.3,0.07);}
   sfxIdle();
  }catch(e){}
 }
 function dayKey(){try{return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});}catch(e){return String(new Date().getDate());}}
 function once(k){try{var v=localStorage.getItem(k);if(v===dayKey())return false;localStorage.setItem(k,dayKey());return true;}catch(e){return true;}}
 window.paintQuota=function(){
  var q=liveLast&&liveLast.quota;
  var bars=document.querySelectorAll('[data-qh="bar"]');
  var ok=q&&typeof q.pct==='number'&&isFinite(q.pct);
  if(!ok){[].forEach.call(bars,function(b){b.hidden=true;});return;}
  var left=Math.max(0,Math.min(100,100-Math.round(q.pct)));
  var locked=left<=0||!!liveLast.hold;
  var warn=!locked&&left<=20;
  [].forEach.call(bars,function(b){
   b.hidden=false;
   b.className='qhbar'+(locked?' full':warn?' warn':'');
   b.querySelector('.qh-t').textContent=locked?'🔒 המכסה של היום הסתיימה. איציק קיבל הודעה ויאשר בהקדם.':'נשאר לך '+left+'% להיום';
   b.querySelector('.qh-fill').style.setProperty('--left',left+'%');
  });
  if(locked){if(once('qhBlockDay'))snd('block');}
  else if(warn&&once('qhWarnDay')){toast('נשארו לך '+left+'% מהמכסה של היום');snd('warn');}
 };
 var sheet=$('qhSheet'),shade=$('qhShade'),btn=$('qhBtn');
 if(!sheet||!btn)return;
 var list=$('qhList');
 list.innerHTML=QH_FAQ.map(function(f,i){
  return '<button type="button" class="qhq" aria-expanded="false" aria-controls="qha'+i+'">'+esc(f[0])+'</button><div class="qha" id="qha'+i+'" hidden>'+esc(f[1])+'</div>';
 }).join('');
 list.onclick=function(e){
  var b=e.target.closest&&e.target.closest('.qhq');if(!b)return;
  var a=b.nextElementSibling,open=b.getAttribute('aria-expanded')==='true';
  b.setAttribute('aria-expanded',open?'false':'true');a.hidden=open;snd('tap');
 };
 function paintBank(){var b=$('qhBank');if(b)b.hidden=!!(typeof D==='object'&&D&&D.features&&D.features.bank===true);}
 function openS(){paintBank();sheet.classList.add('on');shade.classList.add('on');sheet.setAttribute('aria-hidden','false');snd('open');}
 function closeS(){sheet.classList.remove('on');shade.classList.remove('on');sheet.setAttribute('aria-hidden','true');$('qhForm').hidden=true;}
 btn.onclick=openS;shade.onclick=closeS;$('qhX').onclick=closeS;
 document.addEventListener('keydown',function(e){if(e.key==='Escape')closeS();});
 // The button steps aside while someone types, so it never sits over the send box.
 document.addEventListener('focusin',function(e){if(e.target&&/^(TEXTAREA|INPUT)$/.test(e.target.tagName)&&!sheet.contains(e.target))btn.classList.add('away');});
 document.addEventListener('focusout',function(){setTimeout(function(){var a=document.activeElement;if(!a||!/^(TEXTAREA|INPUT)$/.test(a.tagName))btn.classList.remove('away');},150);});
 // Never over the send box: if the button's spot overlaps a writing box, it rides up above it.
 var placing=false;
 function place(){
  placing=false;
  btn.style.transform='';
  var r=btn.getBoundingClientRect(),dy=0;
  [].forEach.call(document.querySelectorAll('textarea,.sendrow,#msgBtn'),function(el){
   if(sheet.contains(el)||!el.offsetParent)return;
   var e=el.getBoundingClientRect();
   if(e.width<2||e.height<2||e.right<r.left||e.left>r.right||e.bottom<r.top||e.top>r.bottom)return;
   dy=Math.max(dy,r.bottom-e.top+10);
  });
  if(dy)btn.style.transform='translateY(-'+Math.round(dy)+'px)';
 }
 function placeSoon(){if(!placing){placing=true;requestAnimationFrame(place);}}
 window.addEventListener('scroll',placeSoon,{passive:true});window.addEventListener('resize',placeSoon);
 setInterval(placeSoon,1000);placeSoon();
 function sent(r){closeS();toast(r==='held'?HELD_SAY:'הפנייה נשלחה לאיציק. הוא יחזור אליך בהקדם.');}
 $('qhNoAns').onclick=function(){
  snd('tap');
  var open=(typeof gotList==='function'?gotList():[]).filter(gotOpen)[0];
  var one=function(s){return String(s||'').split(String.fromCharCode(10)).join(' ').slice(0,80);};
  var t=open?'עוד לא ענו לי על הבקשה: '+one(open.text)+(open.id?' (מזהה '+open.id+')':''):'עוד לא ענו לי. אין לי בקשה פתוחה במסך, צריך לבדוק.';
  sendOrHold('עזרה מלקוח',t,'no-answer').then(sent);
 };
 $('qhBank').onclick=function(){
  snd('tap');
  sendOrHold('בקשת פיצ׳ר','אני רוצה לחבר את הבנק','feature-bank').then(function(r){closeS();toast(r==='held'?HELD_SAY:'הבקשה הגיעה לאיציק. אחרי שיאשר, יופיע לך הכפתור 🏦 חיבור הבנק.');});
 };
 $('qhHuman').onclick=function(){snd('tap');var f=$('qhForm');f.hidden=false;$('qhText').focus();};
 $('qhForm').onsubmit=function(e){
  e.preventDefault();
  var v=$('qhText').value.trim();
  if(!v){toast('צריך לכתוב כמה מילים');return;}
  $('qhText').value='';
  sendOrHold('עזרה מלקוח',v.slice(0,500),'help-human').then(sent);
 };
})();
`;

module.exports = { FAQ, css, bar, html, js };
