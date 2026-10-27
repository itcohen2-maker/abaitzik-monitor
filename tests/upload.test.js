'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createUploadServer, sanitizeName, MB } = require('../lib/upload-server.js');

const ORIGIN = 'https://page.example';
const CODE = '4821';

function setup(extra) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'up-'));
  const data = path.join(base, 'data');
  fs.mkdirSync(data);
  const state = { free: 100 * 1024 * MB, t: Date.now() };
  const up = createUploadServer(Object.assign({
    root: path.join(base, 'stage'),
    tenants: { acme: { dataPath: data, origins: [ORIGIN], code: () => CODE },
               nocode: { dataPath: data, origins: [ORIGIN], code: () => null } },
    log: () => {}, freeBytes: () => state.free, now: () => state.t,
  }, extra || {}));
  return new Promise((resolve) => up.server.listen(0, '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + up.server.address().port;
    resolve({ up, url, data, base, state, close: () => new Promise((r) => { up.server.closeAllConnections(); up.server.close(r); })
      // 27.10: every run left its up-* folder in /tmp, 17,000 of them and 11GB, until the disk filled and push failed.
      .then(() => fs.rmSync(base, { recursive: true, force: true })) });
  }));
}
const H = (code) => ({ 'X-Monitor-Code': code === undefined ? CODE : code });
async function create(s, body, code, tenant) {
  const r = await fetch(s.url + '/up/v1/' + (tenant || 'acme') + '/uploads', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H(code)), body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function put(s, id, offset, buf, code) {
  const r = await fetch(s.url + '/up/v1/acme/uploads/' + id + '?offset=' + offset, { method: 'PUT', headers: H(code), body: buf });
  return { status: r.status, body: await r.json() };
}
async function finish(s, id, caption) {
  const r = await fetch(s.url + '/up/v1/acme/uploads/' + id + '/finish', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H()), body: JSON.stringify({ caption }) });
  return { status: r.status, body: await r.json() };
}

test('wrong, missing and malformed codes are refused, nothing is created', async () => {
  const s = await setup();
  for (const c of ['0000', '', '48210', 'abcd', '482']) {
    const r = await create(s, { name: 'a.mp4', size: 10 }, c);
    assert.strictEqual(r.status, 401, 'code "' + c + '"');
  }
  assert.deepStrictEqual(fs.readdirSync(path.join(s.base, 'stage')), []);
  const bare = await fetch(s.url + '/up/v1/acme/uploads', { method: 'POST', body: '{}' });
  assert.strictEqual(bare.status, 401);
  await s.close();
});

test('a tenant without a code file is refused, an unknown tenant is a 404', async () => {
  const s = await setup();
  assert.strictEqual((await create(s, { name: 'a', size: 5 }, CODE, 'nocode')).status, 503);
  assert.strictEqual((await create(s, { name: 'a', size: 5 }, CODE, 'ghost')).status, 404);
  assert.strictEqual((await create(s, { name: 'a', size: 5 }, CODE, '..')).status, 404);
  assert.strictEqual((await create(s, { name: 'a', size: 5 }, CODE, 'constructor')).status, 404);
  await s.close();
});

test('ten wrong codes lock that address, even for the right code', async () => {
  const s = await setup();
  for (let i = 0; i < 10; i++) await create(s, { name: 'a', size: 5 }, '1111');
  assert.strictEqual((await create(s, { name: 'a', size: 5 }, CODE)).status, 429);
  s.state.t += 11 * 60 * 1000;
  assert.strictEqual((await create(s, { name: 'a', size: 5 }, CODE)).status, 201);
  await s.close();
});

test('names cannot climb out of the inbox', async () => {
  const cases = [['../../etc/passwd', 'passwd'], ['..\\..\\x.mp4', 'x.mp4'], ['/abs/path/v.mov', 'v.mov'],
    ['.hidden', 'hidden'], ['a\u0000b.mp4', 'a_b.mp4'], ['', 'file'], ['..', 'file'], ['clip.mp4.part2of5', 'clip.mp4_part2of5']];
  for (const [raw, ok] of cases) assert.strictEqual(sanitizeName(raw), ok, JSON.stringify(raw));
  const s = await setup();
  const r = await create(s, { name: '../../../../tmp/evil.mp4', size: 4 });
  assert.strictEqual(r.status, 201);
  await put(s, r.body.id, 0, Buffer.from('abcd'));
  const f = await finish(s, r.body.id, '');
  assert.strictEqual(f.body.name, 'evil.mp4');
  assert.ok(fs.existsSync(path.join(s.data, 'inbox', 'evil.mp4')));
  assert.ok(!fs.existsSync(path.join(os.tmpdir(), 'evil.mp4')));
  const bad = await fetch(s.url + '/up/v1/acme/uploads/..%2F..%2Fx', { headers: H() });
  assert.strictEqual(bad.status, 404);
  await s.close();
});

