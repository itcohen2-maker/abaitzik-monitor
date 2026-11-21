'use strict';
// 21.11.2026 security review: a plan file that is broken, empty or unreadable blocks the session. It never exempts.
const { test } = require('node:test');
const assert = require('node:assert');
const H = require('../lib/plan-hold.js');

test('negative: a plan file that exists but gives no status holds the session, it is not exempt', () => {
  assert.equal(H.decide({ name: 't1', fileExists: true, status: null, threw: false }), 'hold');
});
test('negative: an unreadable plan status (exception) holds the session', () => {
  assert.equal(H.decide({ name: 't1', fileExists: true, status: null, threw: true }), 'hold');
  assert.equal(H.decide({ name: 't1', fileExists: false, status: null, threw: true }), 'hold');
});
test('negative: an empty status (no level) holds the session', () => {
  assert.equal(H.decide({ name: 't1', fileExists: true, status: { plan: 'solo' }, threw: false }), 'hold');
});
test('a customer with no plan file at all is not enforced (exempt), Itzik\'s own monitor is exempt', () => {
  assert.equal(H.decide({ name: 't1', fileExists: false, status: null, threw: false }), 'exempt');
  assert.equal(H.decide({ name: 'abaitzik', fileExists: true, status: null, threw: true }), 'exempt');
});
test('a valid status goes on to the level check', () => {
  assert.equal(H.decide({ name: 't1', fileExists: true, status: { level: 'ok' }, threw: false }), 'check');
});
