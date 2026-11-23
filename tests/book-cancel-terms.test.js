'use strict';
// 23.11.2026: the owner's cancellation terms (cfg.cancelHours): the setting, the owner's line, the client's cancel and move limited
// by it (lib/book-core.js), the pages that show it (lib/book-page.js) and the confirmation message the owner sends (lib/book-links.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('../lib/bookings.js');
const H = require('../lib/bookings-handler.js');
const L = require('../lib/book-links.js');
const BP = require('../lib/book-page.js');
const SL = require('../lib/sendlist.js');
const { makeCore } = require('../lib/book-core.js');

const HOUR = 3600e3;
const NOW = Date.parse('2026-11-22T06:00:00Z'); // Sunday 08:00 in Israel
const HOURS = { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [], 6: [] };
function world(cancelHours) {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-test-cx-'));
  const cfg = { hours: HOURS, services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }], slotMinutes: 15, bufferMinutes: 0 };
  if (cancelHours !== undefined) cfg.cancelHours = cancelHours;
  B.saveConfig(dp, cfg);
  const link = B.ensureLinkToken(dp);
  const inst = { name: 't1', dataPath: dp, trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'הקליניקה של מור' } };
  const notes = [];
  const core = makeCore({ inst, dataPath: dp, tenantId: 't1', now: () => NOW, notify: (t, o) => notes.push([t, o]), base: 'https://x.test' });
  // a booking 5 hours ahead (Sunday 13:00) and one two days ahead (Tuesday 10:00)
  const near = B.add(dp, { start: '2026-11-22 13:00', serviceId: 'brows', name: 'דנה כהן', phone: '0521234567', src: 'link' }, NOW).booking;
  const far = B.add(dp, { start: '2026-11-24 10:00', serviceId: 'brows', name: 'הדס לוי', phone: '0527654321', src: 'link' }, NOW).booking;
  return { dp, link, inst, notes, core, near, far, act: (tok, action, start) => core.handle({ op: 'act', tenant: 't1', tok, action, start }) };
}

test('cleanConfig: cancelHours defaults to 24, keeps 0 and the allowed values, anything else is 24', () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-test-cx-'));
  assert.strictEqual(B.loadConfig(dp).cancelHours, 24); // no config at all
  for (const ok of [0, 2, 4, 12, 24, 48]) assert.strictEqual(B.saveConfig(dp, { cancelHours: ok }).cancelHours, ok, String(ok));
  assert.strictEqual(B.saveConfig(dp, { cancelHours: '12' }).cancelHours, 12);
  for (const bad of [7, -1, 100, 1.5, 'x', '', null, undefined, NaN, [], {}, true]) assert.strictEqual(B.saveConfig(dp, { cancelHours: bad }).cancelHours, 24, String(bad));
  assert.strictEqual(B.loadConfig(dp).cancelHours, 24);
  B.saveConfig(dp, { cancelHours: 0 }); assert.strictEqual(B.loadConfig(dp).cancelHours, 0); // 0 survives a reload
});

test('act: the client cannot cancel or move inside the window, can outside it, and can always confirm arrival', async () => {
  const w = world(24);
  assert.deepStrictEqual(await w.act(w.near.tok, 'cancel'), { ok: false, error: 'late' });
  assert.deepStrictEqual(await w.act(w.near.tok, 'move', '2026-11-24 12:00'), { ok: false, error: 'late' });
  assert.strictEqual(B.byToken(w.dp, w.near.tok).status, 'booked'); assert.strictEqual(B.byToken(w.dp, w.near.tok).start.slice(0, 16), '2026-11-22T13:00');
  assert.strictEqual(w.notes.length, 0);
  const c = await w.act(w.near.tok, 'confirm'); assert.strictEqual(c.ok, true); assert.strictEqual(c.status, 'confirmed'); // arrival is always allowed
  assert.strictEqual((await w.act(w.near.tok, 'cancel')).error, 'late'); // still late once confirmed
  const m = await w.act(w.far.tok, 'move', '2026-11-24 12:00'); assert.strictEqual(m.ok, true); assert.match(m.start, /^2026-11-24T12:00/);
  const x = await w.act(w.far.tok, 'cancel'); assert.strictEqual(x.ok, true); assert.strictEqual(x.status, 'cancelled');
  assert.ok(w.notes.some((n) => /ביטל על ידי הלקוח|בוטל על ידי הלקוח/.test(n[0]) && n[1].push === true)); // the owner is told, with a push
});

