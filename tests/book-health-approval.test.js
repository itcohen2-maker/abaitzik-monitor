'use strict';
// 23.11.2026: the health declaration signed by finger (lib/book-health.js), how bookings from the link are approved (approve | auto),
// blocking a client from the link, the no show count, and the owner's cancel that prepares a message to the client.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BP = require('../lib/book-page.js');
const Agent = require('../lib/book-agent.js');
const B = require('../lib/bookings.js');
const H = require('../lib/bookings-handler.js');
const HL = require('../lib/book-health.js');
const L = require('../lib/book-links.js');
const UI = require('../lib/bookings-ui.js');
const SL = require('../lib/sendlist.js');
const DECL = require('./fixtures/health-decl.js');

const NOW = Date.parse('2026-11-22T06:00:00Z'); // Sunday 08:00 in Israel
const HOURS = { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [['09:00', '13:00']], 6: [] };
const live = [];
const J = (r) => JSON.parse(r.body);
const clone = (o) => JSON.parse(JSON.stringify(o));

async function world(extra) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-hl-'));
  const DATA = path.join(root, 'platform'), dp = path.join(root, 'tenant', 'data'), sockDir = path.join(root, 's');
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(dp, { recursive: true }); fs.mkdirSync(sockDir);
  B.saveConfig(dp, Object.assign({ hours: HOURS, services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }, { id: 'face', name: 'טיפול פנים', minutes: 60, price: 320, health: true }], slotMinutes: 15, bufferMinutes: 0 }, extra || {}));
  const inst = { name: 't1', trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'הקליניקה של מור' }, dataPath: dp };
  const st = { now: NOW, agentLogs: [], logs: [] };
  const agent = Agent.start({ inst, dataPath: dp, sockDir, now: () => st.now, log: (l) => st.agentLogs.push(l) });
  if (!agent.server.listening) await new Promise((r) => agent.server.once('listening', r));
  live.push(agent);
  const sock = path.join(sockDir, 's.sock');
  const P = BP.create({ DATA, sockPath: () => sock, now: () => st.now, log: (l) => st.logs.push(l), base: 'https://form.test', timeoutMs: 2500, demo: null });
  live.push({ close: async () => P.stop() });
  const made = await P.makeLink('t1'), l = made.link.split('/').pop();
  const w = { root, DATA, dp, inst, st, P, l };
  w.get = (p, q, ip) => P.handle({ method: 'GET', path: p, query: q || {}, body: null, ip: ip || '1.1.1.1' });
  w.post = (p, body, ip) => P.handle({ method: 'POST', path: p, query: {}, body, ip: ip || '1.1.1.1' });
  let n = 0, ipn = 10;
  w.book = async (over) => {
    const ft = /"ft":"([^"]+)"/.exec((await w.get('/b/' + l, {}, '9.9.9.9')).body)[1]; st.now += 5000;
    return w.post('/api/book', Object.assign({ l, ft, cid: 'k' + (n++) + 'abcdefgh', service: 'face', start: '2026-11-23 10:00', name: 'דנה כהן', phone: '0521234567', website: '', health: clone(DECL) }, over || {}), '5.5.5.' + (ipn++));
  };
  w.notes = () => (fs.existsSync(path.join(dp, 'chat', 'chat')) ? fs.readdirSync(path.join(dp, 'chat', 'chat')).map((f) => JSON.parse(fs.readFileSync(path.join(dp, 'chat', 'chat', f), 'utf8')).text) : []);
  return w;
}
test.after(async () => { for (const x of live) await Promise.race([x.close().then(() => 0, () => 0), new Promise((r) => setTimeout(r, 1500))]); });
function grep(dir, needles) {
  const hits = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), s = fs.lstatSync(p); if (s.isDirectory()) walk(p); else if (s.isFile()) { const t = fs.readFileSync(p, 'utf8'); needles.forEach((x) => { if (t.includes(x)) hits.push(p + ' ' + x); }); } } })(dir);
  return hits;
}
const inst = (dp) => ({ name: 't1', trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'הקליניקה של מור' }, dataPath: dp });

