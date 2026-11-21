'use strict';
// 21.11.2026 security review: a payment return is bound to its tenant, its SUMIT customer and one reservation.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const G = require('../lib/pay-guard.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'payguard-'));

test('negative: a second reservation of the same payment id is refused (double click, two returns)', () => {
  const D = tmp();
  const a = G.reserve(D, '5001');
  assert.ok(a);
  assert.equal(G.reserve(D, '5001'), null);
  G.release(a);
  assert.ok(G.reserve(D, '5001'));
});

test('negative: a payment that SUMIT says belongs to another tenant is refused, even when the browser said ours', async () => {
  const D = tmp();
  G.startWrite(D, 'ten1', NOW);
  assert.deepEqual(await G.checkPayment(D, { ExternalIdentifier: 'ten2' }, 'ten1', NOW), { ok: false, why: 'tenant' });
  assert.deepEqual(await G.checkPayment(D, { ExternalIdentifier: 'ten1' }, 'ten1', NOW), { ok: true });
});

test('negative: with no echoed identifier and no lookup answer, the start record alone does not pass (2nd review)', async () => {
  const D = tmp();
  G.startWrite(D, 'ten1', NOW);
  assert.equal((await G.checkPayment(D, {}, 'ten1', NOW, {})).ok, false);
  assert.equal((await G.checkPayment(D, {}, 'ten1', NOW, { lookup: async () => 'ten1' })).ok, true);
});

test('negative: a SUMIT customer bound to one tenant is refused for another, and a changed customer is refused', () => {
  const D = tmp();
  assert.deepEqual(G.bindCustomer(D, 'ten1', 555), { ok: true });
  assert.deepEqual(G.bindCustomer(D, 'ten1', 555), { ok: true });
  assert.deepEqual(G.bindCustomer(D, 'ten2', 555), { ok: false, why: 'customer' });
  assert.deepEqual(G.bindCustomer(D, 'ten1', 556), { ok: false, why: 'customer' });
  assert.deepEqual(G.bindCustomer(D, 'ten3', 0), { ok: false, why: 'customer' });
});

test('a payment id recorded for one tenant is owned by it, so another tenant cannot reuse it', () => {
  const D = tmp();
  G.recordWrite(D, '6001', { tenant: 'ten1', paymentId: 6001 });
  assert.equal(G.ownerOf(D, '6001'), 'ten1');
  assert.equal(G.ownerOf(D, '6002'), '');
});
