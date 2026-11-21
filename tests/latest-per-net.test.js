'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ML = require('../lib/monitor-logic.js');

const R = [
  { at: '2026-09-20T10:00', nets: ['instagram'], title: 'old ig' },
  { at: '2026-09-23T10:00', nets: ['instagram', 'tiktok'], title: 'new both' },
  { at: '2026-09-22T10:00', nets: ['tiktok'], title: 'old tt' },
  { at: '2026-09-24T10:00', nets: ['facebook'], title: 'fb' },
];

test('one network gets only its newest report', () => {
  assert.deepStrictEqual(ML.latestPerNet(R, ['instagram']).map(r => r.title), ['new both']);
});

test('all networks: newest per network, shared report once, newest first', () => {
  const t = ML.latestPerNet(R, ['youtube', 'tiktok', 'facebook', 'instagram']).map(r => r.title);
  assert.deepStrictEqual(t, ['fb', 'new both']);
});
