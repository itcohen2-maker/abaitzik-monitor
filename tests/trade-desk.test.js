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
    assert.match(h, /<script>\(function page\(MQ\)/);
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

test('the same output for every trade (the page reads the monitor, not the trade)', () => {
  const a = TD.html(inst('gypsum'));
  TRADE_IDS.forEach((id) => assert.strictEqual(TD.html(inst(id)), a));
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
