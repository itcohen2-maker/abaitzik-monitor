// 6.11: Itzik's phone carries a mark cookie (set by any /view page), so his opens of client pages are logged as his.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const F = path.join(__dirname, 'data', 'owner-mark.txt');
function mark() {
  try { const m = fs.readFileSync(F, 'utf8').trim(); if (m) return m; } catch (e) {}
  const m = crypto.randomBytes(18).toString('hex'); fs.writeFileSync(F, m, { mode: 0o600 }); return m;
}
// 15.11.2026: Itzik forwarded his own message, with a /view link, to a client. A /view page used to mark ANY
// device that opened it as his, and the mark also opens the setup pages. Now a /view page only refreshes the
// mark of a device that already has it (setCookie(res, req)), and a new device of his gets the mark only from
// a one-time link: node owner-mark.js issue  ->  https://form.it-solution.co.il/l/m/<32 hex>, 30 minutes, once.
function grant(res) { res.setHeader('Set-Cookie', 'itz=' + mark() + '; Max-Age=63072000; Path=/; Secure; HttpOnly; SameSite=Lax'); }
function setCookie(res, req) { if (req && meta(req).owner) grant(res); }
const OTP = path.join(__dirname, 'data', 'owner-mark-otp.json');
function otps() { try { return JSON.parse(fs.readFileSync(OTP, 'utf8')); } catch (e) { return {}; } }
function issue() {
  const o = otps(), now = Date.now(); Object.keys(o).forEach(k => { if (o[k] < now) delete o[k]; });
  const t = crypto.randomBytes(16).toString('hex'); o[t] = now + 30 * 60e3;
  fs.writeFileSync(OTP, JSON.stringify(o), { mode: 0o600 }); return 'https://form.it-solution.co.il/l/m/' + t;
}
function redeem(t, res) {
  const o = otps(); const ok = /^[a-f0-9]{32}$/.test(String(t)) && o[t] && o[t] > Date.now();
  if (o[t]) { delete o[t]; fs.writeFileSync(OTP, JSON.stringify(o), { mode: 0o600 }); }
  if (ok) grant(res); return !!ok;
}
function meta(req) {
  const c = String(req.headers.cookie || ''); const m = c.match(/(?:^|;\s*)itz=([a-f0-9]+)/);
  const ua = String(req.headers['user-agent'] || '');
  const dev = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'אחר';
  const br = /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /WhatsApp|FBAN|FBAV|Instagram/.test(ua) ? 'בתוך אפליקציה' : /Safari/.test(ua) ? 'Safari' : '';
  // 9.11: a short hash of the address, to count distinct places a form was opened from (never the address itself).
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
  return { owner: !!(m && m[1] === mark()), dev: (dev + ' ' + br).trim(), ip: crypto.createHash('sha1').update(ip).digest('hex').slice(0, 6) };
}
// Called at the top of the open branch. Returns true when the open was Itzik's (already saved, not counted).
function onOpen(s, m, now, save) {
  if (m && m.owner) { s.ownerOpens = (s.ownerOpens || 0) + 1; s.ownerLastAt = now; save(); return true; }
  s.log = (s.log || []).slice(-49); s.log.push({ at: now, dev: (m && m.dev) || '', ip: (m && m.ip) || '' });
  return false;
}
module.exports = { setCookie, grant, issue, redeem, meta, onOpen };
if (require.main === module && process.argv[2] === 'issue') console.log(issue());
