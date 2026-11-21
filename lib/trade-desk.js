'use strict';
/*
  21.11.2026, Itzik: "adapted to the browser, behaves differently from the phone, the answers screen must not be long
  complicated rows, everything consistent with the monitor". The desktop browser version of a trade monitor.

  Scope, on purpose narrow: only a monitor whose instance.json has a known "trade" (lib/trades.js) gets any of this,
  and only at `(min-width:1000px) and (pointer:fine)`. Every rule below sits inside that one media query, so a phone, a
  tablet and a narrow window keep exactly their own layout. Any other monitor gets '' (like lib/trade-cards.js).

  What it does, all by restyling the page that is already there:
    rail     the real nav.bn becomes a vertical rail (same buttons, same handlers, same red dot and counters)
    day      the header and #tradeCards (the day ring, the microphone, today / what I did) are the left column
    work     the write box (#talkCard) on top, the rest of the home under it; the chat sheet docks beside the day
    answers  master/detail: one line rows on one side, the chosen answer as a document on the other. The rows are
             drawn from the cards renderAnswers already made (it is not touched); the chosen card stays in place
             and is shown as the document, so its buttons and its reply box keep working.
    keys     Space starts and stops the ring (it presses #tradeRing), arrows move between answers.
  The client part is a plain function put on the page with toString, like lib/trade-cards.js page().
*/
const trades = require('./trades.js');

const MQ = '(min-width:1000px) and (pointer:fine)';
const RAIL = 88, DAY = 460; // px; the work area is the rest

