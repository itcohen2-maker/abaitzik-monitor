'use strict';
// 22.11.2026: lib/bookings-remind.js, the daily reminders (a send list, never a message) and the diary's housekeeping.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../lib/bookings-remind.js');
const B = require('../lib/bookings.js');
const SL = require('../lib/sendlist.js');

const SUN = '2026-11-22'; // the day of the clock below
const at = (hhmm, day) => Date.parse((day || SUN) + 'T' + hhmm + ':00+02:00');
function world(over) {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-test-r-'));
  B.saveConfig(dp, { hours: { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [], 6: [] },
    services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }, { id: 'face', name: 'טיפול פנים', minutes: 60, price: 320 }], slotMinutes: 15, bufferMinutes: 0 });
  const tok = B.ensureLinkToken(dp);
  const inst = Object.assign({ dataPath: dp, gender: 'f', biz: { name: 'הקליניקה של מור' } }, over);
  const calls = { push: [], owner: [] };
  const hooks = { push: (t, b) => calls.push.push([t, b]), owner: (x, wa) => calls.owner.push([x, wa]) };
  const add = (start, name, phone, svc) => B.add(dp, { start, serviceId: svc || 'brows', name, phone }, at('08:00')).booking;
  return { dp, inst, tok, calls, hooks, add };
}

test('at the hour: one send list for tomorrow, a prepared message per booking, the owner told once', () => {
  const w = world();
  const a = w.add('2026-11-23 10:00', 'דנה פרץ', '0501234567'), b = w.add('2026-11-23 11:00', 'הדס לוי', '0529876543', 'face');
  w.add('2026-11-24 10:00', 'מיכל רון', '0541112233'); // the day after: not yet
  w.add('2026-11-22 15:00', 'נועה ברק', '0501112222'); // today: not tomorrow
  const early = R.tick(w.inst, at('17:59'), w.hooks);
  assert.strictEqual(early.reminded, 0); assert.strictEqual(SL.all(w.dp).length, 0); assert.strictEqual(w.calls.push.length, 0);
  const r = R.tick(w.inst, at('18:00'), w.hooks);
  assert.strictEqual(r.reminded, 2); assert.strictEqual(r.rebuild, true); assert.strictEqual(r.listId, '20261123-bkremind');
  const lists = SL.all(w.dp); assert.strictEqual(lists.length, 1);
  assert.strictEqual(lists[0].title, 'תזכורות לתורים של מחר'); assert.strictEqual(lists[0].items.length, 2);
  assert.strictEqual(SL.validate(lists[0]).length, 0);
  assert.deepStrictEqual(lists[0].items.map((x) => x.name), ['דנה פרץ', 'הדס לוי']);
  assert.strictEqual(lists[0].items[0].phone, '972501234567');
  assert.strictEqual(lists[0].items[0].text, 'היי דנה, מזכירה שיש לך מחר ב 10:00 עיצוב גבות אצל הקליניקה של מור. לאישור או לשינוי: https://form.it-solution.co.il/b/a/' + w.tok + '.' + a.tok);
  assert.match(lists[0].items[1].text, /^היי הדס, מזכירה שיש לך מחר ב 11:00 טיפול פנים אצל הקליניקה של מור\. לאישור או לשינוי: .*\.[a-f0-9]{24}$/);
  assert.ok(lists[0].items[1].text.endsWith('.' + b.tok));
  assert.strictEqual(SL.forPage(w.dp, at('18:00'))[0].items.every((x) => x.link.startsWith('https://wa.me/972') && !x.bad), true); // each is a tap on her own WhatsApp
  const WT = 'מחר 2 תורים. הפירוט והתזכורות ללקוחות מחכים במוניטור.';
  assert.deepStrictEqual(w.calls.push, [['📅 מחר 2 תורים', WT]]);
  assert.deepStrictEqual(w.calls.owner, [['מחר 2 תורים:' + String.fromCharCode(10) + '10:00 דנה, עיצוב גבות' + String.fromCharCode(10) + '11:00 הדס, טיפול פנים' + String.fromCharCode(10) + 'התזכורות ללקוחות (2) מחכות ב 📤 הודעות לשליחה, לחיצה על כל אחת והיא נשלחת.', WT]]);
  assert.doesNotMatch(WT + w.calls.push[0][0] + w.calls.push[0][1], /דנה|הדס|פרץ|לוי|10:00|11:00/); // nothing that crosses the platform names a client
  assert.ok(B.byToken(w.dp, a.tok).remindedAt && B.byToken(w.dp, b.tok).remindedAt);
});

