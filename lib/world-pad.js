// 26.10.2026: the world 8 פנקס (notebook), see plans/2026-10-26-three-worlds.md.
// Visual reference: docs/new-look.html section #k. Every selector sits under :root:root[data-skin="8"]
// (the doubled :root beats the base dark blocks in build.js, and it still contains :root[data-skin="8"]).
// Fonts load from lib/worlds-ui.js (wldFonts), so this module has no fonts of its own.
const css = `
:root[data-skin="8"]{--pd-desk:#3b3127;--pd-paper:#fbf7ea;--pd-line:#bcd0e4;--pd-margin:#e0827b;--pd-ink:#24303f;--pd-head:#1f3b73;--pd-dim:#5b6575;--pd-mark:#ffeb3b;--pd-stamp:#b3261e;--pd-tick:#1f6f3f;--pd-tab1:#f5c84c;--pd-tab2:#8fc7a1;--pd-tab3:#9ec3ea;--pd-tab4:#f0a3a0;--pd-tab5:#d1b8e6}
:root:root[data-skin="8"]{--ground:var(--pd-desk);--surface:var(--pd-paper);--sunk:var(--pd-paper);--ink:var(--pd-ink);--dim:var(--pd-dim);--line:var(--pd-line);--accent:var(--pd-head);--accent-soft:var(--pd-paper);--wait:var(--pd-stamp);--red:var(--pd-stamp);--on-accent:var(--pd-paper);--chip:var(--pd-paper);--chip-ink:var(--pd-head);--shadow:0 10px 26px rgba(0,0,0,.45);--r:4px;--warn-soft:var(--pd-paper);--warn-ink:var(--pd-stamp)}
:root:root[data-skin="8"] body{background:var(--pd-desk);color:var(--pd-ink)}
:root:root[data-skin="8"] #pH{position:relative;margin:12px;padding:20px 16px 40px;padding-inline-start:46px;border-radius:4px;background-color:var(--pd-paper);background-image:linear-gradient(var(--pd-paper) 31px,var(--pd-line) 32px);background-size:100% 32px;box-shadow:0 10px 26px rgba(0,0,0,.45);color:var(--pd-ink);font-family:'David Libre',serif}
:root:root[data-skin="8"] #pH::before{content:'';position:absolute;top:0;bottom:0;inset-inline-start:34px;width:2px;background:var(--pd-margin);pointer-events:none;z-index:0}
:root:root[data-skin="8"] #pH>*{position:relative;z-index:1}
:root:root[data-skin="8"] #hmGreet{margin:0;font:700 50px/64px 'Amatic SC',cursive;color:var(--pd-head)}
:root:root[data-skin="8"] #newBlock .newbtn{width:100%;height:auto;margin:0 0 4px;padding:0;gap:10px;background:none!important;border:0;border-radius:0;box-shadow:none;color:var(--pd-ink);text-align:start;font:inherit;animation:none}
:root:root[data-skin="8"] #newBlock .newbtn:active{transform:none}
:root:root[data-skin="8"] #newBlock .newbtn .nb-l{flex:1 1 auto;min-width:0}
:root:root[data-skin="8"] #newBlock #newBtn b{display:inline;font:400 22px/32px 'Secular One',sans-serif;color:var(--pd-ink);background:linear-gradient(100deg,transparent 2%,var(--pd-mark) 4%,var(--pd-mark) 94%,transparent 97%);padding:0 6px;border-radius:4px}
:root:root[data-skin="8"] #newBlock #newBtn small{display:block;margin:4px 0 0;font:400 15px/32px 'David Libre',serif;color:var(--pd-dim);opacity:1}
:root:root[data-skin="8"] #newBlock .newbtn .nb-c{flex:0 0 auto;min-width:0;height:auto;padding:0 6px;border-radius:4px;background:linear-gradient(100deg,transparent 2%,var(--pd-mark) 4%,var(--pd-mark) 94%,transparent 97%);color:var(--pd-ink);font:700 22px/32px 'Secular One',sans-serif;animation:none}
:root:root[data-skin="8"] #newBlock .newbtn.hot .nb-c{background:linear-gradient(100deg,transparent 2%,var(--pd-mark) 4%,var(--pd-mark) 94%,transparent 97%);color:var(--pd-ink);min-width:0;height:auto;font-size:22px}
:root:root[data-skin="8"] #newBlock .newbtn.hot b{font-size:22px}
:root:root[data-skin="8"] #newBlock #gotBtn b{display:block;font:400 19px/32px 'David Libre',serif;color:var(--pd-ink);background:none;padding:0}
:root:root[data-skin="8"] #newBlock #gotBtn small{display:block;font:400 15px/32px 'David Libre',serif;color:var(--pd-dim)}
:root:root[data-skin="8"] #newBlock #gotBtn .nb-c{background:none;color:var(--pd-dim);font:400 17px/32px 'David Libre',serif;padding:0}
:root:root[data-skin="8"] #newBlock #gotBtn .nb-c.zero{opacity:1}
:root:root[data-skin="8"] #bareBtn.morebtn{display:block;width:100%;margin:0;padding:0;background:none;border:0;box-shadow:none;color:var(--pd-head);font:700 30px/64px 'Amatic SC',cursive;text-align:start;cursor:pointer}
:root:root[data-skin="8"] .wh .wg{margin:0}
:root:root[data-skin="8"] .wh .wg-h{display:block;margin:0;padding:0;border:0;background:none;list-style:none;font:700 32px/64px 'Amatic SC',cursive;color:var(--pd-head)}
:root:root[data-skin="8"] .wh .wg-h::-webkit-details-marker{display:none}
:root:root[data-skin="8"] .wh details.wg>summary.wg-h{cursor:pointer}
:root:root[data-skin="8"] .wh details.wg>summary.wg-h::after{content:' \\25BE';font:400 22px/64px 'David Libre',serif}
:root:root[data-skin="8"] .wh .wg-l{display:flex;flex-direction:column;gap:0;margin:0 0 8px}
:root:root[data-skin="8"] .wh .wg-l>.ic,:root:root[data-skin="8"] .wh .wg-l>.gt{position:relative;display:flex;flex-direction:row;align-items:center;gap:10px;width:100%;min-height:44px;height:auto;margin:0;padding:0;border:0;border-radius:0;box-shadow:none;background:none;color:var(--pd-ink);font:400 19px/32px 'David Libre',serif;text-align:start;text-decoration:none;transform:none;overflow:visible;isolation:auto}
:root:root[data-skin="8"] .wh .wg-l>.ic::before,:root:root[data-skin="8"] .wh .wg-l>.gt::before{content:'';flex:0 0 18px;width:18px;height:18px;border:2px solid var(--pd-ink);border-radius:3px 4px 2px 5px;transform:rotate(-3deg);box-sizing:border-box;margin-inline-end:2px}
:root:root[data-skin="8"] .wh .wg-l>.gt:after{content:none;display:none}
:root:root[data-skin="8"] .wh .wg-l .ic .c,:root:root[data-skin="8"] .wh .wg-l .ic svg{display:none}
:root:root[data-skin="8"] .wh .wg-l .ic .icN{position:static;min-width:0;height:auto;padding:0 4px;border:0;background:none;color:var(--pd-dim);font:400 15px/32px 'David Libre',serif}
:root:root[data-skin="8"] .wh .wg-l>.gt b{display:inline;font:400 19px/32px 'David Libre',serif;color:var(--pd-ink);margin:0}
:root:root[data-skin="8"] .wh .wg-l>.gt small{display:inline;margin:0;font:400 14px/32px 'David Libre',serif;color:var(--pd-dim);opacity:1;text-shadow:none}
:root:root[data-skin="8"] .wh .wg-l>.gt .flag{display:none}
:root:root[data-skin="8"] .wh .wg-l .taskblink,:root:root[data-skin="8"] .wh .wg-l .updblink{animation:none;box-shadow:none}
:root:root[data-skin="8"] .wh .wg-l>.taskblink::after,:root:root[data-skin="8"] .wh .wg-l>.updblink::after{content:'חדש';position:static;inset:auto;z-index:auto;display:inline-block;margin-inline-start:auto;flex:0 0 auto;background:none;color:var(--pd-stamp);border:2px solid var(--pd-stamp);border-radius:4px;padding:0 6px;font:400 13px/20px 'Secular One',sans-serif;transform:rotate(-6deg);opacity:.9;animation:none}
:root:root[data-skin="8"] .bn{background:var(--pd-desk);border-top:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;gap:6px;padding:8px 6px calc(4px + env(safe-area-inset-bottom))}
:root:root[data-skin="8"] .bn button{flex:1 1 0;min-height:44px;padding:6px 2px;border-radius:8px 8px 0 0;background:var(--pd-tab1);color:#2a2418;font:400 14px/1.2 'Secular One',sans-serif;box-shadow:0 2px 3px rgba(0,0,0,.25);transition:transform .15s ease}
:root:root[data-skin="8"] .bn button:nth-child(1){background:var(--pd-tab1)}
:root:root[data-skin="8"] .bn button:nth-child(2){background:var(--pd-tab2)}
:root:root[data-skin="8"] .bn button:nth-child(3){background:var(--pd-tab3)}
:root:root[data-skin="8"] .bn button:nth-child(4){background:var(--pd-tab4)}
:root:root[data-skin="8"] .bn button:nth-child(5){background:var(--pd-tab5)}
:root:root[data-skin="8"] .bn button svg{width:22px;height:22px;background:none;border-radius:0;padding:0;box-sizing:border-box;stroke:#2a2418}
:root:root[data-skin="8"] .bn button span{font-size:16px}
:root:root[data-skin="8"] .bn button[aria-pressed="true"]{background:var(--pd-paper);color:#2a2418;box-shadow:0 -2px 0 var(--pd-ink),0 2px 3px rgba(0,0,0,.25);transform:translateY(-4px);border-radius:8px 8px 0 0}
:root:root[data-skin="8"] .bn button[aria-pressed="true"] svg{background:none;stroke:#2a2418}
:root:root[data-skin="8"] .bn button.hasnew{color:#2a2418;box-shadow:inset 0 -3px 0 var(--pd-stamp),0 2px 3px rgba(0,0,0,.25)}
:root:root[data-skin="8"] .bn button.hasnew svg,:root:root[data-skin="8"] .bn button.hasnew.blink{animation:none}
:root:root[data-skin="8"] .bn .cnt{background:var(--pd-stamp);color:var(--pd-paper);border:0}
:root:root[data-skin="8"] .talk{background:none;border:0;border-radius:0;box-shadow:none;padding:0;margin:0 0 8px}
:root:root[data-skin="8"] .talk .vtxt b{display:block;font:700 32px/48px 'Amatic SC',cursive;color:var(--pd-head)}
:root:root[data-skin="8"] .talk .vtxt small{display:block;font:400 16px/32px 'David Libre',serif;color:var(--pd-dim)}
:root:root[data-skin="8"] .mic{width:60px;height:60px;flex:0 0 60px;background:transparent;border:3px solid var(--pd-stamp);border-radius:50%;box-shadow:none;color:var(--pd-stamp);transform:rotate(-8deg)}
:root:root[data-skin="8"] .mic svg{width:30px;height:30px;stroke:var(--pd-stamp)}
:root:root[data-skin="8"] .mic svg rect{fill:var(--pd-stamp)}
:root:root[data-skin="8"] .mic.on{animation:none;box-shadow:0 0 0 4px rgba(179,38,30,.18)}
:root:root[data-skin="8"] .ways .way{background:none;border:0;box-shadow:none;color:var(--pd-ink);text-align:start}
:root:root[data-skin="8"] .ways .way b{font:400 19px/32px 'David Libre',serif;color:var(--pd-ink)}
:root:root[data-skin="8"] .ways .way small{font:400 14px/32px 'David Libre',serif;color:var(--pd-dim)}
:root:root[data-skin="8"] .quickwrite textarea{flex:1;min-width:0;min-height:44px;background:transparent;color:var(--pd-ink);border:0;border-bottom:2px dashed var(--pd-dim);border-radius:0;padding:0 2px;font:400 19px/32px 'David Libre',serif;box-shadow:none}
:root:root[data-skin="8"] .quickwrite textarea::placeholder{color:var(--pd-dim);opacity:1;font-weight:400}
:root:root[data-skin="8"] .quickwrite textarea:focus{outline:2px solid var(--pd-head);outline-offset:2px}
:root:root[data-skin="8"] .quickwrite button{min-height:44px;min-width:44px;padding:0 14px;background:transparent;color:var(--pd-head);border:2px solid var(--pd-head);border-radius:4px;box-shadow:none;font:400 17px/1 'Secular One',sans-serif}
:root:root[data-skin="8"] .msgsaid{font:400 15px/32px 'David Libre',serif;color:var(--pd-dim)}
@media (prefers-reduced-motion:reduce){:root:root[data-skin="8"] .bn button,:root:root[data-skin="8"] .mic,:root:root[data-skin="8"] .wh .wg-l>*{transition:none;animation:none}}
:root:root[data-skin="8"][data-theme="dark"]{--pd-desk:#15110c;--pd-paper:#2a2620;--pd-line:#3c4656;--pd-margin:#8a4a44;--pd-ink:#e8e2d2;--pd-head:#a9c1f0;--pd-dim:#a39c8c;--pd-mark:rgba(255,235,59,.35);--pd-stamp:#ff7b6e;--pd-tick:#7fd39b}
@media (prefers-color-scheme:dark){:root:root[data-skin="8"]:not([data-theme="light"]){--pd-desk:#15110c;--pd-paper:#2a2620;--pd-line:#3c4656;--pd-margin:#8a4a44;--pd-ink:#e8e2d2;--pd-head:#a9c1f0;--pd-dim:#a39c8c;--pd-mark:rgba(255,235,59,.35);--pd-stamp:#ff7b6e;--pd-tick:#7fd39b}}

/* 26.10.2026, checked on his live page: long subtitles squeezed the name into two lines,
   and the base waving hand (.gt.taskblink::before, absolute, an svg background) sat on the
   stamp. The name stays on one line, the subtitle goes under it, and the box stays a box. */
:root:root[data-skin="8"] .wh .wg-l>.gt{flex-wrap:wrap;row-gap:0;padding:4px 0}
:root:root[data-skin="8"] .wh .wg-l>.gt b{white-space:nowrap}
:root:root[data-skin="8"] .wh .wg-l>.gt small{flex:1 0 100%;padding-inline-start:28px;line-height:1.45;padding-bottom:4px}
:root:root[data-skin="8"] .wh .wg-l>.gt.taskblink::before,:root:root[data-skin="8"] .wh .wg-l>.gt.glow::before,:root:root[data-skin="8"] .wh .wg-l>.gt.blink::before{position:static;inset:auto;width:18px;height:18px;background:none;filter:none;animation:none;z-index:auto}
`;

module.exports = { css, fonts: '' };
