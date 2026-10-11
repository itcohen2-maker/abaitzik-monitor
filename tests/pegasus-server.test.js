'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, PC_FRESH_MS, IDLE_PAUSE_MS, DAILY_CAP } = require('../pegasus-server');

// איציק, 1.10: "גם אם המחשב מכובה יש לנו את השרת". השרת מעיר את פגסוס רק כשהמחשב
// כבוי, ולא שורף טוקנים כשאין מה לעשות.
const now = Date.parse('2026-10-01T14:00:00Z');
const ago = (ms) => new Date(now - ms).toISOString();

test('the PC is awake: the server leaves Pegasus to it', () => {
  assert.equal(decide({ now, pcSeenAt: ago(60 * 1000), state: {}, pcHead: 'a' }), 'pc-on');
});

test('the PC is off: the server wakes Pegasus', () => {
  assert.equal(decide({ now, pcSeenAt: ago(PC_FRESH_MS + 1000), state: {}, pcHead: 'a' }), 'run');
  assert.equal(decide({ now, pcSeenAt: undefined, state: {}, pcHead: 'a' }), 'run');
});

test('after a usage limit it waits', () => {
  const state = { pauseUntil: new Date(now + 60000).toISOString() };
  assert.equal(decide({ now, state, pcHead: 'a' }), 'limit-pause');
});

test('nothing open: quiet until the PC line moves or the pause ends', () => {
  const state = { idleAt: ago(10 * 60 * 1000), idleHead: 'a' };
  assert.equal(decide({ now, state, pcHead: 'a' }), 'idle');
  assert.equal(decide({ now, state, pcHead: 'b' }), 'run');
  assert.equal(decide({ now, state: { idleAt: ago(IDLE_PAUSE_MS + 1), idleHead: 'a' }, pcHead: 'a' }), 'run');
});

test('a daily cap, reset the next day', () => {
  const state = { day: '2026-10-01', runs: DAILY_CAP };
  assert.equal(decide({ now, state, pcHead: 'a' }), 'cap');
  assert.equal(decide({ now, state: { day: '2026-09-30', runs: DAILY_CAP }, pcHead: 'a' }), 'run');
});
