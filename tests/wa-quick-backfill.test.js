'use strict';
// 12.11.2026: a customer mapped to the shared number before the quick connect existed (Dr. Shulman) is shown connected.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PROV = require('../lib/wa-quick-provision.js');

test('an approved mapping with no status file gets one, once, and a rebuild', () => {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wqb-'));
  const home = path.join(D, 'home-p');
  fs.mkdirSync(path.join(home, 'data'), { recursive: true });
  fs.mkdirSync(path.join(D, 'tenants', 'tenants'), { recursive: true });
  fs.writeFileSync(path.join(D, 'tenants', 'tenants', 'pablo.json'), JSON.stringify({ id: 'pablo', user: 'pablo', dir: home }));
  fs.writeFileSync(path.join(D, 'wa-tenants.json'), JSON.stringify({ '972522506779': { approved: true, tenant: 'pablo', at: '2026-11-11T19:35:34.908Z' }, '972500000009': { approved: false, tenant: 'pablo' } }));
  const calls = [];
  const ex = (c, a) => calls.push([c].concat(a).join(' '));
  PROV.backfill(D, ex, () => {});
  const s = JSON.parse(fs.readFileSync(path.join(home, 'data', 'conn', 'wa.json'), 'utf8'));
  assert.strictEqual(s.via, 'shared');
  assert.strictEqual(s.phone, '972522506779');
  assert.ok(calls.some((c) => /build\.js/.test(c)));
  const n = calls.length;
  PROV.backfill(D, ex, () => {});
  assert.strictEqual(calls.length, n, 'nothing twice');
});
