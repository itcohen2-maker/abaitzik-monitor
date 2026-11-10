'use strict';
// 10.11.2026: tests for the WhatsApp fallback of the morning push (lib/morning-wa.js, lib/owner-open.js).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const W = require('../lib/morning-wa.js');
const OO = require('../lib/owner-open.js');

const DAY = '2026-11-11'; // a Wednesday
const PUSH = Date.parse('2026-11-11T07:25:30+02:00');
const base = { day: DAY, weekday: 3, pushedDay: DAY, pushedAt: PUSH, lastOpenAt: 0, sentDay: '', openLines: 3 };

test('pushed, not opened: send', () => {
  assert.deepStrictEqual(W.decide(base), { send: true, reason: 'not-opened' });
});
test('opened after the push: nothing', () => {
  assert.strictEqual(W.decide({ ...base, lastOpenAt: PUSH + 60000 }).reason, 'opened');
  assert.strictEqual(W.decide({ ...base, lastOpenAt: PUSH + 60000 }).send, false);
});
test('an open before the push does not count', () => {
  assert.strictEqual(W.decide({ ...base, lastOpenAt: PUSH - 600000 }).send, true);
});
test('already sent today: nothing', () => {
  assert.strictEqual(W.decide({ ...base, sentDay: DAY }).reason, 'already-sent');
  assert.strictEqual(W.decide({ ...base, sentDay: '2026-11-10' }).send, true);
});
test('no morning push today: nothing', () => {
  assert.strictEqual(W.decide({ ...base, pushedDay: '2026-11-10' }).reason, 'no-morning-push');
  assert.strictEqual(W.decide({ ...base, pushedDay: '', pushedAt: 0 }).send, false);
});
test('Saturday and an empty card: nothing', () => {
  assert.strictEqual(W.decide({ ...base, weekday: 6 }).reason, 'saturday');
  assert.strictEqual(W.decide({ ...base, openLines: 0 }).reason, 'nothing-open');
});

test('text: open lines only, short, no dashes in the copy, one link', () => {
  const card = { items: [
    { k: 'brief', st: 'done', t: 'דוח הבוקר מוכן', sub: 'x' },
    { k: 'cal', st: 'todo', t: 'ביומן היום: 2 דברים', sub: "08:00 העברה · 12:45 רופא שיניים" },
    { k: 'mail', st: 'warn', t: 'מיילים: דבר אחד דחוף', sub: 'א-ב\nשורה שנייה' },
  ] };
  const s = W.text(card, 'https://example.test/m/');
  assert.match(s, /לא ראיתי שפתחת את המוניטור/);
  assert.ok(!s.includes('דוח הבוקר מוכן'));
  assert.match(s, /• ביומן היום: 2 דברים: 08:00 העברה/);
  assert.match(s, /• מיילים: דבר אחד דחוף: א ב$/m);
  assert.strictEqual(s.split('https://example.test/m/').length, 2);
  assert.ok(!/[-‐‑‒–—]/.test(s.replace('https://example.test/m/', '')));
  const merged = W.text(card, 'https://example.test/m/', 'מה פתוח היום:\n• אישור\nהכל במוניטור: https://example.test/m/');
  assert.strictEqual(merged.split('https://example.test/m/').length, 2);
});

test('owner-open: record, burst is one open, hasOpenSince', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oo-'));
  assert.strictEqual(OO.lastOpenAt(d), 0);
  OO.record(d, 'load', 1000000);
  OO.record(d, 'load', 1005000); // within 20s, same source: ignored
  assert.strictEqual(OO.read(d).recent.length, 1);
  OO.record(d, 'push', 1005000);
  assert.strictEqual(OO.read(d).recent.length, 2);
  OO.record(d, 'junk', 2000000);
  assert.strictEqual(OO.read(d).lastSrc, 'load');
  assert.ok(OO.hasOpenSince(d, 1500000));
  assert.ok(!OO.hasOpenSince(d, 2000001));
});

test('check reads the disk: pushed today, no open, then an open', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-'));
  const now = Date.parse('2026-11-11T08:30:00+02:00');
  fs.mkdirSync(path.join(d, 'manager', 'manager'), { recursive: true });
  fs.writeFileSync(path.join(d, 'manager', 'state.json'), JSON.stringify({ pushed: DAY, pushedAt: new Date(PUSH).toISOString() }));
  fs.writeFileSync(path.join(d, 'manager', 'manager', '20261111.json'), JSON.stringify({ day: DAY, items: [{ k: 'cal', st: 'todo', t: 'ביומן היום: דבר אחד', sub: '' }] }));
  assert.strictEqual(W.check(d, now).d.send, true);
  OO.record(d, 'push', PUSH + 120000);
  assert.strictEqual(W.check(d, now).d.reason, 'opened');
  W.markSent(d, DAY, 'text');
  assert.strictEqual(W.check(d, now).d.reason, 'already-sent');
});
