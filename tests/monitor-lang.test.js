'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../lib/monitor-lang.js');

test('monitor language: the settings line, the file, unknown words refused', () => {
  assert.deepStrictEqual(L.parse('שפת המוניטור: רוסית'), { lang: 'ru' });
  assert.deepStrictEqual(L.parse('שפת המוניטור:עברית'), { lang: '' });
  assert.strictEqual(L.parse('שפת המוניטור: צרפתית'), null);
  assert.strictEqual(L.parse('שם המוניטור: רוסית'), null);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mlang-'));
  assert.strictEqual(L.read(d), null);
  L.set(d, 'ru'); assert.strictEqual(L.read(d), 'ru');
  L.set(d, 'xx'); assert.strictEqual(L.read(d), '');
});