// ---------- the health declaration ----------
test('cleanServices keeps health only when it is exactly true; the owner line sets it and a re-added service keeps it', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-hl-'));
  const c = B.saveConfig(dp, { services: [{ id: 'a', name: 'פילינג', minutes: 30, price: 1, health: true }, { id: 'b', name: 'גבות', minutes: 20, price: 1, health: 'yes' }, { id: 'c', name: 'צבע', minutes: 20, price: 1 }] });
  assert.deepStrictEqual(c.services.map((s) => s.health), [true, false, false]);
  assert.strictEqual(B.resolveService(c, { serviceId: 'a' }).health, true);
  const i = inst(dp);
  assert.deepStrictEqual(B.parseRequest('הצהרת בריאות לשירות: גבות: כן'), { kind: 'healthsvc', name: 'גבות', on: true });
  assert.deepStrictEqual(B.parseRequest('הצהרת בריאות לשירות: ניקוי: עמוק: לא'), { kind: 'healthsvc', name: 'ניקוי: עמוק', on: false }); // a name with a colon
  let r = H.handle(i, 'תור לקוחה\nהצהרת בריאות לשירות: גבות: כן\n\nקוד 123456', NOW);
  assert.strictEqual(r.ok, true); assert.match(r.reply, /^עדכנתי: השירות גבות ידרוש הצהרת בריאות חתומה/); assert.strictEqual(B.loadConfig(dp).services[1].health, true);
  r = H.handle(i, 'הצהרת בריאות לשירות: גבות: לא', NOW); assert.strictEqual(r.ok, true); assert.strictEqual(B.loadConfig(dp).services[1].health, false);
  r = H.handle(i, 'הצהרת בריאות לשירות: אין כזה: כן', NOW); assert.strictEqual(r.ok, false); assert.match(r.reply, /לא מצאתי שירות/);
  H.handle(i, 'שירות חדש: פילינג | 45 | 300', NOW); // the same name again: the setting stays
  assert.strictEqual(B.loadConfig(dp).services.find((s) => s.name === 'פילינג').health, true);
  assert.strictEqual(H.isLine(i, 'הצהרת בריאות לשירות: גבות: כן'), true);
});

test('validate: strict about the answers, the agreement and the signature; text is capped', () => {
  const ok = HL.validate(clone(DECL)); assert.ok(ok); assert.strictEqual(ok.sig, DECL.sig);
  const bad = (f) => { const d = clone(DECL); f(d); return HL.validate(d); };
  assert.strictEqual(bad((d) => { d.agreed = false; }), null);
  assert.strictEqual(bad((d) => { d.agreed = 'true'; }), null);
  assert.strictEqual(bad((d) => { delete d.answers.q3; }), null);
  assert.strictEqual(bad((d) => { d.answers.q9 = { a: 'n' }; }), null);
  assert.strictEqual(bad((d) => { d.answers.q8 = { a: 'n' }; }), null); // the free question is the note, not an answer
  assert.strictEqual(bad((d) => { d.answers.q1 = { a: 'maybe' }; }), null);
  assert.strictEqual(bad((d) => { d.answers.q1 = 'y'; }), null);
  assert.strictEqual(bad((d) => { d.note = { x: 1 }; }), null);
  for (const sig of ['', 'M1,1', 'M10,10L12,12', 'L20,80L32,50L45,82', 'M20,80L32,50L45,82x', 'M20,80L32,50L45,82 ', 'M20,80L300,50L45,82', 'M20,80L32,120L45,82', 'M20,80L32,50L45,82<script>', 'M20,80,L32,50L45,82', 'M5,5L6,6L7,7L8,8', 'M' + '1,1L'.repeat(3000) + '2,2', null, 5, ['M20,80L32,50L45,82']]) {
    assert.strictEqual(bad((d) => { d.sig = sig; }), null, JSON.stringify(sig).slice(0, 40));
  }
  const long = bad((d) => { d.answers.q2 = { a: 'y', d: 'א'.repeat(500) }; d.note = 'ב'.repeat(900); });
  assert.strictEqual(long.answers.q2.d.length, HL.DETAIL_MAX); assert.strictEqual(long.note.length, HL.NOTE_MAX);
  assert.deepStrictEqual(bad((d) => { d.answers.q4 = { a: 'n', d: 'ignored' }; }).answers.q4, { a: 'n' });
});

