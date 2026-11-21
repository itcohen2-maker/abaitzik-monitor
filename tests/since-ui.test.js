'use strict';
/*
  24.10.2026: "מאז שהיית כאן". The pure functions are the ones shipped in lib/since-ui.js, run
  here from the same string the page gets. The snapshot is kept in a stub localStorage.
*/
const { test } = require('node:test');
const assert = require('node:assert');
process.env.MONITOR_NO_GATE = '1';
const ui = require('../lib/since-ui.js');

function load(store, els) {
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const document = {
    getElementById: (id) => els[id] || null,
    createElement: () => ({}),
    addEventListener() {},
  };
  const body = ui.js + '\nreturn {sinceNow,sinceDiff,sinceLine,sinceSnapshot,sinceRead,sinceWrite,renderSince,sinceLeave};';
  // D is the page data; the renderSince tests only need the snapshot and the box, so it is empty here.
  return new Function('D', 'idList', 'localStorage', 'document', body)({}, () => [], localStorage, document);
}

const T0 = Date.parse('2026-10-24T10:00:00+03:00');
const before = '2026-10-24T09:00:00+03:00';
const after = '2026-10-24T11:00:00+03:00';

test('sinceDiff counts only answers and reports later than the snapshot', () => {
  const api = load({}, {});
  const snap = { at: T0, approvalIds: ['a1'] };
  const now = {
    answerAts: [before, after, after],
    reportAts: [before, after],
    approvalIds: ['a1', 'a2'],
  };
  assert.deepStrictEqual(api.sinceDiff(snap, now), { answers: 2, reports: 1, approvals: 1 });
});

test('sinceDiff with nothing new is all zero, so the line stays hidden', () => {
  const api = load({}, {});
  const snap = { at: T0, approvalIds: ['a1'] };
  const d = api.sinceDiff(snap, { answerAts: [before], reportAts: [before], approvalIds: ['a1'] });
  assert.deepStrictEqual(d, { answers: 0, reports: 0, approvals: 0 });
  assert.strictEqual(api.sinceLine(d), '');
});

test('sinceLine writes the Hebrew line with singular and plural forms', () => {
  const api = load({}, {});
  assert.strictEqual(api.sinceLine({ answers: 2, approvals: 1, reports: 1 }),
    'מאז שהיית כאן: 2 תשובות חדשות, אישור אחד ממתין, דוח חדש');
  assert.strictEqual(api.sinceLine({ answers: 1, approvals: 0, reports: 0 }),
    'מאז שהיית כאן: תשובה חדשה אחת');
  assert.strictEqual(api.sinceLine({ answers: 0, approvals: 3, reports: 2 }),
    'מאז שהיית כאן: 3 אישורים ממתינים, 2 דוחות חדשים');
});

test('sinceNow takes claude answers only and open approve docs only', () => {
  const api = load({}, {});
  const data = {
    chat: [{ from: 'itzik', at: after }, { from: 'claude', at: after }],
    reports: [{ at: after, title: 'x' }],
    choices: [
      { type: 'approve', id: 'open' },
      { type: 'approve', id: 'done' },
      { type: 'choice', id: 'other' },
    ],
  };
  const now = api.sinceNow(data, ['done']);
  assert.deepStrictEqual(now.answerAts, [after]);
  assert.deepStrictEqual(now.reportAts, [after]);
  assert.deepStrictEqual(now.approvalIds, ['open']);
});

test('the snapshot is saved on leave and read back on the next load', () => {
  const store = {};
  const els = {};
  const api = load(store, els);
  const now = { answerAts: [after], reportAts: [], approvalIds: ['a9'] };
  const snap = api.sinceSnapshot(now, T0);
  api.sinceWrite(snap);
  const back = api.sinceRead();
  assert.strictEqual(back.at, T0);
  assert.deepStrictEqual(back.approvalIds, ['a9']);
});

test('renderSince shows nothing on a first visit, then the line on the next one', () => {
  const store = {};
  const box = { hidden: true, textContent: '' };
  const els = { sinceBox: box };
  const api = load(store, els);
  api.renderSince();
  assert.strictEqual(box.hidden, true, 'no snapshot yet, so hidden');

  // The page was left at T0 with nothing waiting; a claude answer came after.
  api.sinceWrite({ at: T0, approvalIds: [] });
  const data = { chat: [{ from: 'claude', at: after }], reports: [], choices: [] };
  const seeded = load(store, els);
  const d = seeded.sinceDiff(seeded.sinceRead(), seeded.sinceNow(data, []));
  assert.strictEqual(d.answers, 1);
  assert.strictEqual(seeded.sinceLine(d), 'מאז שהיית כאן: תשובה חדשה אחת');
});

test('the box is made above approvalsBox when the markup lacks it', () => {
  const store = {};
  const inserted = [];
  const parent = { insertBefore(node, ref) { inserted.push([node, ref]); } };
  const approvals = { parentNode: parent };
  const els = { approvalsBox: approvals };
  const api = load(store, els);
  api.renderSince();
  assert.strictEqual(inserted.length, 1);
  assert.strictEqual(inserted[0][1], approvals, 'inserted before approvalsBox');
  assert.strictEqual(inserted[0][0].id, 'sinceBox');
});

test('the built page carries the since box code and its boot', () => {
  const { renderPage } = require('../build.js');
  const html = renderPage({
    now: null, openCmds: [], builtAt: '2026-10-24T10:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [],
  });
  assert.ok(html.includes('function renderSince'), 'renderSince missing');
  assert.ok(html.includes("boot('since',sinceBoot)"), 'since boot missing');
  assert.ok(html.includes("'sinceSnap'"), 'snapshot key missing');
});
