'use strict';
// 22.11.2026: the public booking page end to end. A real agent (lib/book-agent.js) on a temp unix socket with a temp data folder,
// the bridge side (lib/book-page.js, a proxy) with fake requests. The agent and the proxy are separate objects that only speak
// over the socket, as the tenant's listener and the platform's bridge do.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const BP = require('../lib/book-page.js');
const Agent = require('../lib/book-agent.js');
const B = require('../lib/bookings.js');
const bh = require('../lib/biz-home.js');
const SL = require('../lib/sendlist.js');

const NOW = Date.parse('2026-11-22T06:00:00Z'); // Sunday 08:00 in Israel
const HOURS = { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [['09:00', '13:00']], 6: [] };
const live = [];
const J = (r) => JSON.parse(r.body);

async function world(opts) {
  opts = opts || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-e2e-'));
  const DATA = path.join(root, 'platform'), dp = path.join(root, 'tenant', 'data'), sockDir = path.join(root, 's');
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(dp, { recursive: true }); fs.mkdirSync(sockDir);
  B.saveConfig(dp, { hours: HOURS, services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }, { id: 'face', name: 'טיפול פנים', minutes: 60, price: 320 }], slotMinutes: 15, bufferMinutes: 0 });
  const inst = { name: 't1', trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'הקליניקה של מור' }, dataPath: dp };
  const st = { now: NOW, agentLogs: [], logs: [] };
  const agent = Agent.start({ inst, dataPath: dp, sockDir, now: () => st.now, log: (l) => st.agentLogs.push(l) });
  if (!agent.server.listening) await new Promise((r) => agent.server.once('listening', r));
  live.push(agent);
  const sock = path.join(sockDir, 's.sock');
  const P = BP.create({ DATA, sockPath: () => sock, now: () => st.now, log: (l) => st.logs.push(l), base: 'https://form.test', timeoutMs: opts.timeoutMs || 2500, demo: opts.demo || null });
  live.push({ close: async () => P.stop() });
  const made = await P.makeLink('t1');
  const l = made.link.split('/').pop();
  const w = { root, DATA, dp, sock, sockDir, inst, st, agent, P, made, l };
  w.get = (p, q, ip) => P.handle({ method: 'GET', path: p, query: q || {}, body: null, ip: ip || '1.1.1.1' });
  w.post = (p, body, ip) => P.handle({ method: 'POST', path: p, query: {}, body, ip: ip || '1.1.1.1' });
  w.ft = async (ip) => /"ft":"([^"]+)"/.exec((await w.get('/b/' + l, {}, ip)).body)[1];
  let n = 0;
  w.book = async (over, ip) => { const ft = await w.ft(); st.now += 5000; return w.post('/api/book', Object.assign({ l, ft, cid: 'k' + (n++) + 'abcdefgh', service: 'brows', start: '2026-11-23 10:00', name: 'דנה כהן', phone: '0521234567', website: '' }, over), ip); };
  return w;
}
test.after(async () => { for (let i = 0; i < live.length; i++) { const t = await Promise.race([live[i].close().then(() => 'ok', () => 'ok'), new Promise((r) => setTimeout(() => r('HUNG'), 1500))]); if (t === 'HUNG') console.log('CLOSE HUNG', i, Object.keys(live[i]).join(',')); } });
function grep(dir, needles) {
  const hits = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.lstatSync(p); if (s.isDirectory()) walk(p); else if (s.isFile()) { const t = fs.readFileSync(p, 'utf8'); needles.forEach((x) => { if (t.includes(x)) hits.push(p + ' has ' + x); }); } } })(dir);
  return hits;
}

test('link: made by the agent, mapped by the platform to the tenant id only; the agent refuses another tenant', async () => {
  const w = await world();
  assert.strictEqual(w.made.ok, true); assert.match(w.l, /^[a-f0-9]{24}$/);
  assert.strictEqual(B.loadConfig(w.dp).linkToken, w.l);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(w.DATA, 'book', 'links', w.l + '.json'), 'utf8')), { tenant: 't1' });
  assert.strictEqual((await w.P.makeLink('t1')).link, w.made.link); // once
  assert.strictEqual((await w.P.makeLink('nope')).ok, false); // no agent for it
  assert.strictEqual((await w.P.makeLink('../x')).ok, false);
  // the agent answers only for its own id: a request for another tenant (a socket path pointed at it) gets nothing
  assert.deepStrictEqual(await w.P.ask('t2', { op: 'info' }), { ok: false, error: 'tenant' });
});

test('the page: business, services, days, calm when unknown or replaced', async () => {
  const w = await world();
  const r = await w.get('/b/' + w.l);
  assert.strictEqual(r.status, 200); assert.match(r.body, /הקליניקה של מור/); assert.match(r.body, /עיצוב גבות/); assert.match(r.body, /"closed":true/); assert.match(r.body, /Heebo/); assert.match(r.body, /noindex/);
  assert.strictEqual((await w.get('/b/' + 'a'.repeat(24))).status, 404);
  assert.strictEqual((await w.get('/b/zzz')).status, 404);
  const c = B.loadConfig(w.dp); c.linkToken = 'b'.repeat(24); B.saveConfig(w.dp, c); // whatever the tenant stores about its link changes nothing:
  assert.strictEqual((await w.get('/b/' + w.l)).status, 200); // the platform's map decides which link is the business's
});