test('create: refuses "health" when the service needs it and it is missing or bad; nothing is written', async () => {
  const w = await world();
  const refusals = [undefined, null, 'x', {}, Object.assign(clone(DECL), { agreed: false }), Object.assign(clone(DECL), { sig: 'M1,1' }), Object.assign(clone(DECL), { sig: 'M20,80L32,50L45,82' + 'L1,1'.repeat(900) }), Object.assign(clone(DECL), { answers: { q1: { a: 'n' } } })];
  for (const h of refusals) {
    const r = await w.book({ health: h });
    assert.strictEqual(r.status, 400, JSON.stringify(h && Object.keys(h))); assert.strictEqual(J(r).error, 'health');
  }
  assert.strictEqual(B.readItems(w.dp).length, 0); assert.strictEqual(fs.existsSync(path.join(w.dp, 'bookings', 'health')), false);
  // a service that does not need it books without it, and a declaration sent for it is not stored
  const r = await w.book({ service: 'brows', health: undefined, phone: '0527777777' }); assert.strictEqual(r.status, 200);
  const r2 = await w.book({ service: 'brows', start: '2026-11-23 11:00', phone: '0526666666' }); assert.strictEqual(r2.status, 200);
  assert.strictEqual(fs.existsSync(path.join(w.dp, 'bookings', 'health')), false);
});

test('create: a valid declaration is stored only in the tenant folder (0600), never in the bridge, never in a log or a notice', async () => {
  const w = await world();
  const d = clone(DECL); d.answers.q3 = { a: 'y', d: 'כדור לבלוטת התריס' }; d.note = 'פחד מזריקות';
  const r = await w.book({ health: d }); assert.strictEqual(r.status, 200); assert.strictEqual(J(r).ok, true);
  const item = B.readItems(w.dp)[0], rec = HL.load(w.dp, item.phone);
  assert.ok(rec); assert.strictEqual(rec.bookingId, item.id); assert.strictEqual(rec.answers.q3.a, 'y'); assert.strictEqual(rec.answers.q3.d, 'כדור לבלוטת התריס'); assert.strictEqual(rec.note, 'פחד מזריקות'); assert.strictEqual(rec.sig, DECL.sig); assert.match(rec.at, /^2026-11-22T/);
  assert.strictEqual(rec.q.q1, 'האם את בהריון או מניקה?');
  const dir = path.join(w.dp, 'bookings', 'health'), files = fs.readdirSync(dir);
  assert.strictEqual(files.length, 1); assert.match(files[0], /^[a-f0-9]{24}\.json$/); assert.ok(!files[0].includes('521234567')); assert.strictEqual(fs.statSync(path.join(dir, files[0])).mode & 0o777, 0o600);
  // nothing of it in the platform's folder, the bridge's log, the agent's log or what the owner is told
  const needles = ['כדור לבלוטת התריס', 'פחד מזריקות', DECL.sig];
  assert.deepStrictEqual(grep(w.DATA, needles), []);
  assert.deepStrictEqual(w.st.logs.concat(w.st.agentLogs).filter((x) => needles.some((n) => String(x).includes(n))), []);
  const notes = w.notes(); assert.ok(notes.some((t) => /כולל הצהרת בריאות חתומה/.test(t))); assert.deepStrictEqual(notes.filter((t) => needles.some((n) => t.includes(n))), []);
  // a second booking of the same phone adds a declaration (the last five are kept), the newest is the one shown
  const d2 = clone(DECL); d2.answers.q1 = { a: 'y', d: '' };
  B.setStatus(w.dp, item.id, 'confirmed', NOW); // a confirmed phone may book again
  assert.strictEqual((await w.book({ health: d2, start: '2026-11-24 10:00', phone: '0521234567' })).status, 200);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8')).list.length, 2); assert.strictEqual(HL.load(w.dp, item.phone).answers.q1.a, 'y');
});

