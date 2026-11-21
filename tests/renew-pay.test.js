'use strict';
/*
  21.11.2026: a paid customer whose renewal failed, or who is suspended, pays his own package at his grandfathered
  price + VAT through a real link (chat, WhatsApp, the 📦 sheet). SUMIT is stubbed: no network, no charge.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const D = require('../lib/pay-day.js');
const S = require('../lib/sumit.js');
const PL = require('../lib/plan.js');
const A = require('../lib/addons.js');
const RL = require('../lib/renew-link.js');
const R = require('../lib/renewal.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const who = { name: 'דני', email: 'd@example.com', phone: '0500000000', home: 'https://t1.m.it-solution.co.il/' };
const FAILED = { Status: 3, ID: 91, Item: { Name: 'המוניטור העסקי, חבילת עצמאי' } };
const OK = { Status: 0, ID: 92, Item: { Name: 'חיבור לבנק, קריאה בלבד' } };

function setup(payment, items) {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'renewpay-'));
  const begun = [], cancelled = [], started = [];
  const P = Object.assign({}, S, {
    beginEntry: async (o) => { begun.push(o); return 'https://sumit.co.il/x'; },
    getPayment: async () => payment,
    listRecurring: async () => items || [],
    cancelRecurring: async (c, id) => { cancelled.push(id); return {}; },
    startRecurring: async (c, env, now, m) => { started.push({ c, m }); return {}; },
  });
  const writes = [];
  return { DATA, P, begun, cancelled, started, writes, deps: { DATA, P, PL, A, now: NOW, writePlan: (t, st) => writes.push([t, st]), lookup: async () => 't1', owner: () => {} } };
}
const lastOrderId = (w) => w.begun[w.begun.length - 1].redirect.split('=').pop();
const suspendedSolo = { plan: 'solo', price: 139, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [], suspended: true, ref: 'm-gypsum', source: 'day' };
const pay = (extra) => Object.assign({ ID: 8001, CustomerID: 555, ValidPayment: true, Amount: 175.82 }, extra || {});

test('renewal start: a suspended paid customer gets an order at his joined price (139), not the regular one', async () => {
  const w = setup(pay());
  const r = await D.renewStart({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: suspendedSolo, who });
  assert.equal(r.status, 200);
  assert.equal(w.begun[0].items[0].price, 139);
  const o = JSON.parse(fs.readFileSync(path.join(w.DATA, 'pay', 'orders', lastOrderId(w) + '.json'), 'utf8'));
  assert.deepEqual([o.kind, o.plan, o.price, o.status], ['renew', 'solo', 139, 'open']);
});

test('negative: an active customer (not failed, not suspended), a trial, or a customer with no plan gets no renewal order', async () => {
  const w = setup(pay());
  assert.equal((await D.renewStart({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: Object.assign({}, suspendedSolo, { suspended: false }), who })).status, 409);
  assert.equal((await D.renewStart({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: { plan: 'trial', start: '2026-12-01T10:00:00Z', suspended: true }, who })).status, 409);
  assert.equal((await D.renewStart({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: null, who })).status, 409);
  assert.equal(w.begun.length, 0);
});

test('a failed charge (failing flag) is renewable before the stop too', async () => {
  const w = setup(pay());
  const failing = Object.assign({}, suspendedSolo, { suspended: false, failing: true });
  assert.equal((await D.renewStart({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: failing, who })).status, 200);
});

test('renewal finish: the payment clears the stop and the failure, cancels only the failed package order, starts a new one at the same price', async () => {
  const w = setup(pay({ CustomerID: 555 }), [FAILED, OK]);
  await D.renewStart({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: suspendedSolo, who });
  const oid = lastOrderId(w);
  await D.finish(w.deps, { tenant: 't1', pid: '8001', oid, state: suspendedSolo, who });
  const st = w.writes[0][1];
  assert.equal(st.suspended, undefined);
  assert.equal(st.failing, undefined);
  assert.equal(st.plan, 'solo');
  assert.equal(st.price, 139);
  assert.deepEqual(w.cancelled, [91]);
  assert.deepEqual(w.started[0].m, { name: 'המוניטור העסקי, חבילת עצמאי', price: 139, note: 'מנוי חודשי, חבילת עצמאי' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(w.DATA, 'renewal', 't1.json'), 'utf8')).failure, {});
});

test('negative: a renewal for t2 paid by the SUMIT customer bound to t1 is refused, and nothing changes', async () => {
  const w = setup(pay({ CustomerID: 555 }), [FAILED]);
  // t1 is already bound to SUMIT customer 555 by its first payment
  fs.mkdirSync(path.join(w.DATA, 'pay', 'customers'), { recursive: true });
  fs.writeFileSync(path.join(w.DATA, 'pay', 'customers', 't1.json'), JSON.stringify({ customerId: 555 }));
  await D.renewStart({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't2', state: suspendedSolo, who });
  const oid = lastOrderId(w);
  await assert.rejects(D.finish(w.deps, { tenant: 't2', pid: '8003', oid, state: suspendedSolo, who }), /tenant|customer/);
  assert.equal(w.writes.length, 0);
  assert.equal(w.started.length, 0);
});

test('negative: the same renewal link paid twice (two returns at once) changes the plan once', async () => {
  const w = setup(pay({ CustomerID: 555 }), [FAILED]);
  await D.renewStart({ DATA: w.DATA, P: w.P, PL, A, now: NOW, tenant: 't1', state: suspendedSolo, who });
  const oid = lastOrderId(w);
  const res = await Promise.allSettled([D.finish(w.deps, { tenant: 't1', pid: '8004', oid, state: suspendedSolo, who }), D.finish(w.deps, { tenant: 't1', pid: '8004', oid, state: suspendedSolo, who })]);
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(w.started.length, 1);
});

test('the renewal link: issued for one tenant, verified only for that tenant, refused when old, forged or malformed', () => {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'renewlink-'));
  const tok = RL.issue(DATA, 't1', NOW);
  assert.equal(RL.verify(DATA, tok, NOW), 't1');
  assert.equal(RL.verify(DATA, tok, NOW + RL.TTL + 1000), null, 'expired');
  assert.equal(RL.verify(DATA, tok.replace('t1.', 't2.'), NOW), null, 'another tenant');
  assert.equal(RL.verify(DATA, tok.slice(0, -1) + (tok.endsWith('0') ? '1' : '0'), NOW), null, 'forged');
  assert.equal(RL.verify(DATA, 'junk', NOW), null, 'malformed');
  assert.equal(RL.verify(fs.mkdtempSync(path.join(os.tmpdir(), 'renewlink-')), tok, NOW), null, 'another install');
});

test('the renewal texts carry the link, and never say "contact us"', () => {
  const url = 'https://wa.abaitzik.com/api/pay/renew/x';
  const f = R.failText(139, url), s = R.stopText(139, url);
  assert.ok(f.includes(url) && s.includes(url));
  assert.match(f, /139 ₪ לחודש \+ מע״מ/);
  assert.doesNotMatch(f + s, /פנה אלינו/);
  assert.doesNotMatch(f + s, /[-–]/);
  assert.match(PL.suspendedLine(139), /הכפתור/);
  assert.doesNotMatch(PL.suspendedLine(139), /פנה אלינו/);
});

test('the 📦 sheet ships the renewal button and posts to the renewal start', () => {
  const ui = require('../lib/plan-ui.js');
  assert.ok(ui.js.includes('data-pk="renew"'));
  assert.ok(ui.js.includes('https://wa.abaitzik.com/api/pay/renew'));
});
