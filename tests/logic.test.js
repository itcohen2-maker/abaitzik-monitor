'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ML = require('../lib/monitor-logic.js');

// 10.9.2026 15:40 local time, built without a timezone so the test does not
// depend on the machine's zone.
const NOW = new Date(2026, 8, 10, 15, 40).getTime();
const H = 3600 * 1000;

test('timeOnDay puts HH:MM on the same local day as the reference', () => {
  const t = ML.timeOnDay('07:05', NOW);
  const d = new Date(t);
  assert.equal(d.getDate(), 10);
  assert.equal(d.getHours(), 7);
  assert.equal(d.getMinutes(), 5);
});

test('resolveTaken: an earlier time today stays today', () => {
  assert.equal(ML.resolveTaken('12:00', NOW), new Date(2026, 8, 10, 12, 0).getTime());
});

test('resolveTaken: a time later than now means yesterday', () => {
  assert.equal(ML.resolveTaken('23:30', NOW), new Date(2026, 8, 9, 23, 30).getTime());
});

test('resolveTaken: empty or garbage means now', () => {
  assert.equal(ML.resolveTaken('', NOW), NOW);
  assert.equal(ML.resolveTaken('abc', NOW), NOW);
  assert.equal(ML.resolveTaken('25:99', NOW), NOW);
});

test('parsePillTime reads the hour out of the message text', () => {
  const at = new Date(NOW).toISOString();
  assert.equal(ML.parsePillTime('לקחתי כדור בשעה 12:15.', at), new Date(2026, 8, 10, 12, 15).getTime());
});

test('parsePillTime falls back to the message time', () => {
  const at = new Date(NOW).toISOString();
  assert.equal(ML.parsePillTime('לקחתי כדור עכשיו.', at), NOW);
  assert.equal(ML.parsePillTime('לקחתי כדור', 'not a date'), 0);
});

test('pillState counts eight hours from the time taken', () => {
  const taken = NOW - 3 * H;
  const s = ML.pillState(taken, NOW);
  assert.equal(s.next, taken + ML.PILL_GAP);
  assert.equal(s.left, 5 * H);
  assert.equal(s.due, false);
});

test('pillState is due once the gap has passed, and with no record', () => {
  assert.equal(ML.pillState(NOW - 9 * H, NOW).due, true);
  assert.deepEqual(ML.pillState(0, NOW), { next: 0, left: 0, due: true });
});

const CHAT = [
  { id: 'a1', at: '2026-09-10T10:00:00', from: 'claude', text: 'שאלה על הלוגו', re: '' },
  { id: 'a2', at: '2026-09-10T10:05:00', from: 'itzik', text: 'תשובה ללוגו', re: 'a1' },
  { id: 'a3', at: '2026-09-10T10:20:00', from: 'claude', text: 'קיבלתי, הלוגו אושר', re: 'a1' },
  { id: 'b1', at: '2026-09-10T11:00:00', from: 'claude', text: 'דוח ערב', re: '' },
  { id: 'c1', at: '2026-09-10T09:00:00', from: 'itzik', text: 'תזכורת שלי', re: '' },
  { id: 'c2', at: '2026-09-10T09:30:00', from: 'claude', text: 'רשמתי', re: 'c1' },
  { id: 'x9', at: '2026-09-10T12:00:00', from: 'claude', text: 'יתום', re: 'nope' },
];

test('keyOf prefers the doc id and falls back to time plus text', () => {
  assert.equal(ML.keyOf({ id: 'a1', at: 't', text: 'x' }), 'a1');
  assert.equal(ML.keyOf({ at: '2026-09-10T10:00:00', text: 'abcdefghij'.repeat(6) }),
    '2026-09-10T10:00:00|' + 'abcdefghij'.repeat(4));
});

