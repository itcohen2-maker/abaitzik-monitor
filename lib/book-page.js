'use strict';
/*
  22.11.2026, Itzik: "if she has no appointment management she will not buy the monitor". Her clients book themselves:
    GET  /b/<linkToken>                    the business's permanent booking page
    GET  /api/book/slots?l=&date=&service= the free times of a day, live
    POST /api/book                         create a booking
    GET  /b/a/<linkToken>.<bookingTok>     the client's own booking: confirm, cancel, change the time (and /ics for a calendar file)
    POST /api/book/act                     confirm | cancel | move
    POST /api/book/link                    the owner's page asks for her permanent link (wa-bridge checks her visit key first)

  THIS FILE RUNS IN THE PLATFORM'S BRIDGE (user monitor, one event loop for every customer) AND IS ONLY A PROXY.
  It never reads or writes inside a tenant's folder, never waits synchronously and never takes a lock. The only thing the
  platform keeps is data/book/links/<linkToken>.json = { tenant } (which monitor a link belongs to). Every question goes to
  the tenant's own agent (lib/book-agent.js, started by the tenant's listener as the tenant's own user) over
  /var/lib/monitor-book/<tenant>/s.sock: one JSON line each way, 32KB at most, 2.5 seconds at most. The socket path is checked
  with lstat (it must be a socket, so a FIFO can never block), connecting is asynchronous, and the agent's answer is untrusted:
  every field is checked for shape, type and length, and everything is escaped when drawn. A missing, slow or garbled agent
  gives a calm "אי אפשר לקבוע כרגע, נסו שוב בעוד כמה דקות" and nothing else is affected.
  The bridge keeps only counters in memory (per IP, and the single use form tokens); nothing about a client is kept or logged.

  create(env): env = { DATA, sockPath(tenant) -> the socket path, log, now, base, demo: { request(req) } | null, timeoutMs }
  handle(rq) with rq = { method, path, query, body, ip } -> Promise<{ status, type, body, headers? }>.
*/
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

const BASE = 'https://form.it-solution.co.il';
const DEMO_LINK = 'de00de00de00de00de00de00', DEMO_TOK = 'de00de00de00de00de00de01';
const LIMITS = { ipCreate: 3, ipAttempts: 60, ipAct: 30, ipSlots: 300, ipPage: 120, ftPerIp: 30 }; // ipCreate: successful bookings per IP per DAY
const HOUR = 3600e3, DAY_MS = 24 * HOUR, MIN_FILL_MS = 3000, MAX_FILL_MS = 6 * HOUR, MAX_REPLY = 32768, MAX_FT = 5000;
const CALM = 'אי אפשר לקבוע כרגע, נסו שוב בעוד כמה דקות.';
const TOK = /^[a-f0-9]{24}$/, DAY = /^\d{4}-\d{2}-\d{2}$/, ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
const ERRORS = ['link', 'off', 'tenant', 'date', 'service', 'name', 'phone', 'start', 'conflict', 'limit', 'full', 'unconfirmed', 'rate', 'notfound', 'cancelled', 'past', 'bad', 'big'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const json = (status, o) => ({ status, type: 'application/json; charset=utf-8', body: JSON.stringify(o) });
const html = (status, body) => ({ status, type: 'text/html; charset=utf-8', body });
const linkFile = (DATA, l) => path.join(DATA, 'book', 'links', l + '.json');

// ---- the agent's answers are untrusted: shape, types and lengths are checked, anything else is "not an answer" ----
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const intIn = (v, a, b) => { v = Math.round(Number(v)); return v >= a && v <= b ? v : null; };
function cleanInfo(r) {
  if (!isObj(r) || r.ok !== true || !Array.isArray(r.services) || !Array.isArray(r.days)) return null;
  const acc = Array.isArray(r.accent) ? r.accent.map((c) => (/^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? String(c) : '')) : [];
  const services = [];
  for (const s of r.services.slice(0, 30)) {
    if (!isObj(s) || !/^[A-Za-z0-9_]{1,20}$/.test(String(s.id))) continue;
    const m = intIn(s.minutes, 5, 600), p = Number(s.price);
    if (m && p >= 0 && p <= 1e6) services.push({ id: String(s.id), name: cap(s.name, 60), minutes: m, price: Math.round(p) });
  }
  const days = r.days.slice(0, 16).filter((d) => isObj(d) && DAY.test(String(d.d)) && /^\d\d\.\d\d$/.test(String(d.label))).map((d) => ({ d: String(d.d), w: cap(d.w, 10), label: String(d.label), closed: !!d.closed }));
  if (!days.length) return null;
  return { slotMinutes: intIn(r.slotMinutes, 5, 120) || 15, name: cap(r.name, 80) || 'העסק', accent: [acc[0] || '#2f6f4f', acc[1] || '#e6f3ec', acc[2] || '#ffffff'], fem: !!r.fem, services, days };
}
function cleanSlots(r) {
  if (!isObj(r) || r.ok !== true || !Array.isArray(r.slots)) return null;
  return r.slots.slice(0, 200).filter((s) => isObj(s) && /^\d\d:\d\d$/.test(String(s.time)) && ISO.test(String(s.start))).map((s) => ({ time: String(s.time), start: String(s.start) }));
}
function cleanBooking(b) {
  if (!isObj(b) || !ISO.test(String(b.start))) return null;
  return { tok: TOK.test(String(b.tok)) ? String(b.tok) : '', service: cap(b.service, 60), name: cap(b.name || b.who, 60), when: cap(b.when, 60), start: String(b.start), end: ISO.test(String(b.end)) ? String(b.end) : '',
    minutes: intIn(b.minutes, 0, 600) || 0, status: ['booked', 'confirmed', 'cancelled', 'done', 'noshow'].indexOf(b.status) >= 0 ? b.status : 'booked', past: !!b.past, serviceId: cap(b.serviceId, 20) };
}
// the optional d, s, t of a link that opens on a day, a service or a time. Only what the agent's info lets the bridge verify:
// a day inside the window that is open, a service that exists, a time that sits on the slot step. Anything else is dropped silently
// (the page's own script checks the time against the live slots and never locks the client in).
function cleanPre(q, info) {
  const out = {};
  const str = (v) => (typeof v === 'string' ? v : ''); // strings only: an array or an object is dropped
  const d = str(q && q.d), s = str(q && q.s), t = str(q && q.t);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(d) ? info.days.find((x) => x.d === d) : null;
  if (day && !day.closed) out.d = d;
  if (s && info.services.some((x) => x.id === s)) out.s = s;
  if (out.d && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) && (+t.slice(0, 2) * 60 + +t.slice(3)) % (info.slotMinutes || 15) === 0) out.t = t;
  return out;
}
const errOf = (r) => (isObj(r) && r.ok === false && ERRORS.indexOf(r.error) >= 0 ? r.error : 'bad');

