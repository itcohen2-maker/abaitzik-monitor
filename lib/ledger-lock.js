// 15.11.2026: a page for ONE person, locked to the first phone that opens it (Itzik: "רק הוא יוכל לפתוח
// אותו בטלפון, וגם אם הוא יעביר אותו ליואל או למישהו אחר, זה לא ייפתח", with a tracker).
//   /l/<tok>        the person's link. First non-owner open binds that device (cookie ld_<tok>).
//                   Any other device gets a "locked" page, and Itzik is told (maybe forwarded).
//   /l/<tok>/view   Itzik's own look: the page + who opened, when, and every blocked try. Sets his owner mark.
//   POST /api/ledger {tok, action:'reset'}   owner cookie only: releases the lock (new phone).
// Files: data/ledger/<tok>.html (the page body, a full html doc), data/ledger/<tok>.json (state).
// Same device, other browser (WhatsApp in-app vs Safari): no cookie, but the same UA device part
// and the same address hash as the bound device are let in and re-cookied.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const OM = require('../owner-mark.js');
const DIR = path.join(__dirname, '..', 'data', 'ledger');

function ok(t) { return /^[a-f0-9]{20}$/.test(String(t || '')); }
function load(t) { try { return JSON.parse(fs.readFileSync(path.join(DIR, t + '.json'), 'utf8')); } catch (e) { return null; } }
function save(t, s) { const f = path.join(DIR, t + '.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(s, null, 1)); fs.renameSync(f + '.tmp', f); }
function page(t) { try { return fs.readFileSync(path.join(DIR, t + '.html'), 'utf8'); } catch (e) { return null; } }
function cookieOf(q, t) { const m = String(q.headers.cookie || '').match(new RegExp('(?:^|;\\s*)ld_' + t + '=([a-f0-9]{32})')); return m ? m[1] : ''; }
function uaCore(q) { const u = String(q.headers['user-agent'] || ''); const m = u.match(/\(([^)]*)\)/); return crypto.createHash('sha1').update(m ? m[1] : u).digest('hex').slice(0, 10); }
function ipHash(q) { const ip = String(q.headers['x-forwarded-for'] || (q.socket && q.socket.remoteAddress) || '').split(',')[0].trim(); return crypto.createHash('sha1').update('ld' + ip).digest('hex').slice(0, 10); }
function heb(ts) { return new Date(ts).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function send(s, code, html, extra) {
  s.writeHead(code, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, extra || {}));
  s.end(html);
}
function locked() {
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>הדף נעול</title>'
    + '<style>body{margin:0;font-family:Heebo,Arial,sans-serif;background:#f5f3ee;color:#1d1d1b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}'
    + '.c{background:#fff;border:1px solid #e4e1d9;border-radius:16px;padding:28px 22px;max-width:420px;text-align:center}h1{font-size:22px;margin:8px 0}p{color:#6b6a66;margin:0}</style></head>'
    + '<body><div class="c"><div style="font-size:40px">🔒</div><h1>הדף הזה נעול</h1><p>הוא נפתח רק במכשיר של מי שקיבל אותו.</p></div></body></html>';
}

// tell(kind, text): formNotify of wa-bridge (push + monitor).
function serve(t, mode, q, s, tell) {
  if (!ok(t)) return send(s, 404, 'Not found');
  const st = load(t), html = page(t);
  if (!st || !html) return send(s, 404, 'Not found');
  const now = Date.now(), m = OM.meta(q), who = st.who || 'הנמען';
  st.opens = st.opens || []; st.blocked = st.blocked || [];

  if (mode === 'view') {
    OM.setCookie(s);
    const row = (a, b) => '<tr><td>' + a + '</td><td>' + b + '</td></tr>';
    const opens = st.opens.slice().reverse().map(o => row(heb(o.at), o.dev + (o.via ? ' · ' + o.via : ''))).join('') || row('עוד לא נפתח', '');
    const bl = st.blocked.slice().reverse().map(o => row(heb(o.at), o.dev)).join('') || row('אין', '');
    const panel = '<div style="font-family:Heebo,Arial,sans-serif;direction:rtl;max-width:860px;margin:12px auto 0;padding:0 16px">'
      + '<div style="background:#fff8e1;border:1px solid #f0d58a;border-radius:14px;padding:14px 16px">'
      + '<b>👀 מעקב, רק אצלך</b><br>' + (st.device ? 'ננעל על ' + st.device.dev + ' מ ' + heb(st.device.at) : 'עוד לא ננעל. המכשיר הראשון שיפתח את הקישור של ' + who + ' יינעל.')
      + '<br>פתיחות של ' + who + ': <b>' + st.opens.length + '</b> · ניסיונות ממכשיר אחר: <b>' + st.blocked.length + '</b>'
      + '<table style="width:100%;margin-top:8px;font-size:14px"><tr><th style="text-align:right">פתיחות</th><th></th></tr>' + opens + '</table>'
      + '<table style="width:100%;margin-top:8px;font-size:14px"><tr><th style="text-align:right">נחסמו (מכשיר אחר)</th><th></th></tr>' + bl + '</table>'
      + (st.device ? '<button id="rst" style="margin-top:10px;font:inherit;padding:6px 14px;border-radius:10px;border:1px solid #ccc;background:#fff">שחרור הנעילה (טלפון חדש)</button>'
        + '<script>document.getElementById("rst").onclick=function(){if(!confirm("לשחרר? המכשיר הבא שיפתח ייתפס"))return;fetch("/api/ledger",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tok:"' + t + '",action:"reset"})}).then(function(r){location.reload()})}</script>' : '')
      + '</div></div>';
    st.ownerViews = (st.ownerViews || 0) + 1; save(t, st);
    return send(s, 200, html.replace(/<body[^>]*>/, function (b) { return b + panel; }));
  }

  if (m.owner) { st.ownerOpens = (st.ownerOpens || 0) + 1; save(t, st); return send(s, 200, html); }

  const ck = cookieOf(q, t), core = uaCore(q), iph = ipHash(q);
  const setCk = id => ({ 'Set-Cookie': 'ld_' + t + '=' + id + '; Max-Age=63072000; Path=/l/' + t + '; Secure; HttpOnly; SameSite=Lax' });

  if (!st.device) {
    const id = crypto.randomBytes(16).toString('hex');
    st.device = { id, core, ip: iph, dev: m.dev, at: now };
    st.opens.push({ at: now, dev: m.dev, via: 'ראשונה, ננעל' }); save(t, st);
    tell('📒 ' + who + ' פתח את דף ההתחשבנות', who + ' פתח לראשונה את ' + (st.title || 'הדף') + ' (' + m.dev + '). הדף ננעל על המכשיר הזה.');
    return send(s, 200, html, setCk(id));
  }
  let via = '';
  if (ck && ck === st.device.id) via = '';
  else if (core === st.device.core && iph === st.device.ip) via = 'אותו מכשיר, דפדפן אחר';
  else {
    st.blocked = st.blocked.slice(-99); st.blocked.push({ at: now, dev: m.dev, ip: iph }); save(t, st);
    const today = st.blocked.filter(b => now - b.at < 864e5).length;
    if (today <= 10) tell('🔒 ניסיון לפתוח את הדף של ' + who, 'מישהו ניסה לפתוח את ' + (st.title || 'הדף') + ' ממכשיר אחר (' + m.dev + '). כנראה ' + who + ' העביר את הקישור. הדף לא נפתח לו. ניסיון ' + st.blocked.length + '.');
    return send(s, 403, locked());
  }
  const last = st.opens.length ? st.opens[st.opens.length - 1].at : 0;
  st.opens = st.opens.slice(-199); st.opens.push({ at: now, dev: m.dev, via }); save(t, st);
  if (now - last > 30 * 60e3) tell('📒 ' + who + ' פתח שוב את דף ההתחשבנות', who + ' פתח את ' + (st.title || 'הדף') + ', פעם ' + st.opens.length + ' (' + m.dev + ').');
  return send(s, 200, html, setCk(st.device.id));
}

function handlePost(b, q, cb) {
  const m = OM.meta(q);
  if (!m.owner) return cb({ status: 403, body: { ok: false } });
  if (!b || !ok(b.tok)) return cb({ status: 400, body: { ok: false } });
  const st = load(b.tok); if (!st) return cb({ status: 404, body: { ok: false } });
  if (b.action === 'reset') { st.prevDevices = (st.prevDevices || []).concat(st.device ? [st.device] : []); st.device = null; save(b.tok, st); }
  cb({ status: 200, body: { ok: true } });
}

module.exports = { serve, handlePost };
