'use strict';
/*
  24.10.2026, Itzik: "אפשר גם לתת ללקוח את כל האפשרויות האלו והוא יחליט". Designs, for every
  monitor (his own and every customer's). Only design 1 is
  listed today (skin 2 was dropped 25.10.2026, see NIGHT; skins 3 to 6 were removed 26.10.2026).
  26.10.2026: Itzik: the colour skins 3 to 6 were removed. Settings will hold 1 (today's look) plus three worlds 7 עיתון, 8 פנקס, 9 רדיו, see plans/2026-10-26-three-worlds.md.

  Mechanism: the choice is stored per device in localStorage under "designSkin" (not
  "skin": that key already holds the day and night choice, light or dark). It is written
  on <html> as data-skin="1" or "7".."9". Skin 1 is the look the page always had and it has no
  rules here.

  Plain strings, build.js drops them into the page as they are:
  head  an inline script for <head>, before the main style, so the skin is on the root
        before the first paint (no flash);
  css   the picker's own styles, placed after the base tokens and the dark block in build.js;
  html  the picker box, in the settings screen, outside the ITZIK markers;
  js    the picker: paints the buttons, saves the choice, shows a toast.
*/
const DESIGNS = [{ n: '1', name: 'הרגיל', ground: '#f5f6f4', accent: '#0f6e5c' }];

const head = `
<script>
/* [light, dark] status bar colour per design, read by build.js skinApply. */
window.DZ_META={};
/* 24.10.2026, lib/skins-ui.js: the design choice goes on the root before the first
   paint, so a chosen design never flashes the default first. Absent = skin 1. */
(function(){try{
 var s=localStorage.getItem('designSkin')||'';
 if(s==='1'||s==='7'||s==='8'||s==='9')document.documentElement.setAttribute('data-skin',s);
}catch(e){}})();
</script>
`;

const css = `
/* The picker in settings. Buttons in three columns, each a swatch and a name. */
.dz-box{margin-top:14px;padding:13px 15px;border-radius:var(--r);background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow)}
.dz-box>b{display:block;font:500 15px Heebo,sans-serif}
.dz-box>small{display:block;color:var(--dim);font-size:12.5px;line-height:1.5;margin:2px 0 0}
.dz-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
.dz-btn{min-height:44px;display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:8px;border-radius:14px;
 border:1px solid var(--line);background:var(--surface);color:var(--ink);font:700 13.5px Heebo,sans-serif;cursor:pointer;text-align:center}
.dz-btn[aria-pressed="true"]{border:2px solid var(--accent)}
.dz-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.dz-sw{position:relative;display:block;height:44px;border-radius:10px;border:1px solid rgba(0,0,0,.12)}
.dz-sw i{position:absolute;inset-inline-end:7px;bottom:7px;width:18px;height:18px;border-radius:50%}
.dz-mark{min-height:16px;font:700 12px Heebo,sans-serif;color:var(--accent);visibility:hidden}
.dz-btn[aria-pressed="true"] .dz-mark{visibility:visible}
@media (max-width:330px){.dz-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

const html = `<div class="dz-box" id="designBox" aria-label="עיצוב">
 <b>עיצוב</b>
 <small id="designSaid">ארבעה סוגי מוניטור. הבחירה נשמרת במכשיר הזה בלבד.</small>
 <div class="dz-grid" role="group" aria-label="בחירת עיצוב">
${DESIGNS.map((d) => `  <button type="button" class="dz-btn" data-design="${d.n}" aria-pressed="false">
   <span class="dz-sw" style="background:${d.ground}" aria-hidden="true"><i style="background:${d.accent}"></i></span>
   <span>${d.n} ${d.name}</span>
   <span class="dz-mark">✓ נבחר</span>
  </button>`).join('\n')}
 </div>
</div>`;

const js = `
/* 24.10.2026: the design picker. Storage is wrapped, so a browser that refuses
   localStorage (private window, blocked site data) still shows the choice for the
   session and the page renders with the default look. */
function dzGet(){try{var s=localStorage.getItem('designSkin')||'';return /^[1789]$/.test(s)?s:'1';}catch(e){return '1';}}
function dzApply(v){
 var r=document.documentElement;
 r.setAttribute('data-skin',v);
 // The status bar colour and the day/night line follow the design and the mode together.
 if(typeof skinApply==='function')skinApply(skinGet());
 var said=document.getElementById('designSaid');
 var b=document.querySelector('.dz-btn[data-design="'+v+'"]');
 if(said&&b)said.textContent='נבחר: '+b.textContent.replace(/^\\s*\\d\\s*/,'')+'. הבחירה נשמרת במכשיר הזה בלבד.';
 Array.prototype.forEach.call(document.querySelectorAll('.dz-btn'),function(x){
  x.setAttribute('aria-pressed',x.getAttribute('data-design')===v?'true':'false');
 });
}
function dzBoot(){
 Array.prototype.forEach.call(document.querySelectorAll('.dz-btn'),function(b){
  b.addEventListener('click',function(){
   var v=b.getAttribute('data-design');
   try{localStorage.setItem('designSkin',v);}catch(e){}
   dzApply(v);
   toast('העיצוב הוחלף');
  });
 });
 dzApply(dzGet());
}
`;

module.exports = { DESIGNS, head, css, html, js };
