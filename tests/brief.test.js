'use strict';
// 24.10.2026: tests for lib/brief.js (the morning brief as metrics).
const { test } = require('node:test');
const assert = require('node:assert');
const brief = require('../lib/brief.js');

// 2026-10-24 is a Saturday in Israel; 2026-10-25 is the Sunday after it.
const SAT = Date.parse('2026-10-24T09:00:00+03:00');
const SUN = Date.parse('2026-10-25T09:00:00+03:00');
const DAY = 24 * 3600 * 1000;

function appr(i, at) {
  return { id: 'ap' + i, type: 'approve', kind: 'send', question: 'שליחה מספר ' + i, at, answer: undefined };
}
function debt(name, amount, invDate) {
  return { kind: 'debt', name, amount, inv: [{ date: invDate, amount, label: 'x' }] };
}

test('items keep importance order whatever the input order', () => {
  const doc = brief.buildBrief({
    now: SAT,
    choices: [{ ...appr(1, '2026-10-20T10:00:00+03:00'), type: 'approve' }],
    debts: [debt('סלאס', 5000, '01.08.2026')],
    appts: [{ id: 'a1', what: 'רופא', when: '2026-10-24T14:00:00+03:00' }],
    contacts: [{ name: 'ליד חדש', at: '2026-10-24T08:00:00+03:00', status: 'חדש' }],
    health: { cards: [{ id: 'x', title: 'המוניטור שלך', ok: false, problems: ['המאזין לא רץ'] }] },
  });
  const kinds = doc.items.map(i => i.sub);
  assert.equal(doc.items.length, 5);
  assert.equal(doc.items[0].t, 'שליחה מספר 1');
  assert.match(doc.items[1].t, /^סלאס/);
  assert.match(doc.items[2].t, /^רופא/);
  assert.match(doc.items[3].t, /^ליד חדש/);
  assert.match(doc.items[4].t, /^תקלה/);
  assert.equal(kinds.length, 5);
});

test('max five items, and each category is capped', () => {
  const choices = [1, 2, 3, 4, 5].map(i => ({ ...appr(i, '2026-10-2' + i + 'T10:00:00+03:00') }));
  const appts = [1, 2, 3].map(i => ({ id: 'a' + i, what: 'תור ' + i, when: '2026-10-24T1' + i + ':00:00+03:00' }));
  const doc = brief.buildBrief({ now: SAT, choices, appts });
  assert.equal(doc.items.length, 5);
  // approvals are capped at three, so the appointments get the other two places
  assert.deepEqual(doc.items.map(i => i.t), ['שליחה מספר 1', 'שליחה מספר 2', 'שליחה מספר 3', 'תור 1', 'תור 2']);
});

test('approval wait: answered and expired approvals are not items', () => {
  const choices = [
    { ...appr(1, '2026-10-20T10:00:00+03:00'), answer: 'אישור:' },
    { ...appr(2, '2026-10-20T10:00:00+03:00'), expires: '2026-10-23T10:00:00+03:00' },
    { ...appr(3, '2026-10-20T10:00:00+03:00') },
  ];
  const doc = brief.buildBrief({ now: SAT, choices });
  assert.deepEqual(doc.items.map(i => i.t), ['שליחה מספר 3']);
});

test('debtors: only the overdue part counts, and a debt with no dates is left out', () => {
  const d = [
    { kind: 'debt', name: 'אורביט', amount: 900, inv: [{ date: '01.08.2026', amount: 300 }, { date: '20.10.2026', amount: 600 }] },
    { kind: 'debt', name: 'בלי תאריכים', amount: 100 },
  ];
  const out = brief.overdueDebtors(d, SAT);
  assert.deepEqual(out, [{ name: 'אורביט', sum: 300 }]);
});

test('empty day gives no items and no notify', () => {
  const doc = brief.buildBrief({ now: SAT });
  assert.deepEqual(doc.items, []);
  assert.equal(doc.done, true);
  assert.equal(brief.notifyPlan(doc, null, SAT).send, false);
});