test('the same answer for every phone: the agent never tells whether a phone has a declaration', async () => {
  const w = await world();
  await w.book({ phone: '0521234567' }); // this phone now has a declaration
  const bad = Object.assign(clone(DECL), { agreed: false });
  const a = await w.book({ phone: '0521234567', start: '2026-11-24 10:00', health: bad }), b = await w.book({ phone: '0529998877', start: '2026-11-24 12:00', health: bad });
  assert.strictEqual(a.status, 400); assert.strictEqual(b.status, 400); assert.strictEqual(J(a).error, J(b).error); assert.strictEqual(J(a).error, 'health');
  const info = await w.P.ask('t1', { op: 'info', l: w.l });
  assert.ok(!JSON.stringify(info).includes('0521234567')); assert.ok(!('hasHealth' in info));
  assert.ok(info.services.find((s) => s.id === 'face').health === true); assert.strictEqual(info.healthQ.length, 8); assert.strictEqual(info.healthQ[7].free, true);
});

test('the request fits the bridge limit of 8KB in the worst case (every answer yes, the longest texts and signature)', () => {
  const answers = {}; ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'].forEach((q) => { answers[q] = { a: 'y', d: 'א'.repeat(HL.DETAIL_MAX) }; });
  const sig = 'M' + '123,100L'.repeat(Math.floor((HL.SIG_MAX - 10) / 8)) + '1,1';
  const body = { l: 'a'.repeat(24), ft: 'f'.repeat(24), cid: 'c'.repeat(40), service: 'face', start: '2026-11-23 10:00', name: 'ש'.repeat(40), phone: '0521234567', website: '', health: { answers, note: 'ב'.repeat(HL.NOTE_MAX), sig: sig.slice(0, HL.SIG_MAX), agreed: true } };
  assert.ok(Buffer.byteLength(JSON.stringify(body)) < 8192, String(Buffer.byteLength(JSON.stringify(body))));
});

test('the bridge forwards a declaration only in its known shape and lengths', async () => {
  const w = await world();
  const d = clone(DECL); d.note = 'ב'.repeat(2000); d.evil = '<x>'; d.answers.q1 = { a: 'y', d: 'ד'.repeat(1000), extra: 1 };
  const r = await w.book({ health: d }); assert.strictEqual(r.status, 200);
  const rec = HL.load(w.dp, B.readItems(w.dp)[0].phone);
  assert.strictEqual(rec.note.length, HL.NOTE_MAX); assert.strictEqual(rec.answers.q1.d.length, HL.DETAIL_MAX); assert.ok(!('evil' in rec) && !('extra' in rec.answers.q1));
  const r2 = await w.book({ health: Object.assign(clone(DECL), { sig: 'M20,80L32,50L45,82' + 'Z'.repeat(5000) }), phone: '0528887766' });
  assert.strictEqual(J(r2).error, 'health');
});

test('the owner screen data: the declaration of a phone, the questions, the signature checked again', async () => {
  const w = await world();
  await w.book({ health: Object.assign(clone(DECL), { answers: Object.assign(clone(DECL).answers, { q2: { a: 'y', d: 'בישום' } }) }) });
  const D = UI.data(inst(w.dp), NOW), ph = '972521234567';
  assert.strictEqual(D.health[ph].answers.q2.a, 'y'); assert.strictEqual(D.health[ph].valid, true); assert.strictEqual(D.health[ph].sig, DECL.sig); assert.strictEqual(D.healthQ.length, 8);
  // a tampered file with a signature that is not a drawing never reaches the payload
  const f = path.join(w.dp, 'bookings', 'health', HL.keyOf(ph) + '.json'), j = JSON.parse(fs.readFileSync(f, 'utf8')); j.list[0].sig = '"><script>'; fs.writeFileSync(f, JSON.stringify(j));
  assert.deepStrictEqual(UI.data(inst(w.dp), NOW).health, {});
  const src = UI.page.toString();
  for (const part of ['הצהרת בריאות', 'דורש הצהרת בריאות', 'bkHq', 'viewBox="0 0 300 120"', 'בתוקף, עד שנה מהחתימה']) assert.ok(src.includes(part), part);
});

