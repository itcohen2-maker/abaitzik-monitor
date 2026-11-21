'use strict';
/*
  The two checks that stand between a forwarded link and somebody's monitor.
  A weak code accepted here is a code the next guesser tries first; a token
  compare that leaks its length or accepts an empty string is a link that
  works for anyone.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const { codeProblem, sameToken } = require('../setup-server.js');

test('a sound six to eight digit code is accepted', () => {
  for (const c of ['418273', '90817263', '5582931']) assert.equal(codeProblem(c), '', c);
});

test('too short, too long, or not digits is refused', () => {
  for (const c of ['12345', '123456789', 'abcdef', '12 3456', '', null, undefined]) assert.ok(codeProblem(c), String(c));
});

test('the codes a guesser tries first are refused', () => {
  for (const c of ['000000', '111111', '123456', '654321', '1234567', '98765432', '345678']) assert.ok(codeProblem(c), c);
});

test('the token must match exactly and can never be empty', () => {
  assert.equal(sameToken('abc123', 'abc123'), true);
  assert.equal(sameToken('abc123', 'abc124'), false);
  assert.equal(sameToken('', ''), false);
  assert.equal(sameToken(undefined, ''), false);
  assert.equal(sameToken('abc', 'abc123'), false);
});