test('notify: once a day, and not again for the same items', () => {
  const doc = brief.buildBrief({ now: SAT, choices: [appr(1, '2026-10-20T10:00:00+03:00')] });
  const first = brief.notifyPlan(doc, null, SAT);
  assert.equal(first.send, true);
  const after = brief.recordNotify(null, SAT, first.sig);
  // a second run the same day: already sent
  assert.equal(brief.notifyPlan(doc, after, SAT + 3600e3).send, false);
  // the next day with the same items: no change, no notify
  assert.equal(brief.notifyPlan(doc, after, SAT + DAY).send, false);
  // the next day with a changed list: notify again
  const doc2 = brief.buildBrief({ now: SAT + DAY, choices: [appr(2, '2026-10-21T10:00:00+03:00')] });
  assert.equal(brief.notifyPlan(doc2, after, SAT + DAY).send, true);
});

test('Sunday adds the week digest, other days do not', () => {
  const chat = [
    { id: 'm1', from: 'itzik', text: 'שלום', at: new Date(SUN - 2 * DAY).toISOString() },
    { id: 'c1', from: 'claude', re: 'm1', text: 'היי', at: new Date(SUN - 2 * DAY + 1000).toISOString() },
    { id: 'c0', from: 'claude', re: 'old', text: 'ישן', at: new Date(SUN - 20 * DAY).toISOString() },
  ];
  const reports = [
    { title: 'דוח בוקר 20.10: x', at: new Date(SUN - DAY).toISOString() },
    { title: 'דוח רגיל', at: new Date(SUN - 3 * DAY).toISOString() },
  ];
  const choices = [{ ...appr(1, new Date(SUN - DAY).toISOString()), answer: 'אישור:', answeredAt: new Date(SUN - DAY).toISOString() }];
  const sun = brief.buildBrief({ now: SUN, chat, reports, choices });
  assert.ok(sun.week, 'Sunday has a week block');
  assert.equal(sun.week.answered, 1);
  assert.equal(sun.week.reports, 1, 'morning reports are left out of the count');
  assert.equal(sun.week.approvalsAsked, 1);
  assert.equal(sun.week.approvalsAnswered, 1);
  const sat = brief.buildBrief({ now: SAT, chat, reports, choices });
  assert.equal(sat.week, undefined);
});

test('spark is the last six days from previous docs, then today', () => {
  const prev = [
    { at: '2026-10-23T07:00:00+03:00', done: true, kpis: [{ k: 'תורים היום', v: 2 }] },
    { at: '2026-10-22T07:00:00+03:00', done: true, kpis: [{ k: 'תורים היום', v: 1 }] },
    { at: '2026-10-10T07:00:00+03:00', done: true, kpis: [{ k: 'תורים היום', v: 9 }] },
    { at: '2026-10-24T06:00:00+03:00', done: true, kpis: [{ k: 'תורים היום', v: 7 }] },
  ];
  const doc = brief.buildBrief({ now: SAT, prev, appts: [{ id: 'a', what: 'x', when: '2026-10-24T11:00:00+03:00' }] });
  const k = doc.kpis.find(x => x.k === 'תורים היום');
  assert.equal(k.v, 1);
  assert.deepEqual(k.spark, [1, 2, 1]);
});

test('spark with no history is just today', () => {
  const doc = brief.buildBrief({ now: SAT });
  assert.deepEqual(doc.kpis.find(x => x.k === 'תורים היום').spark, [0]);
});

test('money kpis come only from money.json and show the late part as bad', () => {
  const doc = brief.buildBrief({ now: SAT, money: { cash: 1200, debt: 5000, late: 300 } });
  const late = doc.kpis.find(x => x.k === 'באיחור');
  assert.equal(late.v, 300);
  assert.equal(late.state, 'bad');
  assert.equal(late.u, '₪');
  assert.equal(brief.buildBrief({ now: SAT }).kpis.some(x => x.k === 'מזומן'), false);
});

test('no dashes in visible copy', () => {
  const doc = brief.buildBrief({ now: SAT, contacts: [{ name: 'בן-עמי', at: '2026-10-24T08:00:00+03:00' }] });
  assert.equal(doc.items[0].t.includes('-'), false);
});

test('forPage: today or yesterday, finished docs only, latest wins', () => {
  const docs = [
    { at: '2026-10-22T07:00:00+03:00', done: true, n: 'old' },
    { at: '2026-10-23T07:00:00+03:00', done: true, n: 'yesterday' },
    { at: '2026-10-24T07:00:00+03:00', done: false, n: 'half' },
  ];
  assert.equal(brief.forPage(docs, SAT).n, 'yesterday');
  assert.equal(brief.forPage([docs[0]], SAT), null);
});
