'use strict';
// 22.11.2026: the routes of the public booking page as they are written in wa-bridge.js (a thin async proxy). That file starts a
// server when it is loaded, so its booking part (bookSock .. bookRoute) is cut out of the source and run here against fake
// requests, with a real tenant agent on a temp socket.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const B = require('../lib/bookings.js');
const Agent = require('../lib/book-agent.js');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'wa-bridge.js'), 'utf8').replace(/\r\n/g, '\n');
const a = SRC.indexOf('function bookSock('), b = SRC.indexOf('function tenantByKey(');
assert.ok(a > 0 && b > a, 'the booking part of wa-bridge.js is there');
const CODE = SRC.slice(a, b);
const live = [];
test.after(async () => { for (const x of live) await Promise.race([x.close().then(() => 0, () => 0), new Promise((r) => setTimeout(r, 1500))]); });

async function setup(withAgent) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-routes-'));
  const DATA = path.join(root, 'platform'), dp = path.join(root, 'tenant', 'data'), sockDir = path.join(root, 's');
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(dp, { recursive: true }); fs.mkdirSync(sockDir);
  B.saveConfig(dp, { hours: { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [], 6: [] },
    services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }], slotMinutes: 15, bufferMinutes: 0 });
  const inst = { name: 't1', trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'הקליניקה של מור' }, dataPath: dp };
  let agent = null;
  if (withAgent) { agent = Agent.start({ inst, dataPath: dp, sockDir, log: () => {} }); if (!agent.server.listening) await new Promise((r) => agent.server.once('listening', r)); live.push(agent); }
  const logs = [];
  const sandbox = {
    fs, path, DATA, log: (l) => logs.push(l), originOk: (o) => o === 'https://t1.example', Buffer, JSON, String, Object, Date, Math,
    readBody: (q) => Promise.resolve(Buffer.from(q.__body || '')),
    require: (p) => {
      if (p === './lib/visits.js') return { nameByKey: (d, k) => (k === 'good-key' ? 't1' : '') };
      // the code under test passes the real /var/lib path as the socket folder; the test's socket folder is a temp one
      if (p === './lib/book-page.js') { const BPm = require(path.resolve(ROOT, p)); return Object.assign({}, BPm, { create: (env) => BPm.create(Object.assign({}, env, { sockDir: () => fs.realpathSync(sockDir) })) }); }
      return require(path.resolve(ROOT, p));
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE + '\nthis.bookRoute = bookRoute; this.bookSock = bookSock;', sandbox);
  assert.strictEqual(sandbox.bookSock('t1'), '/var/lib/monitor-book/t1/s.sock'); assert.strictEqual(sandbox.bookSock('../x'), '');
  const sock = path.join(sockDir, 's.sock'); sandbox.bookSock = () => sock; // the real path is root's; the code under test is the same
  const call = (method, url, body, extra) => new Promise((resolve) => {
    const u = new URL('https://form.test' + url);
    const q = Object.assign({ method, headers: { 'x-forwarded-for': '5.5.5.5' }, socket: { remoteAddress: '127.0.0.1' }, __body: body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body) }, extra || {});
    const s = { status: 0, headers: {}, out: '', writeHead(st, h) { this.status = st; this.headers = h || {}; }, end(x) { this.out = x == null ? '' : String(x); resolve(this); } };
    sandbox.bookRoute(q, u, s);
  });
  return { root, DATA, dp, sandbox, logs, call, agent };
}

test('link: only with the owner visit key, made by the agent, kept by the platform as link to tenant only', async () => {
  const w = await setup(true);
  assert.strictEqual((await w.call('POST', '/api/book/link', { key: 'wrong' })).status, 403);
  const r = await w.call('POST', '/api/book/link', { key: 'good-key' }, { headers: { origin: 'https://t1.example', 'x-forwarded-for': '1.1.1.1' } });
  assert.strictEqual(r.status, 200); const j = JSON.parse(r.out);
  assert.match(j.link, /^https:\/\/form\.it-solution\.co\.il\/b\/[a-f0-9]{24}$/);
  assert.strictEqual(r.headers['Access-Control-Allow-Origin'], 'https://t1.example');
  assert.strictEqual(JSON.parse((await w.call('POST', '/api/book/link', { key: 'good-key' })).out).link, j.link);
  assert.strictEqual((await w.call('OPTIONS', '/api/book/link', null, { headers: { origin: 'https://t1.example' } })).status, 204);
  assert.strictEqual(B.loadConfig(w.dp).linkToken, j.link.split('/').pop());
  assert.deepStrictEqual(fs.readdirSync(path.join(w.DATA, 'book', 'links')).sort(), ['by-tenant', j.link.split('/').pop() + '.json'].sort());
  const w2 = await setup(false);
  const down = await w2.call('POST', '/api/book/link', { key: 'good-key' });
  assert.strictEqual(down.status, 503); // no agent: no link, and nothing else breaks
});

