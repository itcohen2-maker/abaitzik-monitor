'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { when, gitStuck, refused, heldProblem } = require('../watchdog.js');

test('the watchdog reads systemd timestamps as UTC', () => {
  assert.equal(when('Sun 2026-09-27 19:02:22 UTC'), Date.parse('2026-09-27T19:02:22Z'));
  assert.ok(isNaN(when('')));
});

test('a detached HEAD or a rebase counts only after three minutes', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'));
  const git = path.join(repo, '.git');
  fs.mkdirSync(git);
  fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
  const now = Date.now();
  assert.equal(gitStuck(repo, now + 10 * 60000), '');
  fs.writeFileSync(path.join(git, 'HEAD'), 'f5fe92d4f5fe92d4\n');
  assert.equal(gitStuck(repo, now + 1000), '');
  assert.match(gitStuck(repo, now + 10 * 60000), /מנותק/);
  fs.mkdirSync(path.join(git, 'rebase-merge'));
  assert.match(gitStuck(repo, now + 10 * 60000), /rebase/);
  assert.equal(gitStuck(path.join(repo, 'nope'), now), '');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('a time inside a file name is not a refused login', () => {
  assert.equal(refused('זמן תשובה תוקן: 20261001-1401-claude-ner-candles-pc.json'), false);
  assert.equal(refused('took 1401 ms'), false);
  assert.equal(refused('API Error: 401 authentication_error'), true);
  assert.equal(refused('Please run /login'), true);
});

test('a message held without the code is reported after three minutes, not before', () => {
  const now = Date.parse('2026-10-02T17:00:00Z');
  const m = (min, extra) => Object.assign({ at: new Date(now - min * 60000).toISOString(),
    from: 'unverified', status: 'held', text: 'קובץ: IMG_4359.jpeg' }, extra || {});
  assert.equal(heldProblem([m(1)], now), '');
  assert.match(heldProblem([m(5)], now), /נעצרו.*IMG_4359/);
  assert.equal(heldProblem([m(5, { status: 'done' })], now), '');
  assert.equal(heldProblem([m(5, { from: 'itzik' })], now), '');
  assert.equal(heldProblem([m(2 * 24 * 60)], now), '');
});
