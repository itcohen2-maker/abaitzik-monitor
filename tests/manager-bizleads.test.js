'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { bizLeadsItem } = require('../lib/manager.js');

const NOW = Date.parse('2026-11-14T08:00:00Z');
test('bizLeadsItem: a lead still new after two hours is named on the card', () => {
  const it = bizLeadsItem([
    { kind: 'lead', name: 'אופירה', status: 'חדש', at: '2026-11-12T22:13:56Z' },
    { kind: 'lead', name: 'טרי', status: 'חדש', at: '2026-11-14T07:30:00Z' },
    { kind: 'lead', name: 'בדיקה', status: 'חדש', at: '2026-11-10T07:30:00Z', test: true },
    { kind: 'customer', name: 'סגור', status: 'נסגר', at: '2026-11-01T07:30:00Z' },
  ], NOW);
  assert.strictEqual(it.st, 'warn');
  assert.match(it.t, /ליד אחד/);
  assert.match(it.sub, /אופירה \(מאתמול\)/);
  assert.doesNotMatch(it.sub, /טרי|בדיקה|סגור/);
});
test('bizLeadsItem: the day to get back has come', () => {
  const it = bizLeadsItem([{ kind: 'lead', name: 'דנה', status: 'בשיחה', at: '2026-11-01T07:30:00Z', nextAt: '2026-11-14' }], NOW);
  assert.match(it.sub, /הגיע היום לחזור: דנה/);
});
test('bizLeadsItem: nothing waiting', () => {
  const it = bizLeadsItem([{ kind: 'lead', name: 'דנה', status: 'בשיחה', at: '2026-11-01T07:30:00Z', nextAt: '2026-11-20' }], NOW);
  assert.strictEqual(it.st, 'done');
});
test('bizLeadsItem: an own number is a test and is not counted', () => {
  const it = bizLeadsItem([{ kind: 'lead', name: 'אני', phone: '050', status: 'חדש', at: '2026-11-10T07:30:00Z' }], NOW, (t) => /050/.test(t));
  assert.strictEqual(it.st, 'done');
});
