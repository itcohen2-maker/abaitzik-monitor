'use strict';
// 19.11.2026: the public demo answers every button with what it received and what it did (lib/demo-acts.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { say, client } = require('../lib/demo-acts.js');
const PD = require('../lib/public-demo.js');

test('the lines the page sends get their own answer', () => {
  const cases = [
    [['משימה', 'מחיקת משימה: demo-t1 (להזמין סכיני תער)'], /להזמין סכיני תער/, /הורדתי/],
    [['ליד', 'סטטוס ליד: מתן ש. · בשיחה'], /מתן ש\./, /לידים/],
    [['משימה', 'שגרה חדשה: {"text":"לבדוק מלאי","kind":"work"}'], /לבדוק מלאי/, /הסוכנת/],
    [['משימה', 'שגרה עצירה: rdemo1'], /לעצור/, /עצרתי/],
    [['משימה', 'קמפיין: פוסט | מבצע חנוכה'], /קמפיין/, /טיוטה/],
    [['משימה', 'בקשה ממנהל: בקשת שדרוג: חיבור לבנק. 149 ₪'], /חיבור לבנק/, /תשלום מאובטח/],
    [['תור', 'תור חדש: תספורת, 20.11.2026 (2026-11-20) בשעה 10:00'], /תור חדש/, /ביומן/],
    [['משימה', 'משימה להיום, 19.11 (2026-11-19): לקנות קפה'], /לקנות קפה/, /היום/],
    [['משימה', '🗑 מחיקת ליד: demo-lead-7'], /ליד/, /הסרתי/],
    [['משימה', '📤 נשלח: 20261119-0730-demo 2'], /וואטסאפ/, /סימנתי/],
  ];
  cases.forEach(([args, got, did]) => {
    const r = say(...args);
    assert.match(r.got, got, args[1]);
    assert.match(r.did, did, args[1]);
  });
});

test('anything else still says what it got, never an empty line, and no dashes', () => {
  const r = say('משימה', 'משהו שאין לו תבנית');
  assert.match(r.got, /משהו שאין לו תבנית/);
  assert.ok(r.did.length > 5);
  const empty = say('', '');
  assert.ok(empty.got && empty.did);
  ['הודעה', 'קובץ', 'הגדרה', 'תשובה', 'בקשה', 'פרויקט'].forEach((k) => {
    const x = say(k, 'טקסט לבדיקה');
    assert.ok(!/ [-–—] /.test(x.got + x.did), k);
  });
});

test('say and client run on the page as they are (no outside names)', () => {
  // put on the page with toString: each must stand alone
  new Function('return ' + say.toString())()('משימה', 'מחיקת משימה: a (b)');
  assert.doesNotThrow(() => new Function('(' + client.toString() + ')'));
});

test('only the public demo gets any of it', () => {
  assert.strictEqual(PD.head({}), '');
  assert.strictEqual(PD.head({ publicDemo: false }), '');
  assert.strictEqual(PD.tail({ name: 'x' }), '');
  const h = PD.head({ publicDemo: true });
  assert.match(h, /window\.demoSay=/);
  assert.doesNotThrow(() => new Function(h.replace(/<\/?script>/g, '')));
});

test('the seed fills the add-on screens with invented data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-seed-'));
  try {
    const D = require('../lib/demo-data.js');
    D.seed(dir, Date.parse('2026-11-19T08:00:00Z'));
    const rd = (p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
    assert.ok(rd('biz-home/meetings.json').length >= 3);
    assert.ok(rd('money/money.json').cash > 0);
    assert.strictEqual(rd('status/features.json').money, true);
    assert.ok(fs.readdirSync(path.join(dir, 'brief', 'brief')).length >= 1);
    assert.ok(fs.readdirSync(path.join(dir, 'reports', 'reports')).length >= 5);
    assert.ok(rd('yt/channel.json').input);
    assert.ok(rd('personal/state.json').chosen);
    const all = JSON.stringify(fs.readdirSync(dir, { recursive: true }).map((f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } }));
    assert.ok(!/@gmail\.com/.test(all));
    assert.ok(!/05[0-9]-?[1-9][0-9]{6}/.test(all), 'only 050 000 numbers');
    // the chat knows the same money and meetings
    const ctx = D.context(Date.parse('2026-11-19T08:00:00Z'));
    assert.match(ctx, /23,480/);
    assert.match(ctx, /פיירפליס/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
