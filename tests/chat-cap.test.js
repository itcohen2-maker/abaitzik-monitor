'use strict';
/*
  21.11.2026, Itzik: solo and pro get 1,000 free chat messages a month. A chat message is one answered without a tool
  (usage line field "chat", written by worker.js logUsage). Past the cap the chat messages count as actions.
  Other packages count every message as before.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../lib/plan.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const line = (msgs, chat) => JSON.stringify({ at: '2026-12-02T10:00:00Z', msgs, chat, usd: 0 });

test('chat messages are not actions for solo and pro, up to the 1,000 cap', () => {
  const text = [line(5, 3), line(1200, 1100)].join('\n');
  // Actions: 2 + 100 from the messages that did a tool. Chat 1,103 is 103 past the cap, which counts as actions.
  const st = P.status({ plan: 'solo', price: 149, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [] }, text, NOW);
  assert.equal(st.used, 205);
});

test('chat under the cap costs no actions', () => {
  const text = [line(10, 9)].join('\n');
  const st = P.status({ plan: 'pro', price: 249, month: '2026-12', extra: 0, applied: [], history: [] }, text, NOW);
  assert.equal(st.used, 1);
});

test('lines without the chat field (old writers) and other packages count every message', () => {
  const old = [line(10, undefined)].join('\n');
  assert.equal(P.status({ plan: 'solo', price: 149, month: '2026-12', extra: 0, applied: [], history: [] }, old, NOW).used, 10);
  const ent = [line(10, 9)].join('\n');
  assert.equal(P.status({ plan: 'entry', month: '2026-12', extra: 0, applied: [], history: [] }, ent, NOW).used, 10);
});