test('the booking page: the declaration step is in the page script, no display:none or javascript:, the privacy line', async () => {
  const w = await world();
  const r = await w.get('/b/' + w.l);
  assert.strictEqual(r.status, 200); assert.doesNotMatch(r.body, /display:none|javascript:/);
  const src = BP.clientJs.toString();
  for (const part of ['הצהרת בריאות', 'ההצהרה נשמרת רק אצל ', ', לצורך הטיפול.', 'חתימה באצבע', 'לנקות', 'pointerdown', 'sgInit', 'ERR.health']) assert.ok(src.includes(part), part);
  assert.match(r.body, /"healthQ":\[\{"id":"q1"/); assert.match(r.body, /"health":true/); assert.match(r.body, /touch-action:none/);
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'lib', 'book-page.js'), 'utf8').includes("'health']")); // the error code is known to the bridge
  // the demo shows the feature on invented data, and the demo page has no health: false service shown wrongly
  const demo = require('../lib/book-demo.js'); const dc = B.loadConfig(demo.dir());
  assert.ok(dc.services.some((s) => s.health));
});

// ---------- approval mode ----------
test('approval: default approve, only approve or auto are kept, the owner line and its answer', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-ap-'));
  assert.strictEqual(B.loadConfig(dp).approval, 'approve');
  assert.strictEqual(B.saveConfig(dp, { approval: 'auto' }).approval, 'auto');
  for (const bad of ['deposit', 'x', '', null, 5, ['auto'], undefined]) assert.strictEqual(B.saveConfig(dp, { approval: bad }).approval, 'approve', String(bad));
  assert.deepStrictEqual(B.parseRequest('אישור תורים: ידני'), { kind: 'approval', mode: 'approve' });
  assert.deepStrictEqual(B.parseRequest('אישור תורים: אוטומטי'), { kind: 'approval', mode: 'auto' });
  assert.strictEqual(B.parseRequest('אישור תורים: מקדמה'), null); // no deposits
  const i = inst(dp);
  let r = H.handle(i, 'אישור תורים: אוטומטי', NOW); assert.strictEqual(r.ok, true); assert.strictEqual(r.reply, 'עדכנתי: תור שנקבע מהקישור מאושר מיד.'); assert.strictEqual(B.loadConfig(dp).approval, 'auto');
  r = H.handle(i, 'אישור תורים: ידני', NOW); assert.strictEqual(r.reply, 'עדכנתי: תורים מהקישור מחכים לאישור שלך.'); assert.strictEqual(B.loadConfig(dp).approval, 'approve');
  assert.strictEqual(H.isLine(i, 'אישור תורים: אוטומטי'), true);
});

test('approval: approve stores "booked", auto stores "confirmed" at once with the owner told so; the limits still apply', async () => {
  const w = await world();
  let r = await w.book({ service: 'brows', health: undefined }); assert.strictEqual(J(r).booking.status, 'booked');
  assert.strictEqual(B.readItems(w.dp)[0].status, 'booked');
  const c = B.loadConfig(w.dp); c.approval = 'auto'; B.saveConfig(w.dp, c);
  r = await w.book({ service: 'brows', health: undefined, start: '2026-11-23 11:00', phone: '0526666666' }); assert.strictEqual(r.status, 200); assert.strictEqual(J(r).booking.status, 'confirmed');
  const it = B.readItems(w.dp).find((i) => i.phone === '972526666666'); assert.strictEqual(it.status, 'confirmed');
  assert.ok(w.notes().some((t) => /^✅ תור חדש מהקישור, אושר אוטומטית: דנה כהן, עיצוב גבות/.test(t)));
  // auto bookings of one phone are confirmed, so the unconfirmed per phone limit does not stop a second one; the active per phone limit does
  const r2 = await w.book({ service: 'brows', health: undefined, start: '2026-11-23 12:00', phone: '0526666666' }); assert.strictEqual(r2.status, 200);
  await w.book({ service: 'brows', health: undefined, start: '2026-11-23 13:00', phone: '0526666666' });
  const r4 = await w.book({ service: 'brows', health: undefined, start: '2026-11-23 14:00', phone: '0526666666' }); assert.strictEqual(r4.status, 429); assert.strictEqual(J(r4).error, 'unavailable');
});

