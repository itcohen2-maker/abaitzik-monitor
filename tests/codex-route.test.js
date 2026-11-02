'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { requestText, queueText, route } = require('../lib/codex-route.js');

test('routes only explicit monitor requests for Codex', async () => {
  assert.equal(requestText('קודקס: תקן את המצלמה'), 'תקן את המצלמה');
  assert.equal(requestText('Codex - restore the bridge'), 'restore the bridge');
  assert.equal(requestText('הודעה קולית מהמוניטור'), '');

  const calls = [];
  const bridge = { push: async (...args) => {
    calls.push(args);
    return { message: { id: 'mail-1' }, delivery: { ok: true } };
  } };
  const event = { id: 'evt-17', time: 1789540000, message: 'קודקס: תחזיר את הגשר' };
  const result = await route(event, bridge);
  assert.equal(result.matched, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'תחזיר את הגשר');
  assert.equal(calls[0][1], 'user');
  assert.match(calls[0][2], /^\[monitor-event:evt-17\]/);
  assert.equal(calls[0][3], 'ntfy-evt-17');
});

test('keeps unrelated monitor traffic out of the Codex task', async () => {
  let called = false;
  const result = await route({ id: 'file-1', message: 'You received a file' }, {
    push: async () => { called = true; }
  });
  assert.deepEqual(result, { matched: false });
  assert.equal(called, false);
});

test('keeps a stable event id in queued text for deduplication', () => {
  const text = queueText({ id: 'same-id', time: 1789540000 }, 'בדיקה');
  assert.match(text, /^\[monitor-event:same-id\]/);
  assert.match(text, /בדיקה$/);
});
