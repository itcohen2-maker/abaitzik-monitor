'use strict';
// 25.11.2026: Itzik's call sheet with an AI helper (lib/call-kit.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const K = require('../lib/call-kit.js');

const TOK = 'f1e2d3c4b5a6f7e8d9c0';
function env() {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-'));
  fs.mkdirSync(path.join(DATA, 'call-kit')); fs.writeFileSync(path.join(DATA, 'call-kit', 'token.txt'), TOK);
  return DATA;
}
const seen = [];
const llm = async (model, sys, input) => { seen.push({ model, sys, input }); return '**להגיד ללקוח:** זה תלוי - בפרויקט'; };

test('a wrong token gets nothing', async () => {
  const D = env();
  assert.strictEqual((await K.handle(D, { tok: 'a'.repeat(20), op: 'list' }, llm)).status, 403);
  assert.strictEqual((await K.handle(D, { op: 'list' }, llm)).status, 403);
  assert.strictEqual((await K.handle(path.join(os.tmpdir(), 'nope-ck'), { tok: TOK, op: 'list' }, llm)).status, 403);
});

test('ask sends the notes and the question, and the answer comes back tidy', async () => {
  const D = env();
  const r = await K.handle(D, { tok: TOK, op: 'ask', q: 'מה זה RLS?', notes: 'באיזה כלי בנית? Lovable' }, llm);
  assert.strictEqual(r.json.ok, true);
  assert.strictEqual(r.json.text, 'להגיד ללקוח: זה תלוי, בפרויקט');
  const last = seen[seen.length - 1];
  assert.strictEqual(last.model, 'haiku');
  assert.match(last.input, /Lovable/); assert.match(last.input, /מה זה RLS/);
  assert.match(last.sys, /אסור לתת מחיר/);
  assert.doesNotMatch(last.sys, /טום/);
  assert.strictEqual((await K.handle(D, { tok: TOK, op: 'ask', q: '  ' }, llm)).status, 400);
});

test('the summary runs on sonnet; a failing model gives the fallback line', async () => {
  const D = env();
  await K.handle(D, { tok: TOK, op: 'sum', notes: 'x' }, llm);
  assert.strictEqual(seen[seen.length - 1].model, 'sonnet');
  const r = await K.handle(D, { tok: TOK, op: 'next', notes: '' }, async () => { throw new Error('timeout'); });
  assert.strictEqual(r.json.ok, false); assert.strictEqual(r.json.text, K.FALLBACK);
});

test('a daily cap on model calls', async () => {
  const D = env();
  const now = Date.UTC(2026, 10, 25, 10);
  fs.writeFileSync(path.join(D, 'call-kit', 'usage.json'), JSON.stringify({ day: '2026-11-25', n: K.DAY_CAP }));
  assert.strictEqual((await K.handle(D, { tok: TOK, op: 'ask', q: 'x' }, llm, { now })).status, 429);
  assert.strictEqual((await K.handle(D, { tok: TOK, op: 'ask', q: 'x' }, llm, { now: now + 86400e3 })).status, 200);
});

test('a call is saved, listed newest first and read back; bad ids and huge bodies are refused', async () => {
  const D = env();
  const t0 = Date.UTC(2026, 10, 25, 9);
  assert.strictEqual((await K.handle(D, { tok: TOK, op: 'save', id: 'c20261125-aaaaaa', call: { a: { name: 'דנה', tool_c: ['Lovable'], stuck_c: ['תשלומים'] } } }, llm, { now: t0 })).status, 200);
  await K.handle(D, { tok: TOK, op: 'save', id: 'c20261125-bbbbbb', call: { a: { name: 'רון' } } }, llm, { now: t0 + 60e3 });
  const l = (await K.handle(D, { tok: TOK, op: 'list' }, llm)).json.calls;
  assert.deepStrictEqual(l.map((c) => c.name), ['רון', 'דנה']);
  assert.strictEqual(l[1].tool, 'Lovable'); assert.strictEqual(l[1].stuck, 'תשלומים');
  const g = await K.handle(D, { tok: TOK, op: 'get', id: 'c20261125-aaaaaa' }, llm);
  assert.strictEqual(g.json.call.a.name, 'דנה');
  assert.strictEqual((await K.handle(D, { tok: TOK, op: 'save', id: '../x', call: {} }, llm)).status, 400);
  assert.strictEqual((await K.handle(D, { tok: TOK, op: 'get', id: '../../token' }, llm)).status, 400);
  assert.strictEqual((await K.handle(D, { tok: TOK, op: 'save', id: 'c20261125-cccccc', call: { a: { x: 'y'.repeat(70000) } } }, llm)).status, 413);
});

test('the page carries the token, names no team member and has no dashes in its Hebrew copy', () => {
  const html = K.page(TOK);
  assert.ok(html.includes("var TOK = '" + TOK + "'"));
  assert.doesNotMatch(html, /טום/);
  const text = html.replace(/<style[\s\S]*?<\/style>/, '').replace(/<script[\s\S]*?<\/script>/, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(text, /\s[-–—]\s/);
});

test('the NDA warning shows until IT Solution has signed its side', () => {
  const D = env();
  assert.match(K.page(TOK, D), /id="ndaWarn" style="margin-top:10px" >/);
  fs.mkdirSync(path.join(D, 'ndasign', 'nda'), { recursive: true });
  fs.writeFileSync(path.join(D, 'ndasign', 'nda', 'owner.json'), JSON.stringify({ name: 'x', sig: 'data:image/png;base64,AA' }));
  assert.match(K.page(TOK, D), /id="ndaWarn" style="margin-top:10px" hidden>/);
});

test('the page script parses', () => {
  const html = K.page(TOK);
  const js = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new Function(js));
});
