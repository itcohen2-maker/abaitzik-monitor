'use strict';
// 14.11.2026: add-ons and upgrades paid on SUMIT and opened by themselves (lib/addons.js).
const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/addons.js');
const P = require('../lib/plan.js');

const BANKS = { hapoalim: { name: 'בנק הפועלים', kinds: ['private'] }, leumi: { name: 'בנק לאומי', kinds: [] } };
const NOW = Date.UTC(2026, 10, 14, 12);
const st = (plan, more) => Object.assign({ plan, month: P.monthOf(NOW), extra: 0, applied: [], history: [] }, more || {});

test('addons: no paid package, nothing is sold', () => {
  assert.equal(A.quote(null, 'actions', {}, BANKS).why, 'plan');
  assert.equal(A.quote({ plan: 'trial', start: new Date(NOW).toISOString() }, 'actions', {}, BANKS).why, 'plan');
});

test('addons: upgrade costs the difference now and replaces the package standing order', () => {
  const q = A.quote(st('small'), 'upgrade:medium', {}, BANKS);
  assert.equal(q.ok, true);
  assert.equal(A.total(q), 700);
  assert.equal(q.monthly.price, 1400);
  assert.equal(q.monthly.name, A.PKG_PREFIX + 'Medium');
  assert.equal(q.replace, true);
  assert.equal(A.quote(st('large'), 'upgrade:medium', {}, BANKS).why, 'top');
  assert.equal(A.quote(st('small'), 'upgrade:small', {}, BANKS).why, 'top');
  assert.equal(A.quote(st('small'), 'upgrade:huge', {}, BANKS).why, 'unknown');
});

test('addons: monthly add-ons, questions and honesty about banks', () => {
  assert.equal(A.total(A.quote(st('entry'), 'sign50', {}, BANKS)), 49);
  assert.equal(A.quote(st('entry'), 'accounting', {}, BANKS).why, 'answer');
  const ac = A.quote(st('entry'), 'accounting', { software: 'morning' }, BANKS);
  assert.equal(ac.ok, true); assert.deepEqual(ac.answers, { software: 'morning' }); assert.equal(ac.monthly.price, 99);
  assert.equal(A.quote(st('entry'), 'bank', { bank: 'nope', kind: 'private' }, BANKS).why, 'answer');
  assert.equal(A.quote(st('entry'), 'bank', { bank: 'leumi', kind: 'private' }, BANKS).why, 'unsupported');
  assert.equal(A.quote(st('entry'), 'bank', { bank: 'hapoalim', kind: 'business' }, BANKS).why, 'unsupported');
  const bk = A.quote(st('entry'), 'bank', { bank: 'hapoalim', kind: 'private' }, BANKS);
  assert.equal(bk.ok, true); assert.equal(A.total(bk), 149); assert.deepEqual(bk.answers, { bank: 'hapoalim', kind: 'private' });
  assert.equal(A.quote(st('entry', { addons: { bank: { on: true } } }), 'bank', { bank: 'hapoalim', kind: 'private' }, BANKS).why, 'have');
});

test('addons: a confirmed payment changes the plan once', () => {
  const up = A.apply(st('small'), A.quote(st('small'), 'upgrade:large', {}, BANKS), 111, NOW);
  assert.equal(up.plan, 'large');
  assert.equal(A.apply(up, A.quote(st('small'), 'upgrade:large', {}, BANKS), 111, NOW), up);
  const ac = A.apply(st('entry'), A.quote(st('entry'), 'actions', {}, BANKS), 222, NOW);
  assert.equal(ac.extra, 200);
  assert.equal(P.status(ac, '', NOW).total, 400);
  const bk = A.apply(st('entry'), A.quote(st('entry'), 'bank', { bank: 'hapoalim', kind: 'private' }, BANKS), 333, NOW);
  assert.equal(bk.addons.bank.on, true); assert.equal(bk.addons.bank.bank, 'hapoalim'); assert.equal(bk.addons.bank.paymentId, 333);
  assert.equal(A.apply(bk, { kind: 'bank' }, 333, NOW), bk);
});

test('addons: only the package standing order is cancelled on an upgrade', () => {
  const items = [{ ID: 1, Item: { Name: 'המוניטור העסקי, חבילת כניסה' } }, { ID: 2, Item: { Name: 'חיבור לבנק, קריאה בלבד' } }, { ID: 3, Item: { Name: 'משהו אחר' } }];
  assert.deepEqual(A.packageItems(items).map((x) => x.ID), [1]);
});

test('addons: the menu shows what is on and the upgrades above', () => {
  const m = A.menu(st('small', { addons: { sign50: { on: true } } }), BANKS);
  assert.equal(m.addons.find((x) => x.key === 'sign50').on, true);
  assert.deepEqual(m.upgrades.map((x) => x.key), ['upgrade:medium', 'upgrade:large']);
  assert.equal(A.menu(null, BANKS), null);
});
