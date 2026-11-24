'use strict';
/*
  24.11.2026: the calls archive summary (lib/calls-summary.js). Fake llm only; made up names and numbers.
  Spec: docs/superpowers/specs/2026-11-24-calls-archive-design.md
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../lib/calls-summary.js');
const ST = require('../lib/calls-store.js');

const NOW = Date.parse('2026-11-24T10:00:00Z');
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'calls-sum-')); }
function mk(dp, extra) {
  const r = ST.intake(dp, Object.assign({ kind: 'call', provider: 'p', extId: 'x' + Math.random(), at: '2026-11-24T08:00:00Z', durationSec: 120, direction: 'in', number: '0501234567', transcript: 'שלום זו שיחה לדוגמה' }, extra || {}), NOW);
  return ST.read(dp, r.id);
}

test('parse takes JSON wrapped in text, drops topics not in the list', () => {
  const t = 'הנה הסיכום:\n{"about":"שיחה קצרה","decided":["לשלוח הצעה"],"tasks":[{"text":"להתקשר","due":"2026-11-26"}],"topics":["מחיר","זר"]}\nסוף';
  const s = S.parse(t, ['מחיר', 'משלוח']);
  assert.strictEqual(s.about, 'שיחה קצרה');
  assert.deepStrictEqual(s.topics, ['מחיר']);
  assert.deepStrictEqual(s.decided, ['לשלוח הצעה']);
  assert.strictEqual(s.tasks[0].due, '2026-11-26');
  assert.strictEqual(S.parse('לא json', []), null);
  const many = JSON.stringify({ about: 'a', decided: [], tasks: Array.from({ length: 15 }, (_, i) => ({ text: 't' + i, due: '' })), topics: [] });
  assert.strictEqual(S.parse(many, []).tasks.length, 10);
});

test('broken JSON: tries goes 1, 2, then failed at 3; the round never throws', async () => {
  const dp = tmp(); let item = mk(dp);
  const bad = async () => 'not json at all';
  for (const [n, st] of [[1, 'new'], [2, 'new'], [3, 'failed']]) {
    const r = await S.summarize(dp, item, bad, NOW);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.item.tries, n);
    assert.strictEqual(r.item.status, st);
    item = ST.read(dp, item.id);
  }
  const boom = async () => { throw new Error('x'); };
  const it2 = mk(dp);
  const r2 = await S.summarize(dp, it2, boom, NOW);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.item.tries, 1);
});

test('summarize ok writes summary, topics and status summarized', async () => {
  const dp = tmp(); const item = mk(dp);
  S.setTopics(dp, ['מחיר']);
  let seen;
  const llm = async (model, sys, inp, ms) => { seen = { model, ms }; return '{"about":"א","decided":[],"tasks":[],"topics":["מחיר","אחר"]}'; };
  const r = await S.summarize(dp, item, llm, NOW);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(seen.model, 'haiku');
  assert.strictEqual(seen.ms, 90000);
  const back = ST.read(dp, item.id);
  assert.strictEqual(back.status, 'summarized');
  assert.deepStrictEqual(back.topics, ['מחיר']);
});

test('needs: 15 second call false, empty transcript false, meeting with no duration true', () => {
  assert.strictEqual(S.needs({ kind: 'call', status: 'new', durationSec: 15, transcript: 'x' }), false);
  assert.strictEqual(S.needs({ kind: 'call', status: 'new', durationSec: 60, transcript: '  ' }), false);
  assert.strictEqual(S.needs({ kind: 'meet', status: 'new', transcript: 'x' }), true);
  assert.strictEqual(S.needs({ kind: 'call', status: 'failed', tries: 2, durationSec: 60, transcript: 'x' }), true);
  assert.strictEqual(S.needs({ kind: 'call', status: 'failed', tries: 3, durationSec: 60, transcript: 'x' }), false);
  assert.strictEqual(S.needs({ kind: 'call', status: 'summarized', durationSec: 60, transcript: 'x' }), false);
});

test('calTasks writes one file per dated task and a second run writes no new file', () => {
  const dp = tmp(); const item = mk(dp);
  item.summary = { about: 'a', decided: [], tasks: [{ text: 'א', due: '2026-11-26' }, { text: 'ב', due: '' }, { text: 'ג', due: '2026-11-27' }] };
  assert.strictEqual(S.calTasks(dp, item), 2);
  const dir = path.join(dp, 'cal', 'add');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.strictEqual(files.length, 2);
  const o = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  assert.ok(o.title && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && o.note && o.at);
  assert.strictEqual(S.calTasks(dp, item), 0);
  fs.mkdirSync(path.join(dir, 'done'), { recursive: true });
  fs.renameSync(path.join(dir, files[0]), path.join(dir, 'done', files[0]));
  assert.strictEqual(S.calTasks(dp, item), 0);
  assert.strictEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length, 1);
});

test('setTopics keeps at most 10, unique, trimmed', () => {
  const dp = tmp();
  const list = [' א ', 'א', 'ב', '', 'x'.repeat(50)].concat(Array.from({ length: 20 }, (_, i) => 'נושא' + i));
  const r = S.setTopics(dp, list);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.topics.length, 10);
  assert.strictEqual(new Set(r.topics).size, 10);
  assert.strictEqual(r.topics[0], 'א');
  assert.ok(r.topics.every((t) => t === t.trim() && t.length <= 30));
  assert.deepStrictEqual(S.topics(dp), r.topics);
  assert.deepStrictEqual(S.topics(tmp()), []);
});

test('input puts the Israel date and segments, cut to 40000', () => {
  const s = S.input({ kind: 'call', at: '2026-11-23T22:30:00Z', direction: 'in', number: '0501234567', durationSec: 90, transcript: 'x'.repeat(50000) });
  assert.ok(s.includes('2026-11-24'));
  assert.ok(s.length <= 40000);
  const s2 = S.input({ kind: 'call', at: '2026-11-24T08:00:00Z', transcript: 'ignored', segments: [{ speaker: 'A', start: 0, text: 'שלום' }] });
  assert.ok(s2.includes('A: שלום'));
});
