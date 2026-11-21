'use strict';
// 3.11.2026: the business home tiles from real data (lib/biz-home.js) and the Fireflies mapping.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bh = require('../lib/biz-home.js');

const CLIENTS = [
  { id: 'c-dana', name: 'דנה לוי', emails: ['dana@levi-consult.co.il'], aliases: ['Dana'] },
  { id: 'c-ron', name: 'רון', emails: ['ron123@gmail.com'], domains: [] },
  { id: 'c-acme', name: 'אקמי', emails: [], domains: ['acme.co.il'] },
];

test('findClient: exact mail, then company domain, then name; gmail domain never matches', () => {
  assert.equal(bh.findClient(CLIENTS, [{ email: 'Dana@Levi-Consult.co.il' }]).id, 'c-dana');
  assert.equal(bh.findClient(CLIENTS, [{ email: 'cfo@levi-consult.co.il' }]).id, 'c-dana');
  assert.equal(bh.findClient(CLIENTS, [{ email: 'x@acme.co.il' }]).id, 'c-acme');
  assert.equal(bh.findClient(CLIENTS, [{ email: 'other@gmail.com' }]), null);
  assert.equal(bh.findClient(CLIENTS, [{ name: 'Dana Cohen' }]).id, 'c-dana');
  assert.equal(bh.findClient(CLIENTS, [], 'פגישת סטטוס עם אקמי').id, 'c-acme');
  assert.equal(bh.findClient([], [{ email: 'a@b.com' }]), null);
});

test('splitActionItems: the owner\'s items are mine, the rest the client\'s, timestamps go', () => {
  const t = '**Shai Bodek**\nSend the proposal (12:30)\n- Book the follow up\n\n**Dana Levi**\nSend the Q3 numbers (01:02:03)\n';
  const r = bh.splitActionItems(t, ['שי', 'Shai Bodek']);
  assert.deepEqual(r.me, ['Send the proposal', 'Book the follow up']);
  assert.deepEqual(r.client, ['Send the Q3 numbers']);
  assert.deepEqual(bh.splitActionItems('just one thing', ['שי']).me, ['just one thing']);
  assert.deepEqual(bh.splitActionItems('', []), { me: [], client: [] });
});

test('decisionsFrom and nextFrom pick the lines that say so', () => {
  assert.deepEqual(bh.decisionsFrom(['דיברנו על התקציב. הוחלט להעלות מחיר ב 5%. עוד משהו.']), ['הוחלט להעלות מחיר ב 5%.']);
  assert.deepEqual(bh.decisionsFrom(['We agreed to start in May.\nOther line']), ['We agreed to start in May.']);
  assert.equal(bh.nextFrom(['- פגישת המשך ביום חמישי']), 'פגישת המשך ביום חמישי');
  assert.equal(bh.nextFrom(['nothing here']), '');
});

const T = {
  id: 'abc', title: 'Weekly with Dana', date: Date.parse('2026-11-02T08:00:00Z'), duration: 42.4,
  participants: ['shaibodek@gmail.com', 'dana@levi-consult.co.il'],
  meeting_attendees: [{ displayName: 'Shai Bodek', email: 'shaibodek@gmail.com' }, { displayName: 'Dana Levi', email: 'dana@levi-consult.co.il' }],
  summary: { overview: 'סוכם שמתחילים בדצמבר.', action_items: '**Shai Bodek**\nSend proposal (00:10)\n**Dana Levi**\nSend numbers (00:20)', keywords: ['budget'] },
};

test('meetingFromTranscript: client by mail, tasks split, owner left out of people', () => {
  const { meeting, newClient } = bh.meetingFromTranscript(T, { clients: CLIENTS, ownerEmails: ['shaibodek@gmail.com'], ownerNames: ['שי'] });
  assert.equal(newClient, null);
  assert.equal(meeting.id, 'ff-abc');
  assert.equal(meeting.clientId, 'c-dana');
  assert.equal(meeting.at, '2026-11-02T08:00:00.000Z');
  assert.equal(meeting.minutes, 42);
  assert.deepEqual(meeting.people, ['Dana Levi']);
  assert.deepEqual(meeting.tasksMe, ['Send proposal']);
  assert.deepEqual(meeting.tasksClient, ['Send numbers']);
  assert.deepEqual(meeting.decisions, ['סוכם שמתחילים בדצמבר.']);
});