test('approval: the page script says "התור אושר" for a confirmed booking and the approve line before sending; nothing for auto', () => {
  const src = BP.clientJs.toString();
  for (const part of ["'התור אושר'", "'התור נקבע'", 'אחרי הקביעה ', ' תאשר את התור.', "D.approval === 'approve'"]) assert.ok(src.includes(part), part);
  assert.ok(!/מקדמה/.test(src) && !/מקדמה/.test(fs.readFileSync(path.join(__dirname, '..', 'lib', 'book-page.js'), 'utf8')));
});

// ---------- blocking ----------
test('cleanConfig keeps only valid unique normalized mobile phones, at most 500', () => {
  const c = B.saveConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'bk-bl-')), { blocked: ['052-1234567', '0521234567', '972521234567', '+972 50 111 2222', '12345', '', null, 5, 'abc', '0721234567'] });
  assert.deepStrictEqual(c.blocked, ['972521234567', '972501112222']);
  const many = []; for (let i = 0; i < 700; i++) many.push('05' + String(10000000 + i).slice(0, 8));
  assert.strictEqual(B.cleanBlocked(many).length, 500);
  assert.deepStrictEqual(B.saveConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'bk-bl-')), { blocked: 'x' }).blocked, []);
});

test('a blocked phone gets the generic "not available" answer on create, others do not; her own link and the owner bookings still work', async () => {
  const w = await world();
  const first = J(await w.book({ service: 'brows', health: undefined, phone: '0521234567' })).booking; // booked before the block
  const c = B.loadConfig(w.dp); c.blocked = ['972521234567']; B.saveConfig(w.dp, c);
  const r = await w.book({ service: 'brows', health: undefined, start: '2026-11-24 10:00', phone: '052-123-4567' });
  assert.strictEqual(r.status, 429); assert.strictEqual(J(r).error, 'unavailable'); // the page shows "אי אפשר לקבוע עכשיו דרך הקישור..."
  assert.ok(!/חסומ|block/i.test(r.body)); assert.strictEqual(B.readItems(w.dp).length, 1);
  assert.ok(w.st.agentLogs.some((l) => /refused blocked/.test(l))); assert.ok(!w.st.agentLogs.concat(w.st.logs).some((l) => /521234567/.test(l)));
  assert.strictEqual((await w.book({ service: 'brows', health: undefined, start: '2026-11-24 10:00', phone: '0527654321' })).status, 200); // another phone
  // a blocked phone gets the same answer as a free one for a bad declaration (nothing tells them apart before the booking itself)
  const bad = Object.assign(clone(DECL), { agreed: false });
  assert.strictEqual(J(await w.book({ health: bad, phone: '0521234567', start: '2026-11-25 10:00' })).error, 'health');
  assert.strictEqual(J(await w.book({ health: bad, phone: '0529990000', start: '2026-11-25 11:00' })).error, 'health');
  // her own page for the existing booking: confirm still works
  const a = J(await w.post('/api/book/act', { l: w.l, tok: first.tok, action: 'confirm' })); assert.strictEqual(a.ok, true); assert.strictEqual(a.status, 'confirmed');
  // the owner adds a booking for her by hand: never blocked
  assert.strictEqual(B.add(w.dp, { start: '2026-11-26 10:00', serviceId: 'brows', name: 'דנה כהן', phone: '0521234567', src: 'owner' }, NOW).ok, true);
});