test('upload in chunks, finish, file lands in the inbox with a ready note', async () => {
  const s = await setup();
  const data = Buffer.alloc(2500, 7);
  const r = await create(s, { name: 'big.mp4', size: data.length, type: 'video/mp4', key: 'big.mp4|2500|1' });
  assert.strictEqual(r.status, 201);
  let off = 0;
  while (off < data.length) {
    const p = await put(s, r.body.id, off, data.subarray(off, off + 1000));
    assert.strictEqual(p.status, 200);
    off = p.body.offset;
  }
  const f = await finish(s, r.body.id, 'שורה');
  assert.deepStrictEqual(f.body, { ok: true, name: 'big.mp4' });
  assert.deepStrictEqual(fs.readFileSync(path.join(s.data, 'inbox', 'big.mp4')), data);
  const ready = JSON.parse(fs.readFileSync(path.join(s.data, 'uploads', 'ready', r.body.id + '.json'), 'utf8'));
  assert.strictEqual(ready.name, 'big.mp4');
  assert.strictEqual(ready.caption, 'שורה');
  assert.strictEqual(ready.size, 2500);
  const again = await finish(s, r.body.id, 'שורה');
  assert.strictEqual(again.body.again, true);
  assert.strictEqual(fs.readdirSync(path.join(s.data, 'uploads', 'ready')).length, 1);
  const r2 = await create(s, { name: 'big.mp4', size: 3 });
  await put(s, r2.body.id, 0, Buffer.from('xyz'));
  assert.strictEqual((await finish(s, r2.body.id, '')).body.name, 'big-2.mp4');
  await s.close();
});

test('resume: same key finds the upload and its offset; wrong offset gets 409 with the true one', async () => {
  const s = await setup();
  const key = 'v.mov|3000|99';
  const r = await create(s, { name: 'v.mov', size: 3000, key });
  await put(s, r.body.id, 0, Buffer.alloc(1000, 1));
  const r2 = await create(s, { name: 'v.mov', size: 3000, key });
  assert.strictEqual(r2.body.id, r.body.id);
  assert.strictEqual(r2.body.offset, 1000);
  assert.strictEqual(r2.body.resumed, true);
  const head = await fetch(s.url + '/up/v1/acme/uploads/' + r.body.id, { method: 'HEAD', headers: H() });
  assert.strictEqual(head.headers.get('upload-offset'), '1000');
  const skip = await put(s, r.body.id, 2000, Buffer.alloc(500));
  assert.strictEqual(skip.status, 409);
  assert.strictEqual(skip.body.offset, 1000);
  const replay = await put(s, r.body.id, 0, Buffer.alloc(1000));
  assert.strictEqual(replay.status, 409);
  assert.strictEqual(replay.body.offset, 1000);
  await put(s, r.body.id, 1000, Buffer.alloc(2000, 2));
  assert.strictEqual((await finish(s, r.body.id, '')).status, 200);
  await s.close();
});

test('an interrupted chunk is not kept: the file only grows by whole chunks', async () => {
  const s = await setup();
  const r = await create(s, { name: 'cut.mp4', size: 2000 });
  await new Promise((resolve) => {
    const rq = http.request(s.url + '/up/v1/acme/uploads/' + r.body.id + '?offset=0',
      { method: 'PUT', headers: { 'X-Monitor-Code': CODE, 'Content-Length': 2000 } });
    rq.on('error', () => resolve());
    rq.write(Buffer.alloc(900, 5));
    setTimeout(() => { rq.destroy(); setTimeout(resolve, 150); }, 100);
  });
  const st = await (await fetch(s.url + '/up/v1/acme/uploads/' + r.body.id, { headers: H() })).json();
  assert.strictEqual(st.offset, 0);
  await s.close();
});

test('finishing short of the declared size is refused and nothing reaches the inbox', async () => {
  const s = await setup();
  const r = await create(s, { name: 'short.mp4', size: 1000 });
  await put(s, r.body.id, 0, Buffer.alloc(600));
  const f = await finish(s, r.body.id, '');
  assert.strictEqual(f.status, 409);
  assert.strictEqual(f.body.error, 'size-mismatch');
  assert.strictEqual(f.body.offset, 600);
  assert.ok(!fs.existsSync(path.join(s.data, 'inbox', 'short.mp4')));
  assert.ok(!fs.existsSync(path.join(s.data, 'uploads', 'ready')));
  const over = await put(s, r.body.id, 600, Buffer.alloc(900));
  assert.strictEqual(over.status, 400);
  await s.close();
});