// All of it inside one media query. Tokens only (--ground, --surface, --ink, --dim, --line, --accent...): light and dark follow.
function rules() {
  const home = 'body:not(.offHome) .wrap';
  const ans = 'body.offHome .wrap:has(#pA:not([hidden]))';
  return [
    // ---- the page: a rail on the start side; on the home a fixed day column, then the work area ----
    '.wrap{max-width:none;margin:0;padding:26px 0 0;padding-inline-start:' + RAIL + 'px;min-height:100vh}',
    'body.offHome .wrap{padding-bottom:40px}',
    'body.offHome .wrap>*:not(.bn){max-width:860px;width:100%;margin-inline:auto;box-sizing:border-box}',
    home + '{padding-inline-start:calc(88px + var(--dkDay,460px));padding-bottom:0}',
    '.wrap{box-sizing:border-box}',
    home + '::before{content:"";position:fixed;top:var(--dkTop,0px);bottom:var(--dkBot,0px);inset-inline-start:calc(88px + var(--dkDay,460px) - 1px);width:1px;background:var(--line);pointer-events:none}',
    // the demo's green bar is fixed to the window's foot and its padding would add a scroll: the columns end above it instead
    'body{padding-bottom:0!important}',
    // ---- the rail: the real bottom navigation, standing up ----
    '.bn{inset:0 auto var(--dkBot,0px) auto;inset-inline-start:0;width:' + RAIL + 'px;height:auto;flex-direction:column;justify-content:flex-start;gap:4px;padding:92px 0 18px;border-top:0;border-inline-end:1px solid var(--line);background:var(--surface);-webkit-backdrop-filter:none;backdrop-filter:none}',
    'nav.bn::before{top:0;bottom:0;left:0;right:auto;width:2px;height:auto;background:linear-gradient(to bottom,var(--blue),var(--red),var(--yellow),var(--green))}',
    '.bn button{flex:none;width:100%;min-height:0;padding:12px 0;gap:5px;font-size:12.5px;font-weight:500;border-radius:0;transition:color .2s}',
    '.bn button:hover{color:var(--ink)}',
    '.bn button svg,.bn button[aria-pressed="true"] svg{width:26px;height:26px;padding:0;border:0;border-radius:0;background:none;box-shadow:none;stroke:currentColor;stroke-width:1.7}',
    '.bn button[aria-pressed="true"]{color:var(--accent);font-weight:700;background:linear-gradient(to left,var(--accent-soft),transparent 85%);box-shadow:none}',
    '.bn button[aria-pressed="true"] svg{color:var(--accent);stroke:var(--accent);stroke-width:1.9}',
    '.bn button[aria-pressed="true"]::before{content:"";position:absolute;inset-inline-start:0;top:8px;bottom:8px;width:3.5px;background:var(--accent);border-radius:0 3px 3px 0}',
    '[dir=rtl] .bn button[aria-pressed="true"]::before{border-radius:3px 0 0 3px}',
    '.bn button.hasnew svg{border:0}',
    '.bn .cnt{top:6px;inset-inline-end:auto;inset-inline-start:calc(50% + 6px)}',
    '.bn .dot{top:8px;inset-inline-end:auto;inset-inline-start:calc(50% + 8px)}',
    // ---- the day column ----
    // the header and the day: fixed to the window beside the rail, so the work area can scroll by itself
    home + '>.hd{position:fixed;inset-inline-start:' + RAIL + 'px;top:calc(var(--dkTop,0px) + 26px);width:var(--dkDay,460px);box-sizing:border-box;margin:0;padding:0 34px;flex-wrap:nowrap;z-index:2}',
    home + '>.hd .t{font-size:25px;line-height:1.2}',
    home + '>.hd .s{font-size:14px}',
    // the column does not scroll as a whole: the ring and the switch stay, only the list under them scrolls
    home + ' #tradeCards{position:fixed;inset-inline-start:' + RAIL + 'px;top:calc(var(--dkTop,0px) + 96px);bottom:var(--dkBot,0px);width:var(--dkDay,460px);margin:0;padding:6px 34px 16px;gap:10px;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column}',
    '#tradeCards .trList:not([hidden]){flex:1 1 0;min-height:70px;overflow-y:auto;overflow-x:hidden}',
    // the iPhone microphone help and the demo's WhatsApp sample are not for a desktop window
    '#trTry,#tradeWa{display:none!important}',
    '#tradeCards>*{flex:none}',
    // the ring follows the column's width and the height that is left (the demo's banner and bar are read, not guessed)
    'body #tradeRing{flex:none;width:clamp(170px,min(calc(var(--dkDay,460px) - 150px),calc(100vh - var(--dkTop,0px) - var(--dkBot,0px) - 406px)),296px)}',
    '#tradeCards .trStage{padding:10px 0 4px}',
    '#tradeCards .trHintRow{margin-top:2px}',
    '#tradeCards .trHint{font-size:15px;padding:8px 18px;margin-top:6px}',
    '#tradeCards .trRow{padding:13px 8px}#tradeCards .trRow .t{font-size:16.5px}#tradeCards .trRow .t small{font-size:13.5px}',
    '#deskKeys{text-align:center;color:var(--dim);font-size:13px;margin:-2px 0 4px}#deskKeys kbd{font:inherit;font-weight:700;color:var(--ink)}',
    // the side switch of the ring becomes a two part control above the list (the same toggle, see page())
    '#tradeCards:has(#deskSeg) #tradeSw{display:none}',
    '#deskSeg{display:flex;margin-top:4px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface)}',
    '#deskSeg button{all:unset;box-sizing:border-box;flex:1;text-align:center;padding:10px 0;font:500 15px Heebo,system-ui,sans-serif;color:var(--dim);cursor:pointer;transition:background .2s,color .2s}',
    '#deskSeg button+button{border-inline-start:1px solid var(--line)}',
    '#deskSeg button[aria-pressed="true"]{background:var(--accent-soft);color:var(--accent);font-weight:700}',
    '#deskSeg button:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}',
    // ---- the work area: the write box on top, the rest under it in a readable column (the page's normal flow) ----
    home + '>#fcRow{margin-inline:44px!important}',
    home + '>#reloadBtn{margin-inline:0 44px!important}',
    // the one box (it decides chat or task, lib/gemini-home.js) is the composer at the foot of the work area, the conversation above it
    home + '>#talkCard{position:fixed;z-index:3;left:44px;right:calc(88px + var(--dkDay,460px) + 44px);bottom:calc(var(--dkBot,0px) + 14px);max-width:880px;margin:0!important}',
    'body:not(.offHome) #talkCard .gMenu{top:auto!important;bottom:calc(100% + 6px)}',
    'body:not(.offHome) #fcSheet #fcForm{display:none!important}',
    // the work area is a column: the write box, one quiet row (עוד כלים, the leads tile, רענן), then the conversation docked under it
    home + '{display:flex;flex-wrap:wrap;align-content:flex-start;align-items:center}',
    home + '>#fcRow{flex:0 0 calc(100% - 88px)}',
    home + '>#pH{flex:1 1 0;min-width:0;margin-inline:44px 8px;max-width:none}',
    home + '>#pH.bare{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding-top:12px}',
    home + '>#pH.bare>:not(#tradeCards){max-width:none;margin:0!important}',
    home + '>#pH #leadAlert{flex:1 1 220px;margin:0}',
    home + '>#pH #leadAlert>#gLeads{min-height:46px!important;padding:6px 14px!important}',
    home + '>#pH #leadAlert>#gLeads>b{font-size:16px!important}',
    home + '>#pH #bareBtn{width:auto!important;padding:10px 22px!important;min-height:0!important}',
    home + '>#reloadBtn{flex:none;margin-top:12px!important}',
    home + '>#pH #approvalsBox{margin-top:14px}',
    // the chat sheet of the monitor opens over the whole window; here it sits in the work area, the day stays visible
    '#fcSheet.gFull{left:0!important;right:calc(88px + var(--dkDay,460px))!important;width:auto!important;inset-inline-start:auto}',
    '#fcSheet.gFull .ycard{max-width:720px!important}',
    // 22.11.2026: the appointments screen (lib/bookings-ui.js) is docked into the work area like the chat: the rail and the day column stay
    // visible, a readable column, its close button gives the docked conversation back. Its small sheets stay centred dialogs over the work area.
    '#bkSheet.ysheet{left:0!important;right:calc(88px + var(--dkDay,460px))!important;top:var(--dkTop,0px)!important;bottom:var(--dkBot,0px)!important;width:auto!important;height:auto!important;padding:0 44px!important;background:var(--ground)!important;align-items:flex-start!important;justify-content:center!important;overflow:auto}',
    '#bkSheet .ycard{max-width:720px!important;width:100%;max-height:none!important;min-height:100%;border-radius:0!important;box-shadow:none!important;margin:0 auto;padding-top:26px}',
    // (the monitor's sheets are full screen by default, lib/mic-colors.js: these two are dimmed dialogs over the work area)
    'html body #bkNew.ysheet,html body #bkLinkS.ysheet{background:color-mix(in srgb,var(--ink) 50%,transparent)!important;align-items:center!important;justify-content:center!important;padding:24px!important;left:0!important;right:calc(88px + var(--dkDay,460px))!important;top:var(--dkTop,0px)!important;bottom:var(--dkBot,0px)!important;width:auto!important;height:auto!important}',
    'html body #bkNew .ycard,html body #bkLinkS .ycard{max-width:480px!important;border-radius:18px!important;max-height:88vh;box-shadow:0 20px 60px color-mix(in srgb,var(--ink) 35%,transparent)}',
    // on the home the conversation is the permanent work area: under the row above, no close, no back, all of it kept
    'body:not(.offHome) #fcSheet.gFull{top:var(--dkChatTop,130px)!important;bottom:calc(var(--dkBot,0px) + var(--dkComp,90px) + 22px)!important;height:auto!important;padding:0 44px!important;justify-content:flex-start!important}',
    'body:not(.offHome) #fcSheet.gFull .ycard{max-width:880px!important;padding-inline:0!important}',
    'body:not(.offHome) #fcSheet.gFull .fcb{max-width:min(68ch,100%)!important}',
    'body:not(.offHome) #fcSheet.gFull .gTop,body:not(.offHome) #fcSheet .yx,body:not(.offHome) #fcSheet .ytopx{display:none!important}',
    // the answer is in the conversation under it: no second wait line or button in the write box
    'body:not(.offHome) #talkCard .mvSkel,body:not(.offHome) #talkCard #gBackChat{display:none!important}',
    'body.offHome #fcSheet[data-desk-auto]{display:none}',
    'body:not(.offHome):has(#pH:not(.bare)) #fcSheet[data-desk-auto]{display:none}',
    // the calm empty state (see page())
    '#fcSheet .fcEmpty{display:none}',
    '#deskEmpty{padding:5vh 0 0;text-align:start}',
    '#deskEmpty b{display:block;font:600 24px/1.3 Heebo,system-ui,sans-serif;color:var(--ink)}',
    '#deskEmpty p{margin:6px 0 14px;color:var(--dim);font-size:14.5px}',
    '#deskEmpty button{all:unset;box-sizing:border-box;display:block;width:100%;padding:13px 4px;border-bottom:1px solid var(--line);font:400 16.5px/1.5 Heebo,system-ui,sans-serif;color:var(--ink);cursor:pointer;transition:color .15s}',
    '#deskEmpty button:hover{color:var(--accent)}#deskEmpty button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}',
    // the ring centre: main's glossy dome, scaled with the bigger ring (14px at 214px is 6.5%)
    'body #tradeRing::before{inset:6.5%;box-shadow:inset 0 -16px 30px color-mix(in srgb,black 30%,transparent),inset 0 9px 16px color-mix(in srgb,white 30%,transparent),0 0 0 1px color-mix(in srgb,black 18%,transparent)}',
    // ---- a drag is not a selection: the chrome of the monitor cannot be selected, what is meant to be copied can ----
    'body:not(.offHome) .wrap,.bn,#fcSheet,#deskSplit{-webkit-user-select:none;user-select:none}',
    'body:not(.offHome) .wrap :is(input,textarea),#fcSheet :is(input,textarea),#fcSheet .fcb,#fcSheet .fcb *{-webkit-user-select:text;user-select:text}',
    'body.deskDragging,body.deskDragging *{-webkit-user-select:none!important;user-select:none!important;cursor:col-resize!important}',
    // ---- thin themed scrollbars ----
    '*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dim) 50%,transparent) transparent}',
    '::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dim) 50%,transparent);border-radius:4px}::-webkit-scrollbar-thumb:hover{background:var(--dim)}',
    // ---- the divider between the day and the work area ----
    '#deskSplit{position:fixed;z-index:60;top:var(--dkTop,0px);bottom:var(--dkBot,0px);inset-inline-start:calc(88px + var(--dkDay,460px) - 3px);width:6px;cursor:col-resize;touch-action:none;background:transparent;transition:background .15s}',
    '#deskSplit:hover,#deskSplit:focus-visible,body.deskDragging #deskSplit{background:color-mix(in srgb,var(--accent) 75%,transparent);outline:none}',
    'body.offHome #deskSplit{display:none}',
    // ---- arranging the home (the settings button סידור): inside the desktop layout, one box per block, nothing stacked ----
    'body.editing nav.bn{display:flex!important}',
    'body.editing #pH{transform:none!important;height:auto!important}',
    'body.editing #pH{display:flex;flex-direction:column;align-items:stretch;gap:12px;flex:1 1 100%}',
    // the conversation and the write box give way while arranging, the blocks get the work area
    'body.editing #talkCard,body.editing #fcSheet{display:none!important}',
    // each block keeps its own strip for its controls (grip, up, down on one side, minus on the other), so none lie on another
    'body.editing #pH>:not(#tradeCards):not(style):not(script){position:relative;min-height:54px;width:auto!important;max-width:none!important;margin:0!important;box-sizing:border-box;padding:46px 12px 10px!important}',
    'body.editing #pH>:is(button,.morebtn){display:flex;align-items:center;justify-content:center}',
    'body.editing #tradeCards>:is(.grip,.nudge,.minus){display:none}',
    'body.editing .editbox>*{animation:none!important;outline:1px dashed var(--accent);outline-offset:2px}',
    '.editbar{inset-inline:auto 0;inset-inline-start:calc(88px + var(--dkDay,460px));bottom:var(--dkBot,0px)}',
    // 21.11.2026 (QA 7): the other arranging mode (✎ הזזת אריחים, the tiles jiggle). The write box and the chat give way, as above, and its bar
    // stands in the work area, not across the day column and the rail. One סיום: the bar's (the button that opened the mode would be a second one).
    'body.tjig #talkCard,body.tjig #fcSheet{display:none!important}',
    'body.tjig #tileArr,body.tjig #tileArrTop{display:none!important}',
    '#tileBar{left:0;right:calc(88px + var(--dkDay,460px));bottom:var(--dkBot,0px)}',
    'body.tjig:not(.offHome) .wrap{padding-bottom:150px}',
    // ---- the answers: list on the start side, the chosen answer as a document ----
    ans + '{display:flex;flex-direction:column;height:calc(100vh - var(--dkTop,0px) - var(--dkBot,0px));overflow:hidden;padding:18px 0 0;padding-inline-start:' + RAIL + 'px}',
    ans + '>*:not(.bn){max-width:none;width:auto;margin-inline:0;padding-inline:0}',
    ans + '>#paneBar{padding-inline:28px}',
    '.bn button[aria-pressed="true"],.bn button[aria-pressed="true"].hasnew{color:var(--accent)!important}',
    ans + '>.hd{padding-inline:28px;margin:0 0 12px;flex:none}',
    ans + '>#pA{flex:1;min-height:0}',
    '#pA:not([hidden]){display:grid;grid-template-columns:440px minmax(0,1fr);grid-template-rows:auto auto auto auto auto minmax(0,1fr);padding:0;min-height:0;border-top:1px solid var(--line)}',
    '#pA>*{grid-column:1/-1}',
    '#pA>h2,#pA>#holdLine,#pA>#ansHelp,#pA>#aTip,#pA>#aChips,#pA>#aSearch{grid-column:1;margin-inline:28px}',
    '#pA>h2{margin-top:18px;font-size:22px}',
    '#pA>#aChips{margin-bottom:10px}',
    '#pA>#aSearch{width:calc(100% - 56px);box-sizing:border-box;margin-bottom:10px;padding:9px 14px}',
    '#pA>#deskList{grid-column:1;grid-row:6;min-height:0;overflow-y:auto;border-top:1px solid var(--line);border-inline-end:1px solid var(--line)}',
    '#pA>#ansBox{grid-column:2;grid-row:1/-1;min-height:0;overflow-y:auto;overflow-x:hidden}',
    '#deskList .deskRow{display:grid;grid-template-columns:12px minmax(0,1fr) auto;column-gap:14px;align-items:start;width:100%;box-sizing:border-box;text-align:start;padding:14px 28px 14px 22px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;cursor:pointer;position:relative;transition:background .15s}',
    '#deskList .deskRow:hover{background:color-mix(in srgb,var(--accent-soft) 45%,transparent)}',
    '#deskList .deskRow:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}',
    '#deskList .deskRow .d{width:11px;height:11px;border-radius:50%;margin-top:8px;background:var(--green)}',
    '#deskList .deskRow.fresh .d{background:var(--red)}#deskList .deskRow.back .d{background:var(--orange)}#deskList .deskRow.mine .d{background:var(--blue)}',
    '#deskList .deskRow .t,#deskList .deskRow .w{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#deskList .deskRow .t{font-size:16.5px;font-weight:500;line-height:1.4}',
    '#deskList .deskRow .w{color:var(--dim);font-size:13.5px;margin-top:2px}',
    '#deskList .deskRow .h{color:var(--dim);font-size:13px;margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '#deskList .deskRow.fresh .t{font-weight:700}#deskList .deskRow.fresh .h{color:var(--ink);font-weight:600}',
    '#deskList .deskRow.sel{background:var(--accent-soft)}',
    '#deskList .deskRow.sel::before{content:"";position:absolute;inset-inline-start:0;top:0;bottom:0;width:4px;background:var(--accent)}',
    '#deskList .deskMore{display:block;width:100%;padding:14px;border:0;background:transparent;color:var(--accent);font:600 15px Heebo,system-ui,sans-serif;cursor:pointer}',
    '#deskList .deskKeys{padding:16px 28px;color:var(--dim);font-size:13px}',
    '#ansBox>.ansc:not(.deskSel),#ansBox>button.ab,#ansBox>.ansUp{display:none}',
    '#ansBox>.ansc.deskSel{display:block;background:transparent;border:0;border-radius:0;box-shadow:none;margin:0;padding:30px 56px 44px;max-width:calc(68ch + 112px);box-sizing:border-box;line-height:1.75}',
    // the ring of an unread answer (lib/reply-pill.js) stays on its row's dot; the document itself is plain
    '#ansBox>.ansc.fresh.deskSel,#ansBox>.ansc.back.deskSel{border:0!important;background:transparent!important;box-shadow:none!important}',
    '#ansBox>.ansc.deskSel .achev{display:none}',
    '#ansBox>.ansc.deskSel>.w{font-size:14.5px;margin-bottom:14px}',
    '#ansBox>.ansc.deskSel .atxt{font-size:17px;line-height:1.75;-webkit-line-clamp:unset}',
    '#ansBox>.ansc.deskSel ul,#ansBox>.ansc.deskSel ol{margin:0 0 14px;padding-inline-start:1.5em;list-style-position:outside}',
    '#ansBox>.ansc.deskSel li{margin:0;padding-inline-start:.2em}',
    '#ansBox>.ansc.deskSel .arow{margin-top:26px;padding-top:18px;border-top:1px solid var(--line);gap:10px}',
    '#ansBox>.ansc.deskSel .arow .ab{padding:10px 20px;font-size:15px;border-radius:10px}',
    '#ansBox>.aempty{padding:40px 56px}',
    // ---- reduced motion and small heights ----
    '@media (max-height:760px){' + home + ' #tradeCards{padding-top:2px}#tradeCards .trRow{padding:9px 8px}#tradeCards .trStage{padding-top:4px}}',
    '@media (prefers-reduced-motion:reduce){#deskSeg button,#deskList .deskRow,.bn button,#deskEmpty button{transition:none}}',
  ].join('\n');
}

