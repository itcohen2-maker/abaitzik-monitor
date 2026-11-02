'use strict';
/*
  24.10.2026: "יומן פעולות" and the cost per answer (stage 8). Pure functions in lib/activity-log.js:
  cost aggregation, the average per answered request, row formatting, and the no-cost case.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.MONITOR_NO_GATE = '1';
const L = require('../lib/activity-log.js');

// Tuesday 24.10.2026 12:00 Israel time.
const NOW = Date.parse('2026-10-24T12:00:00+03:00');

const usage = [
  { at: '2026-10-24T10:00:00+03:00', usd: 1, msgs: 3, models: { 'claude-opus-5-5': { usd: 0.8 }, 'claude-haiku-5-5': { usd: 0.2 } } },
  { at: '2026-10-05T10:00:00+03:00', usd: 2, models: {} },
  { at: '2026-09-30T23:00:00+03:00', usd: 5, models: {} },
];
const answers = ['2026-10-24T09:00:00+03:00', '2026-10-05T10:30:00+03:00', '2026-09-20T10:00:00+03:00'];
const reports = [{ title: 'דוח בוקר', at: '2026-10-24T11:00:00+03:00' }];

test('ils converts dollars to shekels at 3.7 and rounds to cents', () => {
  assert.strictEqual(L.ils(1), 3.7);
  assert.strictEqual(L.ils(0), 0);
  assert.strictEqual(L.ils(undefined), 0);
  assert.strictEqual(L.ils(0.1234), 0.46);
});

test('modelLabel names the model that cost the most', () => {
  assert.strictEqual(L.modelLabel({ 'claude-opus-5-5': { usd: 0.8 }, 'claude-haiku-5-5': { usd: 0.2 } }), 'Opus');
  assert.strictEqual(L.modelLabel({ 'claude-sonnet-4': { usd: 1 } }), 'Sonnet');
  assert.strictEqual(L.modelLabel({}), '');
});

test('today and month cost come from the Israel calendar, previous month excluded', () => {
  const s = L.summarize(usage, [], [], NOW);
  assert.strictEqual(s.hasCost, true);
  assert.strictEqual(s.today, 3.7, 'today is the 1 dollar line');
  assert.strictEqual(s.month, 11.1, 'month is 1 plus 2 dollars, the September line is out');
});

test('average per answered request is month cost over this month answers', () => {
  const s = L.summarize(usage, [], answers, NOW);
  assert.strictEqual(s.answered, 2, 'the September answer does not count');
  assert.strictEqual(s.avg, 5.55, '11.1 shekels over 2 answers');
});

test('no average without answers, and no cost figures without usage lines', () => {
  const noAnswers = L.summarize(usage, [], [], NOW);
  assert.strictEqual(noAnswers.avg, null);
  const none = L.summarize([], reports, answers, NOW);
  assert.strictEqual(none.hasCost, false);
  assert.strictEqual(none.today, null);
  assert.strictEqual(none.month, null);
  assert.strictEqual(none.avg, null);
  assert.strictEqual(none.rows.length, 1, 'reports still make rows without cost');
});

test('rows are newest first, with when, what, model and cost', () => {
  const s = L.summarize(usage, reports, answers, NOW);
  assert.deepStrictEqual(s.rows[0], { when: 'היום 11:00', did: 'דוח בוקר', model: '', cost: null });
  assert.deepStrictEqual(s.rows[1], { when: 'היום 10:00', did: 'סשן עבודה, 3 הודעות', model: 'Opus', cost: 3.7 });
  assert.strictEqual(s.rows[2].when, '05.10 10:00', 'an older day shows dd.mm');
  assert.strictEqual(s.rows[2].did, 'סשן עבודה');
  assert.strictEqual(s.rows[2].cost, 7.4);
});

test('the log keeps the last 50 rows', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    title: 'דוח ' + i, at: new Date(NOW - i * 60000).toISOString(),
  }));
  const s = L.summarize([], many, [], NOW);
  assert.strictEqual(s.rows.length, L.ROWS);
  assert.strictEqual(L.ROWS, 50);
  assert.strictEqual(s.rows[0].did, 'דוח 0');
});

test('bad lines and bad dates are skipped, never fatal', () => {
  const s = L.summarize([{ at: 'not a date', usd: 9 }, null, { at: '2026-10-24T10:00:00+03:00', usd: 1 }], [{ at: 'x' }], [], NOW);
  assert.strictEqual(s.today, 3.7);
  assert.strictEqual(s.rows.length, 1);
});

test('readUsage reads jsonl, skips a broken line, and returns [] for a missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-'));
  const file = path.join(dir, 'usage.jsonl');
  try {
    fs.writeFileSync(file, '{"at":"2026-10-24T10:00:00+03:00","usd":1}\nnot json\n\n{"at":"2026-10-24T11:00:00+03:00","usd":2}\n');
    const lines = L.readUsage(file);
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[1].usd, 2);
    assert.deepStrictEqual(L.readUsage(path.join(dir, 'missing.jsonl')), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the built page has the log pane, its settings entry and the render code', () => {
  const { renderPage } = require('../build.js');
  const html = renderPage({
    now: null, openCmds: [], builtAt: '2026-10-24T10:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [],
    activity: L.summarize(usage, reports, answers, NOW),
  });
  assert.ok(html.includes('id="pLg"'), 'pane missing');
  assert.ok(html.includes("Lg:'pLg'"), 'pane key missing');
  assert.ok(html.includes('id="gActLog"'), 'settings entry missing');
  assert.ok(html.includes('function renderActLog'), 'render missing');
  assert.ok(html.includes('עלות ממוצעת לבקשה'), 'average label missing');
});
