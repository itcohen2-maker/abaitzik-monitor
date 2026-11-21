'use strict';
// 2nd security review: an empty Payment.ExternalIdentifier does not fail open. The SUMIT customer's own
// ExternalIdentifier (accounting customers get) must be this tenant; anything else, or no answer, refuses.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const G = require('../lib/pay-guard.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paylookup-'));
const owner = () => { const calls = []; return { calls, fn: (text) => calls.push(text) }; };

test('an empty identifier that the SUMIT customer confirms as this tenant passes', async () => {
  const D = tmp(), o = owner();
  const r = await G.checkPayment(D, { CustomerID: 555 }, 'ten1', NOW, { lookup: async () => 'ten1', owner: o.fn });
  assert.deepEqual(r, { ok: true });
  assert.equal(o.calls.length, 0);
});

test('negative: an empty identifier and a customer that is not ours (foreign) is refused, owner told', async () => {
  const D = tmp(), o = owner();
  const r = await G.checkPayment(D, { CustomerID: 555 }, 'ten1', NOW, { lookup: async () => 'ten2', owner: o.fn });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'tenant');
  assert.equal(o.calls.length, 1);
});

test('negative: an empty identifier and a SUMIT customer with no identifier at all is refused (unverified)', async () => {
  const D = tmp(), o = owner();
  const r = await G.checkPayment(D, { CustomerID: 555 }, 'ten1', NOW, { lookup: async () => '', owner: o.fn });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'unverified');
  assert.equal(o.calls.length, 1);
});

test('negative: a lookup that fails is refused (fail closed), owner told', async () => {
  const D = tmp(), o = owner();
  const r = await G.checkPayment(D, { CustomerID: 555 }, 'ten1', NOW, { lookup: async () => { throw new Error('sumit down'); }, owner: o.fn });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'lookup');
  assert.equal(o.calls.length, 1);
});

test('negative: an empty identifier with no lookup at all is refused, even with a recent start', async () => {
  const D = tmp();
  G.startWrite(D, 'ten1', NOW);
  const r = await G.checkPayment(D, { CustomerID: 555 }, 'ten1', NOW, {});
  assert.equal(r.ok, false);
  assert.equal(r.why, 'lookup');
});

test('negative: a SUMIT-echoed foreign identifier is refused without asking SUMIT again', async () => {
  const D = tmp();
  let asked = 0;
  const r = await G.checkPayment(D, { ExternalIdentifier: 'ten2', CustomerID: 555 }, 'ten1', NOW, { lookup: async () => { asked++; return 'ten1'; } });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'tenant');
  assert.equal(asked, 0);
});

test('positive: an echoed identifier that is ours passes with no lookup', async () => {
  const D = tmp();
  const r = await G.checkPayment(D, { ExternalIdentifier: 'ten1', CustomerID: 555 }, 'ten1', NOW, {});
  assert.deepEqual(r, { ok: true });
});