function create(env) {
  const now = () => (env.now ? env.now() : Date.now());
  const base = env.base || BASE;
  const log = (l) => { try { (env.log || (() => {}))(l); } catch (e) { /* logging never breaks a request */ } };
  const hits = new Map(), fts = new Map(), ftByIp = new Map(); // memory only
  const count = (key, windowMs) => { const t = now(), a = (hits.get(key) || []).filter((x) => t - x < (windowMs || HOUR)); hits.set(key, a); return a.length; };
  const add = (key) => { const a = hits.get(key) || []; a.push(now()); hits.set(key, a); };
  const hit = (key, limit) => { if (count(key) >= limit) return false; add(key); return true; };
  const sweep = () => {
    const t = now();
    for (const [k, a] of hits) { const b = a.filter((x) => t - x < DAY_MS); if (b.length) hits.set(k, b); else hits.delete(k); }
    for (const [k, v] of fts) if (t - v.at > MAX_FILL_MS) dropFt(k);
  };
  const timer = setInterval(sweep, 60e3); if (timer.unref) timer.unref();
  // a form token: made per page load, bound to the link, good once. Each IP keeps at most ftPerIp live ones (its oldest is dropped
  // first), so a few addresses cannot push real visitors' tokens out of the store; the global cap is the last resort.
  function dropFt(id) { const v = fts.get(id); if (!v) return; fts.delete(id); const set = ftByIp.get(v.ip); if (set) { set.delete(id); if (!set.size) ftByIp.delete(v.ip); } }
  function issueFt(l, ip) {
    ip = String(ip || '');
    const mine = ftByIp.get(ip) || new Set();
    while (mine.size >= LIMITS.ftPerIp) dropFt(mine.values().next().value);
    if (fts.size >= MAX_FT) dropFt(fts.keys().next().value);
    const id = crypto.randomBytes(12).toString('hex'); fts.set(id, { l, at: now(), ip });
    const set = ftByIp.get(ip) || new Set(); set.add(id); ftByIp.set(ip, set);
    return id;
  }
  function useFt(id, l) {
    const v = fts.get(String(id || '')); if (!v) return 'fast';
    dropFt(String(id)); // single use
    const age = now() - v.at;
    if (v.l !== l) return 'fast';
    if (age < MIN_FILL_MS) return 'fast';
    if (age > MAX_FILL_MS) return 'stale';
    return '';
  }

  // ---- talking to the tenant's agent ----
  async function ask(tenant, req) {
    if (!/^[a-z0-9-]{1,32}$/.test(String(tenant))) return null;
    const p = env.sockPath(tenant);
    // The real path of the socket's folder must be exactly the tenant's folder (/var/lib/monitor-book/<tenant>), then the socket itself is
    // lstat'ed. connect() still follows a link in the final step, so this narrows the window and does not close it: the agent's own tenant
    // check is the second wall (an agent answers only for its own id).
    const want = env.sockDir ? env.sockDir(tenant) : path.dirname(p);
    let real; try { real = await fs.promises.realpath(path.dirname(p)); } catch (e) { return null; }
    if (real !== want) return null;
    let st; try { st = await fs.promises.lstat(p); } catch (e) { return null; }
    if (!st.isSocket()) return null; // a FIFO, a file or a link is not an agent, and connect() is asynchronous anyway
    return new Promise((resolve) => {
      let buf = '', fin = false;
      const c = net.connect(p);
      const done = (v) => { if (fin) return; fin = true; clearTimeout(tm); try { c.destroy(); } catch (e) { /* closed */ } resolve(v); };
      const tm = setTimeout(() => done(null), env.timeoutMs || 2500);
      c.on('connect', () => { try { c.write(JSON.stringify(Object.assign({}, req, { tenant })) + '\n'); } catch (e) { done(null); } });
      c.on('data', (d) => {
        buf += d.toString('utf8');
        if (buf.length > MAX_REPLY) return done(null);
        const i = buf.indexOf('\n');
        if (i >= 0) { try { done(JSON.parse(buf.slice(0, i))); } catch (e) { done(null); } }
      });
      c.on('error', () => done(null));
      c.on('close', () => { try { done(buf.trim() ? JSON.parse(buf) : null); } catch (e) { done(null); } });
    });
  }
  // the business behind a link: { tenant, demo } or null
  async function tenantOf(l) {
    l = String(l || '');
    if (l === DEMO_LINK) return env.demo ? { tenant: 'demo-beauty', demo: true } : null;
    if (!TOK.test(l)) return null;
    let r = null; try { r = JSON.parse(await fs.promises.readFile(linkFile(env.DATA, l), 'utf8')); } catch (e) { return null; }
    return r && /^[a-z0-9-]{1,32}$/.test(String(r.tenant || '')) ? { tenant: String(r.tenant), demo: false } : null;
  }
  const call = (t, req) => (t.demo ? env.demo.request(Object.assign({}, req, { tenant: 'demo-beauty' })) : ask(t.tenant, req));

  // ---- pages ----
  function clientData(l, info, ft, extra) { return Object.assign({ l, name: info.name, ft, days: info.days, services: info.services, demo: false }, extra || {}); }
  const embed = (D) => '<script>(' + clientJs.toString() + ')(' + JSON.stringify(D).replace(/</g, '\\u003c') + ',' + coreSrc() + ');</script>';
  function calm(status) { return html(status || 503, '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>קביעת תור</title></head>'
    + '<body style="font-family:Heebo,Arial,sans-serif;text-align:center;padding:18vh 20px"><h1>' + esc(CALM) + '</h1></body></html>'); }
  function ics(info, b) {
    const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const e = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const end = b.end || new Date(Date.parse(b.start) + (b.minutes || 60) * 60000).toISOString();
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IT Solution//Booking//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', 'UID:' + b.tok + '@it-solution.co.il', 'DTSTAMP:' + utc(new Date(now()).toISOString()),
      'DTSTART:' + utc(b.start), 'DTEND:' + utc(end), 'SUMMARY:' + e(b.service + ' אצל ' + info.name), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }

  async function page(l, ip, q) {
    if (!hit('page:' + ip, LIMITS.ipPage)) return json(429, { error: 'rate' });
    const t = await tenantOf(l); if (!t) return html(404, notFound());
    const r = await call(t, { op: 'info', l });
    if (isObj(r) && r.ok === false && (r.error === 'link' || r.error === 'off')) return html(404, notFound());
    const info = cleanInfo(r); if (!info) return calm();
    return html(200, shell('קביעת תור אצל ' + info.name, info, '<main><header><h1>' + esc(info.name) + '</h1><p>קובעים תור בכמה לחיצות</p></header><div id="app"></div></main>',
      embed(clientData(l, info, issueFt(l, ip), { demo: t.demo, pre: cleanPre(q, info) }))));
  }
  async function mine(l, tok, wantIcs, ip) {
    if (!hit('page:' + ip, LIMITS.ipPage)) return json(429, { error: 'rate' });
    const t = await tenantOf(l); if (!t) return html(404, notFound());
    const [ri, rg] = await Promise.all([call(t, { op: 'info', l }), call(t, { op: 'get', tok })]);
    if (isObj(rg) && rg.ok === false && rg.error === 'notfound') return html(404, notFound());
    const info = cleanInfo(ri), b = isObj(rg) && rg.ok === true ? cleanBooking(rg.booking) : null;
    if (!info || !b) return calm();
    b.tok = tok;
    if (wantIcs) return { status: 200, type: 'text/calendar; charset=utf-8', body: ics(info, b), headers: { 'Content-Disposition': 'attachment; filename="appointment.ics"' } };
    return html(200, shell('התור שלך אצל ' + info.name, info, '<main><header><h1>' + esc(info.name) + '</h1><p>התור שלך</p></header><div id="app"></div></main>',
      embed(clientData(l, info, '', { demo: t.demo, tok, mine: { service: b.service, minutes: b.minutes, when: b.when, start: b.start, status: b.status, past: b.past, who: b.name }, serviceId: b.serviceId || b.service }))));
  }

  // ---- the API ----
  async function slots(q, ip) {
    if (!hit('slots:' + ip, LIMITS.ipSlots)) return json(429, { error: 'rate' });
    const t = await tenantOf(q.l); if (!t) return json(404, { error: 'link' });
    const r = await call(t, { op: 'slots', date: cap(q.date, 10), service: cap(q.service, 20) });
    const s = cleanSlots(r);
    if (!s) return isObj(r) && r.ok === false ? json(400, { error: errOf(r) }) : json(503, { error: 'down' });
    return json(200, { slots: s });
  }
  async function book(b, ip) {
    if (!isObj(b)) return json(400, { error: 'bad' });
    const t = await tenantOf(b.l); if (!t) return json(404, { error: 'link' });
    if (!hit('att:' + ip, LIMITS.ipAttempts) || count('createok:' + ip, DAY_MS) >= LIMITS.ipCreate) return json(429, { error: 'rate' });
    const bad = useFt(b.ft, String(b.l)), again = (o) => { const x = json(o.s, Object.assign({ ft: issueFt(String(b.l), ip) }, o.b)); return x; };
    // a bot fills the hidden field: it is told it worked, and nothing is written
    if (String(b.website || '').trim()) return json(200, { ok: true });
    if (bad) return again({ s: 400, b: { error: bad } });
    const r = await call(t, { op: 'create', service: cap(b.service, 20), start: cap(b.start, 16), name: cap(b.name, 80), phone: cap(b.phone, 30), idem: cap(b.cid, 40) });
    if (!isObj(r)) return again({ s: 503, b: { error: 'down' } });
    if (r.ok !== true) {
      const e = errOf(r);
      // limit, full and unconfirmed look the same from outside (a prober cannot tell whether a phone has a booking); the agent keeps the real code for the owner and the log
      if (e === 'limit' || e === 'full' || e === 'unconfirmed') return again({ s: 429, b: { error: 'unavailable' } });
      return again({ s: e === 'conflict' ? 409 : e === 'rate' ? 429 : 400, b: { error: e } });
    }
    const bk = cleanBooking(Object.assign({}, r.booking, { status: 'booked' }));
    if (!bk || !bk.tok) return again({ s: 503, b: { error: 'down' } });
    add('createok:' + ip); // counted only after the agent accepted it
    const mineUrl = base + '/b/a/' + String(b.l) + '.' + bk.tok;
    return json(200, { ok: true, again: !!r.again, booking: { tok: bk.tok, service: bk.service, when: bk.when, start: bk.start, end: bk.end, name: bk.name }, mine: mineUrl, ics: mineUrl + '/ics' });
  }
  async function act(b, ip) {
    if (!isObj(b)) return json(400, { error: 'bad' });
    if (!hit('act:' + ip, LIMITS.ipAct)) return json(429, { error: 'rate' });
    const t = await tenantOf(b.l); if (!t) return json(404, { error: 'link' });
    if (!TOK.test(String(b.tok || ''))) return json(404, { error: 'notfound' });
    const r = await call(t, { op: 'act', tok: String(b.tok), action: cap(b.action, 10), start: cap(b.start, 16) });
    if (!isObj(r)) return json(503, { error: 'down' });
    if (r.ok !== true) { const e = errOf(r); return json(e === 'notfound' ? 404 : e === 'rate' ? 429 : e === 'conflict' || e === 'past' || e === 'cancelled' ? 409 : 400, { error: e }); }
    return json(200, { ok: true, status: ['booked', 'confirmed', 'cancelled'].indexOf(r.status) >= 0 ? r.status : 'booked', when: cap(r.when, 60) });
  }
  /*
    The owner's page asked for her permanent link. THE BRIDGE decides, the tenant's side only displays:
      links/<token>.json            { tenant }    created with wx on its final path, never renamed over, never overwritten
      links/by-tenant/<tenant>.json { tok }       the reverse map, also wx: one link per business
    A business that already has a link gets that one back, whatever its agent says. Two racing requests of one business end with the
    same token (the loser removes its own file). The agent is then told to show it (setLink); if it answers with another token the
    bridge sends the platform's again. Resolving a public link (tenantOf) uses only links/<token>.json.
  */
  async function platformToken(byFile) { try { const j = JSON.parse(await fs.promises.readFile(byFile, 'utf8')); return isObj(j) && TOK.test(String(j.tok)) ? String(j.tok) : ''; } catch (e) { return ''; } }
  async function makeLink(tenant) {
    if (!/^[a-z0-9-]{1,32}$/.test(String(tenant || ''))) return { ok: false, error: 'tenant' };
    const byFile = path.join(env.DATA, 'book', 'links', 'by-tenant', tenant + '.json');
    let tok = '';
    try {
      await fs.promises.mkdir(path.dirname(byFile), { recursive: true });
      tok = await platformToken(byFile);
      if (!tok) {
        const mine = crypto.randomBytes(12).toString('hex'), mineFile = linkFile(env.DATA, mine);
        await fs.promises.writeFile(mineFile, JSON.stringify({ tenant }), { flag: 'wx', mode: 0o600 });
        const content = JSON.stringify({ tok: mine });
        try { await fs.promises.writeFile(byFile, content, { flag: 'wx', mode: 0o600 }); tok = mine; } // created and written in one call, so the window is tiny
        catch (e) {
          tok = await platformToken(byFile); // another request of this business won
          if (!tok) {
            // The file exists but holds no token (a crash between its creation and its content). Older than 5 seconds it is a dead leftover:
            // replaced atomically, ONLY this tenant's own reverse map file, never a forward links/<token>.json. A younger one may be a write in flight.
            let st = null; try { st = await fs.promises.lstat(byFile); } catch (e2) { st = null; }
            if (st && st.isFile() && Date.now() - st.mtimeMs > 5000) {
              const tmp = byFile + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
              try { await fs.promises.writeFile(tmp, content, { flag: 'wx', mode: 0o600 }); await fs.promises.rename(tmp, byFile); } catch (e3) { await fs.promises.unlink(tmp).catch(() => {}); }
              tok = await platformToken(byFile);
            }
          }
          if (tok !== mine) await fs.promises.unlink(mineFile).catch(() => {}); // not this request's token: its forward file goes
        }
      }
    } catch (e) { log('book link failed ' + tenant); return { ok: false, error: 'platform' }; }
    if (!tok) return { ok: false, error: 'platform' };
    let r = await ask(tenant, { op: 'setLink', tok });
    if (!isObj(r) || r.ok !== true) return { ok: false, error: 'agent' };
    if (r.tok !== tok) r = await ask(tenant, { op: 'setLink', tok }); // the agent showed something else: the platform's token is sent again
    log('book link ' + tenant);
    return { ok: true, link: base + '/b/' + tok };
  }

  async function handle(rq) {
    const p = String(rq.path || ''), q = rq.query || {}, ip = String(rq.ip || '');
    try {
      let m;
      if ((m = /^\/b\/([a-f0-9]{24})\/?$/.exec(p)) && rq.method === 'GET') return await page(m[1], ip, q);
      if ((m = /^\/b\/a\/([a-f0-9]{24})\.([a-f0-9]{24})(\/ics)?\/?$/.exec(p)) && rq.method === 'GET') return await mine(m[1], m[2], !!m[3], ip);
      if (p === '/api/book/slots' && rq.method === 'GET') return await slots(q, ip);
      if (p === '/api/book' && rq.method === 'POST') return await book(rq.body, ip);
      if (p === '/api/book/act' && rq.method === 'POST') return await act(rq.body, ip);
    } catch (e) { log('book error'); return p.indexOf('/api/') === 0 ? json(503, { error: 'down' }) : calm(); }
    return json(404, { error: 'route' });
  }
  return { handle, makeLink, stop: () => clearInterval(timer), ask, LIMITS };
}

