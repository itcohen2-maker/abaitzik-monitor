'use strict';
/*
  24.11.2026: the calls archive round (calls-round.js). Made up data only; a tmp dir per test, a fake llm.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../lib/calls-store.js');
const { round } = require('../calls-round.js');

const NOW = Date.parse('2026-11-24T10:00:00Z');
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'calls-round-')); }
function drop(d, name, obj) {
  const dir = path.join(d, 'calls', 'inbox');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), typeof obj === 'string' ? obj : JSON.stringify(obj));
}
function call(o) {
  return Object.assign({ kind: 'call', provider: 'test', extId: 'x1', at: '2026-11-24T08:15:30Z', durationSec: 120, direction: 'in', number: '0501234567', transcript: 'שלום זה תמלול' }, o || {});
}
const GOOD = JSON.stringify({ about: 'על מה', decided: [], tasks: [], topics: [] });
const fake = (calls) => async (model) => { calls.push(model); return GOOD; };

test('a dropped file becomes an item and moves to done', async () => {
  const d = tmp();
  drop(d, 'a.json', call());
  const r = await round(d, { llm: fake([]), now: NOW, who: 't' });
  assert.strictEqual(r.taken, 1);
  assert.strictEqual(S.list(d).length, 1);
  assert.ok(fs.existsSync(path.join(d, 'calls', 'inbox', 'done', 'a.json')));
  assert.ok(!fs.existsSync(path.join(d, 'calls', 'inbox', 'a.json')));
  assert.ok(fs.existsSync(path.join(d, 'calls', 'index.sqlite')));
});

test('a bad file moves to bad', async () => {
  const d = tmp();
  drop(d, 'b.json', '{not json');
  drop(d, 'c.json', { nothing: 1 });
  const r = await round(d, { llm: fake([]), now: NOW, who: 't' });
  assert.strictEqual(r.taken, 0);
  assert.ok(fs.existsSync(path.join(d, 'calls', 'inbox', 'bad', 'b.json')));
  assert.ok(fs.existsSync(path.join(d, 'calls', 'inbox', 'bad', 'c.json')));
});

test('a meeting from meetings.json is imported once', async () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'biz-home'), { recursive: true });
  fs.writeFileSync(path.join(d, 'biz-home', 'meetings.json'), JSON.stringify([{ id: 'm1', src: 'ff', title: 'פגישה', at: '2026-11-23T09:00:00Z', client: 'דנה', people: [{ name: 'דנה', email: 'd@example.com' }], summary: 'דיברנו על הצעה' }]));
  const a = await round(d, { llm: fake([]), now: NOW, who: 't' });
  const b = await round(d, { llm: fake([]), now: NOW, who: 't' });
  assert.strictEqual(a.taken, 1);
  assert.strictEqual(b.taken, 0);
  const l = S.list(d);
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0].kind, 'meet');
});

test('the round summarizes at most 10 and calls the fake llm with haiku', async () => {
  const d = tmp();
  for (let i = 0; i < 12; i++) drop(d, 'f' + i + '.json', call({ extId: 'e' + i, at: '2026-11-24T08:' + String(10 + i) + ':00Z' }));
  const models = [];
  const r = await round(d, { llm: fake(models), now: NOW, who: 't' });
  assert.strictEqual(r.taken, 12);
  assert.strictEqual(r.summarized, 10);
  assert.strictEqual(models.length, 10);
  assert.ok(models.every((m) => m === 'haiku'));
  const usage = fs.readFileSync(path.join(d, 'status', 'usage.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.strictEqual(usage.length, 10);
  assert.strictEqual(usage[0].kind, 'calls-summary');
  assert.ok(!/שלום/.test(JSON.stringify(usage)));
  const r2 = await round(d, { llm: fake(models), now: NOW, who: 't' });
  assert.strictEqual(r2.summarized, 2);
});

test('a second concurrent round leaves at once (lock)', async () => {
  const d = tmp();
  drop(d, 'a.json', call());
  let release; const gate = new Promise((res) => { release = res; });
  const slow = async () => { await gate; return GOOD; };
  const p1 = round(d, { llm: slow, now: NOW, who: 't' });
  await new Promise((r) => setTimeout(r, 50));
  const r2 = await round(d, { llm: fake([]), now: NOW, who: 't' });
  assert.deepStrictEqual(r2, { taken: 0, summarized: 0, failed: 0 });
  release();
  const r1 = await p1;
  assert.strictEqual(r1.summarized, 1);
  assert.ok(!fs.existsSync(path.join(d, 'calls', 'round.lock')));
});

test('a stale lock (older than 10 minutes) is taken over', async () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'calls'), { recursive: true });
  fs.writeFileSync(path.join(d, 'calls', 'round.lock'), JSON.stringify({ pid: 1, at: NOW - 11 * 60 * 1000 }));
  drop(d, 'a.json', call());
  const r = await round(d, { llm: fake([]), now: NOW, who: 't' });
  assert.strictEqual(r.taken, 1);
});