test('slots are live, and refused outside two weeks, closed days and unknown services', async () => {
  const w = await world();
  let r = J(await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'brows' }));
  assert.strictEqual(r.slots[0].time, '09:00'); assert.strictEqual(r.slots[r.slots.length - 1].time, '16:30');
  B.add(w.dp, { start: '2026-11-23 09:00', serviceId: 'face', name: 'א', phone: '0501110002' }, NOW);
  assert.ok(!J(await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'brows' })).slots.some((s) => s.time === '09:15'));
  assert.deepStrictEqual(J(await w.get('/api/book/slots', { l: w.l, date: '2026-11-28', service: 'brows' })).slots, []);
  assert.strictEqual((await w.get('/api/book/slots', { l: w.l, date: '2026-11-21', service: 'brows' })).status, 400);
  assert.strictEqual((await w.get('/api/book/slots', { l: w.l, date: '2026-12-30', service: 'brows' })).status, 400);
  assert.strictEqual((await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'nope' })).status, 400);
  assert.strictEqual((await w.get('/api/book/slots', { l: 'f'.repeat(24), date: '2026-11-23', service: 'brows' })).status, 404);
  assert.deepStrictEqual(Object.keys(J(await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'brows' })).slots[0]).sort(), ['start', 'time']);
});

test('create: written by the agent into the tenant folder, no client record, owner told, personal link and calendar file', async () => {
  const w = await world();
  const clientsBefore = JSON.stringify(bh.readList(w.dp, 'client'));
  const r = await w.book(), j = J(r);
  assert.strictEqual(r.status, 200); assert.strictEqual(j.ok, true);
  const it = B.readItems(w.dp)[0];
  assert.strictEqual(it.src, 'link'); assert.strictEqual(it.phone, '972521234567'); assert.strictEqual(it.start, '2026-11-23T10:00:00+02:00'); assert.match(it.tok, /^[a-f0-9]{24}$/);
  assert.strictEqual(it.clientId, ''); assert.strictEqual(JSON.stringify(bh.readList(w.dp, 'client')), clientsBefore); // never a client of hers by itself
  assert.strictEqual(j.mine, 'https://form.test/b/a/' + w.l + '.' + it.tok); assert.strictEqual(j.ics, j.mine + '/ics');
  assert.match(j.booking.when, /יום שני 23\.11 בשעה 10:00/);
  assert.ok(bh.readList(w.dp, 'event').some((e) => e.bookingId === it.id)); assert.ok(fs.existsSync(path.join(w.dp, 'bookings', 'dirty')));
  const chat = fs.readdirSync(path.join(w.dp, 'chat', 'chat'));
  assert.strictEqual(chat.length, 1); assert.match(chat[0], /-claude-push-book\.json$/);
  const rec = JSON.parse(fs.readFileSync(path.join(w.dp, 'chat', 'chat', chat[0]), 'utf8'));
  assert.strictEqual(rec.from, 'claude'); assert.match(rec.text, /דנה כהן/); assert.strictEqual(rec.waPush, true); assert.doesNotMatch(rec.waText, /דנה|כהן/);
  const mine = await w.get('/b/a/' + w.l + '.' + it.tok);
  assert.strictEqual(mine.status, 200); assert.match(mine.body, /"service":"עיצוב גבות"/); assert.match(mine.body, /אישור הגעה/); assert.match(mine.body, /לבטל את התור/); assert.doesNotMatch(mine.body, /אני מגיעה/);
  const ics = await w.get('/b/a/' + w.l + '.' + it.tok + '/ics');
  assert.match(ics.type, /text\/calendar/); assert.match(ics.body, /DTSTART:20261123T080000Z/); assert.match(ics.body, /DTEND:20261123T082000Z/); assert.match(ics.body, /SUMMARY:עיצוב גבות אצל הקליניקה של מור/);
  assert.strictEqual((await w.get('/b/a/' + w.l + '.' + 'c'.repeat(24))).status, 404);
  assert.strictEqual((await w.get('/b/a/' + 'c'.repeat(24) + '.' + it.tok)).status, 404);
});

test('double submit: the same key is the same booking, another key with the same phone and slot learns nothing', async () => {
  const w = await world();
  const ft = await w.ft(); w.st.now += 5000;
  const body = { l: w.l, ft, cid: 'samekey12345', service: 'brows', start: '2026-11-23 10:00', name: 'דנה כהן', phone: '052-123-4567', website: '' };
  const a = J(await w.post('/api/book', body));
  const ft2 = await w.ft(); w.st.now += 5000;
  const b = J(await w.post('/api/book', Object.assign({}, body, { ft: ft2, phone: '0521234567' })));
  assert.strictEqual(a.ok, true); assert.strictEqual(b.ok, true); assert.strictEqual(b.again, true); assert.strictEqual(a.booking.tok, b.booking.tok);
  assert.strictEqual(B.readItems(w.dp).length, 1);
  assert.strictEqual(fs.readdirSync(path.join(w.dp, 'chat', 'chat')).length, 1); // one notification
  // somebody who only knows the phone: a different key, the same slot. A plain refusal, no name, no token, no time
  const evil = await w.book({ name: 'x x', cid: 'otherkey98765' });
  assert.strictEqual(evil.status, 409); assert.deepStrictEqual(Object.keys(J(evil)).sort(), ['error', 'ft']); assert.strictEqual(J(evil).error, 'conflict');
  assert.doesNotMatch(evil.body, /דנה|tok|\d{24}|23\.11/);
});

