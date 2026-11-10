'use strict';
// 10.11.2026: "🧑‍💼 המנהל שלי", lib/routines.js. Times are Asia/Jerusalem whatever the server clock says.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../lib/routines.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'routines-')); }
// Jerusalem wall clock to epoch
const J = (y, m, d, h, mi) => R.localToEpoch(y, m, d, h, mi);
const daily = (hm, kind) => ({ text: 'לבדוק מי לא שילם', kind: kind || 'remind', sched: { freq: 'daily', hm } });

test('validate: needs text, kind, a real time, and days for weekly', () => {
  assert.ok(R.validate(daily('08:00')).ok);
  assert.strictEqual(R.validate({ text: 'x', kind: 'remind', sched: { freq: 'daily', hm: '08:00' } }).ok, false);
  assert.strictEqual(R.validate(daily('25:00')).ok, false);
  assert.strictEqual(R.validate(Object.assign(daily('08:00'), { kind: 'send' })).ok, false);
  assert.strictEqual(R.validate({ text: 'שבועי', kind: 'remind', sched: { freq: 'weekly', hm: '09:00', days: [] } }).ok, false);
  assert.strictEqual(R.validate({ text: 'חודשי', kind: 'remind', sched: { freq: 'monthly', hm: '09:00', dom: 40 } }).ok, false);
  const v = R.validate({ text: '  שבועי   ביום ראשון ', kind: 'work', sched: { freq: 'weekly', hm: '9:05', days: [0, 0, 3] } });
  assert.ok(v.ok);
  assert.deepStrictEqual(v.value.sched, { freq: 'weekly', hm: '09:05', days: [0, 3] });
  assert.strictEqual(v.value.text, 'שבועי ביום ראשון');
});

test('a routine is due once, after its time, and not before the day it was made', () => {
  const dir = tmp();
  const made = J(2026, 11, 10, 9, 0); // Tuesday 09:00, after 08:00
  const r = R.add(dir, daily('08:00'), made);
  assert.ok(r.ok);
  assert.strictEqual(R.dueNow(dir, J(2026, 11, 10, 9, 30)).length, 0, 'today 08:00 was before it was made');
  assert.strictEqual(R.dueNow(dir, J(2026, 11, 11, 8, 0)).length, 1, 'tomorrow at 08:00');
  assert.strictEqual(R.dueNow(dir, J(2026, 11, 11, 7, 59)).length, 0);
  const did = [];
  R.tick(dir, J(2026, 11, 11, 8, 1), { push: (t) => did.push(t), chat: () => assert.fail('a reminder is not a chat') });
  assert.strictEqual(did.length, 1);
  assert.match(did[0], /לבדוק מי לא שילם/);
  assert.strictEqual(R.dueNow(dir, J(2026, 11, 11, 8, 2)).length, 0, 'not twice');
  assert.strictEqual(R.dueNow(dir, J(2026, 11, 12, 8, 0)).length, 1, 'next day again');
});

test('a time missed by more than six hours waits for the next one', () => {
  const dir = tmp();
  R.add(dir, daily('08:00'), J(2026, 11, 9, 7, 0));
  assert.strictEqual(R.dueNow(dir, J(2026, 11, 10, 15, 0)).length, 0);
  assert.strictEqual(R.dueNow(dir, J(2026, 11, 10, 13, 59)).length, 1);
});

test('weekly: only the chosen days, monthly: only that day', () => {
  const dir = tmp();
  const a = R.add(dir, { text: 'חשבוניות', kind: 'remind', sched: { freq: 'weekly', hm: '09:00', days: [0] } }, J(2026, 11, 1, 0, 0));
  const b = R.add(dir, { text: 'דוח חודשי', kind: 'work', sched: { freq: 'monthly', hm: '10:00', dom: 15 } }, J(2026, 11, 1, 0, 0));
  assert.ok(a.ok && b.ok);
  // 2026-11-08 is a Sunday, 2026-11-10 a Tuesday, 2026-11-15 a Sunday
  const names = (t) => R.dueNow(dir, t).map((x) => x.r.text).sort();
  assert.deepStrictEqual(names(J(2026, 11, 8, 9, 1)), ['חשבוניות']);
  assert.deepStrictEqual(names(J(2026, 11, 10, 9, 1)), []);
  assert.deepStrictEqual(names(J(2026, 11, 15, 10, 1)), ['דוח חודשי', 'חשבוניות'].sort(), 'the 15th is a Sunday: both');
});

