'use strict';
// 23.11.2026: a customer without a trade (ilay, רינת, דניאל) gets the new look: the generic trade, owner colours, no owner-only parts.
const test = require('node:test');
const assert = require('node:assert');
const trades = require('../lib/trades.js');
const TC = require('../lib/trade-cards.js');
const TD = require('../lib/trade-desk.js');

test('the generic trade is reachable by id only, and is not one of the four trades', () => {
  const g = trades.get('generic');
  assert.ok(g, 'generic exists');
  assert.strictEqual(g.id, 'generic');
  assert.strictEqual(g.label, 'העסק שלי');
  assert.strictEqual(g.screens, null, 'every tile of the customer stays');
  assert.deepStrictEqual(Object.keys(trades.TRADES).sort(), ['beauty', 'consult', 'gypsum', 'photo']);
  assert.strictEqual(trades.forInst({ trade: 'generic' }).id, 'generic');
});

test('generic words and examples: feminine examples only where the instance says gender f', () => {
  const g = trades.get('generic');
  assert.deepStrictEqual(TD.emptyState(g, true).prompts, g.askF);
  assert.deepStrictEqual(TD.emptyState(g, false).prompts, g.ask);
  assert.notDeepStrictEqual(g.askF, g.ask);
});

test('the generic home has the new look and none of the owner-only parts', () => {
  const html = TC.html({ trade: 'generic', dataPath: '/tmp/none', gender: 'f' }, Date.now());
  assert.match(html, /<section id="tradeCards" data-trade-home="1"/);
  assert.ok(!html.includes('OWNER_MERGE_BIZ'), 'no owner money and bank tiles');
  assert.ok(!html.includes('SYS'), 'no owner agents');
  assert.ok(html.includes('העסק שלי'));
});

test('the owner keeps his own home (his merge script stays)', () => {
  const html = TC.html({ ownerLook: true, dataPath: '/tmp/none' }, Date.now());
  assert.ok(html.includes('OWNER_MERGE_BIZ'));
  assert.ok(!html.includes('data-trade-home'));
});

test('the generic look is the owner colour, in light and dark', () => {
  const css = TC.lookCss('generic');
  assert.ok(css.includes('#5b3fd1'));
  assert.ok(css.includes('#a594ff'));
});
