'use strict';
// 15.11.2026: mail-read.js tries each step once more, then says plainly what was checked and what is next.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../mail-read.js');

test('twice: a passing glitch is retried once quietly', async () => {
  let n = 0;
  const v = await M.twice(() => { n++; if (n === 1) throw new Error('glitch'); return 'ok'; }, 0);
  assert.strictEqual(v, 'ok');
  assert.strictEqual(n, 2);
});

test('twice: a second failure is thrown, no third try', async () => {
  let n = 0;
  await assert.rejects(M.twice(() => { n++; throw new Error('down'); }, 0), /down/);
  assert.strictEqual(n, 2);
});

test('failNote: what was checked, where it stopped, the next step, no dashes', () => {
  const a = M.failNote('search', ['--from', 'mac.org.il', '--days', '7'], new Error('imap down'));
  assert.match(a, /--from mac\.org\.il --days 7/);
  assert.match(a, /בחיפוש בתיבה/);
  assert.match(a, /הצעד הבא/);
  const b = M.failNote('read', [], new Error('claude exited 1: OAuth session expired'));
  assert.match(b, /כל התיבה/);
  assert.match(b, /להתחבר מחדש/);
  assert.ok(!/[–—]/.test(a + b));
});
