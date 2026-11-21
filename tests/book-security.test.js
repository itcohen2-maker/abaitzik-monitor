'use strict';
// 22.11.2026: the independent security review of the public booking page (repro cases symlink-write, cross-tenant, read-gadget, fifo,
// lockhold, dup-leak, ft-reuse, noshow, offgrid, the socket pointed at another tenant). Each is ported here and must NOT reproduce.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const BP = require('../lib/book-page.js');
const Agent = require('../lib/book-agent.js');
const B = require('../lib/bookings.js');
const bh = require('../lib/biz-home.js');

const ROOT = path.join(__dirname, '..');
const NOW = Date.parse('2026-11-22T06:00:00Z'); // Sunday 08:00 in Israel
const live = [];
const J = (r) => JSON.parse(r.body);
const allDays = () => { const h = {}; for (let d = 0; d < 7; d++) h[d] = [['08:00', '20:00']]; return h; };

async function world(name, opts) {
  opts = opts || {}; name = name || 't1';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-sec-'));
  const DATA = path.join(root, 'platform'), dp = path.join(root, 'home', name, name + '-monitor', 'data'), sockDir = path.join(root, 's', name);
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(path.join(dp, 'bookings', 'items'), { recursive: true }); fs.mkdirSync(path.join(dp, 'biz-home'), { recursive: true }); fs.mkdirSync(sockDir, { recursive: true });
  B.saveConfig(dp, { hours: allDays(), services: [{ id: 'face', name: 'Facial', minutes: 60, price: 300 }], slotMinutes: 15, bufferMinutes: 0 });
  const inst = { name, trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'Biz ' + name }, dataPath: dp };
  const st = { now: NOW };
  const agent = Agent.start({ inst, dataPath: dp, sockDir, now: () => st.now, log: () => {} });
  if (!agent.server.listening) await new Promise((r) => agent.server.once('listening', r));
  live.push(agent);
  const sock = opts.sock || path.join(sockDir, 's.sock');
  const P = BP.create({ DATA, sockPath: () => sock, now: () => st.now, log: () => {}, base: 'https://form.test', timeoutMs: opts.timeoutMs || 2500 });
  live.push({ close: async () => P.stop() });
  const made = await P.makeLink(name);
  const l = made.link.split('/').pop();
  const w = { root, DATA, dp, sockDir, sock, inst, st, agent, P, l };
  w.get = (p, q, ip) => P.handle({ method: 'GET', path: p, query: q || {}, body: null, ip: ip || '1.1.1.1' });
  w.post = (p, body, ip) => P.handle({ method: 'POST', path: p, query: {}, body, ip: ip || '1.1.1.1' });
  w.ft = async () => /"ft":"([^"]+)"/.exec((await w.get('/b/' + l)).body)[1];
  let n = 0;
  w.book = async (over, ip) => { const ft = await w.ft(); st.now += 5000; return w.post('/api/book', Object.assign({ l, ft, cid: 'sec' + (n++) + 'abcdefgh', service: 'face', start: '2026-11-23 10:00', name: 'Mallory', phone: '0501234567' }, over), ip); };
  return w;
}
test.after(async () => { for (const x of live) { await Promise.race([x.close().then(() => 0, () => 0), new Promise((r) => setTimeout(r, 1500))]); } });

