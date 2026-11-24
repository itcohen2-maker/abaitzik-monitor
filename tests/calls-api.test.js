'use strict';
/* 24.11.2026: the calls archive API (lib/calls-api.js) and its wiring in wa-bridge.js. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.removeAllListeners('warning');
const A = require('../lib/calls-api.js');
const store = require('../lib/calls-store.js');
const index = require('../lib/calls-index.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'calls-api-')); }
const NOW = Date.parse('2026-11-24T10:00:00Z');
function call(n, extra) {
  return Object.assign({ kind: 'call', provider: 'hook', extId: 'x' + n, at: new Date(NOW - n * 3600e3).toISOString(), durationSec: 120, direction: 'in',
    number: '050123456' + n, transcript: 'שלום אני רוצה הצעת מחיר לשער חשמלי ' + n }, extra || {});
}
function seed(dp, n) {
  const ids = [];
  for (let i = 1; i <= n; i++) { const r = store.intake(dp, call(i), NOW); ids.push(r.id); }
  index.rebuild(dp);
  return ids;
}

test('search through handle returns rows', () => {
  const dp = tmp(); seed(dp, 2);
  const r = A.handle('search', { q: 'שער חשמלי' }, dp, NOW);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.rows.length, 2);
});
test('item returns the transcript', () => {
  const dp = tmp(); const ids = seed(dp, 1);
  const r = A.handle('item', { id: ids[0] }, dp, NOW);
  assert.strictEqual(r.status, 200);
  assert.ok(r.json.item.transcript.includes('הצעת מחיר'));
  assert.strictEqual(A.handle('item', { id: 'nope' }, dp, NOW).status, 404);
});
test('delete then search does not find it', () => {
  const dp = tmp(); const ids = seed(dp, 2);
  assert.strictEqual(A.handle('delete', { id: ids[0] }, dp, NOW).status, 200);
  assert.strictEqual(A.handle('search', { q: 'שער חשמלי' }, dp, NOW).json.rows.length, 1);
});
test('retag without confirm gives count and estimate and changes nothing', () => {
  const dp = tmp(); const ids = seed(dp, 3);
  ids.forEach((id) => { const it = store.read(dp, id); it.status = 'summarized'; it.tries = 1; store.write(dp, it); });
  const r = A.handle('retag', { days: 30 }, dp, NOW);
  assert.deepStrictEqual(r.json, { count: 3, estimateUsd: 0.03 });
  assert.strictEqual(store.read(dp, ids[0]).status, 'summarized');
  const c = A.handle('retag', { days: 30, confirm: true }, dp, NOW);
  assert.strictEqual(c.json.count, 3);
  assert.strictEqual(store.read(dp, ids[0]).status, 'new');
  assert.strictEqual(store.read(dp, ids[0]).tries, 0);
});
test('private with a list moves existing calls and the index forgets them', () => {
  const dp = tmp(); seed(dp, 2);
  const r = A.handle('private', { list: ['050-1234561'] }, dp, NOW);
  assert.strictEqual(r.json.moved, 1);
  assert.strictEqual(A.handle('search', { q: 'שער חשמלי' }, dp, NOW).json.rows.length, 1);
  assert.deepStrictEqual(A.handle('private', {}, dp, NOW).json.numbers, ['0501234561']);
});
test('topics set and get, name sets a contact', () => {
  const dp = tmp();
  assert.deepStrictEqual(A.handle('topics', { list: ['מחיר', 'תלונה'] }, dp).json.topics, ['מחיר', 'תלונה']);
  assert.deepStrictEqual(A.handle('topics', {}, dp).json.topics, ['מחיר', 'תלונה']);
  assert.strictEqual(A.handle('name', { number: '0501234567', name: 'דני' }, dp).status, 200);
  assert.strictEqual(A.handle('name', { number: 'abc', name: 'x' }, dp).status, 400);
});

function owner() {
  const od = tmp(), a = tmp(), b = tmp();
  fs.mkdirSync(path.join(od, 'tenants', 'tenants'), { recursive: true });
  fs.writeFileSync(path.join(od, 'tenants', 'tenants', 'ca.json'), JSON.stringify({ id: 'ca', dir: a }));
  fs.writeFileSync(path.join(od, 'tenants', 'tenants', 'cb.json'), JSON.stringify({ id: 'cb', dir: b }));
  fs.writeFileSync(path.join(od, 'calls-hooks.json'), JSON.stringify({ secretAAAAAAAAAAAA: 'ca', secretBBBBBBBBBBBB: 'cb' }));
  return { od, a, b };
}
test('hook with an unknown secret is 404 and writes nothing', () => {
  const o = owner();
  const r = A.hook('nopenopenope', { extId: '1', at: '2026-11-24T10:00:00Z' }, o.od);
  assert.strictEqual(r.status, 404);
  assert.ok(!fs.existsSync(path.join(o.a, 'data')) && !fs.existsSync(path.join(o.b, 'data')));
  assert.strictEqual(A.hook('secretAAAAAAAAAAAA', { extId: '1', at: '2026-11-24T10:00:00Z' }, tmp()).status, 404);
});
test('hook writes the inbox file of the right customer only', () => {
  const o = owner();
  const r = A.hook('secretBBBBBBBBBBBB', { provider: 'pbx', extId: '../a/1', at: '2026-11-24T10:00:00Z', transcript: 'x' }, o.od);
  assert.strictEqual(r.status, 200);
  const dir = path.join(o.b, 'data', 'calls', 'inbox');
  assert.deepStrictEqual(fs.readdirSync(dir), ['pbx-___a_1.json']);
  assert.ok(!fs.existsSync(path.join(o.a, 'data')));
  assert.strictEqual(A.hook('secretBBBBBBBBBBBB', { at: '2026-11-24T10:00:00Z' }, o.od).status, 400);
  assert.strictEqual(A.hook('secretBBBBBBBBBBBB', { extId: '2', at: 'garbage' }, o.od).status, 400);
  assert.strictEqual(A.hook('secretBBBBBBBBBBBB', { extId: '3', at: '2026-11-24T10:00:00Z', transcript: 'x'.repeat(2.1 * 1024 * 1024) }, o.od).status, 413);
});
test('a key of customer A gives A dataPath only (handle works on the path it is given)', () => {
  const a = tmp(), b = tmp(); seed(a, 1);
  assert.strictEqual(A.handle('search', { q: 'שער חשמלי' }, a, NOW).json.rows.length, 1);
  assert.strictEqual(A.handle('search', { q: 'שער חשמלי', dataPath: a }, b, NOW).json.rows.length, 0);
});

const src = fs.readFileSync(path.join(__dirname, '..', 'wa-bridge.js'), 'utf8');
test('the owner code is refused on /api/calls/*: the block uses tenantByKey and not codeOk as a way in', () => {
  const marker = "api\\/calls\\/(search|item|contact|delete|name|topics|private|retag)";
  const i = src.indexOf(marker);
  assert.ok(i > 0, 'calls block exists');
  const block = src.slice(i, src.indexOf('\n  }\n', i));
  assert.ok(block.includes('tenantByKey(b.code)'));
  assert.ok(/codeOk\(b\.code\)/.test(block) && block.includes('403') && block.includes('codeFail'));
  assert.ok(/path\.join\(tn\.dir, 'data'\)/.test(block));
  assert.ok(!/log\(/.test(block), 'the block logs nothing');
  assert.ok(i < src.indexOf("api\\/chat(\\/thread|\\/todo)?$"), 'before the /api/chat tenant block');
});
test('the public webhook is owner-instance only and reads its own 2MB body', () => {
  const i = src.indexOf("/api/calls/in/");
  assert.ok(i > 0);
  const block = src.slice(i, i + 1500);
  assert.ok(block.includes('isOwnerInstance()'));
  assert.ok(block.includes('MAX_HOOK'));
});

// 24.11.2026 e2e: a second delivery of the same call, before the round took the first, overwrote it
test(hook: a repeat delivery of the same call never overwrites the first file, () => {
  const o = owner();
  assert.strictEqual(A.hook(secretBBBBBBBBBBBB, { provider: pbx, extId: 7, at: 2026-11-24T10:00:00Z, transcript: הראשון }, o.od).status, 200);
  assert.strictEqual(A.hook(secretBBBBBBBBBBBB, { provider: pbx, extId: 7, at: 2026-11-24T10:00:00Z, transcript: השני }, o.od).status, 200);
  const dir = path.join(o.b, data, calls, inbox);
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), [pbx-7-2.json, pbx-7.json]);
  assert.ok(fs.readFileSync(path.join(dir, pbx-7.json), utf8).includes(הראשון));
});
