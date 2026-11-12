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

test('mail items: fit a tile, one per mail, nearest date first, gone when the day is over', () => {
  const d = tmp();
  P.setPicked(d, 'doctor,tickets');
  const now = Date.parse('2026-11-12T09:00:00Z');
  assert.ok(P.addItem(d, { k: 'tickets', line: 'הופעה בבארבי', when: '2026-11-20 21:00', ref: 'm1' }, now));
  assert.ok(P.addItem(d, { k: 'doctor', line: 'רופא עיניים, מכבי', when: '2026-11-14 10:30', ref: 'm2' }, now));
  assert.ok(P.addItem(d, { k: 'tickets', line: 'הצגה', when: '2026-11-15', ref: 'm3' }, now));
  assert.strictEqual(P.addItem(d, { k: 'tickets', line: 'שוב', ref: 'm1' }, now), null);
  assert.strictEqual(P.addItem(d, { k: 'nope', line: 'x', ref: 'm4' }, now), null);
  assert.strictEqual(P.addItem(d, { k: 'doctor', line: 'עבר', when: '2026-11-01', ref: 'm5' }, now), null);
  const t = P.tiles(P.load(d), P.loadItems(d, now));
  assert.deepStrictEqual(t.find((x) => x.k === 'tickets').items.map((x) => x.line), ['הצגה', 'הופעה בבארבי']);
  assert.strictEqual(t.find((x) => x.k === 'doctor').items[0].when, '2026-11-14 10:30');
  assert.strictEqual(P.loadItems(d, Date.parse('2026-11-16T09:00:00Z')).length, 1);
});

test('the model answer is checked: none, an unknown key or an empty line is nothing', () => {
  assert.strictEqual(P.parsePersonal({ k: 'none', line: 'x' }), null);
  assert.strictEqual(P.parsePersonal({ k: 'bogus', line: 'x' }), null);
  assert.strictEqual(P.parsePersonal({ k: 'bills', line: '' }), null);
  assert.deepStrictEqual(P.parsePersonal({ k: 'bills', line: 'ארנונה', when: '2026-11-15T00:00' }), { k: 'bills', line: 'ארנונה', when: '2026-11-15 00:00' });
});
