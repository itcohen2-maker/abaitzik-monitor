'use strict';
// 22.11.2026: the write lock of lib/bookings.js. Two writers (the owner's listener and the public page) on one data folder.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const B = require('../lib/bookings.js');

function fresh() {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-test-lock-'));
  B.saveConfig(dp, { hours: { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [], 6: [] },
    services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }], slotMinutes: 15, bufferMinutes: 0 });
  return dp;
}
// a child process that waits for T0 and then tries to book the slot
const CHILD = `
const B = require(process.argv[1] + '/lib/bookings.js');
const [, root, dp, start, name, phone, t0, src] = process.argv; // with -e there is no script name in argv
while (Date.now() < Number(t0)) { /* all children start together */ }
const r = B.add(dp, { start, serviceId: 'brows', name, phone, src: src || 'owner' });
process.stdout.write(JSON.stringify({ ok: r.ok, error: r.error || '', why: r.why || '' }));
`;
function run(dp, start, name, phone, t0, src) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ['-e', CHILD, path.join(__dirname, '..'), dp, start, name, phone, String(t0), src || 'owner'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve({ ok: false, error: 'crash', why: out }); } });
  });
}

test('lock: six processes try the same slot at the same moment, exactly one wins', async () => {
  const dp = fresh();
  const t0 = Date.now() + 1500, start = '2027-03-02 10:00'; // a Tuesday far ahead
  const res = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => run(dp, start, 'לקוחה ' + i, '05011100' + String(10 + i), t0, i % 2 ? 'link' : 'owner')));
  assert.strictEqual(res.filter((r) => r.ok).length, 1, JSON.stringify(res));
  assert.deepStrictEqual(res.filter((r) => !r.ok).map((r) => r.error), ['conflict', 'conflict', 'conflict', 'conflict', 'conflict']);
  assert.strictEqual(B.readItems(dp).length, 1);
  assert.ok(!fs.existsSync(path.join(dp, 'bookings', '.lock')), 'the lock is released');
});

test('lock: different slots at the same moment all succeed (the lock is a queue, not a refusal)', async () => {
  const dp = fresh();
  const t0 = Date.now() + 1500;
  const res = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => run(dp, '2027-03-02 ' + String(9 + i).padStart(2, '0') + ':00', 'לקוחה ' + i, '05011100' + String(10 + i), t0)));
  assert.strictEqual(res.filter((r) => r.ok).length, 6, JSON.stringify(res));
  assert.strictEqual(B.readItems(dp).length, 6);
});

test('lock: a stale lock of a crashed writer is taken over, a live one makes the writer wait and then refuse', () => {
  const dp = fresh(), f = path.join(dp, 'bookings', '.lock.d');
  fs.mkdirSync(f); fs.writeFileSync(path.join(f, 'pid'), '99999');
  const old = new Date(Date.now() - 60e3); fs.utimesSync(f, old, old); // older than the stale limit
  const r = B.add(dp, { start: '2027-03-02 10:00', serviceId: 'brows', name: 'א' });
  assert.strictEqual(r.ok, true);
  assert.ok(!fs.existsSync(f));
  // a fresh lock held by someone: withLock waits, then gives up with "busy" (the add answers bad, never throws)
  fs.mkdirSync(f);
  const t = Date.now(); const r2 = B.add(dp, { start: '2027-03-02 11:00', serviceId: 'brows', name: 'ב' });
  assert.strictEqual(r2.ok, false); assert.strictEqual(r2.error, 'bad'); assert.strictEqual(r2.why, 'busy');
  assert.ok(Date.now() - t >= 4000, 'it waited');
  fs.rmSync(f, { recursive: true });
});

test('lock: waiting from the agent uses timers, so the event loop keeps running', async () => {
  const dp = fresh(), f = path.join(dp, 'bookings', '.lock.d');
  fs.mkdirSync(f);
  let ticks = 0; const iv = setInterval(() => ticks++, 10);
  setTimeout(() => fs.rmSync(f, { recursive: true, force: true }), 400);
  const t0 = Date.now(); const r = await B.withLockAsync(dp, () => B.add(dp, { start: '2027-03-02 10:00', serviceId: 'brows', name: 'א' }));
  clearInterval(iv);
  assert.strictEqual(r.ok, true); assert.ok(Date.now() - t0 >= 350); assert.ok(ticks > 20, 'ticks ' + ticks);
});

test('lock: the temp files are random and opened with wx, a planted file or link is never written through', () => {
  const dp = fresh(), victim = path.join(dp, 'victim.txt'); fs.writeFileSync(victim, 'ORIGINAL');
  fs.symlinkSync(victim, path.join(dp, 'bookings', 'config.json.tmp'));
  B.saveConfig(dp, B.loadConfig(dp));
  assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'ORIGINAL');
  const left = fs.readdirSync(path.join(dp, 'bookings')).filter((x) => x.endsWith('.tmp') && x !== 'config.json.tmp');
  assert.deepStrictEqual(left, []); // no temp file left behind
});

