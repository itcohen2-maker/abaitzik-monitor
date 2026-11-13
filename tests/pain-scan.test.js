'use strict';
/*
  pain-scan.js, 13.11.2026. Pinned: only real public pages are kept (never Facebook,
  Instagram, LinkedIn, never a non https link), a quote carrying a phone or an email
  is dropped, dashes leave every text, and the card shows the quote with its site.
  No test runs the model.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const { parse, card, prompt } = require('../pain-scan.js');

test('only public https pages outside the social networks are kept', () => {
  const out = 'הנה:\n' + JSON.stringify([
    { t: 'מי לא שילם לך החודש?', q: 'שלושה לקוחות חייבים לי כבר חודשיים', topic: 'גבייה', u: 'https://www.tapuz.co.il/forums/x' },
    { t: 'כותרת', q: 'ציטוט', u: 'https://www.facebook.com/groups/1' },
    { t: 'כותרת', q: 'ציטוט', u: 'https://m.instagram.com/p/1' },
    { t: 'כותרת', q: 'ציטוט', u: 'http://example.co.il/a' },
    { t: 'כותרת', q: 'ציטוט', u: 'javascript:alert(1)' },
    { t: 'בלי ציטוט', u: 'https://example.co.il/b' },
  ]) + '\nסוף';
  const r = parse(out);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].u, 'https://www.tapuz.co.il/forums/x');
});

test('a quote with a phone or an email is dropped, dashes are removed', () => {
  const r = parse(JSON.stringify([
    { t: 'א', q: 'תתקשרו אליי 052-1234567', u: 'https://a.co.il/1' },
    { t: 'ב', q: 'כתבו לי ל moshe@gmail.com', u: 'https://a.co.il/2' },
    { t: 'עובד 12 שעות — ומרוויח כמו שכיר?', q: 'אני עובד מ-7 עד 9 בערב', u: 'https://a.co.il/3' },
  ]));
  assert.strictEqual(r.length, 1);
  assert.ok(!/[-–—]/.test(r[0].t + r[0].q));
});

test('the card carries the quote and the site, the prompt bans the closed networks', () => {
  const c = card({ t: 'מי לא שילם לך?', q: 'חייבים לי', topic: 'גבייה', u: 'https://www.tapuz.co.il/x' });
  assert.strictEqual(c.d, '״חייבים לי״ (tapuz.co.il)');
  assert.strictEqual(c.q, 'חייבים לי');
  const p = prompt([{ t: 'ישן', q: 'ציטוט ישן' }]);
  assert.ok(p.includes('אסור: פייסבוק'));
  assert.ok(p.includes('ישן | ציטוט ישן'));
});

test('an answer with no JSON is an error, not an empty success', () => {
  assert.throws(() => parse('לא מצאתי'), /no JSON/);
});
