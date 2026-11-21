'use strict';
/*
  21.11.2026, Itzik: "if she has no appointment management she will not buy the monitor". The monitor becomes the
  booking system of a service provider (the cosmetician first, lib/trades.js bookings:true).

  This module is the single source of truth for appointments. Pure node, no network, no model. Phase 1 writes it from
  the CLI (booking.js) that the monitor's own session runs; phase 2 (a public booking page, reminders, confirm and
  cancel by link) calls the same functions, so the store is shaped for it.

    data/bookings/config.json      { hours: {0..6: [["09:00","17:00"], ...]}, services: [{id,name,minutes,price}],
                                     slotMinutes: 15, bufferMinutes: 0 }          0 = Sunday, an empty array = closed
    data/bookings/items/<id>.json  { id, start, end (ISO with the Israel offset), serviceId, service, name, phone,
                                     clientId, status: booked|confirmed|cancelled|done|noshow, src: owner|link|chat,
                                     note, createdAt, updatedAt }

  Every write is atomic (temp file, then rename). add and move never throw on user input: they return
  { ok: false, error: 'conflict'|'closed'|'past'|'bad', with: [...] }. Times are Israel time, DST included (Intl with
  Asia/Jerusalem, nothing hard coded): "2026-11-22 10:00" in, "2026-11-22T10:00:00+02:00" stored.

  core() is pure ES5 and self contained: the page (lib/bookings-ui.js) takes it with toString, so the free slots
  shown in the page are computed by the very same code as in node.

  The monitor's page is static, so a change shows after a rebuild: the session that ran booking.js then runs
  node build.js and node push.js (as it does for a quote). Nothing in here rebuilds.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATUSES = ['booked', 'confirmed', 'cancelled', 'done', 'noshow'];
const SOURCES = ['owner', 'link', 'chat'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const GRACE_MS = 60e3; // a booking for "right now" is not in the past

// ---- the write lock ----
// These files belong to ONE tenant and are written by that tenant's own processes only (its agent, its listener, its worker,
// the CLI): the platform never opens them (lib/book-page.js talks to lib/book-agent.js). The lock is a directory made with
// mkdir (atomic), so the same slot can never be given twice by two writers. A lock older than STALE_MS is a crashed
// writer's: it is taken over by an atomic rename of the directory. Inside one process the lock is reentrant while the
// work runs. withLock waits in a short sleep (CLI, listener handler, tests); withLockAsync waits with timers, so the
// agent never blocks its event loop while another process holds the lock.
const LOCK_WAIT_MS = 5000, STALE_MS = 30000;
const held = new Map(); // folder -> the nonce of the lock this process holds
const lockDir = (dp) => path.join(dp, 'bookings', '.lock.d');
function sleepMs(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) { const t = Date.now(); while (Date.now() - t < ms) { /* spin */ } }
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
function readOwner(l) { try { const o = JSON.parse(fs.readFileSync(path.join(l, 'owner'), 'utf8')); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
// A lock belongs to a pid and a random nonce (the file "owner" inside the lock directory). It is taken over only when that pid is
// not alive, or when it is older than STALE_MS (a lock without an owner file counts only by age). The takeover is an atomic rename
// of the directory to a unique name, and the nonce is read again AFTER the rename: if it is not the one that was judged, a live
// holder was moved by mistake and the directory is put back.
function maybeBreak(l) {
  let st; try { st = fs.statSync(l); } catch (e) { return; }
  const o = readOwner(l), age = Date.now() - st.mtimeMs;
  const dead = !!(o && Number.isInteger(o.pid) && o.pid !== process.pid && !alive(o.pid));
  if (!dead && age <= STALE_MS) return;
  const x = l + '.stale.' + crypto.randomBytes(4).toString('hex');
  try { fs.renameSync(l, x); } catch (e) { return; } // someone else took it over first
  const o2 = readOwner(x);
  if ((o && o2 && o.nonce === o2.nonce) || (!o && !o2)) { try { fs.rmSync(x, { recursive: true, force: true }); } catch (e) { /* gone */ } return; }
  try { fs.renameSync(x, l); } catch (e) { /* a new lock already stands there: the moved one is left for its holder to notice */ }
}
function tryAcquire(dp) {
  const l = lockDir(dp);
  fs.mkdirSync(path.dirname(l), { recursive: true });
  try { fs.mkdirSync(l); } catch (e) { if (e.code !== 'EEXIST') throw e; maybeBreak(l); return ''; }
  const nonce = crypto.randomBytes(8).toString('hex');
  try { fs.writeFileSync(path.join(l, 'owner'), JSON.stringify({ pid: process.pid, nonce }), { flag: 'wx' }); } catch (e) { /* the age rule covers a lock without an owner */ }
  return nonce;
}
// released only if the lock is still ours (the nonce): a lock that was taken over meanwhile is not removed from under its new holder
function release(dp, nonce) { const l = lockDir(dp), o = readOwner(l); if (o && o.nonce === nonce) { try { fs.rmSync(l, { recursive: true, force: true }); } catch (e) { /* gone */ } } }
function runHeld(dp, nonce, fn) {
  held.set(dp, nonce);
  try { return fn(); } finally { held.delete(dp); release(dp, nonce); }
}
function withLock(dp, fn) {
  if (held.has(dp)) return fn(); // reentrant: the outer call owns the lock
  if (!safeDirs(dp)) throw new Error('unsafe folder');
  const t0 = Date.now();
  let nonce;
  while (!(nonce = tryAcquire(dp))) {
    if (Date.now() - t0 > LOCK_WAIT_MS) throw new Error('busy');
    sleepMs(10 + Math.floor(Math.random() * 25));
  }
  return runHeld(dp, nonce, fn);
}
// fn must be synchronous (it runs while the lock is held); returns a promise. Waiting is with timers: the event loop keeps running.
async function withLockAsync(dp, fn) {
  if (held.has(dp)) return fn();
  if (!safeDirs(dp)) throw new Error('unsafe folder');
  const t0 = Date.now();
  let nonce;
  while (!(nonce = tryAcquire(dp))) {
    if (Date.now() - t0 > LOCK_WAIT_MS) throw new Error('busy');
    await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 25)));
  }
  return runHeld(dp, nonce, fn);
}
const lockedCall = (dp, fn) => { try { return withLock(dp, fn); } catch (err) { return { ok: false, error: 'bad', with: [], why: String(err && err.message || err) }; } };

