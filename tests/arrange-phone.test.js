'use strict';
// 21.11.2026: arranging the home on a phone (build.js: armDrag, addHandles, fitEdit, the editBar and the "arranging on a phone" CSS).
// The mode used to scale the whole board to a miniature (controls 13px wide, overlapping each other) and showed two bars with the
// same instruction. These pin what replaced it. The behaviour itself (real touch, measured sizes) is checked in a browser; here the
// page source is checked.
process.env.MONITOR_NO_GATE = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPage } = require('../build.js');
// the smallest payload build() could hand the page (the same as tests/page.test.js)
function fixture() {
  return { now: null, openCmds: [], builtAt: '2026-09-10T16:00:00.000Z', counts: { pending: 0, replied: 0, today: 0, leads: 0 }, choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [] };
}

const html = renderPage(fixture({}));
const DESK_MQ = '(min-width:1000px) and (pointer:fine)';
const PHONE_MQ = 'not all and ' + DESK_MQ;

// the CSS block that starts at the phone media query and ends where its braces close
function phoneCss() {
  const at = html.indexOf('@media ' + PHONE_MQ + '{');
  assert.ok(at > 0, 'the phone arranging media query');
  let depth = 0;
  for (let i = at; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) return html.slice(at, i + 1); }
  }
  throw new Error('unbalanced');
}
function fnBody(name) {
  const at = html.indexOf('function ' + name + '(');
  assert.ok(at > 0, name);
  return html.slice(at, at + 2500);
}

test('the phone arranging CSS is the exact opposite of the desktop query, so the trade desktop keeps its own', () => {
  const css = phoneCss();
  assert.ok(css.startsWith('@media not all and (min-width:1000px) and (pointer:fine){'));
  // trade-desk.js styles its own version inside DESK_MQ, and nothing of it changed
  const td = require('../lib/trade-desk.js').html({ trade: 'gypsum', dataPath: '/tmp/none' });
  assert.ok(td.includes('@media ' + DESK_MQ + '{'));
  assert.ok(td.includes('body.editing #pH{transform:none!important;height:auto!important}'));
  assert.ok(td.includes('body.editing .editbox>*{animation:none!important;outline:1px dashed var(--accent);outline-offset:2px}'));
});