test('symlink-write: planted links where the diary writes its marker and its temp files hit nothing outside', async () => {
  const w = await world();
  const v1 = path.join(w.root, 'victim-1.json'), v2 = path.join(w.root, 'victim-2.json'), v3 = path.join(w.root, 'victim-3.json');
  for (const v of [v1, v2, v3]) fs.writeFileSync(v, 'ORIGINAL\n');
  fs.symlinkSync(v1, path.join(w.dp, 'bookings', 'dirty'));
  fs.symlinkSync(v2, path.join(w.dp, 'biz-home', 'events.json.tmp'));
  fs.symlinkSync(v3, path.join(w.dp, 'bookings', 'config.json.tmp'));
  const r = await w.book();
  assert.strictEqual(r.status, 200);
  for (const v of [v1, v2, v3]) assert.strictEqual(fs.readFileSync(v, 'utf8'), 'ORIGINAL\n', v);
  assert.ok(fs.lstatSync(path.join(w.dp, 'biz-home', 'events.json')).isFile() && !fs.lstatSync(path.join(w.dp, 'biz-home', 'events.json')).isSymbolicLink());
  assert.ok(!fs.lstatSync(path.join(w.dp, 'bookings', 'dirty')).isSymbolicLink()); // the marker replaced the link, it did not write through it
});

test('cross-tenant: a diary folder that is a link to another business\'s is refused, nothing is written into the other', async () => {
  const b = await world('tb'), a = await world('ta');
  await b.book({ start: '2026-11-23 12:00', name: 'Victim Dana', phone: '0527654321' });
  const bItems = fs.readdirSync(path.join(b.dp, 'bookings', 'items')).length;
  fs.rmSync(path.join(a.dp, 'bookings', 'items'), { recursive: true });
  fs.symlinkSync(path.join(b.dp, 'bookings', 'items'), path.join(a.dp, 'bookings', 'items'));
  const r = await a.book({ start: '2026-11-23 15:00' });
  assert.notStrictEqual(r.status, 200);
  assert.strictEqual(fs.readdirSync(path.join(b.dp, 'bookings', 'items')).length, bItems);
  assert.deepStrictEqual(B.readItems(a.dp), []); // and A reads nothing through the link either
  assert.ok(!JSON.stringify(B.readItems(b.dp)).includes('Mallory'));
  // the public slots of A do not show B's taken 12:00
  const sl = J(await a.get('/api/book/slots', { l: a.l, date: '2026-11-23', service: 'face' }));
  assert.ok(sl.slots.some((s) => s.time === '12:00'), 'B\'s booking is not visible through A');
});

test('cross-tenant: A\'s socket path pointed at B\'s agent gets nothing (the bridge checks lstat, and the agent checks the tenant id)', async () => {
  const b = await world('tb');
  await b.book({ start: '2026-11-23 12:00', name: 'Victim Dana', phone: '0527654321' });
  // A has no agent of its own here; its socket path is a link to B's socket
  const rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-sec-')), DATA = path.join(rootA, 'platform'), linkSock = path.join(rootA, 's.sock');
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(path.join(DATA, 'book', 'links'), { recursive: true });
  fs.writeFileSync(path.join(DATA, 'book', 'links', 'a'.repeat(24) + '.json'), JSON.stringify({ tenant: 'ta' }));
  fs.symlinkSync(b.sock, linkSock);
  const P = BP.create({ DATA, sockPath: () => linkSock, now: () => NOW, log: () => {}, base: 'https://form.test' }); live.push({ close: async () => P.stop() });
  const pg = await P.handle({ method: 'GET', path: '/b/' + 'a'.repeat(24), query: {}, body: null, ip: '1.1.1.1' });
  assert.strictEqual(pg.status, 503); assert.doesNotMatch(pg.body, /Victim|Biz tb/);
  // even a socket that really is B's, reached with A's id: the agent refuses
  const got = await new Promise((res) => { const c = net.connect(b.sock); let buf = ''; c.on('connect', () => c.write(JSON.stringify({ op: 'get', tenant: 'ta', tok: B.readItems(b.dp)[0].tok }) + '\n')); c.on('data', (d) => { buf += d; }); c.on('close', () => res(JSON.parse(buf))); });
  assert.deepStrictEqual(got, { ok: false, error: 'tenant' });
  assert.deepStrictEqual(await P.ask('ta', { op: 'info' }), null); // a link is not a socket for lstat
});