test('idempotent: a second run builds nothing, a booking added later joins the same list', () => {
  const w = world();
  w.add('2026-11-23 10:00', 'דנה פרץ', '0501234567');
  R.tick(w.inst, at('18:00'), w.hooks);
  const again = R.tick(w.inst, at('18:01'), w.hooks);
  assert.strictEqual(again.reminded, 0); assert.strictEqual(again.rebuild, false); assert.strictEqual(w.calls.push.length, 1); assert.strictEqual(SL.all(w.dp)[0].items.length, 1);
  w.add('2026-11-23 12:00', 'הדס לוי', '0529876543'); // booked at 19:00 for tomorrow
  const late = R.tick(w.inst, at('19:00'), w.hooks);
  assert.strictEqual(late.reminded, 1); assert.strictEqual(SL.all(w.dp).length, 1); assert.strictEqual(SL.all(w.dp)[0].items.length, 2);
  assert.deepStrictEqual(w.calls.push[1], ['📅 נוסף תור למחר', 'נוסף תור למחר. הפירוט והתזכורת מחכים במוניטור.']); assert.match(w.calls.owner[1][0], /^נוסף למחר: 12:00 הדס, עיצוב גבות. התזכורת מוכנה ב 📤 הודעות לשליחה.$/); assert.doesNotMatch(w.calls.owner[1][1], /הדס/);
  assert.strictEqual(R.tick(w.inst, at('19:05'), w.hooks).reminded, 0);
});

test('who is skipped: confirmed, cancelled, no phone, past, other days; nothing at all when there is nothing', () => {
  const w = world();
  const none = R.tick(w.inst, at('18:30'), w.hooks);
  assert.strictEqual(none.reminded, 0); assert.strictEqual(SL.all(w.dp).length, 0); assert.strictEqual(w.calls.push.length, 0);
  const c = w.add('2026-11-23 09:00', 'מאושרת', '0501110001'); B.setStatus(w.dp, c.id, 'confirmed', at('08:00'));
  const x = w.add('2026-11-23 09:30', 'מבוטלת', '0501110002'); B.cancel(w.dp, x.id, at('08:00'));
  w.add('2026-11-23 10:00', 'בלי טלפון', '');
  w.add('2026-11-23 10:30', 'הדס לוי', '0501110003');
  const r = R.tick(w.inst, at('18:30'), w.hooks);
  assert.strictEqual(r.reminded, 1); assert.deepStrictEqual(SL.all(w.dp)[0].items.map((i) => i.name), ['הדס לוי']);
  // a clock after midnight: "tomorrow" is counted from now, so yesterday's list is never rebuilt
  const night = R.tick(w.inst, at('00:30', '2026-11-23'), w.hooks);
  assert.strictEqual(night.reminded, 0);
});

test('the owner voice follows the instance gender, the link is left out until there is one', () => {
  const f = world({ gender: 'f' }), m = world({ gender: '' });
  f.add('2026-11-23 10:00', 'דנה פרץ', '0501234567'); m.add('2026-11-23 10:00', 'דנה פרץ', '0501234567');
  R.tick(f.inst, at('18:00'), f.hooks); R.tick(m.inst, at('18:00'), m.hooks);
  assert.match(SL.all(f.dp)[0].items[0].text, /מזכירה/); assert.match(SL.all(m.dp)[0].items[0].text, /מזכיר שיש/); assert.doesNotMatch(SL.all(m.dp)[0].items[0].text, /מזכירה/);
  const n = world(); const c = B.loadConfig(n.dp); c.linkToken = ''; B.saveConfig(n.dp, c);
  n.add('2026-11-23 10:00', 'דנה פרץ', '0501234567');
  R.tick(n.inst, at('18:00'), n.hooks);
  assert.match(SL.all(n.dp)[0].items[0].text, /לשינוי או ביטול, כתבו לי\.$/); assert.doesNotMatch(SL.all(n.dp)[0].items[0].text, /form\.it/);
});

test('remindAt is the hour in the config, in Israel time', () => {
  const w = world();
  const c = B.loadConfig(w.dp); c.remindAt = '20:15'; B.saveConfig(w.dp, c);
  w.add('2026-11-23 10:00', 'דנה פרץ', '0501234567');
  assert.strictEqual(R.tick(w.inst, at('20:14'), w.hooks).reminded, 0);
  assert.strictEqual(R.tick(w.inst, at('20:15'), w.hooks).reminded, 1);
  // summer time: 18:00 in Israel is 15:00 UTC, not 16:00
  const s = world(); assert.ok(B.add(s.dp, { start: '2026-07-16 10:00', serviceId: 'brows', name: 'דנה פרץ', phone: '0501234567' }, Date.parse('2026-07-10T00:00:00Z')).ok);
  assert.strictEqual(R.tick(s.inst, Date.parse('2026-07-15T14:59:00Z'), s.hooks).reminded, 0);
  assert.strictEqual(R.tick(s.inst, Date.parse('2026-07-15T15:00:00Z'), s.hooks).reminded, 1);
});

