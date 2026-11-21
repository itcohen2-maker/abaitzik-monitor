'use strict';
// 22.11.2026: the second independent review (link-hijack, the listener's own process, the form token store, the realpath of the socket's
// folder, the owner's one tap confirm, the temp file clean up). Companion of book-security.test.js and bookings-lock.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const BP = require('../lib/book-page.js');
const Agent = require('../lib/book-agent.js');
const B = require('../lib/bookings.js');
const H = require('../lib/bookings-handler.js');
const UI = require('../lib/bookings-ui.js');
const SUP = require('../lib/book-supervisor.js');
const bh = require('../lib/biz-home.js');

const ROOT = path.join(__dirname, '..');
const NOW = Date.parse('2026-11-22T06:00:00Z'); // Sunday 08:00 in Israel
const live = [];
const J = (r) => JSON.parse(r.body);
const allDays = () => { const h = {}; for (let d = 0; d < 7; d++) h[d] = [['08:00', '20:00']]; return h; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test.after(async () => { for (const x of live) await Promise.race([Promise.resolve(x.close()).then(() => 0, () => 0), sleep(1500)]); });

// several businesses behind ONE platform (one data folder, one bridge object), each with its own agent and socket
async function platform(names, opts) {
  opts = opts || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-rev2-')), DATA = path.join(root, 'platform');
  fs.mkdirSync(DATA, { recursive: true });
  const st = { now: NOW }, T = {};
  for (const name of names) {
    const dp = path.join(root, 'home', name, 'data'), sockDir = path.join(root, 's', name);
    fs.mkdirSync(path.join(dp, 'bookings', 'items'), { recursive: true }); fs.mkdirSync(sockDir, { recursive: true });
    B.saveConfig(dp, { hours: allDays(), services: [{ id: 'face', name: 'Facial', minutes: 60, price: 300 }], slotMinutes: 15, bufferMinutes: 0 });
    const inst = { name, trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'Biz ' + name }, dataPath: dp };
    const agent = Agent.start({ inst, dataPath: dp, sockDir, now: () => st.now, log: () => {} });
    if (!agent.server.listening) await new Promise((r) => agent.server.once('listening', r));
    live.push(agent);
    T[name] = { dp, sockDir, inst, agent };
  }
  const P = BP.create({ DATA, sockPath: (t) => path.join(root, 's', t, 's.sock'), now: () => st.now, log: () => {}, base: 'https://form.test', timeoutMs: opts.timeoutMs || 2500 });
  live.push({ close: async () => P.stop() });
  const get = (p, q, ip) => P.handle({ method: 'GET', path: p, query: q || {}, body: null, ip: ip || '1.1.1.1' });
  const post = (p, body, ip) => P.handle({ method: 'POST', path: p, query: {}, body, ip: ip || '1.1.1.1' });
  return { root, DATA, st, T, P, get, post };
}
const linkMap = (w, tok) => { try { return JSON.parse(fs.readFileSync(path.join(w.DATA, 'book', 'links', tok + '.json'), 'utf8')).tenant; } catch (e) { return '(none)'; } };

test('link-hijack: a tenant that writes another business\'s token into its own config gets its own link and changes nothing of the other', async () => {
  const w = await platform(['ta', 'tb']);
  const rb = await w.P.makeLink('tb'), tokB = rb.link.split('/b/')[1];
  assert.strictEqual(linkMap(w, tokB), 'tb');
  // A edits ITS OWN config: linkToken = B's public token (seen on B's shared link), then asks for its link
  const cfgA = B.loadConfig(w.T.ta.dp); cfgA.linkToken = tokB; B.saveConfig(w.T.ta.dp, cfgA);
  const ra = await w.P.makeLink('ta'), tokA = ra.link.split('/b/')[1];
  assert.notStrictEqual(tokA, tokB); assert.strictEqual(linkMap(w, tokB), 'tb'); assert.strictEqual(linkMap(w, tokA), 'ta');
  assert.strictEqual(B.loadConfig(w.T.ta.dp).linkToken, tokA); // the display copy now shows its own
  // a client of B opens B's link: B's page, and the booking lands in B's diary, never in A's
  const page = await w.get('/b/' + tokB); assert.match(page.body, /<h1>Biz tb<\/h1>/);
  const ft = /"ft":"([^"]+)"/.exec(page.body)[1]; w.st.now += 5000;
  const r = await w.post('/api/book', { l: tokB, ft, cid: 'hijackcid123', service: 'face', start: '2026-11-23 10:00', name: 'B Client Rivka', phone: '0521112233' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(B.readItems(w.T.ta.dp), []); assert.deepStrictEqual(B.readItems(w.T.tb.dp).map((i) => i.name), ['B Client Rivka']);
  // asking again returns the platform's token, whatever the agent holds now
  assert.strictEqual((await w.P.makeLink('ta')).link, ra.link); assert.strictEqual((await w.P.makeLink('tb')).link, rb.link);
  assert.strictEqual(fs.readdirSync(path.join(w.DATA, 'book', 'links')).filter((f) => f.endsWith('.json')).length, 2);
});

