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

    GET  /up/v1/<tenant>/pc/ping          200 when the key is right, claims nothing
    GET  /up/v1/<tenant>/pc/next          claims the oldest waiting task (204 when none)
    POST /up/v1/<tenant>/pc/done/<id>     the answer in the body, goes to the chat
    POST /up/v1/<tenant>/pc/fail/<id>     the reason in the body
    POST /up/v1/<tenant>/pc/usage/<id>    the session's token line, JSON
    POST /up/v1/<tenant>/pc/file/<id>?name=<n>   a file the computer made, up to 300MB

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
const MAX_ANSWER_BODY = 2 * 1024 * 1024;   // done and fail: the answer is cut in pc-task.js, never refused here
const MAX_FILE = 300 * 1024 * 1024;

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
  function readBody(req, max) {
    const limit = max || MAX_BODY;
    return new Promise((resolve, reject) => {
      let n = 0, over = false; const chunks = [];
      // 15.10: over the limit the body is drained and answered 413, not cut off mid stream:
      // a destroyed socket reached the computer as a bare 502 that its log never explained.
      req.on('data', (c) => {
        n += c.length;
        if (n > limit) { over = true; chunks.length = 0; if (n > 4 * limit) { reject(new Error('too-big')); req.destroy(); } return; }
        chunks.push(c);
      });
      req.on('end', () => (over ? reject(new Error('too-big')) : resolve(Buffer.concat(chunks).toString('utf8'))));
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
    // ping: the key is right and the queue exists, nothing is claimed (setup/enable-pc.sh checks with this).
    if (cmd === 'ping' && p.length === 5) {
      // 14.10: the installer reports each step here (?step=...), so a failed install on a
      // customer's computer is visible in the log without a screenshot.
      const step = String(url.searchParams.get('step') || '').replace(/\s+/g, ' ').slice(0, 400);
      log('pc ping from ' + who + (step ? ' step: ' + step : ''));
      send(res, 200, { ok: true, name: cfg.name }); return true;
    }
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
    /*
      14.10, Rinat: every file she asks for comes back as a download button. A file
      the computer made is posted here (?name=), lands in files-private/pc-out/,
      and the answer names it as files/pc-out/<name>, which the page turns into
      the picture and the download button once pc-task.js done builds the page.
    */
    /*
      14.10: the computer could not open a monitor file ("הקישורים מהמוניטור לא נגישים
      מכאן"), so a task that said "save the research PDF to the folder" failed. list
      gives the names in files-private; get?name= sends one, only from inside it.
    */
    // 14.10: the computer updates its own script from here once an hour, so a fix
    // reaches the customer's computer without another install.
    if (cmd === 'self' && p.length === 5) {
      let b;
      try { b = fs.readFileSync(path.join(cfg.dir, 'pc', 'pc-pull.ps1')); } catch (e) { send(res, 404, 'not-found'); return true; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': b.length, 'Cache-Control': 'no-store' });
      res.end(b);
      return true;
    }
    if (cmd === 'list' && p.length === 5) {
      const root = path.join(cfg.dataPath, 'files-private');
      const out = [];
      (function walk(d, rel) {
        let es = [];
        try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
        es.forEach((e) => {
          if (e.name.startsWith('.') || (rel === '' && e.name === 'pc')) return;
          if (e.isDirectory()) walk(path.join(d, e.name), rel + e.name + '/');
          else out.push(rel + e.name);
        });
      })(root, '');
      send(res, 200, out);
      return true;
    }
    if (cmd === 'get' && p.length === 5) {
      const root = path.resolve(cfg.dataPath, 'files-private');
      const want = path.resolve(root, String(url.searchParams.get('name') || ''));
      if (!want.startsWith(root + path.sep) || want.startsWith(path.join(root, 'pc') + path.sep) || /[\/]\./.test(want.slice(root.length))) { send(res, 404, 'not-found'); return true; }
      let st;
      try { st = fs.statSync(want); } catch (e) { send(res, 404, 'not-found'); return true; }
      if (!st.isFile()) { send(res, 404, 'not-found'); return true; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(want).pipe(res);
      log('pc get ' + path.relative(root, want));
      return true;
    }
    if (cmd === 'file' && p.length === 6) {
      if (req.method !== 'POST') { req.resume(); send(res, 405, 'method'); return true; }
      if (!ID_RE.test(String(id))) { req.resume(); send(res, 404, 'no-such-task'); return true; }
      const raw = String(url.searchParams.get('name') || '');
      const name = path.basename(raw.split('\\').join('/')).replace(/[\x00-\x1f<>:"\/\\|?*]+/g, '_').replace(/^\.+/, '').slice(0, 120);
      if (!name) { req.resume(); send(res, 400, 'no-name'); return true; }
      // 14.10: each task's files in a folder of their own, so a collection of hundreds stays apart.
      const dir = path.join(cfg.dataPath, 'files-private', 'pc-out', String(id));
      fs.mkdirSync(dir, { recursive: true });
      let final = name, n = 1;
      while (fs.existsSync(path.join(dir, final))) { const e = path.extname(name); final = path.basename(name, e) + '-' + (++n) + e; }
      const tmp = path.join(dir, '.' + final + '.part');
      let size = 0, over = false;
      const out = fs.createWriteStream(tmp);
      await new Promise((resolve) => {
        req.on('data', (c) => { size += c.length; if (size > MAX_FILE) { over = true; req.destroy(); } });
        req.pipe(out);
        out.on('finish', resolve); out.on('error', resolve); req.on('close', () => { if (over) { out.destroy(); resolve(); } });
      });
      if (over) { try { fs.unlinkSync(tmp); } catch (e) {} send(res, 413, 'too-big'); return true; }
      fs.renameSync(tmp, path.join(dir, final));
      log('pc file ' + id + ' ' + final + ' ' + size + ' bytes');
      send(res, 200, 'files/pc-out/' + id + '/' + final);
      return true;
    }
    // 14.10, Itzik: "בדקת מה מכסת המנוי שלה". The computer reads its own subscription meter
    // (pc-pull.ps1, the same call Itzik's PC makes) and hands it here, to subscription.json.
    if (cmd === 'sub' && p.length === 5) {
      if (req.method !== 'POST') { req.resume(); send(res, 405, 'method'); return true; }
      let body; try { body = await readBody(req); } catch (e) { send(res, 413, 'too-big'); return true; }
      const r = await run('sub', '', body);
      send(res, r.code === 0 ? 200 : 500, (r.out || r.err).trim().slice(-200));
      return true;
    }
    if ((cmd === 'done' || cmd === 'fail' || cmd === 'usage') && p.length === 6) {
      if (req.method !== 'POST') { req.resume(); send(res, 405, 'method'); return true; }
      if (!ID_RE.test(String(id))) { req.resume(); send(res, 404, 'no-such-task'); return true; }
      let body;
      // 15.10: a done body of 1,025 file lines (76KB) was dropped at 64KB without a log line,
      // twice, and the task hung "claimed" for hours. An answer may be long; pc-task.js cuts it.
      try { body = await readBody(req, cmd === 'usage' ? MAX_BODY : MAX_ANSWER_BODY); }
      catch (e) { log('pc ' + cmd + ' ' + id + ' refused: body over ' + (cmd === 'usage' ? MAX_BODY : MAX_ANSWER_BODY) + ' bytes'); send(res, 413, 'too-big'); return true; }
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
