'use strict';
// 12.11.2026, Itzik: a guard over the wish each new trial wrote in the questionnaire (Chen: "לנקות לי את המייל").
const test = require('node:test');
const assert = require('node:assert');
const TW = require('../lib/trial-wishes.js');

test('cleaning mail: entry, then connect, then cannot (we have no permission to delete)', () => {
  const w = 'לנקות לי את המייל';
  assert.strictEqual(TW.status({ wish: w, visited: false, google: false, answers: [] }), 'entry');
  assert.strictEqual(TW.status({ wish: w, visited: true, google: false, answers: [] }), 'connect');
  assert.strictEqual(TW.status({ wish: w, visited: true, google: true, answers: [] }), 'cannot');
});

test('an answer that names the wish closes it; other wishes need entry only', () => {
  assert.strictEqual(TW.status({ wish: 'לסדר את המשימות', visited: true, google: false, answers: ['סידרתי את המשימות לפי ימים'] }), 'done');
  assert.strictEqual(TW.status({ wish: 'לסדר את המשימות', visited: true, google: false, answers: [] }), 'open');
  assert.strictEqual(TW.status({ wish: '', visited: true }), '');
});

test('the card line warns on what cannot be done', () => {
  const it = TW.item([{ id: 't1', name: 'חן', wish: 'לנקות לי את המייל', st: 'cannot', say: 'x', hours: 1 }]);
  assert.strictEqual(it.st, 'warn');
  assert.match(it.sub, /חן ביקש "לנקות לי את המייל"/);
  assert.strictEqual(TW.item([]), null);
});
