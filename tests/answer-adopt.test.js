'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { adoptReplies } = require('../lib/answer-adopt.js');

function dir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-')); }
function put(d, name, obj) { fs.writeFileSync(path.join(d, name), JSON.stringify(obj), 'utf8'); }

test('a message answered in its own reply field gets a visible claude record', () => {
  const d = dir();
  put(d, '20261115-075409-itzik-auto.json', { from: 'itzik', id: 'stk-1', status: 'done', reply: 'נכתב פוסט' });
  const made = adoptReplies(d, [{ id: 'stk-1', file: '20261115-075409-itzik-auto.json' }], new Date('2026-11-15T05:56:00Z'));
  assert.strictEqual(made.length, 1);
  const rec = JSON.parse(fs.readFileSync(path.join(d, made[0]), 'utf8'));
  assert.strictEqual(rec.from, 'claude');
  assert.strictEqual(rec.re, 'stk-1');
  assert.strictEqual(rec.text, 'נכתב פוסט');
});

test('a second run does not write a second record', () => {
  const d = dir();
  put(d, 'm.json', { from: 'itzik', id: 'stk-2', status: 'done', reply: 'ok' });
  const list = [{ id: 'stk-2', file: 'm.json' }];
  assert.strictEqual(adoptReplies(d, list).length, 1);
  assert.strictEqual(adoptReplies(d, list).length, 0);
});

test('a message with a real claude answer is left alone', () => {
  const d = dir();
  put(d, 'm.json', { from: 'itzik', id: 'x', status: 'done', reply: 'לא אמור להיכתב' });
  put(d, '20261115-0800-claude-a.json', { from: 'claude', re: 'x', text: 'תשובה' });
  assert.strictEqual(adoptReplies(d, [{ id: 'x', file: 'm.json' }]).length, 0);
});

test('a message with no reply gets nothing', () => {
  const d = dir();
  put(d, 'm.json', { from: 'itzik', id: 'y', status: 'working' });
  assert.strictEqual(adoptReplies(d, [{ id: 'y', file: 'm.json' }]).length, 0);
});

test('a missing folder or file does not throw', () => {
  assert.deepStrictEqual(adoptReplies(path.join(os.tmpdir(), 'no-such-dir-xyz'), [{ id: 'z', file: 'z.json' }]), []);
  const d = dir();
  assert.deepStrictEqual(adoptReplies(d, [{ id: 'z', file: 'gone.json' }]), []);
});
