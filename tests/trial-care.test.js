'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../lib/trial-care.js');
const N = require('../lib/trial-nudge.js');

const start = Date.parse('2026-11-23T06:00:00Z'); // Monday 08:00 Israel
const at = (s) => Date.parse(s);
const H = 3600e3;

test('Gmail comes first, three times, then the features', () => {
  const f = { start, google: false, used: {}, sent: {} };
  assert.equal(C.tip(f, start + 2 * H), '');
  assert.equal(C.tip(f, start + 6 * H), 'g1');
  f.sent = { g1: 'x', last: new Date(start + 6 * H).toISOString() };
  assert.equal(C.tip(f, start + 20 * H), '', '20 hours between tips');
  assert.equal(C.tip(f, at('2026-11-25T07:00:00Z')), 'g2');
  f.google = true;
  f.sent = { g1: 'x', g2: 'y', last: '2026-11-25T07:00:00Z' };
  assert.equal(C.tip(f, at('2026-11-26T07:00:00Z')), 'sign');
  f.used = { sign: true, quote: true };
  assert.equal(C.tip(f, at('2026-11-26T07:00:00Z')), 'remind');
});
test('no tip at night, on Saturday, near a WhatsApp line or after the week', () => {
  const f = { start, google: false, used: {}, sent: {} };
  assert.equal(C.tip(f, at('2026-11-23T20:00:00Z')), '');
  assert.equal(C.tip(f, at('2026-11-28T09:00:00Z')), '');
  assert.equal(C.tip(Object.assign({}, f, { lastWa: at('2026-11-24T07:00:00Z') }), at('2026-11-24T08:00:00Z')), '');
  assert.equal(C.tip(f, start + 8 * 864e5), '');
});
test('tip texts: no dashes, his gender, the link for Gmail', () => {
  ['g1', 'g2', 'g3'].concat(C.FEATURES).forEach((k) => {
    const t = C.tipText(k, 'https://x.m.it-solution.co.il/', true);
    assert.ok(t.length > 20, k);
    assert.ok(!/[‐‑‒–—]| - /.test(t), 'dash in ' + k);
  });
  assert.match(C.tipText('g1', 'https://u/', false), /https:\/\/u\//);
  assert.match(C.tipText('g1', 'https://u/', true), /לוחצת/);
});
test('the digest pairs a burst of requests with the one answer, and waits 30 minutes for an answer', () => {
  const m = (t, from, text, name) => ({ at: at(t), from, text, kind: '', name: name || 'x.json' });
  const msgs = [
    m('2026-11-23T08:00:00Z', 'itzik', 'תכין הצעת מחיר ליובל'),
    m('2026-11-23T08:01:00Z', 'itzik', 'על פרגולה 4 על 5'),
    m('2026-11-23T08:03:00Z', 'claude', 'הכנתי הצעה ליובל', 'a-claude-quote.json'),
    m('2026-11-23T08:04:00Z', 'claude', '💬 עוד לא חיברנו את הוואטסאפ', 'b-claude-wa-nudge.json'),
    m('2026-11-23T08:10:00Z', 'itzik', 'מה עם המייל?'),
  ];
  let p = C.pair(msgs, 0, at('2026-11-23T08:20:00Z'));
  assert.equal(p.items.length, 1);
  assert.deepEqual(p.items[0].asked, ['תכין הצעת מחיר ליובל', 'על פרגולה 4 על 5']);
  assert.equal(p.items[0].answer, 'הכנתי הצעה ליובל');
  assert.ok(p.cursor < at('2026-11-23T08:10:00Z'));
  p = C.pair(msgs, p.cursor, at('2026-11-23T08:45:00Z'));
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].answer, null, 'a nudge is not an answer');
  assert.match(C.digestText([{ name: 'רינה', day: 1, used: 3, total: 60, items: p.items, tips: ['חיבור ג׳ימייל'], url: 'https://u/' }]), /לא נענתה/);
});
test('WhatsApp: a third line on day five', () => {
  assert.equal(N.waDecide({ start, connected: false, sent: { wa1: 'x', wa2: 'y' } }, at('2026-11-28T09:00:00Z')), '', 'Saturday');
  assert.equal(N.waDecide({ start, connected: false, sent: { wa1: 'x', wa2: 'y' } }, at('2026-11-29T07:00:00Z')), 'wa3');
  assert.ok(!/מפסיק/.test(N.waText('wa2', 'l', false)));
});