test('the owner lines block and unblock, by booking id or phone; the answers are in Hebrew', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-bl-')); B.saveConfig(dp, { hours: HOURS, services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }] });
  const i = inst(dp), b = B.add(dp, { start: '2026-11-23 10:00', serviceId: 'brows', name: 'דנה כהן', phone: '0521234567', src: 'link' }, NOW).booking;
  assert.deepStrictEqual(B.parseRequest('חסימת לקוחה: ' + b.id), { kind: 'block', ref: b.id });
  assert.deepStrictEqual(B.parseRequest('ביטול חסימה: 0521234567'), { kind: 'unblock', ref: '0521234567' });
  let r = H.handle(i, 'חסימת לקוחה: ' + b.id, NOW); assert.strictEqual(r.ok, true); assert.match(r.reply, /^חסמתי מהקישור: דנה כהן\./); assert.deepStrictEqual(B.loadConfig(dp).blocked, ['972521234567']);
  r = H.handle(i, 'חסימת לקוחה: ' + b.id, NOW); assert.strictEqual(r.ok, true); assert.strictEqual(B.loadConfig(dp).blocked.length, 1); // twice is once
  r = H.handle(i, 'ביטול חסימה: 0521234567', NOW); assert.strictEqual(r.ok, true); assert.strictEqual(r.reply, 'ביטלתי את החסימה. היא יכולה לקבוע תור דרך הקישור.'); assert.deepStrictEqual(B.loadConfig(dp).blocked, []);
  r = H.handle(i, 'ביטול חסימה: 0521234567', NOW); assert.strictEqual(r.ok, false); assert.match(r.reply, /לא ברשימת החסומות/);
  r = H.handle(i, 'חסימת לקוחה: 0501112233', NOW); assert.strictEqual(r.ok, true); assert.deepStrictEqual(B.loadConfig(dp).blocked, ['972501112233']);
  r = H.handle(i, 'חסימת לקוחה: nope', NOW); assert.strictEqual(r.ok, false);
  assert.strictEqual(H.isLine(i, 'חסימת לקוחה: x'), true); assert.strictEqual(H.isLine(i, 'ביטול חסימה: x'), true);
});

test('the other copies of the line prefixes know the new lines', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['listen.js', 'lib/fireflies-key.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8'), m = /const BOOKING_LINE = (\/.*\/);/.exec(src); assert.ok(m, f);
    const re = eval(m[1]); // eslint-disable-line no-eval
    for (const line of ['הצהרת בריאות לשירות: גבות: כן', 'אישור תורים: אוטומטי', 'חסימת לקוחה: abc', 'ביטול חסימה: 0521234567']) assert.ok(re.test(line), f + ' ' + line);
  }
  const da = require('../lib/demo-acts.js'); assert.ok(da);
  const src = fs.readFileSync(path.join(root, 'lib', 'demo-acts.js'), 'utf8');
  for (const part of ['הצהרת בריאות לשירות', 'אישור תורים', 'חסימת לקוחה', 'ביטול חסימה']) assert.ok(src.includes(part), part);
});

test('no show count: counted per phone, shown on the owner screen with the hint to block from two', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-ns-')); B.saveConfig(dp, { hours: HOURS, services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }] });
  const mk = (day, st) => { const r = B.add(dp, { start: day + ' 10:00', serviceId: 'brows', name: 'דנה כהן', phone: '0521234567', src: 'link' }, NOW - 40 * 864e5); B.setStatus(dp, r.booking.id, st, NOW); return r.booking; };
  mk('2026-10-18', 'noshow'); mk('2026-10-25', 'noshow'); mk('2026-11-01', 'done');
  const future = B.add(dp, { start: '2026-11-24 10:00', serviceId: 'brows', name: 'דנה כהן', phone: '0521234567', src: 'link' }, NOW).booking;
  assert.strictEqual(B.noshowCount(dp, '0521234567'), 2); assert.strictEqual(B.noshowCount(dp, '0500000000'), 0); assert.strictEqual(B.noshowCount(dp, ''), 0);
  const D = UI.data(inst(dp), NOW); assert.deepStrictEqual(D.noshows, { '972521234567': 2 }); assert.ok(D.items.some((x) => x.id === future.id));
  const src = UI.page.toString();
  for (const part of ['לא הגיעה פעם אחת', "'לא הגיעה ' + n + ' פעמים'", 'אפשר לחסום מהקישור.', 'לחסום מהקישור', 'לחסום באמת', 'חסומה', 'חסומות', 'לבטל חסימה', 'bkHint']) assert.ok(src.includes(part), part);
  assert.ok(!/מקדמה/.test(src));
});

