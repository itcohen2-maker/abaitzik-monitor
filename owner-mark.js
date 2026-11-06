// 6.11: Itzik's phone carries a mark cookie (set by any /view page), so his opens of client pages are logged as his.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const F = path.join(__dirname, 'data', 'owner-mark.txt');
function mark() {
  try { const m = fs.readFileSync(F, 'utf8').trim(); if (m) return m; } catch (e) {}
  const m = crypto.randomBytes(18).toString('hex'); fs.writeFileSync(F, m, { mode: 0o600 }); return m;
}
function setCookie(res) { res.setHeader('Set-Cookie', 'itz=' + mark() + '; Max-Age=63072000; Path=/; Secure; HttpOnly; SameSite=Lax'); }
function meta(req) {
  const c = String(req.headers.cookie || ''); const m = c.match(/(?:^|;\s*)itz=([a-f0-9]+)/);
  const ua = String(req.headers['user-agent'] || '');
  const dev = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'אחר';
  const br = /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /WhatsApp|FBAN|FBAV|Instagram/.test(ua) ? 'בתוך אפליקציה' : /Safari/.test(ua) ? 'Safari' : '';
  return { owner: !!(m && m[1] === mark()), dev: (dev + ' ' + br).trim() };
}
// Called at the top of the open branch. Returns true when the open was Itzik's (already saved, not counted).
function onOpen(s, m, now, save) {
  if (m && m.owner) { s.ownerOpens = (s.ownerOpens || 0) + 1; s.ownerLastAt = now; save(); return true; }
  s.log = (s.log || []).slice(-49); s.log.push({ at: now, dev: (m && m.dev) || '' });
  return false;
}
module.exports = { setCookie, meta, onOpen };