test('read-gadget: events.json that is a link to another file is never read as events, never written through', async () => {
  const w = await world();
  const secret = path.join(w.root, 'b-clients.json'); fs.writeFileSync(secret, JSON.stringify([{ id: 'c1', name: 'B Secret Client', phone: '972500000000' }]));
  fs.symlinkSync(secret, path.join(w.dp, 'biz-home', 'events.json'));
  assert.strictEqual((await w.book()).status, 200);
  const ev = JSON.parse(fs.readFileSync(path.join(w.dp, 'biz-home', 'events.json'), 'utf8'));
  assert.ok(!fs.lstatSync(path.join(w.dp, 'biz-home', 'events.json')).isSymbolicLink());
  assert.ok(ev.every((e) => e.src === 'booking'), 'only booking entries: ' + JSON.stringify(ev.map((e) => e.name || e.title)));
  assert.ok(!JSON.stringify(ev).includes('B Secret Client'));
  assert.ok(fs.readFileSync(secret, 'utf8').includes('B Secret Client')); // untouched
  // and a biz-home that is itself a link to another folder stops every write
  const w2 = await world(); const other = path.join(w2.root, 'other'); fs.mkdirSync(other);
  fs.rmSync(path.join(w2.dp, 'biz-home'), { recursive: true }); fs.symlinkSync(other, path.join(w2.dp, 'biz-home'));
  assert.notStrictEqual((await w2.book()).status, 200); assert.deepStrictEqual(fs.readdirSync(other), []);
});

test('fifo: a pipe where the config is, or where the socket should be, blocks nothing', async () => {
  const w = await world();
  fs.unlinkSync(path.join(w.dp, 'bookings', 'config.json'));
  execFileSync('mkfifo', [path.join(w.dp, 'bookings', 'config.json')]);
  let ticks = 0; const iv = setInterval(() => ticks++, 10);
  const t0 = Date.now(); const r = await w.get('/b/' + w.l); const took = Date.now() - t0;
  clearInterval(iv);
  assert.ok(took < 1500, 'took ' + took); assert.ok([200, 404, 503].includes(r.status)); // answered quickly, whatever the pipe held
  // a pipe at the bridge's socket path: lstat says it is not a socket, no connect is made
  const rootP = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-sec-')), fifo = path.join(rootP, 's.sock');
  execFileSync('mkfifo', [fifo]);
  const P = BP.create({ DATA: path.join(rootP, 'platform'), sockPath: () => fifo, now: () => NOW, log: () => {} }); live.push({ close: async () => P.stop() });
  let t2 = 0; const iv2 = setInterval(() => t2++, 10); const s0 = Date.now();
  assert.strictEqual(await P.ask('ta', { op: 'info' }), null);
  clearInterval(iv2); assert.ok(Date.now() - s0 < 500);
});

test('lockhold: a lock that a tenant keeps held never freezes the bridge, and the page answers calmly', async () => {
  const w = await world(null, { timeoutMs: 700 });
  const ft = await w.ft(); w.st.now += 5000;
  const lock = path.join(w.dp, 'bookings', '.lock.d'); fs.mkdirSync(lock);
  const keep = setInterval(() => { const n = new Date(); fs.utimesSync(lock, n, n); }, 1000); // kept fresh, as a hostile tenant would
  let ticks = 0; const iv = setInterval(() => ticks++, 10); const t0 = Date.now();
  const r = await w.post('/api/book', { l: w.l, ft, cid: 'lockhold12345', service: 'face', start: '2026-11-23 10:00', name: 'Someone', phone: '0501234567' });
  const took = Date.now() - t0; clearInterval(iv);
  assert.strictEqual(r.status, 503); assert.ok(took < 1500, 'took ' + took); assert.ok(ticks > 40, 'the loop ticked ' + ticks + ' times');
  // the agent was waiting with timers too: its loop (the same process here) was never blocked either
  clearInterval(keep); fs.rmSync(lock, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 300)); // the agent may finish the request the client gave up on; that is the tenant's own diary
  // a stale lock (a crashed writer) is taken over by an atomic rename
  fs.mkdirSync(lock); const old = new Date(Date.now() - 60e3); fs.utimesSync(lock, old, old);
  assert.strictEqual((await w.book({ start: '2026-11-23 11:00', phone: '0509998877' })).status, 200);
});

