'use strict';
// 17.11.2026: the campaign destination rule. Monitor ads to /start, the rest to the WhatsApp button page.
const test = require('node:test');
const assert = require('node:assert');
const { judge } = require('../campaign-dest-check.js');
const M = require('../lib/manager.js');

test('a monitor ad that leads to the chat is wrong, to /start is right', () => {
  assert.strictEqual(judge('המוניטור 17.11', 'איליי 1', { link: 'https://it-solution.co.il/?ref=m-ilay1#chat' }).ok, false);
  assert.strictEqual(judge('המוניטור 17.11', 'איליי 1', { link: 'https://it-solution.co.il/start/?ref=m-ilay1' }).ok, true);
  assert.strictEqual(judge('כל דבר', 'x', { link: 'https://it-solution.co.il/?ref=m-pay#chat' }).monitor, true);
});
test('a trade monitor ad on /day/ with an m- ref is right, a rescue ad on /day/ is not', () => {
  assert.strictEqual(judge('קמפיין המקצועות 21.11', 'צלם אירועים · v6 · m-photo', { link: 'https://it-solution.co.il/day/?ref=m-photo' }).ok, true);
  assert.strictEqual(judge('קמפיין המקצועות 21.11', 'קבלן · v6 · m-gypsum', { link: 'https://it-solution.co.il/day/?ref=m-gypsum' }).ok, true);
  assert.strictEqual(judge('ITsolution דף חדש', 'שרפת קרדיטים', { link: 'https://it-solution.co.il/day/?ref=card-lovable' }).ok, false);
  assert.strictEqual(judge('המוניטור 17.11', 'איליי 1', { link: 'https://it-solution.co.il/day/?ref=pay' }).ok, false);
});
test('a monitor lead form is flagged, a rescue ad must go to the chat page', () => {
  assert.strictEqual(judge('המוניטור טופס', 'מי לא שילם', { form: '1' }).ok, false);
  assert.strictEqual(judge('ITsolution דף חדש', 'שרפת קרדיטים', { link: 'https://it-solution.co.il/?ref=card-lovable#chat' }).ok, true);
  assert.strictEqual(judge('ITsolution דף חדש', 'שרפת קרדיטים', { link: 'https://it-solution.co.il/start/?ref=card-lovable' }).ok, false);
});
test('the manager card line', () => {
  const now = Date.now(), at = new Date(now).toISOString();
  assert.strictEqual(M.campaignDestItem(undefined, now), null);
  assert.strictEqual(M.campaignDestItem({ at, total: 3, monitor: 2, bad: [], ads: [{}, {}, {}] }, now).st, 'done');
  const w = M.campaignDestItem({ at, total: 3, monitor: 2, bad: [{ name: 'א', want: 'דף ההרשמה' }], ads: [{}] }, now);
  assert.strictEqual(w.st, 'warn');
  assert.ok(!/[-‐‑‒–—]/.test(w.t + w.sub));
});

test('23.11: the cosmeticians campaign (c-beauty, c-beauty-ru) leads to /day/ and that is right', () => {
  const D = require('../campaign-dest-check.js');
  assert.strictEqual(typeof D.judge, 'function');
  for (const l of ['https://it-solution.co.il/day/?ref=c-beauty', 'https://it-solution.co.il/day/?ref=c-beauty-ru&lang=ru']) {
    const r = D.judge('קוסמטיקאיות 23.11 · עברית ורוסית · /day', 'קוסמטיקאית · עברית · c-beauty', { link: l });
    assert.strictEqual(r.monitor, true); assert.strictEqual(r.ok, true);
  }
});