test('link tokens: made by the bridge with wx on the final path, one per business, racing requests agree, two businesses never share one', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'book-page.js'), 'utf8');
  const mk = src.slice(src.indexOf('async function makeLink('), src.indexOf('async function handle('));
  assert.strictEqual((mk.match(/flag: 'wx'/g) || []).length, 3); assert.strictEqual((mk.match(/rename[(]/g) || []).length, 1); assert.ok(mk.includes('rename(tmp, byFile)')); // links/<tok>.json and links/by-tenant/<tenant>.json, never renamed over
  const w = await platform(['ta', 'tb', 'tc']);
  const all = await Promise.all([w.P.makeLink('ta'), w.P.makeLink('ta'), w.P.makeLink('tb'), w.P.makeLink('tb'), w.P.makeLink('tc'), w.P.makeLink('ta')]);
  assert.ok(all.every((x) => x.ok), JSON.stringify(all));
  assert.strictEqual(all[0].link, all[1].link); assert.strictEqual(all[0].link, all[5].link); assert.strictEqual(all[2].link, all[3].link);
  const toks = [all[0], all[2], all[4]].map((x) => x.link.split('/b/')[1]);
  assert.strictEqual(new Set(toks).size, 3);
  assert.deepStrictEqual(toks.map((t) => linkMap(w, t)), ['ta', 'tb', 'tc']);
  const files = fs.readdirSync(path.join(w.DATA, 'book', 'links')).filter((f) => f.endsWith('.json')); assert.strictEqual(files.length, 3); // the losers removed their own files
  assert.deepStrictEqual(fs.readdirSync(path.join(w.DATA, 'book', 'links', 'by-tenant')).sort(), ['ta.json', 'tb.json', 'tc.json']);
  // the reverse map is the platform's, and it is not overwritten by a later request
  const before = fs.readFileSync(path.join(w.DATA, 'book', 'links', 'by-tenant', 'ta.json'), 'utf8');
  await w.P.makeLink('ta'); assert.strictEqual(fs.readFileSync(path.join(w.DATA, 'book', 'links', 'by-tenant', 'ta.json'), 'utf8'), before);
});

test('an agent that shows another token than the platform\'s is told the platform\'s again, and its answer never decides', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-rev2-')), DATA = path.join(root, 'platform'), sockDir = path.join(root, 's', 'tz'), sock = path.join(sockDir, 's.sock');
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(sockDir, { recursive: true });
  const seen = []; let liar = 1;
  const fake = net.createServer((c) => { c.on('data', (d) => { const q = JSON.parse(String(d).split('\n')[0]); seen.push(q); c.end(JSON.stringify({ ok: true, tok: liar-- > 0 ? 'f'.repeat(24) : q.tok }) + '\n'); }); c.on('error', () => {}); });
  await new Promise((r) => fake.listen(sock, r)); live.push({ close: () => new Promise((r) => fake.close(r)) });
  const P = BP.create({ DATA, sockPath: () => sock, log: () => {} }); live.push({ close: async () => P.stop() });
  const r = await P.makeLink('tz'); assert.strictEqual(r.ok, true);
  const tok = r.link.split('/b/')[1];
  assert.notStrictEqual(tok, 'f'.repeat(24)); assert.strictEqual(seen.length, 2); assert.deepStrictEqual(seen.map((x) => x.op), ['setLink', 'setLink']); assert.ok(seen.every((x) => x.tok === tok && x.tenant === 'tz'));
  // an agent that keeps lying still gets the platform's link returned
  liar = 99; const r2 = await P.makeLink('tz'); assert.strictEqual(r2.link, r.link);
  // no agent: no answer, but the platform's token stays for next time
  await new Promise((rr) => fake.close(rr)); try { fs.unlinkSync(sock); } catch (e) { /* gone */ }
  assert.strictEqual((await P.makeLink('tz')).ok, false);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(DATA, 'book', 'links', 'by-tenant', 'tz.json'), 'utf8')).tok, tok);
});