test('dup-leak: knowing a phone number and a slot reveals nothing about that booking', async () => {
  const w = await world();
  const real = J(await w.book({ start: '2026-11-23 13:00', name: 'Real Client Name', phone: '0529998877', cid: 'realkey123456' }));
  assert.strictEqual(real.ok, true);
  // the attacker: the same phone, the same slot, a junk name, his own key
  for (let i = 0; i < 3; i++) {
    const r = await w.book({ start: '2026-11-23 13:00', name: 'x x', phone: '0529998877', cid: 'attacker' + i + 'abcdefg' }, '6.6.6.6');
    assert.strictEqual(r.status, 409); assert.strictEqual(J(r).error, 'conflict');
    assert.deepStrictEqual(Object.keys(J(r)).sort(), ['error', 'ft']); // an error code and the next form token, no booking, no name, no token, no time
  }
  // the real client's own resend (the same key) is recognised
  const ft = await w.ft(); w.st.now += 5000;
  const again = J(await w.post('/api/book', { l: w.l, ft, cid: 'realkey123456', service: 'face', start: '2026-11-23 13:00', name: 'Real Client Name', phone: '0529998877' }));
  assert.strictEqual(again.again, true);
  // the attacker cannot cancel the victim: he has no token
  const k = await w.post('/api/book/act', { l: w.l, tok: 'f'.repeat(24), action: 'cancel' }, '6.6.6.6'); assert.strictEqual(k.status, 404);
  assert.strictEqual(B.readItems(w.dp)[0].status, 'booked');
});

test('ft-reuse: one form token books once, not twelve times', async () => {
  const w = await world();
  const ft = await w.ft(); w.st.now += 4000;
  let ok = 0; const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
  for (let i = 0; i < hours.length; i++) {
    const r = await w.post('/api/book', { l: w.l, ft, cid: 'bot' + i + 'abcdefghi', service: 'face', start: '2026-11-23 ' + hours[i], name: 'Bot ' + i, phone: '05' + String(20000000 + i * 7919), }, '10.0.0.' + Math.floor(i / 10));
    if (r.status === 200) ok++;
  }
  assert.strictEqual(ok, 1); assert.strictEqual(B.readItems(w.dp).length, 1);
});

test('noshow: a client cannot change a booking the owner marked as a no show', async () => {
  const w = await world();
  const r = J(await w.book()); const tok = r.booking.tok, id = B.byToken(w.dp, tok).id;
  w.st.now = Date.parse(r.booking.end) + 3600e3;
  assert.strictEqual(B.setStatus(w.dp, id, 'noshow', w.st.now).booking.status, 'noshow');
  for (const a of ['confirm', 'cancel', 'move']) assert.strictEqual((await w.post('/api/book/act', { l: w.l, tok, action: a, start: '2026-11-24 10:00' })).status, 409, a);
  assert.strictEqual(B.getItem(w.dp, id).status, 'noshow');
});

test('offgrid: a start that is not one of the free slots is refused', async () => {
  const w = await world();
  for (const t of ['10:07', '10:01', '07:45', '19:30', '20:00']) assert.strictEqual(J(await w.book({ start: '2026-11-23 ' + t })).error, 'conflict', t);
  assert.strictEqual(B.readItems(w.dp).length, 0);
  assert.strictEqual((await w.book({ start: '2026-11-23 10:15' })).status, 200);
});