// Time and slot arithmetic, pure ES5, no outer references (it is put on the page with toString).
function core() {
  var TZ = 'Asia/Jerusalem', fmt = null;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parts(ms) {
    if (!fmt) fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    var o = {}; fmt.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function ymd(ms) { var p = parts(ms); return p.year + '-' + p.month + '-' + p.day; }
  function hm(ms) { var p = parts(ms); return p.hour + ':' + p.minute; }
  // the offset of Israel at that instant, in minutes (120 in winter, 180 in summer)
  function offsetMin(ms) {
    var p = parts(ms), asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }
  function iso(ms) {
    var o = offsetMin(ms), a = Math.abs(o), p = parts(ms);
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + (o < 0 ? '-' : '+') + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
  }
  // "2026-03-27", "09:30" in Israel -> epoch ms; NaN when that wall clock time does not exist (the spring gap)
  function localToMs(day, time) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day)), t = /^(\d{1,2}):(\d{2})$/.exec(String(time));
    if (!d || !t) return NaN;
    var asUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]), offs = [3, 2];
    for (var i = 0; i < offs.length; i++) {
      var ms = asUtc - offs[i] * 3600e3;
      if (ymd(ms) === day && hm(ms) === pad(+t[1]) + ':' + t[2]) return ms;
    }
    return NaN;
  }
  function addDays(day, n) { var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3] + n)).toISOString().slice(0, 10); }
  function dow(day) { var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).getUTCDay(); }
  function live(items) { return (items || []).filter(function (i) { return i && i.status !== 'cancelled'; }); }
  // the live bookings that touch [s, e) once a buffer is kept around each
  function overlaps(items, s, e, bufferMin, exceptId) {
    var b = (bufferMin || 0) * 60000;
    return live(items).filter(function (i) { return i.id !== exceptId && s < Date.parse(i.end) + b && Date.parse(i.start) < e + b; });
  }
  function ranges(cfg, day) { var r = cfg && cfg.hours && cfg.hours[dow(day)]; return Array.isArray(r) ? r : []; }
  // is [s, e) inside one opening range of that day
  function inHours(cfg, s, e) {
    var day = ymd(s), r = ranges(cfg, day);
    for (var i = 0; i < r.length; i++) { var a = localToMs(day, r[i][0]), b = localToMs(day, r[i][1]); if (s >= a && e <= b) return true; }
    return false;
  }
  // the free start times of a day for a service of `minutes`: [{time, start, end}], never before nowMs
  function slots(cfg, items, day, minutes, nowMs) {
    var out = [], step = Math.max(5, (cfg && cfg.slotMinutes) || 15) * 60000, len = minutes * 60000, r = ranges(cfg, day);
    for (var i = 0; i < r.length; i++) {
      var a = localToMs(day, r[i][0]), b = localToMs(day, r[i][1]);
      if (isNaN(a) || isNaN(b)) continue;
      for (var t = a; t + len <= b; t += step) {
        if (t < nowMs) continue;
        if (overlaps(items, t, t + len, cfg.bufferMinutes).length) continue;
        out.push({ time: hm(t), start: iso(t), end: iso(t + len) });
      }
    }
    return out;
  }
  return { pad: pad, ymd: ymd, hm: hm, iso: iso, offsetMin: offsetMin, localToMs: localToMs, addDays: addDays, dow: dow, overlaps: overlaps, ranges: ranges, inHours: inHours, slots: slots };
}
const C = core();

