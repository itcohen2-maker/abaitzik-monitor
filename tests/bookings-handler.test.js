'use strict';
// 22.11.2026: lib/bookings-handler.js, the fixed lines of 📅 התורים שלי applied by the listener with no model.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('../lib/bookings-handler.js');
const B = require('../lib/bookings.js');
const bh = require('../lib/biz-home.js');

const NOW = Date.parse('2026-11-22T06:00:00Z'); // Sunday 08:00 in Israel
const ROOT = path.join(__dirname, '..');
function inst(over) {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-test-h-'));
  B.saveConfig(dp, { hours: { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [['09:00', '13:00']], 6: [] },
    services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }, { id: 'face', name: 'טיפול פנים', minutes: 60, price: 320 }], slotMinutes: 15, bufferMinutes: 0 });
  return Object.assign({ dataPath: dp, trade: 'beauty', gender: 'f', bookings: true }, over);
}
// the way the page sends it: the kind first, the line, a blank line, the code
const wire = (line) => 'תור לקוחה\n' + line + '\n\nקוד';
const run = (i, line) => H.handle(i, wire(line), NOW);

test('add: booked, the diary synced, a short answer in Hebrew', () => {
  const i = inst();
  const r = run(i, 'תור לקוחה חדש: 2026-11-23 10:00 | עיצוב גבות | דנה פרץ | 0501234567');
  assert.strictEqual(r.ok, true); assert.strictEqual(r.changed, true);
  assert.match(r.reply, /^נקבע: עיצוב גבות לדנה פרץ ביום שני 23\.11 בשעה 10:00\.$/);
  const b = B.readItems(i.dataPath);
  assert.strictEqual(b.length, 1); assert.strictEqual(b[0].src, 'owner'); assert.strictEqual(b[0].phone, '972501234567');
  assert.ok(bh.readList(i.dataPath, 'event').some((e) => e.bookingId === b[0].id));
});

test('add refused: the reason and up to three nearest free times, nothing is booked', () => {
  const i = inst();
  run(i, 'תור לקוחה חדש: 2026-11-23 10:00 | עיצוב גבות | דנה פרץ | 0501234567');
  const c = run(i, 'תור לקוחה חדש: 2026-11-23 10:10 | עיצוב גבות | הדס לוי | 0529876543');
  assert.strictEqual(c.ok, false); assert.strictEqual(c.changed, false);
  assert.match(c.reply, /^השעה תפוסה: עיצוב גבות לדנה פרץ ב 10:00\. שעות פנויות קרובות: /);
  const times = c.reply.split('שעות פנויות קרובות: ')[1].replace(/\.$/, '').split(', ');
  assert.strictEqual(times.length, 3); assert.ok(times.every((t) => /^\d{2}:\d{2}$/.test(t)), times.join('|'));
  assert.strictEqual(B.readItems(i.dataPath).length, 1);
  const closed = run(i, 'תור לקוחה חדש: 2026-11-28 10:00 | עיצוב גבות | הדס לוי | 0529876543'); // Saturday
  assert.match(closed.reply, /^השעה הזאת מחוץ לשעות הפעילות, או ביום סגור\. שעות פנויות קרובות: /);
  const past = H.handle(i, wire('תור לקוחה חדש: 2026-11-20 10:00 | עיצוב גבות | הדס לוי | 0529876543'), NOW);
  assert.match(past.reply, /^השעה הזאת כבר עברה\./);
  const svc = run(i, 'תור לקוחה חדש: 2026-11-23 12:00 | ציפורניים | הדס לוי | 0529876543');
  assert.strictEqual(svc.reply, 'לא מצאתי את השירות הזה ברשימה.');
  assert.strictEqual(B.readItems(i.dataPath).length, 1);
});

