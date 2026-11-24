'use strict';
/*
  24.11.2026: the calls archive store (lib/calls-store.js). Made up names and numbers only; a tmp dir per test.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../lib/calls-store.js');

const NOW = Date.parse('2026-11-24T10:00:00Z');
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'calls-store-')); }
function call(o) {
  return Object.assign({ kind: 'call', provider: 'test', extId: 'x1', at: '2026-11-24T08:15:30Z', durationSec: 120, direction: 'in', number: '0501234567', transcript: 'שלום זה תמלול', segments: [] }, o || {});
}

test('intake writes one item and a repeat of the same provider+extId is a dup', () => {
  const d = tmp();
  const a = S.intake(d, call(), NOW);
  assert.strictEqual(a.ok, true);
  assert.match(a.id, /^c-20261124081530-[0-9a-f]{6}$/);
  const it = S.read(d, a.id);
  assert.strictEqual(it.status, 'new');
  assert.strictEqual(it.tries, 0);
  assert.deepStrictEqual(it.contactIds, []);
  assert.deepStrictEqual(it.topics, []);
  const b = S.intake(d, call(), NOW + 1000);
  assert.strictEqual(b.dup, true);
  assert.strictEqual(b.id, a.id);
  assert.strictEqual(S.list(d).length, 1);
});

test('the same meeting imported twice is one item', () => {
  const d = tmp();
  const m = call({ kind: 'meet', provider: 'fireflies', extId: 'm9', number: '', people: [{ name: 'דנה', email: 'dana@example.com' }] });
  S.intake(d, m, NOW);
  assert.strictEqual(S.intake(d, m, NOW).dup, true);
  assert.strictEqual(S.list(d).length, 1);
});

test('a waiting call is completed by a later delivery with the transcript', () => {
  const d = tmp();
  const a = S.intake(d, call({ transcript: '' }), NOW);
  assert.strictEqual(S.read(d, a.id).status, 'waiting');
  const b = S.intake(d, call({ transcript: 'עכשיו יש תמלול' }), NOW + 5000);
  assert.strictEqual(b.dup, true);
  const it = S.read(d, a.id);
  assert.strictEqual(it.status, 'new');
  assert.strictEqual(it.transcript, 'עכשיו יש תמלול');
});

test('a bad call is skipped', () => {
  const d = tmp();
  assert.strictEqual(S.intake(d, { kind: 'call' }, NOW).skipped, 'bad');
  assert.strictEqual(S.intake(d, null, NOW).skipped, 'bad');
  assert.strictEqual(S.list(d).length, 0);
});

test('a private number is never stored, in any format', () => {
  const d = tmp();
  S.setPrivate(d, ['050-1234567'], NOW);
  const r = S.intake(d, call({ number: '+972501234567' }), NOW);
  assert.strictEqual(r.skipped, 'private');
  assert.strictEqual(S.list(d).length, 0);
  assert.deepStrictEqual(S.privateList(d), ['0501234567']);
  assert.ok(!fs.existsSync(path.join(d, 'calls', 'items')) || fs.readdirSync(path.join(d, 'calls', 'items')).length === 0);
});

test('adding a number to the private list later moves its calls to _deleted', () => {
  const d = tmp();
  S.intake(d, call({ extId: 'a', number: '050-1234567' }), NOW);
  S.intake(d, call({ extId: 'b', number: '972501234567', at: '2026-11-24T09:00:00Z' }), NOW);
  const other = S.intake(d, call({ extId: 'c', number: '0529999999' }), NOW);
  const ids = S.list(d).map((x) => x.id);
  const r = S.setPrivate(d, ['0501234567'], NOW);
  assert.strictEqual(r.moved, 2);
  assert.deepStrictEqual(S.list(d).map((x) => x.id), [other.id]);
  const log = fs.readFileSync(path.join(d, '_deleted', 'log.txt'), 'utf8');
  ids.filter((i) => i !== other.id).forEach((i) => assert.ok(log.includes(i)));
  assert.ok(!/0501234567|972501234567/.test(log));
  assert.strictEqual(fs.readdirSync(path.join(d, '_deleted', '20261124')).length, 2);
  assert.strictEqual(S.setPrivate(d, ['0501234567'], NOW).moved, 0);
});

test('normPhone: 050-1234567, +972501234567, 972501234567 all give 0501234567; abc gives empty', () => {
  ['050-1234567', '+972501234567', '972501234567', '0501234567'].forEach((x) => assert.strictEqual(S.normPhone(x), '0501234567'));
  assert.strictEqual(S.normPhone('abc'), '');
  assert.strictEqual(S.normPhone(null), '');
  assert.strictEqual(S.normPhone('123'), '');
});

test('resolve: a call from a client in clients.json gets his name and contactId p0501234567; a meeting gets every attendee by email', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'biz-home'), { recursive: true });
  fs.writeFileSync(path.join(d, 'biz-home', 'clients.json'), JSON.stringify([
    { id: 'k1', name: 'יוסי לוי', phone: '050-1234567', emails: ['Yossi@Example.com'] },
    { id: 'k2', name: 'רונית', emails: ['ronit@example.com'], aliases: ['רוני'] },
  ]));
  const c = S.resolve(d, { kind: 'call', number: '+972501234567', name: '' });
  assert.deepStrictEqual(c.contactIds, ['p0501234567']);
  assert.strictEqual(c.name, 'יוסי לוי');
  const m = S.resolve(d, { kind: 'meet', number: '', people: [{ name: 'x', email: 'yossi@example.com' }, { name: 'רוני', email: '' }, { name: 'זר', email: 'z@example.com' }] });
  assert.deepStrictEqual(m.contactIds, ['p0501234567', 'eronit@example.com', 'ez@example.com']);
});

test('contacts merges the customer names, clients and leads; setName wins', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'biz', 'biz'), { recursive: true });
  fs.writeFileSync(path.join(d, 'biz', 'biz', 'biz-1.json'), JSON.stringify({ id: 'biz-1', kind: 'lead', name: 'ליד אחד', phone: '052-9999999', email: '' }));
  assert.deepStrictEqual(S.contacts(d).map((x) => x.id), ['p0529999999']);
  assert.strictEqual(S.setName(d, '0529999999', 'השם שלי').ok, true);
  const c = S.contacts(d);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].name, 'השם שלי');
  assert.deepStrictEqual(c[0].phones, ['0529999999']);
  assert.strictEqual(S.setName(d, 'abc', 'x').ok, false);
});

test('remove moves the item and list no longer has it', () => {
  const d = tmp();
  const a = S.intake(d, call(), NOW);
  assert.strictEqual(S.remove(d, a.id, NOW).ok, true);
  assert.strictEqual(S.list(d).length, 0);
  assert.strictEqual(S.read(d, a.id), null);
  assert.ok(fs.readFileSync(path.join(d, '_deleted', 'log.txt'), 'utf8').includes(a.id));
  assert.strictEqual(S.remove(d, a.id, NOW).ok, false);
  assert.strictEqual(S.remove(d, '../x', NOW).ok, false);
});

test('list is newest first and no tmp files are left behind', () => {
  const d = tmp();
  const a = S.intake(d, call({ extId: '1', at: '2026-11-20T08:00:00Z' }), NOW);
  const b = S.intake(d, call({ extId: '2', at: '2026-11-23T08:00:00Z' }), NOW);
  assert.deepStrictEqual(S.list(d).map((x) => x.id), [b.id, a.id]);
  assert.ok(fs.readdirSync(path.join(d, 'calls', 'items')).every((f) => f.endsWith('.json')));
});
