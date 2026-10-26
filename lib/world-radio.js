// 26.10.2026: world 9 רדיו (bakelite radio), see plans/2026-10-26-three-worlds.md.
// Look approved by the owner: section #r in docs/new-look.html. Every selector is scoped
// under :root:root[data-skin="9"] (doubled :root so it beats build.js's own rules).
'use strict';
const P = ':root:root[data-skin="9"]';

// Day tokens. Inner screens are cream panels with brown text; the home page sits on the room.
const DAY = `
${P}{
 --rd-room:#2a1f17;--rd-case1:#f0e4c8;--rd-case2:#dccaa3;--rd-text:#3d2817;--rd-text2:#5a3d22;
 --rd-small:#6e5030;--rd-hot-ink:#1e140b;--rd-talk:#f6e7c8;--rd-talk-small:#d9c7a6;
 --rd-grille:#d4c096;--rd-grille-dot:#6b4e30;--rd-key1:#fffaf0;--rd-key2:#e6dcc6;--rd-key-on2:#d8cbb0;
 --rd-key-edge:#a8916a;--rd-lamp-off1:#9c8a6a;--rd-lamp-off2:#5d4f38;--rd-glow:rgba(255,170,30,.7);
 --rd-eng:rgba(90,61,34,.35);--rd-hi:rgba(255,255,255,.7);--rd-lo:rgba(120,90,50,.35);
 --rd-case-sh:0 18px 30px rgba(0,0,0,.5);--rd-hl:rgba(255,255,255,.6);
 --ground:#e9dab6;--surface:#f6ecd6;--sunk:#efe3c6;--ink:#3d2817;--dim:#6e5030;--line:#c9b48a;
 --accent:#5a3d22;--accent-soft:#eadcbc;--on-accent:#f6e7c8;--chip:#f6ecd6;--chip-ink:#3d2817;
 --shadow:0 2px 6px rgba(60,40,20,.18);--r:18px;--red:#a8301d;--wait:#8a5200;--orange:#8a4a00;
 --blue:#5a3d22;--green:#4a6a2a;--yellow:#c79a2c;--unread:#f6dcd2;--fresh:#e8efd6;
 --warn-soft:#f6ead0;--warn-ink:#6b4400;
}`;

// Night tokens: walnut case, darker room, brighter lamps. The dial keeps its own colours.
const NIGHT = `
 --rd-room:#120c08;--rd-case1:#3a2a1d;--rd-case2:#2b1f15;--rd-text:#e9d8b4;--rd-text2:#d9b679;
 --rd-small:#c2a77e;--rd-hot-ink:#fff3d6;--rd-talk:#e9d8b4;--rd-talk-small:#c2a77e;
 --rd-grille:#3a2c1e;--rd-grille-dot:#8a6a44;--rd-key1:#4a3626;--rd-key2:#3a2a1d;--rd-key-on2:#2e2116;
 --rd-key-edge:#15100b;--rd-lamp-off1:#6e5e44;--rd-lamp-off2:#41372a;--rd-glow:rgba(255,170,30,.9);
 --rd-eng:rgba(217,182,121,.3);--rd-hi:rgba(255,220,160,.12);--rd-lo:rgba(0,0,0,.45);
 --rd-case-sh:0 18px 30px rgba(0,0,0,.7);--rd-hl:rgba(255,220,160,.15);
 --ground:#1c140d;--surface:#2e2118;--sunk:#241a12;--ink:#e9d8b4;--dim:#c2a77e;--line:#4d3a27;
 --accent:#d9b679;--accent-soft:#3a2c1c;--on-accent:#2b1f15;--chip:#2e2118;--chip-ink:#e9d8b4;
 --shadow:0 2px 10px rgba(0,0,0,.5);--red:#e8735c;--wait:#f0b44a;--orange:#f0a050;
 --blue:#d9b679;--green:#8fbf6a;--yellow:#f0c040;--unread:#3a1d17;--fresh:#24301a;
 --warn-soft:#3a2a0b;--warn-ink:#f2c46a;
`;