test('meetingFromTranscript: an unknown outsider becomes a new client, the owner never does', () => {
  const t = Object.assign({}, T, { title: 'Intro call', participants: [], meeting_attendees: [{ displayName: 'Shai Bodek', email: 'shaibodek@gmail.com' }, { displayName: 'Yossi K', email: 'yossi@newco.com' }] });
  const r = bh.meetingFromTranscript(t, { clients: CLIENTS, ownerEmails: ['shaibodek@gmail.com'], ownerNames: ['Shai'] });
  assert.ok(r.newClient);
  assert.equal(r.newClient.name, 'Yossi K');
  assert.deepEqual(r.newClient.emails, ['yossi@newco.com']);
  assert.equal(r.meeting.clientId, r.newClient.id);
  const alone = bh.meetingFromTranscript(Object.assign({}, T, { participants: [], meeting_attendees: [{ displayName: 'Shai', email: 'shaibodek@gmail.com' }] }), { clients: [], ownerEmails: ['shaibodek@gmail.com'], ownerNames: ['Shai'] });
  assert.equal(alone.newClient, null);
  assert.equal(alone.meeting.clientId, '');
});

test('upsert replaces by id and keeps newest first', () => {
  let l = bh.upsert([], { id: 'a', at: '2026-11-01' });
  l = bh.upsert(l, { id: 'b', at: '2026-11-03' });
  l = bh.upsert(l, { id: 'a', at: '2026-11-02', v: 2 });
  assert.deepEqual(l.map((x) => x.id), ['b', 'a']);
  assert.equal(l[1].v, 2);
});

test('clientView: last meeting, next event, open tasks, soonest first', () => {
  const now = Date.parse('2026-11-03T10:00:00Z');
  const meetings = [{ id: 'm1', clientId: 'c-dana', at: '2026-11-02T08:00:00Z', title: 'w', tasksMe: ['a'], tasksClient: ['b'], next: '' },
    { id: 'm2', clientId: 'c-ron', at: '2026-10-20T08:00:00Z', title: 'r', tasksMe: [], tasksClient: [], next: 'פגישת המשך בעוד שבועיים' }];
  const events = [{ start: '2026-11-05T09:00:00Z', title: 'סטטוס', attendees: ['dana@levi-consult.co.il'] }, { start: '2026-11-01T09:00:00Z', title: 'past', clientId: 'c-dana' }];
  const v = bh.clientView(CLIENTS, meetings, events, now);
  assert.equal(v[0].id, 'c-dana');
  assert.equal(v[0].next.at, '2026-11-05T09:00:00Z');
  assert.deepEqual(v[0].openMe, ['a']);
  assert.deepEqual(v[0].openClient, ['b']);
  const ron = v.find((c) => c.id === 'c-ron');
  assert.equal(ron.next.title, 'פגישת המשך בעוד שבועיים');
  assert.equal(v.find((c) => c.id === 'c-acme').last, null);
});

test('calView: today in Israel time, then the next two weeks', () => {
  const now = Date.parse('2026-11-03T10:00:00Z');
  const ev = [{ start: '2026-11-03T22:30:00Z', title: 'late' }, { start: '2026-11-03T21:30:00Z', title: 'tonight' },
    { start: '2026-11-10T09:00:00Z', title: 'next week' }, { start: '2026-12-30T09:00:00Z', title: 'far' }, { start: 'bad' }];
  const c = bh.calView(ev, CLIENTS, now);
  assert.deepEqual(c.today.map((e) => e.title), ['tonight']);
  assert.deepEqual(c.soon.map((e) => e.title), ['late', 'next week']);
});

test('view: an empty folder gives empty lists and nothing connected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-'));
  const data = path.join(dir, 'data'); fs.mkdirSync(data);
  fs.writeFileSync(path.join(dir, 'instance.json'), JSON.stringify({ biz: { name: 'הבודק', vat: '1' } }));
  const v = bh.view(data, dir, Date.parse('2026-11-03T10:00:00Z'));
  assert.deepEqual([v.meet, v.client, v.today, v.soon, v.mail, v.quote], [[], [], [], [], [], []]);
  assert.deepEqual(v.on, { fireflies: false, calendar: false, mail: false });
  assert.equal(v.biz.name, 'הבודק');
  assert.equal(v.logo, '');
  fs.writeFileSync(path.join(data, 'keys.json'), JSON.stringify({ firefliesKey: 'k' }));
  assert.equal(bh.view(data, dir).on.fireflies, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the page code has no dash in what the customer reads and nothing of Itzik', () => {
  const text = bh.js + bh.css + require('../lib/shop-list.js').js;
  for (const w of ['abaitzik', 'איציק', 'פגסוס', 'נרות', 'candletimes', ' - ', '–', '—']) assert.ok(!text.includes(w), w);
});
