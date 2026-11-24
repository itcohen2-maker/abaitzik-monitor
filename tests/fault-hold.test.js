'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FH = require('../lib/fault-hold.js');
const K = require('../wa-keepalive.js');

const T0 = Date.parse('2026-11-23T18:47:00Z');
const item = { id: 'Lx', at: new Date(T0).toISOString() };
const min = (n) => n * 60e3;

test('fault alerts are held, leads and the manager own lines are not', () => {
  assert.ok(FH.holdable('תקלה אצל לקוח', 'רינת: תמלול לא עובד', { urgent: true }));
  assert.ok(FH.holdable('השומר מצא תקלה', 'האתר החי מאחר', {}));
  assert.ok(!FH.holdable('ליד חדש', 'תקלה במזגן', { urgent: true, priority: 5 }));
  assert.ok(!FH.holdable('המנהל: תקלה לא תוקנה', 'x', {}));
  assert.ok(!FH.holdable('תקלה אצל לקוח', 'x', { noHold: true }));
  assert.ok(!FH.holdable('תזכורת', 'לקנות חלב', {}));
  // 24.11.2026: the morning brief is not a fault even when its text says תקוע and כפתור
  assert.ok(!FH.holdable('דוח הבוקר מוכן', 'דוח בוקר 24.11: תשלום מטא תקוע, במוניטור, כפתור תשובות למטה', {}));
});

test('fixed in time: dropped, he is not bothered', () => {
  assert.equal(FH.decide(item, { at: new Date(T0 + min(3)).toISOString() }, 'התקלה תוקנה, התמלול עובד', T0 + min(10)).act, 'drop');
});
test('fix failed: sent at once', () => {
  assert.equal(FH.decide(item, { at: new Date(T0).toISOString() }, 'לא תוקן: אין גישה', T0 + min(4)).act, 'send');
});
test('fix still running after 10 minutes: sent', () => {
  const o = { at: new Date(T0 + min(3)).toISOString() };
  assert.equal(FH.decide(item, o, null, T0 + min(12)).act, 'wait');
  assert.equal(FH.decide(item, o, null, T0 + min(13)).act, 'send');
});
test('nobody ordered a fix: sent', () => {
  assert.equal(FH.decide(item, { skip: true }, null, T0 + min(1)).act, 'send');
  assert.equal(FH.decide(item, undefined, null, T0 + min(14)).act, 'wait');
  assert.equal(FH.decide(item, undefined, null, T0 + min(15)).act, 'send');
});

test('whatsapp keep alive: once, at 23:55 after his last message', () => {
  const last = T0, h = 3600e3;
  assert.ok(!K.due(last, null, last + 23 * h + min(54)));
  assert.ok(K.due(last, null, last + 23 * h + min(55)));
  assert.ok(!K.due(last, last, last + 23 * h + min(56)));
  assert.ok(!K.due(last, null, last + 24 * h));
  assert.ok(!K.due(null, null, last));
});
