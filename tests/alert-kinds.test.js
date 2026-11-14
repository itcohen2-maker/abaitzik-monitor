'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const K = require('../lib/alert-kinds.js');

test('parse reads the settings line, set and muted follow it', () => {
  const v = K.parse('הגדרה\nסוגי התראות: תשובות פועל, תזכורות כבוי, קבצים כבוי, משימות פועל');
  assert.deepStrictEqual(v, { answers: true, reminders: false, files: false, tasks: true });
  assert.strictEqual(K.parse('שלום'), null);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ak-')), 'k.json');
  assert.strictEqual(K.muted('reminders', f), false, 'everything on by default');
  const c = K.set(v, f);
  assert.strictEqual(K.muted('reminders', f), true);
  assert.strictEqual(K.muted('answers', f), false);
  assert.strictEqual(K.muted(null, f), false, 'no kind always rings');
  assert.match(K.said(c), /בלי צלצול: תזכורות, קבצים/);
});

test('guess sorts titles into kinds', () => {
  assert.strictEqual(K.guess('תזכורת'), 'reminders');
  assert.strictEqual(K.guess('קובץ חדש'), 'files');
  assert.strictEqual(K.guess('משימה להיום'), 'tasks');
  assert.strictEqual(K.guess('השומר מצא תקלה'), null);
});
