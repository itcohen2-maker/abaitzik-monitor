'use strict';
/*
  The PC queue over HTTPS (14.10.2026).

  Itzik, at Rinat's computer: "אני רוצה שהמוניטור והקלוד שלי יהיו המוח והקלוד
  שלה רק יעבוד". His own PC reaches the queue in pc-task.js over ssh with the
  server's root key. A customer's computer gets none of that: it is a company
  machine without admin, behind an IT department that may well block port 22,
  and it must never hold a key to the server. So the same queue is offered a
  second way, on the one port every office lets through: the customer's own
  upload service (upload.js, as that customer's user, behind Caddy on 443)
  answers four small routes, and the computer talks to them with a long
  random key of its own.

    GET  /up/v1/<tenant>/pc/next          claims the oldest waiting task (204 when none)
    POST /up/v1/<tenant>/pc/done/<id>     the answer in the body, goes to the chat
    POST /up/v1/<tenant>/pc/fail/<id>     the reason in the body
    POST /up/v1/<tenant>/pc/usage/<id>    the session's token line, JSON

  Each one is exactly `node pc-task.js <cmd> [id]` in the tenant folder, with the
  body on stdin, so the records, the thread reply, the push and the heartbeat
  are the same code Itzik's PC exercises every minute. The key is `pcKey` in
  data/keys.json (setup/enable-pc.sh writes it); without one, every call is
  404 and nothing is claimable. The header is X-Pc-Key. Wrong key: 401, and
  after ten wrong tries from one address, 429 for ten minutes.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const TENANT_RE = /^[a-z0-9_-]{1,32}$/;
const ID_RE = /^pc-[a-z0-9]{6,16}-[a-z0-9]{4}$/;
const MAX_BODY = 64 * 1024;

function same(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// cfg: { name, dir, dataPath, log, run? }. run(cmd, id, input) -> Promise<{code,out,err}>
function pcApi(cfg) {
  const log = cfg.log || (() => {});
  const fails = new Map();                 // ip -> { n, until }
  let cachedKey = null, cachedAt = 0;

  function key() {
    if (Date.now() - cachedAt > 10000) {
      try { cachedKey = String(JSON.parse(fs.readFileSync(path.join(cfg.dataPath, 'keys.json'), 'utf8')).pcKey || '') || null; }
      catch (e) { cachedKey = null; }
      cachedAt = Date.now();
    }
    return cachedKey;
  }
  const run = cfg.run || function (cmd, id, input) {
    return new Promise((resolve) => {
      const args = [path.join(cfg.dir, 'pc-task.js'), cmd].concat(id ? [id] : []);
      const c = execFile(process.execPath, args, { cwd: cfg.dir, timeout: 60 * 1000, maxBuffer: 1 << 20 },
        (err, out, errOut) => resolve({ code: err ? (err.code || 1) : 0, out: String(out || ''), err: String(errOut || '') }));
      try { c.stdin.end(input || '', 'utf8'); } catch (e) {}
    });
  };
  function ip(req) {
    const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return f || (req.socket && req.socket.remoteAddress) || '?';
  }
  function send(res, code, body) {
    const b = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
    res.writeHead(code, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(b), 'Cache-Control': 'no-store' });
    res.end(b);
  }
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let n = 0; const chunks = [];
      req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('too-big')); req.destroy(); return; } chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  // Returns true when the request was one of ours (answered), false to let the caller go on.
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.split('/').filter(Boolean);        // up v1 <tenant> pc <cmd> [id]
    if (p[0] !== 'up' || p[1] !== 'v1' || p[3] !== 'pc') return false;
    if (!TENANT_RE.test(p[2] || '') || p[2] !== cfg.name) { send(res, 404, 'not-found'); return true; }
    const real = key();
    if (!real || real.length < 16) { req.resume(); send(res, 404, 'not-found'); return true; }
    const who = ip(req);
    const f = fails.get(who);
    if (f && f.until > Date.now()) { req.resume(); send(res, 429, 'locked'); return true; }
    if (!same(req.headers['x-pc-key'], real)) {
      const n = (f && f.n || 0) + 1;
      fails.set(who, { n, until: n >= 10 ? Date.now() + 10 * 60 * 1000 : 0 });
      log('pc auth-fail ip ' + who);
      req.resume(); send(res, 401, 'bad-key'); return true;
    }
    fails.delete(who);
    const cmd = p[4], id = p[5];
    if (cmd === 'next' && p.length === 5) {
      if (req.method !== 'GET') { send(res, 405, 'method'); return true; }
      const r = await run('next', '', '');
      if (r.code !== 0) { log('pc next failed: ' + r.err.trim().slice(-200)); send(res, 500, 'queue'); return true; }
      const line = r.out.trim();
      if (!line) { send(res, 204); return true; }
      log('pc task handed to ' + who + ': ' + line.slice(0, 80));
      send(res, 200, line);
      return true;
    }
    if ((cmd === 'done' || cmd === 'fail' || cmd === 'usage') && p.length === 6) {
      if (req.method !== 'POST') { req.resume(); send(res, 405, 'method'); return true; }
      if (!ID_RE.test(String(id))) { req.resume(); send(res, 404, 'no-such-task'); return true; }
      let body;
      try { body = await readBody(req); } catch (e) { send(res, 413, 'too-big'); return true; }
      const r = await run(cmd, id, body);
      log('pc ' + cmd + ' ' + id + ' -> ' + (r.code === 0 ? 'ok' : 'code ' + r.code + ' ' + r.err.trim().slice(-120)));
      if (r.code !== 0) { send(res, 500, (r.err || 'failed').trim().slice(-300)); return true; }
      send(res, 200, r.out.trim() || 'ok');
      return true;
    }
    send(res, 404, 'not-found');
    return true;
  }
  return { handle, key };
}

module.exports = { pcApi, same };