test('housekeeping: ended bookings become done, a public booking asks for a rebuild once', () => {
  const w = world();
  const a = w.add('2026-11-22 09:00', 'דנה פרץ', '0501234567'), b = w.add('2026-11-22 10:00', 'הדס לוי', '0529876543');
  B.setStatus(w.dp, b.id, 'noshow', at('08:00'));
  const r = R.tick(w.inst, at('09:30'), w.hooks);
  assert.strictEqual(r.done, 1); assert.strictEqual(B.byToken(w.dp, a.tok).status, 'done'); assert.strictEqual(B.byToken(w.dp, b.tok).status, 'noshow'); assert.strictEqual(r.rebuild, false);
  fs.writeFileSync(path.join(w.dp, 'bookings', 'dirty'), 'x');
  const d = R.tick(w.inst, at('09:31'), w.hooks);
  assert.strictEqual(d.dirty, true); assert.strictEqual(d.rebuild, true); assert.ok(!fs.existsSync(path.join(w.dp, 'bookings', 'dirty')));
  assert.strictEqual(R.tick(w.inst, at('09:32'), w.hooks).rebuild, false);
  // a monitor that never had bookings is left alone
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-test-r-'));
  assert.deepStrictEqual(R.tick({ dataPath: empty }, at('18:00'), w.hooks), { done: 0, dirty: false, reminded: 0, listId: '', rebuild: false });
});

test('the evening summary: once a day, even when nobody needs a reminder, names only in her own chat, never in what crosses the platform', () => {
  const w = world();
  const c = w.add('2026-11-23 09:00', 'מאושרת אחת', '0501110001'); B.setStatus(w.dp, c.id, 'confirmed', at('08:00')); // confirmed: no reminder to send
  w.add('2026-11-23 10:00', 'בלי טלפון', ''); // booked, no phone: no reminder to send either
  w.add('2026-11-24 10:00', 'יום אחר', '0501110002'); // not tomorrow
  assert.strictEqual(R.tick(w.inst, at('17:59'), w.hooks).summary, '');
  const r = R.tick(w.inst, at('18:00'), w.hooks);
  assert.strictEqual(r.summary, 'summary'); assert.strictEqual(r.reminded, 0);
  assert.strictEqual(w.calls.owner.length, 1);
  assert.strictEqual(w.calls.owner[0][0], 'מחר 2 תורים:' + String.fromCharCode(10) + '09:00 מאושרת, עיצוב גבות' + String.fromCharCode(10) + '10:00 בלי, עיצוב גבות');
  assert.strictEqual(w.calls.owner[0][1], 'מחר 2 תורים. הפירוט והתזכורות ללקוחות מחכים במוניטור.');
  for (const [text, wa] of w.calls.owner) { assert.match(text, /מאושרת/); assert.doesNotMatch(wa, /מאושרת|בלי|09:00|10:00/); }
  for (const [t, b] of w.calls.push) assert.doesNotMatch(t + b, /מאושרת|בלי|09:00|10:00/);
  // once: the same day again says nothing; the next evening says it again
  assert.strictEqual(R.tick(w.inst, at('18:01'), w.hooks).summary, ''); assert.strictEqual(w.calls.owner.length, 1);
  w.add('2026-11-24 11:00', 'יום אחר שניה', '0501110003');
  assert.strictEqual(R.tick(w.inst, at('18:00', '2026-11-23'), w.hooks).summary, 'summary'); assert.strictEqual(w.calls.owner.length, 2);
  // nothing tomorrow: no message
  const e = world(); e.add('2026-11-25 10:00', 'רחוקה', '0501110004');
  assert.strictEqual(R.tick(e.inst, at('18:00'), e.hooks).summary, ''); assert.strictEqual(e.calls.owner.length, 0);
});

test('a client with a long name or a surname that is a number never leaks past the first name', () => {
  const w = world();
  w.add('2026-11-23 10:00', 'דנה בן דוד הכהן', '0501234567');
  R.tick(w.inst, at('18:00'), w.hooks);
  assert.match(w.calls.owner[0][0], /10:00 דנה, עיצוב גבות/); assert.doesNotMatch(w.calls.owner[0][0], /בן|דוד|הכהן/);
});
