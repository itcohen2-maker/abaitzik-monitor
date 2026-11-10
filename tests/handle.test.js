'use strict';
// 10.11.2026: the "📋 לטיפול" queue, lib/handle.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('../lib/handle.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'handle-')); }
const form = (k, extra) => Object.assign({ key: k, kind: 'setup', who: 'ד״ר שולמן', title: 'מילא את טופס ההקמה', link: 'answers' }, extra || {});

test('add: one file per completion, and the same key twice makes one item', () => {
  const d = tmp();
  const a = H.add(d, form('setup:tok1:2026-11-09'));
  const b = H.add(d, form('setup:tok1:2026-11-09'));
  assert.strictEqual(a.created, true);
  assert.strictEqual(b.created, false);
  assert.strictEqual(b.item.id, a.item.id);
  assert.strictEqual(fs.readdirSync(H.dirOf(d)).length, 1);
  assert.ok(/^\d{8}-\d{4}-setup-[a-f0-9]{6}\.json$/.test(fs.readdirSync(H.dirOf(d))[0]));
  assert.strictEqual(H.open(d).length, 1);
});

test('add: a different completion (the form reopened and finished again) is a new item', () => {
  const d = tmp();
  H.add(d, form('setup:tok1:2026-11-09'));
  H.add(d, form('setup:tok1:2026-11-11'));
  assert.strictEqual(H.open(d).length, 2);
});

test('add: needs a key, cleans dashes from the copy, falls back on unknown kind and link', () => {
  const d = tmp();
  assert.strictEqual(H.add(d, { kind: 'setup' }).created, false);
  const r = H.add(d, { key: 'x', kind: 'nope', who: 'א-ב', title: 'חתם - על הסכם', link: 'http://evil' });
  assert.strictEqual(r.item.kind, 'other');
  assert.strictEqual(r.item.link, 'answers');
  assert.ok(!/[-–—]/.test(r.item.who + r.item.title));
});

test('done: marks the item, leaves the file, a second call and an unknown id are false', () => {
  const d = tmp();
  const it = H.add(d, form('k1')).item;
  assert.strictEqual(H.done(d, 'nope'), false);
  assert.strictEqual(H.done(d, it.id), true);
  assert.strictEqual(H.done(d, it.id), false);
  assert.strictEqual(H.open(d).length, 0);
  assert.strictEqual(H.all(d)[0].done, true);
  assert.ok(H.all(d)[0].doneAt);
});

test('done: an item marked done is not made again by the same completion', () => {
  const d = tmp();
  const it = H.add(d, form('k1')).item;
  H.done(d, it.id);
  assert.strictEqual(H.add(d, form('k1')).created, false);
  assert.strictEqual(H.open(d).length, 0);
});

test('open and forPage: newest first, open only, nothing but the fields the page needs', () => {
  const d = tmp();
  H.add(d, form('old', { at: '2026-11-09T21:06:00.000Z', who: 'ישן' }));
  H.add(d, form('new', { at: '2026-11-10T08:00:00.000Z', who: 'חדש' }));
  const gone = H.add(d, form('gone', { at: '2026-11-10T09:00:00.000Z', who: 'נסגר' })).item;
  H.done(d, gone.id);
  const p = H.forPage(d);
  assert.deepStrictEqual(p.map((x) => x.who), ['חדש', 'ישן']);
  assert.deepStrictEqual(Object.keys(p[0]).sort(), ['at', 'id', 'kind', 'link', 'title', 'who']);
});

test('summary: count, the oldest open item and its age in hours', () => {
  const d = tmp();
  assert.deepStrictEqual(H.summary(d, Date.now()), { n: 0, oldest: null, hours: 0 });
  H.add(d, form('a', { at: '2026-11-09T21:06:00.000Z', who: 'ישן' }));
  H.add(d, form('b', { at: '2026-11-10T06:00:00.000Z', who: 'חדש' }));
  const s = H.summary(d, Date.parse('2026-11-10T00:06:00.000Z'));
  assert.strictEqual(s.n, 2);
  assert.strictEqual(s.oldest.who, 'ישן');
  assert.strictEqual(Math.round(s.hours), 3);
});

