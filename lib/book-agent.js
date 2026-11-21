'use strict';
/*
  22.11.2026: the booking agent of ONE business, a small unix socket server started by the tenant's own listener (listen.js),
  so it runs as the tenant's own user. The platform's bridge (wa-bridge.js, user monitor, one event loop for every customer)
  never reads or writes inside a tenant's folder for this feature: it connects to /var/lib/monitor-book/<tenant>/s.sock and
  sends one JSON line (lib/book-core.js says which), the agent answers one JSON line. Both at most 32KB.

  /var/lib/monitor-book is root's (0711), the tenant's folder in it is made by setup/enable-bookings.sh (the tenant's own, 0700,
  an ACL lets user monitor reach the socket). The agent refuses any request whose tenant is not its own id, so a socket
  path pointed at another business's agent gets nothing. It starts only when the instance has bookings: true.

  The owner is told by a record in her own chat folder (lib/book-core.js notify): it blinks like any answer, with or without
  WhatsApp. When she has WhatsApp, the record asks for a push with a generic line (waText), at most one push in ten minutes.
*/
const net = require('net');
const fs = require('fs');
const path = require('path');
const { makeCore } = require('./book-core.js');

const ROOT = '/var/lib/monitor-book', MAX = 32768, IDLE_MS = 5000, PUSH_GAP_MS = 10 * 60e3;
const sockPathOf = (tenant) => path.join(ROOT, tenant, 's.sock');

function start(o) {
  const inst = o.inst, dp = o.dataPath || inst.dataPath, tenantId = String(inst.name || '');
  const log = o.log || (() => {});
  if (!/^[a-z0-9-]{1,32}$/.test(tenantId)) throw new Error('bad tenant id');
  const dir = o.sockDir || path.join(ROOT, tenantId), sock = path.join(dir, 's.sock');
  if (!fs.existsSync(dir)) { log('בקשת תורים מהקישור: אין תיקיית סוקט, setup/enable-bookings.sh לא הורץ'); return null; }
  let lastPush = 0;
  const now = () => (o.now ? o.now() : Date.now());
  // a record in the owner's own chat folder: one per event; the WhatsApp push only when the last one is over ten minutes old
  function notify(text, opts) {
    const at = new Date(now()), pad = (n) => String(n).padStart(2, '0'), cd = path.join(dp, 'chat', 'chat');
    if (!require('./bookings.js').realDir(path.join(dp, 'chat')) || !require('./bookings.js').realDir(cd)) throw new Error('unsafe chat folder');
    fs.mkdirSync(cd, { recursive: true });
    const push = !!(opts && opts.push) && now() - lastPush >= PUSH_GAP_MS;
    if (push) lastPush = now();
    const stamp = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-' + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds());
    const base = stamp + (push ? '-claude-push-book' : '-claude-book');
    let name = base + '.json'; for (let i = 2; fs.existsSync(path.join(cd, name)); i++) name = base + '-' + i + '.json';
    const rec = { at: at.toISOString(), from: 'claude', text, status: 'done', id: 'bk-' + at.getTime().toString(36) };
    if (push) { rec.waPush = true; rec.waText = String((opts && opts.waText) || 'יש עדכון ביומן התורים שלך במוניטור.'); }
    require('./bookings.js').writeAtomic(path.join(cd, name), rec);
  }
  const core = makeCore({ inst, dataPath: dp, tenantId, now: o.now, notify, log, base: o.base });
  const server = net.createServer((conn) => {
    let buf = '', answered = false;
    const reply = (obj) => {
      if (answered) return; answered = true;
      let s = JSON.stringify(obj); if (s.length > MAX) s = JSON.stringify({ ok: false, error: 'big' });
      conn.end(s + '\n');
    };
    conn.setTimeout(IDLE_MS, () => { answered = true; conn.destroy(); });
    conn.on('error', () => { answered = true; });
    conn.on('data', (d) => {
      if (answered) return;
      buf += d.toString('utf8');
      if (buf.length > MAX) return reply({ ok: false, error: 'big' });
      const i = buf.indexOf('\n');
      if (i < 0) return;
      let req = null; try { req = JSON.parse(buf.slice(0, i)); } catch (e) { return reply({ ok: false, error: 'bad' }); }
      core.handle(req).then(reply, () => reply({ ok: false, error: 'bad' }));
    });
  });
  server.on('error', (e) => log('בקשת תורים מהקישור: ' + e.message));
  try { const st = fs.lstatSync(sock); if (st) fs.unlinkSync(sock); } catch (e) { /* none there */ }
  server.listen(sock, () => {
    // the mode's group bits are the ACL mask: rw so that user monitor (the ACL entry) can connect
    try { fs.chmodSync(sock, 0o660); } catch (e) { log('בקשת תורים מהקישור: chmod נכשל'); }
    log('בקשת תורים מהקישור: מקשיב');
  });
  return { server, sock, close: () => new Promise((r) => server.close(() => r())) };
}

module.exports = { start, sockPathOf, ROOT, MAX };
