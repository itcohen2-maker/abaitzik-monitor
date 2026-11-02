'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { claims, emptyClaims } = require('../lib/claim-check.js');

test('claims: the 22.10 cameras answer is a claim, a refusal is not', () => {
  assert.ok(claims('השלמתי את ההוראות עם כל מה שהסברת'));
  assert.ok(claims('עדכנתי את האריח'));
  assert.ok(!claims('לא עדכנתי עדיין, צריך את הברקוד'));
  assert.ok(!claims('העברתי למחשב'));
});

function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-'));
  const g = (...a) => execFileSync('git', a, { cwd: d });
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  fs.mkdirSync(path.join(d, 'docs')); fs.writeFileSync(path.join(d, 'docs', 'index.html'), 'a');
  g('add', '.'); g('commit', '-qm', 'base');
  return { d, g };
}

test('emptyClaims: only the rebuilt page changed, so the claim is empty', () => {
  const { d, g } = repo();
  const since = Date.now();
  fs.writeFileSync(path.join(d, 'docs', 'index.html'), 'b'); g('commit', '-qam', 'rebuild');
  const list = [{ id: 'm1', file: 'x.json' }];
  const all = [{ from: 'claude', re: 'm1', at: new Date().toISOString(), text: 'השלמתי את ההוראות' }];
  assert.strictEqual(emptyClaims(all, list, since, d, path.join(d, 'data')).length, 1);
});

test('emptyClaims: a private file that changed is real work', () => {
  const { d } = repo();
  const since = Date.now() - 1000;
  fs.mkdirSync(path.join(d, 'data', 'files-private'), { recursive: true });
  fs.writeFileSync(path.join(d, 'data', 'files-private', 'cameras.txt'), 'steps');
  const list = [{ id: 'm1', file: 'x.json' }];
  const all = [{ from: 'claude', re: 'm1', at: new Date().toISOString(), text: 'השלמתי את ההוראות' }];
  assert.strictEqual(emptyClaims(all, list, since, d, path.join(d, 'data')).length, 0);
});
