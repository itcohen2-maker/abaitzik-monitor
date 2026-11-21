'use strict';
// 20.11.2026: a PC task that answers several of his messages hands every one of them to the PC.
const test = require('node:test');
const assert = require('node:assert');
const { handedIds } = require('../lib/pc-handed.js');

test('a task with alsoRe hands all its ids', () => {
  const ids = handedIds([{ re: 'wa-1', alsoRe: ['wa-2'], status: 'done' }]);
  assert.ok(ids.has('wa-1') && ids.has('wa-2'));
});

test('failed and test tasks hand nothing', () => {
  assert.strictEqual(handedIds([{ re: 'wa-3', status: 'failed' }, { re: 'wa-4', test: true }]).size, 0);
});

test('a task without alsoRe keeps the old behaviour', () => {
  assert.deepStrictEqual([...handedIds([{ re: 'wa-5' }])], ['wa-5']);
});
