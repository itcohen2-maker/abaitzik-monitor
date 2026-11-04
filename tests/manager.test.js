'use strict';
// 4.11.2026: tests for lib/manager.js (the manager's morning round).
const { test } = require('node:test');
const assert = require('node:assert');
const M = require('../lib/manager.js');

const WED = Date.parse('2026-11-04T07:25:00+02:00');
const SAT = Date.parse('2026-11-07T07:25:00+02:00');

const base = {
  now: WED,
  reports: [{ _file: '20261104-0703-morning-brief.json', at: '2026-11-04T05:03:00Z', title: 'דוח בוקר 4.11: רשות המסים', body: 'דחוף\nרשות המסים: הודעה חדשה\nטופס לא מופעל\n\nמיילים\nאחר' }],
  cal: { at: '2026-11-04T05:15:00Z', events: [
    { id: 'a', title: 'פגישה עם לקוח', start: '2026-11-04T11:00:00+02:00', allDay: false },
    { id: 'b', title: 'יום הולדת', start: '2026-11-04', allDay: true },
    { id: 'c', title: 'מחר', start: '2026-11-05T09:00:00+02:00', allDay: false },
  ] },
  health: { cards: [{ id: 'abaitzik', problems: ['x'] }, { id: 'rinat', title: 'המוניטור של רינת', problems: ['המאזין לא רץ'] }, { id: 'alon', title: 'המוניטור של אלון', problems: [] }] },
  chat: [{ heldWhy: 'lead', at: '2026-11-04T04:00:00Z', text: 'ליד מהאתר' }],
  contacts: [],
  plate: [{ name: 'לימון', posted: true, postedAt: '2026-11-03T10:00:00Z', order: 3 }, { name: 'אפונה', order: 4 }],
  status: [{ date: '2026-11-04', topic: 'האתר' }],
};

test('a full round has every item in order', () => {
  const m = M.build(base);
  assert.deepStrictEqual(m.items.map(i => i.k), ['brief', 'mail', 'cal', 'clients', 'leads', 'plate', 'status']);
  const by = Object.fromEntries(m.items.map(i => [i.k, i]));
  assert.strictEqual(by.mail.st, 'warn');
  assert.match(by.mail.t, /2 דברים דחופים/);
  assert.strictEqual(by.cal.st, 'todo');
  assert.match(by.cal.sub, /^יום הולדת · 11:00 פגישה/);
  assert.strictEqual(by.clients.st, 'warn');
  assert.match(by.clients.sub, /רינת/);
  assert.strictEqual(by.leads.st, 'warn');
  assert.match(by.plate.sub, /אפונה/);
  assert.strictEqual(by.status.st, 'todo');
});

test('no dashes anywhere in the visible text', () => {
  const m = M.build({ ...base, cal: { at: base.cal.at, events: [{ id: 'd', title: 'פגישה - חשובה', start: '2026-11-04T12:00:00+02:00' }] } });
  for (const i of m.items) assert.ok(!/[-–—]/.test(i.t + (i.sub || '')), i.t);
});

test('missing brief and stale calendar are warnings, not silence', () => {
  const m = M.build({ ...base, reports: [], cal: null });
  assert.strictEqual(m.items.find(i => i.k === 'brief').st, 'warn');
  assert.strictEqual(m.items.find(i => i.k === 'cal').st, 'warn');
});

test('plate posted today is done; Saturday has no status', () => {
  const m = M.build({ ...base, now: SAT, plate: [{ name: 'אפונה', posted: true, postedAt: '2026-11-07T06:00:00Z' }] });
  assert.strictEqual(m.items.find(i => i.k === 'plate').st, 'done');
  assert.strictEqual(m.items.find(i => i.k === 'status').st, 'done');
});

test('alarms only for timed events still ahead, once', () => {
  const m = M.build(base);
  assert.deepStrictEqual(M.alarmsDue(m, WED, []).map(e => e.id), ['a']);
  assert.deepStrictEqual(M.alarmsDue(m, WED, ['2026-11-04|a']), []);
});

test('push lists only what is open', () => {
  const p = M.pushText(M.build(base));
  assert.ok(p.title.startsWith('המנהל'));
  assert.ok(!/דוח הבוקר מוכן/.test(p.body));
});

test('an appointment of the monitor counts, once, even with no calendar', () => {
  const appts = [{ id: 'x', what: 'רופא שיניים', when: '2026-11-04T18:45:00+02:00' }];
  const m = M.build({ ...base, cal: null, appts });
  const c = m.items.find(i => i.k === 'cal');
  assert.strictEqual(c.st, 'todo');
  assert.match(c.sub, /18:45 רופא שיניים/);
  assert.ok(!('_ev' in c));
  assert.deepStrictEqual(M.alarmsDue(m, WED, []).map(e => e.id), ['appt-x']);
  const both = M.build({ ...base, appts: [{ id: 'y', what: 'פגישה', when: '2026-11-04T11:00:00+02:00' }] });
  assert.strictEqual(both.items.find(i => i.k === 'cal').sub.split('·').length, 2);
});
