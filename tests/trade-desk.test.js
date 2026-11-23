'use strict';
// 21.11.2026: the desktop browser version of a trade monitor (lib/trade-desk.js). It must touch nothing but a trade
// monitor, and on that one nothing but a wide window with a mouse: every rule sits inside one media query.
const test = require('node:test');
const assert = require('node:assert');
const TD = require('../lib/trade-desk.js');
const trades = require('../lib/trades.js');

const MQ = '(min-width:1000px) and (pointer:fine)';
const TRADE_IDS = ['gypsum', 'beauty', 'consult', 'photo'];
const inst = (t) => ({ trade: t, dataPath: '/tmp/none' });

function styleOf(h) { const m = h.match(/<style>([\s\S]*?)<\/style>/); assert.ok(m, 'a style block'); return m[1]; }

test('a monitor without a trade gets nothing', () => {
  assert.strictEqual(TD.html({}), '');
  assert.strictEqual(TD.html(null), '');
  assert.strictEqual(TD.html({ trade: 'nope', dataPath: '/tmp/none' }), '');
  assert.strictEqual(TD.html({ name: 'abaitzik', dataPath: '/tmp/none' }), '');
});

test('each of the four trades gets the style and the script', () => {
  TRADE_IDS.forEach((id) => {
    assert.ok(trades.get(id), id);
    const h = TD.html(inst(id));
    assert.ok(h.includes('@media ' + MQ + '{'), id + ': the media query');
    assert.match(h, /<script>\(function page\(MQ, DATA\)/);
    assert.ok(h.includes(JSON.stringify(MQ)), id + ': the script asks the same query');
    assert.ok(!/<\/script>[\s\S]*<\/script>/.test(h.replace(/<script>[\s\S]*?<\/script>/, '')), 'one script only');
  });
});

test('every rule lives inside the one media query, so a phone is not touched', () => {
  const css = styleOf(TD.html(inst('gypsum')));
  const open = '@media ' + MQ + '{';
  assert.ok(css.startsWith(open), 'the style starts with the media query');
  // the outer block closes only at the very end; before that the depth never returns to zero
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; assert.ok(depth > 0 || i === css.trim().length - 1, 'the media block closed early at ' + i); }
  }
  assert.strictEqual(depth, 0, 'braces balance');
  assert.strictEqual(css.split('@media ' + MQ).length, 2, 'only one such block');
  // nothing is placed before or after it
  assert.strictEqual(css.trim().slice(-1), '}');
});

test('the style is the same for every trade (the look comes from the page tokens), only the examples differ', () => {
  const a = styleOf(TD.html(inst('gypsum')));
  TRADE_IDS.forEach((id) => assert.strictEqual(styleOf(TD.html(inst(id))), a));
});