// The page side. Plain ES5, no closing script tag inside. Does nothing outside the media query, and follows it when the
// window is resized across it.
function page(MQ, DATA) {
  var mql; try { mql = window.matchMedia(MQ); } catch (e) { return; }
  var sel = 0, list = null, box = null, obs = null, raf = 0, segObs = null, ringObs = null;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function txt(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function typing(t) { return !!(t && t.closest && t.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]')); }
  // any window over the page: the monitor's sheets, its dialogs, the trade guide, the chat
  function overlay() {
    // (a sheet parked outside the window, like the monitor's own request sheet, is not open)
    var l = document.querySelectorAll('.ysheet,.fview,.trSheet,.ui-dlg-bg,#fcSheet,[role="dialog"],dialog[open]'), i, e, r, c;
    for (i = 0; i < l.length; i++) {
      e = l[i]; if (!e.isConnected || e.hidden) continue;
      if (e.id === 'fcSheet' && homeShown()) continue; // the docked conversation is the work area, not a window over it
      r = e.getBoundingClientRect(); c = getComputedStyle(e);
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth && c.visibility !== 'hidden' && c.display !== 'none' && c.opacity !== '0') return true;
    }
    return false;
  }
  function homeShown() { var h = $('pH'); return !!(h && !h.hidden && !document.body.classList.contains('offHome')); }
  function ansShown() { var a = $('pA'); return !!(a && !a.hidden); }

  // ---- home: a two part control for the side switch, and the keyboard hint ----
  function buildHome() {
    var w = $('tradeCards'), sw = $('tradeSw'); if (!w) return;
    var hintRow = w.querySelector('.trHintRow');
    if (hintRow && !$('deskKeys')) {
      var k = document.createElement('div'); k.id = 'deskKeys';
      k.innerHTML = '<kbd>רווח</kbd>: להקליט · <kbd>Enter</kbd>: לשלוח';
      hintRow.parentNode.insertBefore(k, hintRow.nextSibling);
    }
    var firstList = w.querySelector('.trList');
    if (sw && firstList && !$('deskSeg')) {
      var seg = document.createElement('div'); seg.id = 'deskSeg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'היום או מה עשיתי');
      var n = txt(sw.querySelector('i'));
      seg.innerHTML = '<button type="button" data-m="day">היום</button><button type="button" data-m="did">מה עשיתי' + (n ? ' (' + esc(n) + ')' : '') + '</button>';
      firstList.parentNode.insertBefore(seg, firstList);
      var paint = function () {
        var did = sw.getAttribute('aria-pressed') === 'true';
        seg.querySelector('[data-m="day"]').setAttribute('aria-pressed', did ? 'false' : 'true');
        seg.querySelector('[data-m="did"]').setAttribute('aria-pressed', did ? 'true' : 'false');
      };
      // the same toggle the round switch has: pressing it is what the page already does
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-m]'); if (!b) return;
        var did = sw.getAttribute('aria-pressed') === 'true';
        if ((b.getAttribute('data-m') === 'did') !== did) sw.click();
      });
      if (window.MutationObserver) { segObs = new MutationObserver(paint); segObs.observe(sw, { attributes: true, attributeFilter: ['aria-pressed'] }); }
      paint();
    }
    // the hand that marks "now" on the ring was placed for the phone's ring; move it to the ring's real size
    var ring = $('tradeRing'), now = $('tradeNow');
    if (ring && now && window.ResizeObserver && !ringObs) {
      var fix = function () { var s = now.style.transform || ''; var r = s.replace(/translate\(-2px,\s*-?[\d.]+px\)/, 'translate(-2px,' + Math.round(ring.offsetWidth / 2 - 21) + 'px)'); if (r !== s) now.style.transform = r; };
      ringObs = new ResizeObserver(fix); ringObs.observe(ring); fix();
    }
  }
  function unbuildHome() {
    ['deskKeys', 'deskSeg'].forEach(function (id) { var e = $(id); if (e) e.remove(); });
    if (segObs) { segObs.disconnect(); segObs = null; }
    if (ringObs) { ringObs.disconnect(); ringObs = null; }
  }

  // ---- answers: rows from the cards that renderAnswers made; the chosen card stays and is the document ----
  function cards() { return box ? Array.prototype.slice.call(box.querySelectorAll(':scope > .ansc')) : []; }
  function rowOf(c, i) {
    var w = c.querySelector(':scope > .w'), parts = txt(w).split(' · ');
    var body = c.querySelector(':scope > .atxt'), title = '';
    if (body) title = txt(body);
    else { var cl = c.cloneNode(true); Array.prototype.forEach.call(cl.querySelectorAll('.aq,.w,.arow,.rbox,.asaid,.achev,button,textarea'), function (e) { e.remove(); }); title = txt(cl); }
    var q = c.querySelector(':scope > .aq'), dim = '';
    if (q) { var ql = q.querySelector('.qline,.qfold summary'); dim = txt(ql); }
    if (!dim) dim = parts[0] || '';
    var stamp = parts[1] || '', m = stamp.match(/\d{1,2}:\d{2}/);
    var cls = c.classList.contains('fresh') ? 'fresh' : c.classList.contains('back') ? 'back' : c.classList.contains('mine') ? 'mine' : 'done';
    return { cls: cls, title: title.slice(0, 140) || 'תשובה', dim: dim.slice(0, 140), time: m ? m[0] : stamp };
  }
  function sync() {
    raf = 0;
    if (!mql.matches || !ansShown()) return;
    box = $('ansBox'); var pa = $('pA'); if (!box || !pa) return;
    var cs = cards();
    if (sel >= cs.length) sel = cs.length - 1; if (sel < 0) sel = 0;
    if (!list) { list = document.createElement('div'); list.id = 'deskList'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'רשימת התשובות'); pa.insertBefore(list, box);
      list.addEventListener('click', function (e) {
        var b = e.target.closest('.deskRow'); if (b) { choose(+b.getAttribute('data-i'), true); return; }
        if (e.target.closest('.deskMore')) { var m = box.querySelector(':scope > button.ab'); if (m) m.click(); }
      });
    }
    var html = cs.map(function (c, i) {
      var r = rowOf(c, i);
      return '<button type="button" class="deskRow ' + r.cls + (i === sel ? ' sel' : '') + '" role="option" aria-selected="' + (i === sel) + '" data-i="' + i + '"><i class="d"></i><span><span class="t">' + esc(r.title) + '</span><span class="w">' + esc(r.dim) + '</span></span><span class="h">' + esc(r.time) + '</span></button>';
    }).join('');
    if (box.querySelector(':scope > button.ab')) html += '<button type="button" class="deskMore">להציג עוד</button>';
    if (cs.length) html += '<div class="deskKeys">חצים למעלה ולמטה: מעבר בין תשובות</div>';
    if (list.getAttribute('data-h') !== html) { list.innerHTML = html; list.setAttribute('data-h', html); }
    cs.forEach(function (c, i) {
      var want = i === sel;
      if (c.classList.contains('deskSel') !== want) c.classList.toggle('deskSel', want);
      if (want && c.classList.contains('acol')) c.classList.remove('acol');
    });
  }
  function later() { if (!raf) raf = window.requestAnimationFrame(sync); }
  function choose(i, focusRow) {
    var cs = cards(); if (!cs.length) return;
    sel = Math.max(0, Math.min(cs.length - 1, i));
    sync();
    if (box) box.scrollTop = 0;
    var r = list && list.querySelector('.deskRow[data-i="' + sel + '"]');
    if (r) { r.scrollIntoView({ block: 'nearest' }); if (focusRow || document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('deskRow')) r.focus({ preventScroll: true }); }
  }
  function buildAnswers() {
    box = $('ansBox'); if (!box) return;
    if (!obs && window.MutationObserver) { obs = new MutationObserver(later); obs.observe(box, { childList: true, attributes: true, subtree: true, attributeFilter: ['class'] }); }
    var pa = $('pA'); if (pa && window.MutationObserver && !pa._deskObs) { pa._deskObs = new MutationObserver(later); pa._deskObs.observe(pa, { attributes: true, attributeFilter: ['hidden'] }); }
    later();
  }
  function unbuildAnswers() {
    if (obs) { obs.disconnect(); obs = null; }
    var pa = $('pA'); if (pa && pa._deskObs) { pa._deskObs.disconnect(); pa._deskObs = null; }
    if (list) { list.remove(); list = null; }
    cards().forEach(function (c) { c.classList.remove('deskSel'); });
  }

  // ---- keys ----
  function onKey(e) {
    if (!mql.matches || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    var t = e.target;
    if (e.key === 'Escape' && document.body.classList.contains('editing')) { var ed = $('editDone'); if (ed) { e.preventDefault(); ed.click(); } return; }
    if (e.key === 'Escape' && document.body.classList.contains('tjig')) { var td = $('tileDone'); if (td) { e.preventDefault(); td.click(); } return; }
    // Enter sends the write box (it was a new line); Shift+Enter keeps the new line. The same submit the button makes.
    if (e.key === 'Enter' && !e.shiftKey && t && t.id === 'quickText') {
      var f = $('quickForm');
      if (f && String(t.value || '').trim()) { e.preventDefault(); if (f.requestSubmit) f.requestSubmit(); else { var qb = $('quickBtn'); if (qb) qb.click(); } }
      return;
    }
    if (e.key === ' ' || e.code === 'Space') {
      // not while typing, not on a control that Space already presses, not with a window open: then it is the ring
      if (e.repeat || typing(t) || (t && t.closest && t.closest('button,a,summary,[role="button"],[role="option"],[role="tab"]'))) return;
      if (!homeShown() || overlay()) return;
      var ring = $('tradeRing'); if (!ring) return;
      e.preventDefault(); ring.click();
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && ansShown() && !e.shiftKey) {
      if (typing(t) || overlay() || !list) return;
      e.preventDefault(); choose(sel + (e.key === 'ArrowDown' ? 1 : -1), false);
    }
  }

  // the public demo has a ribbon above the page; the columns end where the window ends
  // the demo has a ribbon above the page and a green bar fixed under it; the columns sit between them, by their real heights
  function rib() {
    var r = $('demoRib'), w = $('demoWa'), st = document.documentElement.style, on = mql.matches;
    st.setProperty('--dkTop', (r && r.isConnected && on ? r.offsetHeight : 0) + 'px');
    st.setProperty('--dkBot', (w && w.isConnected && on && getComputedStyle(w).display !== 'none' && !w.classList.contains('mini') ? w.offsetHeight : 0) + 'px');
  }
  // ---- the divider: the width of the day column, kept on this browser ----
  var DEF = 460, MIN = 340, MAX = 560, KEY = 'trDeskW';
  function curW() { return parseInt(document.documentElement.style.getPropertyValue('--dkDay'), 10) || DEF; }
  function setDay(w, save) {
    w = Math.max(MIN, Math.min(MAX, Math.round(w)));
    document.documentElement.style.setProperty('--dkDay', w + 'px');
    var s = $('deskSplit'); if (s) s.setAttribute('aria-valuenow', String(w));
    if (save) { try { if (w === DEF) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(w)); } catch (e) {} }
    return w;
  }
  function buildSplit() {
    var v = 0; try { v = parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (e) {}
    setDay(v || DEF, false);
    if ($('deskSplit')) return;
    var s = document.createElement('div'); s.id = 'deskSplit'; s.tabIndex = 0;
    s.setAttribute('role', 'separator'); s.setAttribute('aria-orientation', 'vertical'); s.setAttribute('aria-label', 'רוחב הטור היומי');
    s.setAttribute('aria-valuemin', String(MIN)); s.setAttribute('aria-valuemax', String(MAX)); s.setAttribute('aria-valuenow', String(curW()));
    document.body.appendChild(s);
    var drag = false;
    s.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return; drag = true; try { s.setPointerCapture(e.pointerId); } catch (x) {}
      document.body.classList.add('deskDragging'); e.preventDefault();
    });
    s.addEventListener('pointermove', function (e) { if (drag) { setDay(document.documentElement.clientWidth - e.clientX - 88, false); place(); } });
    function up() { if (!drag) return; drag = false; document.body.classList.remove('deskDragging'); setDay(curW(), true); place(); }
    s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up);
    // the day is on the right: the boundary moves left to widen it
    s.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : 0; if (!d) return;
      e.preventDefault(); setDay(curW() + d, true); place();
    });
    s.addEventListener('dblclick', function () { setDay(DEF, true); place(); });
  }
  // 21.11.2026 (QA 7): arranging from the settings (סידור) shows every block of the home, also when the home is folded on "עוד כלים"
  // (the folded home hid all but one block, so the mode looked empty); the fold comes back when the mode ends.
  var wasBare = null, arrObs = null;
  function arrWatch() {
    if (arrObs || !window.MutationObserver) return;
    arrObs = new MutationObserver(function () {
      var on = document.body.classList.contains('editing') && mql.matches, h = $('pH'); if (!h) return;
      if (on && wasBare === null) { wasBare = h.classList.contains('bare'); h.classList.remove('bare'); }
      else if (!on && wasBare !== null) { if (wasBare) h.classList.add('bare'); wasBare = null; }
    });
    arrObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  // a mouse press and hold, or a drag, on the home blocks must not start the phone's arranging mode (its explicit button is in the settings)
  document.addEventListener('pointerdown', function (e) {
    if (!mql.matches || e.pointerType !== 'mouse' || window.editing || window.tEdit) return;
    var t = e.target; if (t && t.closest && t.closest('#pH')) e.stopImmediatePropagation();
  }, true);
  // ---- the conversation as the work area of the home ----
  var tries = 0, reopens = [];
  function place() {
    var t = 0;
    var tc = $('talkCard'); if (tc && tc.offsetHeight) document.documentElement.style.setProperty('--dkComp', tc.offsetHeight + 'px');
    ['pH', 'reloadBtn'].forEach(function (id) { var e = $(id); if (e && e.offsetParent !== null) { var r = e.getBoundingClientRect(); if (r.height > 0 && r.bottom > t) t = r.bottom; } });
    if (t) document.documentElement.style.setProperty('--dkChatTop', Math.round(t + 12) + 'px');
  }
  function ensureChat() {
    if (!mql.matches || !homeShown() || $('fcSheet')) return;
    var row = $('fcRow'); if (!row || row.hidden) return;
    // the monitor wraps fcSheet (dressed full screen) a moment after load; wait for that, then open it as the page itself does
    if (typeof window.fcSheet !== 'function' || !window.fcSheet.gW) { if (tries++ < 20) setTimeout(ensureChat, 400); return; }
    var now = Date.now(); reopens = reopens.filter(function (t) { return now - t < 10000; }); if (reopens.length > 4) return; reopens.push(now);
    try { if (window.fcS) window.fcS.inl = false; window.fcSheet(); } catch (e) { return; }
    var s = $('fcSheet'); if (s) s.setAttribute('data-desk-auto', '1');
    place();
  }
  function addEmpty() {
    var m = $('fcMsgs'); if (!m || !mql.matches || !DATA) return;
    var e = m.querySelector('.fcEmpty'); if (!e || m.querySelector('#deskEmpty')) return;
    var d = document.createElement('div'); d.id = 'deskEmpty';
    d.innerHTML = '<b>' + esc(DATA.hello) + '</b><p>' + esc(DATA.hint) + '</p>' + DATA.prompts.map(function (p, i) { return '<button type="button" data-i="' + i + '">' + esc(p) + '</button>'; }).join('');
    d.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-i]'); if (!b) return;
      var t = $('quickText') || $('fcText'); if (!t) return;
      t.value = DATA.prompts[+b.getAttribute('data-i')]; t.dispatchEvent(new Event('input', { bubbles: true })); t.focus();
    });
    e.parentNode.insertBefore(d, e);
  }
  var chatObs = null, hooked = null;
  function watchChat() {
    var m = $('fcMsgs');
    if (m && m !== hooked && window.MutationObserver) { hooked = m; if (chatObs) chatObs.disconnect(); chatObs = new MutationObserver(addEmpty); chatObs.observe(m, { childList: true }); addEmpty(); }
    if (!$('fcSheet') && homeShown()) setTimeout(ensureChat, 300);
  }
  function startChat() {
    if (window.MutationObserver) { new MutationObserver(watchChat).observe(document.body, { childList: true }); var h = $('pH'); if (h) new MutationObserver(function () { setTimeout(ensureChat, 100); }).observe(h, { attributes: true, attributeFilter: ['hidden'] }); }
    setInterval(function () { if (mql.matches) place(); }, 700); window.addEventListener('resize', place);
    ensureChat(); watchChat();
  }
  function apply() {
    rib();
    if (mql.matches) { buildSplit(); buildHome(); buildAnswers(); ensureChat(); }
    else { var sp = $('deskSplit'); if (sp) sp.remove(); document.documentElement.style.removeProperty('--dkDay'); unbuildHome(); unbuildAnswers(); }
  }
  document.addEventListener('keydown', onKey);
  arrWatch();
  var started = false; function boot() { if (started) return; started = true; startChat(); }
  if (window.PUBLIC_DEMO) { setInterval(rib, 1000); window.addEventListener('resize', rib); }
  if (mql.addEventListener) mql.addEventListener('change', apply); else if (mql.addListener) mql.addListener(apply);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); boot(); }); else { apply(); boot(); }
}

// The empty conversation: one line in the monitor's voice and three examples (lib/trades.js ask), plain lines that fill the box.
function emptyState(t, fem) {
  const ask = (fem && Array.isArray(t.askF) ? t.askF : t.ask) || [];
  return {
    hello: 'מה לעשות בשבילך היום?',
    hint: fem ? 'לחצי על שורה כדי להתחיל, או כתבי בתיבה.' : 'לחץ על שורה כדי להתחיל, או כתוב בתיבה.',
    prompts: ask.slice(0, 3),
  };
}

function html(inst) {
  const t = inst && trades.get(inst.trade);
  if (!t || !inst.dataPath) return '';
  const js = '<script>(' + page.toString() + ')(' + JSON.stringify(MQ) + ',' + JSON.stringify(emptyState(t, inst.gender === 'f')).replace(/</g, '\\u003c') + ');</script>';
  return '<style>@media ' + MQ + '{\n' + rules() + '\n}</style>' + js;
}

module.exports = { MQ, rules, page, html, emptyState };
