'use strict';
/*
  24.10.2026: the Morning client (lib/morning.js). Every call goes through an
  injected fake fetch. No network in this test.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const morning = require('../lib/morning.js');

// A fake fetch that answers from a list of [urlSuffix, status, body] in order.
function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const a = answers.shift();
    if (!a) throw new Error('unexpected call ' + url);
    if (!url.endsWith(a[0])) throw new Error('wrong route ' + url + ' expected ' + a[0]);
    return { ok: a[1] >= 200 && a[1] < 300, status: a[1], json: async () => a[2] };
  };
  fn.calls = calls;
  return fn;
}

const creds = { id: 'key-id', secret: 'key-secret' };

test('the token is asked with id and secret, on the live host by default', async () => {
  const f = fakeFetch([['/account/token', 200, { token: 'T1', expires: 1900000000000 }]]);
  const t = await morning.token(creds, { fetch: f });
  assert.strictEqual(t.token, 'T1');
  assert.strictEqual(t.expiresAt, 1900000000000);
  assert.strictEqual(f.calls[0].url, 'https://api.greeninvoice.co.il/api/v1/account/token');
  assert.strictEqual(f.calls[0].init.method, 'POST');
  assert.deepStrictEqual(JSON.parse(f.calls[0].init.body), { id: 'key-id', secret: 'key-secret' });
});

test('the sandbox host is used when asked, and seconds in expires are read as seconds', async () => {
  const f = fakeFetch([['/account/token', 200, { token: 'T2', expires: 1900000000 }]]);
  const t = await morning.token(creds, { fetch: f, sandbox: true });
  assert.ok(f.calls[0].url.startsWith('https://sandbox.d.greeninvoice.co.il/api/v1/'));
  assert.strictEqual(t.expiresAt, 1900000000 * 1000);
});

test('no keys means no call at all', async () => {
  const f = fakeFetch([]);
  await assert.rejects(morning.token({ id: '', secret: '' }, { fetch: f }), (e) => e.name === 'MorningError');
  assert.strictEqual(f.calls.length, 0);
});

test('open invoices: bearer token, open documents only, paid ones dropped', async () => {
  const f = fakeFetch([
    ['/account/token', 200, { token: 'T3', expires: 0 }],
    ['/documents/search', 200, {
      total: 3,
      items: [
        { id: 'a1', number: '1001', amount: 1000, payedAmount: 250, dueDate: '2026-11-05', client: { name: 'סלאס' } },
        { id: 'a2', number: '1002', amount: 500, payments: [{ amount: 500 }], date: '2026-09-01', clientName: 'כהן' },
        { id: 'a3', number: '1003', amount: 300, date: '2026-10-01', client: { name: 'לוי' } },
      ],
    }],
  ]);
  const r = await morning.openInvoices(creds, { fetch: f });
  const search = f.calls[1];
  assert.strictEqual(search.init.headers.Authorization, 'Bearer T3');
  const body = JSON.parse(search.init.body);
  assert.deepStrictEqual(body.type, [300, 305]);
  assert.deepStrictEqual(body.status, [0]);
  assert.strictEqual(body.page, 1);
  // a2 is fully paid, so it is not open
  assert.deepStrictEqual(r.items.map((i) => i.number), ['1001', '1003']);
  assert.strictEqual(r.items[0].left, 750);
  assert.strictEqual(r.items[0].client, 'סלאס');
  assert.strictEqual(r.items[0].due, '2026-11-05');
  assert.strictEqual(r.items[1].due, '2026-10-01');
  assert.strictEqual(r.total, 3);
});

test('paging continues while a page is full, and stops on a short page', async () => {
  const full = [];
  for (let i = 0; i < 100; i += 1) full.push({ id: 'x' + i, number: String(i), amount: 10, date: '2026-10-01' });
  const f = fakeFetch([
    ['/account/token', 200, { token: 'T4' }],
    ['/documents/search', 200, { items: full, total: 101 }],
    ['/documents/search', 200, { items: [{ id: 'last', number: 'L', amount: 5, date: '2026-10-01' }], total: 101 }],
  ]);
  const r = await morning.openInvoices(creds, { fetch: f });
  assert.strictEqual(r.items.length, 101);
  assert.strictEqual(JSON.parse(f.calls[2].init.body).page, 2);
  assert.strictEqual(f.calls.length, 3); // token, a full page, a short page
});

test('a refused request throws once, with the status, and is not retried', async () => {
  const f = fakeFetch([
    ['/account/token', 200, { token: 'T5' }],
    ['/documents/search', 401, { errorMessage: 'nope' }],
  ]);
  await assert.rejects(morning.openInvoices(creds, { fetch: f }), (e) => e.name === 'MorningError' && e.status === 401);
  assert.strictEqual(f.calls.length, 2);
});

test('a failed login stops before any document is asked for', async () => {
  const f = fakeFetch([['/account/token', 403, {}]]);
  await assert.rejects(morning.openInvoices(creds, { fetch: f }), (e) => e.status === 403);
  assert.strictEqual(f.calls.length, 1);
});

test('a missing paid amount counts as nothing paid, and a closed document is dropped', () => {
  assert.strictEqual(morning.normalize({ id: 'q', amount: 90, date: '2026-10-01' }).left, 90);
  assert.strictEqual(morning.normalize({ id: 'q', amount: 90, payedAmount: 90 }), null);
  assert.strictEqual(morning.normalize(null), null);
});

test('the money page reads only the Morning feature, off by default, and build.js passes money', () => {
  const features = require('../lib/features.js');
  assert.ok(features.KNOWN.includes('morning'));
  const d = fs.mkdtempSync(path.join(require('os').tmpdir(), 'morn-'));
  assert.strictEqual(features.read(d).morning, false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
  assert.ok(src.includes("path.join(inst.dataPath, 'money', 'money.json')"));
});