test('the bridge resolves the real path of the socket\'s folder and requires exactly the tenant\'s folder', async () => {
  const w = await platform(['ta', 'tb']);
  const real = fs.realpathSync(w.T.ta.sockDir);
  // the right folder: works
  const ok = BP.create({ DATA: w.DATA, sockPath: () => path.join(w.T.ta.sockDir, 's.sock'), sockDir: () => real, now: () => NOW, log: () => {} }); live.push({ close: async () => ok.stop() });
  assert.strictEqual((await ok.ask('ta', { op: 'info' })).ok, true);
  // the parent folder is a link that leads to ANOTHER business's real folder (where that agent listens): the real path is not the expected one
  const viaLink = path.join(w.root, 'linkdir'); fs.symlinkSync(fs.realpathSync(w.T.tb.sockDir), viaLink);
  const bad = BP.create({ DATA: w.DATA, sockPath: () => path.join(viaLink, 's.sock'), sockDir: () => real, now: () => NOW, log: () => {} }); live.push({ close: async () => bad.stop() });
  assert.strictEqual(await bad.ask('ta', { op: 'info' }), null);
  // the same link accepted when the expected folder is where it leads: only the real path matters
  const fine = BP.create({ DATA: w.DATA, sockPath: () => path.join(viaLink, 's.sock'), sockDir: () => fs.realpathSync(w.T.tb.sockDir), now: () => NOW, log: () => {} }); live.push({ close: async () => fine.stop() });
  assert.strictEqual((await fine.ask('tb', { op: 'info' })).ok, true);
  // the expected folder is some other one
  const other = BP.create({ DATA: w.DATA, sockPath: () => path.join(w.T.ta.sockDir, 's.sock'), sockDir: () => '/var/lib/monitor-book/ta', now: () => NOW, log: () => {} }); live.push({ close: async () => other.stop() });
  assert.strictEqual(await other.ask('ta', { op: 'info' }), null);
  assert.match(fs.readFileSync(path.join(ROOT, 'lib', 'book-page.js'), 'utf8'), /connect\(\) still follows a link in the final step/);
  assert.match(fs.readFileSync(path.join(ROOT, 'wa-bridge.js'), 'utf8'), /sockDir: \(t\) => '\/var\/lib\/monitor-book\/' \+ t/);
});

test('form tokens: each IP keeps at most 30 live ones, so a few addresses cannot push real visitors out', async () => {
  const w = await platform(['ta']);
  const l = (await w.P.makeLink('ta')).link.split('/b/')[1];
  const ftOf = async (ip) => /"ft":"([^"]+)"/.exec((await w.get('/b/' + l, {}, ip)).body)[1];
  const visitor = await ftOf('2.2.2.2'); // a real visitor's token, first in the store
  const flood = []; for (let i = 0; i < 40; i++) flood.push(await ftOf('9.9.9.9'));
  w.st.now += 5000;
  const body = (ft, n, ip) => ({ l, ft, cid: 'cid' + n + 'abcdefgh', service: 'face', start: '2026-11-23 1' + (n % 10) + ':00', name: 'Visitor ' + n, phone: '05211100' + (10 + n) });
  // the flooding address lost its 10 oldest tokens (fast = not found), kept its newest (each refused try also makes it a fresh one, so the oldest go first)
  assert.strictEqual(J(await w.post('/api/book', body(flood[0], 0), '9.9.9.9')).error, 'fast');
  assert.strictEqual(J(await w.post('/api/book', body(flood[9], 1), '9.9.9.9')).error, 'fast');
  { const n_ = 'flood10'; const rr = await w.post('/api/book', body(flood[39], 2), '9.9.9.9'); assert.strictEqual(rr.status, 200, 'which=' + n_ + ' ' + rr.body); }
  // the visitor's token from another address is still there
  { const n_ = 'visitor'; const rr = await w.post('/api/book', body(visitor, 3), '2.2.2.2'); assert.strictEqual(rr.status, 200, 'which=' + n_ + ' ' + rr.body); }
});

