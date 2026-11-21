'use strict';
// 4.11.2026: load() used to drop nudgeSent, so the 24h reminder went out again every 15 minutes.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const sh = require('../lib/shachar.js');
test('load keeps who got the reminder and who asked to be removed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
  fs.mkdirSync(path.join(dir, 'shachar'));
  fs.writeFileSync(path.join(dir, 'shachar', 'state.json'), JSON.stringify({ invites: [], nudgeSent: { 'a@b.co': 'x' }, unsub: ['c@d.co'] }));
  const s = sh.load(dir);
  assert.deepStrictEqual(s.nudgeSent, { 'a@b.co': 'x' });
  assert.deepStrictEqual(s.unsub, ['c@d.co']);
});
test('a person already reminded is not reminded again', async () => {
  const sent = [];
  const s = { invites: [{ email: 'a@b.co', status: 'invited', at: '2026-11-01T00:00:00Z' }], nudgeSent: { 'a@b.co': 'x' }, usage: { perUser: [] } };
  const deps = { now: () => new Date('2026-11-04T12:00:00Z'), fetch: async () => { sent.push(1); return { ok: true }; }, dir: os.tmpdir() };
  await sh.nudgeLetters(deps, s);
  assert.strictEqual(sent.length, 0);
});