test('act: the edge is exact (less than N hours is late, exactly N is fine), a smaller N lets the near booking go', async () => {
  const w = world(4); // near booking is 5 hours ahead
  assert.strictEqual((await w.act(w.near.tok, 'cancel')).ok, true);
  const w2 = world(12); assert.strictEqual((await w2.act(w2.near.tok, 'cancel')).error, 'late');
  const w3 = world(2); const r = B.add(w3.dp, { start: '2026-11-22 10:00', serviceId: 'brows', name: 'נועה', phone: '0501112222', src: 'link' }, NOW).booking; // exactly 2 hours
  assert.strictEqual((await w3.act(r.tok, 'cancel')).ok, true);
});

test('act: 0 means no limit, and a config without the field is 24', async () => {
  const w = world(0);
  assert.strictEqual((await w.act(w.near.tok, 'move', '2026-11-24 12:00')).ok, true);
  assert.strictEqual((await w.act(w.near.tok, 'cancel')).ok, true);
  const d = world(); // no cancelHours written
  assert.strictEqual((await d.act(d.near.tok, 'cancel')).error, 'late'); assert.strictEqual((await d.act(d.far.tok, 'cancel')).ok, true);
});

test('info and get carry cancelHours; the owner phone only when the monitor holds a valid one', async () => {
  const w = world(12);
  let i = await w.core.handle({ op: 'info', tenant: 't1', l: w.link }); assert.strictEqual(i.cancelHours, 12); assert.strictEqual(i.ownerPhone, '');
  let g = await w.core.handle({ op: 'get', tenant: 't1', tok: w.far.tok }); assert.strictEqual(g.booking.cancelHours, 12); assert.strictEqual(g.booking.ownerPhone, '');
  fs.mkdirSync(path.join(w.dp, 'conn'), { recursive: true }); fs.writeFileSync(path.join(w.dp, 'conn', 'wa.json'), JSON.stringify({ phone: '052-9998877' }));
  i = await w.core.handle({ op: 'info', tenant: 't1', l: w.link }); assert.strictEqual(i.ownerPhone, '972529998877');
  fs.writeFileSync(path.join(w.dp, 'conn', 'wa.json'), JSON.stringify({ phone: 'abc' }));
  assert.strictEqual((await w.core.handle({ op: 'info', tenant: 't1', l: w.link })).ownerPhone, '');
});

test('the owner line "תנאי ביטול" saves the value and answers in Hebrew', () => {
  const w = world(24);
  assert.deepStrictEqual(B.parseRequest('תנאי ביטול: 12'), { kind: 'cancelterms', hours: 12 });
  assert.deepStrictEqual(B.parseRequest('תנאי ביטול: ללא הגבלה'), { kind: 'cancelterms', hours: 0 });
  assert.strictEqual(B.parseRequest('תנאי ביטול: x'), null);
  let r = H.handle(w.inst, 'תור לקוחה\nתנאי ביטול: 48\n\nקוד 123456', NOW);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.reply, 'עדכנתי: ביטול או שינוי עד 48 שעות לפני התור.'); assert.strictEqual(B.loadConfig(w.dp).cancelHours, 48);
  r = H.handle(w.inst, 'תנאי ביטול: ללא הגבלה', NOW); assert.strictEqual(r.ok, true); assert.strictEqual(r.reply, 'עדכנתי: אפשר לבטל או לשנות בכל זמן.'); assert.strictEqual(B.loadConfig(w.dp).cancelHours, 0);
  r = H.handle(w.inst, 'תנאי ביטול: 7', NOW); assert.strictEqual(r.ok, false); assert.strictEqual(B.loadConfig(w.dp).cancelHours, 0);
  assert.strictEqual(H.isLine(w.inst, 'תנאי ביטול: 24'), true);
});

