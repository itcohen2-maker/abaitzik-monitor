'use strict';
// 21.11.2026: lib/bookings.js, the appointments store of a service provider.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('../lib/bookings.js');
const bh = require('../lib/biz-home.js');

const NOW = Date.parse('2026-11-20T08:00:00+02:00'); // Friday morning
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'bk-test-')); }
function fresh() {
  const dp = tmp();
  B.saveConfig(dp, {
    hours: { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [['09:00', '13:00']], 6: [] },
    services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }, { id: 'face', name: 'טיפול פנים', minutes: 60, price: 320 }],
    slotMinutes: 15, bufferMinutes: 0,
  });
  return dp;
}
const book = (dp, start, extra) => B.add(dp, Object.assign({ start, serviceId: 'face', name: 'הדס לוי', phone: '050-123-4567' }, extra), NOW);

test('config: defaults, sanitising and a round trip', () => {
  const dp = tmp();
  const d = B.loadConfig(dp);
  assert.equal(d.slotMinutes, 15); assert.deepEqual(d.hours[6], []); assert.deepEqual(d.services, []);
  const c = B.saveConfig(dp, { hours: { 0: [['09:00', '08:00'], ['10:00', '12:00'], ['x', 'y']] }, services: [{ name: 'א', minutes: 1 }, { name: 'ב', minutes: 30, price: 50 }], slotMinutes: 3 });
  assert.deepEqual(c.hours[0], [['10:00', '12:00']]);
  assert.equal(c.services.length, 1); assert.equal(c.services[0].name, 'ב'); assert.ok(c.services[0].id);
  assert.equal(c.slotMinutes, 15);
  assert.deepEqual(B.loadConfig(dp), c);
  assert.deepEqual(fs.readdirSync(path.join(dp, 'bookings')), ['config.json']); // no temp file left
});

test('add: stored with the Israel offset, phone normalised, client created', () => {
  const dp = fresh();
  const r = book(dp, '2026-11-22 10:00', { note: 'עור רגיש' });
  assert.equal(r.ok, true);
  const b = r.booking;
  assert.match(b.id, /^[0-9a-f]{12}$/);
  assert.equal(b.start, '2026-11-22T10:00:00+02:00'); assert.equal(b.end, '2026-11-22T11:00:00+02:00');
  assert.equal(b.phone, '972501234567'); assert.equal(b.status, 'booked'); assert.equal(b.src, 'owner'); assert.equal(b.service, 'טיפול פנים');
  const cl = bh.readList(dp, 'client');
  assert.equal(cl.length, 1); assert.equal(cl[0].phone, '972501234567'); assert.equal(cl[0].id, b.clientId);
  // the same woman again, by phone in another spelling: no second client
  const r2 = B.add(dp, { start: '2026-11-23 10:00', serviceId: 'brows', name: 'הדס', phone: '+972 50 123 4567' }, NOW);
  assert.equal(r2.booking.clientId, b.clientId); assert.equal(bh.readList(dp, 'client').length, 1);
  assert.equal(B.list(dp, { from: '2026-11-22', to: '2026-11-23' }).length, 2);
});

test('phone normalising', () => {
  assert.equal(B.normPhone('050-123 4567'), '972501234567');
  assert.equal(B.normPhone('+972501234567'), '972501234567');
  assert.equal(B.normPhone('00972501234567'), '972501234567');
  assert.equal(B.normPhone('501234567'), '972501234567');
  assert.equal(B.normPhone(''), '');
});

test('client matching: exact name without a phone, a known client learns a phone, no name no phone no client', () => {
  const dp = fresh();
  bh.writeList(dp, 'client', [{ id: 'c-dana', name: 'דנה פרץ', biz: '', emails: [], domains: [], aliases: [], status: 'קבועה', terms: '', note: '' }]);
  const a = B.add(dp, { start: '2026-11-22 09:00', serviceId: 'brows', name: 'דנה פרץ' }, NOW);
  assert.equal(a.booking.clientId, 'c-dana');
  const b = B.add(dp, { start: '2026-11-22 09:30', serviceId: 'brows', name: 'דנה פרץ', phone: '0521112233' }, NOW);
  assert.equal(b.booking.clientId, 'c-dana');
  assert.equal(bh.readList(dp, 'client')[0].phone, '972521112233');
  const c = B.add(dp, { start: '2026-11-22 10:00', serviceId: 'brows', name: 'חדשה בלי טלפון' }, NOW);
  assert.equal(c.ok, true); assert.equal(c.booking.clientId, ''); assert.equal(bh.readList(dp, 'client').length, 1);
});