test('an empty or missing folder is an empty list, not an error', () => {
  const d = tmp();
  assert.deepStrictEqual(H.open(d), []);
  assert.deepStrictEqual(H.forPage(path.join(d, 'none')), []);
});

test('manager: handleItem is a warn line with the oldest and its age, and none when nothing is open', () => {
  const M = require('../lib/manager.js');
  assert.strictEqual(M.handleItem({ n: 0, oldest: null, hours: 0 }), null);
  const it = M.handleItem({ n: 2, oldest: { who: 'ד״ר שולמן', title: 'מילא את טופס ההקמה', link: 'answers' }, hours: 5.5 });
  assert.strictEqual(it.st, 'warn');
  assert.ok(it.t.indexOf('2') >= 0 && it.sub.indexOf('5 שעות') >= 0);
  assert.ok(!/[-–—]/.test(it.t + it.sub));
  assert.ok(it.hours > 3);
});

// 10.11.2026: customer requests ("📨 בקשה מהמנהלה") and the automatic answer.
test('requests: one item per pending request, idempotent, closed when Itzik decides', () => {
  const d = tmp();
  const reqs = [
    { id: 'cr1', at: '2026-11-10T10:00:00.000Z', text: 'תוסיף לי כפתור - של קניות', status: 'pending' },
    { id: 'cr2', at: '2026-11-10T11:00:00.000Z', text: 'שינוי צבע', status: 'pending' },
  ];
  assert.strictEqual(H.fromRequests(d, 'pablo', 'ד״ר שולמן', reqs), true);
  assert.strictEqual(H.fromRequests(d, 'pablo', 'ד״ר שולמן', reqs), false);
  const o = H.open(d);
  assert.strictEqual(o.length, 2);
  assert.ok(o.every((x) => x.kind === 'request' && x.link === 'tenants' && x.who === 'ד״ר שולמן'));
  assert.ok(!/[-–—]/.test(o[1].title));
  reqs[0].status = 'approved';
  assert.strictEqual(H.fromRequests(d, 'pablo', 'ד״ר שולמן', reqs), true);
  assert.deepStrictEqual(H.open(d).map((x) => x.title), ['שינוי צבע']);
  // the same request does not come back once decided
  H.fromRequests(d, 'pablo', 'ד״ר שולמן', [{ id: 'cr1', at: reqs[0].at, text: 'x', status: 'pending' }]);
  assert.strictEqual(H.open(d).length, 1);
});

test('requests: one already approved by code (skip) makes no item; two tenants never collide', () => {
  const d = tmp();
  const r = { id: 'cr9', at: '2026-11-10T10:00:00.000Z', text: 'x', status: 'pending' };
  assert.strictEqual(H.fromRequests(d, 'rinat', 'רינת', [r], [r]), false);
  H.fromRequests(d, 'a', 'א', [r]);
  H.fromRequests(d, 'b', 'ב', [r]);
  assert.strictEqual(H.open(d).length, 2);
});

test('the customer gets the automatic answer from the listener, with no model, and Itzik gets the tile and the sweep', () => {
  const root = path.join(__dirname, '..');
  const listen = fs.readFileSync(path.join(root, 'listen.js'), 'utf8');
  assert.ok(listen.includes('בקשתך התקבלה, תודה. נחזור אליך בהקדם.'));
  const i = listen.indexOf('בקשתך התקבלה');
  assert.ok(listen.slice(i - 400, i).includes('claude-admin-ack'), 'written as the listener ack');
  assert.ok(listen.slice(i, i + 300).includes("status: 'done'"));
  const th = fs.readFileSync(path.join(root, 'tenants-health.js'), 'utf8');
  assert.ok(th.includes('fromRequests('), 'the tenants sweep files the request for Itzik');
  const b = fs.readFileSync(path.join(root, 'build.js'), 'utf8');
  assert.ok(b.includes('id="gReq" hidden data-new="1"') && b.includes('📨 בקשה מהמנהלה'));
  assert.ok(b.includes("gAdminReq: ['g3', '📨 בקשה ממערכת המוניטור'"));
  assert.ok(b.includes("'🧑‍💼 המנהלת של ' + esc(inst.owner)"));
  assert.ok(b.includes('בקשה ממנהל: '), 'the wire prefix is unchanged');
});
