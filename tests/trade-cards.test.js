'use strict';
// 21.11.2026: the three trade cards on the home screen (lib/trade-cards.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TC = require('../lib/trade-cards.js');
const trades = require('../lib/trades.js');
const NOW = Date.parse('2026-11-21T22:30:00Z');

function seeded() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-')); require('../lib/demo-trades/gypsum.js').seed(d, NOW); return d; }

test('the gypsum cards come from the data, in order', () => {
  const c = TC.payload(seeded(), trades.get('gypsum'), NOW);
  assert.deepStrictEqual(c.map((x) => x.k), ['debt', 'today', 'quotes']);
  assert.deepStrictEqual(c.map((x) => x.lines.length), [3, 2, 2]);
  assert.match(c[0].lines[0], /משפחת לוי · 4,800 ₪ · 12 ימים מסיום העבודה/);
  assert.match(c[1].lines[0], /^07:30 תקרת גבס/);
  assert.match(c[2].lines.join('\n'), /רונית כהן · נשלחה לפני 4 ימים, עוד לא חתם/);
});

test('no data: every card says so, nothing throws', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tc0-'));
  for (const c of TC.payload(d, trades.get('gypsum'), NOW)) assert.deepStrictEqual(c.lines, ['אין כרגע']);
});

test('only a monitor with a known trade gets the cards', () => {
  assert.strictEqual(TC.html({}), '');
  assert.strictEqual(TC.html({ trade: 'nope', dataPath: '/tmp' }), '');
  const h = TC.html({ trade: 'gypsum', dataPath: seeded() }, NOW);
  assert.match(h, /id="tradeCards"/);
  assert.match(h, /#f08a24/);
  assert.match(h, /data-open="gBhQuote"/);
  assert.doesNotMatch(h, /[‐–—]/);
  assert.doesNotMatch(h, /<script[^>]*>[^<]*<\/script>[\s\S]*<script/); // one script at most
});

test('names are escaped', () => {
  const d = seeded();
  const f = path.join(d, 'biz-home', 'quotes.json');
  const q = JSON.parse(fs.readFileSync(f, 'utf8')); q[0].client = '<img src=x>'; fs.writeFileSync(f, JSON.stringify(q));
  assert.doesNotMatch(TC.html({ trade: 'gypsum', dataPath: d }, NOW), /<img src=x>/);
});

test('the demo opens with a WhatsApp conversation of the trade (Itzik 21.11: "זה חובה")', () => {
  const d = seeded();
  const h = TC.html({ trade: 'gypsum', dataPath: d, publicDemo: true }, NOW);
  assert.match(h, /id="tradeWa"/);
  assert.ok(h.indexOf('id="tradeWa"') < h.indexOf('class="tcCard"'));
  assert.match(h, /לשלוח\?/);
  assert.doesNotMatch(h, /[‐–—]/);
  // a real customer's monitor never shows the invented conversation
  assert.doesNotMatch(TC.html({ trade: 'gypsum', dataPath: d }, NOW), /tradeWa/);
});
