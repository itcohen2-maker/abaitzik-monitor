'use strict';
// 4th review: a tile command is free only when the whole message is the command (see lib/plan.js FREE_RE).
const { test } = require('node:test');
const assert = require('node:assert');
const { billable } = require('../lib/plan.js');

test('a tile command or personal mode alone is free', () => {
  ['מצב אישי', 'תוסיף לי אריח', 'תזיז את האריח', 'תבנה לי כפתור']
    .forEach((t) => assert.strictEqual(billable({ text: t }), false, t));
});

test('negative: a tile command with a request after it is an action (the rest is work)', () => {
  ['מצב אישי: תוסיף לי טבלת משחקים [p1]', 'מצב אישי בקשה: מחיר קוטג׳', 'תזיז את המשימות למעלה', 'אפשר לסדר את המסך אחרת?', 'תבנה לי כפתור לשליחת הצעות ואז כתוב חוזה']
    .forEach((t) => assert.strictEqual(billable({ text: t }), true, t));
});

test('ordinary requests are actions', () => {
  ['תכתוב תשובה ללקוח שפנה אתמול', 'מה יש לי מחר ביומן?', 'תכין הצעת מחיר']
    .forEach((t) => assert.strictEqual(billable({ text: t }), true, t));
});
