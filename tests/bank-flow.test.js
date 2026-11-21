'use strict';
/*
  14.11.2026: the bank connection (lib/bank-flow.js). The words, the customer's path (a chat
  record with status done and a task file with re = that record), the bank choice, a bank the
  program does not read yet, the computer being off, and the import that deletes the raw upload.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.MONITOR_NO_GATE = '1';
const B = require('../lib/bank-flow.js');

function tenantDir(bank, kind, seenAgoMs) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bank-'));
  const data = path.join(d, 'data');
  fs.mkdirSync(path.join(data, 'chat', 'chat'), { recursive: true });
  fs.mkdirSync(path.join(data, 'status'), { recursive: true });
  if (bank) { fs.mkdirSync(path.join(data, 'bank')); fs.writeFileSync(path.join(data, 'bank', 'config.json'), JSON.stringify({ bank, kind })); }
  if (seenAgoMs !== undefined) fs.writeFileSync(path.join(data, 'status', 'pc-seen-bank.json'), JSON.stringify({ at: new Date(Date.now() - seenAgoMs).toISOString() }));
  return { data, chat: path.join(data, 'chat', 'chat') };
}
function run(t, text) {
  const said = [];
  return B.waTurn({ dataPath: t.data, chatDir: t.chat, text, send: async (s) => { said.push(s); } }).then((r) => ({ r, said }));
}

test('the words', () => {
  assert.ok(B.isOpen('בנק') && B.isOpen('תוריד את הבנק') && B.isOpen(' בנק! '));
  assert.ok(!B.isOpen('בנק הפועלים') && !B.isOpen('מה עם הבנק שלי'));
  assert.ok(B.isIn('התחברתי') && B.isCancel('ביטול בנק'));
});

test('a customer without a bank set up: "בנק" is an ordinary message', async () => {
  const t = tenantDir(null);
  const { r, said } = await run(t, 'בנק');
  assert.strictEqual(r, false);
  assert.strictEqual(said.length, 0);
});

test('a customer with Hapoalim: a done chat record and a task for the bank computer', async () => {
  const t = tenantDir('hapoalim', 'private', 30 * 1000);
  const { r, said } = await run(t, 'בנק');
  assert.ok(r && r.chatId);
  assert.match(said[0], /בנק הפועלים/);
  const recs = fs.readdirSync(t.chat).map((f) => JSON.parse(fs.readFileSync(path.join(t.chat, f), 'utf8')));
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0].status, 'done');
  assert.strictEqual(recs[0].id, r.chatId);
  const tasks = fs.readdirSync(path.join(t.data, 'pc', 'pc')).map((f) => JSON.parse(fs.readFileSync(path.join(t.data, 'pc', 'pc', f), 'utf8')));
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].pc, 'bank');
  assert.strictEqual(tasks[0].re, r.chatId);
  assert.strictEqual(tasks[0].task, 'BANK:RUN hapoalim');
  assert.strictEqual(tasks[0].status, 'pending');
  // a second "בנק" while the window is open queues nothing
  const again = await run(t, 'בנק');
  assert.match(again.said[0], /כבר פתוח/);
  assert.strictEqual(fs.readdirSync(path.join(t.data, 'pc', 'pc')).length, 1);
  // "התחברתי" now is ours, and needs nothing
  const inn = await run(t, 'התחברתי');
  assert.match(inn.said[0], /אין צורך/);
});

test('a bank the program does not read yet, or a business account: a clear answer, no task', async () => {
  for (const [bank, kind] of [['leumi', 'private'], ['hapoalim', 'business']]) {
    const t = tenantDir(bank, kind, 1000);
    const { r, said } = await run(t, 'בנק');
    assert.ok(r);
    assert.match(said[0], /עוד לא קיים/);
    assert.ok(!fs.existsSync(path.join(t.data, 'pc', 'pc')));
  }
});

test('the computer has been off for an hour: no task, he is told', async () => {
  const t = tenantDir('hapoalim', 'private', 60 * 60 * 1000);
  const { said } = await run(t, 'בנק');
  assert.match(said[0], /לא מחובר/);
  assert.ok(!fs.existsSync(path.join(t.data, 'pc', 'pc')));
});

test('import: money.js shape, 600, and the raw upload deleted', () => {
  const t = tenantDir('hapoalim', 'private');
  const id = 'pc-test-1';
  const raw = path.join(t.data, 'files-private', 'pc-out', id);
  fs.mkdirSync(raw, { recursive: true });
  fs.writeFileSync(path.join(raw, 'bank-20261114-1547.json'), JSON.stringify({ bank: 'hapoalim', from: '2026-08-16', to: '2026-11-14',
    accounts: [{ account: '****1', balance: 100.5, movements: [{ date: '2026-11-10', amount: -350, payee: 'חשמל' }, { date: 'bad', amount: 1 }] },
      { account: '****2', balance: 50, movements: [{ date: '2026-11-12', amount: 20, payee: 'העברה', pending: true }] }] }));
  fs.writeFileSync(path.join(t.data, 'bank', 'session.json'), JSON.stringify({ stage: 'waiting', at: new Date().toISOString(), task: id }));
  assert.strictEqual(B.importDone(t.data, id), 2);
  const f = path.join(t.data, 'bank', 'bank', 'hapoalim-20261114-1547.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(d.balance, 150.5);
  assert.deepStrictEqual(d.movements.map((m) => m.amount), [-350, 20]);
  assert.ok(!fs.existsSync(raw), 'the raw upload is deleted');
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(t.data, 'bank', 'session.json'), 'utf8')).stage, 'closed');
});
