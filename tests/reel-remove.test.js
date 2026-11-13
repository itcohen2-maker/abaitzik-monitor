'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../lib/reel-remove.js');

test('reel-remove: parse takes the page line with the kind and code lines', () => {
  assert.deepStrictEqual(R.parse('משימה\n🗑 הסרת ריל: story-1-now.jpg\n\nקוד 1234'), { file: 'story-1-now.jpg' });
  assert.deepStrictEqual(R.parse('🗑 הסרת ריל: reel-35-cover.jpg'), { file: 'reel-35-cover.jpg' });
  assert.strictEqual(R.parse('🗑 הסרת ריל: ../keys.json'), null);
  assert.strictEqual(R.parse('🗑 הסרת ריל: a/b.jpg'), null);
  assert.strictEqual(R.parse('🗑 מחיקת ליד: biz-123456'), null);
});

test('reel-remove: apply moves the file out of files-private, never erases', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-'));
  fs.mkdirSync(path.join(d, 'files-private'));
  fs.writeFileSync(path.join(d, 'files-private', 'x.jpg'), 'img');
  const r = R.apply(d, 'x.jpg', Date.parse('2026-11-13T12:00:00Z'));
  assert.ok(r.ok);
  assert.ok(!fs.existsSync(path.join(d, 'files-private', 'x.jpg')));
  assert.strictEqual(fs.readFileSync(path.join(d, '_deleted', '20261113', 'reels', 'x.jpg'), 'utf8'), 'img');
  assert.ok(R.apply(d, 'x.jpg').gone);
  assert.strictEqual(R.apply(d, '../x.jpg').ok, false);
});
