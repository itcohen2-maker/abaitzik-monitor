'use strict';
/*
  22.11.2026: what a business's public booking page may ask of its diary, answered by the TENANT's own process. This is the
  logic behind lib/book-agent.js (a unix socket server inside the tenant's listener) and, with readOnly, behind the demo.
  Everything here reads and writes the tenant's own data folder through lib/bookings.js, as the tenant's own user: the platform
  (wa-bridge.js, lib/book-page.js) never opens these files, it only sends the requests below and draws the answers.

  request  { op, tenant, ... }       (one JSON line over the socket, 32KB at most)
    info    { l }                    -> { ok, name, accent, fem, slotMinutes, services, days }
    slots   { date, service }        -> { ok, slots: [{ time, start }] }
    create  { service, start, name, phone, idem } -> { ok, again?, booking: { tok, service, when, start, end, name } }
    get     { tok }                  -> { ok, booking: { service, minutes, when, start, status, who, past, serviceId } }
    act     { tok, action, start? }  -> { ok, status, when? }     confirm | cancel | move
    setLink { tok }                  -> { ok, tok }                the bridge made the owner's link; this is only what her screen shows
  A request whose tenant is not this business's id gets { ok: false, error: 'tenant' }. Errors are short codes, never details of
  another booking. A public booking is never matched to, or added as, a client of the owner (she adds the client with one tap),
  and never touches a client's phone.
*/
const fs = require('fs');
const path = require('path');
const B = require('./bookings.js');
const trades = require('./trades.js');
const sendlist = require('./sendlist.js');

const C = B.core();
const DAYS_AHEAD = 14, HOUR = 3600e3;
const DAY_MS = 24 * HOUR;
const noDash = (s) => String(s == null ? '' : s).replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
const TOK = /^[a-f0-9]{24}$/;
const err = (e) => ({ ok: false, error: e });

