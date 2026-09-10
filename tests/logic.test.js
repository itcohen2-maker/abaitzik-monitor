'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ML = require('../lib/monitor-logic.js');

// 10.9.2026 15:40 local time, built without a timezone so the test does not
// depend on the machine's zone.
const NOW = new Date(2026, 8, 10, 15, 40).getTime();
const H = 3600 * 1000;

test('timeOnDay puts HH:MM on the same local day as the reference', () => {
  const t = ML.timeOnDay('07:05', NOW);
  const d = new Date(t);
  assert.equal(d.getDate(), 10);
  assert.equal(d.getHours(), 7);
  assert.equal(d.getMinutes(), 5);
});

test('resolveTaken: an earlier time today stays today', () => {
  assert.equal(ML.resolveTaken('12:00', NOW), new Date(2026, 8, 10, 12, 0).getTime());
});

test('resolveTaken: a time later than now means yesterday', () => {
  assert.equal(ML.resolveTaken('23:30', NOW), new Date(2026, 8, 9, 23, 30).getTime());
});

test('resolveTaken: empty or garbage means now', () => {
  assert.equal(ML.resolveTaken('', NOW), NOW);
  assert.equal(ML.resolveTaken('abc', NOW), NOW);
  assert.equal(ML.resolveTaken('25:99', NOW), NOW);
});

test('parsePillTime reads the hour out of the message text', () => {
  const at = new Date(NOW).toISOString();
  assert.equal(ML.parsePillTime('לקחתי כדור בשעה 12:15.', at), new Date(2026, 8, 10, 12, 15).getTime());
});

test('parsePillTime falls back to the message time', () => {
  const at = new Date(NOW).toISOString();
  assert.equal(ML.parsePillTime('לקחתי כדור עכשיו.', at), NOW);
  assert.equal(ML.parsePillTime('לקחתי כדור', 'not a date'), 0);
});

test('pillState counts eight hours from the time taken', () => {
  const taken = NOW - 3 * H;
  const s = ML.pillState(taken, NOW);
  assert.equal(s.next, taken + ML.PILL_GAP);
  assert.equal(s.left, 5 * H);
  assert.equal(s.due, false);
});

test('pillState is due once the gap has passed, and with no record', () => {
  assert.equal(ML.pillState(NOW - 9 * H, NOW).due, true);
  assert.deepEqual(ML.pillState(0, NOW), { next: 0, left: 0, due: true });
});
