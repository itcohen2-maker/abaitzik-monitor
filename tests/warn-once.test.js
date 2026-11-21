'use strict';
/*
  21.11.2026, Itzik: at 80% of the package the customer hears once a month about the next package, with its monthly
  price and + מע״מ. The bar stays. lib/plan-io.js statusWith keeps the month in the customer's own status folder.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const P = require('../lib/plan.js');
const IO = require('../lib/plan-io.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const line = (msgs) => JSON.stringify({ at: '2026-12-02T10:00:00Z', msgs, usd: 0 });
const solo = { plan: 'solo', price: 149, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [] };

test('at 80% the status carries the next package line with its price and + מע״מ, once for the month', () => {
  const text = line(48); // 48 of 60 actions is 80%
  const st = P.status(solo, text, NOW);
  assert.equal(st.level, 'warn');
  assert.match(st.warnLine, /מקצועי/);
  assert.match(st.warnLine, /249 ₪ לחודש \+ מע״מ/);
  assert.equal(st.warnMark, '2026-12');
});

test('after the month was marked, the line is gone (not repeating); the bar stays', () => {
  const st = P.status(Object.assign({}, solo, { warnedMonth: '2026-12' }), line(50), NOW);
  assert.equal(st.level, 'warn');
  assert.equal(st.warnLine, '');
  assert.equal(st.warnMark, '');
});

test('no line below 80%, none at 100%, and none for the top package', () => {
  assert.equal(P.status(solo, line(47), NOW).warnLine, '');
  assert.equal(P.status(solo, line(60), NOW).warnLine, '');
  const large = { plan: 'large', month: '2026-12', extra: 0, applied: [], history: [] };
  assert.equal(P.status(large, line(1900), NOW).warnLine, '');
});

test('the same month, read from the customer status folder, is written once', () => {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'warn-'));
  const first = IO.statusWith(solo, line(48), D, NOW);
  assert.ok(first.warnLine);
  assert.equal(JSON.parse(fs.readFileSync(path.join(D, 'plan-warn.json'), 'utf8')).month, '2026-12');
  const again = IO.statusWith(solo, line(49), D, NOW);
  assert.equal(again.warnLine, '');
});