test('the owner\'s one tap: a booking from the link is marked "ממתין לאישור" with "לאשר" and "לבטל"; the line confirms it, with no model', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-rev2-'));
  B.saveConfig(dp, { hours: allDays(), services: [{ id: 'face', name: 'Facial', minutes: 60, price: 300 }], slotMinutes: 15 });
  const inst = { dataPath: dp, trade: 'beauty', gender: 'f', bookings: true };
  const a = B.add(dp, { start: '2026-11-23 10:00', serviceId: 'face', name: 'דנה כהן', phone: '0521234567', src: 'link' }, NOW).booking;
  const h = UI.html(inst, NOW);
  assert.ok(h.includes('ממתין לאישור') && h.includes('data-a=\\"ok\\"') === false && h.includes("data-a=\"ok\"") && h.includes('>לאשר<') && h.includes("אישור תור לקוחה: '"));
  assert.deepStrictEqual(UI.data(inst, NOW).items.map((i) => [i.src, i.status]), [['link', 'booked']]);
  assert.deepStrictEqual(B.parseRequest('אישור תור לקוחה: ' + a.id), { kind: 'confirm', id: a.id });
  const r = H.handle(inst, 'תור לקוחה\nאישור תור לקוחה: ' + a.id + '\n\nקוד', NOW);
  assert.strictEqual(r.ok, true); assert.match(r.reply, /^אישרתי: התור של דנה כהן ביום שני 23\.11 בשעה 10:00\.$/);
  assert.strictEqual(B.byToken(dp, a.tok).status, 'confirmed');
  assert.strictEqual(H.handle(inst, 'אישור תור לקוחה: nope', NOW).ok, false);
  assert.match(require('../lib/fireflies-key.js').mask('תור לקוחה\nאישור תור לקוחה: abc'), /הפרטים לא נרשמים כאן/);
  assert.ok(fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8').includes('(?:מגבלות קישור|פתיחת קישור|אישור תור לקוחה|תור לקוחה|'));
  const demo = require('../lib/demo-acts.js'), say = demo.say || (demo.client && demo.client.say);
  if (typeof say === 'function') assert.match(say('תור לקוחה', 'אישור תור לקוחה: ab').got, /לאשר תור/);
});

test('the owner\'s lines are applied under the ASYNC lock: a lock held by another process does not freeze the listener', async () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-rev2-'));
  B.saveConfig(dp, { hours: allDays(), services: [{ id: 'face', name: 'Facial', minutes: 60, price: 300 }], slotMinutes: 15 });
  const inst = { dataPath: dp, trade: 'beauty', gender: 'f', bookings: true };
  const child = spawn(process.execPath, ['-e', "const B=require(process.argv[1]+'/lib/bookings.js');B.withLock(process.argv[2],()=>{console.log('held');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,700);});", ROOT, dp], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => child.stdout.once('data', r));
  let ticks = 0; const iv = setInterval(() => ticks++, 10); const t0 = Date.now();
  const r = await H.handleAsync(inst, 'תור לקוחה\nתור לקוחה חדש: 2026-11-23 10:00 | Facial | דנה כהן | 0521234567\n\nקוד', NOW);
  clearInterval(iv);
  assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.ok(Date.now() - t0 >= 500, 'it waited for the other process'); assert.ok(ticks > 30, 'the loop ticked ' + ticks + ' times meanwhile');
  assert.strictEqual(await H.handleAsync(inst, 'מה יש לי היום', NOW), null); // not a line: untouched
  assert.strictEqual(H.isLine(inst, 'ביטול תור לקוחה: x'), true); assert.strictEqual(H.isLine({ dataPath: dp, trade: 'beauty', bookings: false }, 'ביטול תור לקוחה: x'), false);
  // the listener source uses it and keeps the sync version out of its path
  const L = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8');
  assert.ok(L.includes('.handleAsync(inst, text)') && !L.includes("bookings-handler.js').handle(inst, text)"));
});