test('the bridge side never touches a tenant folder: no file reads, writes, waits or tenant paths in its code', () => {
  const page = fs.readFileSync(path.join(ROOT, 'lib', 'book-page.js'), 'utf8');
  const wb = fs.readFileSync(path.join(ROOT, 'wa-bridge.js'), 'utf8').replace(/\r\n/g, '\n');
  const a = wb.indexOf('function bookSock('), b = wb.indexOf('function tenantByKey(');
  assert.ok(a > 0 && b > a);
  for (const [name, src] of [['lib/book-page.js', page], ['wa-bridge.js booking routes', wb.slice(a, b)]]) {
    assert.doesNotMatch(src, /readFileSync|writeFileSync|Atomics|existsSync|readdirSync|statSync|lstatSync|mkdirSync|renameSync|openSync|appendFileSync|unlinkSync|rmSync/, name);
    assert.doesNotMatch(src, /\/home\/|loadConfig|readItems|withLock|saveConfig|biz-home|chat\/chat|sendlist/, name);
    assert.doesNotMatch(src, /require\('\.\/lib\/bookings\.js'\)|require\('\.\/bookings\.js'\)\.(add|move|list|read|save|load|with|set|cancel)/, name);
  }
  assert.match(page, /fs\.promises\.lstat/); assert.match(page, /isSocket\(\)/); assert.match(page, /net\.connect/);
  // what the bridge does read and write is the platform's own link map, asynchronously
  assert.ok((page.match(/fs\.promises\.\w+/g) || []).every((x) => /lstat|realpath|readFile|mkdir|writeFile|unlink|rename/.test(x)));
});

test('setup/enable-bookings.sh: refuses a link, a wrong real path, a bad id and a missing unit, touching nothing', { skip: process.platform === 'win32' }, () => {
  const script = path.join(ROOT, 'setup', 'enable-bookings.sh');
  const me = os.userInfo().username.replace(/[^a-z0-9-]/g, '');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-sec-'));
  const etc = path.join(tmp, 'etc'); fs.mkdirSync(path.join(etc, 'systemd', 'system'), { recursive: true });
  fs.writeFileSync(path.join(etc, 'systemd', 'system', 'monitor-listen-' + me + '.service'), '[Service]\nUser=' + me + '\n');
  const run = (root, id, extra) => spawnSync('bash', [script, ...(extra || []), id], { env: Object.assign({}, process.env, { MONITOR_BOOK_ROOT: root, MONITOR_ETC: etc, MONITOR_NO_SYSTEMCTL: '1', MONITOR_BOOK_NOPRIV: '1' }), encoding: 'utf8' });
  const victim = path.join(tmp, 'victim'); fs.mkdirSync(victim);
  const root = path.join(tmp, 'root'); fs.mkdirSync(root);
  fs.symlinkSync(victim, path.join(root, me));
  let r = run(root, me); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /refused: .* is a link/);
  assert.deepStrictEqual(fs.readdirSync(victim), []); assert.ok(fs.lstatSync(path.join(root, me)).isSymbolicLink());
  assert.ok(!fs.existsSync(path.join(etc, 'systemd', 'system', 'monitor-listen-' + me + '.service.d')), 'no drop-in was written');
  const real = path.join(tmp, 'real'); fs.mkdirSync(real); const linkRoot = path.join(tmp, 'linkroot'); fs.symlinkSync(real, linkRoot);
  r = run(linkRoot, me); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /refused/); assert.deepStrictEqual(fs.readdirSync(real), []);
  const mid = path.join(tmp, 'mid'); fs.symlinkSync(real, mid); r = run(path.join(mid, 'x'), me); assert.notStrictEqual(r.status, 0); assert.deepStrictEqual(fs.readdirSync(real), []);
  assert.notStrictEqual(run(root, '../x').status, 0); assert.notStrictEqual(run(root, 'A B').status, 0); assert.notStrictEqual(run(root, '').status, 0); assert.notStrictEqual(run(root, 'x;rm').status, 0);
  const root2 = path.join(tmp, 'root2'); fs.mkdirSync(root2); fs.writeFileSync(path.join(root2, me), 'file');
  r = run(root2, me); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /not a directory/);
  // no unit, no drop-in
  const etc2 = path.join(tmp, 'etc2'); fs.mkdirSync(path.join(etc2, 'systemd', 'system'), { recursive: true });
  r = spawnSync('bash', [script, me], { env: Object.assign({}, process.env, { MONITOR_BOOK_ROOT: path.join(tmp, 'root3'), MONITOR_ETC: etc2, MONITOR_BOOK_NOPRIV: '1' }), encoding: 'utf8' });
  assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /refused: no unit/); assert.ok(!fs.existsSync(path.join(tmp, 'root3')));
  // a link where the drop-in directory or file should be
  const etc3 = path.join(tmp, 'etc3'); fs.mkdirSync(path.join(etc3, 'systemd', 'system'), { recursive: true });
  fs.writeFileSync(path.join(etc3, 'systemd', 'system', 'monitor-listen-' + me + '.service'), '[Service]\n'); fs.symlinkSync(victim, path.join(etc3, 'systemd', 'system', 'monitor-listen-' + me + '.service.d'));
  r = spawnSync('bash', [script, me], { env: Object.assign({}, process.env, { MONITOR_BOOK_ROOT: path.join(tmp, 'root4'), MONITOR_ETC: etc3, MONITOR_BOOK_NOPRIV: '1' }), encoding: 'utf8' });
  assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /is a link/); assert.deepStrictEqual(fs.readdirSync(victim), []);
  assert.doesNotMatch(fs.readFileSync(script, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'), /\/home\//); // no command of it touches the tenant's home (the comments may name it)
});

