'use strict';
/*
  24.11.2026, the cosmetician's extras of the booking diary (lib/bookings.js is the diary itself). Three stores, all in the tenant's own
  data folder, written inside the diary lock and atomically, read and written by the tenant's own processes only:

    data/bookings/packs.json          punch cards ("כרטיסיות"): { id, clientId, name, phone, service, total, price, expires, since,
                                      adjust (manual +1 / -1), used: [booking ids that consumed a unit], closed, warnedAt, createdAt }
    data/bookings/gifts.json          gift cards: { id, code, kind: amount|service, amount, usedAmount, service, buyer, recipient,
                                      message, expires, used, createdAt }
    data/bookings/photos/index.json   before and after pairs: { id, clientId, phone, name, bookingId, service, date, files }
    data/bookings/photos/<pair>_b.jpg|_a.jpg|_bt.jpg|_at.jpg      the photos (b before, a after, t = the small thumbnail), never public

  Punch cards. A unit is consumed by a booking of the same service (by NAME: the service list re-adds a service without its id) of
  the same client (by client id, or by the normalized phone: a booking from the link has no client id) that STARTED after the card was
  sold and that counts as done: status done, or booked or confirmed and already over (the same rule as autoDone). The ids that consumed
  a unit are kept on the card (a ledger), so a sweep run again and again never counts one booking twice, and an id that later turns
  noshow or cancelled gives its unit back. When one unit is left, ONE prepared message to the client is put in the owner's send list.

  Gift cards. A short code (6 characters, no letters or digits that look alike) and a public page /b/g/<linkToken>.<code>
  (lib/book-page.js) that only READS this store through the tenant's agent (lib/book-core.js op "gift").

  Photos. They arrive by the monitor's own file path (the page's sendAll, sealed in transit when the gate key is on) under opaque names
  ba_<pair>_<kind>.jpg. listen.js hands such a file to takePhoto() the moment it is saved: it leaves the inbox for a private staging
  folder, and no chat message and no worker is involved. The owner's own signed line "תמונות לפני ואחרי: ..." (ids only, never a name or a
  phone) then finalizes the pair. Files that nobody finalized are swept away after two days.

  Nothing here sends a message. A prepared message is a one row send list (book-links prepareMessage): the owner taps and sends it from her
  own WhatsApp. Fully automatic sending needs her WhatsApp connected to the Cloud API (future).
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const B = require('./bookings.js');
const L = require('./book-links.js');
const T = require('./i18n-texts.js');

const C = B.core();
const YMD = /^\d{4}-\d{2}-\d{2}$/, ID = /^[a-z0-9]{6,16}$/;
const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);
const noDash = (s) => String(s == null ? '' : s).replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
const firstOf = (name) => noDash(name).split(' ')[0];
const int = (v, a, b, d) => { v = Math.round(Number(v)); return v >= a && v <= b ? v : d; };
const bdir = (dp) => path.join(dp, 'bookings');
const bh = () => require('./biz-home.js');
const fail = (error, why) => { const r = { ok: false, error }; if (why) r.why = why; return r; };

function readArr(f) { try { if (!fs.lstatSync(f).isFile()) return []; const a = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
const safe = (dp) => B.realDir(bdir(dp)) && B.realDir(path.join(dp, 'biz-home')) && B.realDir(path.join(bdir(dp), 'photos'));
function writeArr(dp, name, arr) { if (!safe(dp)) throw new Error('unsafe folder'); B.writeAtomic(path.join(bdir(dp), name), arr); }
const locked = (dp, fn) => { try { return B.withLock(dp, fn); } catch (e) { return fail('bad', String(e && e.message || e)); } };
const iso = (ms) => new Date(ms).toISOString();

// ---------- punch cards ----------
function cleanPack(p) {
  if (!p || typeof p !== 'object' || !ID.test(String(p.id))) return null;
  const total = int(p.total, 1, 100, 0);
  if (!total) return null;
  const ph = B.normPhone(p.phone);
  return { id: String(p.id), clientId: str(p.clientId, 40), name: str(p.name, 80), phone: /^9725\d{8}$/.test(ph) ? ph : '', service: str(p.service, 60), serviceId: str(p.serviceId, 20),
    total, price: Math.min(1e6, Math.max(0, Number(p.price) || 0)), expires: YMD.test(String(p.expires)) ? String(p.expires) : '', since: YMD.test(String(p.since)) ? String(p.since) : '',
    adjust: int(p.adjust, -100, 100, 0), used: (Array.isArray(p.used) ? p.used : []).filter((x) => /^[A-Za-z0-9_-]{1,40}$/.test(String(x))).map(String).slice(0, 400),
    closed: p.closed === true, closedAt: p.closedAt ? str(p.closedAt, 40) : '', warnedAt: p.warnedAt ? str(p.warnedAt, 40) : '', createdAt: str(p.createdAt, 40) };
}
const readPacks = (dp) => readArr(path.join(bdir(dp), 'packs.json')).map(cleanPack).filter(Boolean);
const left = (p) => p.total + p.adjust - p.used.length;

// who the owner means: a client id, or a phone (a person who booked from the link and is not a client yet)
function resolveClient(dp, ref) {
  ref = str(ref, 40);
  const clients = bh().readList(dp, 'client');
  let c = clients.find((x) => x && x.id === ref);
  if (c) return { clientId: String(c.id), name: str(c.name, 80), phone: B.normPhone(c.phone) };
  const ph = B.normPhone(ref);
  if (/^9725\d{8}$/.test(ph)) {
    c = clients.find((x) => x && x.phone && B.normPhone(x.phone) === ph);
    if (c) return { clientId: String(c.id), name: str(c.name, 80), phone: ph };
    const it = B.readItems(dp).find((i) => B.normPhone(i.phone) === ph);
    if (it) return { clientId: it.clientId || '', name: str(it.name, 80), phone: ph };
  }
  return null;
}
function sellPack(dp, q, now) {
  return locked(dp, () => {
    now = now == null ? Date.now() : now;
    const cl = resolveClient(dp, q.ref), cfg = B.loadConfig(dp), today = C.ymd(now);
    if (!cl) return fail('client');
    const sv = cfg.services.find((s) => s.name === str(q.service, 60) || s.id === str(q.service, 20));
    if (!sv) return fail('service');
    const count = Math.round(Number(q.count)), price = Number(q.price);
    if (!(count >= 1 && count <= 100)) return fail('count');
    if (!(price >= 0 && price <= 1e6)) return fail('price');
    if (q.expires && !(YMD.test(String(q.expires)) && String(q.expires) > today)) return fail('expires');
    const all = readPacks(dp);
    if (all.length >= 300) return fail('full');
    const p = cleanPack({ id: 'k' + crypto.randomBytes(5).toString('hex'), clientId: cl.clientId, name: cl.name, phone: cl.phone, service: sv.name, serviceId: sv.id, total: count, price, expires: q.expires || '', since: today, adjust: 0, used: [], createdAt: iso(now) });
    all.push(p); writeArr(dp, 'packs.json', all);
    return { ok: true, pack: p };
  });
}
function adjustPack(dp, id, delta, now, lang) {
  return locked(dp, () => {
    const all = readPacks(dp), p = all.find((x) => x.id === id);
    if (!p) return fail('notfound');
    if (p.closed) return fail('closed');
    if (delta < 0 && left(p) <= 0) return fail('zero');
    p.adjust = Math.max(-100, Math.min(100, p.adjust + (delta > 0 ? 1 : -1)));
    writeArr(dp, 'packs.json', all);
    const sw = sweepIn(dp, now, lang);
    return { ok: true, pack: readPacks(dp).find((x) => x.id === id), prepared: sw.prepared };
  });
}
function closePack(dp, id, now) {
  return locked(dp, () => {
    const all = readPacks(dp), p = all.find((x) => x.id === id);
    if (!p) return fail('notfound');
    if (!p.closed) { p.closed = true; p.closedAt = iso(now == null ? Date.now() : now); writeArr(dp, 'packs.json', all); }
    return { ok: true, pack: p };
  });
}
// a booking that counts as done: marked done, or booked or confirmed and over (autoDone's rule)
const counts = (it, now) => it.status === 'done' || ((it.status === 'booked' || it.status === 'confirmed') && Date.parse(it.end) <= now);
function matches(p, it) {
  if (it.service !== p.service) return false;
  return !!((p.clientId && it.clientId === p.clientId) || (p.phone && B.normPhone(it.phone) === p.phone));
}
// Recounts every open card against the diary. Idempotent: a booking is in the ledger of at most one card. Inside the lock.
// Returns { changed, prepared: how many "one left" messages were put in the send list }.
function sweepIn(dp, now, lang) {
  now = now == null ? Date.now() : now;
  const all = readPacks(dp);
  if (!all.length) return { changed: false, prepared: 0 };
  const items = B.readItems(dp), byId = {};
  items.forEach((i) => { byId[i.id] = i; });
  let changed = false, prepared = 0;
  // 1. a unit comes back when its booking was cancelled, became a no show, or is gone
  all.forEach((p) => {
    const keep = p.used.filter((id) => byId[id] && byId[id].status !== 'cancelled' && byId[id].status !== 'noshow');
    if (keep.length !== p.used.length) { p.used = keep; changed = true; }
  });
  // 2. new consumption, oldest card first, bookings in time order
  const taken = {};
  all.forEach((p) => p.used.forEach((id) => { taken[id] = 1; }));
  const open = all.filter((p) => !p.closed).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  items.filter((it) => !taken[it.id] && counts(it, now)).forEach((it) => {
    const day = C.ymd(Date.parse(it.start));
    const p = open.find((x) => matches(x, it) && left(x) > 0 && (!x.since || day >= x.since) && (!x.expires || day <= x.expires));
    if (p) { p.used.push(it.id); taken[it.id] = 1; changed = true; }
  });
  // 3. one unit left: the owner gets a prepared message for the client, once; a card topped up again is armed again
  all.forEach((p) => {
    const n = left(p);
    if (n > 1 && p.warnedAt) { p.warnedAt = ''; changed = true; }
    if (n === 1 && !p.closed && !p.warnedAt && p.phone && (!p.expires || p.expires >= C.ymd(now))) {
      const first = firstOf(p.name), svc = noDash(p.service), ru = lang === 'ru';
      const text = ru ? T.packLeftText({ name: first, service: svc }) : 'היי ' + first + ', נשאר לך טיפול אחד בכרטיסייה של ' + svc + '. רוצה לחדש?';
      let r = { ok: false };
      try { r = L.prepareMessage(dp, 'bkpack', now, ru ? T.packLeftTitle(first) : 'כרטיסייה ל' + first + ': נשאר טיפול אחד', p.name, p.phone, text); } catch (e) { r = { ok: false }; }
      if (r.ok) { p.warnedAt = iso(now); prepared++; changed = true; }
    }
  });
  if (changed) writeArr(dp, 'packs.json', all);
  return { changed, prepared };
}
function sweep(dp, now, lang) { return locked(dp, () => { if (!fs.existsSync(path.join(bdir(dp), 'packs.json'))) return { changed: false, prepared: 0 }; return sweepIn(dp, now, lang); }); }
function packsView(dp, now) {
  now = now == null ? Date.now() : now;
  const today = C.ymd(now);
  return readPacks(dp).map((p) => ({ id: p.id, clientId: p.clientId, name: p.name, phone: p.phone, service: p.service, total: p.total, price: p.price, expires: p.expires, since: p.since,
    adjust: p.adjust, used: p.used.length, left: Math.max(0, left(p)), closed: p.closed, expired: !!(p.expires && p.expires < today), createdAt: p.createdAt }))
    .sort((a, b) => (a.closed - b.closed) || (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 200);
}

// ---------- gift cards ----------
// no 0 O 1 I L 5 S 2 Z 8 B 6: nothing in a code looks like another character
const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY3479', CODE_LEN = 6;
function newCode(taken) {
  for (let n = 0; n < 50; n++) {
    let c = '';
    for (let i = 0; i < CODE_LEN; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!taken[c]) return c;
  }
  return '';
}
function cleanGift(g) {
  if (!g || typeof g !== 'object' || !ID.test(String(g.id)) || !new RegExp('^[' + CODE_CHARS + ']{' + CODE_LEN + '}$').test(String(g.code))) return null;
  const kind = g.kind === 'service' ? 'service' : 'amount', amount = kind === 'amount' ? Math.min(100000, Math.max(0, Number(g.amount) || 0)) : 0;
  if (kind === 'amount' && !(amount > 0)) return null;
  const ph = B.normPhone(g.buyerPhone);
  return { id: String(g.id), code: String(g.code), kind, amount, usedAmount: kind === 'amount' ? Math.min(amount, Math.max(0, Number(g.usedAmount) || 0)) : 0, serviceId: str(g.serviceId, 20), service: kind === 'service' ? str(g.service, 60) : '',
    buyer: str(g.buyer, 60), buyerPhone: /^9725\d{8}$/.test(ph) ? ph : '', recipient: str(g.recipient, 60), message: str(g.message, 300), expires: YMD.test(String(g.expires)) ? String(g.expires) : '',
    used: g.used === true, usedAt: g.usedAt ? str(g.usedAt, 40) : '', createdAt: str(g.createdAt, 40) };
}
const readGifts = (dp) => readArr(path.join(bdir(dp), 'gifts.json')).map(cleanGift).filter(Boolean);
const giftLeft = (g) => (g.kind === 'amount' ? Math.max(0, g.amount - g.usedAmount) : g.used ? 0 : 1);
function giftState(g, today) { return g.used || giftLeft(g) <= 0 ? 'used' : (g.expires && g.expires < today ? 'expired' : 'active'); }
// a year ahead: the same day next year (the 29th of February becomes the 28th)
function plusMonths(day, n) {
  const y = +day.slice(0, 4), m = +day.slice(5, 7) - 1, d = +day.slice(8);
  const t = new Date(Date.UTC(y, m + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}
const giftUrl = (dp, g, base) => { const cfg = B.loadConfig(dp); return cfg.linkToken ? (base || L.BASE) + '/b/g/' + cfg.linkToken + '.' + g.code : ''; };
function createGift(dp, q, now, lang, base) {
  return locked(dp, () => {
    now = now == null ? Date.now() : now;
    const cfg = B.loadConfig(dp), today = C.ymd(now);
    if (!cfg.linkToken) return fail('nolink');
    let kind = q.gk === 'service' ? 'service' : 'amount', amount = 0, sv = null;
    if (kind === 'amount') { amount = Number(q.value); if (!(amount > 0 && amount <= 100000)) return fail('amount'); amount = Math.round(amount * 100) / 100; }
    else { sv = cfg.services.find((s) => s.name === str(q.value, 60) || s.id === str(q.value, 20)); if (!sv) return fail('service'); }
    const recipient = str(q.recipient, 60);
    if (!recipient) return fail('recipient');
    if (q.expires && !(YMD.test(String(q.expires)) && String(q.expires) > today)) return fail('expires');
    const all = readGifts(dp);
    if (all.length >= 500) return fail('full');
    const taken = {}; all.forEach((g) => { taken[g.code] = 1; });
    const code = newCode(taken);
    if (!code) return fail('code');
    const g = cleanGift({ id: 'g' + crypto.randomBytes(5).toString('hex'), code, kind, amount, usedAmount: 0, serviceId: sv ? sv.id : '', service: sv ? sv.name : '', buyer: q.buyer, buyerPhone: q.phone, recipient, message: q.message, expires: q.expires || plusMonths(today, 12), used: false, createdAt: iso(now) });
    all.push(g); writeArr(dp, 'gifts.json', all);
    // the buyer gets the link as a prepared message (when her phone is known); nothing is sent from here
    let prepared = false;
    if (g.buyerPhone) {
      const first = firstOf(g.buyer) || firstOf(recipient), url = giftUrl(dp, g, base), ru = lang === 'ru';
      const text = ru ? T.giftText({ name: first, recipient, url }) : 'היי ' + first + ', הנה כרטיס המתנה' + (recipient ? ' ל' + noDash(recipient) : '') + ': ' + url;
      try { prepared = L.prepareMessage(dp, 'bkgift', now, ru ? T.giftTitle(first) : 'כרטיס מתנה ל' + first, g.buyer || recipient, g.buyerPhone, text).ok === true; } catch (e) { prepared = false; }
    }
    return { ok: true, gift: g, prepared, url: giftUrl(dp, g, base) };
  });
}
// the owner marks it used: amount 0 = all that is left; a partial amount keeps the balance
function useGift(dp, id, amount, now) {
  return locked(dp, () => {
    now = now == null ? Date.now() : now;
    const all = readGifts(dp), g = all.find((x) => x.id === id);
    if (!g) return fail('notfound');
    if (giftLeft(g) <= 0) return fail('used');
    if (g.kind === 'amount') {
      const rest = giftLeft(g), take = amount > 0 ? Math.round(amount * 100) / 100 : rest;
      if (take > rest + 1e-9) return fail('toomuch');
      g.usedAmount = Math.round((g.usedAmount + take) * 100) / 100;
      if (giftLeft(g) <= 0) { g.used = true; g.usedAt = iso(now); }
    } else { g.used = true; g.usedAt = iso(now); }
    writeArr(dp, 'gifts.json', all);
    return { ok: true, gift: g, left: giftLeft(g) };
  });
}
function giftsView(dp, now) {
  const today = C.ymd(now == null ? Date.now() : now), cfg = B.loadConfig(dp);
  return readGifts(dp).map((g) => ({ id: g.id, code: g.code, kind: g.kind, amount: g.amount, left: giftLeft(g), service: g.service, buyer: g.buyer, recipient: g.recipient, message: g.message, expires: g.expires, state: giftState(g, today),
    url: cfg.linkToken ? L.BASE + '/b/g/' + cfg.linkToken + '.' + g.code : '', createdAt: g.createdAt, hasPhone: !!g.buyerPhone }))
    .sort((a, b) => ((a.state === 'active' ? 0 : 1) - (b.state === 'active' ? 0 : 1)) || (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 100);
}
// what the public page may know (book-core op "gift"): by code only, the same answer for a code that never existed
function giftPublic(dp, code, now) {
  code = String(code || '').toUpperCase();
  if (!new RegExp('^[' + CODE_CHARS + ']{' + CODE_LEN + '}$').test(code)) return null;
  const g = readGifts(dp).find((x) => x.code === code);
  if (!g) return null;
  const today = C.ymd(now == null ? Date.now() : now);
  return { kind: g.kind, amount: g.amount, left: giftLeft(g), service: g.service, buyer: firstOf(g.buyer), recipient: g.recipient, message: g.message, expires: g.expires, state: giftState(g, today) };
}

// ---------- before and after photos ----------
const PHOTO_RE = /^ba_([a-z0-9]{8})_(b|a|bt|at)(?:-\d+)?\.jpg$/, KINDS = ['b', 'a', 'bt', 'at'], MAX_PHOTO = 2 * 1024 * 1024, STAGE_KEEP_MS = 2 * 864e5;
const photoDir = (dp) => path.join(bdir(dp), 'photos'), stageDir = (dp) => path.join(photoDir(dp), 'staging');
// listen.js calls this for every file it saves. true = this was a before/after photo and it is dealt with (the caller makes no chat message).
function takePhoto(dp, name) {
  const m = PHOTO_RE.exec(String(name || ''));
  if (!m) return false;
  const src = path.join(dp, 'inbox', String(name));
  try {
    const st = fs.lstatSync(src);
    if (!st.isFile() || st.size > MAX_PHOTO || st.size < 200) throw new Error('size');
    const fd = fs.openSync(src, 'r'), b = Buffer.alloc(3); fs.readSync(fd, b, 0, 3, 0); fs.closeSync(fd);
    if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) throw new Error('not a jpeg'); // only a real JPEG is kept
    if (!B.realDir(bdir(dp)) || !B.realDir(photoDir(dp)) || !B.realDir(stageDir(dp))) throw new Error('unsafe folder');
    fs.mkdirSync(stageDir(dp), { recursive: true });
    fs.renameSync(src, path.join(stageDir(dp), 'ba_' + m[1] + '_' + m[2] + '.jpg'));
    cleanStage(dp, Date.now());
  } catch (e) { try { fs.unlinkSync(src); } catch (e2) { /* gone */ } }
  return true;
}
function cleanStage(dp, now) {
  try { fs.readdirSync(stageDir(dp)).forEach((f) => { const p = path.join(stageDir(dp), f); try { if (now - fs.statSync(p).mtimeMs > STAGE_KEEP_MS) fs.unlinkSync(p); } catch (e) { /* gone */ } }); } catch (e) { /* no folder */ }
}
const readPhotos = (dp) => readArr(path.join(photoDir(dp), 'index.json')).filter((x) => x && /^[a-z0-9]{8}$/.test(String(x.id)));
// the owner's line arrived: the four staged files become one record of the client
function finalizePhotos(dp, q, now) {
  return locked(dp, () => {
    now = now == null ? Date.now() : now;
    const all = readPhotos(dp);
    if (all.some((x) => x.id === q.pair)) return { ok: true, again: true, pair: all.find((x) => x.id === q.pair) };
    if (!B.realDir(path.join(photoDir(dp), 'staging'))) return fail('unsafe');
    const have = KINDS.every((k) => { try { return fs.lstatSync(path.join(stageDir(dp), 'ba_' + q.pair + '_' + k + '.jpg')).isFile(); } catch (e) { return false; } });
    if (!have) return fail('missing');
    let it = null, cl = null;
    if (q.bookingId) { it = B.getItem(dp, q.bookingId); if (!it) return fail('booking'); }
    if (q.clientId) { cl = bh().readList(dp, 'client').find((x) => x && x.id === q.clientId) || null; }
    if (!cl && it && it.clientId) cl = bh().readList(dp, 'client').find((x) => x && x.id === it.clientId) || null;
    if (!it && !cl) return fail('who');
    const who = cl || it, phone = B.normPhone(who.phone || (it && it.phone));
    const date = q.date && YMD.test(q.date) && q.date <= C.addDays(C.ymd(now), 1) ? q.date : (it ? C.ymd(Date.parse(it.start)) : C.ymd(now));
    fs.mkdirSync(photoDir(dp), { recursive: true });
    const files = {};
    KINDS.forEach((k) => { const to = q.pair + '_' + k + '.jpg'; fs.renameSync(path.join(stageDir(dp), 'ba_' + q.pair + '_' + k + '.jpg'), path.join(photoDir(dp), to)); files[k] = to; });
    const rec = { id: q.pair, clientId: cl ? String(cl.id) : (it && it.clientId) || '', phone: /^9725\d{8}$/.test(phone) ? phone : '', name: str(who.name, 80), bookingId: it ? it.id : '', service: it ? str(it.service, 60) : '', date, createdAt: iso(now), files };
    all.push(rec); writeArr(dp, 'photos/index.json', all);
    return { ok: true, pair: rec };
  });
}
const THUMB_MAX = 40;
// the pairs for the owner's screen, with their small thumbnails (the sealed payload only); the newest first, a capped number
function photosView(dp) {
  return readPhotos(dp).sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1)).slice(0, THUMB_MAX).map((x) => {
    const thumb = (k) => { try { const f = path.join(photoDir(dp), String(x.files && x.files[k] || '')); if (!/^[a-z0-9]{8}_(bt|at)\.jpg$/.test(path.basename(f)) || !fs.lstatSync(f).isFile()) return ''; return 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64'); } catch (e) { return ''; } };
    return { id: x.id, clientId: str(x.clientId, 40), phone: str(x.phone, 20), name: str(x.name, 80), bookingId: str(x.bookingId, 40), service: str(x.service, 60), date: str(x.date, 10), bt: thumb('bt'), at: thumb('at'), full: [x.id + '_b.jpg', x.id + '_a.jpg'] };
  });
}

module.exports = {
  CODE_CHARS, CODE_LEN, PHOTO_RE, readPacks, sellPack, adjustPack, closePack, sweep, sweepIn, packsView, left,
  readGifts, createGift, useGift, giftsView, giftPublic, giftUrl, plusMonths,
  takePhoto, finalizePhotos, photosView, readPhotos, resolveClient,
};
