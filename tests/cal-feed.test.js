'use strict';
// 22.11.2026: the subscribed calendar, lib/cal-feed.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('../lib/cal-feed.js');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'calfeed-'));
  fs.mkdirSync(path.join(d, 'appts', 'appts'), { recursive: true });
  fs.mkdirSync(path.join(d, 'tasks', 'tasks'), { recursive: true });
  return d;
}
const put = (d, sub, name, obj) => fs.writeFileSync(path.join(d, sub, name), typeof obj === 'string' ? obj : JSON.stringify(obj));

test('timed appointment and no-time appointment become valid events', () => {
  const d = tmp();
  put(d, 'appts/appts', 'a1.json', { id: 'a1', when: '2026-12-01T09:30:00+02:00', what: 'בדיקה, שנתית', where: 'רחוב 1' });
  put(d, 'appts/appts', 'a2.json', { id: 'a2', when: '2026-12-02T09:00:00+02:00', noTime: true, what: 'יום שלם' });
  const t = F.ics(d, Date.parse('2026-11-22T10:00:00Z'));
  const unfolded = t.replace(/\r\n /g, '');
  assert.ok(t.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(t.endsWith('END:VCALENDAR\r\n'));
  assert.ok(unfolded.includes('UID:a1@abaitzik'));
  assert.ok(unfolded.includes('DTSTART:20261201T073000Z'));
  assert.ok(unfolded.includes('DTEND:20261201T083000Z'));
  assert.ok(unfolded.includes('LOCATION:רחוב 1'));
  assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20261202'));
  assert.ok(unfolded.includes('DTEND;VALUE=DATE:20261203'));
  assert.strictEqual(t.split('BEGIN:VEVENT').length - 1, 2);
});

test('commas and semicolons in text are escaped', () => {
  const d = tmp();
  put(d, 'appts/appts', 'a3.json', { id: 'a3', when: '2026-12-01T09:00:00+02:00', what: 'א, ב; ג' });
  const t = F.ics(d).replace(/\r\n /g, '');
  assert.ok(t.includes('SUMMARY:א\\, ב\\; ג'));
});

test('open tasks become all-day events with the check mark', () => {
  const d = tmp();
  put(d, 'tasks/tasks', 't1.json', { id: 't1', day: '2026-11-30', text: 'לשלם', n: 1 });
  put(d, 'tasks/tasks', 't2.json', { id: 't2', text: 'בלי יום' });
  const t = F.ics(d).replace(/\r\n /g, '');
  assert.ok(t.includes('UID:t-t1@abaitzik'));
  assert.ok(t.includes('SUMMARY:✅ לשלם'));
  assert.ok(!t.includes('t-t2@'));
});

test('a broken file is skipped and does not break the feed', () => {
  const d = tmp();
  put(d, 'appts/appts', 'bad.json', '{not json');
  put(d, 'appts/appts', 'ok.json', { id: 'ok', when: '2026-12-01T09:00:00+02:00', what: 'תקין' });
  const t = F.ics(d);
  assert.ok(t.includes('UID:ok@abaitzik'));
  assert.ok(t.endsWith('END:VCALENDAR\r\n'));
});

test('long lines fold at 75 octets and never split a Hebrew letter', () => {
  const folded = F.fold('SUMMARY:' + 'ש'.repeat(60));
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.strictEqual(folded.replace(/\r\n /g, ''), 'SUMMARY:' + 'ש'.repeat(60));
});

test('key: created once, 32 hex, and only the same key passes', () => {
  const d = tmp();
  const k = F.key(d);
  assert.match(k, /^[a-f0-9]{32}$/);
  assert.strictEqual(F.key(d), k);
  assert.strictEqual(F.keyOk(d, k), true);
  assert.strictEqual(F.keyOk(d, 'bad.ics'), false);
  assert.strictEqual(F.keyOk(d, k.slice(0, 31)), false);
  assert.strictEqual(F.keyOk(d, ''), false);
});
