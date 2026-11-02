'use strict';
/*
  24.10.2026: the top of the home screen (lib/home-ui.js) and the design fixes that went
  with it. Checks the module strings reach the built page, that nothing renders without
  D.brief or D.money, that the brief pill sends its line, and that the token and motion
  changes are in place.
*/
const { test } = require('node:test');
const assert = require('node:assert');
process.env.MONITOR_NO_GATE = '1';
const { renderPage } = require('../build.js');
const ui = require('../lib/home-ui.js');
const help = require('../lib/help-ui.js');
const approvals = require('../lib/approvals-ui.js');
// Same minimal payload as tests/page.test.js (not required from there: that would rerun its tests).
function fixture(overrides) {
  return Object.assign({
    now: null, openCmds: [], builtAt: '2026-09-10T16:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [],
  }, overrides || {});
}

// Runs the module script with stubs for the page globals, and returns the helpers.
function helpers() {
  const stub = 'var esc=function(s){return String(s).replace(/[&<>"\']/g,function(c){return "&#"+c.charCodeAt(0)+";";});};'
    + 'var sendText=function(){return Promise.resolve();};var toast=function(){};';
  return new Function(stub + ui.js + '\nreturn {hmBriefHtml:hmBriefHtml,hmCards:hmCards,hmMoneyCards:hmMoneyCards,hmGreeting:hmGreeting,hmSpark:hmSpark,HM_ACTS:function(){return HM_ACTS;}};')();
}

const brief = {
  at: '2026-10-24T07:00:00+03:00',
  items: [
    { t: 'שתי הודעות מהלקוחות', sub: 'מחכות לתשובה', act: 'לענות לשתיהן', actText: 'לענות' },
    { t: 'תשלום מתקרב', sub: 'עד יום חמישי' },
    { t: '<script>x</script>', act: 'לבדוק', actText: 'בדיקה' },
  ],
  kpis: [{ k: 'מכירות', v: 1200, u: 'השבוע', state: 'ok', spark: [1, 2, 3, 2] }],
};
const money = { at: '2026-10-24T07:00:00+03:00', cash: 52000, debt: 18500, late: 2, forecast90: [40000, 35000, -1200] };

test('the module strings are in the built page, hidden by default', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('id="hmGreet"'), 'greeting missing');
  assert.ok(html.includes('id="sinceBox"'), 'since box placeholder missing');
  assert.ok(html.includes('id="homeBrief" aria-label="דוח הבוקר" hidden'), 'brief card must start hidden');
  assert.ok(html.includes('id="homeKpis" aria-label="מספרים" hidden'), 'bento must start hidden');
  assert.ok(html.includes('function renderHome'), 'renderHome missing');
  assert.ok(html.includes("boot('home',renderHome);"), 'boot wiring missing');
  assert.ok(html.includes('.hk-grid{'), 'bento css missing');
});

test('the top of the home screen is greeting, approvals, brief, bento, then the old blocks', () => {
  const html = renderPage(fixture());
  const at = (s) => html.indexOf(s);
  assert.ok(at('id="hmGreet"') < at('id="approvalsBox"'));
  assert.ok(at('id="approvalsBox"') < at('id="homeBrief"'));
  assert.ok(at('id="homeBrief"') < at('id="homeKpis"'));
  assert.ok(at('id="homeKpis"') < at('id="newBlock"'));
  // pinHome moves these to the top at load, so they must be in its list.
  assert.ok(html.includes("var HOME_HEAD=['hmGreet','sinceBox','approvalsBox','homeBrief','homeKpis','homeMoney','newBlock'"));
});

test('nothing renders without D.brief or D.money', () => {
  const h = helpers();
  assert.strictEqual(h.hmBriefHtml(undefined), '');
  assert.strictEqual(h.hmBriefHtml({ items: [] }), '', 'a brief with no time stamp is not a brief');
  assert.deepStrictEqual(h.hmCards(undefined, undefined), []);
  assert.deepStrictEqual(h.hmCards({ at: brief.at }, undefined), []);
});

test('the brief lists up to five items, escapes text, and gives each act its own pill', () => {
  const h = helpers();
  const out = h.hmBriefHtml(Object.assign({}, brief, {
    items: brief.items.concat([{ t: 'a' }, { t: 'b' }, { t: 'c' }]),
  }));
  assert.ok(out.includes('זהו להיום'), 'ending line missing');
  assert.strictEqual((out.match(/class="hb-n"/g) || []).length, 5, 'at most five numbered items');
  assert.ok(out.includes('data-hm-act="0"') && out.includes('data-hm-act="1"'));
  assert.ok(!out.includes('<script>'), 'item text must be escaped');
  assert.ok(out.includes('&#60;script'), 'escaped script tag expected');
});

