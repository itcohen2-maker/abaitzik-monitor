'use strict';
// 11.11.2026, Itzik: every "מה בצלחת" story that went up is also on the site and in the highlight; the manager checks.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/manager.js');

test('a posted plate story missing from the site is a warn line and a PC job, an hour after posting', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const q = [
    { id: 'gezer', name: 'גזר', posted: true, postedAt: '2026-11-03T11:00:00Z' },
    { id: 'limon', name: 'לימון', posted: true, onSite: true, postedAt: '2026-11-04T11:00:00Z' },
    { id: 'yogurt', name: 'יוגורט (גרסה 7)', posted: true, postedAt: '2026-11-09T20:55:00Z' },
    { id: 'fresh', name: 'טרי', posted: true, postedAt: '2026-11-11T11:30:00Z' },
    { id: 'cherry', name: 'שרי', posted: false },
  ];
  assert.deepStrictEqual(M.plateSiteMissing(q, now).map((x) => x.id), ['yogurt']);
  const it = M.plateSiteItem(q, now);
  assert.strictEqual(it.st, 'warn');
  assert.match(it.sub, /יוגורט/);
  assert.match(M.plateSiteJob(q[2]), /publish_plate\.py yogurt/);
  assert.match(M.plateSiteJob(q[2]), /היילייט/);
  assert.strictEqual(M.plateSiteItem(q.slice(0, 2), now), null);
});