test('splitThreads groups replies under their root and keeps time order', () => {
  const th = ML.splitThreads(CHAT);
  const byKey = Object.fromEntries(th.map(t => [t.key, t]));
  assert.deepEqual(Object.keys(byKey).sort(), ['a1', 'b1', 'c1', 'x9']);
  assert.deepEqual(byKey.a1.msgs.map(m => m.id), ['a1', 'a2', 'a3']);
  assert.equal(byKey.a1.last, '2026-09-10T10:20:00');
  assert.equal(byKey.x9.root.id, 'x9', 'a reply whose root is missing becomes its own thread');
});

test('splitThreads: a reply stamped before its root still joins it, once', () => {
  const th = ML.splitThreads([
    { id: 'root1', at: '2026-09-10T10:10:00', from: 'itzik', text: 'root later', re: '' },
    { id: 'reply1', at: '2026-09-10T10:00:00', from: 'claude', text: 'reply earlier', re: 'root1' },
  ]);
  assert.equal(th.length, 1);
  assert.deepEqual(th[0].msgs.map(m => m.id), ['reply1', 'root1']);
  assert.equal(th[0].root.id, 'root1');
});

test('threadStatus: fresh beats standby beats done', () => {
  const th = ML.splitThreads(CHAT);
  const a1 = th.find(t => t.key === 'a1');
  const b1 = th.find(t => t.key === 'b1');
  const c1 = th.find(t => t.key === 'c1');
  const unread = new Set(['a3']);
  assert.equal(ML.threadStatus(a1, { unread, standby: {} }), 'fresh');
  assert.equal(ML.threadStatus(b1, { unread, standby: { b1: '2026-09-10T11:30:00' } }), 'standby');
  // A claude message newer than the standby mark clears the standby.
  assert.equal(ML.threadStatus(c1, { unread: new Set(), standby: { c1: '2026-09-10T09:10:00' } }), 'done');
  assert.equal(ML.threadStatus(c1, { unread: new Set(), standby: {} }), 'done');
});

test('orderThreads: fresh first, then standby, then the rest, numbered', () => {
  const th = ML.splitThreads(CHAT);
  const state = { unread: new Set(['a3']), standby: { b1: '2026-09-10T11:30:00' } };
  const out = ML.orderThreads(th, state);
  assert.deepEqual(out.map(o => [o.n, o.status, o.thread.key]), [
    [1, 'fresh', 'a1'],
    [2, 'standby', 'b1'],
    [3, 'done', 'x9'],
    [4, 'done', 'c1'],
  ]);
});

test('splitThreads: a reply to a reply lands in the root thread, in time order', () => {
  const th = ML.splitThreads([
    { id: 'a1', at: '2026-09-10T10:00:00', from: 'claude', text: 'root', re: '' },
    { id: 'a2', at: '2026-09-10T10:05:00', from: 'itzik', text: 'reply', re: 'a1' },
    { id: 'a3', at: '2026-09-10T10:10:00', from: 'claude', text: 'reply to reply', re: 'a2' },
  ]);
  assert.equal(th.length, 1);
  assert.equal(th[0].key, 'a1');
  assert.deepEqual(th[0].msgs.map(m => m.id), ['a1', 'a2', 'a3']);
});

test('splitThreads: a re cycle does not hang and drops nothing', () => {
  const th = ML.splitThreads([
    { id: 'x1', at: '2026-09-10T10:00:00', from: 'claude', text: 'one', re: 'x2' },
    { id: 'x2', at: '2026-09-10T10:01:00', from: 'itzik', text: 'two', re: 'x1' },
  ]);
  const all = th.reduce((n, t) => n + t.msgs.length, 0);
  assert.equal(all, 2);
});

test('rootKeyOf walks to the root and stops on a broken link', () => {
  const byKey = {
    a1: { id: 'a1', re: '' },
    a2: { id: 'a2', re: 'a1' },
    a3: { id: 'a3', re: 'a2' },
    z9: { id: 'z9', re: 'missing' },
  };
  assert.equal(ML.rootKeyOf(byKey.a3, byKey), 'a1');
  assert.equal(ML.rootKeyOf(byKey.a1, byKey), 'a1');
  assert.equal(ML.rootKeyOf(byKey.z9, byKey), 'z9');
});
