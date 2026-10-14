'use strict';
// The PC queue over HTTPS (lib/pc-api.js): a customer's computer claims and
// answers tasks through its upload service with a long key, never with ssh.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pcApi } = require('../lib/pc-api.js');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pcapi-'));
  fs.writeFileSync(path.join(d, 'keys.json'), JSON.stringify({ pcKey: 'a'.repeat(32) }));
  return d;
}
async function serve(api) {
  const server = http.createServer((req, res) => {
    api.handle(req, res).then((done) => { if (!done) { res.writeHead(404); res.end('fallthrough'); } });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, p, body, key) => {
    const r = await fetch(base + p, { method, body, headers: Object.assign({}, key ? { 'X-Pc-Key': key } : {}) });
    return { status: r.status, text: await r.text() };
  };
  return { server, call };
}

test('pc api: wrong key is refused, right key hands out the next task, done posts the body', async () => {
  const calls = [];
  const dataPath = tmp();
  const api = pcApi({ name: 'rinat', dir: '/x', dataPath, log: () => {},
    run: async (cmd, id, input) => { calls.push([cmd, id, input]); return { code: 0, out: cmd === 'next' ? '{"id":"pc-abc123-zzzz","task":"t"}' : 'ok', err: '' }; } });
  const { server, call } = await serve(api);
  try {
    assert.equal((await call('GET', '/up/v1/rinat/pc/next')).status, 401);
    assert.equal((await call('GET', '/up/v1/rinat/pc/next', undefined, 'b'.repeat(32))).status, 401);
    assert.equal((await call('GET', '/up/v1/other/pc/next', undefined, 'a'.repeat(32))).status, 404);
    assert.equal((await call('GET', '/up/v1/rinat/pc/ping', undefined, 'a'.repeat(32))).status, 200);
    assert.equal((await call('GET', '/up/v1/rinat/pc/ping?step=' + encodeURIComponent('start PC'), undefined, 'a'.repeat(32))).status, 200);
    assert.equal(calls.length, 0);
    const n = await call('GET', '/up/v1/rinat/pc/next', undefined, 'a'.repeat(32));
    assert.equal(n.status, 200);
    assert.equal(JSON.parse(n.text).id, 'pc-abc123-zzzz');
    const d = await call('POST', '/up/v1/rinat/pc/done/pc-abc123-zzzz', 'התשובה', 'a'.repeat(32));
    assert.equal(d.status, 200);
    assert.deepEqual(calls[1], ['done', 'pc-abc123-zzzz', 'התשובה']);
    assert.equal((await call('POST', '/up/v1/rinat/pc/done/../../etc', 'x', 'a'.repeat(32))).status, 404);
    assert.equal((await call('GET', '/up/v1/rinat/uploads', undefined, 'a'.repeat(32))).text, 'fallthrough');
  } finally { server.close(); }
});

test('pc api: no key in keys.json means the queue does not exist', async () => {
  const dataPath = tmp();
  fs.writeFileSync(path.join(dataPath, 'keys.json'), '{}');
  const api = pcApi({ name: 'rinat', dir: '/x', dataPath, log: () => {}, run: async () => ({ code: 0, out: '', err: '' }) });
  const { server, call } = await serve(api);
  try {
    assert.equal((await call('GET', '/up/v1/rinat/pc/next', undefined, 'a'.repeat(32))).status, 404);
  } finally { server.close(); }
});

test('pc api: an empty queue is 204 and ten wrong keys lock the address', async () => {
  const dataPath = tmp();
  const api = pcApi({ name: 'rinat', dir: '/x', dataPath, log: () => {}, run: async () => ({ code: 0, out: '', err: '' }) });
  const { server, call } = await serve(api);
  try {
    assert.equal((await call('GET', '/up/v1/rinat/pc/next', undefined, 'a'.repeat(32))).status, 204);
    for (let i = 0; i < 10; i++) await call('GET', '/up/v1/rinat/pc/next', undefined, 'x');
    assert.equal((await call('GET', '/up/v1/rinat/pc/next', undefined, 'a'.repeat(32))).status, 429);
  } finally { server.close(); }
});

test('pc api: a file from the computer lands in files-private/pc-out with a safe name', async () => {
  const dataPath = tmp();
  const api = pcApi({ name: 'rinat', dir: '/x', dataPath, log: () => {}, run: async () => ({ code: 0, out: '', err: '' }) });
  const { server, call } = await serve(api);
  try {
    const r = await call('POST', '/up/v1/rinat/pc/file/pc-abc123-zzzz?name=' + encodeURIComponent('../וילון.jpg'), 'IMG', 'a'.repeat(32));
    assert.equal(r.status, 200);
    assert.equal(r.text, 'files/pc-out/וילון.jpg');
    assert.equal(fs.readFileSync(path.join(dataPath, 'files-private', 'pc-out', 'וילון.jpg'), 'utf8'), 'IMG');
    const r2 = await call('POST', '/up/v1/rinat/pc/file/pc-abc123-zzzz?name=' + encodeURIComponent('וילון.jpg'), 'B', 'a'.repeat(32));
    assert.equal(r2.text, 'files/pc-out/וילון-2.jpg');
  } finally { server.close(); }
});