test('the supervisor: restarts a dead agent with growing delays, not after exit 0, stops with the listener', async () => {
  const kids = [];
  const fake = () => { const c = new EventEmitter(); c.kill = () => { c.killed = true; c.emit('exit', null); }; kids.push(c); return c; };
  const logs = [];
  const sup = SUP.supervise({ spawn: fake, log: (l) => logs.push(l), delays: [30, 60, 90] });
  assert.strictEqual(kids.length, 1);
  kids[0].emit('exit', 1); await sleep(15); assert.strictEqual(kids.length, 1); // not yet: the first delay is 30ms
  await sleep(40); assert.strictEqual(kids.length, 2);
  kids[1].emit('exit', 1); await sleep(40); assert.strictEqual(kids.length, 2); // the second delay is longer
  await sleep(40); assert.strictEqual(kids.length, 3);
  assert.ok(logs.length >= 2 && logs.every((l) => /הסוכן נעצר/.test(l)) && !logs.join('').match(/דנה/));
  kids[2].emit('exit', 0); await sleep(150); assert.strictEqual(kids.length, 3); // exit 0 means nothing to do
  const sup2 = SUP.supervise({ spawn: fake, log: () => {}, delays: [20] });
  const k = kids[kids.length - 1]; sup2.stop(); assert.strictEqual(k.killed, true);
  k.emit('exit', 1); await sleep(60); assert.strictEqual(kids.length, 4); // stopped: no restart
  sup.stop();
  // a spawn that throws is retried too
  let n = 0; const sup3 = SUP.supervise({ spawn: () => { if (n++ < 2) throw new Error('boom'); return fake(); }, log: () => {}, delays: [10] });
  await sleep(120); assert.ok(n >= 3); sup3.stop();
});

test('the agent as its own process: serves on its socket, is restarted by the supervisor, and is not started when bookings are off', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-rev2-')), dp = path.join(root, 'data'), sockDir = path.join(root, 's'), sock = path.join(sockDir, 's.sock');
  fs.mkdirSync(path.join(dp, 'bookings'), { recursive: true }); fs.mkdirSync(sockDir);
  B.saveConfig(dp, { hours: allDays(), services: [{ id: 'face', name: 'Facial', minutes: 60, price: 300 }], slotMinutes: 15 });
  const instFile = path.join(root, 'instance.json');
  fs.writeFileSync(instFile, JSON.stringify({ name: 't1', owner: 'x', pageTitle: 'המוניטור של בדיקה', trade: 'beauty', bookings: true, gender: 'f', dataDir: dp, screens: ['gRemind'] }));
  const env = Object.assign({}, process.env, { ABAITZIK_INSTANCE_FILE: instFile, MONITOR_BOOK_SOCKDIR: sockDir });
  const ask = () => new Promise((res) => { const c = net.connect(sock); let b = ''; c.on('connect', () => c.write(JSON.stringify({ op: 'info', tenant: 't1' }) + '\n')); c.on('data', (d) => { b += d; }); c.on('close', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); c.on('error', () => res(null)); });
  const until = async (fn, ms) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(60); } };
  const sup = SUP.supervise({ spawn: () => spawn(process.execPath, [path.join(ROOT, 'lib', 'book-agent-proc.js')], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] }), log: () => {}, delays: [100] });
  live.push({ close: async () => sup.stop() });
  const first = await until(ask, 8000); assert.ok(first && first.ok === true && first.name, 'the agent process answers');
  const pid1 = sup.child().pid;
  process.kill(pid1, 'SIGKILL'); // the agent dies
  const second = await until(async () => { const k = sup.child(); return k && k.pid !== pid1 ? await ask() : null; }, 8000);
  assert.ok(second && second.ok === true, 'a new agent process answers'); assert.notStrictEqual(sup.child().pid, pid1);
  sup.stop(); await until(async () => !(await ask()), 3000);
  // bookings off: the process exits with 0 at once and is not restarted
  fs.writeFileSync(instFile, JSON.stringify({ name: 't1', owner: 'x', pageTitle: 'x', trade: 'beauty', bookings: false, dataDir: dp, screens: ['gRemind'] }));
  const off = spawn(process.execPath, [path.join(ROOT, 'lib', 'book-agent-proc.js')], { cwd: ROOT, env, stdio: 'ignore' });
  const code = await new Promise((r) => off.on('exit', r)); assert.strictEqual(code, 0);
  // listen.js starts it through the supervisor, as a child process, only for bookings instances
  const L = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8');
  assert.ok(L.includes("require('./lib/book-supervisor.js').supervise(") && L.includes("'book-agent-proc.js'") && L.includes("process.on('exit', () => bookSup.stop())") && !L.includes("require('./lib/book-agent.js').start("));
});