test('the whole path over the routes: page, slots, create, confirm, cancel, with the owner told in her own chat folder by the agent', async () => {
  const w = await setup(true);
  const l = JSON.parse((await w.call('POST', '/api/book/link', { key: 'good-key' })).out).link.split('/').pop();
  const pg = await w.call('GET', '/b/' + l);
  assert.strictEqual(pg.status, 200); assert.match(pg.headers['Content-Type'], /text\/html/); assert.match(pg.out, /הקליניקה של מור/); assert.strictEqual(pg.headers['Cache-Control'], 'no-store');
  const day = new Date(Date.now() + 2 * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const sl = JSON.parse((await w.call('GET', '/api/book/slots?l=' + l + '&date=' + day + '&service=brows')).out).slots;
  const dow = B.core().dow(day);
  if (dow === 5 || dow === 6) { assert.deepStrictEqual(sl, []); return; }
  assert.ok(sl.length > 10);
  const ft = /"ft":"([^"]+)"/.exec(pg.out)[1];
  await new Promise((r) => setTimeout(r, 3100)); // the minimum fill time is real here
  const cr = await w.call('POST', '/api/book', { l, ft, cid: 'routekey12345', service: 'brows', start: sl[0].start.slice(0, 16).replace('T', ' '), name: 'דנה כהן', phone: '0521234567', website: '' });
  assert.strictEqual(cr.status, 200); const j = JSON.parse(cr.out); assert.strictEqual(j.ok, true);
  const it = B.readItems(w.dp)[0]; assert.strictEqual(it.name, 'דנה כהן'); assert.strictEqual(it.src, 'link');
  const chat = fs.readdirSync(path.join(w.dp, 'chat', 'chat'));
  assert.strictEqual(chat.length, 1); assert.match(chat[0], /-claude-push-book\.json$/);
  const rec = JSON.parse(fs.readFileSync(path.join(w.dp, 'chat', 'chat', chat[0]), 'utf8'));
  assert.strictEqual(rec.waPush, true); assert.doesNotMatch(rec.waText, /דנה|כהן/); assert.match(rec.waText, /תור חדש נקבע בקישור שלך/);
  const mine = j.mine.replace('https://form.it-solution.co.il', '');
  assert.strictEqual((await w.call('GET', mine)).status, 200);
  assert.strictEqual((await w.call('GET', mine + '/ics')).headers['Content-Type'], 'text/calendar; charset=utf-8');
  assert.match((await w.call('GET', mine + '/ics')).headers['Content-Disposition'], /attachment/);
  assert.strictEqual(JSON.parse((await w.call('POST', '/api/book/act', { l, tok: it.tok, action: 'confirm' })).out).status, 'confirmed');
  assert.strictEqual(JSON.parse((await w.call('POST', '/api/book/act', { l, tok: it.tok, action: 'cancel' })).out).status, 'cancelled');
  const seen = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else seen.push(fs.readFileSync(p, 'utf8')); } })(w.DATA);
  assert.ok(seen.every((t) => !/דנה|כהן|521234567/.test(t)), 'nothing about the client on the platform side');
  assert.ok(!w.logs.join('\n').match(/דנה|כהן|521234567/), 'nor in its log');
});

test('agent down over the routes: a calm 503, not a hang and not a crash', async () => {
  const w = await setup(false);
  const l = 'a'.repeat(24); fs.mkdirSync(path.join(w.DATA, 'book', 'links'), { recursive: true }); fs.writeFileSync(path.join(w.DATA, 'book', 'links', l + '.json'), JSON.stringify({ tenant: 't1' }));
  const t0 = Date.now(); const pg = await w.call('GET', '/b/' + l);
  assert.strictEqual(pg.status, 503); assert.match(pg.out, /אי אפשר לקבוע כרגע, נסו שוב בעוד כמה דקות/); assert.ok(Date.now() - t0 < 1000);
  assert.strictEqual((await w.call('GET', '/api/book/slots?l=' + l + '&date=2026-11-23&service=brows')).status, 503);
});

test('bad bodies, wrong methods and unknown links', async () => {
  const w = await setup(true);
  assert.strictEqual((await w.call('POST', '/api/book', 'not json')).status, 400);
  assert.strictEqual((await w.call('POST', '/api/book', { l: 'f'.repeat(24) })).status, 404);
  assert.strictEqual((await w.call('DELETE', '/api/book')).status, 405);
  assert.strictEqual((await w.call('GET', '/b/' + 'a'.repeat(24))).status, 404);
  assert.strictEqual((await w.call('GET', '/api/book/slots?l=nope&date=2026-11-23&service=x')).status, 404);
});

test('wa-bridge: the push sweep sends the generic line; the routes are wired before the quote routes', () => {
  assert.match(SRC, /tenantSend\(phone, String\(d\.waText \|\| d\.text\)\) : waTemplate\(phone, d\.waText \|\| d\.text\)/);
  const r = SRC.indexOf('bookRoute(q, u, s); return; }'), qte = SRC.indexOf('16.11.2026: a quote made in');
  assert.ok(r > 0 && r < qte && SRC.indexOf("if (u.pathname === '/api/csign/create')") < r);
});