test('setup/enable-bookings.sh: --check changes nothing; a real run writes the drop-in, is idempotent, never restarts the listener and says how', { skip: process.platform === 'win32' }, () => {
  const script = path.join(ROOT, 'setup', 'enable-bookings.sh');
  const me = os.userInfo().username.replace(/[^a-z0-9-]/g, '');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-sec-')), etc = path.join(tmp, 'etc'), root = path.join(tmp, 'root');
  fs.mkdirSync(path.join(etc, 'systemd', 'system'), { recursive: true });
  const unit = path.join(etc, 'systemd', 'system', 'monitor-listen-' + me + '.service'); fs.writeFileSync(unit, '[Service]\nUser=' + me + '\nProtectSystem=strict\nReadWritePaths=/home/' + me + '\n');
  const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin); // a systemctl that only records what it was asked
  fs.writeFileSync(path.join(bin, 'systemctl'), '#!/bin/bash\necho "$@" >> ' + path.join(tmp, 'systemctl.log') + '\n'); fs.chmodSync(path.join(bin, 'systemctl'), 0o755);
  const env = Object.assign({}, process.env, { MONITOR_BOOK_ROOT: root, MONITOR_ETC: etc, MONITOR_BOOK_NOPRIV: '1', PATH: bin + ':' + process.env.PATH });
  const run = (extra) => spawnSync('bash', [script, ...(extra || []), me], { env, encoding: 'utf8' });
  const before = fs.readFileSync(unit, 'utf8');
  // --check: reports, writes nothing
  let r = run(['--check']);
  assert.strictEqual(r.status, 0, r.stderr); assert.match(r.stdout, /check: would create /); assert.match(r.stdout, /check: would write .*bookings[.]conf with ReadWritePaths=/);
  assert.match(r.stdout, new RegExp('afterwards: systemctl restart monitor-listen-' + me + '\\.service'));
  assert.ok(!fs.existsSync(root)); assert.ok(!fs.existsSync(unit + '.d')); assert.ok(!fs.existsSync(path.join(tmp, 'systemctl.log')));
  // the real run
  r = run();
  assert.strictEqual(r.status, 0, r.stderr);
  const conf = path.join(unit + '.d', 'bookings.conf');
  assert.strictEqual(fs.readFileSync(conf, 'utf8'), '[Service]\nReadWritePaths=' + path.join(root, me) + '\n');
  assert.ok(fs.statSync(path.join(root, me)).isDirectory());
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'systemctl.log'), 'utf8').trim(), 'daemon-reload'); // reloaded, and nothing else asked of systemd
  assert.match(r.stdout, new RegExp('NOT restarted here.*systemctl restart monitor-listen-' + me + '\\.service'));
  assert.strictEqual(fs.readFileSync(unit, 'utf8'), before); // the unit itself is untouched
  // idempotent: the second run changes nothing and does not reload
  const stat1 = fs.statSync(conf).mtimeMs;
  r = run(); assert.strictEqual(r.status, 0, r.stderr); assert.match(r.stdout, /unchanged: /); assert.strictEqual(fs.statSync(conf).mtimeMs, stat1);
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'systemctl.log'), 'utf8').trim(), 'daemon-reload');
  r = run(['--check']); assert.match(r.stdout, /already right/);
  // new tenants get the path from the start (the dash makes a missing folder harmless)
  assert.match(fs.readFileSync(path.join(ROOT, 'setup', 'new-tenant.sh'), 'utf8'), /^ReadWritePaths=-\/var\/lib\/monitor-book\/\$U$/m);
});