const RULES = `
/* The room: the page behind the home screen is dark, every inner screen is cream. */
${P} body:has(#pH:not([hidden])){background:var(--rd-room)}

/* The case: section#pH is the bakelite housing. */
${P} #pH{background:linear-gradient(170deg,var(--rd-case1),var(--rd-case2));border-radius:28px;
 padding:18px 16px 22px;margin:12px;color:var(--rd-text);
 box-shadow:var(--rd-case-sh),inset 0 2px 0 var(--rd-hi),inset 0 -4px 0 var(--rd-lo)}
${P} #hmGreet{margin:6px 4px 12px;font:400 22px/1.25 'Secular One',sans-serif;color:var(--rd-text);
 text-shadow:0 1px 0 var(--rd-hl)}

/* The dial window: #newBtn. */
${P} #newBlock{grid-template-columns:1fr;gap:12px;margin:8px 0 16px}
${P} #newBtn{position:relative;display:flex;align-items:flex-end;gap:12px;width:100%;height:auto;margin:0;
 padding:14px 16px 16px;border:0;border-radius:16px;background:#1a120b;color:#ffcf8a;overflow:hidden;
 box-shadow:inset 0 4px 14px rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.6);animation:none;text-shadow:none}
${P} #newBtn::before{content:"";position:absolute;inset:0;pointer-events:none;
 background:radial-gradient(80% 90% at 50% 60%,rgba(255,170,60,.28),transparent 70%)}
${P} #newBtn::after{content:"";position:absolute;inset-inline:16px;bottom:9px;border-top:1px solid #5a4126;pointer-events:none}
${P} #newBtn .nb-l{position:relative;z-index:1;flex:1;min-width:0;padding-bottom:6px}
${P} #newBtn .nb-c{position:relative;z-index:1;flex:0 0 auto;min-width:0;height:auto;margin:0;padding:0;
 border-radius:0;background:none;color:#ffb648;display:block;animation:none;
 font:400 88px/0.85 VT323,monospace;text-shadow:0 0 12px rgba(255,160,40,.75),0 0 2px #ffd9a0}
${P} #nbTitle,${P} #newBtn b{display:block;font:400 19px/1.25 'Secular One',sans-serif;color:#ffcf8a;
 text-shadow:0 0 6px rgba(255,160,40,.5)}
${P} #nbSub,${P} #newBtn small{display:block;margin-top:4px;font:400 13px/1.4 Heebo,sans-serif;color:#b88a55;
 opacity:1;text-shadow:none}

/* The strip under the dial: #gotBtn, a smaller dark strip. */
${P} #gotBtn{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;margin:0;padding:9px 14px;
 border:0;border-radius:12px;background:linear-gradient(#2b1d12,#1a120b);color:#f0d9a8;animation:none;
 box-shadow:inset 0 2px 6px rgba(0,0,0,.8),0 1px 0 rgba(255,255,255,.5);text-shadow:none}
${P} #gotBtn .nb-l{flex:1;min-width:0}
${P} #gotBtn b{display:block;font:400 15px/1.3 'Secular One',sans-serif;color:#f0d9a8}
${P} #gotBtn small{display:block;margin-top:2px;font:400 12px/1.3 Heebo,sans-serif;color:#b88a55;opacity:1}
${P} #gotCount{flex:0 0 auto;min-width:0;height:auto;margin:0;padding:0;background:none;color:#ffb648;
 font:400 36px/1 VT323,monospace;text-shadow:0 0 8px rgba(255,160,40,.7)}
${P} #gotBtn .nb-c.zero{opacity:.55}

/* The round key under it: #bareBtn. */
${P} #bareBtn{display:block;width:100%;min-height:50px;margin:10px 0 0;padding:12px 14px;border:0;border-radius:12px;
 background:linear-gradient(var(--rd-key1),var(--rd-key2));color:var(--rd-text);
 font:400 16px 'Secular One',sans-serif;box-shadow:0 4px 0 var(--rd-key-edge),0 5px 6px rgba(0,0,0,.25)}
${P} #bareBtn:active{transform:translateY(3px);box-shadow:0 1px 0 var(--rd-key-edge)}

/* The speaker grille above the groups. */
${P} #worldHome::before{content:"";display:block;height:46px;margin:14px 6px 16px;border-radius:10px;
 background:radial-gradient(circle,var(--rd-grille-dot) 1.6px,transparent 2.2px) 0 0/9px 9px,var(--rd-grille);
 box-shadow:inset 0 2px 5px rgba(80,55,25,.45)}
${P} #worldHome .wg{margin:0 0 18px}
${P} #worldHome details.wg{margin:0 0 18px}

/* Engraved group labels. */
${P} #worldHome .wg-h{display:flex;align-items:center;gap:10px;margin:0 6px 10px;list-style:none;
 font:400 15px/1.3 'Secular One',sans-serif;letter-spacing:.02em;color:var(--rd-text2);
 text-shadow:0 1px 0 var(--rd-hl)}
${P} #worldHome .wg-h::after{content:"";order:1;flex:1;height:1px;background:var(--rd-eng)}
${P} #worldHome summary.wg-h{cursor:pointer}
${P} #worldHome summary.wg-h::-webkit-details-marker{display:none}
${P} #worldHome summary.wg-h::before{content:"\\25BE";order:2;font:400 15px Heebo,sans-serif;transition:transform .15s ease}
${P} #worldHome details.wg[open]>summary.wg-h::before{transform:rotate(180deg)}

/* Two columns of lamps. */
${P} #worldHome .wg-l{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;padding:0 6px}
${P} #worldHome .wg-l>[hidden]{display:none!important}

/* A tile is one lamp row: lamp in column 1, title and subtitle in column 2. */
${P} #worldHome .wg-l>.gt{display:grid;grid-template-columns:16px minmax(0,1fr);grid-template-rows:auto auto;
 column-gap:10px;row-gap:1px;align-items:center;width:100%;min-height:44px;margin:0;padding:6px 0;border:0;
 border-radius:0;background:none;box-shadow:none;text-shadow:none;color:var(--rd-text);text-align:start;
 overflow:visible;isolation:auto;filter:none;transform:none}
${P} #worldHome .wg-l>.gt:active{transform:translateY(1px);box-shadow:none;background:none;filter:none}
${P} #worldHome .wg-l>.gt::before{display:none}
${P} #worldHome .wg-l>.gt::after{content:"";grid-column:1;grid-row:1 / span 2;align-self:center;display:block;
 position:static;inset:auto;z-index:auto;width:16px;height:16px;border-radius:50%;transform:none;opacity:1;
 background:radial-gradient(circle at 35% 30%,var(--rd-lamp-off1),var(--rd-lamp-off2));
 box-shadow:inset 0 1px 2px rgba(0,0,0,.5),0 1px 0 rgba(255,255,255,.6)}
${P} #worldHome .wg-l>.gt b{grid-column:2;grid-row:1;align-self:end;display:block;margin:0;color:inherit;
 font:400 16px/1.25 'Secular One',sans-serif;text-shadow:none}
${P} #worldHome .wg-l>.gt small{grid-column:2;grid-row:2;align-self:start;display:block;margin:0;opacity:1;
 color:var(--rd-small);font:400 12px/1.35 Heebo,sans-serif;text-shadow:none}
${P} #worldHome .wg-l>.roundTile{width:100%;height:auto;min-height:44px;border-radius:0;font-size:16px;
 padding:6px 0;justify-content:start}

/* Icon tiles (.ic): the same lamp row, without the circle. */
${P} #worldHome .wg-l>.ic{display:flex;flex-direction:row;align-items:center;gap:10px;width:100%;min-height:44px;
 margin:0;padding:6px 0;border:0;background:none;box-shadow:none;color:var(--rd-text);text-align:start;
 text-decoration:none;font:400 16px/1.25 'Secular One',sans-serif}
${P} #worldHome .wg-l>.ic .c,${P} #worldHome .wg-l>.ic svg{display:none}
${P} #worldHome .wg-l>.ic .icN{position:static;margin-inline-start:auto;flex:none}
${P} #worldHome .wg-l>.ic::before{content:"";display:block;flex:none;width:16px;height:16px;border-radius:50%;
 background:radial-gradient(circle at 35% 30%,var(--rd-lamp-off1),var(--rd-lamp-off2));
 box-shadow:inset 0 1px 2px rgba(0,0,0,.5),0 1px 0 rgba(255,255,255,.6)}

/* The lamps that are on: a new tile (taskblink), an update (updblink), and every tile of the
   update group. The label goes dark so it reads on the lit lamp. */
${P} #worldHome .wg-l>.gt.taskblink::after,${P} #worldHome .wg-l>.gt.updblink::after,
${P} #worldHome .wg[data-g="upd"] .wg-l>.gt::after,${P} #worldHome .wg-l>.ic.taskblink::before,
${P} #worldHome .wg-l>.ic.updblink::before,${P} #worldHome .wg[data-g="upd"] .wg-l>.ic::before{
 background:radial-gradient(circle at 35% 30%,#fff2b0,#ffb020 55%,#c46a00);
 box-shadow:0 0 10px 2px var(--rd-glow),0 1px 0 rgba(255,255,255,.6)}
${P} #worldHome .wg-l>.gt.taskblink,${P} #worldHome .wg-l>.gt.updblink,
${P} #worldHome .wg[data-g="upd"] .wg-l>.gt,${P} #worldHome .wg-l>.ic.taskblink,
${P} #worldHome .wg-l>.ic.updblink,${P} #worldHome .wg[data-g="upd"] .wg-l>.ic{color:var(--rd-hot-ink)}
${P} #worldHome .wg-l>.gt.taskblink small,${P} #worldHome .wg-l>.gt.updblink small,
${P} #worldHome .wg[data-g="upd"] .wg-l>.gt small{color:var(--rd-hot-ink);opacity:.85}
${P} #worldHome .gt.taskblink,${P} #worldHome .gt.updblink,${P} #worldHome .gt.glow,${P} #worldHome .gt.blink,
${P} #newBtn.updblink,${P} #gotBtn.updblink{animation:none}

/* The talk knob: #talkCard sits on the room, the mic is the tuning knob. */
${P} #talkCard{background:none;border:0;box-shadow:none;padding:4px 2px 2px;margin:4px 0 6px}
${P} #talkCard .mic{width:96px;height:96px;flex:0 0 96px;
 background:repeating-conic-gradient(#4a2f1b 0deg 6deg,#6e4a2e 6deg 12deg);
 box-shadow:0 12px 22px rgba(0,0,0,.55),inset 0 2px 0 rgba(255,255,255,.08)}
${P} #talkCard .mic:before{inset:14px;
 background:radial-gradient(circle at 40% 35%,#8a6442,#3a2516 72%);
 box-shadow:inset 0 -4px 8px rgba(0,0,0,.5),inset 0 2px 3px rgba(255,255,255,.12)}
${P} #talkCard .mic svg{width:40px;height:40px;stroke:var(--rd-talk)}
${P} #talkCard .mic svg rect{fill:var(--rd-talk)}
${P} #talkCard .mic.on{animation:none;box-shadow:0 0 0 3px #ff5a36,0 12px 22px rgba(0,0,0,.55)}
${P} #talkCard .mic.on:before{background:radial-gradient(circle at 40% 35%,#8a3a22,#3a1610 72%)}
${P} #talkCard .vtxt b{display:block;font:400 19px/1.25 'Secular One',sans-serif;color:var(--rd-talk)}
${P} #talkCard .vtxt small,${P} #talkCard #micSaid{display:block;font:400 13px/1.45 Heebo,sans-serif;color:var(--rd-talk-small)}
${P} #talkCard .msgsaid{color:#ffcf8a}
${P} #talkCard .way{background:transparent;border:1px solid rgba(240,228,200,.35);border-radius:14px;
 color:var(--rd-talk);min-height:44px}
${P} #talkCard .way b{font:400 15px 'Secular One',sans-serif;color:var(--rd-talk)}
${P} #talkCard .way small{color:var(--rd-talk-small)}
${P} .reloadbig{background:var(--rd-case1);color:var(--rd-text);border:0;border-radius:999px;
 box-shadow:0 4px 0 var(--rd-key-edge),0 5px 6px rgba(0,0,0,.25)}

/* The bottom nav: a row of piano keys on cream. */
${P} .bn{background:linear-gradient(170deg,var(--rd-case1),var(--rd-case2));border-top:0;gap:6px;
 box-shadow:0 -8px 18px rgba(0,0,0,.4);-webkit-backdrop-filter:none;backdrop-filter:none;
 padding:10px 8px calc(10px + env(safe-area-inset-bottom))}
${P} .bn button{flex:1 1 0;min-width:0;min-height:52px;padding:6px 2px 7px;border-radius:6px 6px 10px 10px;
 background:linear-gradient(var(--rd-key1),var(--rd-key2));color:var(--rd-text);
 font:400 13px/1.2 'Secular One',sans-serif;box-shadow:0 4px 0 var(--rd-key-edge),0 5px 6px rgba(0,0,0,.25)}
${P} .bn button:active{transform:translateY(3px);box-shadow:0 1px 0 var(--rd-key-edge)}
${P} .bn button svg{width:22px;height:22px;background:none;border:0;padding:0;box-shadow:none;
 color:inherit;stroke:currentColor}
${P} .bn button[aria-pressed="true"]{background:linear-gradient(var(--rd-key2),var(--rd-key-on2));color:var(--rd-text);
 transform:translateY(3px);box-shadow:0 1px 0 var(--rd-key-edge);border-radius:6px 6px 10px 10px}
${P} .bn button[aria-pressed="true"] svg{background:none;border:0;box-shadow:none;color:inherit;stroke:currentColor}
${P} .bn button.hasnew{color:var(--red)}
${P} .bn button.hasnew svg{border:0}
${P} .bn button.hasnew svg{animation:none}

@media (prefers-reduced-motion:reduce){
${P} *{animation:none!important;transition:none!important}
}
`;

// Night: the same tokens for the dark theme set by the user, and for the phone's dark mode.
const css = `
${DAY}
${P}[data-theme="dark"]{${NIGHT}}
@media (prefers-color-scheme:dark){${P}:not([data-theme="light"]){${NIGHT}}}
${RULES}
`;

module.exports = { css, fonts: '' };
