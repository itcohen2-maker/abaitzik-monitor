// 26.10.2026: the world 7 עיתון (newspaper), see plans/2026-10-26-three-worlds.md.
// Look taken from the approved reference, section #p in docs/new-look.html. Every rule is
// scoped under :root[data-skin="7"]; the colours are tokens so the night versions follow.
const css = `
/* Tokens. The doubled :root is on purpose: it beats the dark block of build.js. */
:root:root[data-skin="7"]{--np-paper:#f1ebdd;--np-ink:#16130f;--np-dim:#3b352c;--np-red:#c1121f;--np-on-red:#fff;--np-leader:#8a8170;
 color-scheme:light;
 --ground:var(--np-paper);--surface:var(--np-paper);--sunk:var(--np-paper);--ink:var(--np-ink);--dim:var(--np-dim);
 --line:var(--np-ink);--accent:var(--np-red);--accent-soft:var(--np-paper);--on-accent:var(--np-on-red);
 --chip:var(--np-paper);--chip-ink:var(--np-ink);--shadow:none;--r:0px;--red:var(--np-red);--blue:var(--np-ink);
 --green:var(--np-ink);--wait:var(--np-red);--fresh:var(--np-paper);--unread:var(--np-paper);
 --warn-soft:var(--np-paper);--warn-ink:var(--np-ink)}
:root[data-skin="7"][data-theme="dark"]{--np-paper:#14120f;--np-ink:#efe7d6;--np-dim:#b8ad98;--np-red:#ff5a4f;--np-on-red:#14120f;--np-leader:#7d7568;color-scheme:dark}
@media (prefers-color-scheme:dark){:root[data-skin="7"]:not([data-theme="light"]){--np-paper:#14120f;--np-ink:#efe7d6;--np-dim:#b8ad98;--np-red:#ff5a4f;--np-on-red:#14120f;--np-leader:#7d7568;color-scheme:dark}}

:root[data-skin="7"] body{background:var(--np-paper);color:var(--np-ink);background-image:none;font:400 17px/1.5 'David Libre',serif}
:root[data-skin="7"] ::selection{background:var(--np-red);color:var(--np-on-red)}
:root[data-skin="7"] #pH{padding-top:0}

/* Header: a thin masthead line, no avatar. */
:root[data-skin="7"] .hd{border-bottom:1px solid var(--np-ink);padding:6px 0 8px;margin-bottom:10px;align-items:flex-end}
:root[data-skin="7"] .hd .t{font:900 22px/1.1 'Frank Ruhl Libre',serif;color:var(--np-ink)}
:root[data-skin="7"] .hd .s{font:400 13px/1.3 'David Libre',serif;color:var(--np-dim)}
:root[data-skin="7"] .ava{display:none}
:root[data-skin="7"] .conn{background:none;box-shadow:none;border:0;border-radius:0;color:var(--np-red);font:700 16px 'David Libre',serif;min-height:44px;padding:0 6px;text-decoration:underline}

/* Voice card: flat, a rule under it, red microphone with a white icon. */
:root[data-skin="7"] .talk{background:none;border:0;border-bottom:1px solid var(--np-ink);border-radius:0;box-shadow:none;padding:12px 0;margin-bottom:0}
:root[data-skin="7"] .mic{width:76px;height:76px;flex:0 0 76px;border:0;border-radius:50%;background:var(--np-red);box-shadow:none}
:root[data-skin="7"] .mic:before{display:none}
:root[data-skin="7"] .mic svg{width:32px;height:32px;stroke:var(--np-on-red)}
:root[data-skin="7"] .mic svg rect{fill:var(--np-on-red)}
:root[data-skin="7"] .mic.on{animation:none;outline:3px solid var(--np-ink);outline-offset:2px}
:root[data-skin="7"] .vtxt b{font:900 20px/1.2 'Frank Ruhl Libre',serif;color:var(--np-ink)}
:root[data-skin="7"] .vtxt small{font:400 15px/1.4 'David Libre',serif;color:var(--np-dim)}
:root[data-skin="7"] .way{background:none;border:1.5px solid var(--np-ink);border-radius:0;min-height:44px;padding:8px 6px}
:root[data-skin="7"] .way b{font:900 16px 'Frank Ruhl Libre',serif;color:var(--np-ink)}
:root[data-skin="7"] .way small{font:400 13px 'David Libre',serif;color:var(--np-dim)}
:root[data-skin="7"] .firsthint{background:none;border-bottom:1px solid var(--np-ink);border-radius:0;padding:6px 0}
:root[data-skin="7"] .firsthint button{border-radius:0;background:var(--np-ink);color:var(--np-paper)}
:root[data-skin="7"] textarea,
:root[data-skin="7"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]){background:var(--np-paper);color:var(--np-ink);border:1.5px solid var(--np-ink);border-radius:0;font:400 17px 'David Libre',serif}
:root[data-skin="7"] .quickwrite button{background:var(--np-ink);color:var(--np-paper);border:0;border-radius:0;min-height:44px;padding:0 18px;font:700 16px 'David Libre',serif}
:root[data-skin="7"] .reloadbig{width:100%;min-width:0;height:44px;margin:0 0 14px;padding:0 12px;border:1.5px solid var(--np-ink);border-radius:0;background:none;color:var(--np-ink);justify-content:center;box-shadow:none}
:root[data-skin="7"] .reloadbig .rlw{font:700 15px 'David Libre',serif}
:root[data-skin="7"] .reloadbig.hasupd{background:none;border-color:var(--np-red);color:var(--np-red);animation:none}

/* Panels that were cards: flat, rules only. */
:root[data-skin="7"] .apv,:root[data-skin="7"] .hk,:root[data-skin="7"] .hb,:root[data-skin="7"] .alerts,
:root[data-skin="7"] .sent,:root[data-skin="7"] .whatsnew,:root[data-skin="7"] .hm-money,:root[data-skin="7"] .dz-box{background:none;border:0;border-radius:0;box-shadow:none;border-bottom:1px solid var(--np-ink);color:var(--np-ink)}
:root[data-skin="7"] .hb-list li{border-color:var(--np-ink)}
:root[data-skin="7"] .hb-act{border-radius:0;background:none;color:var(--np-ink);border:1px solid var(--np-ink)}
:root[data-skin="7"] .hk-v{font-family:'Frank Ruhl Libre',serif;font-weight:900}

/* Masthead: the greeting. A thin rule above, a 3px double rule below, the small line on top. */
:root[data-skin="7"] #hmGreet{display:block;text-align:center;font:900 52px/1 'Frank Ruhl Libre',serif;color:var(--np-ink);margin:8px 0 14px;padding:8px 0 10px;border-top:1px solid var(--np-ink);border-bottom:3px double var(--np-ink)}
:root[data-skin="7"] #hmGreet[hidden]{display:none}
:root[data-skin="7"] #hmGreet::before{content:"מהדורת בוקר";display:block;font:500 12px/1.2 'David Libre',serif;color:var(--np-dim);margin-bottom:6px}

/* Lead headline: no card, a rule under it, the unread count in red before the title. */
:root[data-skin="7"] #newBlock{display:block;margin:0 0 6px;gap:0}
:root[data-skin="7"] #newBlock .newbtn{display:flex;align-items:baseline;gap:12px;width:100%;height:auto;margin:0;padding:14px 0 12px;min-height:44px;border:0;border-bottom:1px solid var(--np-ink);border-radius:0;background:none;box-shadow:none;color:var(--np-ink);text-align:start;font-family:'David Libre',serif;animation:none}
:root[data-skin="7"] #newBlock .newbtn .nb-l{flex:1;min-width:0;display:block}
:root[data-skin="7"] #newBlock .newbtn .nb-l b{display:block;font:900 30px/1.1 'Frank Ruhl Libre',serif;color:var(--np-ink);overflow-wrap:anywhere}
:root[data-skin="7"] #newBlock .newbtn .nb-l small{display:block;font:400 16px/1.4 'David Libre',serif;color:var(--np-dim);overflow-wrap:anywhere}
:root[data-skin="7"] #newBlock .newbtn .nb-c{order:-1;display:block;min-width:0;height:auto;padding:0;border:0;border-radius:0;background:none;box-shadow:none;color:var(--np-red);font:900 44px/1 'Frank Ruhl Libre',serif;animation:none}
:root[data-skin="7"] #newBlock .newbtn.hot b{font-size:30px}
/* The second row: one plain line with a rule. */
:root[data-skin="7"] #newBlock .newbtn.got{padding:9px 0 8px;min-height:44px}
:root[data-skin="7"] #newBlock .newbtn.got .nb-l{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
:root[data-skin="7"] #newBlock .newbtn.got .nb-l b{display:inline;font:700 17px/1.3 'Frank Ruhl Libre',serif;color:var(--np-ink)}
:root[data-skin="7"] #newBlock .newbtn.got .nb-l small{display:inline;font:400 15px/1.3 'David Libre',serif;color:var(--np-dim)}
:root[data-skin="7"] #newBlock .newbtn.got .nb-c{font:900 17px/1.3 'Frank Ruhl Libre',serif;color:var(--np-ink)}
:root[data-skin="7"] #newBlock .newbtn.got .nb-c.zero{opacity:1}
:root[data-skin="7"] #bareBtn.morebtn{background:none;border:0;border-bottom:1px solid var(--np-ink);border-radius:0;color:var(--np-ink);font:700 15px 'David Libre',serif;min-height:44px;padding:10px 0;text-align:center}

/* The world: the groups. */
:root[data-skin="7"] #worldHome .wg{margin:0}
:root[data-skin="7"] #worldHome .wg-h{margin:22px 0 6px;padding-bottom:4px;font:900 20px/1.2 'Frank Ruhl Libre',serif;color:var(--np-ink);border-bottom:3px double var(--np-ink)}
:root[data-skin="7"] #worldHome details.wg>summary.wg-h{list-style:none;display:flex;justify-content:space-between;align-items:baseline;cursor:pointer}
:root[data-skin="7"] #worldHome details.wg>summary.wg-h::-webkit-details-marker{display:none}
:root[data-skin="7"] #worldHome details.wg>summary.wg-h::after{content:"◂";font:700 16px 'David Libre',serif;color:var(--np-ink)}
:root[data-skin="7"] #worldHome details.wg[open]>summary.wg-h::after{content:"▾"}
:root[data-skin="7"] #worldHome .wg-l{display:block}

/* Index rows: name, dotted leader, the small subtitle at the far end. */
:root[data-skin="7"] #worldHome .wg-l>.gt,
:root[data-skin="7"] #worldHome .wg-l>.ic{display:flex;flex-direction:row;align-items:baseline;justify-content:flex-start;gap:6px;width:100%;min-height:44px;margin:0;padding:9px 0;border:0;border-radius:0;background:none;box-shadow:none;color:var(--np-ink);font:500 17px/1.3 'David Libre',serif;text-align:start;text-shadow:none;min-width:0;transition:none}
:root[data-skin="7"] #worldHome .wg-l>.gt:active,
:root[data-skin="7"] #worldHome .wg-l>.ic:active{transform:none;filter:none;box-shadow:none;background:none;opacity:.6}
:root[data-skin="7"] #worldHome .wg-l>.gt b{display:inline;order:0;font:500 17px/1.3 'David Libre',serif;color:var(--np-ink);min-width:0;overflow-wrap:anywhere}
:root[data-skin="7"] #worldHome .wg-l>.gt small{display:block;order:2;flex:0 1 auto;font:700 13px/1.3 'David Libre',serif;color:var(--np-dim);opacity:1;text-shadow:none;text-align:end;max-width:55%}
:root[data-skin="7"] #worldHome .wg-l>.gt::after,
:root[data-skin="7"] #worldHome .wg-l>.ic::after{content:"";position:static;inset:auto;z-index:auto;background:none;flex:1 1 16px;order:1;align-self:center;height:0;min-width:12px;border-bottom:2px dotted var(--np-leader);transform:translateY(-4px)}
:root[data-skin="7"] #worldHome .wg-l>.ic .c{display:none}
:root[data-skin="7"] #worldHome .wg-l>.ic svg{display:none}
:root[data-skin="7"] #worldHome .wg-l>.ic .icN{position:static;order:2;background:none;border:0;box-shadow:none;color:var(--np-red);font:700 14px 'David Libre',serif;min-width:0;padding:0}

/* Updated: a three column block with rules between the columns. */
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l>.gt,
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l>.ic{display:block;min-height:0;padding:10px;border-inline-start:1px solid var(--np-ink)}
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l>:nth-child(3n+1){border-inline-start:0;padding-inline-start:0}
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l>:nth-child(3n){padding-inline-end:0}
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l>.gt::after,
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l>.ic::after{display:none}
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l>.gt b{display:block;font:900 17px/1.2 'Frank Ruhl Libre',serif;color:var(--np-ink)}
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l>.gt small{display:block;margin-top:4px;text-align:start;max-width:none;font:400 14px/1.4 'David Libre',serif;color:var(--np-dim)}
:root[data-skin="7"] #worldHome .wg[data-g="upd"] .wg-l>.ic{font:900 17px/1.2 'Frank Ruhl Libre',serif}

/* Blink classes: no animation. The item's text goes red and a small red dot leads it. */
:root[data-skin="7"] .taskblink,:root[data-skin="7"] .updblink,
:root[data-skin="7"] .gt.taskblink::before,:root[data-skin="7"] .gt.updblink::before,
:root[data-skin="7"] .ic.taskblink::before,:root[data-skin="7"] .ic.updblink::before{animation:none!important}
:root[data-skin="7"] .gt.taskblink b,:root[data-skin="7"] .gt.updblink b,
:root[data-skin="7"] .newbtn.updblink b,:root[data-skin="7"] .newbtn.taskblink b,
:root[data-skin="7"] .ic.taskblink,:root[data-skin="7"] .ic.updblink{color:var(--np-red)}
:root[data-skin="7"] .gt.taskblink::before,:root[data-skin="7"] .gt.updblink::before,
:root[data-skin="7"] .ic.taskblink::before,:root[data-skin="7"] .ic.updblink::before{content:"";position:static;inset:auto;z-index:auto;display:inline-block;vertical-align:middle;flex:0 0 7px;width:7px;height:7px;margin-inline-end:6px;border-radius:50%;background:var(--np-red);background-image:none;filter:none;order:-1;align-self:center}

/* Bottom nav: a paper strip, a double rule over it, text tabs. */
:root[data-skin="7"] .bn{background:var(--np-paper);-webkit-backdrop-filter:none;backdrop-filter:none;border-top:3px double var(--np-ink);padding:4px 4px calc(4px + env(safe-area-inset-bottom))}
:root[data-skin="7"] .bn button{background:none;border:0;border-radius:0;box-shadow:none;color:var(--np-ink);font:700 15px/1.2 'David Libre',serif;min-height:44px;padding:10px 2px;gap:0}
:root[data-skin="7"] .bn button svg{display:none}
:root[data-skin="7"] .bn button[aria-pressed="true"]{background:none;box-shadow:none;border-radius:0;color:var(--np-red);text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:6px}
:root[data-skin="7"] .bn button.hasnew{color:var(--np-red);animation:none}
:root[data-skin="7"] .bn button.hasnew svg,:root[data-skin="7"] .bn button.blink{animation:none}
:root[data-skin="7"] .bn .cnt{background:none;color:var(--np-red);min-width:0;height:auto;font:900 13px 'Frank Ruhl Libre',serif;box-shadow:none;border:0}
:root[data-skin="7"] .bn .cnt.zero{background:none;color:var(--np-dim)}
:root[data-skin="7"] .stamp{color:var(--np-dim);font:400 13px 'David Libre',serif}

@media (prefers-reduced-motion:reduce){
 :root[data-skin="7"] *,:root[data-skin="7"] *::before,:root[data-skin="7"] *::after{animation:none!important;transition:none!important}
}
`;

module.exports = { css, fonts: '' };
