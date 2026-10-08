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
// 6.10: and the tile the shipments status line opens.
// 8.10: and the owner's grammatical gender, so Rinat is addressed as a woman.
// 8.10: and her guide tiles, an explanation each, nothing secret.
// 8.10: and the device marks Itzik approved after "שכחתי את הקוד", random and
// meaningless on any other phone.
test('the build hands the page only name, owner, title, screens, devices, greeting, home tile, gender, guides and unlocks', () => {
  const m = /const instanceJson = JSON\.stringify\(\{([^}]*)\}\)/.exec(src);
  assert.ok(m, 'instanceJson is built from an object literal');
  const fields = m[1].split(',').map(f => f.trim().split(':')[0].trim()).sort();
  assert.deepEqual(fields, ['computer', 'gender', 'guides', 'homeTile', 'name', 'owner', 'pageTitle', 'phone', 'screens', 'unlocks', 'welcome']);
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

// 8.10, from the reviewer: a forgotten lock code had no way back. The button is
// on the lock, it goes to Itzik as a request, and only an approved mark opens.
test('the lock offers "שכחתי את הקוד" and opens only on an approved device mark', () => {
  assert.ok(src.includes('id="lockForgot"'));
  assert.ok(src.includes("(INSTANCE.unlocks||[]).indexOf(lockMark())>-1&&lockMark()"));
  assert.ok(src.includes("'בקשה ממנהל: שכחתי את הקוד של הנעילה."));
  assert.ok(/r\.status === 'approved'[\s\S]{0,120}מכשיר \(\[a-f0-9\]\{12\}\)/.test(src));
});