test('conflicts: overlap refused with who is in the way, touching is fine', () => {
  const dp = fresh();
  const a = book(dp, '2026-11-22 10:00');
  const r = B.add(dp, { start: '2026-11-22 10:30', serviceId: 'brows', name: 'מיכל רון' }, NOW);
  assert.equal(r.ok, false); assert.equal(r.error, 'conflict'); assert.equal(r.with[0].id, a.booking.id);
  assert.equal(B.add(dp, { start: '2026-11-22 11:00', serviceId: 'brows', name: 'מיכל רון' }, NOW).ok, true); // starts when the first ends
  assert.equal(B.add(dp, { start: '2026-11-22 09:40', serviceId: 'brows', name: 'נועה ברק' }, NOW).ok, true); // ends when the first starts
  assert.equal(B.conflicts(dp, '2026-11-22 10:15', '2026-11-22 10:45').length, 1);
  assert.equal(B.conflicts(dp, '2026-11-22 10:15', '2026-11-22 10:45', a.booking.id).length, 0);
});

test('buffer: a gap is kept between bookings', () => {
  const dp = fresh();
  const c = B.loadConfig(dp); c.bufferMinutes = 15; B.saveConfig(dp, c);
  book(dp, '2026-11-22 10:00'); // until 11:00
  assert.equal(B.add(dp, { start: '2026-11-22 11:00', serviceId: 'brows', name: 'א' }, NOW).error, 'conflict');
  assert.equal(B.add(dp, { start: '2026-11-22 11:15', serviceId: 'brows', name: 'א' }, NOW).ok, true);
  assert.equal(B.add(dp, { start: '2026-11-22 09:30', serviceId: 'brows', name: 'ב' }, NOW).error, 'conflict'); // ends 09:50, needs 09:45
  assert.equal(B.add(dp, { start: '2026-11-22 09:20', serviceId: 'brows', name: 'ב' }, NOW).ok, true);
});

test('closed day, outside hours, the past, and bad input never throw', () => {
  const dp = fresh();
  assert.equal(B.add(dp, { start: '2026-11-21 10:00', serviceId: 'brows', name: 'א' }, NOW).error, 'closed'); // Saturday
  assert.equal(B.add(dp, { start: '2026-11-22 08:00', serviceId: 'brows', name: 'א' }, NOW).error, 'closed');
  assert.equal(B.add(dp, { start: '2026-11-22 16:50', serviceId: 'brows', name: 'א' }, NOW).error, 'closed'); // runs past 17:00
  assert.equal(B.add(dp, { start: '2026-11-20 07:00', serviceId: 'brows', name: 'א' }, NOW).error, 'past');
  for (const bad of [null, {}, { start: 'tomorrow' }, { start: '2026-11-22 10:00' }, { start: '2026-11-22 10:00', serviceId: 'nope', name: 'א' }, { start: '2026-11-22 10:00', serviceId: 'brows', name: '  ' }]) {
    const r = B.add(dp, bad, NOW); assert.equal(r.ok, false); assert.equal(r.error, 'bad'); assert.ok(Array.isArray(r.with));
  }
  assert.equal(B.move(dp, 'nope', '2026-11-22 10:00', NOW).error, 'bad');
  assert.equal(B.move(dp, '../../x', '2026-11-22 10:00', NOW).error, 'bad');
  assert.equal(B.list(dp, {}).length, 0);
});

test('a one off service by name and minutes', () => {
  const dp = fresh();
  const r = B.add(dp, { start: '2026-11-22 12:00', service: 'שעווה', minutes: 25, name: 'א' }, NOW);
  assert.equal(r.ok, true); assert.equal(r.booking.end, '2026-11-22T12:25:00+02:00'); assert.equal(r.booking.serviceId, '');
  const r2 = B.add(dp, { start: '2026-11-22 13:00', service: 'עיצוב גבות', name: 'ב' }, NOW); // a known name takes its minutes
  assert.equal(r2.booking.end, '2026-11-22T13:20:00+02:00'); assert.equal(r2.booking.serviceId, 'brows');
});

