'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FC = require('../lib/fast-chat.js');

const NL = String.fromCharCode(10);
const ST = require('../lib/sales-train.js');
const salesStub = Object.assign({}, ST, { customerTurn: async () => 'לקוח', score: async () => 'ציון 70', keep: () => 'x.txt' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fca-'));

test('empty thread', async () => {
  const r = await FC.chatApi('/api/chat/thread', { code: 'x' }, { dataPath: tmp() });
  assert.equal(r.status, 200); assert.deepEqual(r.json.msgs, []); assert.equal(r.json.mode, 'chat');
});

test('chat returns reply and msgs', async () => {
  const r = await FC.chatApi('/api/chat', { text: 'שלום' }, { dataPath: tmp(), llm: async () => 'היי' });
  assert.equal(r.json.reply, 'היי'); assert.equal(r.json.msgs.length, 2);
});

test('empty text is 400 and does not call the model', async () => {
  let called = 0;
  const r = await FC.chatApi('/api/chat', { text: '  ' }, { dataPath: tmp(), llm: async () => { called++; return 'x'; } });
  assert.equal(r.status, 400); assert.equal(called, 0);
});

test('todo: unknown id is 404, valid id calls toMonitor once', async () => {
  const d = tmp(); const calls = [];
  const deps = { dataPath: d, llm: async () => 'תשובה', toMonitor: async (k, t) => { calls.push([k, t]); return 'wa-1'; } };
  const c = await FC.chatApi('/api/chat', { text: 'תשלח מייל' }, deps);
  assert.equal((await FC.chatApi('/api/chat/todo', { id: 'nope' }, deps)).status, 404);
  assert.equal(calls.length, 0);
  const r = await FC.chatApi('/api/chat/todo', { id: c.json.msgs[1].id }, deps);
  assert.deepEqual(r.json, { ok: true, req: 'wa-1' });
  assert.deepEqual(calls, [['שיחה', 'בקשה מהשיחה:' + NL + 'תשלח מייל' + NL + NL + 'מה שהמוניטור הציע:' + NL + 'תשובה']]);
});

test('unknown /api/chat/* path is 404', async () => {
  const r = await FC.chatApi('/api/chat/nope', {}, { dataPath: tmp() });
  assert.equal(r.status, 404);
});

test('todo twice for the same message sends once', async () => {
  const d = tmp(); let n = 0;
  const deps = { dataPath: d, llm: async () => 'תשובה', toMonitor: async () => { n++; return 'wa-1'; } };
  const c = await FC.chatApi('/api/chat', { text: 'שאלה' }, deps);
  const id = c.json.msgs[1].id;
  const [r1, r2] = await Promise.all([FC.chatApi('/api/chat/todo', { id }, deps), FC.chatApi('/api/chat/todo', { id }, deps)]);
  const r3 = await FC.chatApi('/api/chat/todo', { id }, deps);
  assert.equal(n, 1);
  assert.equal([r1, r2].filter((r) => r.json.dup).length, 1);
  assert.deepEqual(r3.json, { ok: true, dup: true });
  assert.equal(FC.load(d).msgs[1].todo, true);
});

test('sales messages carry kind sales and cannot be sent to the queue', async () => {
  const d = tmp(); let n = 0;
  const deps = { dataPath: d, llm: async () => 'x', salesTrain: salesStub, toMonitor: async () => { n++; return 'w'; } };
  const a = await FC.chatApi('/api/chat', { text: 'אימון מכירות' }, deps);
  assert.equal(a.json.msgs[1].kind, 'sales');
  const b = await FC.chatApi('/api/chat', { text: 'שלום, אני מוכר' }, deps);
  assert.equal(b.json.msgs[3].kind, 'sales');
  const e = await FC.chatApi('/api/chat', { text: 'סיימנו' }, deps);
  assert.equal(e.json.mode, 'chat');
  assert.equal(e.json.msgs[5].kind, 'sales');
  const t = await FC.chatApi('/api/chat/todo', { id: e.json.msgs[5].id }, deps);
  assert.equal(t.status, 400); assert.equal(n, 0);
});

test('switched off: every chat path is 404', async () => {
  for (const p of ['/api/chat', '/api/chat/thread', '/api/chat/todo']) {
    const r = await FC.chatApi(p, { text: 'x', id: 'y' }, { dataPath: tmp(), enabled: false, llm: async () => 'x' });
    assert.equal(r.status, 404);
  }
});

test('bot message is stamped when the answer is ready', async () => {
  let t = 1000;
  const r = await FC.turn(tmp(), 'שלום', { llm: async () => { t += 5000; return 'היי'; }, now: () => t });
  const [me, bot] = r.thread;
  assert.ok(Date.parse(bot.at) - Date.parse(me.at) >= 5000);
});

test('an expired sales training reads as chat', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'fastchat'));
  fs.writeFileSync(path.join(d, 'fastchat', 'thread.json'), JSON.stringify({ mode: 'sales', msgs: [], sales: { turns: [], last: 0 } }));
  assert.equal(FC.load(d).mode, 'chat');
  fs.writeFileSync(path.join(d, 'fastchat', 'thread.json'), JSON.stringify({ mode: 'sales', msgs: [], sales: { turns: [], last: Date.now() } }));
  assert.equal(FC.load(d).mode, 'sales');
});

test('the WhatsApp prompt names the word, not a button', async () => {
  const seen = [];
  const llm = async (m, sys) => { seen.push(sys); return 'ok'; };
  await FC.turn(tmp(), 'א', { llm, via: 'wa' });
  await FC.turn(tmp(), 'א', { llm, via: 'page' });
  assert.ok(seen[0].includes("'לביצוע'") && !seen[0].includes('ללחוץ'));
  assert.ok(seen[1].includes('ללחוץ'));
});

test('todoLast sends the last pair once; isTodoCmd matches the bare word', async () => {
  const d = tmp(); const calls = [];
  await FC.turn(d, 'שלח מייל', { llm: async () => 'הצעה' });
  const tm = async (k, t) => { calls.push(t); return 'w'; };
  assert.equal((await FC.todoLast(d, tm)).json.ok, true);
  assert.equal((await FC.todoLast(d, tm)).json.dup, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('בקשה מהשיחה:') && calls[0].includes('שלח מייל') && calls[0].includes('הצעה'));
  assert.ok(FC.isTodoCmd('לביצוע') && FC.isTodoCmd(' לביצוע! ') && !FC.isTodoCmd('לביצוע מיידי'));
});
