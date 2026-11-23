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
const ERRORS = ['link', 'off', 'tenant', 'date', 'service', 'name', 'phone', 'start', 'conflict', 'limit', 'full', 'unconfirmed', 'rate', 'notfound', 'cancelled', 'past', 'late', 'bad', 'big'];

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
  return { slotMinutes: intIn(r.slotMinutes, 5, 120) || 15, cancelHours: typeof r.cancelHours === 'number' && [0, 2, 4, 12, 24, 48].indexOf(r.cancelHours) >= 0 ? r.cancelHours : 24,
    ownerPhone: /^972\d{8,9}$/.test(String(r.ownerPhone)) ? String(r.ownerPhone) : '', name: cap(r.name, 80) || 'העסק', accent: [acc[0] || '#2f6f4f', acc[1] || '#e6f3ec', acc[2] || '#ffffff'], fem: !!r.fem, services, days };
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
  function clientData(l, info, ft, extra) { return Object.assign({ l, name: info.name, ft, days: info.days, services: info.services, cancelHours: info.cancelHours, ownerPhone: info.ownerPhone, demo: false }, extra || {}); }
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
    return html(200, shell('קביעת תור אצל ' + info.name, info, '<main>' + head(info, 'קובעים תור בכמה לחיצות', true) + '<div id="app"></div></main><div class="strip" aria-hidden="true"></div>',
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
    return html(200, shell('התור שלך אצל ' + info.name, info, '<main>' + head(info, 'התור שלך', false) + '<div id="app"></div></main><div class="strip" aria-hidden="true"></div>',
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
    if (r.ok !== true) { const e = errOf(r); return json(e === 'notfound' ? 404 : e === 'rate' ? 429 : e === 'conflict' || e === 'past' || e === 'cancelled' || e === 'late' ? 409 : 400, { error: e }); }
    return json(200, { ok: true, status: ['booked', 'confirmed', 'cancelled'].indexOf(r.status) >= 0 ? r.status : 'booked', when: cap(r.when, 60), start: ISO.test(String(r.start)) ? String(r.start) : '' });
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

// the business's ring: the first letter of the name's last word inside the monitor's turning four colours
function head(info, sub, prog) {
  const words = String(info.name || '').trim().split(/\s+/), ch = (words[words.length - 1] || '').charAt(0);
  return '<header class="hd"><div class="av" aria-hidden="true"><span>' + esc(ch) + '</span></div><div><h1>' + esc(info.name) + '</h1><p>' + esc(sub) + '</p></div></header>'
    + (prog ? '<div class="prog" id="prog" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' : '');
}
function shell(title, info, body, script) {
  const a = info.accent || ['#2f6f4f', '#e6f3ec', '#fff'];
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="' + a[1] + '">'
    + '<title>' + esc(title) + '</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" rel="stylesheet">'
    + '<style>:root{--a:' + a[0] + ';--s:' + a[1] + ';--o:' + (a[2] || '#fff') + ';--ink:#1f1623;--dim:#6a5a6d;--line:color-mix(in srgb,var(--a) 14%,#e7e2ea);--gb:#4285F4;--gr:#EA4335;--gy:#FBBC05;--gg:#34A853}*{box-sizing:border-box}html{-webkit-tap-highlight-color:transparent}::selection{background:color-mix(in srgb,var(--a) 26%,transparent)}body{margin:0;min-height:100vh;overflow-x:hidden;color:var(--ink);font-family:Heebo,system-ui,sans-serif;font-size:16px;line-height:1.5;caret-color:var(--a);background:radial-gradient(120% 55% at 50% -8%,color-mix(in srgb,var(--a) 24%,#fff) 0,transparent 64%),linear-gradient(180deg,color-mix(in srgb,var(--s) 75%,#fff) 0,#fcf9fc 60%);background-attachment:fixed}main{max-width:520px;margin:0 auto;padding:20px 16px 76px}@property --h{syntax:"<angle>";inherits:false;initial-value:0deg}@keyframes spin{to{--h:360deg}}.av::before,.svc[aria-pressed=true]::after,.day[aria-pressed=true]::before,.tm[aria-pressed=true]::before,.go:not(:disabled)::before,.big::before{content:"";position:absolute;pointer-events:none;background:conic-gradient(from var(--h),var(--gb),var(--gr),var(--gy),var(--gg),var(--gb));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:spin 3.2s linear infinite}.hd{display:flex;align-items:center;gap:14px;margin:2px 0 16px}.av{position:relative;flex:none;width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:#fff;box-shadow:0 8px 20px -6px color-mix(in srgb,var(--a) 45%,transparent)}.av::before{inset:-4px;border-radius:50%;padding:3px;animation-duration:7s}.av span{font:800 25px Heebo,sans-serif;color:var(--a)}.hd h1{margin:0;font-size:24px;font-weight:800;letter-spacing:-.015em;line-height:1.2;text-wrap:balance}.hd p{margin:2px 0 0;color:var(--dim);font-size:15px}.prog{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:0 0 18px}.prog i{position:relative;height:6px;border-radius:6px;overflow:hidden;background:color-mix(in srgb,var(--a) 10%,#ebe6ee)}.prog i::after{content:"";position:absolute;inset:0;border-radius:inherit;transform:scaleX(0);transform-origin:right;transition:transform .6s cubic-bezier(.2,.8,.2,1)}.prog i:nth-child(1)::after{background:var(--gb)}.prog i:nth-child(2)::after{background:var(--gr)}.prog i:nth-child(3)::after{background:var(--gy)}.prog i:nth-child(4)::after{background:var(--gg)}.prog i.on::after{transform:none}.card{position:relative;background:#fff;border-radius:16px;padding:16px;margin:0 0 14px;box-shadow:0 1px 2px rgba(45,20,45,.05),0 10px 26px -14px color-mix(in srgb,var(--a) 38%,transparent);animation:rise .5s cubic-bezier(.2,.8,.2,1) both}.c2{animation-delay:.06s}.c3{animation-delay:.12s}.c4{animation-delay:.18s}@keyframes rise{from{opacity:0;transform:translateY(12px)}}.card h2{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:17px;font-weight:800}.card h2 b{display:grid;place-items:center;flex:none;width:26px;height:26px;border-radius:50%;font-size:14px;color:#fff;background:var(--c,var(--a));transition:transform .3s}.c1{--c:var(--gb)}.c2{--c:var(--gr)}.c3{--c:var(--gy)}.c3 h2 b{color:#3d2c00}.c4{--c:var(--gg)}.card.done h2 b{transform:scale(1.12)}.svc{position:relative;display:block;width:100%;padding:0;margin:0 0 10px;border:0;background:none;font:inherit;color:inherit;text-align:start;cursor:pointer;perspective:900px}.svc .in{display:grid;transform-style:preserve-3d;transition:transform .65s cubic-bezier(.3,1.35,.4,1)}.svc[aria-pressed=true] .in{transform:rotateY(180deg)}.svc .f,.svc .k{grid-area:1/1;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:64px;padding:12px 14px;border-radius:14px;-webkit-backface-visibility:hidden;backface-visibility:hidden}.svc .f{background:#fff;border:1.5px solid var(--line);transition:border-color .2s}.svc:hover .f{border-color:color-mix(in srgb,var(--a) 45%,var(--line))}.svc .k{transform:rotateY(180deg);background:var(--a);color:var(--o)}.svc b{font-weight:700}.svc small{display:block;font-size:13.5px;color:var(--dim)}.svc .k small{color:inherit;opacity:.85}.svc .pr{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}.svc .ck{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.22)}.svc[aria-pressed=true]::after{inset:-4px;border-radius:18px;padding:2.5px}.days{display:flex;gap:12px;overflow-x:auto;padding:13px 12px 14px;margin:-4px -12px 0;scroll-padding:0 12px;scroll-snap-type:x proximity;scrollbar-width:none}.days::-webkit-scrollbar{width:0;height:0}.day{position:relative;flex:none;width:64px;height:64px;border-radius:50%;border:1.5px solid var(--line);background:#fff;font:inherit;color:inherit;cursor:pointer;display:grid;place-content:center;text-align:center;line-height:1.15;scroll-snap-align:start;transition:transform .3s cubic-bezier(.3,1.5,.4,1),background .25s,color .25s}.day b{font-size:14.5px;font-weight:800}.day small{display:block;font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}.day[aria-pressed=true]{background:var(--a);color:var(--o);border-color:transparent;transform:scale(1.08)}.day[aria-pressed=true] small{color:inherit}.day[aria-pressed=true]::before{inset:-6px;border-radius:50%;padding:2.5px}.day:disabled{opacity:.35;cursor:not-allowed}.times{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:9px}.tm{position:relative;min-height:48px;border:1.5px solid var(--line);border-radius:12px;background:#fff;font:700 16px Heebo,system-ui,sans-serif;color:inherit;cursor:pointer;font-variant-numeric:tabular-nums;transition:background .25s,color .25s}.tm[aria-pressed=true]{background:var(--a);color:var(--o);border-color:transparent;animation:turn .55s cubic-bezier(.3,1.35,.4,1)}.tm[aria-pressed=true]::before{inset:-5px;border-radius:16px;padding:2.5px}@keyframes turn{from{transform:perspective(400px) rotateX(-180deg)}}label{display:block;font-weight:700;font-size:14px;margin:12px 0 5px}input[type=text],input[type=tel]{width:100%;min-height:50px;padding:0 14px;border:1.5px solid var(--line);border-radius:12px;font:inherit;background:#fff;color:var(--ink);transition:border-color .2s,box-shadow .2s}input::placeholder{color:#8f8193}input:focus{outline:none;border-color:var(--a);box-shadow:0 0 0 4px color-mix(in srgb,var(--a) 16%,transparent)}.hp{position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none}.consent{font-size:13.5px;color:var(--dim);margin:12px 0 0}.go,.btn{position:relative;display:block;width:100%;min-height:54px;margin-top:14px;border:0;border-radius:15px;background:var(--a);color:var(--o);font:800 17px Heebo,system-ui,sans-serif;cursor:pointer;text-align:center;text-decoration:none;padding:15px;box-shadow:0 12px 24px -12px color-mix(in srgb,var(--a) 75%,transparent);transition:transform .15s,opacity .2s}.go:not(:disabled)::before{inset:-4px;border-radius:19px;padding:2.5px}.go:active,.btn:active{transform:scale(.98)}.go:disabled{opacity:.42;cursor:not-allowed;box-shadow:none}.btn.alt{background:#fff;color:var(--a);border:1.5px solid color-mix(in srgb,var(--a) 45%,#fff);box-shadow:none}.say{min-height:22px;color:#b3261e;font-weight:600;margin-top:10px}.say:not(:empty){animation:rise .3s both}.none{color:var(--dim);padding:6px 0}.terms{margin:12px 0 0;padding:10px 12px;border-radius:12px;text-align:center;background:color-mix(in srgb,var(--a) 8%,#fff);color:color-mix(in srgb,var(--a) 72%,var(--ink));font-size:14px;font-weight:700}.late{margin-top:14px;padding:14px;border-radius:14px;background:color-mix(in srgb,var(--gr) 8%,#fff);text-align:start;animation:rise .4s both}.late p{margin:0 0 4px;font-weight:600}.mt{margin-top:10px}.ok{position:relative;background:#fff;border-radius:16px;padding:22px 16px 10px;margin:0 0 6px;text-align:center;box-shadow:0 1px 2px rgba(45,20,45,.05),0 14px 34px -16px color-mix(in srgb,var(--a) 45%,transparent);animation:rise .5s both}.big{position:relative;width:98px;height:98px;margin:6px auto 14px;border-radius:50%;display:grid;place-items:center;background:var(--a);box-shadow:0 16px 30px -12px color-mix(in srgb,var(--a) 80%,transparent);animation:pop .7s cubic-bezier(.3,1.5,.4,1) both}.big.off{background:#8f8193}.big::before{inset:-8px;border-radius:50%;padding:4px;animation-duration:2.6s}@keyframes pop{from{transform:scale(.3);opacity:0}}.big svg{width:48px;height:48px}.big path{fill:none;stroke:#fff;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:70;stroke-dashoffset:70;animation:draw .55s .35s ease-out forwards}@keyframes draw{to{stroke-dashoffset:0}}.ok h2{margin:0 0 4px;font-size:23px;font-weight:800;letter-spacing:-.01em}.ok .lead{margin:0 0 12px;color:var(--dim)}.row{display:flex;justify-content:space-between;gap:10px;padding:11px 2px;border-top:1px solid var(--line);text-align:start;animation:rise .45s both}.row span:first-child{color:var(--dim)}.row:nth-of-type(2){animation-delay:.45s}.row:nth-of-type(3){animation-delay:.55s}.row:nth-of-type(4){animation-delay:.65s}.ping{position:absolute;left:var(--x);top:var(--y);width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2.5px solid var(--pc);pointer-events:none;z-index:4;animation:ping .7s cubic-bezier(.2,.8,.2,1) forwards}@keyframes ping{to{transform:scale(8);opacity:0}}.spk{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;pointer-events:none;z-index:4;animation:spk .95s cubic-bezier(.2,.8,.2,1) forwards}@keyframes spk{to{transform:translate(var(--x),var(--y)) scale(.25);opacity:0}}.strip{position:fixed;left:0;right:0;bottom:0;height:4px;z-index:5;background:linear-gradient(90deg,var(--gb) 0 25%,var(--gr) 25% 50%,var(--gy) 50% 75%,var(--gg) 75%)}.go:focus-visible,.btn:focus-visible,.tm:focus-visible,.day:focus-visible,.svc:focus-visible{outline:3px solid var(--a);outline-offset:3px}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.svc[aria-pressed=true] .in{transform:none}.svc .k{transform:none;visibility:hidden}.svc[aria-pressed=true] .k{visibility:visible}.svc[aria-pressed=true] .f{visibility:hidden}.big path{stroke-dashoffset:0}}</style></head><body>' + body + script + '</body></html>';
}
const notFound = () => '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>הקישור לא נמצא</title></head>'
  + '<body style="font-family:Heebo,Arial,sans-serif;text-align:center;padding:18vh 20px"><h1>הקישור לא נמצא</h1><p>ייתכן שהוא הוחלף. אפשר לבקש מבעל העסק קישור חדש.</p></body></html>';

// The page side, put on the page with toString. Plain ES5. D = the business and the choices, core = bookings.core.
function clientJs(D, coreFn) {
  var COL = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'], CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CALMED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the monitor's pulse where the finger touched, and its sparks
  function ping(el, e, c) { if (CALMED || !el) return; var r = el.getBoundingClientRect(), p = document.createElement('i'), x = e && e.clientX ? e.clientX - r.left : r.width / 2, y = e && e.clientY ? e.clientY - r.top : r.height / 2;
    p.className = 'ping'; p.style.setProperty('--x', x + 'px'); p.style.setProperty('--y', y + 'px'); p.style.setProperty('--pc', c); el.appendChild(p); setTimeout(function () { p.remove(); }, 750); }
  function sparks(el) { if (CALMED || !el) return; for (var i = 0; i < 16; i++) { var k = document.createElement('i'), a = (i / 16) * 6.283 + Math.random() * .3, d = 70 + Math.random() * 50; k.className = 'spk'; k.style.background = COL[i % 4];
    k.style.setProperty('--x', Math.cos(a) * d + 'px'); k.style.setProperty('--y', Math.sin(a) * d + 'px'); k.style.animationDelay = (.25 + Math.random() * .15) + 's'; el.appendChild(k); (function (n) { setTimeout(function () { n.remove(); }, 1500); })(k); } }
  // the four colour progress: service, day, time, details
  function prog(all) { var p = document.getElementById('prog'); if (!p) return; var nm = document.getElementById('nm'), ph = document.getElementById('ph');
    var on = all ? [1, 1, 1, 1] : [st.svc, st.day, st.time, nm && ph && nm.value.trim().length > 1 && ph.value.replace(/\D/g, '').length >= 9];
    [].forEach.call(p.children, function (x, i) { x.classList.toggle('on', !!on[i]); });
    [].forEach.call(app.querySelectorAll('.card'), function (c, i) { c.classList.toggle('done', !!on[i]); }); }
  var K = coreFn(), app = document.getElementById('app'), st = { svc: null, day: '', time: '', slots: null }, busy = false, cid = Math.random().toString(36).slice(2);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ERR = { conflict: 'השעה הזאת נתפסה בינתיים. בחרו שעה אחרת.', closed: 'השעה הזאת מחוץ לשעות הפעילות.', past: 'השעה הזאת כבר עברה.', rate: 'נשלחו הרבה בקשות. נסו שוב בעוד כמה דקות.',
    phone: 'הטלפון צריך להיות מספר נייד ישראלי, למשל 0501234567.', name: 'צריך שם של 2 עד 40 אותיות.', fast: 'עוד רגע, ואז אפשר לשלוח.', stale: 'הדף פתוח הרבה זמן. טענו אותו מחדש.', down: 'אי אפשר לקבוע כרגע, נסו שוב בעוד כמה דקות.', unavailable: 'אי אפשר לקבוע עכשיו דרך הקישור. אפשר לכתוב לעסק, או לנסות שוב מאוחר יותר.', service: 'בחרו שירות.', start: 'בחרו יום ושעה.', date: 'בחרו יום.' };
  // 23.11.2026: the owner's cancellation terms, on the booking page, the confirmation and the client's own page
  ERR.late = 'כבר פחות מ ' + D.cancelHours + ' שעות לפני התור. לביטול או שינוי צריך לפנות לבעלת העסק.';
  function termsLine(link) {
    var h = D.cancelHours, tail = link ? ', בקישור שיישלח אלייך.' : '.';
    return h > 0 ? 'ביטול או שינוי: עד ' + h + ' שעות לפני התור' + tail : 'אפשר לבטל או לשנות בכל זמן' + tail;
  }
  function isLate() { var m = D.mine; return !!(D.lateSrv || (D.cancelHours > 0 && m && Date.parse(m.start) - Date.now() < D.cancelHours * 3600e3)); }
  function lateHtml() {
    return '<div class="late" role="status"><p>' + esc(ERR.late) + '</p>' + (D.ownerPhone ? '<a class="btn alt" href="https://wa.me/' + esc(D.ownerPhone) + '">לפנות בוואטסאפ</a>' : '') + '</div>';
  }
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
      box.innerHTML = note + (st.slots.length ? '<div class="times">' + st.slots.map(function (s) { return '<button type="button" class="tm" data-t="' + s.time + '" aria-pressed="' + (st.time === s.time) + '">' + s.time + '</button>'; }).join('') + '</div>' : '<div class="none">אין שעה פנויה ביום הזה. בחרו יום אחר.</div>');
      if (pre && !st.scrolled) { st.scrolled = true; try { box.scrollIntoView({ block: 'center' }); } catch (e) { /* no scrolling */ } }
      sync();
    }, function () { box.innerHTML = '<div class="none">לא הצלחנו לבדוק שעות. נסו שוב.</div>'; });
  }
  function sync() { var b = document.getElementById('go'); if (b) b.disabled = busy || !(st.svc && st.day && st.time); prog(); }
  function daysHtml() {
    return '<div class="days">' + D.days.map(function (d) { return '<button type="button" class="day" data-d="' + d.d + '"' + (d.closed ? ' disabled' : '') + ' aria-pressed="' + (st.day === d.d) + '"><b>' + esc(d.w) + '</b><small>' + d.label + '</small></button>'; }).join('') + '</div>';
  }
  function head(n, t) { return '<div class="card c' + n + '"><h2><b>' + n + '</b>' + t + '</h2>'; }
  function main() {
    app.innerHTML = head(1, 'מה לקבוע') + (D.services.length ? D.services.map(function (s) { return '<button type="button" class="svc" data-s="' + esc(s.id) + '" aria-pressed="false"><span class="in"><span class="f"><span><b>' + esc(s.name) + '</b><small>' + s.minutes + ' דק׳</small></span><span class="pr">' + s.price + ' ₪</span></span>'
        + '<span class="k" aria-hidden="true"><span><b>' + esc(s.name) + '</b><small>נבחר · ' + s.minutes + ' דק׳</small></span><span class="ck">' + CHECK + '</span></span></span></button>'; }).join('') : '<div class="none">עוד אין שירותים לקביעה.</div>') + '</div>'
      + head(2, 'באיזה יום') + daysHtml() + '</div>' + head(3, 'באיזו שעה') + '<div id="times"><div class="none">בחרו שירות ויום, ואז יופיעו השעות הפנויות.</div></div></div>'
      + head(4, 'הפרטים שלך') + '<label for="nm">שם מלא</label><input type="text" id="nm" autocomplete="name" maxlength="40"><label for="ph">טלפון נייד</label><input type="tel" id="ph" autocomplete="tel" inputmode="tel" placeholder="050 1234567">'
      + '<div class="hp" aria-hidden="true"><label>אתר<input type="text" id="web" tabindex="-1" autocomplete="off"></label></div>'
      + '<p class="consent">בשליחה הפרטים נשמרים אצל ' + esc(D.name) + ' לצורך קביעת התור ותזכורת אליו.</p><div class="say" id="say" role="status"></div><button type="button" class="go" id="go" disabled>' + (D.demo ? 'לקבוע תור (הדגמה)' : 'לקבוע תור') + '</button><p class="terms">' + termsLine(true) + '</p></div>';
    // a link that opens on a service, a day, a time: the choices are made for her, and she can change every one of them
    st.pre = D.pre && typeof D.pre === 'object' ? D.pre : null;
    app.oninput = function () { prog(); };
    app.onclick = function (e) {
      var s = e.target.closest('[data-s]'), d = e.target.closest('[data-d]'), t = e.target.closest('[data-t]');
      if (s) ping(s, e, COL[0]); else if (d && !d.disabled) ping(d, e, COL[1]); else if (t) ping(t, e, COL[2]); else if (e.target.id === 'go' && !e.target.disabled) ping(e.target, e, COL[3]);
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
    prog(true);
    app.innerHTML = '<div class="ok" role="status"><div class="big" id="big"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 25l8 8 16-17"/></svg></div><h2>התור נקבע</h2><p class="lead">אצל ' + esc(D.name) + '</p><div class="row"><span>שירות</span><b>' + esc(b.service) + '</b></div><div class="row"><span>מתי</span><b>' + esc(b.when) + '</b></div><div class="row"><span>שם</span><b>' + esc(b.name) + '</b></div></div>'
      + '<a class="btn" href="' + esc(j.ics) + '">להוסיף ליומן</a><a class="btn alt" href="' + esc(j.mine) + '">אישור הגעה, שינוי או ביטול</a>'
      + '<p class="terms">' + termsLine(false) + '</p><p class="consent">שמרו את הקישור האישי. דרכו אפשר לאשר הגעה, לשנות שעה או לבטל.</p>' + (D.demo ? '<p class="consent">זו הדגמה: שום דבר לא נשמר.</p>' : '');
    sparks(document.getElementById('big')); try { window.scrollTo({ top: 0, behavior: CALMED ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }
  function mine() {
    var m = D.mine, st2 = m.status, cancelled = st2 === 'cancelled', over = m.past;
    var h = '<div class="ok"><div class="big' + (cancelled ? ' off' : '') + '" id="big"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="' + (cancelled ? 'M15 15l18 18M33 15L15 33' : st2 === 'confirmed' ? 'M12 25l8 8 16-17' : 'M24 12v13l8 5') + '"/></svg></div><h2>' + (cancelled ? 'התור בוטל' : st2 === 'confirmed' ? 'ההגעה אושרה' : 'התור שלך') + '</h2><div class="row"><span>שירות</span><b>' + esc(m.service) + '</b></div><div class="row"><span>מתי</span><b>' + esc(m.when) + '</b></div><div class="row"><span>שם</span><b>' + esc(m.who) + '</b></div></div>';
    if (cancelled) h += '<a class="btn" href="/b/' + D.l + '">לבחור שעה אחרת</a>';
    else if (!over) h += (st2 === 'confirmed' ? '' : '<button type="button" class="go" data-a="confirm">אישור הגעה</button>') + (isLate() ? lateHtml() : '<button type="button" class="btn alt" data-a="move">לשנות שעה</button><button type="button" class="btn alt" data-a="cancel">לבטל את התור</button><div id="mv"></div>');
    if (!cancelled && !over) h += '<p class="terms">' + termsLine(false) + '</p>';
    h += '<div class="say" id="say" role="status"></div>';
    app.innerHTML = h;
    app.onclick = function (e) {
      var a = e.target.closest('[data-a]'), t = e.target.closest('[data-t]'), d = e.target.closest('[data-d]'), say = document.getElementById('say'); if (!a && !t && !d) return;
      if (d && !d.disabled) { st.day = d.getAttribute('data-d'); st.time = ''; [].forEach.call(app.querySelectorAll('[data-d]'), function (b) { b.setAttribute('aria-pressed', b === d ? 'true' : 'false'); }); st.svc = { id: D.serviceId }; getSlots(); return; }
      if (t) { ping(t, e, COL[2]); st.time = t.getAttribute('data-t'); [].forEach.call(app.querySelectorAll('[data-t]'), function (b) { b.setAttribute('aria-pressed', b === t ? 'true' : 'false'); }); return; }
      if (a) ping(a, e, COL[a.getAttribute('data-a') === 'cancel' ? 1 : 3]);
      var act = a.getAttribute('data-a');
      if (act === 'move') { document.getElementById('mv').innerHTML = '<div class="card"><h2>שעה חדשה</h2>' + daysHtml() + '<div id="times" class="mt"></div><button type="button" class="go" data-a="move2">לעבור לשעה הזאת</button></div>'; return; }
      var body = { l: D.l, tok: D.tok, action: act === 'move2' ? 'move' : act };
      if (act === 'move2') { if (!st.day || !st.time) { say.textContent = 'בחרו יום ושעה.'; return; } body.start = st.day + ' ' + st.time; }
      if (act === 'cancel' && !a.getAttribute('data-sure')) { a.setAttribute('data-sure', '1'); a.textContent = 'לבטל באמת'; return; }
      say.textContent = 'שולחים...';
      post('/api/book/act', body).then(function (j) {
        if (!j.ok && j.error === 'late') { D.lateSrv = true; mine(); document.getElementById('say').textContent = ERR.late; return; }
        if (!j.ok) { say.textContent = ERR[j.error] || 'לא הצלחנו. נסו שוב בעוד רגע.'; return; }
        if (j.status === 'cancelled') { D.mine.status = 'cancelled'; mine(); document.getElementById('say').textContent = 'התור בוטל. אפשר לבחור שעה אחרת.'; }
        else if (j.status === 'confirmed') { D.mine.status = 'confirmed'; mine(); sparks(document.getElementById('big')); }
        else { D.mine.when = j.when || D.mine.when; if (j.start) D.mine.start = j.start; D.mine.status = 'booked'; mine(); document.getElementById('say').textContent = 'התור עבר לשעה החדשה.'; }
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