test('owner confirm: one send list row with the terms and the client\'s own link; no phone, no row', () => {
  const w = world(24);
  const r = H.handle(w.inst, 'אישור תור לקוחה: ' + w.far.id, NOW);
  assert.strictEqual(r.ok, true); assert.match(r.reply, /^אישרתי: התור של הדס לוי ב/); assert.match(r.reply, /📤 הודעות לשליחה/);
  const lists = SL.all(w.dp); assert.strictEqual(lists.length, 1); assert.match(lists[0].id, /-bkok$/); assert.strictEqual(SL.validate(lists[0]).length, 0);
  const it = lists[0].items[0]; assert.strictEqual(it.phone, '972527654321'); assert.strictEqual(it.name, 'הדס לוי');
  assert.strictEqual(it.text, 'היי הדס, התור שלך לעיצוב גבות ביום שלישי 24.11 בשעה 10:00 אצל הקליניקה של מור מאושר. ביטול או שינוי עד 24 שעות לפני התור, כאן: https://form.it-solution.co.il/b/a/' + w.link + '.' + w.far.tok + '. אחרי זה רק דרך הוואטסאפ.');
  assert.strictEqual(SL.forPage(w.dp, NOW)[0].items[0].link.startsWith('https://wa.me/972527654321?text='), true);
  // a second tap on an already confirmed booking writes nothing more
  H.handle(w.inst, 'אישור תור לקוחה: ' + w.far.id, NOW); assert.strictEqual(SL.all(w.dp).length, 1);
  // no limit wording, and no link when there is none
  B.saveConfig(w.dp, Object.assign(B.loadConfig(w.dp), { cancelHours: 0 }));
  assert.strictEqual(L.confirmText(w.far, 'הקליניקה של מור', B.loadConfig(w.dp), 'https://x.test'), 'היי הדס, התור שלך לעיצוב גבות ביום שלישי 24.11 בשעה 10:00 אצל הקליניקה של מור מאושר. אפשר לבטל או לשנות בכל זמן, כאן: https://x.test/b/a/' + w.link + '.' + w.far.tok + '.');
  assert.strictEqual(L.confirmText(w.far, 'מור', { cancelHours: 12, linkToken: '' }, 'https://x.test'), 'היי הדס, התור שלך לעיצוב גבות ביום שלישי 24.11 בשעה 10:00 אצל מור מאושר. ביטול או שינוי עד 12 שעות לפני התור, דרך הוואטסאפ.');
  // a booking without a valid mobile phone is only confirmed
  const w2 = world(24); const nop = B.add(w2.dp, { start: '2026-11-25 10:00', serviceId: 'brows', name: 'בלי טלפון', phone: '', src: 'owner' }, NOW).booking;
  const r2 = H.handle(w2.inst, 'אישור תור לקוחה: ' + nop.id, NOW); assert.strictEqual(r2.ok, true); assert.doesNotMatch(r2.reply, /הודעות לשליחה/); assert.strictEqual(SL.all(w2.dp).length, 0);
});

test('the pages: the terms on the booking page, the confirmation and the client page; late text and the owner button; late is a 409', () => {
  const src = BP.clientJs.toString();
  for (const part of ['ביטול או שינוי: עד ', 'אפשר לבטל או לשנות בכל זמן', 'בקישור שיישלח אלייך.', 'כבר פחות מ ', 'לביטול או שינוי צריך לפנות לבעלת העסק.', 'https://wa.me/', "j.error === 'late'"]) assert.ok(src.includes(part), part);
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'lib', 'book-page.js'), 'utf8').includes("e === 'late' ? 409"));
  assert.doesNotMatch(src.match(/function termsLine[\s\S]*?\n  }/)[0], / - /);
});
