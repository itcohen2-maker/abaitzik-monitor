'use strict';
/*
  24.10.2026, stage 7: the "מה אני יודע על העסק שלך" screen (lib/profile-ui.js). The
  correction message format is pinned here, because Itzik reads it in the chat and the
  approval rules depend on it. Itzik's own copy must get no entry and no rows.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const ui = require('../lib/profile-ui.js');

const CUSTOMER = {
  name: 'dana',
  owner: 'דנה כהן',
  biz: true,
  profile: { business: '', hours: '', services: ['הכל יחד'], tone: 'casual', modules: ['morning'] },
};

test('the correction message has the agreed shape', () => {
  assert.equal(ui.correctionText('שעות פעילות', '9 עד 17'), 'תיקון בפרופיל העסק: שעות פעילות: 9 עד 17');
});

test('every fact has a row with a fix button, and an empty one says so', () => {
  const html = ui.html(CUSTOMER);
  for (const f of ['owner', 'business', 'hours', 'services', 'tone', 'modules']) {
    assert.ok(html.includes('data-field="' + f + '"'), f);
  }
  assert.equal((html.match(/class="pfFix">לתקן</g) || []).length, 6);
  assert.ok(html.includes('לא הוגדר, אפשר לתקן'), 'empty business name is shown as empty');
});

test('the enabled modules come from profile.modules and from biz', () => {
  const html = ui.html(CUSTOMER);
  assert.ok(html.includes('העסק שלי: לידים, לקוחות וכסף'), 'biz on, shown');
  assert.ok(html.includes('חשבוניות במורנינג או בגרין אינבוי'), 'morning shown');
  const off = ui.factRows({ owner: 'x', profile: { modules: [] }, biz: false }).find((r) => r.field === 'modules');
  assert.equal(off.value, '');
});

test('tone shows in plain words', () => {
  assert.ok(ui.html(CUSTOMER).includes('<b>חברי</b>'));
  const formal = ui.html({ name: 'x', owner: 'y', profile: { tone: 'formal' } });
  assert.ok(formal.includes('<b>ענייני</b>'));
});

test('customer values are escaped, never raw markup', () => {
  const html = ui.html({ name: 'x', owner: '<script>alert(1)</script>', profile: {} });
  assert.equal(html.includes('<script>alert'), false);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('the correction goes through sendText with the agreed subject, text and kind, and never a prompt', () => {
  assert.ok(ui.js.includes("sendText('תיקון פרטים',pfCorrection(row.getAttribute('data-label'),v),'תיקון')"));
  assert.equal(ui.js.includes('prompt('), false, 'no window.prompt');
});

test('the js embeds the same message builder as the test checks', () => {
  assert.ok(ui.js.includes('return \'תיקון בפרופיל העסק: \'') || ui.js.includes("return 'תיקון בפרופיל העסק: '"));
});

test('Itzik\'s copy gets an empty hidden section and no entry row', () => {
  assert.equal(ui.html({ name: 'abaitzik', owner: 'איציק' }), '<section id="pPf" hidden></section>');
  assert.equal(ui.html(null), '<section id="pPf" hidden></section>');
  assert.ok(ui.entry().includes('id="gProfile"'));
});

test('the copy has no dashes in Hebrew text', () => {
  const copy = ui.html(CUSTOMER) + ui.entry() + ui.correctionText('שם העסק', 'א') + ui.js;
  // Plain ASCII hyphens are used in code; Hebrew copy must carry none, nor en dash, em dash or maqaf.
  const hebrewLines = copy.split('\n').filter((l) => /[֐-׿]/.test(l));
  for (const l of hebrewLines) assert.doesNotMatch(l, /[–—־]|[֐-׿]\s-\s[֐-׿]/, l);
});