test('free slots: hours, existing bookings, never the past', () => {
  const dp = fresh();
  const all = B.freeSlots(dp, '2026-11-22', 'face', NOW);
  assert.equal(all[0].time, '09:00'); assert.equal(all[all.length - 1].time, '16:00'); assert.equal(all.length, 29); // 09:00..16:00 every 15 minutes
  book(dp, '2026-11-22 10:00'); // 10:00 to 11:00
  const t = B.freeSlots(dp, '2026-11-22', 'face', NOW).map((s) => s.time);
  assert.ok(t.includes('09:00')); assert.ok(!t.includes('09:15')); assert.ok(!t.includes('10:45')); assert.ok(t.includes('11:00'));
  assert.deepEqual(B.freeSlots(dp, '2026-11-21', 'face', NOW), []); // Saturday is closed
  const late = Date.parse('2026-11-22T13:10:00+02:00');
  assert.equal(B.freeSlots(dp, '2026-11-22', 'brows', late)[0].time, '13:15'); // the past is never offered
  assert.equal(B.freeSlots(dp, '2026-11-22', 20, NOW)[0].time, '09:00'); // a number is minutes
  assert.deepEqual(B.freeSlots(dp, 'garbage', 'face', NOW), []);
});

test('free slots across the DST change: spring (Friday 27.3.2026) and autumn (Sunday 25.10.2026)', () => {
  const dp = fresh();
  const cfg = B.loadConfig(dp); cfg.hours[6] = [['09:00', '12:00']]; B.saveConfig(dp, cfg);
  const early = Date.parse('2026-03-01T00:00:00Z');
  const first = (day) => B.freeSlots(dp, day, 'brows', early)[0];
  assert.equal(first('2026-03-26').start, '2026-03-26T09:00:00+02:00'); // Thursday, winter time
  assert.equal(first('2026-03-27').start, '2026-03-27T09:00:00+03:00'); // Friday, the clock went forward at 02:00
  assert.equal(first('2026-03-27').time, '09:00');
  const late = Date.parse('2026-10-01T00:00:00Z');
  const firstL = (day) => B.freeSlots(dp, day, 'brows', late)[0];
  assert.equal(firstL('2026-10-24').start, '2026-10-24T09:00:00+03:00'); // Saturday, still summer
  assert.equal(firstL('2026-10-25').start, '2026-10-25T09:00:00+02:00'); // Sunday, the clock went back at 02:00
  assert.equal(firstL('2026-10-26').start, '2026-10-26T09:00:00+02:00');
  // a booking made on the first day of summer time keeps its offset, and blocks its own slot
  const r = B.add(dp, { start: '2026-03-27 09:00', serviceId: 'brows', name: 'א' }, early);
  assert.equal(r.booking.start, '2026-03-27T09:00:00+03:00');
  assert.ok(!B.freeSlots(dp, '2026-03-27', 'brows', early).some((s) => s.time === '09:00'));
  // the night of the spring change: 02:00 to 03:00 does not exist, no slot is offered inside it
  const night = B.loadConfig(dp); night.hours[5] = [['00:00', '05:00']]; night.slotMinutes = 60; B.saveConfig(dp, night);
  assert.deepEqual(B.freeSlots(dp, '2026-03-27', 60, early).map((s) => s.time), ['00:00', '01:00', '03:00', '04:00']);
  // and the offset helper is real, not a constant
  const c = B.core();
  assert.equal(c.offsetMin(Date.parse('2026-01-15T12:00:00Z')), 120); assert.equal(c.offsetMin(Date.parse('2026-07-15T12:00:00Z')), 180);
});

test('move: same length, checked like a new booking, the old slot is freed', () => {
  const dp = fresh();
  const a = book(dp, '2026-11-22 10:00').booking, b = book(dp, '2026-11-22 12:00', { name: 'מיכל רון', phone: '0529990000' }).booking;
  const bad = B.move(dp, a.id, '2026-11-22 11:30', NOW); // runs into 12:00
  assert.equal(bad.error, 'conflict'); assert.equal(bad.with[0].id, b.id);
  assert.equal(B.move(dp, a.id, '2026-11-21 10:00', NOW).error, 'closed');
  assert.equal(B.move(dp, a.id, '2026-11-19 10:00', NOW).error, 'past');
  assert.equal(B.move(dp, a.id, '2026-11-22 10:30', NOW).ok, true); // overlapping its own old time is fine
  const m = B.move(dp, a.id, '2026-11-23 09:00', NOW).booking;
  assert.equal(m.start, '2026-11-23T09:00:00+02:00'); assert.equal(m.end, '2026-11-23T10:00:00+02:00'); assert.equal(m.status, 'booked');
  assert.ok(B.freeSlots(dp, '2026-11-22', 'face', NOW).some((s) => s.time === '10:00'));
});