test('biz-home.writeList cleans its own stale temp files (older than an hour) and nothing else', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-rev2-')), d = path.join(dp, 'biz-home'); fs.mkdirSync(d);
  const mk = (n, ageMs) => { const f = path.join(d, n); fs.writeFileSync(f, 'x'); const t = new Date(Date.now() - ageMs); fs.utimesSync(f, t, t); return f; };
  const old1 = mk('events.json.0123456789abcdef.tmp', 2 * 3600e3), old2 = mk('clients.json.fedcba9876543210.tmp', 5 * 3600e3);
  const fresh = mk('events.json.aaaaaaaaaaaaaaaa.tmp', 60e3);
  const other = mk('events.json.tmp', 9 * 3600e3), alien = mk('notes.txt', 9 * 3600e3), short = mk('events.json.abc.tmp', 9 * 3600e3), quote = mk('quotes.json.0123456789abcdef.tmp', 3 * 3600e3);
  bh.writeList(dp, 'event', [{ id: 'e' }]);
  assert.ok(!fs.existsSync(old1) && !fs.existsSync(old2) && !fs.existsSync(quote)); // its own random names, over an hour old
  assert.ok(fs.existsSync(fresh) && fs.existsSync(other) && fs.existsSync(alien) && fs.existsSync(short)); // a recent one (maybe a write in flight), and files that are not its own
  assert.deepStrictEqual(bh.readList(dp, 'event'), [{ id: 'e' }]);
});

test('a reverse map left empty or unreadable by a crash is replaced after 5 seconds, only that tenant\'s own file', async () => {
  const w = await platform(['ta', 'tb']);
  const by = (t) => path.join(w.DATA, 'book', 'links', 'by-tenant', t + '.json');
  const tokB = (await w.P.makeLink('tb')).link.split('/b/')[1];
  const bBefore = fs.readFileSync(by('tb'), 'utf8'), fwdB = fs.readFileSync(path.join(w.DATA, 'book', 'links', tokB + '.json'), 'utf8');
  fs.mkdirSync(path.dirname(by('ta')), { recursive: true });
  // a young leftover (a write that may be in flight) is not touched: a transient answer, nothing replaced
  fs.writeFileSync(by('ta'), '');
  const young = await w.P.makeLink('ta'); assert.strictEqual(young.ok, false); assert.strictEqual(fs.readFileSync(by('ta'), 'utf8'), '');
  // older than 5 seconds: empty, half written or garbage are dead leftovers
  for (const junk of ['', '{"tok":', 'not json', '{"tok":"zz"}', '[]']) {
    fs.writeFileSync(by('ta'), junk); const old = new Date(Date.now() - 10e3); fs.utimesSync(by('ta'), old, old);
    const r = await w.P.makeLink('ta'); assert.strictEqual(r.ok, true, JSON.stringify(junk));
    const tok = r.link.split('/b/')[1];
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(by('ta'), 'utf8')), { tok }); assert.strictEqual(linkMap(w, tok), 'ta');
    assert.strictEqual((await w.P.makeLink('ta')).link, r.link); // and it stays
  }
  // B's maps, forward and reverse, were never touched; no temp file is left; every forward file belongs to a live reverse map
  assert.strictEqual(fs.readFileSync(by('tb'), 'utf8'), bBefore); assert.strictEqual(fs.readFileSync(path.join(w.DATA, 'book', 'links', tokB + '.json'), 'utf8'), fwdB);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(by('ta'))).sort(), ['ta.json', 'tb.json']);
  const fwd = fs.readdirSync(path.join(w.DATA, 'book', 'links')).filter((f) => f.endsWith('.json'));
  assert.strictEqual(fwd.length, 6, 'one forward file per recovery of the five corrupted maps and one for tb, none from the young refusal: ' + fwd.join(',')); // (a recovered token replaces a map that never held a usable one)
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'book-page.js'), 'utf8');
  assert.ok(src.includes('ONLY this tenant\'s own reverse map file, never a forward links/<token>.json'));
});

