'use strict';
// 12.11.2026, Itzik: the first scan after Gmail is connected, its questions, and the customer's sorting rules.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MP = require('../lib/mail-prefs.js');

test('the customer rules override the sorter', () => {
  const p = { important: ['dana@x.co.il', 'client.com'], promo: ['news@shop.com'] };
  assert.strictEqual(MP.tagFor('Shop <news@shop.com>', 'חשוב', p), 'פרסומת');
  assert.strictEqual(MP.tagFor('Dana <dana@x.co.il>', 'רגיל', p), 'חשוב');
  assert.strictEqual(MP.tagFor('a@mail.client.com', 'פרסומת', p), 'חשוב');
  assert.strictEqual(MP.tagFor('a@client.com', 'דחוף', p), 'דחוף');
  assert.strictEqual(MP.tagFor('other@y.com', 'רגיל', p), 'רגיל');
});

test('set moves a sender between lists and keeps the note', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-'));
  MP.set(d, { promo: ['A@B.com'], note: 'ספקים חשובים' });
  const p = MP.set(d, { important: ['a@b.com'] });
  assert.deepStrictEqual(p.important, ['a@b.com']);
  assert.deepStrictEqual(p.promo, []);
  assert.strictEqual(p.note, 'ספקים חשובים');
});

test('the first report lists the urgent mail, asks questions and has no dashes', () => {
  const items = [
    { from: 'Dana <dana@x.co.il>', subject: 'הזמנה', text: 'מחכה להצעת מחיר היום', tag: 'דחוף' },
    { from: 'Shop <news@shop.com>', subject: 'מבצע', text: 'מבצע', tag: 'פרסומת' },
    { from: 'Shop <news@shop.com>', subject: 'מבצע 2', text: 'מבצע', tag: 'פרסומת' },
  ];
  const r = MP.firstReport(items, 7);
  assert.match(r.body, /3 מיילים/);
  assert.match(r.body, /מחכה להצעת מחיר היום/);
  assert.match(r.body, /news@shop\.com/);
  assert.match(r.body, /מי הלקוחות/);
  assert.doesNotMatch(r.title + r.body, /[‐-―]| - /);
  const empty = MP.firstReport([], 7);
  assert.match(empty.body, /לא מצאתי שום דבר דחוף/);
});
