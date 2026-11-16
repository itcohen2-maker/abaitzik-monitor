const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { twinIds } = require('../lib/twin-answer.js');

/*
  16.11.2026: the wa-bridge sent one message twice (22 s apart). The first copy was answered, the
  second was reported as "הודעה נשארה בלי תשובה" and sent back to the queue.
*/
const A = { id: 'A', from: 'itzik', text: 'דף הקמה\nרינת: גוגל חובר', at: '2026-11-16T17:07:16.146Z' };
const B = { id: 'B', from: 'itzik', text: 'דף הקמה\nרינת: גוגל חובר', at: '2026-11-16T17:07:39.517Z' };

test('a repeat of an answered message, same text within minutes, is answered by its twin', () => {
  assert.deepStrictEqual([...twinIds([A, B], new Set(['A']))], ['B']);
});

test('the same text days later is a new request and stays open', () => {
  const C = Object.assign({}, B, { id: 'C', at: '2026-11-18T17:07:39.517Z' });
  assert.deepStrictEqual([...twinIds([A, C], new Set(['A']))], []);
});

test('a different message is not a twin', () => {
  const D = Object.assign({}, B, { id: 'D', text: 'משהו אחר' });
  assert.deepStrictEqual([...twinIds([A, D], new Set(['A']))], []);
});

test('an unanswered original does not make its repeat answered', () => {
  assert.deepStrictEqual([...twinIds([A, B], new Set())], []);
});

test('worker wires the twin check into both the pending filter and answeredIds', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
  assert.ok(src.includes("require('./lib/twin-answer.js').twinIds(all, answeredIds)"));
  assert.ok(src.includes("require('./lib/twin-answer.js').twinIds(records, out)"));
});
