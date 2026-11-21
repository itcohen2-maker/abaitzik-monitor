'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const V = require('../lib/visits.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'visits-')); }

test('a visit with beats gets its duration', () => {
  const d = tmp(), t0 = Date.UTC(2026, 10, 11, 8, 0, 0);
  V.record(d, 'pablo', { sid: 'abc123', ev: 'start', dev: 'phone' }, t0);
  V.record(d, 'pablo', { sid: 'abc123', ev: 'beat' }, t0 + 60e3);
  V.record(d, 'pablo', { sid: 'abc123', ev: 'end' }, t0 + 150e3);
  const p = V.forPage(d).pablo;
  assert.equal(p.length, 1);
  assert.equal(p[0].sec, 150);
  assert.equal(p[0].dev, 'phone');
});

test('coming back after a long pause is a new visit, newest first', () => {
  const d = tmp(), t0 = Date.UTC(2026, 10, 11, 8, 0, 0);
  V.record(d, 'pablo', { sid: 'abc123', ev: 'start', dev: 'computer' }, t0);
  V.record(d, 'pablo', { sid: 'abc123', ev: 'end' }, t0 + 30e3);
  V.record(d, 'pablo', { sid: 'abc123', ev: 'start', dev: 'computer' }, t0 + 3600e3);
  V.record(d, 'pablo', { sid: 'abc123', ev: 'beat' }, t0 + 3660e3);
  const p = V.forPage(d).pablo;
  assert.equal(p.length, 2);
  assert.equal(p[0].sec, 60);
  assert.equal(p[1].sec, 30);
});

test('keys: only the stored key maps to the name', () => {
  const d = tmp();
  const k = V.newKey(d, 'pablo');
  assert.equal(V.nameByKey(d, k), 'pablo');
  assert.equal(V.nameByKey(d, 'f'.repeat(32)), null);
  assert.equal(V.nameByKey(d, 'short'), null);
});

test('bad sid or name is ignored', () => {
  const d = tmp();
  assert.equal(V.record(d, 'pablo', { sid: 'x', ev: 'start' }), null);
  assert.equal(V.record(d, '../x', { sid: 'abc123', ev: 'start' }), null);
});