test('a form token is single use, bound to the link, and made per page load', async () => {
  const w = await world();
  const ft = await w.ft(); w.st.now += 5000;
  const base = { l: w.l, ft, cid: 'abcdefgh1', service: 'brows', start: '2026-11-23 10:00', name: 'דנה כהן', phone: '0521234567' };
  assert.strictEqual((await w.post('/api/book', base)).status, 200);
  const again = await w.post('/api/book', Object.assign({}, base, { cid: 'abcdefgh2', start: '2026-11-23 11:00', phone: '0541112233' }));
  assert.strictEqual(J(again).error, 'fast'); // the same token a second time
  assert.strictEqual(B.readItems(w.dp).length, 1);
  assert.notStrictEqual(await w.ft(), await w.ft()); // each page load has its own
  assert.strictEqual(J(await w.post('/api/book', Object.assign({}, base, { ft: 'forged', cid: 'abcdefgh3' }))).error, 'fast');
  const f3 = await w.ft(); w.st.now += 1000; // too quick
  assert.strictEqual(J(await w.post('/api/book', Object.assign({}, base, { ft: f3, cid: 'abcdefgh4', start: '2026-11-23 12:00', phone: '0541112233' }))).error, 'fast');
  const f4 = await w.ft(); w.st.now += 7 * 3600e3;
  assert.strictEqual(J(await w.post('/api/book', Object.assign({}, base, { ft: f4, cid: 'abcdefgh5', start: '2026-11-30 12:00', phone: '0541112233' }))).error, 'stale');
  // a token issued for one link is no good for another
  const w2 = await world(); const other = await w2.ft();
  assert.strictEqual(J(await w.post('/api/book', Object.assign({}, base, { ft: other, cid: 'abcdefgh6' }))).error, 'fast');
  assert.strictEqual(B.readItems(w.dp).length, 1);
});

test('the honeypot, validation, a start that is not a free slot', async () => {
  const w = await world();
  assert.strictEqual(J(await w.book({ website: 'http://spam' })).ok, true); assert.strictEqual(B.readItems(w.dp).length, 0); // told it worked, nothing written
  for (const [over, err] of [[{ phone: '031234567' }, 'phone'], [{ phone: '' }, 'phone'], [{ name: 'א' }, 'name'], [{ name: 'x'.repeat(41) }, 'name'], [{ name: '12345' }, 'name'],
    [{ service: 'nope' }, 'service'], [{ start: 'garbage' }, 'start'], [{ start: '2026-12-31 10:00' }, 'start'], [{ start: '2026-11-21 10:00' }, 'conflict'], [{ start: '2026-11-23 10:07' }, 'conflict'], [{ start: '2026-11-28 10:00' }, 'conflict'], [{ start: '2026-11-23 16:50' }, 'conflict']]) {
    const r = await w.book(over); assert.strictEqual(J(r).error, err, JSON.stringify(over));
  }
  assert.strictEqual(B.readItems(w.dp).length, 0);
  assert.strictEqual((await w.post('/api/book', null)).status, 400); assert.strictEqual((await w.post('/api/book', { l: w.l })).status, 400); assert.strictEqual((await w.post('/api/book', { l: 'f'.repeat(24) })).status, 404);
  assert.strictEqual((await w.book({ phone: '+972 54 111 2233', name: 'מיכל רון' })).status, 200);
  assert.strictEqual(B.readItems(w.dp)[0].phone, '972541112233');
});

