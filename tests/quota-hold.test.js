'use strict';
/*
  The quota gate for customers on Itzik's subscription (lib/quota-hold.js).
  Times are fixed so the tests do not depend on the clock.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const { check, passFor } = require('../lib/quota-hold.js');

const NOW = Date.parse('2026-10-14T12:00:00Z');
const fresh = { at: new Date(NOW - 10 * 60 * 1000).toISOString(), five: { pct: 85 }, week: { pct: 10 } };

test('no quota reading means no hold', () => {
  const r = check({ quota: null, limitPct: 80, spentToday: 0, dayUsd: 8, pass: null, now: NOW });
  assert.deepEqual(r, { hold: false });
});

test('a quota reading older than three hours is ignored', () => {
  const stale = { at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(), five: { pct: 99 }, week: { pct: 99 } };
  const r = check({ quota: stale, limitPct: 80, spentToday: 0, dayUsd: 8, pass: null, now: NOW });
  assert.equal(r.hold, false);
});

test('five hour usage at or above the limit holds with kind five', () => {
  const r = check({ quota: fresh, limitPct: 80, spentToday: 0, dayUsd: 8, pass: null, now: NOW });
  assert.equal(r.hold, true);
  assert.equal(r.kind, 'five');
  assert.equal(r.reason, 'מכסת חמש השעות של המנוי ב 85 אחוז');
});

test('an active pass is the manager approval: it skips every check, the day cap too', () => {
  const pass = { until: new Date(NOW + 60 * 60 * 1000).toISOString() };
  const five = check({ quota: fresh, limitPct: 80, spentToday: 0, dayUsd: 8, pass, now: NOW });
  assert.equal(five.hold, false);
  const day = check({ quota: fresh, limitPct: 80, spentToday: 8.1, dayUsd: 8, pass, now: NOW });
  assert.equal(day.hold, false);
  const expired = { until: new Date(NOW - 1000).toISOString() };
  assert.equal(check({ quota: fresh, limitPct: 80, spentToday: 8.1, dayUsd: 8, pass: expired, now: NOW }).kind, 'day');
});

test('spending at the daily cap holds with kind day', () => {
  const r = check({ quota: null, limitPct: 80, spentToday: 8.1, dayUsd: 8, pass: null, now: NOW });
  assert.equal(r.hold, true);
  assert.equal(r.kind, 'day');
  assert.equal(r.reason, 'התקרה היומית של המוניטור, 8.10 מתוך 8 דולר');
});

test('passFor uses the five hour reset, and a day for the rest', () => {
  const resets = '2026-10-14T15:29:59+00:00';
  const q = { five: { pct: 85, resets } };
  assert.equal(passFor('five', q, NOW).until, new Date(resets).toISOString());
  assert.equal(passFor('five', null, NOW).until, new Date(NOW + 5 * 60 * 60 * 1000).toISOString());
  assert.equal(passFor('week', q, NOW).until, new Date(NOW + 24 * 60 * 60 * 1000).toISOString());
});