test('move and cancel: answered, the slot freed, a refusal gives the reason and times', () => {
  const i = inst();
  const a = B.add(i.dataPath, { start: '2026-11-23 10:00', serviceId: 'brows', name: 'דנה פרץ', phone: '0501234567' }, NOW).booking;
  const b = B.add(i.dataPath, { start: '2026-11-23 11:00', serviceId: 'brows', name: 'הדס לוי', phone: '0529876543' }, NOW).booking;
  const bad = run(i, 'הזזת תור לקוחה: ' + a.id + ' | 2026-11-23 11:00');
  assert.strictEqual(bad.ok, false); assert.match(bad.reply, /^השעה תפוסה: עיצוב גבות להדס לוי ב 11:00\. שעות פנויות קרובות: /);
  const ok = run(i, 'הזזת תור לקוחה: ' + a.id + ' | 2026-11-23 12:00');
  assert.match(ok.reply, /^הוזז: התור של דנה פרץ עבר ליום שני 23\.11 בשעה 12:00\.$/); assert.strictEqual(ok.changed, true);
  assert.strictEqual(B.byToken(i.dataPath, a.tok).start, '2026-11-23T12:00:00+02:00');
  const c = run(i, 'ביטול תור לקוחה: ' + b.id);
  assert.match(c.reply, /^בוטל: התור של הדס לוי ביום שני 23\.11 בשעה 11:00\. השעה התפנתה\. הכנתי ללקוחה הודעה על הביטול, והיא מחכה ב 📤 הודעות לשליחה\.$/); // 23.11.2026: the client is told, as a prepared message
  assert.strictEqual(B.freeSlots(i.dataPath, '2026-11-23', 'brows', NOW).some((s) => s.time === '11:00'), true);
  assert.strictEqual(run(i, 'ביטול תור לקוחה: nope').reply, 'התור לא נמצא, אולי כבר בוטל.');
  assert.ok(!bh.readList(i.dataPath, 'event').some((e) => e.bookingId === b.id)); // the diary dropped it
});

test('hours, services and the mark of a no show', () => {
  const i = inst();
  const line = B.hoursLine({ hours: { 0: [['10:00', '19:00']], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } });
  const h = run(i, 'שעות פעילות: ' + line);
  assert.strictEqual(h.reply, 'עדכנתי את שעות הפעילות.'); assert.deepStrictEqual(B.loadConfig(i.dataPath).hours[0], [['10:00', '19:00']]); assert.deepStrictEqual(B.loadConfig(i.dataPath).hours[1], []);
  const s = run(i, 'שירות חדש: פילינג | 60 | 380');
  assert.match(s.reply, /^הוספתי את השירות פילינג: 60 דקות, 380 ₪\.$/); assert.ok(B.loadConfig(i.dataPath).services.some((x) => x.name === 'פילינג' && x.price === 380));
  assert.strictEqual(run(i, 'שירות חדש: ארוך | 900 | 10').ok, false);
  assert.match(run(i, 'מחיקת שירות: פילינג').reply, /^הסרתי את השירות פילינג/); assert.ok(!B.loadConfig(i.dataPath).services.some((x) => x.name === 'פילינג'));
  assert.match(run(i, 'הסרת שירות: טיפול פנים').reply, /^הסרתי/); // the older wording still works
  assert.strictEqual(run(i, 'מחיקת שירות: שלא קיים').ok, false);
  const a = B.add(i.dataPath, { start: '2026-11-22 10:00', serviceId: 'brows', name: 'דנה פרץ', phone: '0501234567' }, NOW).booking;
  const n = run(i, 'סימון תור לקוחה: ' + a.id + ' | noshow');
  assert.match(n.reply, /^סומן: התור של דנה פרץ ביום ראשון 22\.11 בשעה 10:00 כתור שלא הגיעו אליו\.$/); assert.strictEqual(B.byToken(i.dataPath, a.tok).status, 'noshow');
});

test('feminine or masculine by the instance, and a line it cannot read', () => {
  const f = inst({ gender: 'f' }), m = inst({ gender: '' });
  assert.match(run(f, 'שעות פעילות: ראשון 09:00 עד 18:00').reply, /נסי שוב/);
  assert.match(run(m, 'שעות פעילות: ראשון 09:00 עד 18:00').reply, /נסה שוב/);
  assert.doesNotMatch(run(m, 'שעות פעילות: ראשון 09:00 עד 18:00').reply, /נסי/);
});

test('anything else is not its business: it returns null and the message goes on its way', () => {
  const i = inst();
  for (const t of ['מה יש לי היום?', 'תקבעי לדנה עיצוב גבות מחר ב 10', 'תור חדש: 22.11 רופא', '', 'משימה להיום: להתקשר', 'שירות חדשני'])
    assert.strictEqual(H.handle(i, t, NOW), null, t);
  assert.strictEqual(H.handle(Object.assign({}, i, { trade: 'gypsum' }), wire('ביטול תור לקוחה: x'), NOW), null); // a trade without bookings
  assert.strictEqual(H.handle(Object.assign({}, i, { bookings: false }), wire('ביטול תור לקוחה: x'), NOW), null); // the instance did not turn it on
  assert.strictEqual(H.handle({ trade: 'beauty' }, wire('ביטול תור לקוחה: x'), NOW), null);
  assert.strictEqual(H.handle(null, wire('ביטול תור לקוחה: x'), NOW), null);
});