test('cancel frees the slot, is repeatable, and a cancelled one is hidden unless asked', () => {
  const dp = fresh();
  const a = book(dp, '2026-11-22 10:00').booking;
  assert.equal(B.add(dp, { start: '2026-11-22 10:00', serviceId: 'brows', name: 'ב' }, NOW).error, 'conflict');
  assert.equal(B.cancel(dp, a.id, NOW).booking.status, 'cancelled');
  assert.equal(B.cancel(dp, a.id, NOW).ok, true);
  assert.equal(B.add(dp, { start: '2026-11-22 10:00', serviceId: 'brows', name: 'ב' }, NOW).ok, true);
  assert.equal(B.list(dp, { from: '2026-11-22', to: '2026-11-22' }).length, 1);
  assert.equal(B.list(dp, { from: '2026-11-22', to: '2026-11-22', includeCancelled: true }).length, 2);
  assert.equal(B.move(dp, a.id, '2026-11-23 10:00', NOW).error, 'bad'); // a cancelled one is not moved
  assert.equal(B.setStatus(dp, a.id, 'booked', NOW).error, 'conflict'); // its slot was taken meanwhile
  assert.equal(B.setStatus(dp, a.id, 'nonsense', NOW).error, 'bad');
});

test('syncEvents: bookings in events.json, foreign events untouched, cancelled removed, repeatable', () => {
  const dp = fresh();
  bh.writeList(dp, 'event', [{ id: 'g1', start: '2026-11-22T20:00:00+02:00', end: '2026-11-22T21:00:00+02:00', title: 'ארוחת ערב', where: 'בית', attendees: ['x@y.z'], clientId: '' }]);
  const a = book(dp, '2026-11-22 10:00').booking, b = book(dp, '2026-11-22 12:00', { name: 'מיכל רון', phone: '' }).booking;
  B.syncEvents(dp); B.syncEvents(dp);
  let ev = bh.readList(dp, 'event');
  assert.equal(ev.length, 3); assert.equal(ev[0].id, 'g1'); assert.equal(ev[0].title, 'ארוחת ערב');
  const mine = ev.filter((e) => e.src === 'booking');
  assert.equal(mine[0].title, 'טיפול פנים: הדס לוי'); assert.equal(mine[0].clientId, a.clientId); assert.equal(mine[0].start, a.start);
  B.cancel(dp, b.id, NOW); B.syncEvents(dp);
  ev = bh.readList(dp, 'event');
  assert.equal(ev.length, 2); assert.ok(!ev.some((e) => e.bookingId === b.id));
  // the clients screen sees the next visit from these events
  const cv = bh.clientView(bh.readList(dp, 'client'), [], ev, NOW);
  assert.equal(cv[0].next.at, a.start);
});

test('lastVisits and lapsed', () => {
  const dp = fresh();
  const c = B.loadConfig(dp); c.hours[6] = [['09:00', '17:00']]; c.hours[5] = [['09:00', '17:00']]; B.saveConfig(dp, c);
  const past = (days, name, phone, status) => {
    const d = new Date(NOW - days * 864e5).toISOString().slice(0, 10);
    const r = B.add(dp, { start: d + ' 11:00', serviceId: 'face', name, phone }, NOW - (days + 2) * 864e5);
    assert.equal(r.ok, true, name + ' ' + JSON.stringify(r)); if (status) B.setStatus(dp, r.booking.id, status, NOW); return r.booking;
  };
  const sh = past(63, 'שירן אוחיון', '0501110001'); past(100, 'שירן אוחיון', '0501110001');
  past(57, 'נועה ברק', '0501110002');
  past(70, 'יעל שגיא', '0501110003', 'done');
  past(20, 'מיכל רון', '0501110004');
  past(90, 'הדס לוי', '0501110005');
  B.add(dp, { start: '2026-11-23 10:00', serviceId: 'face', name: 'הדס לוי', phone: '0501110005' }, NOW); // a future one
  past(80, 'דנה פרץ', '0501110006', 'noshow'); // never came
  past(30, 'ביטלה', '0501110007', 'cancelled');
  const lv = B.lastVisits(dp, NOW);
  assert.equal(lv[sh.clientId], new Date(NOW - 63 * 864e5).toISOString().slice(0, 10));
  assert.equal(lv[B.lapsed(dp, 8, NOW).find((x) => x.name === 'יעל שגיא').clientId], new Date(NOW - 70 * 864e5).toISOString().slice(0, 10));
  const names = B.lapsed(dp, 8, NOW).map((x) => x.name);
  assert.deepEqual(names, ['יעל שגיא', 'שירן אוחיון', 'נועה ברק']); // oldest first; no future booking, last visit over 8 weeks
  assert.ok(!names.includes('הדס לוי')); assert.ok(!names.includes('מיכל רון')); assert.ok(!names.includes('דנה פרץ')); assert.ok(!names.includes('ביטלה'));
  assert.equal(B.lapsed(dp, 8, NOW)[0].phone, '972501110003');
  assert.deepEqual(B.lapsed(dp, 12, NOW).map((x) => x.name), []);
  // today's booking that is still ahead counts as no visit yet, a booking already over counts
  assert.equal(B.lastVisits(dp, NOW)[B.list(dp, { from: '2026-11-23', to: '2026-11-23' })[0].clientId], new Date(NOW - 90 * 864e5).toISOString().slice(0, 10));
});

