'use strict';
/*
  24.10.2026, Itzik: "אפשר גם לתת ללקוח את כל האפשרויות האלו והוא יחליט". Six designs
  from docs/home-designs.html, for every monitor (his own and every customer's).

  Mechanism: the choice is stored per device in localStorage under "designSkin" (not
  "skin": that key already holds the day and night choice, light or dark). It is written
  on <html> as data-skin="1".."6". Skin 1 is the look the page always had and it has no
  rules here. Skins 2 to 6 redefine the tokens of build.js :root and do not follow the
  phone's dark mode.

  Plain strings, build.js drops them into the page as they are:
  head  an inline script for <head>, before the main style, so the skin is on the root
        before the first paint (no flash);
  css   the skin rules, placed after the base tokens and the dark block in build.js;
  html  the picker box, in the settings screen, outside the ITZIK markers;
  js    the picker: paints the buttons, saves the choice, shows a toast.
*/
const DESIGNS = [
  { n: '1', name: 'ירוק רגוע', ground: '#f5f6f4', accent: '#0f6e5c' },
  { n: '2', name: 'כהה אלגנטי', ground: '#0e1311', accent: '#4fd1b0' },
  { n: '3', name: 'צבעוני', ground: '#f6f8fc', accent: '#1a73e8' },
  { n: '4', name: 'זכוכית', ground: '#eef0f7', accent: '#3b5bfd' },
  { n: '5', name: 'נייר חם', ground: '#f6f1e7', accent: '#b0501a' },
  { n: '6', name: 'עגול ושמח', ground: '#ffffff', accent: '#7048e8' },
];

const head = `
<script>
/* 24.10.2026, lib/skins-ui.js: the design choice goes on the root before the first
   paint, so a chosen design never flashes the green default first. Absent = skin 1. */
(function(){try{
 var s=localStorage.getItem('designSkin')||'';
 if(s==='1'||s==='2'||s==='3'||s==='4'||s==='5'||s==='6')document.documentElement.setAttribute('data-skin',s);
}catch(e){}})();
</script>
`;

