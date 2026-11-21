'use strict';
/*
  21.11.2026: the trade packages' payment, route by route (wa-bridge /api/pay/start and /api/pay/done), with SUMIT
  stubbed: no network, no card. The real lib/sumit.js is kept for the amount check and the request bodies.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const D = require('../lib/pay-day.js');
const S = require('../lib/sumit.js');
const PL = require('../lib/plan.js');
const A = require('../lib/addons.js');

const NOW = Date.parse('2026-12-12T10:00:00Z');
const who = { name: 'דני', email: 'd@example.com', phone: '0500000000', home: 'https://t015ca3.m.it-solution.co.il/' };
const day = (extra) => Object.assign({ plan: 'trial', start: '2026-12-01T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [], source: 'day' }, extra || {});

function stubSumit(payment) {
  const calls = { begin: [], recurring: [] };
  const P = Object.assign({}, S, {
    beginEntry: async (o) => { calls.begin.push(o); return 'https://sumit.co.il/pay/abc'; },
    getPayment: async () => payment,
    startRecurring: async (cid, env, now, monthly) => { calls.recurring.push({ cid, monthly }); return {}; },
  });
  return { P, calls };
}
function tmpDATA() { return fs.mkdtempSync(path.join(os.tmpdir(), 'payday-')); }

test('start: a trade trial asks for solo, gets an order at 149 and a SUMIT page with the order id on the return', async () => {
  const DATA = tmpDATA();
  const { P, calls } = stubSumit({});
  const r = await D.start({ DATA, P, PL, A, now: NOW, tenant: 't015ca3', state: day(), who, plan: 'solo' });
  assert.equal(r.status, 200);
  assert.equal(r.body.url, 'https://sumit.co.il/pay/abc');
  const b = calls.begin[0];
  assert.equal(b.items[0].price, 149);
  assert.equal(b.items[0].name, 'המוניטור העסקי, חבילת עצמאי');
  assert.match(b.redirect, /\/api\/pay\/done\?o=[a-f0-9]{18}$/);
  const oid = b.redirect.split('=').pop();
  const o = JSON.parse(fs.readFileSync(path.join(DATA, 'pay', 'orders', oid + '.json'), 'utf8'));
  assert.deepEqual([o.kind, o.plan, o.price, o.status, o.tenant], ['day', 'solo', 149, 'open', 't015ca3']);
});

test('start: a plan he did not choose is refused (no 390, no order), and a customer past the trial gets 409', async () => {
  const DATA = tmpDATA();
  const { P, calls } = stubSumit({});
  assert.equal((await D.start({ DATA, P, PL, A, now: NOW, tenant: 't1', state: day(), who, plan: 'entry' })).status, 400);
  assert.equal((await D.start({ DATA, P, PL, A, now: NOW, tenant: 't1', state: day(), who, plan: '' })).status, 400);
  assert.equal((await D.start({ DATA, P, PL, A, now: NOW, tenant: 't1', state: day({ plan: 'solo', price: 149 }), who, plan: 'pro' })).status, 409);
  assert.equal(calls.begin.length, 0);
});

test('start: a customer who did not come from /day/ is not this route (the 390 entry flow stays)', async () => {
  const DATA = tmpDATA();
  const { P, calls } = stubSumit({});
  const r = await D.start({ DATA, P, PL, A, now: NOW, tenant: 't1', state: Object.assign(day(), { source: '' }), who, plan: 'solo' });
  assert.equal(r.status, 0);
  assert.equal(calls.begin.length, 0);
});

test('finish: the card paid 175.82 (149 + VAT): the plan becomes solo at the joined price, the monthly is solo at 149 before VAT', async () => {
  const DATA = tmpDATA();
  const start = await D.start({ DATA, P: stubSumit({}).P, PL, A, now: NOW, tenant: 't1', state: day(), who, plan: 'solo' });
  assert.equal(start.status, 200);
  const oid = JSON.parse(fs.readFileSync(path.join(DATA, 'pay', 'orders', fs.readdirSync(path.join(DATA, 'pay', 'orders'))[0]), 'utf8')).id;
  const { P, calls } = stubSumit({ ID: 9001, CustomerID: 555, ValidPayment: true, Amount: 175.82 });
  let written = null;
  const f = await D.finish({ DATA, P, PL, A, now: NOW, writePlan: (t, st) => { written = st; }, lookup: async () => 't1', owner: () => {} }, { tenant: 't1', pid: '9001', oid, state: day(), who });
  assert.equal(f.out.plan, 'solo');
  assert.equal(written.plan, 'solo');
  assert.equal(written.price, 149);
  assert.equal(written.start, undefined);
  assert.equal(calls.recurring[0].cid, 555);
  assert.deepEqual(calls.recurring[0].monthly, { name: 'המוניטור העסקי, חבילת עצמאי', price: 149, note: 'מנוי חודשי, חבילת עצמאי' });
  const o = JSON.parse(fs.readFileSync(path.join(DATA, 'pay', 'orders', oid + '.json'), 'utf8'));
  assert.equal(o.status, 'paid');
});

test('finish: a payment that is not valid, an order of another tenant, a reused order, or no order changes nothing', async () => {
  const DATA = tmpDATA();
  await D.start({ DATA, P: stubSumit({}).P, PL, A, now: NOW, tenant: 't1', state: day(), who, plan: 'pro' });
  const oid = fs.readdirSync(path.join(DATA, 'pay', 'orders'))[0].replace('.json', '');
  let writes = 0;
  const deps = (payment) => { const s = stubSumit(payment); return { DATA, P: s.P, PL, A, now: NOW, writePlan: () => { writes++; }, lookup: async () => 't1', owner: () => {} }; };
  await assert.rejects(D.finish(deps({ ID: 1, CustomerID: 5, ValidPayment: false, Amount: 293.82 }), { tenant: 't1', pid: '1', oid, state: day(), who }));
  await assert.rejects(D.finish(deps({ ID: 2, CustomerID: 5, ValidPayment: true, Amount: 293.82 }), { tenant: 'other', pid: '2', oid, state: day(), who }));
  await assert.rejects(D.finish(deps({ ID: 3, CustomerID: 5, ValidPayment: true, Amount: 293.82 }), { tenant: 't1', pid: '3', oid: '', state: day(), who }));
  assert.equal(writes, 0);
  const ok = await D.finish(deps({ ID: 4, CustomerID: 5, ValidPayment: true, Amount: 293.82 }), { tenant: 't1', pid: '4', oid, state: day(), who });
  assert.equal(ok.out.plan, 'pro');
  await assert.rejects(D.finish(deps({ ID: 5, CustomerID: 5, ValidPayment: true, Amount: 293.82 }), { tenant: 't1', pid: '5', oid, state: day(), who }));
  assert.equal(writes, 1);
});
