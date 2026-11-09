'use strict';
/*
  9.11.2026: a customer's video must reach Meta by a public https address, but his files must never sit in a
  public repo (a clinic's, an owner's). So the file stays in data/social/<id>/media/ on our server and Meta is
  given a signed address that stops working after an hour:

    https://form.it-solution.co.il/m/<id>/<expiry>/<signature>/<file name>

  The signature is an HMAC of id, expiry and file name with a secret that only this server has
  (data/social/.media-secret, mode 600). A changed name, id or expiry, or a late request, is refused.
  GET, HEAD and byte ranges work, since Meta fetches a video the way a player does.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.SOCIAL_DIR || path.join(__dirname, '..', 'data', 'social');
const HOST = process.env.SOCIAL_MEDIA_HOST || 'https://form.it-solution.co.il';
const TYPES = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

function secret() {
  const f = path.join(ROOT, '.media-secret');
  try { const s = fs.readFileSync(f, 'utf8').trim(); if (s.length >= 32) return s; } catch (e) {}
  fs.mkdirSync(ROOT, { recursive: true });
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
const safeId = (s) => /^[a-z0-9-]{1,30}$/.test(String(s || '')) ? String(s) : null;
const safeFile = (s) => { const b = path.basename(String(s || '')); return b && b === String(s) && !/^\./.test(b) && TYPES[path.extname(b).toLowerCase()] ? b : null; };
function sig(id, exp, file) { return crypto.createHmac('sha256', secret()).update(id + '|' + exp + '|' + file).digest('hex').slice(0, 32); }

// An address for one file of one customer, valid for ttl seconds (default one hour).
function url(id, file, ttl) {
  id = safeId(id); file = safeFile(file);
  if (!id || !file) throw new Error('bad media id or file');
  const exp = Math.floor(Date.now() / 1000) + (ttl || 3600);
  return HOST + '/m/' + id + '/' + exp + '/' + sig(id, exp, file) + '/' + encodeURIComponent(file);
}

// GET or HEAD /m/<id>/<exp>/<sig>/<file>. Returns nothing; it answers on res.
function serve(pathname, req, res) {
  const deny = (c) => { res.writeHead(c, { 'Content-Type': 'text/plain' }); res.end(c === 404 ? 'Not found' : 'Forbidden'); };
  const m = String(pathname).match(/^\/m\/([a-z0-9-]{1,30})\/(\d{9,11})\/([a-f0-9]{32})\/([^/]+)$/);
  if (!m) return deny(404);
  const id = safeId(m[1]), exp = Number(m[2]);
  let file; try { file = safeFile(decodeURIComponent(m[4])); } catch (e) { return deny(404); }
  if (!id || !file) return deny(404);
  const want = sig(id, exp, file);
  const ok = want.length === m[3].length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m[3]));
  if (!ok || exp < Math.floor(Date.now() / 1000)) return deny(403);
  const f = path.join(ROOT, id, 'media', file);
  let st; try { st = fs.statSync(f); } catch (e) { return deny(404); }
  const type = TYPES[path.extname(file).toLowerCase()];
  let start = 0, end = st.size - 1, code = 200;
  const r = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (r && (r[1] || r[2])) {
    if (r[1]) { start = Number(r[1]); if (r[2]) end = Math.min(Number(r[2]), st.size - 1); }
    else { start = Math.max(0, st.size - Number(r[2])); }
    if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
    code = 206;
  }
  const h = { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (code === 206) h['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
  res.writeHead(code, h);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(f, { start, end }).on('error', () => { try { res.end(); } catch (e) {} }).pipe(res);
}

module.exports = { url, serve, sig, ROOT };