// the slot arithmetic the page needs for nothing but drawing: only the pad helper of lib/bookings.js core
function coreSrc() { return require('./bookings.js').core.toString(); }

function shell(title, info, body, script) {
  const a = info.accent || ['#2f6f4f', '#e6f3ec', '#fff'];
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
    + '<title>' + esc(title) + '</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" rel="stylesheet">'
    + '<style>:root{--a:' + a[0] + ';--s:' + a[1] + ';--o:' + (a[2] || '#fff') + ';--ink:#16202c;--dim:#5f6b7f;--line:#e2e8f0}*{box-sizing:border-box}'
    + 'body{margin:0;background:#f6f7f9;color:var(--ink);font-family:Heebo,system-ui,sans-serif;font-size:16px;line-height:1.5}main{max-width:520px;margin:0 auto;padding:18px 16px 60px}'
    + 'header h1{margin:6px 0 0;font-size:26px;font-weight:800}header p{margin:2px 0 14px;color:var(--dim)}'
    + '.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;margin:0 0 12px}.card h2{margin:0 0 10px;font-size:17px;font-weight:800}'
    + '.svc{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:start;padding:12px;margin:0 0 8px;border:1.5px solid var(--line);border-radius:12px;background:#fff;font:inherit;color:inherit;cursor:pointer;min-height:56px}'
    + '.svc small{display:block;color:var(--dim);font-size:13.5px}.svc[aria-pressed=true]{border-color:var(--a);background:var(--s)}.svc b{font-weight:700}'
    + '.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{padding:8px 12px;min-height:44px;border:1.5px solid var(--line);border-radius:12px;background:#fff;font:inherit;color:inherit;cursor:pointer;text-align:center}'
    + '.chip small{display:block;font-size:12px;color:var(--dim)}.chip[aria-pressed=true]{border-color:var(--a);background:var(--a);color:var(--o)}.chip[aria-pressed=true] small{color:var(--o)}.chip:disabled{opacity:.4;cursor:not-allowed}'
    + 'label{display:block;font-weight:700;font-size:14px;margin:10px 0 4px}input[type=text],input[type=tel]{width:100%;min-height:48px;padding:0 12px;border:1.5px solid #cbd5e1;border-radius:12px;font:inherit;background:#fff;color:var(--ink)}'
    + '.mt{margin-top:10px}.hp{position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none}body{overflow-x:hidden}.consent{font-size:13px;color:var(--dim);margin:10px 0 0}'
    + '.go,.btn{display:block;width:100%;min-height:52px;margin-top:12px;border:0;border-radius:14px;background:var(--a);color:var(--o);font:800 17px Heebo,system-ui,sans-serif;cursor:pointer;text-align:center;text-decoration:none;padding:14px}'
    + '.btn.alt{background:#fff;color:var(--a);border:1.5px solid var(--a)}.go:disabled{opacity:.5}.say{min-height:22px;color:#b3261e;font-weight:600;margin-top:8px}.ok{background:var(--s);border-radius:14px;padding:14px}'
    + '.ok h2{margin:0 0 6px}.row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)}.row span:first-child{color:var(--dim)}.none{color:var(--dim);padding:6px 0}'
    + '.go:focus-visible,.btn:focus-visible,.chip:focus-visible,.svc:focus-visible,input:focus-visible{outline:3px solid var(--a);outline-offset:2px}</style></head><body>' + body + script + '</body></html>';
}
const notFound = () => '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>הקישור לא נמצא</title></head>'
  + '<body style="font-family:Heebo,Arial,sans-serif;text-align:center;padding:18vh 20px"><h1>הקישור לא נמצא</h1><p>ייתכן שהוא הוחלף. אפשר לבקש מבעל העסק קישור חדש.</p></body></html>';

