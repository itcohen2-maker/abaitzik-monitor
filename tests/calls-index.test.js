'use strict';
/*
  24.11.2026: the calls archive search index (lib/calls-index.js). Made up names and numbers only; a tmp dir per test.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../lib/calls-store.js');
const X = require('../lib/calls-index.js');

const NOW = Date.parse('2026-11-24T10:00:00Z');
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'calls-index-')); }
let seq = 0;
// stores one item the way the round will (intake + resolve + summary) and indexes it
function add(d, o) {
  seq++;
  const r = S.intake(d, Object.assign({ kind: 'call', provider: 'test', extId: 'e' + seq, at: '2026-11-24T08:15:30Z', durationSec: 120, direction: 'in', number: '0501234567', transcript: 'שלום זה תמלול' }, o || {}), NOW);
  const it = S.resolve(d, S.read(d, r.id));
  if (o && o.summary) it.summary = o.summary;
  if (o && o.topics) it.topics = o.topics;
  S.write(d, it);
  X.upsert(d, it);
  return it;
}
const ids = (r) => r.rows.map((x) => x.id);

test('finds a word inside a prefixed word: חלון finds לחלון, מטבח finds המטבח', () => {
  const d = tmp();
  const a = add(d, { transcript: 'צריך להחליף את הסורגים לחלון בסלון' });
  const b = add(d, { transcript: 'נדבר על ההזמנה של המטבח החדש' });
  add(d, { transcript: 'שיחה על משהו אחר לגמרי' });
  assert.deepStrictEqual(ids(X.search(d, { q: 'חלון' })), [a.id]);
  assert.deepStrictEqual(ids(X.search(d, { q: 'מטבח' })), [b.id]);
  assert.match(X.search(d, { q: 'חלון' }).rows[0].snippet, /חלון/);
});

test('a two letter name: דן finds the calls of contact דן through contacts', () => {
  const d = tmp();
  S.setName(d, '0521112222', 'דן');
  const a = add(d, { number: '052-1112222', transcript: 'אין כאן שום שם' });
  add(d, { number: '0539998888', transcript: 'אין כאן שום שם' });
  const r = X.search(d, { q: 'דן' });
  assert.strictEqual(r.total, 1);
  assert.deepStrictEqual(ids(r), [a.id]);
  assert.strictEqual(r.rows[0].name, 'דן');
});

test('a phone in any format finds the calls of that number', () => {
  const d = tmp();
  const a = add(d, { number: '0501234567' });
  add(d, { number: '0549990000' });
  ['050-1234567', '+972501234567', '972501234567', '0501234567'].forEach((q) => {
    assert.deepStrictEqual(ids(X.search(d, { q })), [a.id], q);
  });
});

test("FTS syntax in the query does not throw: 'מחיר\"', 'a*', '(', 'NEAR' return rows or [] without error", () => {
  const d = tmp();
  add(d, { transcript: 'מה המחיר" של זה' });
  ['מחיר"', 'a*', '(', 'NEAR', '"', 'x AND y', 'foo -bar', 'NEAR(a b)', '*'].forEach((q) => {
    const r = X.search(d, { q });
    assert.ok(Array.isArray(r.rows), q);
    assert.strictEqual(typeof r.total, 'number');
  });
  assert.strictEqual(X.search(d, { q: 'מחיר"' }).total, 1);
});

test('words: all must match, a word under 3 chars inside a longer query is ignored', () => {
  const d = tmp();
  const a = add(d, { transcript: 'הצעת מחיר לחלון גדול' });
  add(d, { transcript: 'הצעת מחיר לדלת' });
  assert.deepStrictEqual(ids(X.search(d, { q: 'מחיר חלון' })), [a.id]);
  assert.deepStrictEqual(ids(X.search(d, { q: 'מחיר של חלון' })), [a.id]);
});

test('filters: kind meet only, from/to by date, topic', () => {
  const d = tmp();
  const a = add(d, { at: '2026-11-01T09:00:00Z', topics: ['מחירים'], transcript: 'אחד' });
  const b = add(d, { kind: 'meet', number: '', people: [{ name: 'גלית', email: 'g@example.com' }], at: '2026-11-10T09:00:00Z', transcript: 'פגישה על קיר' });
  const c = add(d, { at: '2026-11-20T09:00:00Z', transcript: 'שלוש' });
  assert.deepStrictEqual(ids(X.search(d, { kind: 'meet' })), [b.id]);
  assert.deepStrictEqual(ids(X.search(d, { from: '2026-11-05', to: '2026-11-15' })), [b.id]);
  assert.deepStrictEqual(ids(X.search(d, { to: '2026-11-10' })), [b.id, a.id]);
  assert.deepStrictEqual(ids(X.search(d, { topic: 'מחירים' })), [a.id]);
  assert.deepStrictEqual(ids(X.search(d, {})), [c.id, b.id, a.id]);
  assert.deepStrictEqual(ids(X.search(d, { limit: 1, offset: 1 })), [b.id]);
  assert.strictEqual(X.search(d, { limit: 1 }).total, 3);
  assert.deepStrictEqual(ids(X.search(d, { q: 'קיר', kind: 'call' })), []);
});

test('drop removes from results; rebuild from items gives the same total', () => {
  const d = tmp();
  const a = add(d, { transcript: 'חלון ראשון' });
  add(d, { transcript: 'חלון שני' });
  assert.strictEqual(X.search(d, { q: 'חלון' }).total, 2);
  X.drop(d, a.id);
  assert.strictEqual(X.search(d, { q: 'חלון' }).total, 1);
  assert.strictEqual(X.rebuild(d), 2);
  assert.strictEqual(X.search(d, { q: 'חלון' }).total, 2);
  fs.unlinkSync(path.join(d, 'calls', 'index.sqlite'));
  assert.strictEqual(X.search(d, { q: 'חלון' }).total, 2); // a lost index is rebuilt on the first search
});

test('200 synthetic calls: search under 200ms', () => {
  const d = tmp();
  for (let i = 0; i < 200; i++) {
    const r = S.intake(d, { kind: 'call', provider: 't', extId: 's' + i, at: new Date(NOW - i * 60000).toISOString(), durationSec: 60, direction: 'in', number: '05' + (10000000 + i), transcript: 'שיחה מספר ' + i + ' על ' + (i % 7 === 0 ? 'חלון' : 'דלת') + ' ועוד דברים רבים להשלים טקסט ארוך'.repeat(5) }, NOW);
    X.upsert(d, S.read(d, r.id));
  }
  const t = Date.now();
  const r = X.search(d, { q: 'חלון' });
  const ms = Date.now() - t;
  assert.strictEqual(r.total, 29);
  assert.strictEqual(r.rows.length, 29);
  assert.ok(ms < 200, 'took ' + ms + 'ms');
});

test('contactCard returns the calls of the contact and the open tasks', () => {
  const d = tmp();
  S.setName(d, '0501234567', 'רוני');
  const a = add(d, { at: '2026-11-20T09:00:00Z', summary: { about: 'על קיר', decided: ['לבוא ביום ג'], tasks: [{ text: 'לשלוח הצעה', due: '2026-11-26' }, { text: 'לסגור', due: '', done: true }] } });
  add(d, { number: '0549990000', summary: { about: 'אחר', decided: [], tasks: [{ text: 'לא שלו', due: '' }] } });
  const c = X.contactCard(d, 'p0501234567');
  assert.strictEqual(c.contact.name, 'רוני');
  assert.deepStrictEqual(ids({ rows: c.calls }), [a.id]);
  assert.deepStrictEqual(c.open, [{ text: 'לשלוח הצעה', due: '2026-11-26', callId: a.id }]);
  assert.strictEqual(c.calls[0].about, 'על קיר');
});

test('promptLines are short Hebrew lines that name the command', () => {
  const l = X.promptLines(tmp());
  assert.ok(l.length >= 2);
  assert.ok(l.some((x) => /calls-index\.js search/.test(x)));
  assert.ok(l.every((x) => !/ [-–—] /.test(x)));
});