const css = `
/* 24.10.2026: the six designs. Each selector is written twice on the root (:root:root)
   so it beats the dark-mode block, which is :root:not([data-theme]) at the same weight.
   Skins 2 to 6 ignore the phone's dark mode on purpose. Skin 1 has no rules. */
:root:root[data-skin="2"]{color-scheme:dark;--ground:#0e1311;--surface:#171e1b;--sunk:#121816;--ink:#edf1ef;--dim:#9fb0a9;
 --line:#232c28;--accent:#4fd1b0;--on-accent:#06231c;--accent-soft:#20302a;--chip:#171e1b;--chip-ink:#a5f3fc;
 --wait:#fbbc05;--orange:#fb8c00;--fresh:#12301f;--unread:#331615;--shadow:0 2px 10px rgba(0,0,0,.4);--warn-soft:#3a2a0b;--warn-ink:#fbbf24}
:root:root[data-skin="3"]{color-scheme:light;--ground:#f6f8fc;--surface:#fff;--sunk:#eef3fb;--ink:#1f2430;--dim:#5f6b7f;
 --line:#e3e9f4;--accent:#1a73e8;--on-accent:#fff;--accent-soft:#e8f0fe;--chip:#fff;--chip-ink:#1a73e8;
 --wait:#e37400;--orange:#e37400;--fresh:#e6f4ea;--unread:#fce8e6;--shadow:0 2px 8px rgba(30,50,90,.08);--warn-soft:#fff7e0;--warn-ink:#7a5200}
:root:root[data-skin="4"]{color-scheme:light;--ground:#eef0f7;--surface:rgba(255,255,255,.55);--sunk:rgba(255,255,255,.7);
 --ink:#18202e;--dim:#556078;--line:rgba(255,255,255,.8);--accent:#3b5bfd;--on-accent:#fff;--accent-soft:rgba(59,91,253,.12);
 --chip:rgba(255,255,255,.7);--chip-ink:#2a3f9e;--shadow:0 8px 24px rgba(40,50,90,.10)}
:root:root[data-skin="5"]{color-scheme:light;--ground:#f6f1e7;--surface:#fffbf3;--sunk:#f1e9da;--ink:#2b241c;--dim:#7a6c5b;
 --line:#e7dccb;--accent:#b0501a;--on-accent:#fff;--accent-soft:#f6e3d6;--chip:#fffbf3;--chip-ink:#8a3d12;
 --wait:#b35c00;--orange:#b35c00;--fresh:#eef5e6;--unread:#fbe9e4;--shadow:0 2px 6px rgba(74,52,24,.08);--warn-soft:#fff3d6;--warn-ink:#7a4a00}
:root:root[data-skin="6"]{color-scheme:light;--ground:#fff;--surface:#f3f0ff;--sunk:#ebe5ff;--ink:#111;--dim:#555;
 --line:#e5dbff;--accent:#7048e8;--on-accent:#fff;--accent-soft:#e5dbff;--chip:#fff;--chip-ink:#4c2fb0;--r:28px;
 --wait:#b26a00;--orange:#b26a00;--fresh:#d3f9d8;--unread:#ffe3e3;--shadow:0 4px 14px rgba(112,72,232,.12);--warn-soft:#fff3bf;--warn-ink:#6b4a00}

/* Skin 2: dark and calm. The base tokens above already carry the rest. */
:root[data-skin="2"] body{background:var(--ground)}

/* Skin 3: colourful. The approvals card and the KPI cards take his gradients. */
:root[data-skin="3"] .apv{background:linear-gradient(135deg,#9a4b00,#b05800);color:#fff;box-shadow:0 10px 24px rgba(227,116,0,.3)}
:root[data-skin="3"] .hk{border:0;color:#fff;background:linear-gradient(135deg,#1557b0,#1a66d0);box-shadow:0 6px 16px rgba(30,50,90,.18)}
:root[data-skin="3"] .hk:nth-child(4n+2){background:linear-gradient(135deg,#a51d1a,#c5221f)}
:root[data-skin="3"] .hk:nth-child(4n+3){background:linear-gradient(135deg,#0f6b2c,#137a34)}
:root[data-skin="3"] .hk:nth-child(4n+4){background:linear-gradient(135deg,#6c22b0,#7e2fc8)}
:root[data-skin="3"] .hk-l,:root[data-skin="3"] .hk-u,:root[data-skin="3"] .hk-f,:root[data-skin="3"] .hk-st,:root[data-skin="3"] .hk-v{color:#fff}
:root[data-skin="3"] .hk-st i{background:#fff}
:root[data-skin="3"] .hk-sp{color:#fff}

/* Skin 4: glass. Pastel light behind frosted cards. A phone that asks for less
   transparency gets solid white cards instead (see the media query below). */
:root[data-skin="4"] body{background:radial-gradient(120% 60% at 100% 0,#c7d7ff 0,transparent 60%),radial-gradient(90% 50% at 0 40%,#ffd9ec 0,transparent 60%),radial-gradient(100% 60% at 80% 100%,#c9f3e6 0,transparent 60%),#eef0f7}
:root[data-skin="4"] .hk,:root[data-skin="4"] .hb,:root[data-skin="4"] .apv,:root[data-skin="4"] .alerts,:root[data-skin="4"] .dz-box{
 background:var(--surface);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.8);box-shadow:0 8px 24px rgba(40,50,90,.10)}
:root[data-skin="4"] .apv{background:var(--accent)}
@media (prefers-reduced-transparency:reduce){
 :root:root[data-skin="4"]{--surface:#fff;--sunk:#f4f6fb;--chip:#fff}
 :root[data-skin="4"] .hk,:root[data-skin="4"] .hb,:root[data-skin="4"] .apv,:root[data-skin="4"] .alerts,:root[data-skin="4"] .dz-box{
  -webkit-backdrop-filter:none;backdrop-filter:none}
}

/* Skin 5: warm paper. Serif headings and numbers, a dark approvals card. */
:root[data-skin="5"] h1,:root[data-skin="5"] h2,:root[data-skin="5"] #hmGreet,:root[data-skin="5"] .hk-v{font-family:'Frank Ruhl Libre',Georgia,serif;font-weight:700}
:root[data-skin="5"] .apv{background:#2b241c;color:#f6f1e7;box-shadow:0 10px 24px rgba(43,36,28,.3)}

/* Skin 6: bold, round, playful. Bigger radius, pastel KPI cards, a black floating bar. */
:root[data-skin="6"] .apv{background:#ffd43b;color:#111;box-shadow:0 10px 24px rgba(255,212,59,.35)}
:root[data-skin="6"] .apv-card{color:#111;background:rgba(255,255,255,.5);border-color:rgba(0,0,0,.12)}
:root[data-skin="6"] .apv-more,:root[data-skin="6"] .apv-whyt,:root[data-skin="6"] .apv-why{color:#111}
:root[data-skin="6"] .apv-n{background:#111;color:#ffd43b}
:root[data-skin="6"] .hk{border:0;border-radius:24px;color:#111}
:root[data-skin="6"] .hk:nth-child(4n+1){background:#d3f9d8}
:root[data-skin="6"] .hk:nth-child(4n+2){background:#ffe3e3}
:root[data-skin="6"] .hk:nth-child(4n+3){background:#d0ebff}
:root[data-skin="6"] .hk:nth-child(4n+4){background:#fff3bf}
:root[data-skin="6"] .bn{inset-inline:12px;bottom:12px;border-radius:26px;background:#111;border:0;box-shadow:0 10px 24px rgba(0,0,0,.25)}
:root[data-skin="6"] .bn button{color:#fff}
:root[data-skin="6"] .bn button.hasnew{color:#ff8a80}
:root[data-skin="6"] .bn button[aria-pressed="true"]{color:#111}

/* 24.10.2026, Itzik: the day and night buttons did nothing. Skins 2 to 6 win over
   data-theme (same weight, later in the file), so a light design stayed light on
   "לילה" and the dark skin stayed dark on "יום". Day and night now win over every
   design: the same tokens as the base block, written on data-skin + data-theme. */
:root:root[data-skin][data-theme="dark"]{color-scheme:dark;--ground:#0f1218;--surface:#181d27;--sunk:#141922;
 --ink:#eef1f7;--dim:#9aa5b8;--line:#252c39;--accent:#4fd1b0;--accent-soft:#15302a;
 --wait:#fbbc05;--orange:#fb8c00;--fresh:#12301f;--unread:#331615;--shadow:0 2px 10px rgba(0,0,0,.4);--on-accent:#06231c;--chip:#181d27;--chip-ink:#a5f3fc;--warn-soft:#3a2a0b;--warn-ink:#fbbf24}
:root:root[data-skin][data-theme="light"]{color-scheme:light;--ground:#f6f8fc;--surface:#fff;--sunk:#eef2fa;--ink:#1f2430;--dim:#5f6b7f;
 --line:#e3e9f4;--accent:#0f6e5c;--accent-soft:#e3f1ed;--wait:#e37400;--fresh:#e6f6ec;--unread:#fdeceb;
 --shadow:0 2px 8px rgba(30,40,70,.07);--on-accent:#fff;--chip:#fff;--chip-ink:#0a4a5a;--warn-soft:#fff7e0;--warn-ink:#7a5200}
:root[data-skin][data-theme="dark"] body,:root[data-skin][data-theme="light"] body{background:var(--ground)}

/* The picker in settings. Six buttons in three columns, each a swatch and a name. */
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
 <small id="designSaid">שישה עיצובים לבחירה. הבחירה נשמרת במכשיר הזה בלבד.</small>
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
var DZ_GROUND={'2':'#0e1311','3':'#f6f8fc','4':'#eef0f7','5':'#f6f1e7','6':'#ffffff'};
function dzGet(){try{var s=localStorage.getItem('designSkin')||'';return /^[1-6]$/.test(s)?s:'1';}catch(e){return '1';}}
function dzApply(v){
 var r=document.documentElement;
 r.setAttribute('data-skin',v);
 var m=document.querySelector('meta[name="theme-color"]');
 if(m&&DZ_GROUND[v])m.setAttribute('content',DZ_GROUND[v]);
 else if(m&&typeof skinApply==='function')skinApply(typeof skinGet==='function'?skinGet():'auto');
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
