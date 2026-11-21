'use strict';
// 12.10: emptyCircles in instance.json reaches the build and draws that many empty circles.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const inst = require('../lib/instance.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
const start = src.indexOf('function tenantCircles(');
const end = src.indexOf('function tenantTiles(');
const { tenantCircles } = new Function(src.slice(start, end) + '; return { tenantCircles };')();

test('emptyCircles is a known instance field, so the merge keeps it', () => {
  assert.strictEqual(inst.DEFAULTS.emptyCircles, 0);
});

test('draws the asked number of empty circles, none by default', () => {
  assert.strictEqual(tenantCircles({}), '');
  assert.strictEqual((tenantCircles({ emptyCircles: 4 }).match(/class="ic icEmpty"/g) || []).length, 4);
  assert.strictEqual((tenantCircles({ emptyCircles: 99 }).match(/class="ic icEmpty"/g) || []).length, 8);
  assert.ok(!/\bid="(?!blkEmpty)/.test(tenantCircles({ emptyCircles: 2 })));
});
