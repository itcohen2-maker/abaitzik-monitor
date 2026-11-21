'use strict';
/*
  21.11.2026 security review: the launch price (149 and 249) is decided by a token the server issued, never by the ref
  text a client types. lib/day-token.js: HMAC over the issue time, two hours of life, a per-install secret.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const T = require('../lib/day-token.js');
const S = require('../lib/signup.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'daytok-'));

test('a token issued now verifies now and up to two hours later', () => {
  const D = tmp();
  const tok = T.issue(D, NOW);
  assert.equal(T.verify(D, tok, NOW), true);
  assert.equal(T.verify(D, tok, NOW + 2 * 3600e3 - 1000), true);
});

test('negative: expired, from the future, tampered, malformed, empty, or from another install are refused', () => {
  const D = tmp(), other = tmp();
  const tok = T.issue(D, NOW);
  assert.equal(T.verify(D, tok, NOW + 2 * 3600e3 + 1000), false, 'expired');
  assert.equal(T.verify(D, tok, NOW - 3600e3), false, 'from the future');
  const [ts, mac] = tok.split('.');
  assert.equal(T.verify(D, ts + '.' + mac.replace(/.$/, mac.endsWith('0') ? '1' : '0'), NOW), false, 'tampered');
  assert.equal(T.verify(D, (Number(ts) + 1) + '.' + mac, NOW), false, 'time changed');
  assert.equal(T.verify(D, 'junk', NOW), false, 'malformed');
  assert.equal(T.verify(D, '', NOW), false, 'empty');
  assert.equal(T.verify(D, undefined, NOW), false, 'missing');
  assert.equal(T.verify(other, tok, NOW), false, 'another install');
});

test('negative: a signup with ref m-gypsum and no token is not a trade source; with a valid token it is', () => {
  const D = tmp();
  const base = { name: 'דני כהן', phone: '050-1234567', email: 'd@example.com', terms: true, ip: '1.2.3.4', ref: 'm-gypsum' };
  const noTok = S.start(D, base, NOW);
  assert.equal(noTok.ok, true);
  const pendingNo = fs.readdirSync(path.join(D, 'signup', 'pending')).map((f) => JSON.parse(fs.readFileSync(path.join(D, 'signup', 'pending', f), 'utf8')))[0];
  assert.equal(pendingNo.src, '');
  const D2 = tmp();
  const tok = T.issue(D2, NOW);
  assert.equal(S.start(D2, Object.assign({}, base, { dayTok: tok, email: 'e@example.com' }), NOW).ok, true);
  const pendingYes = fs.readdirSync(path.join(D2, 'signup', 'pending')).map((f) => JSON.parse(fs.readFileSync(path.join(D2, 'signup', 'pending', f), 'utf8')))[0];
  assert.equal(pendingYes.src, 'day');
});
