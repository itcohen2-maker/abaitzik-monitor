'use strict';
/*
  Big file uploads, 11.10.2026. Itzik approved a direct path for files over 15MB
  from the phone (iPhone Safari) to this server, because ntfy.sh takes 2MB a
  file and 20MB in three hours, and a 300MB video had nowhere to go but
  WeTransfer.

  A small resumable protocol of our own, over plain HTTPS, no dependencies:

    POST   /up/v1/<tenant>/uploads              {name,size,type,key,lastModified}
           -> {id, offset, size}   (the same key resumes the same upload)
    GET|HEAD /up/v1/<tenant>/uploads/<id>        -> {offset, size}
    PUT|PATCH /up/v1/<tenant>/uploads/<id>?offset=N   body = the next chunk
           -> {offset}             (409 {offset} when N is not where the server is)
    POST   /up/v1/<tenant>/uploads/<id>/finish   {caption}
           -> {ok, name}           (size verified, file moved to the inbox,
                                    a "ready" note left for the listener)
    DELETE /up/v1/<tenant>/uploads/<id>          abandon
    GET    /up/v1/health                         no auth

  Every call except health and the CORS preflight carries the personal code in
  the X-Monitor-Code header. It is the same code listen.js checks on a message
  (data/owner-code.txt). A tenant without that file is refused here, where the
  listener would let it through: a 4GB write must never be open to the world.

  The service does not write the chat record. It leaves
  <data>/uploads/ready/<id>.json and the listener, which already builds the
  page and starts the worker, turns it into the chat line exactly as it does for
  a file that came through ntfy. See pollUploads in listen.js.

  Nothing here ever logs the code.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const ID_RE = /^[0-9a-f]{32}$/;
const TENANT_RE = /^[a-z0-9_-]{1,32}$/;

const DEFAULTS = {
  maxBytes: 4 * GB,
  chunkMax: 16 * MB,          // the page sends 8MB; anything over 16MB is refused
  minFree: 10 * GB,           // refuse a new upload if free space would fall under this
  quota: 20 * GB,             // per tenant: partial uploads plus finished files not yet expired
  maxActive: 20,              // partial uploads at once, per tenant
  partialTtl: 48 * 3600 * 1000,
  finishedTtl: 30 * 24 * 3600 * 1000,
  rateWindow: 60 * 1000,
  rateMax: 1200,              // requests per IP per minute (an 8MB chunk each is 9GB a minute)
  createMax: 30,              // new uploads per IP per hour
  failMax: 10,                // wrong codes per IP per ten minutes
  failWindow: 10 * 60 * 1000,
};

function sanitizeName(raw) {
  let n = String(raw == null ? '' : raw);
  n = n.split(/[\\/]/).pop();
  n = n.replace(/[\u0000-\u001f\u007f<>:"|?*‪-‮⁦-⁩]/g, '_');
  n = n.replace(/\s+/g, ' ').trim().replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  // The listener joins "name.partNofK" slices; a finished file must not look like one.
  n = n.replace(/\.part(\d+)of(\d+)$/i, '_part$1of$2');
  if (n.length > 120) {
    const ext = path.extname(n).slice(0, 12);
    n = n.slice(0, 120 - ext.length) + ext;
  }
  return n || 'file';
}

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function writeJsonAtomic(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(v, null, 1), 'utf8');
  fs.renameSync(tmp, p);
}

function sha(s) { return crypto.createHash('sha256').update(String(s)).digest(); }
function codeMatches(given, real) {
  // Hash both sides so the length of the real code never leaks and the compare is constant time.
  return crypto.timingSafeEqual(sha(given), sha(real));
}

/*
  cfg.tenants: { name: { dataPath, origins:[...], code: fn()->string|null } }
  cfg.root: staging folder (partial uploads live in <root>/<tenant>/)
*/
function createUploadServer(cfg) {
  const o = Object.assign({}, DEFAULTS, cfg);
  const now = o.now || (() => Date.now());
  const log = o.log || ((l) => console.log(new Date(now()).toISOString() + '  ' + l));
  const freeBytes = o.freeBytes || (() => { const s = fs.statfsSync(o.root); return s.bavail * s.bsize; });
  const tenants = o.tenants;
  const busy = new Set();
  const rate = new Map();      // ip -> {t, n}
  const creates = new Map();   // ip -> [times]
  const fails = new Map();     // ip -> [times]

  fs.mkdirSync(o.root, { recursive: true });

  const dirOf = (t) => path.join(o.root, t);
  const partOf = (t, id) => path.join(dirOf(t), id + '.part');
  const metaOf = (t, id) => path.join(dirOf(t), id + '.json');
  const finishedFile = (t) => path.join(dirOf(t), 'finished.json');
  const readyDir = (t) => path.join(tenants[t].dataPath, 'uploads', 'ready');
  const inboxDir = (t) => path.join(tenants[t].dataPath, 'inbox');

  function send(res, status, body, extra) {
    const buf = Buffer.from(JSON.stringify(body));
    const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, res._cors || {}, extra || {});
    res.writeHead(status, h);
    res.end(buf);
  }
  const fail = (res, status, error, extra) => send(res, status, Object.assign({ error }, extra || {}));

  function clientIp(req) {
    // Caddy is the only thing that can reach 127.0.0.1:8791 and it sets this header itself.
    const x = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return x || req.socket.remoteAddress || '?';
  }
  function prune(list, win) { const t = now(); while (list.length && t - list[0] > win) list.shift(); return list; }
  function overRate(ip) {
    const t = now();
    let r = rate.get(ip);
    if (!r || t - r.t > o.rateWindow) { r = { t, n: 0 }; rate.set(ip, r); }
    r.n++;
    if (rate.size > 5000) { for (const [k, v] of rate) if (t - v.t > o.rateWindow) rate.delete(k); }
    return r.n > o.rateMax;
  }
  function blocked(ip) { return prune(fails.get(ip) || [], o.failWindow).length >= o.failMax; }
  function noteFail(ip) { const l = fails.get(ip) || []; l.push(now()); fails.set(ip, l); }

  function readBody(req, max) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0; let done = false;
      req.on('data', (c) => {
        if (done) return;
        n += c.length;
        if (n > max) { done = true; reject(Object.assign(new Error('too big'), { code: 'TOO_BIG' })); return; }
        chunks.push(c);
      });
      req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
      req.on('aborted', () => { if (!done) { done = true; reject(Object.assign(new Error('aborted'), { code: 'ABORTED' })); } });
      req.on('error', (e) => { if (!done) { done = true; reject(e); } });
    });
  }

  function activeUploads(t) {
    let names = [];
    try { names = fs.readdirSync(dirOf(t)); } catch (e) { return []; }
    return names.filter((f) => /^[0-9a-f]{32}\.json$/.test(f))
      .map((f) => readJson(path.join(dirOf(t), f), null)).filter((m) => m && !m.done);
  }
  function usedBytes(t) {
    let n = 0;
    activeUploads(t).forEach((m) => { n += m.size; });
    (readJson(finishedFile(t), []) || []).forEach((f) => { n += f.size || 0; });
    return n;
  }
  function offsetOf(t, id) { try { return fs.statSync(partOf(t, id)).size; } catch (e) { return 0; } }

  async function handleCreate(req, res, t, ip) {
    let body;
    try { body = JSON.parse((await readBody(req, 8192)).toString('utf8') || '{}'); }
    catch (e) { return fail(res, 400, 'bad-json'); }
    const size = body.size;
    if (!Number.isSafeInteger(size) || size < 1) return fail(res, 400, 'bad-size');
    if (size > o.maxBytes) return fail(res, 413, 'too-big', { max: o.maxBytes });
    const name = sanitizeName(body.name);
    const key = String(body.key || '').slice(0, 300);
    const type = String(body.type || '').slice(0, 100);

    // The same file picked again resumes the same upload.
    if (key) {
      const hit = activeUploads(t).find((m) => m.key === key && m.size === size);
      if (hit) {
        log('resume ' + t + ' ' + hit.id + ' at ' + offsetOf(t, hit.id) + ' ip ' + ip);
        return send(res, 200, { id: hit.id, offset: offsetOf(t, hit.id), size, resumed: true });
      }
    }
    const list = creates.get(ip) || [];
    if (prune(list, 3600 * 1000).length >= o.createMax) return fail(res, 429, 'too-many-uploads');
    if (activeUploads(t).length >= o.maxActive) return fail(res, 429, 'too-many-active');
    if (usedBytes(t) + size > o.quota) return fail(res, 507, 'quota', { quota: o.quota });
    if (freeBytes() - size < o.minFree) return fail(res, 507, 'disk-low');

    const id = crypto.randomBytes(16).toString('hex');
    const meta = { id, tenant: t, name, size, type, key, createdAt: new Date(now()).toISOString() };
    fs.mkdirSync(dirOf(t), { recursive: true });
    fs.writeFileSync(partOf(t, id), '');
    writeJsonAtomic(metaOf(t, id), meta);
    list.push(now()); creates.set(ip, list);
    log('create ' + t + ' ' + id + ' ' + size + ' bytes ip ' + ip);
    return send(res, 201, { id, offset: 0, size });
  }

  function loadMeta(t, id) {
    if (!ID_RE.test(id)) return null;
    const m = readJson(metaOf(t, id), null);
    return m && m.tenant === t && m.id === id ? m : null;
  }

  async function handleChunk(req, res, t, id, url, ip) {
    const m = loadMeta(t, id);
    if (!m || m.done) return fail(res, 404, 'no-such-upload');
    if (busy.has(id)) return fail(res, 409, 'busy', { offset: offsetOf(t, id) });
    const len = Number(req.headers['content-length']);
    if (!Number.isSafeInteger(len) || len < 1) return fail(res, 411, 'length-required');
    if (len > o.chunkMax) { req.resume(); return fail(res, 413, 'chunk-too-big', { max: o.chunkMax }); }
    const want = url.searchParams.get('offset') != null ? url.searchParams.get('offset') : req.headers['upload-offset'];
    const off = Number(want);
    if (want == null || !Number.isSafeInteger(off) || off < 0) { req.resume(); return fail(res, 400, 'bad-offset'); }
    busy.add(id);
    try {
      const have = offsetOf(t, id);
      if (off !== have) { req.resume(); return fail(res, 409, 'offset', { offset: have }); }
      if (off + len > m.size) { req.resume(); return fail(res, 400, 'past-end', { offset: have }); }
      let buf;
      try { buf = await readBody(req, o.chunkMax); }
      catch (e) { log('chunk-aborted ' + t + ' ' + id + ' at ' + off + ' ip ' + ip); return; }
      if (buf.length !== len) return fail(res, 400, 'short-body', { offset: have });
      // Written at its offset, whole or not at all: a connection that dies
      // mid-chunk never reaches this line, so the file only ever grows by full chunks.
      const fd = fs.openSync(partOf(t, id), 'r+');
      try { fs.writeSync(fd, buf, 0, buf.length, off); } finally { fs.closeSync(fd); }
      const now2 = offsetOf(t, id);
      return send(res, 200, { offset: now2, size: m.size });
    } finally { busy.delete(id); }
  }

  function uniqueInboxName(t, name) {
    const dir = inboxDir(t);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
    for (let i = 1; i < 1000; i++) {
      const cand = i === 1 ? name : base + '-' + i + ext;
      if (!fs.existsSync(path.join(dir, cand))) return cand;
    }
    return base + '-' + crypto.randomBytes(3).toString('hex') + ext;
  }
  function moveNoOverwrite(from, to) {
    try { fs.linkSync(from, to); fs.unlinkSync(from); return; }
    catch (e) {
      if (e.code === 'EEXIST') throw e;
      // Another filesystem: copy, never overwrite, then drop the staging file.
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      fs.unlinkSync(from);
    }
  }

  async function handleFinish(req, res, t, id, ip) {
    const m = loadMeta(t, id);
    if (!m) return fail(res, 404, 'no-such-upload');
    let body = {};
    try { const b = (await readBody(req, 8192)).toString('utf8'); body = b ? JSON.parse(b) : {}; }
    catch (e) { return fail(res, 400, 'bad-json'); }
    if (m.done) return send(res, 200, { ok: true, name: m.finalName, again: true });
    if (busy.has(id)) return fail(res, 409, 'busy', { offset: offsetOf(t, id) });
    busy.add(id);
    try {
      const have = offsetOf(t, id);
      if (have !== m.size) return fail(res, 409, 'size-mismatch', { offset: have, size: m.size });
      let finalName = null;
      for (let tries = 0; tries < 5 && !finalName; tries++) {
        const cand = uniqueInboxName(t, m.name);
        try { moveNoOverwrite(partOf(t, id), path.join(inboxDir(t), cand)); finalName = cand; }
        catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
      if (!finalName) return fail(res, 500, 'cannot-place');
      try { fs.chmodSync(path.join(inboxDir(t), finalName), 0o644); } catch (e) {}
      const at = new Date(now()).toISOString();
      const fin = readJson(finishedFile(t), []) || [];
      fin.push({ id, name: finalName, size: m.size, at });
      writeJsonAtomic(finishedFile(t), fin);
      writeJsonAtomic(metaOf(t, id), Object.assign({}, m, { done: true, finalName, finishedAt: at }));
      const caption = String(body.caption || '').slice(0, 2000);
      writeJsonAtomic(path.join(readyDir(t), id + '.json'),
        { id, tenant: t, name: finalName, size: m.size, type: m.type, caption, at });
      log('finish ' + t + ' ' + id + ' ' + m.size + ' bytes as ' + finalName.length + ' char name ip ' + ip);
      return send(res, 200, { ok: true, name: finalName });
    } finally { busy.delete(id); }
  }

  function handleAbandon(res, t, id) {
    const m = loadMeta(t, id);
    if (!m || m.done) return fail(res, 404, 'no-such-upload');
    try { fs.unlinkSync(partOf(t, id)); } catch (e) {}
    try { fs.unlinkSync(metaOf(t, id)); } catch (e) {}
    log('abandon ' + t + ' ' + id);
    return send(res, 200, { ok: true });
  }

  function cors(req, res, t) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (!tenants[t] || !(tenants[t].origins || []).includes(origin)) return false;
    res._cors = {
      'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Monitor-Code, Content-Type, Upload-Offset',
      'Access-Control-Expose-Headers': 'Upload-Offset',
      'Access-Control-Max-Age': '86400',
    };
    return true;
  }

  async function route(req, res) {
    const ip = clientIp(req);
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);       // up v1 <tenant> uploads [id] [finish]
    if (parts[0] !== 'up' || parts[1] !== 'v1') return fail(res, 404, 'not-found');
    if (parts[2] === 'health' && parts.length === 3) {
      return send(res, 200, { ok: true, disk: freeBytes() - o.minFree > 0 });
    }
    const t = parts[2];
    if (!t || !TENANT_RE.test(t) || !Object.prototype.hasOwnProperty.call(tenants, t) || parts[3] !== 'uploads') return fail(res, 404, 'not-found');
    if (!cors(req, res, t)) return fail(res, 403, 'origin');
    if (req.method === 'OPTIONS') { res.writeHead(204, Object.assign({ 'Cache-Control': 'no-store' }, res._cors || {})); return res.end(); }
    if (overRate(ip)) { req.resume(); return fail(res, 429, 'rate'); }
    if (blocked(ip)) { req.resume(); return fail(res, 429, 'locked'); }

    // The code, before anything is read from the body or touched on disk.
    const real = tenants[t].code();
    if (!real || !/^[0-9]{3,8}$/.test(real)) { req.resume(); return fail(res, 503, 'no-code-set'); }
    const given = String(req.headers['x-monitor-code'] || '').trim();
    if (!/^[0-9]{3,8}$/.test(given) || !codeMatches(given, real)) {
      noteFail(ip); req.resume();
      log('auth-fail ' + t + ' ip ' + ip);
      return fail(res, 401, 'bad-code');
    }

    const id = parts[4];
    const sub = parts[5];
    if (parts.length === 4) {
      if (req.method === 'POST') return handleCreate(req, res, t, ip);
      return fail(res, 405, 'method');
    }
    if (!ID_RE.test(String(id))) { req.resume(); return fail(res, 404, 'no-such-upload'); }
    if (parts.length === 5) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const m = loadMeta(t, id);
        if (!m) return fail(res, 404, 'no-such-upload');
        const off = m.done ? m.size : offsetOf(t, id);
        const body = { offset: off, size: m.size, done: !!m.done };
        if (req.method === 'HEAD') { res.writeHead(200, Object.assign({ 'Upload-Offset': String(off), 'Cache-Control': 'no-store' }, res._cors || {})); return res.end(); }
        return send(res, 200, body, { 'Upload-Offset': String(off) });
      }
      if (req.method === 'PUT' || req.method === 'PATCH') return handleChunk(req, res, t, id, url, ip);
      if (req.method === 'DELETE') return handleAbandon(res, t, id);
      return fail(res, 405, 'method');
    }
    if (parts.length === 6 && sub === 'finish' && req.method === 'POST') return handleFinish(req, res, t, id, ip);
    return fail(res, 404, 'not-found');
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      log('error ' + (e && e.message));
      if (!res.headersSent) fail(res, 500, 'server');
      else try { res.end(); } catch (e2) {}
    });
  });
  server.requestTimeout = 10 * 60 * 1000;
  server.headersTimeout = 30 * 1000;
  server.keepAliveTimeout = 5000;

  /*
    Cleanup. A partial upload untouched for 48 hours is deleted. A finished big
    file is deleted from the inbox 30 days after it arrived, if it is still
    there (a file someone moved is not ours any more and is left alone, and
    so is one whose size no longer matches what we received).
  */
  function sweep() {
    const t0 = now();
    const out = { partial: 0, finished: 0 };
    Object.keys(tenants).forEach((t) => {
      let names = [];
      try { names = fs.readdirSync(dirOf(t)); } catch (e) { return; }
      names.filter((f) => /^[0-9a-f]{32}\.json$/.test(f)).forEach((f) => {
        const id = f.slice(0, 32);
        const m = readJson(path.join(dirOf(t), f), null);
        if (!m) return;
        if (!m.done) {
          let last = Date.parse(m.createdAt) || 0;
          try { last = Math.max(last, fs.statSync(partOf(t, id)).mtimeMs); } catch (e) {}
          if (t0 - last > o.partialTtl) {
            try { fs.unlinkSync(partOf(t, id)); } catch (e) {}
            try { fs.unlinkSync(path.join(dirOf(t), f)); } catch (e) {}
            out.partial++; log('expired partial ' + t + ' ' + id);
          }
        } else if (t0 - (Date.parse(m.finishedAt) || 0) > o.finishedTtl) {
          try { fs.unlinkSync(path.join(dirOf(t), f)); } catch (e) {}
        }
      });
      const fin = readJson(finishedFile(t), []) || [];
      const keep = [];
      fin.forEach((e) => {
        if (t0 - Date.parse(e.at) <= o.finishedTtl) { keep.push(e); return; }
        const p = path.join(inboxDir(t), e.name);
        try {
          if (fs.statSync(p).size === e.size) { fs.unlinkSync(p); out.finished++; log('expired finished ' + t + ' ' + e.id); }
        } catch (er) { /* moved or gone: not ours to touch */ }
      });
      if (keep.length !== fin.length) writeJsonAtomic(finishedFile(t), keep);
    });
    return out;
  }

  return { server, sweep, sanitizeName };
}

module.exports = { createUploadServer, sanitizeName, DEFAULTS, GB, MB };
