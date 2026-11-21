'use strict';
/*
  21.11.2026 security review: the bridge counts every message it accepts for a tenant (DATA/meter/<tenant>.json, a
  mirror in the plan spool for the page). The bridge can not tell a chat from an action, so the meter enforces the
  1,000 free chat messages of solo and pro: past them, the messages count as actions, whatever usage.jsonl says.
  A tenant that edits usage.jsonl can not shrink that count.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const M = require('../lib/meter.js');
const P = require('../lib/plan.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'meter-'));

test('every accepted message is counted for the month, and a new month starts at zero', () => {
  const D = tmp(), S = tmp();
  for (let i = 0; i < 3; i++) M.bump(D, S, 't1', NOW);
  assert.equal(M.read(D, 't1', NOW).n, 3);
  assert.equal(M.read(D, 't1', Date.parse('2027-01-05T10:00:00Z')).n, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(S, 't1.meter.json'), 'utf8')).n, 3, 'the page mirror is written too');
});

test('negative: a tenant whose usage.jsonl says 0 still has the messages past the 1,000 free chats counted', () => {
  const st = { plan: 'solo', price: 149, month: '2026-12', extra: 0, applied: [], history: [], meterMonth: '2026-12', meterN: 1250 };
  const emptied = '';
  const s = P.status(st, emptied, NOW);
  assert.equal(s.used, 250);
});

test('negative: the meter does not count chat messages as actions inside the free 1,000', () => {
  const st = { plan: 'pro', price: 249, month: '2026-12', extra: 0, applied: [], history: [], meterMonth: '2026-12', meterN: 900 };
  assert.equal(P.status(st, '', NOW).used, 0);
});

test('a usage line with more actions than the meter overflow still counts (max, never less)', () => {
  const st = { plan: 'solo', price: 149, month: '2026-12', extra: 0, applied: [], history: [], meterMonth: '2026-12', meterN: 1010 };
  const text = JSON.stringify({ at: '2026-12-02T10:00:00Z', msgs: 40, usd: 0 });
  assert.equal(P.status(st, text, NOW).used, 40);
});

test('other packages and an old month are not affected by the meter', () => {
  const ent = { plan: 'entry', month: '2026-12', extra: 0, applied: [], history: [], meterMonth: '2026-12', meterN: 5000 };
  assert.equal(P.status(ent, '', NOW).used, 0);
  const old = { plan: 'solo', price: 149, month: '2026-12', extra: 0, applied: [], history: [], meterMonth: '2026-11', meterN: 5000 };
  assert.equal(P.status(old, '', NOW).used, 0);
});

// 2nd review (7): the meter skips the messages about tiles (lib/plan.js billable); the taste gate decides before it counts.
test('the meter does not count a tile message (free), and counts a normal one', () => {
  assert.equal(M.countable('תוסיף אריח'), false);
  assert.equal(M.countable('מצב אישי'), false);
  assert.equal(M.countable('תזכיר לי מחר בעשר'), true);
});