test('limits: 3 successful per IP per day, 12 per business per hour, 40 per day (the owner can loosen them), one unconfirmed booking for a new phone, 3 active per phone', async () => {
  const w = await world();
  const at = (i) => '2026-11-23 ' + String(9 + Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00'); // 20 minute services, 30 apart: 13 of them fit
  const ph = (i) => '05211100' + String(10 + i);
  for (let i = 0; i < 3; i++) assert.strictEqual((await w.book({ start: at(i), phone: ph(i), name: 'לקוחה ' + i }, '9.9.9.9')).status, 200, 'ip create ' + i);
  const r4 = await w.book({ start: at(3), phone: ph(3), name: 'לקוחה 3' }, '9.9.9.9');
  assert.strictEqual(r4.status, 429); assert.strictEqual(J(r4).error, 'rate'); // the fourth of one address in a day
  // the business: 12 an hour from the link, whatever the addresses
  for (let i = 3; i < 12; i++) assert.strictEqual((await w.book({ start: at(i), phone: ph(i), name: 'לקוחה ' + i }, '10.0.0.' + i)).status, 200, 'business create ' + i);
  const full = await w.book({ start: at(12), phone: ph(12), name: 'לקוחה 12' }, '10.0.0.99');
  assert.strictEqual(full.status, 429); assert.strictEqual(J(full).error, 'unavailable');
  w.st.now += 61 * 60e3; // an hour later the hourly window is clear again (the day's count is 12 of 40)
  assert.strictEqual((await w.book({ start: at(12), phone: ph(12), name: 'לקוחה 12' }, '10.0.0.99')).status, 200);
  // the day: 40 (here loosened to 100 an hour and tightened to 14 a day to see it)
  const c = B.loadConfig(w.dp); c.limits.perHour = 100; c.limits.perDay = 14; B.saveConfig(w.dp, c);
  assert.strictEqual((await w.book({ start: '2026-11-24 09:00', phone: ph(13), name: 'לקוחה 13' }, '10.0.1.1')).status, 200); // the 14th
  assert.strictEqual(J(await w.book({ start: '2026-11-24 09:30', phone: ph(14), name: 'לקוחה 14' }, '10.0.1.2')).error, 'unavailable');
  assert.deepStrictEqual(B.loadConfig(w.dp).limits, { perHour: 100, perDay: 14, ipPerDay: 3, phoneActive: 3, unconfirmedPerPhone: 1 });
  // a new phone: one unconfirmed booking from the link until it is confirmed
  const w2 = await world(); const p = '0549990000';
  assert.strictEqual((await w2.book({ start: '2026-11-24 09:00', phone: p, name: 'עדי לוי' }, '7.7.0.1')).status, 200);
  const second = await w2.book({ start: '2026-11-24 10:00', phone: p, name: 'עדי לוי' }, '7.7.0.2');
  assert.strictEqual(second.status, 429); assert.strictEqual(J(second).error, 'unavailable');
  // the client confirms on her personal page, and she can book more (up to 3 active)
  const first = B.readItems(w2.dp)[0];
  assert.strictEqual(J(await w2.post('/api/book/act', { l: w2.l, tok: first.tok, action: 'confirm' })).status, 'confirmed');
  for (let i = 0; i < 2; i++) assert.strictEqual((await w2.book({ start: '2026-11-24 1' + i + ':00', phone: p, name: 'עדי לוי' }, '7.7.1.' + i)).status, 200);
  const r4b = await w2.book({ start: '2026-11-24 13:00', phone: p, name: 'עדי לוי' }, '7.7.1.9');
  assert.strictEqual(r4b.status, 429); assert.strictEqual(J(r4b).error, 'unavailable');
  // the owner's confirmation counts as well
  const w3 = await world(); const q = '0549991111';
  await w3.book({ start: '2026-11-24 09:00', phone: q, name: 'שרה כהן' }, '6.6.0.1');
  assert.strictEqual(J(await w3.book({ start: '2026-11-24 10:00', phone: q, name: 'שרה כהן' }, '6.6.0.2')).error, 'unavailable');
  B.setStatus(w3.dp, B.readItems(w3.dp)[0].id, 'confirmed', w3.st.now);
  assert.strictEqual((await w3.book({ start: '2026-11-24 10:00', phone: q, name: 'שרה כהן' }, '6.6.0.3')).status, 200);
  // a booking of the owner's own never counts against the link's limits
  const w4 = await world();
  for (let i = 0; i < 14; i++) assert.strictEqual(B.add(w4.dp, { start: '2026-11-23 ' + String(9 + Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00'), serviceId: 'brows', name: 'ממני ' + i, phone: '05311100' + String(10 + i), src: 'owner' }, NOW).ok, true);
  assert.strictEqual((await w4.book({ start: '2026-11-24 09:00', phone: '0541110000', name: 'מהקישור' }, '5.5.0.1')).status, 200);
});

test('the pages and slots are limited per IP too', async () => {
  const w = await world();
  for (let i = 0; i < 120; i++) assert.strictEqual((await w.get('/b/' + w.l, {}, '5.5.5.5')).status, 200);
  assert.strictEqual((await w.get('/b/' + w.l, {}, '5.5.5.5')).status, 429);
  for (let i = 0; i < 300; i++) assert.strictEqual((await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'brows' }, '5.5.4.4')).status, 200);
  assert.strictEqual((await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'brows' }, '5.5.4.4')).status, 429);
});

test('act: confirm only a booked future booking, cancel and move only in the future, a no show is the owner\'s', async () => {
  const w = await world();
  const tok = J(await w.book()).booking.tok; fs.readdirSync(path.join(w.dp, 'chat', 'chat')).forEach((f) => fs.unlinkSync(path.join(w.dp, 'chat', 'chat', f)));
  const act = async (a, extra) => w.post('/api/book/act', Object.assign({ l: w.l, tok, action: a }, extra));
  assert.strictEqual((await w.post('/api/book/act', { l: w.l, tok: 'd'.repeat(24), action: 'confirm' })).status, 404);
  assert.strictEqual((await act('boom')).status, 400);
  assert.strictEqual(J(await act('confirm')).status, 'confirmed'); assert.strictEqual(B.byToken(w.dp, tok).status, 'confirmed');
  assert.strictEqual(J(await act('confirm')).status, 'confirmed'); // again: fine, one note
  assert.strictEqual(fs.readdirSync(path.join(w.dp, 'chat', 'chat')).length, 1);
  assert.strictEqual(J(await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'brows' })).slots.some((s) => s.time === '10:00'), false);
  // a move: to a free slot on the grid only, and the reminder is stale
  const id = B.byToken(w.dp, tok).id; B.markReminded(w.dp, [id], NOW);
  assert.ok(B.byToken(w.dp, tok).remindedAt);
  assert.strictEqual((await act('move', { start: '2026-11-24 10:07' })).status, 409);
  assert.strictEqual((await act('move', { start: '2026-11-28 10:00' })).status, 409);
  assert.strictEqual((await act('move', { start: 'x' })).status, 400);
  const mv = J(await act('move', { start: '2026-11-24 12:00' }));
  assert.strictEqual(mv.ok, true); assert.match(mv.when, /יום שלישי 24\.11 בשעה 12:00/);
  const after = B.byToken(w.dp, tok); assert.strictEqual(after.start, '2026-11-24T12:00:00+02:00'); assert.strictEqual(after.status, 'booked'); assert.ok(!after.remindedAt);
  // cancel frees the slot, twice is fine, a cancelled one cannot be confirmed
  assert.strictEqual(J(await act('cancel')).status, 'cancelled');
  assert.strictEqual(J(await w.get('/api/book/slots', { l: w.l, date: '2026-11-24', service: 'brows' })).slots.some((s) => s.time === '12:00'), true);
  assert.strictEqual(J(await act('cancel')).status, 'cancelled');
  assert.strictEqual((await act('confirm')).status, 409);
  assert.match((await w.get('/b/a/' + w.l + '.' + tok)).body, /"status":"cancelled"/);
  // a no show or a past booking: the client changes nothing
  const t2 = J(await w.book({ start: '2026-11-25 10:00', phone: '0541112233', name: 'מיכל רון' })).booking.tok, id2 = B.byToken(w.dp, t2).id;
  B.setStatus(w.dp, id2, 'noshow', NOW);
  for (const a of ['confirm', 'cancel', 'move']) { const r = await w.post('/api/book/act', { l: w.l, tok: t2, action: a, start: '2026-11-26 10:00' }); assert.strictEqual(r.status, 409, a); }
  assert.strictEqual(B.byToken(w.dp, t2).status, 'noshow');
  w.st.now = Date.parse('2026-11-25T09:00:00Z'); // after it started
  const t3 = B.byToken(w.dp, t2); B.setStatus(w.dp, id2, 'booked', NOW);
  for (const a of ['confirm', 'cancel']) assert.strictEqual((await w.post('/api/book/act', { l: w.l, tok: t2, action: a })).status, 409, 'past ' + a);
  assert.ok(t3);
});

