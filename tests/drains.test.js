'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const drains = require('../lib/drains.js');

/*
  The four messages of 18.9, 08:41. This is what he actually sent, one tube at
  a time, and every case here is measured against that send rather than against
  a shape that would have been convenient.
*/
const SENDS = [
  'ניקוזים\nניקוזים 1=65 2=לא נמדד 3=לא נמדד 4=לא נמדד\n\nקוד 1808',
  'ניקוזים\nניקוזים 1=לא נמדד 2=25 3=לא נמדד 4=לא נמדד\n\nקוד 1808',
  'ניקוזים\nניקוזים 1=לא נמדד 2=לא נמדד 3=0 4=לא נמדד\n\nקוד 1808',
  'ניקוזים\nניקוזים 1=לא נמדד 2=לא נמדד 3=לא נמדד 4=60\n\nקוד 1808',
];

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'drains-'));
}

test('a number is read and לא נמדד is read as nothing at all', () => {
  assert.deepEqual(drains.parse(SENDS[0]).vals, [65, null, null, null]);
  assert.deepEqual(drains.parse(SENDS[2]).vals, [null, null, 0, null]);
});

test('zero is a measurement, not a missing one', () => {
  const p = drains.parse(SENDS[2]);
  assert.equal(p.vals[2], 0);
  assert.equal(drains.total({ d3: 0 }), 0);
  assert.equal(drains.total({}), null);
});

test('the note he typed after the numbers survives', () => {
  const p = drains.parse('ניקוזים\nניקוזים 1=30 2=לא נמדד 3=לא נמדד 4=לא נמדד · צלול\n\nקוד 1808');
  assert.equal(p.note, 'צלול');
});

test('anything that is not a drain send is left alone', () => {
  assert.equal(drains.parse('שלח לי דוח על יוטיוב'), null);
  assert.equal(drains.parse('ניקוזים'), null);
  assert.equal(drains.parse(''), null);
});

test('four sends of one tube each become one row of that day', () => {
  const dir = tmp();
  const base = new Date(2026, 8, 18, 8, 41, 26);
  SENDS.forEach((s, i) => {
    drains.record(dir, s, new Date(base.getTime() + i * 12000));
  });
  const files = fs.readdirSync(dir);
  assert.deepEqual(files, ['20260918-0841.json'], 'one day is one file');
  const row = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  assert.equal(row.d1, 65);
  assert.equal(row.d2, 25);
  assert.equal(row.d3, 0);
  assert.equal(row.d4, 60);
  assert.equal(drains.total(row), 150);
  assert.ok(row.at.startsWith('2026-09-18T08:41'), 'the row is stamped at the first send');
});

test('a later send never erases a number with לא נמדד', () => {
  const dir = tmp();
  drains.record(dir, SENDS[0], new Date(2026, 8, 18, 8, 41, 0));
  drains.record(dir, SENDS[1], new Date(2026, 8, 18, 9, 10, 0));
  const row = JSON.parse(fs.readFileSync(path.join(dir, '20260918-0841.json'), 'utf8'));
  assert.equal(row.d1, 65, 'the tube he measured first is still there');
  assert.equal(row.d2, 25);
});

test('a second number in the same round is written down as a correction', () => {
  const dir = tmp();
  drains.record(dir, SENDS[0], new Date(2026, 8, 18, 8, 41, 0));
  const out = drains.record(dir,
    'ניקוזים\nניקוזים 1=70 2=לא נמדד 3=לא נמדד 4=לא נמדד\n\nקוד 1808',
    new Date(2026, 8, 18, 8, 52, 0));
  assert.equal(out.row.d1, 70, 'the newer number is the one that counts');
  assert.equal(out.fixed.length, 1);
  assert.ok(/65/.test(out.row.note) && /70/.test(out.row.note),
    'both numbers stay readable on the row: ' + out.row.note);
  assert.ok(/08:52/.test(out.row.note));
});

test('a later round is a new measurement, not a correction of the old one', () => {
  const dir = tmp();
  drains.record(dir, SENDS[0], new Date(2026, 8, 18, 8, 41, 0));
  const out = drains.record(dir,
    'ניקוזים\nניקוזים 1=25 2=לא נמדד 3=לא נמדד 4=לא נמדד\n\nקוד 1808',
    new Date(2026, 8, 18, 10, 4, 0));
  // 18.9 is the case: 65 at 08:41 and 25 at 10:04. Folded into one row it read
  // "drain 1 corrected from 65 to 25". Nothing was corrected. He measured
  // twice, and a log that turns the morning reading into a typo has lost the
  // only thing it exists to show.
  assert.ok(!/עודכן/.test(out.row.note || ''), 'not a correction: ' + out.row.note);
  const rows = fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f); }).sort();
  assert.equal(rows.length, 2, 'two rounds, two rows');
  const first = JSON.parse(fs.readFileSync(path.join(dir, rows[0]), 'utf8'));
  assert.equal(first.d1, 65, 'the morning reading survives untouched');
  assert.equal(out.row.d1, 25);
});

test('the same send twice changes nothing', () => {
  const dir = tmp();
  drains.record(dir, SENDS[0], new Date(2026, 8, 18, 8, 41, 0));
  const again = drains.record(dir, SENDS[0], new Date(2026, 8, 18, 8, 41, 5));
  assert.equal(again.changed, false);
  const row = JSON.parse(fs.readFileSync(path.join(dir, '20260918-0841.json'), 'utf8'));
  assert.equal(row.d1, 65);
  assert.equal(row.note, undefined);
});

test('the next day opens its own row', () => {
  const dir = tmp();
  drains.record(dir, SENDS[0], new Date(2026, 8, 18, 8, 41, 0));
  drains.record(dir, SENDS[1], new Date(2026, 8, 19, 7, 5, 0));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['20260918-0841.json', '20260919-0705.json']);
});

test('the listener writes the row, not just the chat line', () => {
  const chat = tmp();
  const dir = tmp();
  process.env.ABAITZIK_CHAT_DIR = chat;
  process.env.ABAITZIK_DRAINS_DIR = dir;
  delete require.cache[require.resolve('../listen.js')];
  const listen = require('../listen.js');
  listen.recordIncoming({ id: 'test1', title: 'ניקוזים', message: SENDS[0] });
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1, 'a drain send lands in the log by itself');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8')).d1, 65);
});

// 18.9, in a voice note: "make a column for urine 280, add it to the table."
// The form writes an equals sign, he does not, and both are the same sentence.
test('urine is read whether he writes it with an equals sign or without', () => {
  assert.equal(drains.parse('ניקוזים 1=25 2=לא נמדד 3=לא נמדד 4=50 שתן=280').urine, 280);
  assert.equal(drains.parse('ניקוזים 1=25 2=לא נמדד 3=לא נמדד 4=50 שתן 280').urine, 280);
  assert.equal(drains.parse('ניקוזים שתן 280').urine, 280);
  assert.equal(drains.parse('ניקוזים 1=25 · יצא צלול').urine, null);
});

test('a urine only send opens a row and keeps the total to the drains', () => {
  const dir = tmp();
  const out = drains.record(dir, 'ניקוזים\nניקוזים 1=לא נמדד 2=לא נמדד 3=לא נמדד 4=לא נמדד שתן 300\n\nקוד 1808',
    new Date(2026, 8, 18, 14, 0, 0));
  assert.equal(out.row.urine, 300);
  assert.equal(drains.total(out.row), null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '20260918-1400.json'), 'utf8')).urine, 300);
});
