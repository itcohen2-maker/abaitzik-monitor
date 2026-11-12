'use strict';
// 12.11.2026: "🏡 מצב אישי", lib/personal.js. The first choice, a free request, and the manager's sorting.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../lib/personal.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'personal-')); }

test('a new monitor has not chosen yet and gets the whole catalog', () => {
  const d = tmp();
  const f = P.forPage(d);
  assert.strictEqual(f.chosen, false);
  assert.deepStrictEqual(f.tiles, []);
  assert.ok(f.catalog.length >= 12);
  assert.ok(f.catalog.some((c) => c.t === 'ילדים: ספורט'));
});

test('the choice keeps known keys only, once each, and marks chosen', () => {
  const d = tmp();
  assert.deepStrictEqual(P.setPicked(d, 'pills,doctor,nope,pills'), ['pills', 'doctor']);
  const f = P.forPage(d);
  assert.strictEqual(f.chosen, true);
  assert.deepStrictEqual(f.tiles.map((t) => t.k), ['pills', 'doctor']);
});

test('a request is saved open, and the manager sorts, adds a tile, writes a line and closes it', () => {
  const d = tmp();
  P.setPicked(d, 'doctor,shop,pills');
  const r = P.addRequest(d, 'התרופות ראשונות, ותוסיף אריח לחוג של הילדה');
  assert.strictEqual(P.forPage(d).requests[0].state, 'open');
  P.apply(d, { order: ['pills', 'doctor'], add: [{ t: 'חוג של הילדה', i: '🩰' }], notes: { pills: 'בוקר וערב' }, remove: ['shop'], done: { id: r.id, answer: 'סידרתי' } });
  const f = P.forPage(d);
  assert.deepStrictEqual(f.tiles.slice(0, 2).map((t) => t.k), ['pills', 'doctor']);
  assert.strictEqual(f.tiles[0].note, 'בוקר וערב');
  assert.ok(f.tiles.some((t) => t.t === 'חוג של הילדה'));
  assert.ok(!f.tiles.some((t) => t.k === 'shop'));
  assert.strictEqual(f.requests[0].state, 'done');
  assert.strictEqual(f.requests[0].answer, 'סידרתי');
});

test('an empty request is not saved', () => {
  assert.strictEqual(P.addRequest(tmp(), '   '), null);
});
