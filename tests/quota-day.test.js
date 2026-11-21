'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { view, dayCap } = require('../lib/quota-day.js');

const NOW = Date.parse('2026-10-24T09:00:00Z');
function dir(lines) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qday-'));
  fs.writeFileSync(path.join(d, 'usage.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return d;
}

test('percent is today (Israel) spend over the cap, yesterday does not count', () => {
  const d = dir([{ at: '2026-10-24T06:00:00Z', usd: 2 }, { at: '2026-10-22T06:00:00Z', usd: 5 }]);
  assert.deepEqual(view({ name: 'alon', statusDir: d, ownAccount: false, tier: null, env: {}, now: NOW }), { pct: 25, used: 2, cap: 8 });
});

test('a tier brings its own cap, MONITOR_DAY_USD overrides the default', () => {
  assert.equal(dayCap({}, { dayUsd: 3 }), 3);
  assert.equal(dayCap({ MONITOR_DAY_USD: '5' }, null), 5);
});

test('Itzik, and a customer on an own account without a tier, have no bar', () => {
  const d = dir([]);
  assert.equal(view({ name: 'abaitzik', statusDir: d, tier: null, env: {}, now: NOW }), null);
  assert.equal(view({ name: 'alon', statusDir: d, ownAccount: true, tier: null, env: {}, now: NOW }), null);
});

test('past the cap shows 100 and never more', () => {
  const d = dir([{ at: '2026-10-24T06:00:00Z', usd: 20 }]);
  assert.equal(view({ name: 'alon', statusDir: d, tier: null, env: {}, now: NOW }).pct, 100);
});