test('a freed hour offers up to three lapsed clients as prepared wa.me messages, written by the agent for the owner to send', async () => {
  const w = await world();
  const ago = (days, name, phone) => { const d = new Date(NOW - days * 864e5).toISOString().slice(0, 10); const r = B.add(w.dp, { start: d + ' 10:00', serviceId: 'brows', name, phone }, NOW - (days + 1) * 864e5); assert.ok(r.ok, JSON.stringify(r)); B.setStatus(w.dp, r.booking.id, 'done', NOW); };
  ago(70, 'יעל שגיא', '0500000104'); ago(63, 'שירן אוחיון', '0500000102'); ago(60, 'נועה ברק', '0500000103'); ago(58, 'רונית דהן', '0500000110'); ago(7, 'מיכל רון', '0500000106');
  const tok = J(await w.book()).booking.tok;
  await w.post('/api/book/act', { l: w.l, tok, action: 'cancel' });
  const lists = SL.all(w.dp);
  assert.strictEqual(lists.length, 1); assert.deepStrictEqual(lists[0].items.map((x) => x.name), ['יעל שגיא', 'שירן אוחיון', 'נועה ברק']);
  const pg = SL.forPage(w.dp, NOW)[0];
  assert.ok(pg.items.every((x) => x.link.startsWith('https://wa.me/9725') && !x.bad)); assert.match(pg.items[0].text, /התפנה לי תור יום שני 23\.11 בשעה 10:00/);
  assert.strictEqual(SL.validate(lists[0]).length, 0);
});

test('the owner is told one record per event, but at most one WhatsApp push in ten minutes', async () => {
  const w = await world();
  await w.book({ start: '2026-11-23 09:00', phone: '0521110001', name: 'א א' }, '4.4.0.1');
  await w.book({ start: '2026-11-23 10:00', phone: '0521110002', name: 'ב ב' }, '4.4.0.2');
  await w.book({ start: '2026-11-23 11:00', phone: '0521110003', name: 'ג ג' }, '4.4.0.3');
  const recs = fs.readdirSync(path.join(w.dp, 'chat', 'chat')).map((f) => JSON.parse(fs.readFileSync(path.join(w.dp, 'chat', 'chat', f), 'utf8')));
  assert.strictEqual(recs.length, 3); assert.strictEqual(recs.filter((r) => r.waPush).length, 1);
  w.st.now += 11 * 60e3;
  await w.book({ start: '2026-11-23 12:00', phone: '0521110004', name: 'ד ד' }, '4.4.0.4');
  assert.strictEqual(fs.readdirSync(path.join(w.dp, 'chat', 'chat')).map((f) => JSON.parse(fs.readFileSync(path.join(w.dp, 'chat', 'chat', f), 'utf8'))).filter((r) => r.waPush).length, 2);
});

