'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('../lib/foreign-phone.js');
const L = require('../lib/leads.js');

test('25.11: Israeli numbers in every spelling are not foreign, others are', () => {
  ['0521234567', '+972 52-123-4567', '972521234567', '00972521234567', '03-5551234', '', '050'].forEach((p) => assert.strictEqual(F.isForeign(p), false, p));
  ['+919149778751', '919149778751', '0044 7700 900123', '+1 415 555 2671'].forEach((p) => assert.strictEqual(F.isForeign(p), true, p));
});

test('25.11: a lead with a foreign phone is not created from any source, counted without the number', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-'));
  ['signup', 'whatsapp', 'leadform', 'messenger'].forEach((src, i) => assert.strictEqual(L.addFound(d, { src, key: src + ':' + i, name: 'x', phone: '+919149778751', at: '2026-11-25T08:00:00Z' }), null));
  assert.strictEqual(L.readAll(d).length, 0);
  assert.ok(L.addFound(d, { src: 'whatsapp', key: 'wa:9', name: 'ישראלי', phone: '0521234567', at: '2026-11-25T08:00:00Z' }));
  assert.ok(L.addFound(d, { src: 'messenger', key: 'ms:9', name: 'בלי טלפון', phone: '', at: '2026-11-25T08:00:00Z' }), 'no phone cannot be judged');
  const n = JSON.parse(fs.readFileSync(path.join(d, 'status', 'lead-foreign.json'), 'utf8'));
  assert.strictEqual(n.length, 4);
  assert.ok(!JSON.stringify(n).includes('9149778751'));
});