test('link-hijack (reviewer repro2): a tenant that stores another business\'s token as its own linkToken cannot take its public link', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-sec-')), DATA = path.join(root, 'platform'); fs.mkdirSync(DATA, { recursive: true });
  const st = { now: NOW }, T = {};
  for (const name of ['ta', 'tb']) {
    const dp = path.join(root, 'home', name, 'data'), sockDir = path.join(root, 's', name);
    fs.mkdirSync(path.join(dp, 'bookings', 'items'), { recursive: true }); fs.mkdirSync(sockDir, { recursive: true });
    B.saveConfig(dp, { hours: allDays(), services: [{ id: 'face', name: 'Facial', minutes: 60, price: 300 }], slotMinutes: 15 });
    const agent = Agent.start({ inst: { name, trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'Biz ' + name }, dataPath: dp }, dataPath: dp, sockDir, now: () => st.now, log: () => {} });
    if (!agent.server.listening) await new Promise((r) => agent.server.once('listening', r));
    live.push(agent); T[name] = { dp };
  }
  const P = BP.create({ DATA, sockPath: (t) => path.join(root, 's', t, 's.sock'), now: () => st.now, log: () => {}, base: 'https://form.test' }); live.push({ close: async () => P.stop() });
  const map = (tok) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'book', 'links', tok + '.json'), 'utf8')).tenant; } catch (e) { return '(none)'; } };
  const tokB = (await P.makeLink('tb')).link.split('/b/')[1];
  const cfg = B.loadConfig(T.ta.dp); cfg.linkToken = tokB; B.saveConfig(T.ta.dp, cfg); // A writes B's token into ITS OWN config
  const ra = await P.makeLink('ta');
  assert.ok(!ra.link.endsWith(tokB), 'A did not get B\'s link back'); assert.strictEqual(map(tokB), 'tb', 'B\'s map entry is untouched');
  const g = await P.handle({ method: 'GET', path: '/b/' + tokB, query: {}, body: null, ip: '1.1.1.1' });
  assert.match(g.body, /<h1>Biz tb<\/h1>/);
  const ft = /"ft":"([^"]+)"/.exec(g.body)[1]; st.now += 5000;
  const r = await P.handle({ method: 'POST', path: '/api/book', query: {}, ip: '2.2.2.2', body: { l: tokB, ft, cid: 'hijack12345', service: 'face', start: '2026-11-23 10:00', name: 'B Client Rivka', phone: '0521112233' } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(B.readItems(T.ta.dp), []); assert.deepStrictEqual(B.readItems(T.tb.dp).map((i) => i.name), ['B Client Rivka']); // B's client lands in B's diary
});
