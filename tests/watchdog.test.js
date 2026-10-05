'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { when, gitStuck, refused, heldProblem, pcProblems, doctorFaults } = require('../watchdog.js');

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

test('a task waiting for a PC that is off is not a fault, and the clock starts when it wakes', () => {
  const now = Date.parse('2026-10-05T05:00:00Z');
  const t = { status: 'pending', at: '2026-10-05T04:00:00Z', task: 'דוח הרשתות היומי' };
  assert.deepEqual(pcProblems([t], false, 0, now), []);
  assert.deepEqual(pcProblems([t], true, now - 2 * 60000, now), []);
  assert.match(pcProblems([t], true, now - 11 * 60000, now)[0], /מחכה יותר מעשר דקות/);
  const c = { status: 'claimed', claimedAt: '2026-10-05T04:00:00Z', task: 'x' };
  assert.deepEqual(pcProblems([c], false, 0, now), []);
  assert.match(pcProblems([c], true, now - 30 * 60000, now)[0], /תקוע/);
});

test('the doctor is not woken for the PC', () => {
  const now = Date.parse('2026-10-05T05:00:00Z');
  const since = {}; const old = new Date(now - 20 * 60000).toISOString();
  const ps = ['משימה למחשב מחכה יותר מעשר דקות: x', 'המחשב תקוע על משימה יותר מ-25 דקות: y', 'השעון של המענה לא פעיל'];
  ps.forEach((p) => { since[p.replace(/\d+/g, '#')] = old; });
  assert.deepEqual(doctorFaults(ps, since, now), ['השעון של המענה לא פעיל']);
});

test('an answer that has not yet been marked done is a fault only after ten minutes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-stale-'));
  const chat = path.join(dir, 'chat', 'chat');
  fs.mkdirSync(chat, { recursive: true });
  fs.writeFileSync(path.join(dir, 'instance.json'), JSON.stringify({ name: 'test', dataDir: dir }));
  const now = Date.parse('2026-10-05T10:20:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  fs.writeFileSync(path.join(chat, 'a.json'), JSON.stringify({ id: 'm1', at: at(30), from: 'itzik', status: 'working', text: 'x' }));
  fs.writeFileSync(path.join(chat, 'b.json'), JSON.stringify({ at: at(2), from: 'claude', re: 'm1', text: 'y' }));
  fs.writeFileSync(path.join(chat, 'c.json'), JSON.stringify({ id: 'm2', at: at(40), from: 'itzik', status: 'working', text: 'x' }));
  fs.writeFileSync(path.join(chat, 'd.json'), JSON.stringify({ at: at(15), from: 'claude', re: 'm2', text: 'y' }));
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, ['-e',
    'console.log(JSON.stringify(require(' + JSON.stringify(path.join(__dirname, '..', 'watchdog.js')) + ').check(' + now + ')))'],
    { env: Object.assign({}, process.env, { ABAITZIK_INSTANCE_FILE: path.join(dir, 'instance.json') }), encoding: 'utf8' });
  const problems = JSON.parse(out.trim().split('\n').pop());
  assert.ok(problems.includes('1 הודעות נענו ועדיין מסומנות בטיפול'), problems.join(' | '));
  fs.rmSync(dir, { recursive: true, force: true });
});