test('the owner\'s screen: what waits for her at the very top, the caps and "open the link again now"; the lines apply them', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-rev2-'));
  B.saveConfig(dp, { hours: allDays(), services: [{ id: 'face', name: 'Facial', minutes: 60, price: 300 }], slotMinutes: 15 });
  const inst = { dataPath: dp, trade: 'beauty', gender: 'f', bookings: true };
  const h = UI.html(inst, NOW);
  for (const part of ['class="bkPendTop"', 'aria-label="ממתינים לאישור"', 'function pendTop()', 'pendTop() + ', 'קביעה דרך הקישור', 'data-a="limits"', 'data-a="reopen"', 'לפתוח את הקישור שוב עכשיו', 'לשמור מגבלות', "send('מגבלות קישור: '", "send('פתיחת קישור: עכשיו')"]) assert.ok(h.includes(part), part);
  assert.deepStrictEqual(B.parseRequest('מגבלות קישור: 8 | 25'), { kind: 'limits', perHour: 8, perDay: 25 });
  assert.deepStrictEqual(B.parseRequest('פתיחת קישור: עכשיו'), { kind: 'reopen' });
  assert.strictEqual(B.parseRequest('מגבלות קישור: x | 25'), null);
  let r = H.handle(inst, 'תור לקוחה\nמגבלות קישור: 8 | 25\n\nקוד', NOW);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.reply, 'עדכנתי: עד 8 תורים בשעה ועד 25 ביום דרך הקישור.'); assert.deepStrictEqual([B.loadConfig(dp).limits.perHour, B.loadConfig(dp).limits.perDay], [8, 25]);
  assert.strictEqual(H.handle(inst, 'מגבלות קישור: 0 | 25', NOW).ok, false); assert.strictEqual(H.handle(inst, 'מגבלות קישור: 500 | 25', NOW).ok, false); assert.strictEqual(B.loadConfig(dp).limits.perHour, 8);
  assert.strictEqual(B.loadConfig(dp).reopenedAt, '');
  r = H.handle(inst, 'פתיחת קישור: עכשיו', NOW); assert.strictEqual(r.ok, true); assert.strictEqual(B.loadConfig(dp).reopenedAt, new Date(NOW).toISOString());
  assert.match(require('../lib/fireflies-key.js').mask('מגבלות קישור: 8 | 25'), /הפרטים לא נרשמים כאן/);
  // the data the screen needs carries the booking's source and status, and the caps
  const a = B.add(dp, { start: '2026-11-23 10:00', serviceId: 'face', name: 'דנה כהן', phone: '0521234567', src: 'link' }, NOW).booking;
  const D = UI.data(inst, NOW); assert.deepStrictEqual(D.items.map((i) => [i.id, i.src, i.status]), [[a.id, 'link', 'booked']]); assert.strictEqual(D.cfg.limits.perHour, 8);
});

test('the agent child gets a minimal explicit environment', () => {
  const L = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8');
  assert.ok(L.includes("for (const k of ['HOME', 'PATH', 'TZ', 'NODE_ENV']) if (process.env[k] !== undefined) e[k] = process.env[k]"));
  assert.ok(L.includes("stdio: ['ignore', 'inherit', 'inherit'], env: bookEnv() })"));
  assert.ok(!/book-agent-proc[^\n]*\n[^\n]*env: process\.env/.test(L));
});
