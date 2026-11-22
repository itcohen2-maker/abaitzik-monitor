'use strict';
// 22.11.2026, Itzik: an admin request that is only the empty circle's opening words is never sent or filed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { isEmptyAsk } = require('../lib/change-requests.js');

test('only the opening words is empty', () => {
  assert.ok(isEmptyAsk('בעיגול הריק במסך הבית הייתי רוצה:'));
  assert.ok(isEmptyAsk('בעיגול הריק במסך הבית הייתי רוצה: '));
  assert.ok(isEmptyAsk('בעיגול הריק במסך הבית הייתי רוצה: (בתור אייקון במסך הבית)'));
  assert.ok(isEmptyAsk('   '));
});

test('a real wish is not empty', () => {
  assert.ok(!isEmptyAsk('בעיגול הריק במסך הבית הייתי רוצה: יומן התקנות'));
  assert.ok(!isEmptyAsk('תוסיף לי כפתור של רשימת קניות'));
});

test('the page and the listener both check it', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.readFileSync(path.join(root, 'listen.js'), 'utf8').includes('cr.isEmptyAsk(ask)'));
  assert.ok(fs.readFileSync(path.join(root, 'build.js'), 'utf8').includes("toast('כתוב אחרי המשפט מה תרצה שיהיה בעיגול, ואז שלח')"));
});
