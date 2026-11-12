'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../lib/camp-ask.js');

test('parse keeps up to three questions and four answers, strips dashes', () => {
  const r = C.parse('here {"ready":false,"note":"חסר קהל - ומטרה","questions":[{"q":"מי הקהל?","opts":["a","b","c","d","e"]},{"q":"למה?","opts":[]},{"q":"x","opts":["y"]},{"q":"z","opts":[]}]} end');
  assert.strictEqual(r.ready, false);
  assert.strictEqual(r.questions.length, 3);
  assert.strictEqual(r.questions[0].opts.length, 4);
  assert.ok(!/-/.test(r.note));
});

test('parse returns null on junk', () => {
  assert.strictEqual(C.parse('no json'), null);
  assert.strictEqual(C.parse('{bad'), null);
});

test('ask uses haiku with the known text, and caps per monitor per day', async () => {
  let seen;
  const llm = async (model, sys, inp) => { seen = { model, sys, inp }; return '{"ready":true,"note":"","questions":[]}'; };
  const r = await C.ask(llm, { kinds: ['פוסט'], text: 'מי הקהל? נשים בחיפה', files: ['a.png'] }, { name: 'tcap1', business: 'סטודיו' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.ready, true);
  assert.strictEqual(seen.model, 'haiku');
  assert.ok(seen.inp.includes('נשים בחיפה'));
  assert.ok(seen.sys.includes('סטודיו'));
  for (let i = 1; i < 60; i++) C.allow('tcap2');
  assert.strictEqual(C.allow('tcap2'), true);
  assert.strictEqual(C.allow('tcap2'), false);
});

test('a failing model is a 502, never a throw', async () => {
  const r = await C.ask(async () => { throw new Error('x'); }, {}, { name: 'tfail' });
  assert.strictEqual(r.status, 502);
});
