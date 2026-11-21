'use strict';
/*
  21.11.2026, Itzik: a failed monthly charge (SUMIT recurring status 3, 14 or 11) is told to the customer once, with the
  pay link (the 📦 tile), and to Itzik once. Service continues 7 days from the first failure, then the plan stops
  the way a trial ends. The month's value summary goes out 1 to 2 days before the renewal. SUMIT is stubbed here.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const R = require('../lib/renewal.js');

const DAY = 864e5;
const T0 = Date.parse('2026-12-10T08:00:00Z');
const solo = { plan: 'solo', price: 149, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [] };
const item = (status, next) => ({ Status: status, Date_NextBilling: next || null, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } });

test('statuses 3, 14 and 11 are a failed charge, 0 is fine', () => {
  // 3rd review: the newest standing order of the package is the one that counts
  assert.equal(R.failing([Object.assign(item(0), { ID: 1 }), Object.assign(item(3), { ID: 2 })]), true);
  assert.equal(R.failing([item(14)]), true);
  assert.equal(R.failing([item(11)]), true);
  assert.equal(R.failing([item(0), item(1)]), false);
  assert.equal(R.failing([]), false);
});

test('the first failure tells both once; later runs tell nothing; after 7 days the plan stops once; recovery resumes', () => {
  let s = {};
  let r = R.step(s, true, T0);
  assert.equal(r.tellCustomer, true); assert.equal(r.tellItzik, true); assert.equal(r.suspend, false);
  s = r.next;
  r = R.step(s, true, T0 + DAY);
  assert.equal(r.tellCustomer, false); assert.equal(r.tellItzik, false); assert.equal(r.suspend, false);
  r = R.step(s, true, T0 + 8 * DAY);
  assert.equal(r.suspend, true);
  s = r.next;
  r = R.step(s, true, T0 + 9 * DAY);
  assert.equal(r.suspend, false);
  // 21.11.2026 security review: recovery needs two good days in a row (the first good run only starts the clock).
  r = R.step(s, false, T0 + 9 * DAY);
  assert.equal(r.resume, false);
  r = R.step(r.next, false, T0 + 11 * DAY);
  assert.equal(r.resume, true);
  assert.deepEqual(r.next, {});
});

test('the summary is due 1 to 2 days before the renewal, not a day sooner or later', () => {
  const next = (h) => new Date(T0 + h * 3600e3).toISOString();
  assert.equal(R.summaryDue(next(36), T0), true);
  assert.equal(R.summaryDue(next(2), T0), false);
  assert.equal(R.summaryDue(next(24 * 5), T0), false);
});

test('the counts come from the month: summaries, quotes sent and signatures', () => {
  const usage = [
    JSON.stringify({ at: '2026-12-02T10:00:00Z', msgs: 4, kind: 'meeting' }),
    JSON.stringify({ at: '2026-12-03T10:00:00Z', msgs: 3, kind: 'meeting' }),
    JSON.stringify({ at: '2026-11-03T10:00:00Z', msgs: 3, kind: 'meeting' }),
  ].join('\n');
  const csign = [
    { at: '2026-12-02T10:00:00Z', state: { signedAt: '2026-12-02T11:00:00Z' } },
    { at: '2026-12-04T10:00:00Z', state: {} },
  ];
  const items = [{ id: 'a', start: '2026-12-05T09:00:00Z', status: 'booked' }, { id: 'b', start: '2026-12-06T09:00:00Z', status: 'cancelled' }, { id: 'c', start: '2026-11-06T09:00:00Z', status: 'booked' }];
  assert.deepEqual(R.countsFrom({ usageText: usage, csignRecs: csign, items, month: '2026-12' }), { summaries: 2, quotes: 2, signed: 1, bookings: 1 });
});

test('the texts: + מע״מ wherever a price appears, no dashes', () => {
  const f = R.failText(149), s = R.stopText(149);
  assert.match(f, /149 ₪ לחודש \+ מע״מ/);
  assert.match(s, /149 ₪ לחודש \+ מע״מ/);
  assert.doesNotMatch(f + s, /[-–]/);
  const m = R.summaryText({ label: 'עצמאי', used: 48, total: 60, summaries: 2, quotes: 3, signed: 1, price: 149 });
  assert.match(m, /48 מתוך 60/);
  assert.match(m, /149 ₪ לחודש \+ מע״מ/);
  assert.doesNotMatch(m, /[-–]/);
});

function world(DATA, extra) {
  const told = { chat: [], itzik: [], plans: [] };
  const deps = Object.assign({
    DATA, now: T0, plans: { ten1: solo }, customerIdOf: () => 77,
    listRecurring: async () => [item(0, new Date(T0 + 36 * 3600e3).toISOString())],
    tenantDir: (t) => path.join(DATA, 'tenants', t),
    tellChat: (dir, text) => told.chat.push(text),
    tellItzik: (t, text, key) => told.itzik.push(key),
    writePlan: (t, st) => told.plans.push(st),
  }, extra || {});
  return { deps, told };
}

test('runOnce: a failed charge is told once to the customer and once to Itzik, then the plan stops after 7 days', async () => {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'renew-'));
  const fail = [item(3)];
  let w = world(DATA, { listRecurring: async () => fail });
  await R.runOnce(w.deps);
  assert.equal(w.told.chat.length, 1);
  assert.match(w.told.chat[0], /149 ₪ לחודש \+ מע״מ/);
  assert.equal(w.told.itzik.length, 1);
  await R.runOnce(Object.assign({}, w.deps, { now: T0 + DAY }));
  assert.equal(w.told.chat.length, 1);
  assert.equal(w.told.itzik.length, 1);
  await R.runOnce(Object.assign({}, w.deps, { now: T0 + 8 * DAY }));
  // the first failure also writes the failing flag; the stop writes suspended once
  assert.equal(w.told.plans.filter((p) => p.suspended).length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(DATA, 'renewal', 'ten1.json'), 'utf8')).failure.suspendedAt !== undefined, true);
});

test('runOnce: the summary goes once in the month, 1 to 2 days before the renewal', async () => {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'renew-'));
  const dir = path.join(DATA, 'tenants', 'ten1');
  fs.mkdirSync(path.join(dir, 'data', 'status'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'status', 'usage.jsonl'), JSON.stringify({ at: '2026-12-02T10:00:00Z', msgs: 48, usd: 0 }) + '\n');
  const w = world(DATA);
  await R.runOnce(w.deps);
  assert.equal(w.told.chat.length, 1);
  assert.match(w.told.chat[0], /48 מתוך 60/);
  await R.runOnce(w.deps);
  assert.equal(w.told.chat.length, 1);
});

test('a suspended paid plan reads as ended with the stop text, the way a trial ends', () => {
  const P = require('../lib/plan.js');
  const st = P.status(Object.assign({}, solo, { suspended: true }), '', T0);
  assert.equal(st.level, 'ended');
  assert.match(st.say, /החיוב החודשי לא עבר/);
  assert.equal(P.status(solo, '', T0).level, 'ok');
});
