'use strict';
/*
  24.10.2026, Itzik: "אפשר גם לתת ללקוח את כל האפשרויות האלו והוא יחליט". Five designs (1, 3 to 6; skin 2 was dropped 25.10.2026, see NIGHT) from
  docs/home-designs.html, for every monitor (his own and every customer's).

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
  { n: '3', name: 'צבעוני', ground: '#f6f8fc', accent: '#1a73e8' },
  { n: '4', name: 'זכוכית', ground: '#eef0f7', accent: '#3b5bfd' },
  { n: '5', name: 'נייר חם', ground: '#f6f1e7', accent: '#b0501a' },
  { n: '6', name: 'עגול ושמח', ground: '#ffffff', accent: '#7048e8' },
];

const head = `
<script>
/* [light, dark] status bar colour per design, read by build.js skinApply. */
window.DZ_META={'3':['#f6f8fc','#0f1420'],'4':['#eef0f7','#121626'],'5':['#f6f1e7','#1c1812'],'6':['#ffffff','#121212']};
/* 24.10.2026, lib/skins-ui.js: the design choice goes on the root before the first
   paint, so a chosen design never flashes the green default first. Absent = skin 1. */
(function(){try{
 var s=localStorage.getItem('designSkin')||'';
 if(s==='1'||s==='3'||s==='4'||s==='5'||s==='6')document.documentElement.setAttribute('data-skin',s);
}catch(e){}})();
</script>
`;

// 25.10.2026, Itzik (voice note, 24.10): every design also has a night, in its own colours,
// not one dark look for all of them. Skin 1 keeps the base dark block. Skin 2 is gone: its
// night came out the same as skin 1's (same mint accent, near-black ground).
const NIGHT_TOKENS = {
 wait: '#fbbc05', fresh: '#12301f', unread: '#331615', shadow: '0 2px 10px rgba(0,0,0,.4)',
 'warn-soft': '#3a2a0b', 'warn-ink': '#fbbf24',
};
const NIGHT = {
 3: { ground: '#0f1420', surface: '#161d2e', sunk: '#121828', ink: '#e8eefc', dim: '#98a6c4', line: '#232d44',
  accent: '#6ea8ff', 'accent-soft': '#1a2a4a', 'on-accent': '#06173a', chip: '#161d2e', 'chip-ink': '#a8c8ff' },
 4: { ground: '#121626', surface: 'rgba(40,48,80,.55)', sunk: 'rgba(40,48,80,.7)', ink: '#eef1ff', dim: '#a0a8c8',
  line: 'rgba(255,255,255,.12)', accent: '#8fa2ff', 'accent-soft': 'rgba(143,162,255,.16)', 'on-accent': '#0b1030',
  chip: 'rgba(40,48,80,.7)', 'chip-ink': '#c5d0ff', shadow: '0 8px 24px rgba(0,0,0,.35)' },
 5: { ground: '#1c1812', surface: '#27211a', sunk: '#211c15', ink: '#f3e9d8', dim: '#b5a48c', line: '#3a3126',
  accent: '#e9915a', 'accent-soft': '#3a2a1c', 'on-accent': '#2a1408', chip: '#27211a', 'chip-ink': '#ffc9a3' },
 6: { ground: '#121212', surface: '#1e1b2e', sunk: '#191628', ink: '#f4f1ff', dim: '#b3acd0', line: '#2e2847',
  accent: '#a68cff', 'accent-soft': '#2a2350', 'on-accent': '#140a33', chip: '#1e1b2e', 'chip-ink': '#d6c9ff' },
};
// Rules beyond the tokens, for the parts of a design that paint their own colours.
const NIGHT_EXTRA = {
 3: [],
 4: [['body', 'background:radial-gradient(120% 60% at 100% 0,#2c3c7e 0,transparent 60%),radial-gradient(90% 50% at 0 40%,#4a2a4e 0,transparent 60%),radial-gradient(100% 60% at 80% 100%,#1c4a44 0,transparent 60%),#121626'],
  ['.hk,.hb,.apv,.alerts,.dz-box', 'border-color:rgba(255,255,255,.12)']],
 5: [],
 6: [['.hk', 'color:#f4f1ff'], ['.hk:nth-child(4n+1)', 'background:#173626'], ['.hk:nth-child(4n+2)', 'background:#3a1a1a'],
  ['.hk:nth-child(4n+3)', 'background:#13293d'], ['.hk:nth-child(4n+4)', 'background:#3a3014'],
  ['.apv-card', 'color:#f4f1ff;background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12)']],
};
// Two rules per design: the root asked for night (data-theme dark), or the phone is dark and the
// choice is still "הטלפון" (no data-theme). A day choice (data-theme light) keeps the design's own light look.
function nightCss(n) {
 const decl = Object.entries({ ...NIGHT_TOKENS, ...NIGHT[n] }).map(([k, v]) => `--${k}:${v}`).join(';');
 const scoped = (s, sel) => sel.split(',').map((x) => `${s} ${x}`).join(',');
 const rules = (s) => [
  `${s}{color-scheme:dark;${decl}}`,
  `${s} body{background:var(--ground)}`,
  ...NIGHT_EXTRA[n].map(([sel, d]) => `${scoped(s, sel)}{${d}}`),
 ].join('\n');
 const night = `:root:root[data-skin="${n}"][data-theme="dark"]`;
 const phone = `:root:root[data-skin="${n}"]:not([data-theme="light"])`;
 return `${rules(night)}\n@media (prefers-color-scheme:dark){\n${rules(phone)}\n}`;
}
const NIGHT_CSS = [3, 4, 5, 6].map(nightCss).join('\n');
const css = `
/* 24.10.2026: the six designs. Each selector is written twice on the root (:root:root)
   so it beats the dark-mode block, which is :root:not([data-theme]) at the same weight.
   Skins 2 to 6 ignore the phone's dark mode on purpose. Skin 1 has no rules. */
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

${NIGHT_CSS}


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
function dzGet(){try{var s=localStorage.getItem('designSkin')||'';return /^[13456]$/.test(s)?s:'1';}catch(e){return '1';}}
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
