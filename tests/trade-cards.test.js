'use strict';
// 21.11.2026: the trade home (lib/trade-cards.js), "שעון היום": the day as a ring that is also the microphone,
// a side switch to "מה עשיתי בשבילך", the day's rows, a quiet collection line, and the WhatsApp sample on the demo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TC = require('../lib/trade-cards.js');
const trades = require('../lib/trades.js');
const NOW = Date.parse('2026-11-21T22:30:00Z'); // 00:30 in Israel, the night build

function seeded() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-')); require('../lib/demo-trades/gypsum.js').seed(d, NOW); return d; }

test('the day: today\'s jobs and reminders, by time, in Israel minutes', () => {
  const items = TC.dayItems(seeded(), NOW);
  assert.deepStrictEqual(items.map((x) => x.m), [450, 780, 1080]); // 07:30, 13:00, 18:00
  assert.deepStrictEqual(items.map((x) => x.c), ['g', 'b', 'y']);
  assert.match(items[0].t, /^07:30 תקרת גבס$/);
  assert.match(items[0].s, /משפחת גולן/);
  assert.match(items[2].t, /^18:00 /);
  assert.ok(items[0].len === 300 && items[2].len === 15);
});

test('the ring: arcs between 06:00 and 20:00, clipped at both ends, plain track when empty', () => {
  assert.strictEqual(TC.arcs([]), 'conic-gradient(var(--trk) 0deg 360deg)');
  const a = TC.arcs([{ m: 450, len: 300, c: 'g' }]);
  assert.match(a, /var\(--trk\) 0deg 38\.6deg,var\(--tg\) 38\.6deg 167\.1deg,var\(--trk\) 167\.1deg 360deg/);
  assert.match(TC.arcs([{ m: 300, len: 120, c: 'b' }]), /var\(--tb\) 0deg 25\.7deg/); // 05:00 to 07:00 starts at the top
  assert.match(TC.arcs([{ m: 1170, len: 60, c: 'y' }]), /var\(--ty\) 347\.1deg 360deg/); // 19:30 to 20:30 ends at the top
  assert.strictEqual(TC.arcs([{ m: 1300, len: 30, c: 'g' }]), 'conic-gradient(var(--trk) 0deg 360deg)'); // after 20:00
});

test('next: the first item that has not started, or none', () => {
  const items = [{ m: 450 }, { m: 780 }, { m: 1080 }];
  assert.strictEqual(TC.next(items, 600).m, 780);
  assert.strictEqual(TC.next(items, 100).m, 450);
  assert.strictEqual(TC.next(items, 1200), null);
});

test('the home of a trade demo', () => {
  const d = seeded();
  const h = TC.html({ trade: 'gypsum', dataPath: d, publicDemo: true }, NOW);
  assert.match(h, /id="tradeCards"/);
  assert.match(h, /id="tradeRing"[^>]*aria-label="לחיצה ומדברים"/);
  assert.match(h, /id="tradeSw"[^>]*aria-pressed="false"/);
  assert.match(h, /<i>4<\/i>/); // four things done today on the demo
  assert.match(h, /גבייה: <u[^>]*>3 תזכורות מוכנות<\/u>, כשתרצה\./);
  assert.match(h, /id="tradeWa"/);
  assert.ok(h.indexOf('id="tradeRing"') < h.indexOf('id="tradeWa"'));
  assert.match(h, /data-open="gBhClients"/);
  assert.doesNotMatch(h, /[‐–—]/);
  assert.doesNotMatch(h, /מי חייב לי/); // Itzik 21.11: no money waiting on the first screen
});

test('only a monitor with a known trade gets it, and the sample conversation is the demo\'s alone', () => {
  assert.strictEqual(TC.html({}), '');
  assert.strictEqual(TC.html({ trade: 'nope', dataPath: '/tmp' }), '');
  assert.doesNotMatch(TC.html({ trade: 'gypsum', dataPath: seeded() }, NOW), /tradeWa/);
});

test('no data: the ring is a plain track, the rows say so, nothing throws', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tc0-'));
  const h = TC.html({ trade: 'gypsum', dataPath: d, publicDemo: true }, NOW);
  assert.match(h, /אין היום עבודות ביומן/);
  assert.doesNotMatch(h, /גבייה:/);
});

test('names are escaped', () => {
  const d = seeded();
  const f = path.join(d, 'biz-home', 'events.json');
  const e = JSON.parse(fs.readFileSync(f, 'utf8')); e[0].title = '<img src=x>: x'; fs.writeFileSync(f, JSON.stringify(e));
  assert.doesNotMatch(TC.html({ trade: 'gypsum', dataPath: d, publicDemo: true }, NOW), /<img src=x>/);
});

test('the row dots do not borrow the monitor\'s own .dot (absolute, a notification badge)', () => {
  const h = TC.html({ trade: 'gypsum', dataPath: seeded(), publicDemo: true }, NOW);
  assert.doesNotMatch(h, /class="dot"/);
  assert.match(h, /class="trDot"/);
});
