'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rs = require('../lib/remind-snooze.js');

test('parses the phone message, and only that', () => {
  assert.deepEqual(rs.parse('תזכורת שוב: 1h 2026-11-15T07:00:00.000Z|2026-11-15T09:00:00.000Z'),
    { how: '1h', at: '2026-11-15T07:00:00.000Z', due: '2026-11-15T09:00:00.000Z' });
  assert.equal(rs.parse('תזכורת שוב: tom 2026-11-15T07:00:00.000Z|2026-11-15T09:00:00.000Z\nקוד 1234').how, 'tom');
  assert.equal(rs.parse('תזכורת שוב: 2h 1|2'), null);
  assert.equal(rs.parse('שלום'), null);
});

test('snoozes a reminder: schedules the copy and marks the old one', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'snz-'));
  const dir = path.join(dp, 'reminders', 'reminders');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'x.json');
  fs.writeFileSync(f, JSON.stringify({ at: 'A', due: 'D', text: 'לשלם' }));
  const calls = [];
  const res = rs.apply(dp, { how: '1h', at: 'A', due: 'D' }, { now: new Date('2026-11-15T07:00:00Z'), run: (a) => calls.push(a) });
  assert.equal(res.ok, true);
  assert.match(calls[0][0], /alarm\.js$/);
  assert.equal(calls[0][2], '⏰ שוב: לשלם');
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.ok(doc.sentAt && doc.snoozedAt);
  assert.equal(rs.apply(dp, { how: '1h', at: 'Z', due: 'Z' }, { run: () => {} }).ok, false);
});
