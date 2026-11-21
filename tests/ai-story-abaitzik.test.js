'use strict';
// 10.11.2026: the daily story in abaitzik. Hebrew and English take turns, only what went up on the channels today.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pick, todays } = require('../ai-story-abaitzik.js');

const q = [
  { id: 'a-he', lang: 'he', posted: true, postedAt: '2026-11-09T18:01:00Z', file: 'media/a-he.mp4' },
  { id: 'a-en', lang: 'en', posted: true, postedAt: '2026-11-09T18:03:00Z', file: 'media/a-en.mp4' },
  { id: 'b-he', lang: 'he', posted: false, file: 'media/b-he.mp4' },
  { id: 'old', lang: 'en', posted: true, postedAt: '2026-11-08T18:00:00Z', file: 'media/old.mp4' },
];

test('only what went up today (Israel time), never an item that was not posted', () => {
  assert.deepEqual(todays(q, '2026-11-09').map((x) => x.id), ['a-he', 'a-en']);
  assert.deepEqual(todays(q, '2026-11-10'), []);
});
test('the languages take turns, Hebrew first, and a day with one language uses it', () => {
  const t = todays(q, '2026-11-09');
  assert.equal(pick(t, undefined).id, 'a-he');
  assert.equal(pick(t, 'he').id, 'a-en');
  assert.equal(pick(t, 'en').id, 'a-he');
  assert.equal(pick([t[0]], 'he').id, 'a-he');
  assert.equal(pick([], 'he'), null);
});
