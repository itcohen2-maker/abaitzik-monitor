'use strict';
/*
  24.10: the approval inbox logic. Every kind, and the edge cases of a choices doc.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const { classify, normalize } = require('../lib/approvals.js');

const NOW = Date.parse('2026-10-24T10:00:00+03:00');

test('classify: approval kinds need an approval', () => {
  for (const kind of ['send', 'pay', 'delete', 'identity']) {
    assert.strictEqual(classify({ kind }), 'approve', kind);
  }
});

test('classify: blocked kinds are blocked, never approve', () => {
  for (const kind of ['transfer', 'dm-cold', 'friend', 'whatsapp-other']) {
    assert.strictEqual(classify({ kind }), 'blocked', kind);
  }
});

test('classify: everything else is auto, including missing input', () => {
  assert.strictEqual(classify({ kind: 'report' }), 'auto');
  assert.strictEqual(classify({ kind: 'file' }), 'auto');
  assert.strictEqual(classify({}), 'auto');
  assert.strictEqual(classify(null), 'auto');
  assert.strictEqual(classify({ kind: 'SEND' }), 'auto', 'kinds are exact, not guessed');
});

test('normalize: a full approve doc keeps every field', () => {
  const doc = {
    id: 'a1', type: 'approve', at: '2026-10-24T09:00:00+03:00',
    question: 'לשלוח מייל לספק', preview: 'שלום, מצרף את החשבונית',
    why: 'הוא ביקש לשלוח לפני יום שישי', kind: 'send', expires: '2026-10-25T10:00:00+03:00',
  };
  assert.deepStrictEqual(normalize(doc, NOW), {
    id: 'a1', type: 'approve', at: '2026-10-24T09:00:00+03:00',
    question: 'לשלוח מייל לספק', preview: 'שלום, מצרף את החשבונית',
    why: 'הוא ביקש לשלוח לפני יום שישי', kind: 'send', expires: '2026-10-25T10:00:00+03:00',
  });
});

test('normalize: optional fields default to empty strings', () => {
  const r = normalize({ id: 'a2', type: 'approve', question: 'למחוק קובץ', kind: 'delete' }, NOW);
  assert.strictEqual(r.preview, '');
  assert.strictEqual(r.why, '');
  assert.strictEqual(r.expires, '');
  assert.strictEqual(r.at, '');
});

test('normalize: a newline in the question becomes one line', () => {
  const r = normalize({ id: 'a3', type: 'approve', question: 'לשלם\nלספק', kind: 'pay' }, NOW);
  assert.strictEqual(r.question, 'לשלם לספק');
});

test('normalize: missing id or question is dropped', () => {
  assert.strictEqual(normalize({ type: 'approve', question: 'x', kind: 'send' }, NOW), null);
  assert.strictEqual(normalize({ id: 'a4', type: 'approve', kind: 'send' }, NOW), null);
  assert.strictEqual(normalize({ id: '  ', type: 'approve', question: 'x', kind: 'send' }, NOW), null);
  assert.strictEqual(normalize({ id: 'a4', type: 'approve', question: '   ', kind: 'send' }, NOW), null);
});

test('normalize: a doc that is not type approve is not an approval', () => {
  assert.strictEqual(normalize({ id: 'a5', question: 'צבע?', options: ['כחול'] }, NOW), null);
  assert.strictEqual(normalize({ id: 'a5', type: 'other', question: 'x', kind: 'send' }, NOW), null);
  assert.strictEqual(normalize(null, NOW), null);
});

test('normalize: blocked and auto kinds never show as approvable', () => {
  for (const kind of ['transfer', 'dm-cold', 'friend', 'whatsapp-other', 'report', undefined]) {
    assert.strictEqual(normalize({ id: 'b1', type: 'approve', question: 'x', kind }, NOW), null, String(kind));
  }
});

test('normalize: expired is dropped, not yet expired is kept', () => {
  const base = { id: 'e1', type: 'approve', question: 'x', kind: 'send' };
  assert.strictEqual(normalize(Object.assign({ expires: '2026-10-24T09:59:00+03:00' }, base), NOW), null);
  assert.strictEqual(normalize(Object.assign({ expires: '2026-10-24T10:00:00+03:00' }, base), NOW), null, 'exactly now is expired');
  assert.ok(normalize(Object.assign({ expires: '2026-10-24T10:01:00+03:00' }, base), NOW));
});

test('normalize: an unreadable expires is ignored, the card stays', () => {
  const r = normalize({ id: 'e2', type: 'approve', question: 'x', kind: 'send', expires: 'מחר' }, NOW);
  assert.ok(r);
  assert.strictEqual(r.expires, '');
});

test('normalize: no now argument uses the clock', () => {
  const past = new Date(Date.now() - 60000).toISOString();
  assert.strictEqual(normalize({ id: 'e3', type: 'approve', question: 'x', kind: 'send', expires: past }), null);
});
