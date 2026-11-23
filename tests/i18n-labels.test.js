'use strict';
// 23.11.2026: server built display labels (the data payload of a "ru" page) go through lib/i18n.js fields / values / label.
const test = require('node:test');
const assert = require('node:assert');
const I = require('../lib/i18n.js');

test('labels: Hebrew and any other language come back untouched', () => {
  const row = { id: 'wa', title: 'וואטסאפ', paid: 'כלול, מחברים בתיאום עם IT Solution' };
  assert.strictEqual(I.fields('', row, ['title', 'paid']), row);
  assert.strictEqual(I.label('', 'קרוסלה'), 'קרוסלה');
  assert.deepStrictEqual(I.values('he', { a: 'חשבון פרטי' }), { a: 'חשבון פרטי' });
});

test('labels: a ru row gets its display fields translated and keeps ids and keys', () => {
  const row = { id: 'cat-microsoft', key: 'microsoft', title: 'מיקרוסופט: יומן ומייל', paid: 'כלול, מחברים בתיאום עם IT Solution', link: 'https://x/y' };
  const r = I.fields('ru', row, ['title', 'paid']);
  assert.notStrictEqual(r, row);
  assert.strictEqual(r.id, 'cat-microsoft');
  assert.strictEqual(r.key, 'microsoft');
  assert.strictEqual(r.link, 'https://x/y');
  assert.ok(!/[֐-׿]/.test(r.title + r.paid), r.title + ' / ' + r.paid);
  assert.strictEqual(row.title, 'מיקרוסופט: יומן ומייל', 'the original is not changed');
});

test('labels: short names come from the exact label file, not from the page dictionary', () => {
  assert.strictEqual(I.label('ru', 'קרוסלה'), 'Карусель');
  assert.strictEqual(I.label('ru', 'מקס'), 'Max');
  assert.ok(!Object.prototype.hasOwnProperty.call(I.load('ru'), 'מקס'), 'a bank name must not become a phrase of the whole page');
});

test('labels: the personal tiles, the add-on and the bank names have Russian', () => {
  const A = require('../lib/addons.js'), P = require('../lib/personal.js'), B = require('../lib/bank-flow.js').BANKS;
  const he = /[֐-׿]/;
  P.CATALOG.forEach((c) => assert.ok(!he.test(I.label('ru', c.t)), c.t));
  Object.keys(A.CATALOG).forEach((k) => assert.ok(!he.test(I.label('ru', A.CATALOG[k].short)), A.CATALOG[k].short));
  Object.keys(A.SOFTWARE).forEach((k) => assert.ok(!he.test(I.label('ru', A.SOFTWARE[k])), A.SOFTWARE[k]));
  Object.keys(A.KINDS).forEach((k) => assert.ok(!he.test(I.label('ru', A.KINDS[k])), A.KINDS[k]));
  Object.keys(B).forEach((k) => assert.ok(!he.test(I.label('ru', B[k].name)), B[k].name));
});