test('size limits: over 4GB, zero, junk, and a chunk over 16MB', async () => {
  const s = await setup();
  assert.strictEqual((await create(s, { name: 'x', size: 4 * 1024 * MB + 1 })).status, 413);
  assert.strictEqual((await create(s, { name: 'x', size: 0 })).status, 400);
  assert.strictEqual((await create(s, { name: 'x', size: 'big' })).status, 400);
  assert.strictEqual((await create(s, { name: 'x', size: 4 * 1024 * MB })).status, 201);
  const r = await create(s, { name: 'y', size: 40 * MB });
  const big = await put(s, r.body.id, 0, Buffer.alloc(17 * MB));
  assert.strictEqual(big.status, 413);
  const ok = await put(s, r.body.id, 0, Buffer.alloc(8 * MB));
  assert.strictEqual(ok.status, 200);
  await s.close();
});

test('disk guard: refuse when free space after the file would be under 10GB', async () => {
  const s = await setup();
  s.state.free = 10 * 1024 * MB + 500;
  assert.strictEqual((await create(s, { name: 'a', size: 400 })).status, 201);
  assert.strictEqual((await create(s, { name: 'b', size: 600 })).body.error, 'disk-low');
  await s.close();
});

test('tenant quota counts partial and finished uploads', async () => {
  const s = await setup({ quota: 1000 });
  const a = await create(s, { name: 'a', size: 600 });
  assert.strictEqual(a.status, 201);
  const b = await create(s, { name: 'b', size: 500 });
  assert.strictEqual(b.status, 507);
  assert.strictEqual(b.body.error, 'quota');
  await put(s, a.body.id, 0, Buffer.alloc(600));
  await finish(s, a.body.id, '');
  assert.strictEqual((await create(s, { name: 'c', size: 500 })).status, 507, 'finished file still counts');
  assert.strictEqual((await create(s, { name: 'd', size: 400 })).status, 201);
  await s.close();
});

test('rate limit: new uploads per hour and requests per minute', async () => {
  const s = await setup({ createMax: 3, rateMax: 12 });
  for (let i = 0; i < 3; i++) assert.strictEqual((await create(s, { name: 'f' + i, size: 5, key: 'k' + i })).status, 201);
  const r = await create(s, { name: 'f9', size: 5, key: 'k9' });
  assert.strictEqual(r.status, 429);
  for (let i = 0; i < 12; i++) await fetch(s.url + '/up/v1/acme/uploads/' + 'a'.repeat(32), { headers: H() });
  const h = await create(s, { name: 'x', size: 5 });
  assert.strictEqual(h.status, 429);
  await s.close();
});