test('PRIVACY: nothing about a client is on the platform side, in files or in the bridge log; the agent logs ids only', async () => {
  const w = await world();
  const a = J(await w.book()).booking.tok, b = J(await w.book({ name: 'מיכל רון', phone: '0541112233', start: '2026-11-23 11:00' })).booking.tok;
  await w.post('/api/book/act', { l: w.l, tok: a, action: 'confirm' }); await w.post('/api/book/act', { l: w.l, tok: b, action: 'cancel' });
  await w.post('/api/book/act', { l: w.l, tok: a, action: 'move', start: '2026-11-24 12:00' });
  const names = ['דנה כהן', 'מיכל רון'], phones = ['0521234567', '972521234567', '521234567', '0541112233', '972541112233', '541112233'];
  assert.deepStrictEqual(grep(w.DATA, names.concat(phones, [a, b])), []);
  const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push(path.relative(w.DATA, p).split(path.sep).join('/')); } })(w.DATA);
  assert.deepStrictEqual(files.slice().sort(), ['book/links/' + w.l + '.json', 'book/links/by-tenant/t1.json'].sort()); // the link map and its reverse map, nothing else
  for (const log of [w.st.logs.join('\n'), w.st.agentLogs.join('\n')]) for (const n of names.concat(phones)) assert.ok(!log.includes(n), 'log has ' + n);
  assert.ok(w.st.agentLogs.some((l) => /^book t1 create ok [0-9a-f]{12}$/.test(l)));
  assert.ok(grep(w.dp, ['דנה כהן']).length > 0); // it IS in the tenant's own folder
});

test('a booking from the link is not a client until the owner taps once', async () => {
  const w = await world();
  await w.book();
  const it = B.readItems(w.dp)[0];
  assert.strictEqual(it.clientId, ''); assert.deepStrictEqual(bh.readList(w.dp, 'client'), []);
  const r = B.promoteClient(w.dp, it.id);
  assert.strictEqual(r.ok, true); const cl = bh.readList(w.dp, 'client'); assert.strictEqual(cl.length, 1); assert.strictEqual(cl[0].phone, '972521234567'); assert.strictEqual(B.readItems(w.dp)[0].clientId, cl[0].id);
  // and the public booking of a known client's phone never gives that client a new phone either
  bh.writeList(w.dp, 'client', [{ id: 'c-x', name: 'דנה כהן', biz: '', emails: [], domains: [], aliases: [], status: 'קבועה', terms: '', note: '' }]);
  await w.book({ start: '2026-11-23 11:00', phone: '0549998877' });
  assert.ok(!bh.readList(w.dp, 'client')[0].phone);
});

test('agent down: a calm answer, nothing else breaks', async () => {
  const w = await world();
  const ft = await w.ft(); w.st.now += 5000;
  await w.agent.close(); try { fs.unlinkSync(w.sock); } catch (e) { /* gone */ }
  const pg = await w.get('/b/' + w.l);
  assert.strictEqual(pg.status, 503); assert.match(pg.body, /אי אפשר לקבוע כרגע, נסו שוב בעוד כמה דקות/);
  assert.strictEqual((await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'brows' })).status, 503);
  const bk = await w.post('/api/book', { l: w.l, ft, cid: 'downkey12345', service: 'brows', start: '2026-11-23 10:00', name: 'דנה כהן', phone: '0521234567' });
  assert.strictEqual(bk.status, 503); assert.strictEqual(J(bk).error, 'down'); assert.ok(J(bk).ft, 'a fresh form token for the retry');
  assert.strictEqual((await w.post('/api/book/act', { l: w.l, tok: 'a'.repeat(24), action: 'confirm' })).status, 503);
  assert.strictEqual((await w.get('/b/zzz')).status, 404); // the rest of the page works
});

test('agent slow: a timeout, and the bridge event loop keeps ticking while it waits', async () => {
  const w = await world({ timeoutMs: 400 });
  await w.agent.close(); try { fs.unlinkSync(w.sock); } catch (e) { /* gone */ }
  const hang = net.createServer((c) => { c.resume(); /* reads, never answers */ }); await new Promise((r) => hang.listen(w.sock, r)); live.push({ close: () => new Promise((r) => hang.close(r)) });
  let ticks = 0; const iv = setInterval(() => ticks++, 10);
  const t0 = Date.now(); const pg = await w.get('/b/' + w.l); const took = Date.now() - t0; clearInterval(iv);
  assert.strictEqual(pg.status, 503); assert.ok(took >= 380 && took < 1500, 'took ' + took);
  assert.ok(ticks >= 25, 'the loop ticked ' + ticks + ' times meanwhile'); // it was never blocked
});

