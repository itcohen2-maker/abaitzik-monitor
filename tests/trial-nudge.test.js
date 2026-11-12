'use strict';
// 12.11.2026, Itzik: the trial week mails. Each once, only in the window, the last day first.
const test = require('node:test');
const assert = require('node:assert');
const N = require('../lib/trial-nudge.js');
const H = 3600e3;
// Monday 16.11.2026 10:00 Israel (08:00 UTC)
const T0 = Date.parse('2026-11-16T08:00:00Z');

test('not opened after 3 hours, once', () => {
  assert.strictEqual(N.decide({ start: T0, lastVisit: 0, sent: {} }, T0 + 2 * H), '');
  assert.strictEqual(N.decide({ start: T0, lastVisit: 0, sent: {} }, T0 + 3 * H), 'noEntry');
  assert.strictEqual(N.decide({ start: T0, lastVisit: 0, sent: { noEntry: 'x' } }, T0 + 5 * H), '');
});

test('opened, then two days away, once', () => {
  const f = { start: T0, lastVisit: T0 + H, sent: {} };
  assert.strictEqual(N.decide(f, T0 + 30 * H), '');
  assert.strictEqual(N.decide(f, T0 + 49 * H), 'idle');
  assert.strictEqual(N.decide(Object.assign({}, f, { sent: { idle: 'x' } }), T0 + 52 * H), '');
});

test('the last day, and nothing after the trial', () => {
  const f = { start: T0, lastVisit: T0 + 120 * H, sent: {} };
  assert.strictEqual(N.decide(f, T0 + 6 * 24 * H + 2 * H), 'lastDay');
  assert.strictEqual(N.decide(Object.assign({}, f, { sent: { lastDay: 'x' } }), T0 + 6 * 24 * H + 3 * H), '');
  assert.strictEqual(N.decide({ start: T0, lastVisit: 0, sent: {} }, T0 + 8 * 24 * H), '');
});

test('never at night or on Saturday', () => {
  // 22:00 Israel
  assert.strictEqual(N.decide({ start: T0, lastVisit: 0, sent: {} }, Date.parse('2026-11-16T20:00:00Z')), '');
  // Saturday 21.11 noon
  assert.strictEqual(N.decide({ start: T0, lastVisit: T0 + H, sent: {} }, Date.parse('2026-11-21T10:00:00Z')), '');
});

test('the texts have no dashes and no name when the name is a mail', () => {
  const c = { name: 'a@b.com', url: 'https://t1.m.it-solution.co.il/', google: true, mails: 12, urgent: 2, daysLeft: 4, used: 5, total: 40 };
  ['noEntry', 'idle', 'lastDay'].forEach((k) => {
    const m = N.mail(k, c);
    assert.doesNotMatch(m.subject + m.text, /[‐-―]| - /, k);
    assert.doesNotMatch(m.text, /a@b\.com/, k);
  });
  assert.match(N.mail('idle', c).subject, /12 מיילים/);
  assert.strictEqual(N.endText(Date.parse('2026-11-22T08:00:00Z')), 'ביום ראשון ב 10:00');
  assert.match(N.mail('lastDay', Object.assign({}, c, { endText: 'ביום ראשון ב 10:00' })).subject, /נגמר ביום ראשון ב 10:00/);
  assert.match(N.mail('idle', Object.assign({}, c, { google: false })).text, /עוד לא חיברת/);
});
