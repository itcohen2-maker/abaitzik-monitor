'use strict';
// 12.11.2026, Itzik: building, moving or arranging tiles is never counted as an action.
const test = require('node:test');
const assert = require('node:assert');
const { billable } = require('../lib/plan.js');

test('tile and personal mode requests are free', () => {
  ['מצב אישי: תוסיף לי טבלת משחקים [p1]', 'מצב אישי בקשה: מחיר קוטג׳', 'תוסיף לי אריח של לקוחות', 'תזיז את המשימות למעלה', 'אפשר לסדר את המסך אחרת?']
    .forEach((t) => assert.strictEqual(billable({ text: t }), false, t));
});

test('ordinary requests are actions', () => {
  ['תכתוב תשובה ללקוח שפנה אתמול', 'מה יש לי מחר ביומן?', 'תכין הצעת מחיר']
    .forEach((t) => assert.strictEqual(billable({ text: t }), true, t));
});