test('lock: released when the work throws', () => {
  const dp = fresh();
  assert.throws(() => B.withLock(dp, () => { throw new Error('boom'); }), /boom/);
  assert.ok(!fs.existsSync(path.join(dp, 'bookings', '.lock')));
  assert.strictEqual(B.withLock(dp, () => 7), 7);
});

test('tokens: 24 hex per booking, unique, found by byToken, never guessable by a wrong one', () => {
  const dp = fresh();
  const a = B.add(dp, { start: '2027-03-02 10:00', serviceId: 'brows', name: 'א', phone: '0501110001' }).booking;
  const b = B.add(dp, { start: '2027-03-02 11:00', serviceId: 'brows', name: 'ב', phone: '0501110002' }).booking;
  assert.match(a.tok, /^[a-f0-9]{24}$/); assert.notStrictEqual(a.tok, b.tok);
  assert.strictEqual(B.byToken(dp, a.tok).id, a.id);
  assert.strictEqual(B.byToken(dp, 'f'.repeat(24)), null); assert.strictEqual(B.byToken(dp, a.id), null); assert.strictEqual(B.byToken(dp, '../x'), null);
});

test('link token: made once, kept in the config, the config keeps remindAt', () => {
  const dp = fresh();
  const t = B.ensureLinkToken(dp);
  assert.match(t, /^[a-f0-9]{24}$/); assert.strictEqual(B.ensureLinkToken(dp), t); assert.strictEqual(B.loadConfig(dp).linkToken, t);
  assert.strictEqual(B.loadConfig(dp).remindAt, '18:00');
  const c = B.loadConfig(dp); c.remindAt = '19:30'; c.linkToken = 'nonsense'; B.saveConfig(dp, c);
  assert.strictEqual(B.loadConfig(dp).remindAt, '19:30'); assert.strictEqual(B.loadConfig(dp).linkToken, '');
});

test('auto done: after the end time, unless cancelled or marked a no show; lastVisits counts done only', () => {
  const dp = fresh();
  const T = Date.parse('2027-03-02T07:00:00Z'); // 09:00 Israel
  let n = 0;
  const mk = (time, name, st) => { const r = B.add(dp, { start: '2027-03-02 ' + time, serviceId: 'brows', name, phone: '05011100' + (10 + n++) }, T - 864e5); if (st) B.setStatus(dp, r.booking.id, st, T); return r.booking; };
  const a = mk('09:00', 'א'), b = mk('09:30', 'ב', 'noshow'), c = mk('10:00', 'ג', 'cancelled'), d = mk('12:00', 'ד');
  assert.strictEqual(B.autoDone(dp, Date.parse('2027-03-02T07:45:00Z')), 1); // at 09:45 only "א" (ends 09:20) is over and open; "ב" is a no show
  const st = Object.fromEntries(B.readItems(dp).map((i) => [i.name, i.status]));
  assert.deepStrictEqual(st, { 'א': 'done', 'ב': 'noshow', 'ג': 'cancelled', 'ד': 'booked' });
  assert.strictEqual(B.autoDone(dp, Date.parse('2027-03-02T07:45:00Z')), 0); // repeatable
  assert.strictEqual(B.autoDone(dp, Date.parse('2027-03-02T11:00:00Z')), 1); // "ד" ends 12:20 Israel = 10:20Z
  assert.ok(a && b && c && d);
  const lv = B.lastVisits(dp, Date.parse('2027-03-02T11:00:00Z'));
  assert.strictEqual(Object.keys(lv).length, 2); // א and ד, not the no show, not the cancelled one
});

test('nearest slots: up to three, closest to the wanted time first', () => {
  const dp = fresh();
  B.add(dp, { start: '2027-03-02 10:00', serviceId: 'brows', name: 'א' });
  const near = B.nearestSlots(dp, '2027-03-02 10:00', 'brows', 3, Date.parse('2027-03-01T00:00:00Z'));
  assert.strictEqual(near.length, 3);
  const times = near.map((x) => x.time);
  assert.ok(times.includes('09:30') && times.includes('10:30'), times.join(','));
  assert.ok(near.every((x) => x.time >= '09:15' && x.time <= '10:45'));
  assert.deepStrictEqual(B.nearestSlots(dp, 'garbage', 'brows', 3), []);
});