// The page side, put on the page with toString. Plain ES5. D = the business and the choices, core = bookings.core.
function clientJs(D, coreFn) {
  var K = coreFn(), app = document.getElementById('app'), st = { svc: null, day: '', time: '', slots: null }, busy = false, cid = Math.random().toString(36).slice(2);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ERR = { conflict: 'השעה הזאת נתפסה בינתיים. בחרו שעה אחרת.', closed: 'השעה הזאת מחוץ לשעות הפעילות.', past: 'השעה הזאת כבר עברה.', rate: 'נשלחו הרבה בקשות. נסו שוב בעוד כמה דקות.',
    phone: 'הטלפון צריך להיות מספר נייד ישראלי, למשל 0501234567.', name: 'צריך שם של 2 עד 40 אותיות.', fast: 'עוד רגע, ואז אפשר לשלוח.', stale: 'הדף פתוח הרבה זמן. טענו אותו מחדש.', down: 'אי אפשר לקבוע כרגע, נסו שוב בעוד כמה דקות.', unavailable: 'אי אפשר לקבוע עכשיו דרך הקישור. אפשר לכתוב לעסק, או לנסות שוב מאוחר יותר.', service: 'בחרו שירות.', start: 'בחרו יום ושעה.', date: 'בחרו יום.' };
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._s = r.status; return j; }); }).catch(function () { return { error: 'net' }; });
  }
  function getSlots() {
    var box = document.getElementById('times'); if (!st.svc || !st.day) { box.innerHTML = '<div class="none">בחרו שירות ויום, ואז יופיעו השעות הפנויות.</div>'; return; }
    box.innerHTML = '<div class="none">בודקים שעות פנויות...</div>';
    var key = st.svc.id + '|' + st.day, pre = st.pre;
    fetch('/api/book/slots?l=' + D.l + '&date=' + st.day + '&service=' + encodeURIComponent(st.svc.id)).then(function (r) { return r.json(); }).then(function (j) {
      if (key !== st.svc.id + '|' + st.day) return;
      st.slots = j.slots || [];
      var note = '';
      // a link that named a time: highlighted if it is still free, a calm line if it is not (the other times stay)
      if (pre && pre.t && st.slots.length && !st.preDone) { if (st.slots.some(function (x) { return x.time === pre.t; })) st.time = pre.t; else note = '<div class="none">השעה הזאת כבר נתפסה, יש עוד שעות פנויות</div>'; }
      if (pre && pre.d === st.day) st.preDone = true;
      box.innerHTML = note + (st.slots.length ? '<div class="chips">' + st.slots.map(function (s) { return '<button type="button" class="chip" data-t="' + s.time + '" aria-pressed="' + (st.time === s.time) + '">' + s.time + '</button>'; }).join('') + '</div>' : '<div class="none">אין שעה פנויה ביום הזה. בחרו יום אחר.</div>');
      if (pre && !st.scrolled) { st.scrolled = true; try { box.scrollIntoView({ block: 'center' }); } catch (e) { /* no scrolling */ } }
      sync();
    }, function () { box.innerHTML = '<div class="none">לא הצלחנו לבדוק שעות. נסו שוב.</div>'; });
  }
  function sync() { var b = document.getElementById('go'); if (b) b.disabled = busy || !(st.svc && st.day && st.time); }
  function daysHtml() {
    return '<div class="chips">' + D.days.map(function (d) { return '<button type="button" class="chip" data-d="' + d.d + '"' + (d.closed ? ' disabled' : '') + ' aria-pressed="' + (st.day === d.d) + '">' + esc(d.w) + '<small>' + d.label + '</small></button>'; }).join('') + '</div>';
  }
  function head(n, t) { return '<div class="card"><h2>' + n + '. ' + t + '</h2>'; }
  function main() {
    app.innerHTML = head(1, 'מה לקבוע') + (D.services.length ? D.services.map(function (s) { return '<button type="button" class="svc" data-s="' + esc(s.id) + '" aria-pressed="false"><span><b>' + esc(s.name) + '</b><small>' + s.minutes + ' דק׳</small></span><span>' + s.price + ' ₪</span></button>'; }).join('') : '<div class="none">עוד אין שירותים לקביעה.</div>') + '</div>'
      + head(2, 'באיזה יום') + daysHtml() + '</div>' + head(3, 'באיזו שעה') + '<div id="times"><div class="none">בחרו שירות ויום, ואז יופיעו השעות הפנויות.</div></div></div>'
      + head(4, 'הפרטים שלך') + '<label for="nm">שם מלא</label><input type="text" id="nm" autocomplete="name" maxlength="40"><label for="ph">טלפון נייד</label><input type="tel" id="ph" autocomplete="tel" inputmode="tel" placeholder="050 1234567">'
      + '<div class="hp" aria-hidden="true"><label>אתר<input type="text" id="web" tabindex="-1" autocomplete="off"></label></div>'
      + '<p class="consent">בשליחה הפרטים נשמרים אצל ' + esc(D.name) + ' לצורך קביעת התור ותזכורת אליו.</p><div class="say" id="say" role="status"></div><button type="button" class="go" id="go" disabled>' + (D.demo ? 'לקבוע תור (הדגמה)' : 'לקבוע תור') + '</button></div>';
    // a link that opens on a service, a day, a time: the choices are made for her, and she can change every one of them
    st.pre = D.pre && typeof D.pre === 'object' ? D.pre : null;
    app.onclick = function (e) {
      var s = e.target.closest('[data-s]'), d = e.target.closest('[data-d]'), t = e.target.closest('[data-t]');
      if (s) { st.svc = D.services.filter(function (x) { return x.id === s.getAttribute('data-s'); })[0]; st.time = ''; [].forEach.call(app.querySelectorAll('.svc'), function (b) { b.setAttribute('aria-pressed', b === s ? 'true' : 'false'); }); getSlots(); }
      else if (d && !d.disabled) { st.day = d.getAttribute('data-d'); st.time = ''; [].forEach.call(app.querySelectorAll('[data-d]'), function (b) { b.setAttribute('aria-pressed', b === d ? 'true' : 'false'); }); getSlots(); }
      else if (t) { st.time = t.getAttribute('data-t'); [].forEach.call(app.querySelectorAll('[data-t]'), function (b) { b.setAttribute('aria-pressed', b === t ? 'true' : 'false'); }); sync(); }
      else if (e.target.id === 'go') submit();
      sync();
    };
  }
  function submit() {
    if (busy) return; var say = document.getElementById('say'), nm = document.getElementById('nm').value, ph = document.getElementById('ph').value;
    if (!nm.trim() || !ph.trim()) { say.textContent = 'מלאו שם וטלפון.'; return; }
    busy = true; sync(); say.textContent = 'שולחים...';
    post('/api/book', { l: D.l, ft: D.ft, cid: cid, service: st.svc.id, start: st.day + ' ' + st.time, name: nm, phone: ph, website: document.getElementById('web').value }).then(function (j) {
      busy = false; if (j.ft) D.ft = j.ft; // a form token is good once: every answer brings the next one
      if (j.ok && j.booking) return done(j);
      if (j.ok) { say.textContent = ''; return; }
      say.textContent = ERR[j.error] || 'לא הצלחנו לקבוע. נסו שוב בעוד רגע.';
      if (j.error === 'conflict') { st.time = ''; getSlots(); }
      sync();
    });
  }
  function done(j) {
    var b = j.booking;
    app.innerHTML = '<div class="ok" role="status"><h2>התור נקבע</h2><div class="row"><span>שירות</span><b>' + esc(b.service) + '</b></div><div class="row"><span>מתי</span><b>' + esc(b.when) + '</b></div><div class="row"><span>שם</span><b>' + esc(b.name) + '</b></div></div>'
      + '<a class="btn" href="' + esc(j.ics) + '">להוסיף ליומן</a><a class="btn alt" href="' + esc(j.mine) + '">אישור הגעה, שינוי או ביטול</a>'
      + '<p class="consent">שמרו את הקישור האישי. דרכו אפשר לאשר הגעה, לשנות שעה או לבטל.</p>' + (D.demo ? '<p class="consent">זו הדגמה: שום דבר לא נשמר.</p>' : '');
  }
  function mine() {
    var m = D.mine, st2 = m.status, cancelled = st2 === 'cancelled', over = m.past;
    var h = '<div class="ok"><h2>' + (cancelled ? 'התור בוטל' : st2 === 'confirmed' ? 'ההגעה אושרה' : 'התור שלך') + '</h2><div class="row"><span>שירות</span><b>' + esc(m.service) + '</b></div><div class="row"><span>מתי</span><b>' + esc(m.when) + '</b></div><div class="row"><span>שם</span><b>' + esc(m.who) + '</b></div></div>';
    if (cancelled) h += '<a class="btn" href="/b/' + D.l + '">לבחור שעה אחרת</a>';
    else if (!over) h += (st2 === 'confirmed' ? '' : '<button type="button" class="go" data-a="confirm">אישור הגעה</button>') + '<button type="button" class="btn alt" data-a="move">לשנות שעה</button><button type="button" class="btn alt" data-a="cancel">לבטל את התור</button><div id="mv"></div>';
    h += '<div class="say" id="say" role="status"></div>';
    app.innerHTML = h;
    app.onclick = function (e) {
      var a = e.target.closest('[data-a]'), t = e.target.closest('[data-t]'), d = e.target.closest('[data-d]'), say = document.getElementById('say'); if (!a && !t && !d) return;
      if (d && !d.disabled) { st.day = d.getAttribute('data-d'); st.time = ''; [].forEach.call(app.querySelectorAll('[data-d]'), function (b) { b.setAttribute('aria-pressed', b === d ? 'true' : 'false'); }); st.svc = { id: D.serviceId }; getSlots(); return; }
      if (t) { st.time = t.getAttribute('data-t'); [].forEach.call(app.querySelectorAll('[data-t]'), function (b) { b.setAttribute('aria-pressed', b === t ? 'true' : 'false'); }); return; }
      var act = a.getAttribute('data-a');
      if (act === 'move') { document.getElementById('mv').innerHTML = '<div class="card"><h2>שעה חדשה</h2>' + daysHtml() + '<div id="times" class="mt"></div><button type="button" class="go" data-a="move2">לעבור לשעה הזאת</button></div>'; return; }
      var body = { l: D.l, tok: D.tok, action: act === 'move2' ? 'move' : act };
      if (act === 'move2') { if (!st.day || !st.time) { say.textContent = 'בחרו יום ושעה.'; return; } body.start = st.day + ' ' + st.time; }
      if (act === 'cancel' && !a.getAttribute('data-sure')) { a.setAttribute('data-sure', '1'); a.textContent = 'לבטל באמת'; return; }
      say.textContent = 'שולחים...';
      post('/api/book/act', body).then(function (j) {
        if (!j.ok) { say.textContent = ERR[j.error] || 'לא הצלחנו. נסו שוב בעוד רגע.'; return; }
        if (j.status === 'cancelled') { D.mine.status = 'cancelled'; mine(); document.getElementById('say').textContent = 'התור בוטל. אפשר לבחור שעה אחרת.'; }
        else if (j.status === 'confirmed') { D.mine.status = 'confirmed'; mine(); }
        else { D.mine.when = j.when || D.mine.when; D.mine.status = 'booked'; mine(); document.getElementById('say').textContent = 'התור עבר לשעה החדשה.'; }
      });
    };
  }
  function applyPre() {
    var p = st.pre, el; if (!p) return;
    if (p.s) { el = app.querySelector('[data-s="' + p.s + '"]'); if (el) el.click(); }
    if (p.d) { el = app.querySelector('[data-d="' + p.d + '"]'); if (el && !el.disabled) el.click(); }
  }
  if (D.mine) mine(); else { main(); applyPre(); }
}

module.exports = { create, cleanPre, BASE, DEMO_LINK, DEMO_TOK, LIMITS, CALM, clientJs };
