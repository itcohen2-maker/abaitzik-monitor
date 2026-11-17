'use strict';
// 17.11.2026: "block": true in a customer pay file keeps the monitor closed until payment.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const po = require('../lib/pay-offer.js');

function withFile(obj, fn) {
  const orig = fs.readFileSync;
  fs.readFileSync = (p, enc) => (String(p).endsWith('/zz-test.pay.json') ? JSON.stringify(obj) : orig(p, enc));
  try { return fn(); } finally { fs.readFileSync = orig; }
}
const base = { on: true, items: [{ name: 'הקמה', price: 490 }], monthly: { name: 'חבילה', price: 700 } };

test('block is passed to the page only when it is exactly true', () => {
  assert.strictEqual(withFile(Object.assign({}, base, { block: true }), () => po.view('zz-test')).block, true);
  assert.strictEqual(withFile(base, () => po.view('zz-test')).block, false);
  assert.strictEqual(withFile(Object.assign({}, base, { block: 'yes' }), () => po.view('zz-test')).block, false);
});

test('a paid or turned off offer never blocks', () => {
  assert.strictEqual(withFile(Object.assign({}, base, { block: true, paidAt: '2026-11-17' }), () => po.view('zz-test')), null);
  assert.strictEqual(withFile(Object.assign({}, base, { block: true, on: false }), () => po.view('zz-test')), null);
});

test('the page script keeps the blocked sheet without a close button', () => {
  const js = require('../lib/plan-ui.js').js;
  assert.match(js, /function payBlock\(\)/);
  assert.match(js, /.ytopx/);
  assert.match(js, /paid=1/);
});