// ---- files ----
const base = (dp) => path.join(dp, 'bookings');
const itemsDir = (dp) => path.join(base(dp), 'items');
// only a regular file is read: a pipe or a link planted in the folder is "not there" (a pipe would block the reader forever)
function readJson(f, dflt) { try { if (!fs.lstatSync(f).isFile()) return dflt; return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
// temp file, then rename: a reader never sees half a file
function writeAtomic(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { flag: 'wx', mode: 0o644 }); // wx: never writes through a planted file or link
  fs.renameSync(tmp, f);
}
const newId = () => crypto.randomBytes(6).toString('hex');
const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);

// ---- config ----
// The limits of public bookings (the owner can loosen them): per business per hour and per day, per IP per day (counted by the bridge),
// active future bookings per phone, and the unconfirmed ones a phone that has never been confirmed may hold.
const LIMIT_DEFAULTS = { perHour: 12, perDay: 40, ipPerDay: 3, phoneActive: 3, unconfirmedPerPhone: 1 };
const LIMIT_RANGES = { perHour: [1, 200], perDay: [1, 1000], ipPerDay: [1, 100], phoneActive: [1, 20], unconfirmedPerPhone: [1, 20] };
function cleanLimits(l) {
  const o = l && typeof l === 'object' ? l : {}, out = {};
  for (const k of Object.keys(LIMIT_DEFAULTS)) { const v = Math.round(Number(o[k])); out[k] = v >= LIMIT_RANGES[k][0] && v <= LIMIT_RANGES[k][1] ? v : LIMIT_DEFAULTS[k]; }
  return out;
}
const DEFAULT_CONFIG = () => ({
  hours: { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [], 6: [] },
  services: [], slotMinutes: 15, bufferMinutes: 0, limits: Object.assign({}, LIMIT_DEFAULTS),
});
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanHours(h) {
  const out = {};
  for (let d = 0; d < 7; d++) {
    const r = h && Array.isArray(h[d]) ? h[d] : [];
    out[d] = r.filter((x) => Array.isArray(x) && HHMM.test(String(x[0])) && HHMM.test(String(x[1])) && String(x[0]) < String(x[1]))
      .map((x) => [String(x[0]), String(x[1])]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  return out;
}
function cleanServices(list) {
  const seen = {};
  return (Array.isArray(list) ? list : []).map((s) => {
    const name = str(s && s.name, 60), minutes = Math.round(Number(s && s.minutes)), price = Number(s && s.price);
    if (!name || !(minutes >= 5 && minutes <= 600)) return null;
    let id = str(s.id, 20).replace(/[^A-Za-z0-9_]/g, '') || ('s' + newId().slice(0, 6));
    while (seen[id]) id = 's' + newId().slice(0, 6);
    seen[id] = 1;
    return { id, name, minutes, price: price >= 0 ? price : 0 };
  }).filter(Boolean);
}
function cleanConfig(c) {
  const d = DEFAULT_CONFIG(), o = c && typeof c === 'object' ? c : {};
  const slot = Math.round(Number(o.slotMinutes)), buf = Math.round(Number(o.bufferMinutes));
  return {
    hours: o.hours ? cleanHours(o.hours) : d.hours,
    services: cleanServices(o.services),
    slotMinutes: slot >= 5 && slot <= 120 ? slot : d.slotMinutes,
    bufferMinutes: buf >= 0 && buf <= 240 ? buf : d.bufferMinutes,
    // 22.11.2026: the permanent public booking link (the platform maps it to this tenant) and the hour the next day's reminders are built
    linkToken: /^[a-f0-9]{24}$/.test(String(o.linkToken)) ? String(o.linkToken) : '',
    remindAt: HHMM.test(String(o.remindAt)) ? String(o.remindAt) : '18:00',
    limits: cleanLimits(o.limits),
    // "open the link again now": the hourly count of bookings from the link starts over from this moment
    reopenedAt: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(String(o.reopenedAt)) && !isNaN(Date.parse(o.reopenedAt)) ? String(o.reopenedAt) : '',
  };
}
function loadConfig(dataPath) { return cleanConfig(readJson(path.join(base(dataPath), 'config.json'), null)); }
function saveConfig(dataPath, cfg) { const c = cleanConfig(cfg); writeAtomic(path.join(base(dataPath), 'config.json'), c); return c; }

// ---- helpers ----
// digits only, 972 prefix for an Israeli number (050..., +972 50..., 0097250...)
function normPhone(p) {
  let d = String(p == null ? '' : p).replace(/\D/g, '');
  if (d.startsWith('00972')) d = d.slice(2);
  if (d.startsWith('972')) return d;
  if (d.startsWith('0') && d.length >= 9 && d.length <= 10) return '972' + d.slice(1);
  if (d.length === 9 && d.startsWith('5')) return '972' + d;
  return d;
}
// "2026-11-22 10:00" (Israel) or an ISO instant -> epoch ms, NaN when it is neither
function parseStart(s) {
  if (typeof s === 'number') return isFinite(s) ? s : NaN;
  s = String(s == null ? '' : s).trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})$/.exec(s);
  if (m) return C.localToMs(m[1], m[2]);
  return /^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s) ? Date.parse(s) : NaN;
}
function readItems(dp) {
  let fl = [];
  if (!safeDirs(dp)) return [];
  try { fl = fs.readdirSync(itemsDir(dp)).filter((f) => /^[A-Za-z0-9_-]+\.json$/.test(f)); } catch (e) { return []; }
  return fl.map((f) => readJson(path.join(itemsDir(dp), f), null)).filter((i) => i && i.id && i.start && i.end && !isNaN(Date.parse(i.start)))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
// A folder of the diary is a real directory or not there yet. A link or a file in its place (planted by whoever can write the
// tenant's folder) is refused, so nothing here is ever redirected to another folder.
const realDir = (p) => { try { return fs.lstatSync(p).isDirectory(); } catch (e) { return e.code === 'ENOENT'; } };
const safeDirs = (dp) => [base(dp), itemsDir(dp), path.join(dp, 'biz-home')].every(realDir);
// biz-home lists read as regular files only (no link, no pipe)
const LIST_FILES = { event: 'events.json', client: 'clients.json' };
function readListSafe(dp, kind) { const a = readJson(path.join(dp, 'biz-home', LIST_FILES[kind]), []); return Array.isArray(a) ? a : []; }
const getItem = (dp, id) => (/^[A-Za-z0-9_-]+$/.test(String(id)) ? readJson(path.join(itemsDir(dp), id + '.json'), null) : null);
const putItem = (dp, it) => { if (!safeDirs(dp)) throw new Error('unsafe folder'); return writeAtomic(path.join(itemsDir(dp), it.id + '.json'), it); };
const fail = (error, w, why) => { const r = { ok: false, error, with: w || [] }; if (why) r.why = why; return r; };
const brief = (i) => ({ id: i.id, start: i.start, end: i.end, name: i.name, service: i.service });
// the service of a request: by id, by name (its minutes unless given) or a one off name with minutes
function resolveService(cfg, q) {
  const sv = cfg.services;
  let s = q.serviceId ? sv.find((x) => x.id === String(q.serviceId)) : null;
  if (!s && q.service) s = sv.find((x) => x.name === str(q.service)) || sv.find((x) => x.id === str(q.service));
  const mins = Math.round(Number(q.minutes));
  if (s) return { id: s.id, name: s.name, minutes: mins >= 5 ? mins : s.minutes, price: s.price };
  if (q.service && mins >= 5 && mins <= 600) return { id: '', name: str(q.service, 60), minutes: mins, price: 0 };
  return null;
}

// ---- clients (data/biz-home/clients.json, the list the clients screen reads) ----
const bh = () => require('./biz-home.js');
function findClient(clients, name, phone) {
  const p = normPhone(phone), n = str(name, 80);
  if (p) { const c = clients.find((x) => x && x.phone && normPhone(x.phone) === p); if (c) return c; }
  if (n) return clients.find((x) => x && (str(x.name) === n || (Array.isArray(x.aliases) && x.aliases.indexOf(n) >= 0))) || null;
  return null;
}
// by phone, else exact name; a new name with a phone becomes a client; a known client learns a missing phone
function matchClient(dp, name, phone) {
  const clients = readListSafe(dp, 'client'), p = normPhone(phone);
  let c = findClient(clients, name, phone);
  if (c) {
    if (p && !c.phone) { c.phone = p; bh().writeList(dp, 'client', clients); }
    return c.id;
  }
  if (!str(name) || !p) return '';
  c = { id: 'c' + newId().slice(0, 8), name: str(name, 80), biz: '', emails: [], domains: [], aliases: [], status: 'חדשה', terms: '', note: '', phone: p };
  clients.push(c); bh().writeList(dp, 'client', clients);
  return c.id;
}

// ---- API ----
// list(dp, {from, to, includeCancelled}): from and to are "YYYY-MM-DD" (the whole day, to included) or an instant
function list(dataPath, o) {
  o = o || {};
  const edge = (v, end) => {
    if (v == null || v === '') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return C.localToMs(end ? C.addDays(v, 1) : v, '00:00');
    const t = parseStart(v); return isNaN(t) ? null : t;
  };
  const f = edge(o.from, false), t = edge(o.to, true);
  return readItems(dataPath).filter((i) => (o.includeCancelled || i.status !== 'cancelled') && (f == null || Date.parse(i.start) >= f) && (t == null || Date.parse(i.start) < t));
}
function conflicts(dataPath, start, end, exceptId) {
  const s = parseStart(start), e = parseStart(end);
  if (isNaN(s) || isNaN(e)) return [];
  return C.overlaps(readItems(dataPath), s, e, loadConfig(dataPath).bufferMinutes, exceptId);
}
// the shared checks of add and move: returns a refusal or null
function refuse(dp, cfg, s, e, now, exceptId) {
  if (s < now - GRACE_MS) return fail('past');
  if (!C.inHours(cfg, s, e)) return fail('closed');
  const w = C.overlaps(readItems(dp), s, e, cfg.bufferMinutes, exceptId);
  return w.length ? fail('conflict', w.map(brief)) : null;
}
function addIn(dataPath, q, now) {
  try {
    q = q || {}; now = now == null ? Date.now() : now;
    const cfg = loadConfig(dataPath), s = parseStart(q.start), sv = resolveService(cfg, q), name = str(q.name, 80);
    if (isNaN(s)) return fail('bad', [], 'start');
    if (!sv) return fail('bad', [], 'service');
    if (!name) return fail('bad', [], 'name');
    const e = s + sv.minutes * 60000, r = refuse(dataPath, cfg, s, e, now, '');
    if (r) return r;
    const iso = new Date(now).toISOString();
    const it = {
      id: newId(), tok: crypto.randomBytes(12).toString('hex'), start: C.iso(s), end: C.iso(e), serviceId: sv.id, service: sv.name, name, phone: normPhone(q.phone),
      // a booking from the public link never creates or touches a client record: the owner adds the client with one tap (promoteClient)
      clientId: q.src === 'link' ? '' : matchClient(dataPath, name, q.phone), status: 'booked', src: SOURCES.indexOf(q.src) >= 0 ? q.src : 'owner',
      idem: /^[a-z0-9]{8,40}$/.test(String(q.idem || '')) ? String(q.idem) : '',
      note: str(q.note, 300), createdAt: iso, updatedAt: iso,
    };
    putItem(dataPath, it);
    return { ok: true, booking: it };
  } catch (err) { return fail('bad', [], String(err && err.message || err)); }
}
function moveIn(dataPath, id, newStart, now) {
  try {
    now = now == null ? Date.now() : now;
    const it = getItem(dataPath, id), s = parseStart(newStart);
    if (!it) return fail('bad', [], 'notfound');
    if (it.status === 'cancelled') return fail('bad', [], 'cancelled');
    if (isNaN(s)) return fail('bad', [], 'start');
    const e = s + (Date.parse(it.end) - Date.parse(it.start)), r = refuse(dataPath, loadConfig(dataPath), s, e, now, it.id);
    if (r) return r;
    const out = Object.assign({}, it, { start: C.iso(s), end: C.iso(e), status: 'booked', updatedAt: new Date(now).toISOString() });
    delete out.remindedAt; // a moved booking is reminded again for its new day
    putItem(dataPath, out);
    return { ok: true, booking: out };
  } catch (err) { return fail('bad', [], String(err && err.message || err)); }
}
function setStatusIn(dataPath, id, status, now) {
  try {
    now = now == null ? Date.now() : now;
    const it = getItem(dataPath, id);
    if (!it) return fail('bad', [], 'notfound');
    if (STATUSES.indexOf(status) < 0) return fail('bad', [], 'status');
    // bringing a cancelled booking back needs its slot to be free again
    if (it.status === 'cancelled' && status !== 'cancelled') {
      const w = C.overlaps(readItems(dataPath), Date.parse(it.start), Date.parse(it.end), loadConfig(dataPath).bufferMinutes, it.id);
      if (w.length) return fail('conflict', w.map(brief));
    }
    const out = Object.assign({}, it, { status, updatedAt: new Date(now).toISOString() });
    putItem(dataPath, out);
    return { ok: true, booking: out };
  } catch (err) { return fail('bad', [], String(err && err.message || err)); }
}
const add = (dataPath, q, now) => lockedCall(dataPath, () => addIn(dataPath, q, now));
const move = (dataPath, id, newStart, now) => lockedCall(dataPath, () => moveIn(dataPath, id, newStart, now));
const setStatus = (dataPath, id, status, now) => lockedCall(dataPath, () => setStatusIn(dataPath, id, status, now));
const cancel = (dataPath, id, now) => setStatus(dataPath, id, 'cancelled', now);

// ---- phase 2 ----
// The booking behind a client's personal link (its unguessable token), or null.
function byToken(dataPath, tok) {
  if (!/^[a-f0-9]{24}$/.test(String(tok))) return null;
  return readItems(dataPath).find((i) => i.tok === tok) || null;
}
// After the end time a booking that was neither cancelled nor marked a no show is done. Returns how many changed.
function autoDone(dataPath, now) {
  now = now == null ? Date.now() : now;
  return lockedCall(dataPath, () => {
    let n = 0;
    readItems(dataPath).forEach((i) => {
      if ((i.status === 'booked' || i.status === 'confirmed') && Date.parse(i.end) <= now) { putItem(dataPath, Object.assign({}, i, { status: 'done', updatedAt: new Date(now).toISOString() })); n++; }
    });
    return n;
  });
}
// the permanent public link token of this business: made once, kept in its config
// (the platform's own map decides which link is the business's; this copy is only shown on the owner's screen)
function setLinkToken(dataPath, tok) {
  if (!/^[a-f0-9]{24}$/.test(String(tok))) return { ok: false, error: 'bad', with: [], why: 'token' };
  return lockedCall(dataPath, () => { const cfg = loadConfig(dataPath); cfg.linkToken = String(tok); saveConfig(dataPath, cfg); return String(tok); });
}
function ensureLinkToken(dataPath, tok) {
  return lockedCall(dataPath, () => {
    const cfg = loadConfig(dataPath);
    if (cfg.linkToken) return cfg.linkToken;
    cfg.linkToken = /^[a-f0-9]{24}$/.test(String(tok)) ? String(tok) : crypto.randomBytes(12).toString('hex');
    saveConfig(dataPath, cfg);
    return cfg.linkToken;
  });
}
// stamps remindedAt on these booking ids (inside the lock). Returns how many.
function markReminded(dataPath, ids, now) {
  now = now == null ? Date.now() : now;
  return lockedCall(dataPath, () => {
    let n = 0;
    ids.forEach((id) => { const it = getItem(dataPath, id); if (it && !it.remindedAt) { putItem(dataPath, Object.assign({}, it, { remindedAt: new Date(now).toISOString() })); n++; } });
    return n;
  });
}
// up to n free starts nearest to the wanted time (the same day and the next two weeks), for an answer to a refusal
function nearestSlots(dataPath, start, serviceKey, n, now) {
  const s = parseStart(start);
  if (isNaN(s)) return [];
  now = now == null ? Date.now() : now;
  const day = C.ymd(s), out = [];
  for (let d = -1; d <= 14; d++) freeSlots(dataPath, C.addDays(day, d), serviceKey, now).forEach((x) => out.push(x));
  return out.sort((a, b) => Math.abs(Date.parse(a.start) - s) - Math.abs(Date.parse(b.start) - s)).slice(0, n || 3);
}
// the free starts of a day for a service (id, name, or a number of minutes): [{time, start, end}]
function freeSlots(dataPath, dateYMD, serviceId, now) {
  try {
    const cfg = loadConfig(dataPath);
    const sv = /^\d+$/.test(String(serviceId)) && !cfg.services.some((x) => x.id === String(serviceId)) ? { minutes: Number(serviceId) } : resolveService(cfg, { serviceId, service: serviceId });
    if (!sv || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateYMD))) return [];
    return C.slots(cfg, readItems(dataPath), dateYMD, sv.minutes, now == null ? Date.now() : now);
  } catch (e) { return []; }
}
// The bookings' entries inside biz-home/events.json (what the day ring and 📅 read). Entries made by anything else
// stay as they are; a cancelled booking has no entry.
function syncEvents(dataPath) {
  return lockedCall(dataPath, () => syncEventsIn(dataPath));
}
function syncEventsIn(dataPath) {
  const keep = readListSafe(dataPath, 'event').filter((e) => !(e && e.src === 'booking'));
  const mine = readItems(dataPath).filter((i) => i.status !== 'cancelled').map((i) => ({
    id: 'bk-' + i.id, start: i.start, end: i.end, title: i.service + ': ' + i.name, where: '', attendees: [], clientId: i.clientId || '', src: 'booking', bookingId: i.id,
  }));
  bh().writeList(dataPath, 'event', keep.concat(mine));
  return { kept: keep.length, bookings: mine.length };
}

