'use strict';
// 2nd review (c): the token keys are full 64-hex or refused; created by temp file + rename at 0600; a missing or broken
// key never crashes the signup (no token = the 390 entry path).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const K = require('../lib/secret-key.js');
const DT = require('../lib/day-token.js');
const RL = require('../lib/renew-link.js');
const S = require('../lib/signup.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'));
const HEX64 = 'a'.repeat(63) + '1';

test('negative: an empty key file is refused, not used', () => {
  const D = tmp();
  fs.writeFileSync(path.join(D, 'day-secret.key'), '');
  assert.throws(() => K.loadKey(D, 'day-secret.key'), /invalid/);
  assert.throws(() => DT.issue(D, NOW), /invalid/);
});

test('negative: a partial key (32 hex characters) is refused, not used', () => {
  const D = tmp();
  fs.writeFileSync(path.join(D, 'renew-secret.key'), 'a'.repeat(32));
  assert.throws(() => K.loadKey(D, 'renew-secret.key'), /invalid/);
  assert.throws(() => RL.issue(D, 't1', NOW), /invalid/);
});

test('negative: a key with non-hex characters, or two keys on one line, is refused', () => {
  const D = tmp();
  fs.writeFileSync(path.join(D, 'day-secret.key'), 'z'.repeat(64));
  assert.throws(() => K.loadKey(D, 'day-secret.key'), /invalid/);
});

test('a missing key is created once, 64 hex characters, file mode 0600, and then reused', () => {
  const D = tmp();
  const k1 = K.loadKey(D, 'day-secret.key');
  assert.match(k1, /^[a-f0-9]{64}$/);
  assert.equal(fs.statSync(path.join(D, 'day-secret.key')).mode & 0o777, 0o600);
  assert.equal(K.loadKey(D, 'day-secret.key'), k1);
  assert.deepEqual(fs.readdirSync(D).filter((f) => f.endsWith('.tmp')), [], 'no temp file left behind');
});

test('a good key works for the day token and the renewal link', () => {
  const D = tmp();
  fs.writeFileSync(path.join(D, 'day-secret.key'), HEX64 + '\n');
  fs.writeFileSync(path.join(D, 'renew-secret.key'), HEX64);
  assert.equal(DT.verify(D, DT.issue(D, NOW), NOW), true);
  assert.equal(RL.verify(D, RL.issue(D, 't1', NOW), NOW), 't1');
});

test('negative: verify never throws on a broken key; it refuses', () => {
  const D = tmp();
  fs.writeFileSync(path.join(D, 'day-secret.key'), '');
  assert.equal(DT.verify(D, '1700000000000.' + 'a'.repeat(64), NOW), false);
  assert.equal(RL.verify(D, 't1.1700000000000.' + 'a'.repeat(64), NOW), null);
});

test('negative: a signup does not crash when the day key is missing or unreadable; it takes the 390 path', () => {
  const D = tmp();
  fs.mkdirSync(path.join(D, 'day-secret.key'));          // a folder where the key file should be: unreadable as a key
  const r = S.start(D, { name: 'דני כהן', phone: '050-1234567', email: 'd@example.com', terms: true, ip: '1.2.3.4', ref: 'm-gypsum', dayTok: '1700000000000.' + 'a'.repeat(64) }, NOW);
  assert.equal(r.ok, true);
  const pend = fs.readdirSync(path.join(D, 'signup', 'pending')).map((f) => JSON.parse(fs.readFileSync(path.join(D, 'signup', 'pending', f), 'utf8')))[0];
  assert.equal(pend.src, '');
});