test('normalize: the kind line, a joined kind, the personal code and the word code all come off', () => {
  const L = 'ביטול תור לקוחה: abc';
  assert.strictEqual(H.normalize('תור לקוחה\n' + L + '\n\nקוד'), L);
  assert.strictEqual(H.normalize('תור לקוחה\n' + L + '\n\nקוד 4821'), L);
  assert.strictEqual(H.normalize('תור לקוחה ' + L), L);
  assert.strictEqual(H.normalize(L), L);
  assert.strictEqual(H.normalize('תור לקוחה חדש: 2026-11-23 10:00 | א | ב | ג'), 'תור לקוחה חדש: 2026-11-23 10:00 | א | ב | ג'); // its own first words are not a kind line
});

test('no model in the path: the handler and the store never start a process, and listen.js runs it before the worker is kicked', () => {
  for (const f of ['lib/bookings-handler.js', 'lib/bookings.js', 'lib/bookings-remind.js', 'lib/book-page.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /child_process|execFile|spawn\(|claude|anthropic/i, f);
  }
  const L = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8');
  const at = L.indexOf("require('./lib/bookings-handler.js').isLine(inst, text)");
  assert.ok(at > 0, 'listen.js calls the handler');
  const block = L.slice(L.lastIndexOf('let bkLine = false;', at), L.indexOf('return true;', at) + 12);
  for (const part of ['codeOk && !inst.publicDemo && inst.bookings === true', 'handleAsync(inst, text)', 'publishChat()', "rec.status = 'done'"]) assert.ok(block.includes(part), part);
  assert.doesNotMatch(block, /kickWorker|callClaude|spawn|Atomics/);
  assert.ok(at < L.indexOf('function publishChat'), 'inside recordIncoming, before the chat is handed to a session');
  assert.ok(L.lastIndexOf('function recordIncoming', at) > 0, 'inside recordIncoming');
});

test('worker.js: the prompt lines, the allowed command and the minute tick; wa-bridge: the routes and the generic WhatsApp line', () => {
  const W = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(W, /require\('\.\/lib\/bookings-ui\.js'\)\.enabled\(inst\) \? require\('\.\/lib\/bookings\.js'\)\.promptLines\(\) : \[\]/);
  assert.match(W, /'Bash\(node booking\.js:\*\)'/);
  assert.match(W, /if \(!DRY\) bookingsTick\(\);/);
  const lines = B.promptLines().join('\n');
  assert.match(lines, /node booking\.js add/); assert.match(lines, /קוד יציאה 2/); assert.match(lines, /שלוש שעות פנויות/); assert.match(lines, /לא ממציאים תור/);
  assert.doesNotMatch(lines, /[-‐-―]\s*[֐-׿]|[֐-׿]\s*[-‐-―]\s/); // no dashes between words
  const WB = fs.readFileSync(path.join(ROOT, 'wa-bridge.js'), 'utf8');
  assert.ok(WB.includes("bookRoute(q, u, s)"));
  assert.match(WB, /d\.waText \|\| d\.text/);
  assert.match(WB, /'\/api\/book\/link'/);
});

test('a booking from the public link becomes a client with one tap, and not before', () => {
  const i = inst();
  const a = B.add(i.dataPath, { start: '2026-11-23 10:00', serviceId: 'brows', name: 'דנה פרץ', phone: '0501234567', src: 'link' }, NOW).booking;
  assert.strictEqual(a.clientId, ''); assert.deepStrictEqual(bh.readList(i.dataPath, 'client'), []);
  const r = run(i, 'הוספת לקוחה: ' + a.id);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.reply, 'הוספתי ללקוחות: דנה פרץ.');
  const cl = bh.readList(i.dataPath, 'client'); assert.strictEqual(cl.length, 1); assert.strictEqual(cl[0].phone, '972501234567');
  assert.strictEqual(B.readItems(i.dataPath)[0].clientId, cl[0].id);
  assert.strictEqual(run(i, 'הוספת לקוחה: nope').ok, false);
});
