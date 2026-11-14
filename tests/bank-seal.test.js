'use strict';
// 14.11.2026: bank files at rest are sealed (lib/bank-seal.js), and money.js still reads them.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const gate = require('../gate.js');
const S = require('../lib/bank-seal.js');

const doc = { at: '2026-11-14T13:47:25.126Z', bank: 'hapoalim', balance: 150.5, movements: [{ date: '2026-11-10', amount: -350, payee: 'חשמל' }] };

test('sealed file: no payee or balance in the clear, opens back to the same document', { skip: !gate.enabled() && 'no gate key here' }, () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bseal-')), 'hapoalim-1.json');
  S.write(f, doc);
  const raw = fs.readFileSync(f, 'utf8');
  assert.ok(!raw.includes('חשמל') && !raw.includes('150.5') && !raw.includes('hapoalim'), 'nothing readable');
  assert.ok(JSON.parse(raw).sealed, 'still valid JSON');
  assert.deepStrictEqual(S.read(f), doc);
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
});

test('a plain old file still reads, a damaged one gives null', () => {
  assert.deepStrictEqual(S.open(doc), doc);
  assert.strictEqual(S.open({ sealed: 'AAAA.BBBB' }), null);
});

test('money.js and importDone go through bank-seal', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.readFileSync(path.join(root, 'money.js'), 'utf8').includes("bank-seal.js"));
  assert.ok(fs.readFileSync(path.join(root, 'lib', 'bank-flow.js'), 'utf8').includes("bankSeal.write("));
});
