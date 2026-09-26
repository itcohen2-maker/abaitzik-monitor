'use strict';
/*
  The tile list reaches the page, and its absence changes nothing.

  build.js is 10,000 lines and runs against the real data folder, so this does
  not build. It checks the two seams instead: the placeholder the page carries
  and the object the build writes into it, from the same instance loader the
  build uses. If either side drifts, Ilay's copy shows Itzik's tiles, or
  Itzik's copy loses tiles, and both are silent on a phone.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');

test('the page declares the instance placeholder exactly once, as a string the build can replace', () => {
  assert.equal(src.split("var INSTANCE='__INSTANCE__';").length, 2);
  assert.ok(src.includes(`.replace("'__INSTANCE__'", instanceJson)`));
});

// 26.9: plus the customer's devices and greeting, none of them secret.
test('the build hands the page only name, owner, title, screens, devices and greeting', () => {
  const m = /const instanceJson = JSON\.stringify\(\{([^}]*)\}\)/.exec(src);
  assert.ok(m, 'instanceJson is built from an object literal');
  const fields = m[1].split(',').map(f => f.trim().split(':')[0].trim()).sort();
  assert.deepEqual(fields, ['computer', 'name', 'owner', 'pageTitle', 'phone', 'screens', 'welcome']);
  // Never the topics, never the mailbox: this line is outside the gate.
  assert.ok(!/instanceJson[^\n]*ntfy/.test(src));
});

test('with screens null the filter returns before touching a single tile', () => {
  const i = src.indexOf('var keep=INSTANCE&&INSTANCE.screens;');
  assert.ok(i > 0);
  assert.ok(src.slice(i, i + 80).includes('if(!keep||!keep.length)return;'));
});

test("Itzik's instance keeps every tile", () => {
  const inst = require(path.join(ROOT, 'lib', 'instance.js')).load();
  assert.equal(inst.screens, null);
});