test('every control is at least 40px (44) and the mode never scales the board on a phone', () => {
  const css = phoneCss();
  const rule = css.match(/body\.editing #pH>\.arrRow :is\(\.grip,\.nudge,\.minus\)\{([^}]*)\}/);
  assert.ok(rule, 'the control size rule');
  const w = Number((rule[1].match(/(?:^|[;\s])width:(\d+)px/) || [])[1]);
  const h = Number((rule[1].match(/(?:^|[;\s])height:(\d+)px/) || [])[1]);
  assert.ok(w >= 40 && h >= 40, 'hit area ' + w + 'x' + h);
  assert.ok(/flex:0 0 4[4-9]px/.test(rule[1]), 'and it is not shrunk by the flex row');
  assert.ok(!/scale\(/.test(css), 'no scaling anywhere in the phone block');
  assert.ok(!/transform:(?!none)/.test(css.replace(/animation[^;}]*/g, '')), 'no transform in the phone block');
  // fitEdit leaves a phone at scale 1 and only the desktop path scales
  const fit = fnBody('fitEdit');
  assert.ok(fit.indexOf('if(arrPhone())return;') > 0);
  assert.ok(fit.indexOf('if(arrPhone())return;') < fit.indexOf("'scale('"), 'the phone returns before the scale');
  assert.ok(html.includes('function arrPhone(){'));
  assert.ok(html.includes("window.matchMedia('" + PHONE_MQ + "')"), 'JS and CSS ask the same question');
});

test('every block is a row with its own name, its controls inside it, and the row does not scroll away from them', () => {
  const css = phoneCss();
  assert.ok(css.includes('body.editing #pH>.arrRow{display:flex!important;'));
  assert.ok(css.includes('position:static!important;inset:auto!important'), 'controls are in the row, not floating');
  assert.ok(css.includes('touch-action:pan-y'), 'a finger on a row scrolls the page');
  assert.ok(/\.grip\{order:5;touch-action:none\}/.test(css), 'only the handle refuses a scroll');
  assert.ok(css.includes('.nudge{touch-action:manipulation}'));
  // the content of a block is hidden with enough weight to beat a block rule like #leadAlert>#gLeads{display:block!important}
  assert.ok(css.includes('#pH#pH>.arrRow>:not(.grip)'));
  const add = fnBody('addHandles');
  assert.ok(add.includes("el.tagName==='STYLE'||el.tagName==='SCRIPT'||el.hidden||!el.offsetHeight"), 'only blocks on the screen get a row');
  assert.ok(add.includes("lb.className='arrLbl'"));
  assert.ok(html.includes("document.querySelectorAll('.grip,.minus,.nudge,.arrLbl')"), 'leaving removes the labels too');
});

test('one bottom bar: the instruction is in it once, no toast repeats it, the page and the toast clear it', () => {
  assert.equal((html.match(/id="editBar"/g) || []).length, 1);
  assert.equal((html.match(/class="editbar"/g) || []).length, 1);
  const handler = html.slice(html.indexOf("on('arrangeBtn',function(){"));
  const body = handler.slice(0, handler.indexOf('\n});') + 4);
  assert.ok(!/toast\(/.test(body), 'the settings button opens the mode without a second instruction');
  assert.ok(!html.includes("toast('סידור המסך. גרור מהידית הכחולה.')"));
  const css = phoneCss();
  assert.ok(css.includes('padding:10px 14px calc(10px + env(safe-area-inset-bottom))'), 'the safe area');
  assert.ok(css.includes('body.editing{padding-bottom:calc(var(--editBarH,112px) + 16px)!important}'), 'the last row clears the bar');
  assert.ok(css.includes('body.editing .toast{bottom:calc(var(--editBarH,112px) + 12px)}'));
  assert.ok(css.includes('body.editing #demoWa{display:none!important}'), 'the demo strip does not cover the bar');
  assert.ok(css.includes('white-space:normal'), 'a long button text wraps, it is not cut');
  assert.ok(html.includes("root.style.setProperty('--editBarH'"), 'the bar height is measured, not guessed');
  // the swap button is only there when it can do something
  assert.ok(html.includes("sw.hidden=!(tl&&ic&&tl.classList.contains('arrRow')&&ic.classList.contains('arrRow'))"));
});

test('what a person reads in the mode has no dashes and nothing in English', () => {
  const bar = html.match(/<div class="editbar" id="editBar" hidden>([\s\S]*?)<\/div>/);
  assert.ok(bar);
  const texts = [...bar[1].matchAll(/>([^<]+)</g)].map((m) => m[1].trim()).filter(Boolean);
  const names = html.match(/var ARR_NAMES=\{([\s\S]*?)\};/);
  assert.ok(names);
  texts.push(...[...names[1].matchAll(/:'([^']+)'/g)].map((m) => m[1]));
  assert.ok(texts.length > 20, 'the bar and the block names were found');
  texts.forEach((t) => {
    assert.ok(!/[-‐-―־−]/.test(t), 'a dash in: ' + t);
    assert.ok(!/[A-Za-z]/.test(t), 'a Latin letter in: ' + t);
  });
  assert.ok(texts.some((t) => t.includes('גוררים מהידית הכחולה')));
  // a label taken from the page itself loses its dashes too
  assert.ok(fnBody('arrLabel').includes('.replace(/[-–—־−]/g,\' \')'));
  // the mode uses the one font of the monitor
  assert.ok(!/font-family:[^;}]*(Arial|Helvetica|system-ui)/.test(phoneCss()));
  assert.ok(phoneCss().includes('font:700 15px/1.25 Heebo,sans-serif'));
});

test('the saved arrangement is the same data in the same keys, and only what the person hid is touched', () => {
  assert.ok(html.includes("armDrag(home,'blockOrder')"));
  assert.ok(html.includes("editing={box:home,key:'blockOrder'}"));
  assert.ok(html.includes("try{localStorage.setItem(key,JSON.stringify(ids));}catch(e){}"));
  assert.ok(html.includes("tileSave('blocksHidden',hid)"));
  assert.ok(html.includes("tileSave('blocksHidden',[])"));
  // other code hides empty blocks; entering the mode used to un-hide them all
  assert.ok(!html.includes('if(k)el.hidden=hid.indexOf(k)>=0;'));
  assert.ok(html.includes("el.setAttribute('data-uhid','1')"));
  assert.ok(html.includes("el.removeAttribute('data-uhid')"));
  // the blocks that come back after החזרת הכל get their controls
  assert.ok(fnBody('restoreBlocks').includes('addHandles(editing.box)'));
  // a step skips the blocks that are not rows
  assert.ok(fnBody('nudgeBlock').includes("c.classList.contains('arrRow')"));
});

test('a drag keeps going to the end, scrolls the page at the edges, and leaving without a move changes nothing', () => {
  assert.ok(html.includes('box.setPointerCapture(e.pointerId)'));
  assert.ok(html.includes('function edgeGo(){'));
  assert.ok(html.includes("window.scrollBy({top:dy,left:0,behavior:'instant'})"));
  const end = html.slice(html.indexOf('function endEdit(){'), html.indexOf('function endEdit(){') + 900);
  assert.ok(end.includes('if(moved)pinHome('), 'pinHome only after a move');
  assert.ok(end.includes("removeProperty('--editBarH')"));
});

test('motion: the phone block adds none, the existing reduced motion rule stays, and the settings screen no longer widens the page', () => {
  const css = phoneCss();
  assert.ok(!/animation:|transition:/.test(css.replace(/animation:none/g, '')), 'no animation or transition added');
  assert.ok(html.includes('@media(prefers-reduced-motion:reduce){body.editing .editbox>*{animation:none;'));
  assert.ok(html.includes('#kindBox,#quietBox{flex-wrap:wrap}'));
  assert.ok(html.includes('#kindBox .skinrow,#quietBox .skinrow{flex:1 1 100%;flex-wrap:wrap}'));
});