test('CORS: only the tenant page origin, preflight needs no code', async () => {
  const s = await setup();
  const pre = await fetch(s.url + '/up/v1/acme/uploads/' + 'a'.repeat(32), { method: 'OPTIONS', headers: { Origin: ORIGIN } });
  assert.strictEqual(pre.status, 204);
  assert.strictEqual(pre.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(pre.headers.get('access-control-allow-headers'), /X-Monitor-Code/i);
  const evil = await fetch(s.url + '/up/v1/acme/uploads', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.strictEqual(evil.status, 403);
  assert.strictEqual(evil.headers.get('access-control-allow-origin'), null);
  const evil2 = await fetch(s.url + '/up/v1/acme/uploads', { method: 'POST', headers: Object.assign({ Origin: 'https://evil.example' }, H()), body: '{"name":"a","size":5}' });
  assert.strictEqual(evil2.status, 403);
  const good = await fetch(s.url + '/up/v1/acme/uploads', { method: 'POST', headers: Object.assign({ Origin: ORIGIN }, H()), body: '{"name":"a","size":5}' });
  assert.strictEqual(good.status, 201);
  assert.strictEqual(good.headers.get('access-control-allow-origin'), ORIGIN);
  await s.close();
});

test('cleanup: partials after 48h, finished big files after 7 days unless moved', async () => {
  const s = await setup();
  const p = await create(s, { name: 'p.mp4', size: 100 });
  const d = await create(s, { name: 'd.mp4', size: 3 });
  await put(s, d.body.id, 0, Buffer.from('abc'));
  await finish(s, d.body.id, '');
  const m = await create(s, { name: 'm.mp4', size: 3 });
  await put(s, m.body.id, 0, Buffer.from('abc'));
  await finish(s, m.body.id, '');
  fs.unlinkSync(path.join(s.data, 'inbox', 'm.mp4'));
  fs.writeFileSync(path.join(s.data, 'inbox', 'm.mp4'), 'other file here');
  const stale = Date.now() + 47 * 3600 * 1000;
  s.state.t = stale;
  assert.deepStrictEqual(s.up.sweep(), { partial: 0, finished: 0 });
  s.state.t = stale + 2 * 3600 * 1000;
  assert.deepStrictEqual(s.up.sweep(), { partial: 1, finished: 0 });
  assert.ok(!fs.existsSync(path.join(s.base, 'stage', 'acme', p.body.id + '.part')));
  assert.ok(fs.existsSync(path.join(s.data, 'inbox', 'd.mp4')));
  s.state.t = Date.now() + 8 * 24 * 3600 * 1000;
  assert.deepStrictEqual(s.up.sweep(), { partial: 0, finished: 1 });
  assert.ok(!fs.existsSync(path.join(s.data, 'inbox', 'd.mp4')));
  assert.strictEqual(fs.readFileSync(path.join(s.data, 'inbox', 'm.mp4'), 'utf8'), 'other file here');
  await s.close();
});

test('the page sends files over 15MB to the upload path and keeps small ones on ntfy', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
  const a = src.indexOf('function splitSend(list){');
  const b = src.indexOf('function bigKey(f)');
  assert.ok(a > 0 && b > a, 'splitSend is in the page');
  const mk = (url) => new Function('UPURL', 'BIGF', 'QMAX', src.slice(a, b) + '; return splitSend;')(url, 15 * MB, 18 * MB);
  const f = (n, mb) => ({ name: n, size: mb * MB });
  const on = mk('https://x/up');
  let r = on([f('a', 2), f('b', 300), f('c', 15), f('d', 16)]);
  assert.deepStrictEqual(r.small.map((x) => x.name), ['a', 'c']);
  assert.deepStrictEqual(r.big.map((x) => x.name), ['b', 'd']);
  // three 12MB files pass the 18MB ntfy ceiling together: the largest move over
  r = on([f('p', 12), f('q', 13), f('s', 11)]);
  assert.deepStrictEqual(r.big.map((x) => x.name), ['q', 'p']);
  assert.deepStrictEqual(r.small.map((x) => x.name), ['s']);
  // no uploadUrl: everything stays on the old path
  r = mk('')([f('b', 300)]);
  assert.strictEqual(r.big.length, 0);
  assert.strictEqual(r.small.length, 1);
});

test('a recording ntfy refuses (its 20MB per 3h quota) goes to our server instead', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
  const a = src.indexOf('function sendSmall(files,note){');
  const b = src.indexOf('function sendAll(list,note){');
  assert.ok(a > 0 && b > a, 'sendSmall is in the page');
  const mk = (url, ntfy, server) => new Function('UPURL', 'sendFiles', 'sendBigs',
    src.slice(a, b) + '; return sendSmall;')(url, ntfy, server);
  const voice = { name: 'voice-1.webm', size: 200000 };
  const pic = { name: 'p.png', size: 900000 };
  const refuseAll = (files) => { const e = new Error('הקובץ לא הגיע שלם'); e.notSent = files.map((f) => f.name); return Promise.reject(e); };
  let got = null;
  const serverOk = (files, note, quiet) => { got = { names: files.map((f) => f.name), note, quiet }; return Promise.resolve({ names: [], unreachable: false, msg: '' }); };
  // all refused on ntfy: the whole send, caption included, goes to the server quietly
  assert.strictEqual(await mk('https://x/up', refuseAll, serverOk)([voice], 'הודעה קולית'), 'ok');
  assert.deepStrictEqual(got, { names: ['voice-1.webm'], note: 'הודעה קולית', quiet: true });
  // some refused: only those follow
  got = null;
  const refuseOne = () => { const e = new Error('partial'); e.failed = ['p.png']; return Promise.reject(e); };
  assert.strictEqual(await mk('https://x/up', refuseOne, serverOk)([voice, pic], 'x'), 'ok');
  assert.deepStrictEqual(got.names, ['p.png']);
  // the server fails too: the original error, so the screen still says to record again
  const serverBad = (files) => Promise.resolve({ names: files.map((f) => f.name), unreachable: true, msg: '' });
  await assert.rejects(mk('https://x/up', refuseAll, serverBad)([voice], 'x'), (e) => e.notSent && e.message === 'הקובץ לא הגיע שלם');
  // a caption failure (no file list) is not retried: the files did arrive
  got = null;
  const capFail = () => Promise.reject(new Error('quota'));
  await assert.rejects(mk('https://x/up', capFail, serverOk)([voice], 'x'), /quota/);
  assert.strictEqual(got, null);
  // no uploadUrl: exactly the old path
  await assert.rejects(mk('', refuseAll, serverOk)([voice], 'x'), (e) => !!e.notSent);
  assert.strictEqual(got, null);
});