// The owner's tap on a booking from the link: its client becomes a record of hers (matched by phone, else exact name).
function promoteClient(dataPath, id) {
  return lockedCall(dataPath, () => {
    const it = getItem(dataPath, id);
    if (!it) return { ok: false, error: 'bad', with: [], why: 'notfound' };
    if (!it.clientId) putItem(dataPath, Object.assign({}, it, { clientId: matchClient(dataPath, it.name, it.phone), updatedAt: new Date().toISOString() }));
    return { ok: true, booking: getItem(dataPath, id) };
  });
}

// ---- who came, who did not ----
const keyOf = (i) => i.clientId || i.name;
// last visit per client: the newest booking that was done, or is booked and already over. { clientId|name: "YYYY-MM-DD" }
function lastVisits(dataPath, now) {
  now = now == null ? Date.now() : now;
  const out = {};
  readItems(dataPath).forEach((i) => {
    if (i.status === 'cancelled' || i.status === 'noshow' || Date.parse(i.end) > now) return;
    const d = C.ymd(Date.parse(i.start)), k = keyOf(i);
    if (!out[k] || out[k] < d) out[k] = d;
  });
  return out;
}
// clients whose last visit is older than `weeks` and who have no future booking, oldest first
function lapsed(dataPath, weeks, now) {
  now = now == null ? Date.now() : now;
  const items = readItems(dataPath), last = lastVisits(dataPath, now), clients = readListSafe(dataPath, 'client');
  const cut = now - weeks * 7 * 864e5, seen = {}, out = [];
  const future = (i) => i.status !== 'cancelled' && Date.parse(i.end) > now;
  const consider = (key, name, phone, cid) => {
    if (seen[key] || !last[key]) return; seen[key] = 1;
    if (items.some((i) => future(i) && ((cid && i.clientId === cid) || i.name === name))) return;
    const at = C.localToMs(last[key], '12:00');
    if (at < cut) out.push({ clientId: cid || '', name, phone: phone || '', last: last[key], days: Math.floor((now - at) / 864e5) });
  };
  clients.forEach((c) => { if (c && c.id) consider(last[c.id] ? c.id : c.name, c.name, c.phone || (items.find((i) => i.clientId === c.id && i.phone) || {}).phone, c.id); });
  items.forEach((i) => { if (!i.clientId) consider(i.name, i.name, i.phone, ''); });
  return out.sort((a, b) => b.days - a.days);
}