test('requests: the fixed lines read back', () => {
  assert.deepEqual(B.parseRequest('תור לקוחה חדש: 2026-11-22 10:00 | עיצוב גבות | דנה פרץ | 0501234567'), { kind: 'add', start: '2026-11-22 10:00', service: 'עיצוב גבות', name: 'דנה פרץ', phone: '0501234567' });
  assert.deepEqual(B.parseRequest('תור לקוחה חדש: 2026-11-22 10:00 | עיצוב גבות | דנה פרץ | '), { kind: 'add', start: '2026-11-22 10:00', service: 'עיצוב גבות', name: 'דנה פרץ', phone: '' });
  assert.deepEqual(B.parseRequest('הזזת תור לקוחה: ab12cd | 2026-11-23 09:30'), { kind: 'move', id: 'ab12cd', start: '2026-11-23 09:30' });
  assert.deepEqual(B.parseRequest('ביטול תור לקוחה: ab12cd'), { kind: 'cancel', id: 'ab12cd' });
  assert.deepEqual(B.parseRequest('שירות חדש: פילינג | 60 | 380'), { kind: 'service', name: 'פילינג', minutes: 60, price: 380 });
  assert.equal(B.parseRequest('סתם הודעה'), null);
  const line = B.hoursLine({ hours: { 0: [['09:00', '18:00'], ['19:00', '21:00']], 1: [], 2: [], 3: [], 4: [], 5: [['09:00', '13:00']], 6: [] } });
  assert.equal(line, 'ראשון 09:00 עד 18:00, 19:00 עד 21:00 | שני סגור | שלישי סגור | רביעי סגור | חמישי סגור | שישי 09:00 עד 13:00 | שבת סגור');
  assert.deepEqual(B.parseRequest('שעות פעילות: ' + line).hours[0], [['09:00', '18:00'], ['19:00', '21:00']]);
  assert.deepEqual(B.parseRequest('שעות פעילות: ' + line).hours[6], []);
  assert.equal(B.parseRequest('שעות פעילות: ראשון 09:00 עד 18:00'), null); // all seven days or nothing
});

test('files: one per booking, no temp files, ids unique', () => {
  const dp = fresh();
  for (let i = 0; i < 5; i++) assert.equal(B.add(dp, { start: '2026-11-22 ' + String(9 + i).padStart(2, '0') + ':00', serviceId: 'brows', name: 'א' + i }, NOW).ok, true);
  const fl = fs.readdirSync(path.join(dp, 'bookings', 'items'));
  assert.equal(fl.length, 5); assert.ok(fl.every((f) => /^[0-9a-f]{12}\.json$/.test(f)));
  assert.equal(new Set(fl).size, 5);
});

test('requests: marking a no show, and the older and newer words for removing a service', () => {
  assert.deepStrictEqual(B.parseRequest('סימון תור לקוחה: ab12cd | noshow'), { kind: 'mark', id: 'ab12cd', status: 'noshow' });
  assert.strictEqual(B.parseRequest('סימון תור לקוחה: ab12cd | whatever'), null);
  assert.deepStrictEqual(B.parseRequest('מחיקת שירות: פילינג'), { kind: 'unservice', name: 'פילינג' });
  assert.deepStrictEqual(B.parseRequest('הסרת שירות: פילינג'), { kind: 'unservice', name: 'פילינג' });
});

test('requests: the owner adds the client of a booking from the link', () => {
  assert.deepStrictEqual(B.parseRequest('הוספת לקוחה: ab12cd'), { kind: 'client', id: 'ab12cd' });
});
