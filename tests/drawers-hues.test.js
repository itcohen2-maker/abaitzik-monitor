'use strict';
// 21.11.2026: the drawers' colours are read before lib/drawers-ui.js's script reaches its own line (boot renders the
// reminders first). With "var DW_HUES=[...]" that was undefined, and a monitor whose reminders fall on two days
// showed "חלק מהמסך לא נטען" (found on the gypsum trade demo). The colours are a hoisted function now.
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { js } = require('../lib/drawers-ui.js');

test('the drawer colours are there before the script runs', () => {
  const stub = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub), apply: () => stub, construct: () => stub });
  const ctx = { document: stub, window: stub, localStorage: stub, setTimeout: () => 0, navigator: stub, location: stub };
  ctx.window = ctx;
  const early = vm.runInNewContext('var early = dwHues(); early;' + js.replace(/^[\s\S]*?(?=\/\* 4\.11\.2026: numbers on top)/, ''), ctx, { timeout: 2000 });
  assert.ok(Array.isArray(early) && early.length === 8);
  assert.ok(!/DW_HUES/.test(js));
});