test('the agent\'s answer is untrusted: garbage is a calm page, tenant text is escaped, oversized answers are dropped', async () => {
  const w = await world();
  await w.agent.close(); try { fs.unlinkSync(w.sock); } catch (e) { /* gone */ }
  let reply = '';
  const fake = net.createServer((c) => { c.on('data', () => { c.end(reply); }); c.on('error', () => {}); });
  await new Promise((r) => fake.listen(w.sock, r)); live.push({ close: () => new Promise((r) => fake.close(r)) });
  reply = 'not json\n'; assert.strictEqual((await w.get('/b/' + w.l)).status, 503);
  reply = JSON.stringify({ ok: true, name: 'x', services: 'no', days: [] }) + '\n'; assert.strictEqual((await w.get('/b/' + w.l)).status, 503);
  reply = JSON.stringify({ ok: true, name: 'x'.repeat(40000), services: [], days: [] }) + '\n'; assert.strictEqual((await w.get('/b/' + w.l)).status, 503);
  reply = ('{"ok":true,"junk":"' + 'y'.repeat(40000) + '"}\n'); assert.strictEqual((await w.get('/b/' + w.l)).status, 503);
  // a tenant that tries to inject markup through every text field
  const evil = '<img src=x onerror=alert(1)></script><script>alert(2)</script>';
  reply = JSON.stringify({ ok: true, name: evil, accent: ['red;}body{display:none', '</style>', 'javascript:'], fem: true,
    services: [{ id: 'a b', name: evil, minutes: 20, price: 1 }, { id: 'ok1', name: evil, minutes: 20, price: 80 }], days: [{ d: '2026-11-23', w: evil, label: '23.11', closed: false }, { d: 'bad', w: 'x', label: 'x' }] }) + '\n';
  const r = await w.get('/b/' + w.l);
  assert.strictEqual(r.status, 200);
  assert.doesNotMatch(r.body, /<img src=x|<script>alert|onerror=alert\(1\)><\/script/); assert.match(r.body, /&lt;img src=x/);
  assert.doesNotMatch(r.body, /display:none|javascript:/);
  assert.match(r.body, /--a:#2f6f4f/); // a bad colour is replaced by the default
  const body = r.body.slice(r.body.indexOf('<script>('));
  assert.ok(!/<\/script><script>alert/.test(body) && !body.includes('<script>alert'), 'the embedded data cannot close the script');
  assert.doesNotMatch(body, /"id":"a b"/); // a service id with a space is dropped
  // slots with the wrong shape
  reply = JSON.stringify({ ok: true, slots: [{ time: '10:00', start: '2026-11-23T10:00:00+02:00' }, { time: '<b>', start: 'x' }, 5] }) + '\n';
  assert.deepStrictEqual(J(await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'brows' })).slots, [{ time: '10:00', start: '2026-11-23T10:00:00+02:00' }]);
});

test('the demo link: invented data, nothing saved, nobody told', async () => {
  const demo = require('../lib/book-demo.js');
  const w = await world({ demo: { request: demo.request } });
  w.st.now = Date.now();
  const pg = await w.get('/b/' + BP.DEMO_LINK);
  assert.strictEqual(pg.status, 200); assert.match(pg.body, /הקליניקה של מור/); assert.match(pg.body, /אנטי אייג׳ינג/);
  const day = new Date(Date.now() + 2 * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const s = J(await w.get('/api/book/slots', { l: BP.DEMO_LINK, date: day, service: 'face' })); assert.ok(s.slots.length > 5);
  const before = B.readItems(demo.dir()).length;
  const ft = /"ft":"([^"]+)"/.exec(pg.body)[1]; w.st.now += 5000;
  const r = J(await w.post('/api/book', { l: BP.DEMO_LINK, ft, cid: 'demokey12345', service: 'face', start: s.slots[0].start.slice(0, 16).replace('T', ' '), name: 'דנה כהן', phone: '0521234567', website: '' }));
  assert.strictEqual(r.ok, true); assert.strictEqual(B.readItems(demo.dir()).length, before);
  assert.strictEqual((await w.get('/b/a/' + BP.DEMO_LINK + '.' + 'a'.repeat(24))).status, 200);
  assert.strictEqual(J(await w.post('/api/book/act', { l: BP.DEMO_LINK, tok: BP.DEMO_TOK, action: 'cancel' })).status, 'cancelled');
});

test('a business whose instance has bookings off has no page', async () => {
  const w = await world();
  const ft = await w.ft(); w.st.now += 5000;
  w.inst.bookings = false; // the agent holds the same object
  assert.strictEqual((await w.get('/b/' + w.l)).status, 404);
  assert.strictEqual(J(await w.post('/api/book', { l: w.l, ft, cid: 'offkey123456', service: 'brows', start: '2026-11-23 10:00', name: 'דנה כהן', phone: '0521234567' })).error, 'off');
  assert.strictEqual(B.readItems(w.dp).length, 0);
  assert.strictEqual((await w.get('/api/book/slots', { l: w.l, date: '2026-11-23', service: 'brows' })).status, 400);
  assert.strictEqual((await w.P.makeLink('t1')).ok, false);
});