test('the page function is plain, parses, and has no closing script tag', () => {
  const src = TD.page.toString();
  assert.ok(!/<\/script/i.test(src));
  new Function('return (' + src + ')'); // parses
  assert.ok(!/=>|`|\blet\b|\bconst\b/.test(src.replace(/'[^']*'/g, "''")), 'ES5 only, like the other page functions');
});

test('Hebrew words on the screen carry no dash', () => {
  const h = TD.html(inst('consult'));
  const strings = h.match(/'[^'\n]*[א-ת][^'\n]*'/g) || [];
  assert.ok(strings.length >= 4, 'found the Hebrew strings');
  // the words people read: tags and their attributes (data-m) are not text
  strings.forEach((s) => assert.ok(!/[-‐-―־]/.test(s.replace(/<[^>]*>/g, '')), 'no dash in ' + s));
  assert.ok(h.includes('רווח') && h.includes('להקליט') && h.includes('לשלוח'));
});

test('it keeps to the monitor\'s own tokens: no fixed theme colours in the rules', () => {
  const css = styleOf(TD.html(inst('photo')));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'a hard coded colour');
  assert.ok(!/rgba?\(/.test(css), 'a hard coded rgb colour');
  assert.ok(/var\(--accent\)/.test(css) && /var\(--line\)/.test(css));
});

test('the rail is the real navigation restyled, not a second one', () => {
  const css = styleOf(TD.html(inst('gypsum')));
  assert.match(css, /\.bn\{[^}]*width:88px/);
  assert.ok(!/id="nH"|<nav/.test(TD.html(inst('gypsum'))), 'no navigation markup of its own');
});

test('reduced motion is respected', () => {
  assert.match(styleOf(TD.html(inst('gypsum'))), /prefers-reduced-motion:reduce/);
});

test('the empty conversation: a line, three examples, no dash, gender forms', () => {
  TRADE_IDS.forEach((id) => {
    const t = trades.get(id);
    ['m', 'f'].forEach((g) => {
      const e = TD.emptyState(t, g === 'f');
      assert.strictEqual(e.hello, 'מה לעשות בשבילך היום?');
      assert.strictEqual(e.prompts.length, 3, id + ': three examples');
      e.prompts.forEach((p) => { assert.ok(p.trim().length > 6, id + ': a real line'); assert.ok(!/[-‐-―־]/.test(p), 'no dash in ' + p); });
      [e.hello, e.hint].forEach((s) => assert.ok(!/[-‐-―־]/.test(s), 'no dash in ' + s));
    });
    assert.match(TD.emptyState(t, false).hint, /לחץ.*כתוב/);
    assert.match(TD.emptyState(t, true).hint, /לחצי.*כתבי/);
    // the examples are the hand written ones of lib/trades.js (ask)
    assert.deepStrictEqual(TD.emptyState(t, false).prompts, t.ask, id);
  });
  // the page gets the same data, feminine when the instance says so
  assert.ok(TD.html({ trade: 'beauty', dataPath: '/tmp/none', gender: 'f' }).includes('לחצי על שורה'));
  assert.ok(TD.html({ trade: 'beauty', dataPath: '/tmp/none' }).includes('לחץ על שורה'));
});

test('the docked conversation keeps the monitor\'s own controls reachable', () => {
  const css = styleOf(TD.html(inst('gypsum')));
  assert.match(css, /#fcSheet\.gFull\{top:auto!important;bottom:calc\(var\(--dkBot,0px\) \+ 22px\)!important;height:var\(--dkChatH\)/); // docked at the foot of the work area, its own scroll
  assert.ok(!/#bareBtn\{[^}]*display:none/.test(css) && !/#leadAlert\{[^}]*display:none/.test(css), 'nothing of the home is hidden');
  assert.match(css, /\.ytopx/); // only the close button of the permanent chat goes
});


const ASK = {
  gypsum: ['תזכיר למשפחת לוי בנימוס על היתרה', 'תכין הצעת מחיר לתקרת גבס בסלון', 'מה מחכה לי היום?'],
  beauty: ['תבדוק מי לא הייתה אצלי חודשיים', 'תכתוב לי פוסט לאינסטגרם על טיפול פנים', 'מה מחכה לי היום?'],
  consult: ['תסכם לי את הפגישה עם בית הקפה של נועה', 'תכין תזכורת ריטיינר לשגיא שיווק', 'מה הבטחתי ללקוחות השבוע?'],
  photo: ['תשלח לזוג של 14.1 חוזה לחתימה', 'תזכיר לעדי ותומר על המקדמה', 'אילו אירועים יש לי החודש?'],
};
test('H: each trade has its three hand written examples, and a feminine variant only when given', () => {
  TRADE_IDS.forEach((id) => {
    assert.deepStrictEqual(trades.get(id).ask, ASK[id], id);
    assert.deepStrictEqual(TD.emptyState(trades.get(id), true).prompts, ASK[id], id + ' (feminine owner, no askF)');
  });
  const t = { ask: ['א'], askF: ['ב', 'ג', 'ד'] };
  assert.deepStrictEqual(TD.emptyState(t, true).prompts, ['ב', 'ג', 'ד']);
  assert.deepStrictEqual(TD.emptyState(t, false).prompts, ['א']);
});

test('C: a real divider between the day and the work area', () => {
  const h = TD.html(inst('gypsum')), css = styleOf(h);
  assert.ok(h.includes("'trDeskW'")); // kept on this browser
  assert.ok(h.includes("'role', 'separator'"));
  assert.ok(h.includes("'aria-orientation', 'vertical'"));
  assert.ok(h.includes('MIN = 340, MAX = 560'));
  assert.ok(h.includes('DEF = 460'));
  assert.ok(h.includes('dblclick') && h.includes('ArrowLeft') && h.includes('ArrowRight'));
  assert.match(css, /#deskSplit\{[^}]*width:6px;cursor:col-resize/);
  assert.ok(css.includes('var(--dkDay,460px)'));
  assert.match(css, /body\.deskDragging[^{]*\{[^}]*user-select:none/); // a drag selects nothing
});

test('A, D, E: no selecting the chrome, the ring column holds, thin scrollbars, no iPhone help on a desktop', () => {
  const css = styleOf(TD.html(inst('gypsum')));
  assert.match(css, /body:not\(\.offHome\) \.wrap,\.bn,#fcSheet,#deskSplit\{[^}]*user-select:none/);
  assert.match(css, /#tradeCards \.trList:not\(\[hidden\]\)\{flex:1 1 0;min-height:70px;overflow-y:auto/);
  assert.ok(css.includes('#trTry,#tradeWa{display:none!important}'));
  assert.ok(css.includes('scrollbar-width:thin'));
  assert.ok(css.includes('::-webkit-scrollbar-thumb'));
  assert.ok(css.includes('var(--dkBot,0px)')); // the demo's bottom bar is read, not guessed
});

test('G: no empty leads tile on a trade home, a real open lead keeps it', () => {
  const TC = require('../lib/trade-cards.js');
  TRADE_IDS.forEach((id) => {
    assert.ok(!(trades.get(id).screens || []).includes('gLeads'), id + ' lists no leads screen');
    assert.strictEqual(TC.leadsQuiet({ trade: id }, 0), true, id + ': nothing open, no tile');
    assert.strictEqual(TC.leadsQuiet({ trade: id }, 1), false, id + ': an open lead keeps the tile (and its blink)');
  });
  assert.strictEqual(TC.leadsQuiet({}, 0), false, 'a monitor without a trade is as before');
  assert.strictEqual(TC.leadsQuiet({ name: 'abaitzik' }, 0), false);
});

test('B: a mouse hold on the home does not start the arranging mode; Escape leaves it', () => {
  const src = TD.page.toString();
  assert.ok(src.includes("pointerType !== 'mouse'") && src.includes('stopImmediatePropagation'));
  assert.ok(src.includes("'Escape'") && src.includes("'editDone'"));
  // a press on the ring column never reaches the home's long press (lib/trade-cards.js)
  const tc = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'trade-cards.js'), 'utf8');
  assert.ok(tc.includes("w.addEventListener('pointerdown', function (e) { if (!window.editing) e.stopPropagation(); });"));
});

test('the one-time mic check is a flow block of the desktop work area, never a fixed card over a card', () => {
  const css = styleOf(TD.html(inst('beauty')));
  assert.match(css, /#micFirst\{position:relative!important;/);
  assert.ok(!/#micFirst\{[^}]*position:fixed/.test(css), 'no fixed mic card on the desk');
  const js = TD.html(inst('beauty'));
  assert.ok(js.includes("$('micFirst')"), 'the page moves the card into the work area and back');
});
