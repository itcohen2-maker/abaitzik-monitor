'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FC = require('../lib/fast-chat.js');

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
  assert.deepEqual(calls, [['שיחה', 'תשובה']]);
});

test('unknown /api/chat/* path is 404', async () => {
  const r = await FC.chatApi('/api/chat/nope', {}, { dataPath: tmp() });
  assert.equal(r.status, 404);
});