// ---- the fixed lines the page sends (lib/bookings-ui.js), read back here so a worker or phase 2 never guesses ----
function hoursLine(cfg) {
  return DAY_NAMES.map((n, d) => n + ' ' + (cfg.hours[d] && cfg.hours[d].length ? cfg.hours[d].map((r) => r[0] + ' עד ' + r[1]).join(', ') : 'סגור')).join(' | ');
}
function parseHoursLine(line) {
  const h = {};
  for (const seg of String(line).split('|')) {
    const m = /^\s*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)\s+(.+?)\s*$/.exec(seg);
    if (!m) return null;
    h[DAY_NAMES.indexOf(m[1])] = m[2] === 'סגור' ? [] : m[2].split(',').map((x) => { const r = /^\s*(\d{1,2}:\d{2})\s+עד\s+(\d{1,2}:\d{2})\s*$/.exec(x); return r ? [r[1].padStart(5, '0'), r[2].padStart(5, '0')] : null; });
    if (h[DAY_NAMES.indexOf(m[1])].some((x) => !x)) return null;
  }
  return Object.keys(h).length === 7 ? h : null;
}
// one request line -> { kind, ... } or null
function parseRequest(text) {
  const t = String(text || '').trim();
  let m;
  if ((m = /^תור לקוחה חדש:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*\|([^|]*)\|([^|]*)\|(.*)$/.exec(t))) return { kind: 'add', start: m[1], service: str(m[2]), name: str(m[3]), phone: str(m[4]) };
  if ((m = /^הזזת תור לקוחה:\s*(\S+)\s*\|\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*$/.exec(t))) return { kind: 'move', id: m[1], start: m[2] };
  if ((m = /^ביטול תור לקוחה:\s*(\S+)\s*$/.exec(t))) return { kind: 'cancel', id: m[1] };
  if ((m = /^שעות פעילות:\s*(.+)$/.exec(t))) { const h = parseHoursLine(m[1]); return h ? { kind: 'hours', hours: h } : null; }
  if ((m = /^שירות חדש:([^|]*)\|\s*(\d+)\s*\|\s*(\d+(?:\.\d+)?)\s*$/.exec(t))) return { kind: 'service', name: str(m[1], 60), minutes: Number(m[2]), price: Number(m[3]) };
  if ((m = /^קישור ליום:\s*(\d{4}-\d{2}-\d{2})\s*\|([^|]*)\|([^|]*)\|(.+)$/.exec(t))) return { kind: 'link', d: m[1], service: str(m[2]), t: str(m[3]), to: str(m[4]) };
  if ((m = /^מגבלות קישור:\s*(\d{1,4})\s*\|\s*(\d{1,4})\s*$/.exec(t))) return { kind: 'limits', perHour: Number(m[1]), perDay: Number(m[2]) };
  if (/^פתיחת קישור:\s*עכשיו\s*$/.test(t)) return { kind: 'reopen' };
  if ((m = /^אישור תור לקוחה:\s*(\S+)\s*$/.exec(t))) return { kind: 'confirm', id: m[1] };
  if ((m = /^הוספת לקוחה:\s*(\S+)\s*$/.exec(t))) return { kind: 'client', id: m[1] };
  if ((m = /^סימון תור לקוחה:\s*(\S+)\s*\|\s*(noshow|done)\s*$/.exec(t))) return { kind: 'mark', id: m[1], status: m[2] };
  if ((m = /^(?:הסרת|מחיקת) שירות:\s*(.+)$/.exec(t))) return { kind: 'unservice', name: str(m[1], 60) };
  return null;
}