test('a work routine becomes one chat message, and at most two start in a minute', () => {
  const dir = tmp();
  for (let i = 0; i < 3; i++) R.add(dir, { text: 'עבודה ' + i, kind: 'work', sched: { freq: 'daily', hm: '07:00' } }, J(2026, 11, 9, 0, 0));
  const msgs = [];
  const t = J(2026, 11, 10, 7, 1);
  R.tick(dir, t, { push: () => assert.fail('no push for work'), chat: (text, id) => msgs.push({ text, id }) }, { only: 'work' });
  assert.strictEqual(msgs.length, 2);
  assert.ok(msgs.every((m) => /^שגרה: עבודה \d$/.test(m.text) && /^routine-r/.test(m.id)));
  R.tick(dir, t + 60000, { push: () => {}, chat: (text, id) => msgs.push({ text, id }) }, { only: 'work' });
  assert.strictEqual(msgs.length, 3, 'the third starts the next minute');
  R.tick(dir, t + 120000, { push: () => {}, chat: (text, id) => msgs.push({ text, id }) }, { only: 'work' });
  assert.strictEqual(msgs.length, 3, 'and nothing again');
});

test('only filters by kind: reminders run before the guards, work after', () => {
  const dir = tmp();
  R.add(dir, daily('07:00', 'remind'), J(2026, 11, 9, 0, 0));
  R.add(dir, daily('07:00', 'work'), J(2026, 11, 9, 0, 0));
  const got = { push: 0, chat: 0 };
  const h = { push: () => got.push++, chat: () => got.chat++ };
  R.tick(dir, J(2026, 11, 10, 7, 1), h, { only: 'remind' });
  assert.deepStrictEqual(got, { push: 1, chat: 0 });
  R.tick(dir, J(2026, 11, 10, 7, 1), h, { only: 'work' });
  assert.deepStrictEqual(got, { push: 1, chat: 1 });
});

test('a paused routine does not run; resume brings it back; delete removes it', () => {
  const dir = tmp();
  const r = R.add(dir, daily('07:00'), J(2026, 11, 9, 0, 0));
  assert.ok(R.setState(dir, r.id, 'paused'));
  assert.strictEqual(R.dueNow(dir, J(2026, 11, 10, 7, 1)).length, 0);
  assert.ok(R.setState(dir, r.id, 'active'));
  assert.strictEqual(R.dueNow(dir, J(2026, 11, 10, 7, 1)).length, 1);
  assert.ok(R.remove(dir, r.id));
  assert.strictEqual(R.list(dir).length, 0);
  assert.strictEqual(R.remove(dir, '../../etc/passwd'), false, 'ids are checked, no path tricks');
  assert.strictEqual(R.setState(dir, 'x/../y', 'paused'), false);
});

test('at most MAX_ACTIVE active routines', () => {
  const dir = tmp();
  for (let i = 0; i < R.MAX_ACTIVE; i++) assert.ok(R.add(dir, daily('07:00')).ok);
  const r = R.add(dir, daily('07:00'));
  assert.strictEqual(r.ok, false);
  assert.match(r.why, new RegExp(String(R.MAX_ACTIVE)));
});

test('the page payload has no file names and shows the next time', () => {
  const dir = tmp();
  R.add(dir, daily('08:00'), J(2026, 11, 10, 9, 0));
  const p = R.forPage(dir, J(2026, 11, 10, 9, 30));
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].label, 'כל יום ב 08:00');
  assert.strictEqual(new Date(p[0].next).getTime(), J(2026, 11, 11, 8, 0));
  assert.ok(!('file' in p[0]) && !/\//.test(JSON.stringify(p)));
});

test('Jerusalem time is right on both sides of the clock change', () => {
  // 2026 clocks go back on the last Sunday of October (25.10): +03:00 before, +02:00 after
  assert.strictEqual(new Date(J(2026, 10, 24, 12, 0)).toISOString(), '2026-10-24T09:00:00.000Z');
  assert.strictEqual(new Date(J(2026, 11, 10, 12, 0)).toISOString(), '2026-11-10T10:00:00.000Z');
});