function makeCore(o) {
  const inst = o.inst, dp = o.dataPath, tenantId = String(o.tenantId || inst.name || '');
  const now = () => (o.now ? o.now() : Date.now());
  const log = (l) => { try { (o.log || (() => {}))(l); } catch (e) { /* never breaks a booking */ } };
  const base = o.base || 'https://form.it-solution.co.il';
  const fmtDay = (ms) => { const d = C.ymd(ms); return 'יום ' + B.DAY_NAMES[C.dow(d)] + ' ' + d.slice(8) + '.' + d.slice(5, 7); };
  const fmtWhen = (iso) => fmtDay(Date.parse(iso)) + ' בשעה ' + C.hm(Date.parse(iso));
  const on = () => !!(inst && inst.bookings === true && trades.get(inst.trade) && trades.get(inst.trade).bookings === true);
  const capNote = {}; // when the owner was last told that the link is closed, memory only
  const notify = (text, opts) => { if (o.readOnly) return; try { if (o.notify) o.notify(text, opts || {}); } catch (e) { log('notify failed'); } };

  function days(cfg) {
    const today = C.ymd(now()), out = [];
    for (let i = 0; i <= DAYS_AHEAD; i++) { const d = C.addDays(today, i); out.push({ d, w: B.DAY_NAMES[C.dow(d)], label: d.slice(8) + '.' + d.slice(5, 7), closed: !C.ranges(cfg, d).length }); }
    return out;
  }
  function info(req) {
    const cfg = B.loadConfig(dp);
    // (which link belongs to this business is decided by the platform's own map, never by anything stored here)
    const look = require('./trade-cards.js').LOOK[inst.trade] || [['#2f6f4f', '#e6f3ec', '#fff']];
    return { ok: true, name: require('./bookings-remind.js').businessName(inst), accent: look[0], fem: inst.gender === 'f', slotMinutes: cfg.slotMinutes,
      services: cfg.services.map((s) => ({ id: s.id, name: s.name, minutes: s.minutes, price: s.price })), days: days(cfg) };
  }
  function serviceOf(cfg, id) { const s = B.resolveService(cfg, { serviceId: String(id || '') }); return s && s.id ? s : null; }
  function slots(req) {
    const cfg = B.loadConfig(dp), sv = serviceOf(cfg, req.service), date = String(req.date || ''), today = C.ymd(now());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > C.addDays(today, DAYS_AHEAD)) return err('date');
    if (!sv) return err('service');
    return { ok: true, slots: B.freeSlots(dp, date, sv.id, now()).map((s) => ({ time: s.time, start: s.start })) };
  }
  const done = (it, again) => ({ ok: true, again: !!again, booking: { tok: it.tok, service: it.service, when: fmtWhen(it.start), start: it.start, end: it.end, name: it.name } });

  async function create(req) {
    const cfg = B.loadConfig(dp), sv = serviceOf(cfg, req.service);
    const name = String(req.name || '').replace(/\s+/g, ' ').trim(), phone = B.normPhone(req.phone);
    if (name.length < 2 || name.length > 40 || /^[\d\s]+$/.test(name)) return err('name');
    if (!/^9725\d{8}$/.test(phone)) return err('phone');
    if (!sv) return err('service');
    const s = B.parseStart(req.start), today = C.ymd(now());
    if (isNaN(s) || C.ymd(s) > C.addDays(today, DAYS_AHEAD)) return err('start');
    const idem = /^[a-z0-9]{8,40}$/.test(String(req.idem || '')) ? String(req.idem) : '';
    if (o.readOnly) { return done({ tok: 'de00de00de00de00de00de01', service: sv.name, start: C.iso(s), end: C.iso(s + sv.minutes * 60000), name }); }
    // a true double submit (the same browser sends the same key again) is the same booking; anything else never sees another booking
    if (idem) { const same = B.readItems(dp).find((i) => i.idem === idem && i.phone === phone && i.status !== 'cancelled'); if (same) return done(same, true); }
    const t = now();
    const r = await B.withLockAsync(dp, () => {
      // exactly one of the slots free at this moment (on the grid, inside the hours, not taken)
      if (!B.freeSlots(dp, C.ymd(s), sv.id, t).some((x) => x.start === C.iso(s))) return err('conflict');
      const items = B.readItems(dp), lim = cfg.limits;
      // the business: so many successful bookings from the link per hour and per day, counted from the diary itself (it survives a restart)
      const fromLink = items.filter((i) => i.src === 'link' && Date.parse(i.createdAt) > t - DAY_MS);
      const since = Math.max(t - HOUR, Date.parse(cfg.reopenedAt) || 0); // "open the link again now" starts the hourly count over
      if (fromLink.length >= lim.perDay || fromLink.filter((i) => Date.parse(i.createdAt) > since).length >= lim.perHour) return err('full');
      // the phone: so many active future bookings, and a number that was never confirmed holds only so many unconfirmed ones
      const mine = items.filter((i) => i.phone === phone);
      if (mine.filter((i) => (i.status === 'booked' || i.status === 'confirmed') && Date.parse(i.end) > t).length >= lim.phoneActive) return err('limit');
      const known = mine.some((i) => i.status === 'confirmed' || i.status === 'done');
      if (!known && mine.filter((i) => i.src === 'link' && i.status === 'booked' && Date.parse(i.end) > t).length >= lim.unconfirmedPerPhone) return err('unconfirmed');
      const a = B.add(dp, { start: C.iso(s), serviceId: sv.id, name, phone, src: 'link', idem }, t);
      if (!a.ok) return err(a.error === 'conflict' ? 'conflict' : 'bad');
      B.syncEvents(dp);
      try { B.writeAtomic(path.join(dp, 'bookings', 'dirty'), { at: new Date(t).toISOString() }); } catch (e) { /* the worker rebuilds on its next tick anyway */ }
      return { ok: true, it: a.booking };
    });
    if (!r.ok) {
      log('book ' + tenantId + ' refused ' + r.error);
      // the owner hears once an hour at most, with one generic line, when the link is closed for the day or hour, or a phone is held by an unconfirmed booking
      if (r.error === 'full' || r.error === 'unconfirmed') {
        if (!capNote.at || t - capNote.at >= HOUR) {
          capNote.at = t;
          notify('היום נקבעו הרבה תורים מהקישור והוא נסגר זמנית. אפשר לפתוח אותו שוב או לשנות את המגבלה בהגדרות התורים.', { push: true, waText: 'היום נקבעו הרבה תורים מהקישור והוא נסגר זמנית. אפשר לפתוח אותו שוב או לשנות את המגבלה בהגדרות התורים.' });
        }
      }
      return r;
    }
    notify('📅 תור חדש מהקישור: ' + name + ', ' + sv.name + ', ' + fmtWhen(r.it.start) + '. נכנס ליומן שלך ב 📅 התורים שלי.',
      { push: true, waText: '📅 תור חדש נקבע בקישור שלך. הפרטים ב 📅 התורים שלי במוניטור.' });
    log('book ' + tenantId + ' create ok ' + r.it.id);
    return done(r.it, false);
  }

  function get(req) {
    if (o.readOnly) { const s = C.localToMs(C.addDays(C.ymd(now()), 1), '10:00'); return { ok: true, booking: { service: 'טיפול פנים', minutes: 60, when: fmtWhen(C.iso(s)), start: C.iso(s), status: 'booked', who: 'דנה פרץ', past: false, serviceId: 'face' } }; }
    const it = TOK.test(String(req.tok)) ? B.byToken(dp, req.tok) : null;
    if (!it) return err('notfound');
    return { ok: true, booking: { service: it.service, minutes: Math.round((Date.parse(it.end) - Date.parse(it.start)) / 60000), when: fmtWhen(it.start), start: it.start, status: it.status, who: it.name,
      past: Date.parse(it.start) < now(), serviceId: it.serviceId || '' } };
  }
  // after a cancel: up to three lapsed clients as prepared wa.me messages, never sent from here
  function offerFreed(cfg, it) {
    try {
      const lap = B.lapsed(dp, 8, now()).filter((x) => /^9725\d{8}$/.test(x.phone)).slice(0, 3);
      if (!lap.length) return 0;
      const biz = require('./bookings-remind.js').businessName(inst), n = new Date(now());
      const id = C.ymd(now()).replace(/-/g, '') + '-' + C.hm(now()).replace(':', '') + '-bkfreed';
      const link = cfg.linkToken ? base + '/b/' + cfg.linkToken : '';
      const text = (first) => 'היי ' + first + ', התפנה לי תור ' + fmtWhen(it.start) + ' ל' + it.service + ' אצל ' + biz + '. ' + (link ? 'אם מתאים לך, אפשר לקבוע כאן: ' + link : 'אם מתאים לך, כתבו לי.');
      const list = { id, at: n.toISOString(), title: 'התפנתה שעה: אפשר להציע ללקוחות שלא היו אצלך', note: fmtWhen(it.start) + ', ' + it.service,
        items: lap.map((x) => ({ name: noDash(x.name), phone: x.phone, text: text(String(x.name).split(' ')[0]) })) };
      const dir = sendlist.dirOf(dp); if (!B.realDir(path.join(dp, 'sendlist')) || !B.realDir(dir)) return 0; fs.mkdirSync(dir, { recursive: true });
      B.writeAtomic(path.join(dir, id + '.json'), list);
      return lap.length;
    } catch (e) { log('offer failed ' + tenantId); return 0; }
  }
  async function act(req) {
    const action = String(req.action || '');
    if (['confirm', 'cancel', 'move'].indexOf(action) < 0) return err('bad');
    if (o.readOnly) return { ok: true, status: action === 'cancel' ? 'cancelled' : action === 'confirm' ? 'confirmed' : 'booked', when: action === 'move' ? 'התור עבר לשעה החדשה' : undefined };
    if (!TOK.test(String(req.tok))) return err('notfound');
    const cfg = B.loadConfig(dp), t = now();
    const r = await B.withLockAsync(dp, () => {
      const it = B.byToken(dp, req.tok);
      if (!it) return err('notfound');
      const future = Date.parse(it.start) > t, live = it.status === 'booked' || it.status === 'confirmed';
      // the client can only touch a live booking that has not started; a no show, a done or a cancelled one is the owner's record
      if (action === 'cancel' && it.status === 'cancelled') return { ok: true, status: 'cancelled', same: true, it };
      if (action === 'confirm' && it.status === 'confirmed' && future) return { ok: true, status: 'confirmed', same: true, it };
      if (!live || !future) return err(it.status === 'cancelled' ? 'cancelled' : 'past');
      if (action === 'confirm') {
        if (it.status !== 'booked') return err('bad');
        const c = B.setStatus(dp, it.id, 'confirmed', t); if (!c.ok) return err(c.error);
        B.syncEvents(dp); return { ok: true, status: 'confirmed', it };
      }
      if (action === 'cancel') {
        const c = B.cancel(dp, it.id, t); if (!c.ok) return err(c.error);
        B.syncEvents(dp); return { ok: true, status: 'cancelled', it };
      }
      const s = B.parseStart(req.start);
      if (isNaN(s) || C.ymd(s) > C.addDays(C.ymd(t), DAYS_AHEAD)) return err('start');
      // a move goes to one of the free slots of that day (on the grid, inside the hours, not taken), like a new booking
      const minutes = Math.round((Date.parse(it.end) - Date.parse(it.start)) / 60000);
      if (!B.freeSlots(dp, C.ymd(s), minutes, t).some((x) => x.start === C.iso(s))) return err('conflict');
      const m = B.move(dp, it.id, C.iso(s), t);
      if (!m.ok) return err(m.error === 'conflict' ? 'conflict' : 'bad');
      B.syncEvents(dp);
      return { ok: true, status: 'booked', when: fmtWhen(m.booking.start), it, to: m.booking };
    });
    if (!r.ok || r.same) return r.ok ? { ok: true, status: r.status } : r;
    try { B.writeAtomic(path.join(dp, 'bookings', 'dirty'), { at: new Date(t).toISOString() }); } catch (e) { /* the worker's tick */ }
    const it = r.it;
    if (action === 'confirm') notify('✅ ' + it.name + ' אישר הגעה: ' + it.service + ', ' + fmtWhen(it.start) + '.', { push: true, waText: '✅ לקוח אישר הגעה לתור. הפרטים ב 📅 התורים שלי במוניטור.' });
    if (action === 'cancel') {
      const n = offerFreed(cfg, it);
      notify('❌ התור של ' + it.name + ' בוטל על ידי הלקוח: ' + it.service + ', ' + fmtWhen(it.start) + '. השעה התפנתה.' + (n ? ' הכנתי הודעות ל ' + n + ' לקוחות שלא היו אצלך תקופה, ב 📤 הודעות לשליחה.' : ''),
        { push: true, waText: '❌ לקוח ביטל תור, והשעה התפנתה. הפרטים ב 📅 התורים שלי במוניטור.' });
    }
    if (action === 'move') notify('🔁 ' + it.name + ' העביר את התור: ' + it.service + ', מ ' + fmtWhen(it.start) + ' אל ' + fmtWhen(r.to.start) + '.', { push: true, waText: '🔁 לקוח העביר תור. הפרטים ב 📅 התורים שלי במוניטור.' });
    log('book ' + tenantId + ' ' + action + ' ok ' + it.id);
    return { ok: true, status: r.status, when: r.when };
  }
  // the bridge made the token and created the platform's map; this copy is only what the owner's screen shows
  function setLink(req) {
    if (o.readOnly) return err('off');
    if (!TOK.test(String(req.tok))) return err('bad');
    const t = B.setLinkToken(dp, req.tok);
    return typeof t === 'string' ? { ok: true, tok: t } : err('bad');
  }

  async function handle(req) {
    try {
      if (!req || typeof req !== 'object') return err('bad');
      if (String(req.tenant || '') !== tenantId) return err('tenant');
      if (!on()) return err('off');
      switch (req.op) {
        case 'info': return info(req);
        case 'slots': return slots(req);
        case 'create': return await create(req);
        case 'get': return get(req);
        case 'act': return await act(req);
        case 'setLink': return setLink(req);
        default: return err('bad');
      }
    } catch (e) { log('book ' + tenantId + ' error ' + String(e && e.message || e).slice(0, 80)); return err('bad'); }
  }
  return { handle };
}

module.exports = { makeCore, TOK };
