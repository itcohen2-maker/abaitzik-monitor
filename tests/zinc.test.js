'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderPage } = require('../build');

// איציק, 17.9: "כל מה שאני אצלם היום מה שאכלתי, בסוף היום תאגור את הכל
// ותגיד לי כמה אבץ היה באוכל." מה שנבדק כאן הוא האגירה עצמה: שהיא סופרת
// את היום הנכון, שהיא לא ממציאה אפסים לשורות שעוד לא נמדדו, ושהיא אומרת
// את זה במילים ולא רק במספר.
const html = renderPage({ builtAt: '2026-09-17T06:00:00Z' });
const start = html.indexOf('function todayKey(){');
const end = html.indexOf('function renderFood(){', start);
assert.ok(start >= 0 && end > start, 'the zinc block must be on the page');
const source = html.slice(start, end);
const now = Date.parse('2026-09-17T18:00:00Z');

function view(food) {
  const els = {};
  const el = id => (els[id] = els[id] || { innerHTML: '', textContent: '', className: '', style: {} });
  const context = {
    D: { food },
    Date: class extends Date { static now() { return now; } },
    document: { getElementById: id => el(id) },
    esc: s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  };
  const today = food.filter(f => String(f.at || '').slice(0, 10) === '2026-09-17');
  vm.runInNewContext(source + '\nrenderZinc(' + JSON.stringify(today) + ');', context);
  return els;
}

test('the day total is the sum of what was measured today', () => {
  const out = view([
    { at: '2026-09-17T08:00:00', name: 'ביצה', zinc: 0.6 },
    { at: '2026-09-17T13:00:00', name: 'סטייק', zinc: 4.4 },
    { at: '2026-09-16T13:00:00', name: 'אתמול', zinc: 9 },
  ]);
  assert.equal(out.zVal.textContent, '5 מ״ג');
  assert.ok(out.zSaid.textContent.includes('45 אחוז'));
  assert.ok(out.zSaid.textContent.includes('חסרים 6 מ״ג'));
});

test('an item without a zinc value is said out loud and not counted as zero', () => {
  const out = view([
    { at: '2026-09-17T08:00:00', name: 'ביצה', zinc: 0.6 },
    { at: '2026-09-17T13:00:00', name: 'צלחת שעוד לא חושבה', zinc: null },
  ]);
  assert.equal(out.zVal.textContent, '0.6 מ״ג');
  assert.ok(out.zSaid.textContent.includes('פריט אחד עוד בלי ערך אבץ'));
  assert.ok(!out.zParts.innerHTML.includes('צלחת שעוד לא חושבה'));
});

test('a day that reached the target says so instead of asking for more', () => {
  const out = view([{ at: '2026-09-17T13:00:00', name: 'צדפות', zinc: 12 }]);
  assert.ok(out.zSaid.textContent.includes('היום סגור מבחינת אבץ'));
  assert.ok(!out.zSaid.textContent.includes('חסרים'));
  assert.equal(out.zBar.style.width, '100%');
});

test('an empty day does not pretend to be a summary', () => {
  const out = view([{ at: '2026-09-16T13:00:00', name: 'אתמול', zinc: 9 }]);
  assert.equal(out.zVal.textContent, '0 מ״ג');
  assert.ok(out.zSaid.textContent.includes('עוד לא נרשם היום כלום'));
  assert.ok(out.zDays.innerHTML.includes('16.09'), 'previous days keep their totals');
  assert.ok(out.zDays.innerHTML.includes('9 מ״ג'));
});

test('item names stay escaped inside the breakdown', () => {
  const out = view([{ at: '2026-09-17T13:00:00', name: '<img src=x>', zinc: 1 }]);
  assert.ok(!out.zParts.innerHTML.includes('<img'));
  assert.ok(out.zParts.innerHTML.includes('&lt;img'));
});

test('the food row shows the zinc of each item', () => {
  assert.ok(html.includes('אבץ '), 'each item line carries its zinc');
  assert.ok(html.includes('עוד לא נמדד'), 'a missing value is named, not zeroed');
  assert.ok(html.includes('id="fdZinc"'), 'the zinc card is on the food screen');
});

// ההודעה של סוף היום. אותו כלל כמו במסך: מה שלא חושב לא נספר כאפס, והוא
// נאמר בשם. הודעה אחת ביום, אז היא צריכה להיות נכונה בפעם הראשונה.
const zd = require('../zinc-day.js');

test('the end of day message says what is missing and does not round it away', () => {
  const text = zd.body({
    all: [1, 2, 3], missing: 2, total: 4.4,
    top: [{ name: 'סטייק', zinc: 4.4 }],
    known: [{ name: 'סטייק', zinc: 4.4 }],
  });
  assert.ok(text.includes('4.4 מ״ג אבץ מתוך 11'));
  assert.ok(text.includes('חסרים 6.6 מ״ג'));
  assert.ok(text.includes('2 פריטים עוד בלי ערך אבץ'));
  assert.ok(text.includes('סטייק: 4.4 מ״ג'));
});

test('a day that met the target is not asked for more', () => {
  const text = zd.body({ all: [1], missing: 0, total: 12, top: [], known: [] });
  assert.ok(text.includes('היום סגור מבחינת אבץ'));
  assert.ok(!text.includes('חסרים'));
});

test('the day is his day, not the UTC day', () => {
  // 21:00 בישראל הוא כבר 18:00 UTC, ובחורף עוד קרוב יותר לחצות. הסיכום
  // חייב לסכם את היום שהוא חי בו.
  assert.equal(zd.localDay(new Date('2026-09-17T21:30:00+03:00')), '2026-09-17');
  assert.equal(zd.TARGET, 11);
});
