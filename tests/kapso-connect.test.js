'use strict';
/*
  12.11.2026, Itzik: a customer connects his own WhatsApp number from 🔌 through Kapso.
  Covers the connect endpoint (code check, redirect, per address limit), the Kapso project webhook
  (signature, pending file, per number webhook, one push, idempotency) and the states of the 🔌 row.
  Kapso itself is never called: lib/kapso.js takes a fake transport.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'kapso-'));
process.env.WA_BRIDGE_DATA = DATA;
const bridge = require('../wa-bridge.js');
const K = require('../lib/kapso.js');
const CONN = require('../lib/connections.js');

const KEY = 'ab12cd34ef56ab12cd34ef56ab12cd34';
const w = (rel, o) => { const f = path.join(DATA, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const r = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));
w('tenants/tenants/t1a2b3c.json', { id: 't1a2b3c', title: 'מסעדת דוגמה', dir: '/x', user: 't1a2b3c', host: 't1a2b3c.m.it-solution.co.il' });
w('tenants/tenants/other.json', { id: 'other', title: 'אחר', code: 'recordcode-123456' });
w('fastchat/tenants.json', { t1a2b3c: { key: KEY, dir: '/x' } });
w('kapso.json', { apiKey: 'KAPSO-KEY', project: 'p1', kapsoProjectSecret: 'proj-secret' });
w('wa.json', { kapsoKey: 'KAPSO-KEY', kapsoSecret: 'num-secret' });

let calls = [];
K._set({ request: async (method, url, headers, body) => {
  const b = body ? JSON.parse(body.toString('utf8')) : null;
  calls.push({ method, url, headers, body: b });
  if (method === 'POST' && /\/customers$/.test(url)) return { status: 201, body: JSON.stringify({ data: { id: 'cust-111' } }) };
  if (/\/setup_links$/.test(url)) return { status: 201, body: JSON.stringify({ data: { url: 'https://setup.kapso.ai/s/xyz' } }) };
  if (/\/webhooks$/.test(url)) return { status: 201, body: '{}' };
  if (method === 'GET' && /\/whatsapp\/phone_numbers\//.test(url)) return { status: 200, body: JSON.stringify({ data: { display_phone_number_normalized: '972521234567' } }) };
  return { status: 404, body: '{}' };
} });

function fakeRes() {
  const o = { status: 0, headers: {}, body: '' };
  o.writeHead = (s, h) => { o.status = s; o.headers = h || {}; };
  o.end = (b) => { o.body = b ? String(b) : ''; };
  return o;
}
function getReq(ip) { return { method: 'GET', headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: ip } }; }
const url = (t, c) => new URL('/api/wa/connect?t=' + t + '&c=' + encodeURIComponent(c), 'http://x');

test('connectCodeOk: the fast chat key or the record code, constant time, never for a wrong tenant', () => {
  assert.ok(bridge.connectCodeOk('t1a2b3c', KEY));
  assert.ok(bridge.connectCodeOk('other', 'recordcode-123456'));
  assert.ok(!bridge.connectCodeOk('t1a2b3c', KEY + 'x'));
  assert.ok(!bridge.connectCodeOk('t1a2b3c', ''));
  assert.ok(!bridge.connectCodeOk('other', KEY), 'a key of one tenant opens nothing of another');
  assert.ok(!bridge.connectCodeOk('../x', KEY));
  assert.ok(!bridge.connectCodeOk('nosuch', KEY));
});

test('connect: a right code makes the customer once and redirects to a fresh setup link back to his monitor', async () => {
  calls = [];
  const s = fakeRes();
  await bridge.waConnect(getReq('10.0.0.1'), s, url('t1a2b3c', KEY));
  assert.strictEqual(s.status, 302);
  assert.strictEqual(s.headers.Location, 'https://setup.kapso.ai/s/xyz');
  assert.strictEqual(s.headers['Cache-Control'], 'no-store');
  const mk = calls.find((c) => /\/customers$/.test(c.url));
  assert.deepStrictEqual(mk.body.customer, { name: 'מסעדת דוגמה', external_customer_id: 't1a2b3c' });
  assert.strictEqual(mk.headers['X-API-Key'], 'KAPSO-KEY');
  const sl = calls.find((c) => /\/customers\/cust-111\/setup_links$/.test(c.url));
  assert.strictEqual(sl.body.setup_link.success_redirect_url, 'https://t1a2b3c.m.it-solution.co.il/');
  assert.deepStrictEqual(sl.body.setup_link.allowed_connection_types, ['coexistence', 'dedicated']);
  assert.deepStrictEqual(r('kapso/customers.json'), { t1a2b3c: 'cust-111' });
  // again: a fresh link, the same customer
  calls = [];
  const s2 = fakeRes();
  await bridge.waConnect(getReq('10.0.0.1'), s2, url('t1a2b3c', KEY));
  assert.strictEqual(s2.status, 302);
  assert.ok(!calls.some((c) => /\/customers$/.test(c.url)), 'no second customer');
  assert.ok(calls.some((c) => /setup_links$/.test(c.url)), 'a new link each time');
});

test('connect: a wrong code is a friendly Hebrew page, never a call to Kapso, and 10 of them lock the address', async () => {
  calls = [];
  for (let i = 0; i < 10; i++) {
    const s = fakeRes();
    await bridge.waConnect(getReq('10.0.0.2'), s, url('t1a2b3c', 'wrong-code-' + i));
    assert.strictEqual(s.status, 403);
    assert.ok(/[א-ת]/.test(s.body) && !s.headers.Location);
  }
  assert.strictEqual(calls.length, 0);
  const locked = fakeRes();
  await bridge.waConnect(getReq('10.0.0.2'), locked, url('t1a2b3c', KEY));
  assert.strictEqual(locked.status, 429, 'even the right code waits out the lock');
  assert.strictEqual(calls.length, 0);
  const other = fakeRes();
  await bridge.waConnect(getReq('10.0.0.3'), other, url('t1a2b3c', KEY));
  assert.strictEqual(other.status, 302, 'another address is not affected');
});

test('connect: a Kapso failure is a Hebrew page and does not leak the key', async () => {
  K._set({ request: async () => ({ status: 500, body: 'boom' }) });
  const s = fakeRes();
  await bridge.waConnect(getReq('10.0.0.4'), s, url('other', 'recordcode-123456'));
  assert.strictEqual(s.status, 502);
  assert.ok(!s.body.includes('KAPSO-KEY'));
});

// ---- project webhook ----
const secret = 'proj-secret';
const sign = (raw, sec) => crypto.createHmac('sha256', sec || secret).update(raw).digest('hex');
function projReq(body, headers) {
  const raw = Buffer.from(JSON.stringify(body));
  const q = Readable.from([raw]);
  q.method = 'POST'; q.headers = Object.assign({ 'x-webhook-signature': sign(raw), 'x-webhook-event': 'whatsapp.phone_number.created', 'x-idempotency-key': 'k-1' }, headers || {});
  q.socket = { remoteAddress: '10.0.0.9' };
  return q;
}
const ev = { phone_number_id: '123456789012345', project: { id: 'p1' }, customer: { id: 'cust-111', external_id: 't1a2b3c' } };

test('project webhook: bad or missing signature is 401 and writes nothing', async () => {
  const q = projReq(ev, { 'x-webhook-signature': 'deadbeef' });
  const s = fakeRes();
  await bridge.kapsoProject(q, s);
  assert.strictEqual(s.status, 401);
  const q2 = projReq(ev); delete q2.headers['x-webhook-signature'];
  const s2 = fakeRes();
  await bridge.kapsoProject(q2, s2);
  assert.strictEqual(s2.status, 401);
  assert.ok(!fs.existsSync(path.join(DATA, 'kapso', 'pending')));
});

test('project webhook: a new number answers 200, leaves a pending file, registers the number webhook, pushes once, and a repeat does nothing', async () => {
  K._set({ request: async (method, u, h, body) => {
    calls.push({ method, url: u, headers: h, body: body ? JSON.parse(body.toString('utf8')) : null });
    if (/\/webhooks$/.test(u)) return { status: 201, body: '{}' };
    return { status: 200, body: JSON.stringify({ data: { display_phone_number_normalized: '972521234567' } }) };
  } });
  calls = [];
  const pushes = [];
  bridge._set({ push: (t, m) => pushes.push([t, m]) });
  const s = fakeRes();
  await bridge.kapsoProject(projReq(ev), s);
  assert.strictEqual(s.status, 200);
  const p = r('kapso/pending/t1a2b3c.json');
  assert.strictEqual(p.tenantId, 't1a2b3c');
  assert.strictEqual(p.phoneId, '123456789012345');
  assert.strictEqual(p.display, '972521234567');
  assert.strictEqual(p.hook, 'ok');
  assert.ok(p.at);
  const hk = calls.find((c) => /\/whatsapp\/phone_numbers\/123456789012345\/webhooks$/.test(c.url));
  assert.deepStrictEqual(hk.body.whatsapp_webhook, { kind: 'meta', url: 'https://wa.abaitzik.com/webhook', secret_key: 'num-secret', active: true });
  assert.strictEqual(pushes.length, 1);
  assert.ok(pushes[0][1].includes('מסעדת דוגמה') && pushes[0][1].includes('חיבר וואטסאפ') && pushes[0][1].includes('972521234567'));
  // Kapso retries the same delivery
  calls = [];
  const s2 = fakeRes();
  await bridge.kapsoProject(projReq(ev), s2);
  assert.strictEqual(s2.status, 200);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(pushes.length, 1);
  // a different delivery of the same number is also harmless
  const s3 = fakeRes();
  await bridge.kapsoProject(projReq(ev, { 'x-idempotency-key': 'k-2' }), s3);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(pushes.length, 1);
});

test('project webhook: other events and unknown customers are ignored', async () => {
  calls = []; const pushes = [];
  bridge._set({ push: (t, m) => pushes.push([t, m]) });
  await bridge.kapsoProject(projReq(ev, { 'x-webhook-event': 'whatsapp.phone_number.deleted', 'x-idempotency-key': 'k-3' }), fakeRes());
  await bridge.kapsoProject(projReq({ phone_number_id: '999999999999', customer: { id: 'nobody', external_id: 'nosuch' } }, { 'x-idempotency-key': 'k-4' }), fakeRes());
  assert.ok(!fs.existsSync(path.join(DATA, 'kapso', 'pending', 'nosuch.json')));
  assert.strictEqual(pushes.length, 0);
});

test('verifyProjectWebhook: hex HMAC, constant time, never throws', () => {
  const raw = Buffer.from('{"a":1}');
  assert.ok(K.verifyProjectWebhook(raw, { 'X-Webhook-Signature': sign(raw) }, secret));
  assert.ok(!K.verifyProjectWebhook(raw, { 'x-webhook-signature': 'sha256=' + sign(raw) }, secret));
  assert.ok(!K.verifyProjectWebhook(raw, {}, secret));
  assert.ok(!K.verifyProjectWebhook(raw, { 'x-webhook-signature': sign(raw) }, ''));
  assert.ok(!K.verifyProjectWebhook(raw, undefined, secret));
});

// ---- the 🔌 row ----
function conn(plan, name, F, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kconn-'));
  Object.keys(files || {}).forEach((f) => fs.writeFileSync(path.join(d, f), typeof files[f] === 'string' ? files[f] : JSON.stringify(files[f])));
  const L = CONN.list(d, name, F, { tok: 'a1b2c3d4e5f60718', setupDir: d }, plan);
  return L.rows.find((x) => x.id === 'wa');
}

test('connections: a customer without the wa feature sees no WhatsApp row', () => {
  assert.strictEqual(conn('basic', 't1a2b3c', {}, {}), undefined);
});

test('connections: with the feature, his code and waOwn the own number link is the second action (12.11: the quick connect is the first)', () => {
  const row = conn('basic', 't1a2b3c', { wa: true, waOwn: true }, { 'fc-key.txt': KEY });
  assert.strictEqual(row.on, false);
  assert.ok(row.link.startsWith('https://wa.me/'));
  assert.strictEqual(row.link2, 'https://wa.abaitzik.com/api/wa/connect?t=t1a2b3c&c=' + KEY);
  assert.ok(!row.paid && !row.locked);
});

test('connections: without a code it stays the old coordinated text, no link', () => {
  const row = conn('basic', 't1a2b3c', { wa: true }, {});
  assert.ok(!row.link);
  assert.ok(/בתיאום/.test(row.paid));
});

test('connections: phoneId and kapsoKey in his wa.json show it connected with the number, link kept for reconnect', () => {
  const row = conn('small', 't1a2b3c', { wa: true, waOwn: true }, { 'fc-key.txt': KEY, 'wa.json': { phoneId: '1', kapsoKey: 'k', kapsoDisplay: '972521234567' } });
  assert.strictEqual(row.on, true);
  assert.strictEqual(row.who, '972521234567');
  assert.ok(row.link);
  const half = conn('small', 't1a2b3c', { wa: true }, { 'fc-key.txt': KEY, 'wa.json': { phoneId: '1', token: 't' } });
  assert.strictEqual(half.on, false, 'a Meta token alone is not the Kapso connection');
});

test('connections: Itzik\'s own row is unchanged and has no link', () => {
  const row = conn('', 'abaitzik', {}, { 'fc-key.txt': KEY });
  assert.strictEqual(row.on, true);
  assert.ok(!row.link);
});

test('connections: no plan keys were changed', () => {
  assert.deepStrictEqual(CONN.PLAN_KEYS.basic, ['google', 'wa', 'sign']);
});