test('money stays out of the open bento and lives in its own folded cards', () => {
  const h = helpers();
  assert.deepStrictEqual(h.hmCards(brief, money).map((c) => c.l), ['מכירות'], 'no bank or debts in the open bento');
  const cards = h.hmMoneyCards(brief, money);
  assert.deepStrictEqual(cards.map((c) => c.l), ['בבנק', 'חייבים', 'תחזית 90 יום']);
  assert.strictEqual(cards[1].st, 'warn');
  assert.strictEqual(cards[2].st, 'bad', 'a negative month in the forecast is bad');
  assert.ok(ui.html.includes('<details class="hm-money" id="homeMoney" hidden>'), 'folded and hidden by default');
  assert.ok(ui.js.includes('F.money?hmMoneyCards'), 'only with the money feature');
  assert.ok(h.hmSpark([1, 2, 3], 'ok').includes('<polyline'));
  assert.strictEqual(h.hmSpark([5], 'ok'), '', 'one point is not a line');
});

test('amounts are formatted with the shekel sign inside bdi', () => {
  const h = helpers();
  const bank = h.hmMoneyCards(undefined, money)[0];
  assert.ok(bank.v.startsWith('<bdi>') && bank.v.endsWith('</bdi>'));
  assert.ok(bank.v.includes('52'), 'amount missing');
});

test('greeting follows the Israel hour', () => {
  const h = helpers();
  // Read in Asia/Jerusalem: 06:00 UTC is 09:00 in Israel on 24.10.2026.
  assert.strictEqual(h.hmGreeting(new Date('2026-10-24T06:00:00Z')), 'בוקר טוב');
  assert.strictEqual(h.hmGreeting(new Date('2026-10-24T11:00:00Z')), 'צהריים טובים');
  assert.strictEqual(h.hmGreeting(new Date('2026-10-24T17:00:00Z')), 'ערב טוב');
  assert.strictEqual(h.hmGreeting(new Date('2026-10-24T23:30:00Z')), 'לילה טוב');
});

test('the brief pill sends its act through sendText with the request subject', () => {
  assert.ok(ui.js.includes("sendText('בקשה מהמוניטור',act,'בקשה')"));
});

test('the module script is valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(ui.js));
});

test('the approval card is the solid accent card, with the primary button on it', () => {
  assert.ok(approvals.css.includes('.apv{margin:0 0 14px;padding:16px;border-radius:20px;background:var(--accent)'));
  assert.ok(approvals.css.includes('.apv-btns .apv-ok{background:var(--surface);border-color:transparent;color:var(--accent)}'));
});

test('help sheet uses the accent token, not the hardcoded blue', () => {
  assert.ok(!help.css.includes('#4f7cff'));
  assert.ok(help.css.includes('.qhhuman{display:block;width:100%;margin-top:8px;padding:13px;border:0;border-radius:12px;background:var(--accent)'));
});

test('tokens: light and dark accent, the on-accent token, and the warn and chip pairs', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('--accent:#0f6e5c;--accent-soft:#e3f1ed'));
  assert.ok(html.includes('--on-accent:#06231c'), 'dark on-accent missing');
  // Two copies: the base dark block and the phone's copy. Designs 3 to 6 write their own night (lib/skins-ui.js), not this one.
  assert.strictEqual(html.split('--accent:#4fd1b0;--accent-soft:#15302a').length - 1, 2, 'dark blocks');
  assert.ok(html.includes('.holdline{margin:0 0 10px;padding:9px 12px;border-radius:12px;background:var(--warn-soft)'));
  assert.ok(html.includes('background:var(--chip);color:var(--chip-ink)'));
});

test('motion: decorative loops stop after three runs, the new-tile and unread blinks stay infinite', () => {
  const html = renderPage(fixture());
  assert.ok(!html.includes('tileglow 2.1s ease-out infinite'));
  assert.ok(!html.includes('nbeat 1.1s infinite'));
  assert.ok(!html.includes('pjHot 1.6s ease-in-out infinite'));
  assert.ok(html.includes('.gt.taskblink{animation:taskbeat .8s steps(1) infinite}'), 'new tile blink changed');
  assert.ok(html.includes('.gt.updblink,.newbtn.updblink{animation:updbeat 2.6s ease-in-out infinite}'), 'update blink changed');
  assert.ok(html.includes('.newbtn.hot .nb-c{animation:hardblink .5s steps(1) infinite}'), 'unread blink changed');
});

test('tap targets, label size and the back wording', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('.bn button{position:relative;background:none;border:0;cursor:pointer;color:var(--dim);'));
  assert.ok(html.includes('font:500 12px Heebo,sans-serif;display:flex'));
  assert.ok(html.includes('flex:1 1 0;min-width:0;min-height:44px;padding:4px 2px}'));
  assert.ok(html.includes('min-height:44px;padding:8px 4px;font:500 14px Heebo,sans-serif;cursor:pointer}'), 'segment buttons under 44px');
  assert.ok(html.includes('.growbtn .gb-c{flex:0 0 auto;min-width:44px;height:44px;'), 'growbtn count under 44px');
  assert.ok(html.includes("bars[i].textContent='חזרה';"));
  assert.ok(!html.includes('סגירה וחזרה לבית'), 'old back wording still in the page');
  assert.ok(html.includes('viewport-fit=cover'));
});