test('links that open on a day, a service, a time: cleaned on the server, ignored silently when invalid, the page still free', async () => {
  const w = await world();
  const pre = async (q) => { const b = (await w.get('/b/' + w.l, q)).body; const m = /"pre":(\{[^}]*\})/.exec(b); return JSON.parse(m[1]); };
  assert.deepStrictEqual(await pre({ d: '2026-11-24', s: 'brows', t: '10:15' }), { d: '2026-11-24', s: 'brows', t: '10:15' });
  assert.deepStrictEqual(await pre({}), {});
  assert.deepStrictEqual(await pre({ d: '2026-11-28', s: 'face', t: '10:00' }), { s: 'face' }); // Saturday is closed
  assert.deepStrictEqual(await pre({ d: '2026-12-30', s: 'nope', t: '10:00' }), {}); // out of the window, unknown service, a time without a day
  assert.deepStrictEqual(await pre({ d: '2026-11-24', t: '10:07' }), { d: '2026-11-24' }); // off the grid
  assert.deepStrictEqual(await pre({ d: '2026-11-24', s: '<script>alert(1)</script>', t: '"><b>' }), { d: '2026-11-24' });
  const r = await w.get('/b/' + w.l, { d: '2026-11-24"><script>alert(1)</script>' });
  assert.strictEqual(r.status, 200); assert.doesNotMatch(r.body, /<script>alert/); // an attack in a parameter reaches nothing
  // the page is the same page: every service and day is still offered
  const full = (await w.get('/b/' + w.l, { d: '2026-11-24', s: 'brows', t: '10:15' })).body;
  assert.match(full, /"id":"brows"/); assert.match(full, /"id":"face"/); assert.match(full, /"d":"2026-11-23"/);
  // the agent's info now carries the slot step, and nothing else is new in the protocol
  const info = await w.P.ask('t1', { op: 'info', l: w.l });
  assert.strictEqual(info.slotMinutes, 15); assert.deepStrictEqual(Object.keys(info).sort(), ['accent', 'days', 'fem', 'name', 'ok', 'services', 'slotMinutes']);
});

test('limit, full and unconfirmed look the same from outside, and the owner is told once an hour with one generic WhatsApp line', async () => {
  const w = await world();
  const GENERIC = 'אי אפשר לקבוע עכשיו דרך הקישור. אפשר לכתוב לעסק, או לנסות שוב מאוחר יותר.';
  assert.ok(BP.clientJs.toString().includes(GENERIC));
  const chat = () => fs.readdirSync(path.join(w.dp, 'chat', 'chat')).map((f) => JSON.parse(fs.readFileSync(path.join(w.dp, 'chat', 'chat', f), 'utf8')));
  const closed = () => chat().filter((r) => /נסגר זמנית/.test(r.text));
  // an unconfirmed booking holds the phone; the same phone asking for another time is refused, the agent keeps the real code
  await w.book({ start: '2026-11-24 09:00', phone: '0549990000', name: 'עדי לוי' }, '3.3.0.1');
  const direct = await w.P.ask('t1', { op: 'create', service: 'brows', start: '2026-11-24 10:00', name: 'עדי לוי', phone: '0549990000', idem: 'directkey1234' });
  assert.deepStrictEqual(direct, { ok: false, error: 'unconfirmed' });
  // outside: the same generic answer, with no hint of which of the three it was
  const outside = await w.book({ start: '2026-11-24 10:00', phone: '0549990000', name: 'עדי לוי' }, '3.3.0.2');
  assert.strictEqual(outside.status, 429); assert.deepStrictEqual(Object.keys(J(outside)).sort(), ['error', 'ft']); assert.strictEqual(J(outside).error, 'unavailable');
  assert.strictEqual(closed().length, 1, 'the owner hears of the held phone');
  // the slot taken stays specific
  const taken = await w.book({ start: '2026-11-24 09:00', phone: '0542220000', name: 'עוד אחת' }, '3.3.0.4');
  assert.strictEqual(taken.status, 409); assert.strictEqual(J(taken).error, 'conflict');
  // the business cap: a different phone, refused the very same way
  const c = B.loadConfig(w.dp); c.limits.perHour = 1; B.saveConfig(w.dp, c);
  const capped = await w.book({ start: '2026-11-24 11:00', phone: '0541110000', name: 'מישהי' }, '3.3.0.3');
  assert.strictEqual(capped.status, outside.status); assert.strictEqual(J(capped).error, J(outside).error);
  assert.strictEqual(closed().length, 1, 'at most once an hour, whichever reason');
  // the text the owner gets is the generic one, with no client's name or phone
  const rec = closed()[0];
  assert.strictEqual(rec.text, 'היום נקבעו הרבה תורים מהקישור והוא נסגר זמנית. אפשר לפתוח אותו שוב או לשנות את המגבלה בהגדרות התורים.');
  assert.ok(!/עדי|מישהי|0549|0541/.test(JSON.stringify(rec)));
  // an hour later the hourly count is clear, and the cap is hit again: the owner is told again
  w.st.now += 61 * 60e3;
  assert.strictEqual((await w.book({ start: '2026-11-24 11:30', phone: '0541110001', name: 'שוב' }, '3.3.0.7')).status, 200);
  assert.strictEqual((await w.book({ start: '2026-11-24 12:00', phone: '0541110003', name: 'ושוב' }, '3.3.0.9')).status, 429);
  assert.strictEqual(closed().length, 2, 'an hour later the owner is told again');
  // "open the link again now" starts the hourly count over
  const c2 = B.loadConfig(w.dp); c2.reopenedAt = new Date(w.st.now).toISOString(); c2.limits.perHour = 1; B.saveConfig(w.dp, c2);
  w.st.now += 1000;
  assert.strictEqual((await w.book({ start: '2026-11-24 13:00', phone: '0541110002', name: 'אחרי פתיחה' }, '3.3.0.8')).status, 200);
});
