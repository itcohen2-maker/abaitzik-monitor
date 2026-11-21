'use strict';
// 21.11.2026, Itzik: the signup asks how to address the customer (gender) and what his trade is; his monitor
// follows: the wording by the gender, the home screen by the trade (lib/trades.js). Neither decides the other.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/signup-profile.js');

test('the answers keep gender and a known trade, and drop anything else', () => {
  const a = P.sanitize({ gender: 'f', trade: 'gypsum' });
  assert.strictEqual(a.gender, 'f');
  assert.strictEqual(a.trade, 'gypsum');
  assert.strictEqual(P.sanitize({ gender: 'x', trade: '../etc', pains: ['money'] }).gender, '');
  assert.strictEqual(P.sanitize({ gender: 'x', trade: '../etc', pains: ['money'] }).trade, '');
  assert.ok(P.sanitize({ gender: 'm' }), 'the address alone is an answer');
  assert.ok(P.sanitize({ trade: 'photo' }), 'the trade alone is an answer');
});

test('a trade gives the kind of business when he did not say', () => {
  assert.strictEqual(P.sanitize({ trade: 'gypsum' }).biz, 'field');
  assert.strictEqual(P.sanitize({ trade: 'consult' }).biz, 'office');
  assert.strictEqual(P.sanitize({ trade: 'beauty', biz: 'shop' }).biz, 'shop');
});

test('what goes into his instance.json: only what he answered', () => {
  assert.deepStrictEqual(P.instanceFields(P.sanitize({ gender: 'f', trade: 'beauty' })), { gender: 'f', trade: 'beauty' });
  assert.deepStrictEqual(P.instanceFields(P.sanitize({ gender: 'm' })), { gender: '' });
  assert.deepStrictEqual(P.instanceFields(P.sanitize({ pains: ['money'] })), {});
  assert.deepStrictEqual(P.instanceFields(null), {});
});

test('his profile and his welcome speak to her as she asked', () => {
  const a = P.sanitize({ gender: 'f', trade: 'beauty', pains: ['money'] });
  const s = P.profileSection(a);
  assert.match(s, /לפנות בלשון נקבה/);
  assert.match(s, /המקצוע: קוסמטיקאית/);
  assert.match(P.welcome('מור', a).title, /^ברוכה הבאה, מור/);
  assert.match(P.welcome('דוד', P.sanitize({ gender: 'm', pains: ['money'] })).title, /^ברוך הבא, דוד/);
  assert.match(P.summaryLine('מור', a), /קוסמטיקאית/);
});