// ---- the lock owner: a pid and a nonce (the second review) ----
const HOLD = "const B=require(process.argv[1]+'/lib/bookings.js');B.withLock(process.argv[2],()=>{console.log('held');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Number(process.argv[3]));});";
function holder(dp, ms) {
  const c = spawn(process.execPath, ['-e', HOLD, path.join(__dirname, '..'), dp, String(ms)], { stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((res) => c.stdout.once('data', () => res(c)));
}

test('lock: a killed holder is taken over at once (its pid is gone), not after the stale age', async () => {
  const dp = fresh();
  const c = await holder(dp, 60000);
  const owner = JSON.parse(fs.readFileSync(path.join(dp, 'bookings', '.lock.d', 'owner'), 'utf8'));
  assert.strictEqual(owner.pid, c.pid); assert.match(owner.nonce, /^[0-9a-f]{16}$/);
  c.kill('SIGKILL'); await new Promise((r) => c.on('exit', r));
  const t0 = Date.now(); const r = B.add(dp, { start: '2027-03-02 10:00', serviceId: 'brows', name: 'א' });
  assert.strictEqual(r.ok, true); assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms: the dead holder was not waited for');
  assert.ok(!fs.existsSync(path.join(dp, 'bookings', '.lock.d')));
  assert.deepStrictEqual(fs.readdirSync(path.join(dp, 'bookings')).filter((x) => x.includes('.stale.')), []); // the moved lock was removed
});

test('lock: a live holder is never taken over while it works, even when its lock is old by the clock of the folder', async () => {
  const dp = fresh();
  const c = await holder(dp, 900);
  const l = path.join(dp, 'bookings', '.lock.d'), old = new Date(Date.now() - 20e3); fs.utimesSync(l, old, old); // 20s old but its pid is alive and under the 30s age
  const t0 = Date.now(); const r = B.add(dp, { start: '2027-03-02 10:00', serviceId: 'brows', name: 'א' });
  assert.strictEqual(r.ok, true); assert.ok(Date.now() - t0 >= 500, 'it waited for the live holder (' + (Date.now() - t0) + ' ms)');
  await new Promise((rr) => c.on('exit', rr));
  // over the age limit a lock is taken even from a live pid (a holder stuck for 30 seconds)
  const dp2 = fresh(); const c2 = await holder(dp2, 3000);
  const l2 = path.join(dp2, 'bookings', '.lock.d'), older = new Date(Date.now() - 40e3); fs.utimesSync(l2, older, older);
  const t1 = Date.now(); assert.strictEqual(B.add(dp2, { start: '2027-03-02 10:00', serviceId: 'brows', name: 'א' }).ok, true); assert.ok(Date.now() - t1 < 1500);
  c2.kill('SIGKILL');
});

test('lock: release removes the lock only while the nonce is still its own', () => {
  const dp = fresh(), l = path.join(dp, 'bookings', '.lock.d');
  let tookOver = false;
  B.withLock(dp, () => {
    // while this holder works, its lock is taken over (as after a stall) and another holder owns the directory now
    fs.rmSync(l, { recursive: true }); fs.mkdirSync(l); fs.writeFileSync(path.join(l, 'owner'), JSON.stringify({ pid: process.pid, nonce: 'someoneelse00000' })); tookOver = true;
  });
  assert.ok(tookOver); assert.ok(fs.existsSync(l), 'the new holder\'s lock was not removed from under it');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(l, 'owner'), 'utf8')).nonce, 'someoneelse00000');
  // a lock whose takeover judged one owner and found another after the rename is put back
  const dp2 = fresh(), l2 = path.join(dp2, 'bookings', '.lock.d'); fs.mkdirSync(l2); fs.writeFileSync(path.join(l2, 'owner'), JSON.stringify({ pid: 999999, nonce: 'aaaaaaaaaaaaaaaa' }));
  const stale = new Date(Date.now() - 60e3); fs.utimesSync(l2, stale, stale);
  assert.strictEqual(B.add(dp2, { start: '2027-03-02 10:00', serviceId: 'brows', name: 'א' }).ok, true); // pid 999999 is not alive: taken over
});

test('lock: three processes taking turns never overlap (the reviewer\'s lock race)', async () => {
  const dp = fresh();
  const script = "const B=require(process.argv[1]+'/lib/bookings.js'),fs=require('fs');const dp=process.argv[2];let both=0,done=0;for(let k=0;k<150;k++){B.withLock(dp,()=>{const f=dp+'/in';if(fs.existsSync(f))both++;fs.writeFileSync(f,'1');const t=Date.now();while(Date.now()-t<1){}fs.unlinkSync(f);done++;});}console.log(JSON.stringify({both,done}));";
  const run = () => new Promise((res) => { const c = spawn(process.execPath, ['-e', script, path.join(__dirname, '..'), dp], { stdio: ['ignore', 'pipe', 'inherit'] }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('close', () => res(JSON.parse(o))); });
  const res = await Promise.all([run(), run(), run()]);
  assert.deepStrictEqual(res.map((x) => x.both), [0, 0, 0]); assert.deepStrictEqual(res.map((x) => x.done), [150, 150, 150]);
});