// The lines a worker session is told (worker.js), as lib/alarms.js promptLines does. For a monitor with bookings on.
// The fixed lines of the screen never get here: the listener applies them with no model (lib/bookings-handler.js).
function promptLines() {
  return [
    'יומן תורים של לקוחות (lib/bookings.js): המוניטור הוא יומן התורים שלה. כל שינוי עובר דרך node booking.js, לא כותבים קבצים ביד.',
    '  "תקבעי לדנה עיצוב גבות מחר ב 10": node booking.js add --start "YYYY-MM-DD HH:MM" --service "<שירות>" --name "<שם>" --phone <טלפון>.',
    '  הזזה: node booking.js move <id> --start "YYYY-MM-DD HH:MM". ביטול: node booking.js cancel <id>. מה יש: node booking.js list --date YYYY-MM-DD.',
    '  שעות פנויות: node booking.js slots --date YYYY-MM-DD --service "<שירות>". מי לא חזרה: node booking.js lapsed --weeks 8.',
    '  "תשלח לרוני קישור ליום שלישי לגבות": node booking.js link --to "<שם הלקוחה>" --day YYYY-MM-DD [--service "<שירות>"] [--time HH:MM]. זה מכין הודעה עם הקישור הנכון ב 📤 הודעות לשליחה, לא שולח. אחר כך node push.js "קישור".',
    '  התוצאה היא שורת JSON אחת. ok:true = נקבע, ואומרים במשפט אחד מה ומתי. קוד יציאה 2 = נדחה (error: conflict תפוס, closed סגור, past עבר):',
    '  אומרים את הסיבה ומציעים עד שלוש שעות פנויות מ node booking.js slots. לא ממציאים תור שלא נרשם, ולא כותבים "נקבע" בלי ok:true.',
    '  בלי טלפון אפשר לקבוע, אבל אז אין הודעת תזכורת. שורות שמתחילות ב "תור לקוחה חדש:" או "ביטול תור לקוחה:" לא מגיעות אליך, המאזין מטפל בהן.',
    '  הודעות ללקוחות לא נשלחות מכאן: רק מכינים אותן לשליחה בלחיצה (📤).',
    '',
  ];
}

module.exports = {
  core, STATUSES, DAY_NAMES, DEFAULT_CONFIG, normPhone, parseStart,
  loadConfig, saveConfig, list, add, move, cancel, setStatus, conflicts, freeSlots, syncEvents, lastVisits, lapsed,
  realDir, setLinkToken, LIMIT_DEFAULTS, withLock, withLockAsync, promoteClient, writeAtomic, putItem, getItem, byToken, autoDone, ensureLinkToken, markReminded, nearestSlots, readItems, resolveService, matchClient,
  hoursLine, parseHoursLine, parseRequest, promptLines,
};