test('the owner screen: the approval cards, the health toggle, the cancel with a second tap on each row', () => {
  const src = UI.page.toString();
  for (const part of ['איך מאשרים תורים מהקישור', 'אני מאשרת כל תור', 'אישור אוטומטי', 'תור שנקבע מאושר מיד', 'תורים מהקישור מחכים ברשימה לאישור שלך', 'role="radio"', "send('אישור תורים: '", 'לבטל באמת', "data-a=\"' + (ask ? 'cancel2' : 'cancel')"]) assert.ok(src.includes(part), part);
  assert.doesNotMatch(UI.html(inst(fs.mkdtempSync(path.join(os.tmpdir(), 'bk-ui-')))), /display:none|javascript:/);
  assert.ok(!/מקדמה/.test(UI.css('beauty')));
});

// ---------- the owner cancels, the client is told ----------
test('owner cancel: a prepared message to the client with the booking link; no link, no sentence about it; no lapsed offer', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-cx-')); B.saveConfig(dp, { hours: HOURS, services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }] });
  const i = inst(dp), tok = B.ensureLinkToken(dp);
  const old = B.add(dp, { start: '2026-10-05 10:00', serviceId: 'brows', name: 'שירן אוחיון', phone: '0500000102' }, NOW - 60 * 864e5).booking; B.setStatus(dp, old.id, 'done', NOW); // a lapsed client who is NOT offered the hour
  const b = B.add(dp, { start: '2026-11-23 11:00', serviceId: 'brows', name: 'הדס לוי', phone: '0529876543', src: 'link' }, NOW).booking;
  const r = H.handle(i, 'ביטול תור לקוחה: ' + b.id, NOW);
  assert.strictEqual(r.ok, true); assert.match(r.reply, /הכנתי ללקוחה הודעה על הביטול, והיא מחכה ב 📤 הודעות לשליחה\.$/);
  const lists = SL.all(dp); assert.strictEqual(lists.length, 1); assert.match(lists[0].id, /-bkcx$/); assert.strictEqual(SL.validate(lists[0]).length, 0);
  assert.strictEqual(lists[0].items.length, 1); assert.strictEqual(lists[0].items[0].phone, '972529876543');
  assert.strictEqual(lists[0].items[0].text, 'היי הדס, התור שלך לעיצוב גבות ביום שני 23.11 בשעה 11:00 אצל הקליניקה של מור בוטל. לקביעת תור חדש: https://form.it-solution.co.il/b/' + tok + '.');
  assert.ok(!/-bkfreed/.test(JSON.stringify(lists.map((x) => x.id))));
  // cancelling again does not write a second message
  H.handle(i, 'ביטול תור לקוחה: ' + b.id, NOW); assert.strictEqual(SL.all(dp).length, 1);
  // no link token and no phone
  const dp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-cx-')); B.saveConfig(dp2, { hours: HOURS, services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }] });
  const b2 = B.add(dp2, { start: '2026-11-23 11:00', serviceId: 'brows', name: 'נועה ברק', phone: '0501112233', src: 'link' }, NOW).booking;
  assert.strictEqual(L.prepareCancelled(dp2, b2, 'מור', NOW).text, 'היי נועה, התור שלך לעיצוב גבות ביום שני 23.11 בשעה 11:00 אצל מור בוטל.');
  const b3 = B.add(dp2, { start: '2026-11-23 12:00', serviceId: 'brows', name: 'בלי טלפון', phone: '', src: 'owner' }, NOW).booking;
  const r3 = H.handle(inst(dp2), 'ביטול תור לקוחה: ' + b3.id, NOW); assert.strictEqual(r3.ok, true); assert.doesNotMatch(r3.reply, /הודעות לשליחה/);
});

test('the owner is told about a cancel by the client, and the agent offers nothing to lapsed clients (offerFreed is gone)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'book-core.js'), 'utf8');
  assert.ok(!/offerFreed|lapsed/.test(src)); assert.ok(src.includes('בוטל על ידי הלקוח'));
});
