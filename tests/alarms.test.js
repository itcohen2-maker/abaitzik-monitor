'use strict';
// 14.11.2026: reminders at an exact time, on WhatsApp (lib/alarms.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/alarms.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alarms-'));

test('alarms: Israel time is read right in winter and in summer', () => {
  assert.equal(new Date(A.parseLocal('2026-11-16 08:00')).toISOString(), '2026-11-16T06:00:00.000Z');
  assert.equal(new Date(A.parseLocal('2026-07-16 08:00')).toISOString(), '2026-07-16T05:00:00.000Z');
  assert.ok(isNaN(A.parseLocal('מחר בשמונה')));
});

test('alarms: only a real future time with a text is kept', () => {
  const D = tmp(), now = Date.UTC(2026, 10, 14, 12);
  assert.equal(A.add(D, '2026-11-13 08:00', 'x', now).why, 'past');
  assert.equal(A.add(D, '2026-11-16 08:00', '  ', now).why, 'text');
  assert.equal(A.add(D, 'tomorrow', 'x', now).why, 'time');
  const r = A.add(D, '2026-11-16 08:00', 'להתקשר לרונית', now);
  assert.equal(r.ok, true); assert.equal(A.list(D).length, 1);
});

test('alarms: goes out once at its time, on WhatsApp and as a push; a very old one is marked missed', () => {
  const D = tmp(), now = Date.UTC(2026, 10, 14, 12), wa = [], push = [];
  A.add(D, '2026-11-16 08:00', 'להתקשר לרונית', now);
  A.add(D, '2026-11-14 15:00', 'ישן', now - 3 * 86400e3 + 1);
  const hooks = { wa: (t) => { wa.push(t); return Promise.resolve(); }, push: (t, b) => push.push(b) };
  assert.deepEqual(A.tick(D, Date.UTC(2026, 10, 16, 5, 59), hooks).length, 0);
  assert.equal(A.tick(D, Date.UTC(2026, 10, 16, 6, 0), hooks).length, 1);
  assert.equal(A.tick(D, Date.UTC(2026, 10, 16, 6, 1), hooks).length, 0);
  assert.ok(wa.some((t) => t.includes('⏰ תזכורת: להתקשר לרונית')));
  assert.ok(push.includes('להתקשר לרונית'));
  assert.ok(A.list(D).find((a) => a.text === 'ישן').missed);
});

test('alarms: two "no"s stop the offer', () => {
  const D = tmp();
  assert.equal(A.offerOk(D), true);
  A.declined(D); assert.equal(A.offerOk(D), true);
  A.declined(D); assert.equal(A.offerOk(D), false);
  assert.ok(A.promptLines(D).join(' ').includes('לא מציעים יותר'));
});
