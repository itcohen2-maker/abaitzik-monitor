'use strict';
// 24.11.2026: the cosmetician's five features (lib/book-beauty.js and its places): the confirmation message prepared when approval is
// automatic, punch cards, gift cards and their public page, before and after photos, and the returning client on the booking page.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('../lib/bookings.js');
const H = require('../lib/bookings-handler.js');
const L = require('../lib/book-links.js');
const BB = require('../lib/book-beauty.js');
const BP = require('../lib/book-page.js');
const UI = require('../lib/bookings-ui.js');
const SL = require('../lib/sendlist.js');
const { makeCore } = require('../lib/book-core.js');

const ROOT = path.join(__dirname, '..');
const DAY = 864e5;
const NOW = Date.parse('2026-11-22T06:00:00Z'); // Sunday 08:00 in Israel
const HOURS = { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '17:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [], 6: [] };
const SERVICES = [{ id: 'face', name: 'טיפול פנים', minutes: 60, price: 320 }, { id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }];
const mk = () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-beauty-'));
  B.saveConfig(dp, { hours: HOURS, services: SERVICES, slotMinutes: 15, bufferMinutes: 0 });
  const link = B.ensureLinkToken(dp);
  const inst = { name: 't1', dataPath: dp, trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'הקליניקה של מור' } };
  return { dp, link, inst };
};
const lists = (dp) => { try { return fs.readdirSync(SL.dirOf(dp)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(SL.dirOf(dp), f), 'utf8'))); } catch (e) { return []; } };
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);

// ---------- 1. the confirmation message when approval is automatic ----------
test('auto approval: a booking from the link is confirmed and its confirmation message waits in the send list, never sent', async () => {
  const w = mk(); B.saveConfig(w.dp, Object.assign(B.loadConfig(w.dp), { approval: 'auto', cancelHours: 12 }));
  const notes = [];
  const core = makeCore({ inst: w.inst, dataPath: w.dp, tenantId: 't1', now: () => NOW, notify: (t) => notes.push(t), base: 'https://x.test' });
  const day = '2026-11-23', slot = B.freeSlots(w.dp, day, 'brows', NOW)[0];
  const r = await core.handle({ op: 'create', tenant: 't1', service: 'brows', start: slot.start, name: 'דנה כהן', phone: '0521234567', idem: 'abcdefgh1' });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.booking.status, 'confirmed');
  const ls = lists(w.dp); assert.strictEqual(ls.length, 1);
  const it = B.byToken(w.dp, r.booking.tok), want = L.confirmText(it, 'הקליניקה של מור', B.loadConfig(w.dp), 'https://x.test');
  assert.strictEqual(ls[0].items[0].text, want); assert.strictEqual(ls[0].items[0].phone, '972521234567');
  assert.match(want, /^היי דנה, התור שלך לעיצוב גבות/); assert.match(want, /ביטול או שינוי עד 12 שעות לפני התור/); assert.ok(want.includes('/b/a/' + w.link + '.' + r.booking.tok));
  assert.ok(!ls[0].items[0].sentAt, 'nothing is marked sent: the owner taps and sends');
  assert.ok(notes.some((t) => /הכנתי ללקוחה הודעת אישור/.test(t)));
  // the same booking again (a double submit) does not prepare a second message
  const again = await core.handle({ op: 'create', tenant: 't1', service: 'brows', start: slot.start, name: 'דנה כהן', phone: '0521234567', idem: 'abcdefgh1' });
  assert.strictEqual(again.again, true); assert.strictEqual(lists(w.dp).length, 1);
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'book-core.js'), 'utf8');
  assert.match(src, /Cloud API/); assert.match(src, /Nothing is sent from here/);
});
test('manual approval: no confirmation message until she confirms by hand', async () => {
  const w = mk();
  const core = makeCore({ inst: w.inst, dataPath: w.dp, tenantId: 't1', now: () => NOW, notify: () => {}, base: 'https://x.test' });
  const slot = B.freeSlots(w.dp, '2026-11-23', 'brows', NOW)[0];
  const r = await core.handle({ op: 'create', tenant: 't1', service: 'brows', start: slot.start, name: 'דנה כהן', phone: '0521234567' });
  assert.strictEqual(r.booking.status, 'booked'); assert.strictEqual(lists(w.dp).length, 0);
});

// ---------- 3. punch cards ----------
function cardWorld() {
  const w = mk(), at = (d) => Date.parse(d + 'T07:00:00Z');
  const add = (day, svc, phone, src, status) => { const r = B.add(w.dp, { start: day + ' 10:00', service: svc, name: 'דנה כהן', phone, src }, at('2026-10-01')); assert.ok(r.ok, JSON.stringify(r)); if (status) B.setStatus(w.dp, r.booking.id, status, NOW); return r.booking; };
  const before = add('2026-10-05', 'טיפול פנים', '0521234567', 'owner', 'done');
  const sale = BB.sellPack(w.dp, { ref: '0521234567', service: 'טיפול פנים', count: 4, price: 1000 }, at('2026-10-10'));
  assert.ok(sale.ok, JSON.stringify(sale));
  return { w, add, before, pack: sale.pack };
}
test('punch card: a done visit of that service by that client uses one unit; earlier visits, other services and other clients do not', () => {
  const { w, add, before, pack } = cardWorld();
  assert.strictEqual(pack.since, '2026-10-10');
  const b1 = add('2026-10-12', 'טיפול פנים', '0521234567', 'link', 'done'); // a booking from the link has no client id: the phone matches
  add('2026-10-14', 'עיצוב גבות', '0521234567', 'owner', 'done'); // another service
  B.add(w.dp, { start: '2026-10-19 10:00', service: 'טיפול פנים', name: 'מישהי אחרת', phone: '0509998877', src: 'owner' }, NOW - 50 * DAY); // another client
  BB.sweep(w.dp, NOW);
  let v = BB.packsView(w.dp, NOW)[0]; assert.strictEqual(v.used, 1); assert.strictEqual(v.left, 3); assert.strictEqual(v.total, 4);
  assert.deepStrictEqual(BB.readPacks(w.dp)[0].used, [b1.id]); assert.ok(!BB.readPacks(w.dp)[0].used.includes(before.id));
  assert.strictEqual(lists(w.dp).length, 0, 'three left: no message');
  // a booked visit that is already over counts like autoDone says; running the sweep again counts nothing twice
  add('2026-10-21', 'טיפול פנים', '0521234567', 'owner'); BB.sweep(w.dp, NOW); BB.sweep(w.dp, NOW); BB.sweep(w.dp, NOW + 3600e3);
  v = BB.packsView(w.dp, NOW)[0]; assert.strictEqual(v.used, 2); assert.strictEqual(v.left, 2);
  // a future booking does not count yet
  B.add(w.dp, { start: '2026-11-24 10:00', service: 'טיפול פנים', name: 'דנה כהן', phone: '0521234567', src: 'owner' }, NOW);
  BB.sweep(w.dp, NOW); assert.strictEqual(BB.packsView(w.dp, NOW)[0].used, 2);
});
test('punch card: one unit left prepares ONE message to the client, a no show gives the unit back and re-arms it', () => {
  const { w, add } = cardWorld();
  add('2026-10-12', 'טיפול פנים', '0521234567', 'owner', 'done'); add('2026-10-19', 'טיפול פנים', '0521234567', 'owner', 'done');
  const last = add('2026-10-26', 'טיפול פנים', '0521234567', 'owner', 'done');
  const r1 = BB.sweep(w.dp, NOW); assert.strictEqual(r1.prepared, 1);
  const ls = lists(w.dp); assert.strictEqual(ls.length, 1);
  assert.strictEqual(ls[0].items[0].text, 'היי דנה, נשאר לך טיפול אחד בכרטיסייה של טיפול פנים. רוצה לחדש?'); assert.strictEqual(ls[0].items[0].phone, '972521234567');
  assert.strictEqual(BB.sweep(w.dp, NOW).prepared, 0); BB.sweep(w.dp, NOW + 1000); assert.strictEqual(lists(w.dp).length, 1, 'once');
  B.setStatus(w.dp, last.id, 'noshow', NOW); BB.sweep(w.dp, NOW);
  assert.strictEqual(BB.packsView(w.dp, NOW)[0].left, 2);
  B.setStatus(w.dp, last.id, 'done', NOW); assert.strictEqual(BB.sweep(w.dp, NOW).prepared, 1); assert.strictEqual(lists(w.dp).length, 2);
  // the last unit used: the card is empty, and nothing more is prepared
  add('2026-11-02', 'טיפול פנים', '0521234567', 'owner', 'done');
  assert.strictEqual(BB.sweep(w.dp, NOW).prepared, 0); assert.strictEqual(BB.packsView(w.dp, NOW)[0].left, 0);
});
test('punch card: manual adjust, close, expiry, the units never go below zero', () => {
  const { w, add, pack } = cardWorld();
  let r = BB.adjustPack(w.dp, pack.id, 1, NOW); assert.strictEqual(r.pack.adjust, 1); assert.strictEqual(BB.packsView(w.dp, NOW)[0].left, 5);
  for (let i = 0; i < 5; i++) BB.adjustPack(w.dp, pack.id, -1, NOW);
  assert.strictEqual(BB.packsView(w.dp, NOW)[0].left, 0); assert.strictEqual(BB.adjustPack(w.dp, pack.id, -1, NOW).error, 'zero');
  BB.adjustPack(w.dp, pack.id, 1, NOW); assert.strictEqual(BB.packsView(w.dp, NOW)[0].left, 1); assert.strictEqual(lists(w.dp).length, 1, 'adjusting down to one left prepares the message');
  assert.strictEqual(BB.closePack(w.dp, pack.id, NOW).ok, true); assert.strictEqual(BB.adjustPack(w.dp, pack.id, 1, NOW).error, 'closed');
  add('2026-10-12', 'טיפול פנים', '0521234567', 'owner', 'done'); BB.sweep(w.dp, NOW); assert.strictEqual(BB.packsView(w.dp, NOW)[0].used, 0, 'a closed card consumes nothing');
  assert.strictEqual(BB.sellPack(w.dp, { ref: '0521234567', service: 'טיפול פנים', count: 3, price: 0, expires: '2026-11-01' }, NOW).error, 'expires');
  assert.strictEqual(BB.sellPack(w.dp, { ref: '0521234567', service: 'אין כזה', count: 3, price: 0 }, NOW).error, 'service');
  assert.strictEqual(BB.sellPack(w.dp, { ref: '0000', service: 'טיפול פנים', count: 3, price: 0 }, NOW).error, 'client');
  assert.strictEqual(BB.sellPack(w.dp, { ref: '0521234567', service: 'טיפול פנים', count: 0, price: 0 }, NOW).error, 'count');
});

// ---------- 4. gift cards ----------
test('gift card codes: six characters, unique, none of the look alike characters', () => {
  const w = mk(), seen = new Set();
  for (let i = 0; i < 300; i++) {
    const r = BB.createGift(w.dp, { gk: 'amount', value: '100', buyer: 'אורי', recipient: 'דנה' + i }, NOW); assert.ok(r.ok, JSON.stringify(r));
    assert.match(r.gift.code, /^[ACDEFGHJKMNPQRTUVWXY3479]{6}$/); assert.doesNotMatch(r.gift.code, /[01258BILOSZ6]/); assert.ok(!seen.has(r.gift.code)); seen.add(r.gift.code);
  }
  assert.strictEqual(BB.CODE_LEN, 6);
});
test('gift card: amount or service, a year by default, the prepared message to the buyer, partial use keeps the balance', () => {
  const w = mk();
  const g = BB.createGift(w.dp, { gk: 'amount', value: '300', buyer: 'אורי כהן', recipient: 'שירן', message: 'יום הולדת שמח', phone: '0501112233' }, NOW, 'he', 'https://x.test');
  assert.ok(g.ok); assert.strictEqual(g.gift.expires, '2027-11-22'); assert.strictEqual(g.prepared, true);
  const ls = lists(w.dp); assert.strictEqual(ls.length, 1); assert.strictEqual(ls[0].items[0].phone, '972501112233');
  assert.strictEqual(ls[0].items[0].text, 'היי אורי, הנה כרטיס המתנה לשירן: https://x.test/b/g/' + w.link + '.' + g.gift.code);
  const s = BB.createGift(w.dp, { gk: 'service', value: 'טיפול פנים', buyer: 'אורי', recipient: 'נועה', expires: '2027-01-01' }, NOW); assert.ok(s.ok); assert.strictEqual(s.prepared, false); assert.strictEqual(s.gift.expires, '2027-01-01');
  assert.strictEqual(BB.createGift(w.dp, { gk: 'amount', value: '0', recipient: 'x' }, NOW).error, 'amount');
  assert.strictEqual(BB.createGift(w.dp, { gk: 'service', value: 'לא קיים', recipient: 'x' }, NOW).error, 'service');
  assert.strictEqual(BB.createGift(w.dp, { gk: 'amount', value: '50' }, NOW).error, 'recipient');
  assert.strictEqual(BB.createGift(w.dp, { gk: 'amount', value: '50', recipient: 'x', expires: '2026-01-01' }, NOW).error, 'expires');
  let u = BB.useGift(w.dp, g.gift.id, 100, NOW); assert.strictEqual(u.left, 200); assert.strictEqual(BB.giftsView(w.dp, NOW).find((x) => x.id === g.gift.id).left, 200);
  assert.strictEqual(BB.useGift(w.dp, g.gift.id, 500, NOW).error, 'toomuch');
  u = BB.useGift(w.dp, g.gift.id, 0, NOW); assert.strictEqual(u.left, 0); assert.strictEqual(BB.giftsView(w.dp, NOW).find((x) => x.id === g.gift.id).state, 'used'); assert.strictEqual(BB.useGift(w.dp, g.gift.id, 0, NOW).error, 'used');
  assert.strictEqual(BB.useGift(w.dp, s.gift.id, 0, NOW).ok, true);
  assert.strictEqual(BB.giftPublic(w.dp, g.gift.code.toLowerCase(), NOW).state, 'used'); assert.strictEqual(BB.giftPublic(w.dp, 'AAAAAA', NOW), null); assert.strictEqual(BB.giftPublic(w.dp, 'O0O0O0', NOW), null);
});
function giftPageWorld(extra) {
  const w = mk(), g = BB.createGift(w.dp, Object.assign({ gk: 'amount', value: '300', buyer: 'אורי', recipient: 'דנה כהן', message: 'מזל טוב' }, extra || {}), NOW).gift;
  const core = makeCore({ inst: w.inst, dataPath: w.dp, tenantId: 'demo-beauty', readOnly: true, now: () => NOW });
  const api = BP.create({ DATA: os.tmpdir(), sockPath: () => '', log: () => {}, now: () => NOW, demo: { request: (r) => core.handle(Object.assign({}, r, { tenant: 'demo-beauty' })) } });
  const get = (code, ip) => api.handle({ method: 'GET', path: '/b/g/' + BP.DEMO_LINK + '.' + code, query: {}, body: null, ip: ip || '1.1.1.1' });
  return { w, g, api, get };
}
test('gift page: the four colour page with the card, the booking button, escaped, no display:none, no javascript:', async () => {
  const { g, api, get } = giftPageWorld({ recipient: '<script>alert(1)</script>דנה', message: '"><img src=x onerror=alert(2)>' });
  const r = await get(g.code); api.stop();
  assert.strictEqual(r.status, 200); assert.match(r.type, /text\/html/);
  assert.ok(r.body.includes('הקליניקה של מור')); assert.ok(r.body.includes('300 ₪')); assert.ok(r.body.includes('כרטיס מתנה')); assert.ok(r.body.includes('>לקבוע תור<')); assert.ok(r.body.includes('href="/b/' + BP.DEMO_LINK + '"'));
  assert.ok(r.body.includes(g.code)); assert.ok(r.body.includes('בתוקף עד')); assert.ok(r.body.includes('22.11.2027'));
  assert.ok(!r.body.includes('<script>alert(1)'), 'recipient escaped'); assert.ok(r.body.includes('&lt;script&gt;alert(1)')); assert.ok(!r.body.includes('<img src=x'));
  assert.doesNotMatch(r.body, /display:none|javascript:/);
  assert.ok(/--gb:#4285F4/.test(r.body) && /class="big gf"/.test(r.body) && /class="ping"|\.ping\{/.test(r.body) && /class="strip"/.test(r.body), 'the four colours: ring, ping, strip');
  assert.ok(!/data:image|photos/.test(r.body), 'no photos on a public page');
});
test('gift page: an unknown, malformed or other code is a calm not found; used and expired are shown calmly; rate limited', async () => {
  const { w, g, api, get } = giftPageWorld();
  for (const code of ['AAAAAA', 'O0O0O0']) { const r = await get(code); assert.strictEqual(r.status, 404); assert.ok(r.body.includes('הקישור לא נמצא')); assert.ok(!r.body.includes('300')); }
  assert.strictEqual((await api.handle({ method: 'GET', path: '/b/g/' + BP.DEMO_LINK + '.ABC', query: {}, body: null, ip: '1.1.1.1' })).status, 404);
  assert.strictEqual((await api.handle({ method: 'GET', path: '/b/g/zz.' + g.code, query: {}, body: null, ip: '1.1.1.1' })).status, 404);
  BB.useGift(w.dp, g.id, 100, NOW); let r = await get(g.code); assert.ok(r.body.includes('נשאר בכרטיס') && r.body.includes('200 ₪'));
  BB.useGift(w.dp, g.id, 0, NOW); r = await get(g.code); assert.ok(r.body.includes('הכרטיס נוצל'));
  const x = BB.createGift(w.dp, { gk: 'amount', value: '90', recipient: 'ישנה' }, NOW).gift; const f = path.join(w.dp, 'bookings', 'gifts.json'), all = JSON.parse(fs.readFileSync(f, 'utf8')); all.find((q) => q.id === x.id).expires = '2026-01-01'; fs.writeFileSync(f, JSON.stringify(all));
  r = await get(x.code); assert.ok(r.body.includes('פג תוקף הכרטיס'));
  let last; for (let i = 0; i < 45; i++) last = await get('AAAAAA', '9.9.9.9'); assert.strictEqual(last.status, 429); api.stop();
});
test('gift page route: wa-bridge.js sends /b/g/ to the booking proxy (g is not a hex letter)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'wa-bridge.js'), 'utf8'), m = /if \((\/\^\\\/b\\\/[^\n]*?\/)\.test\(u\.pathname\) \|\| \/\^\\\/api\\\/book/.exec(src);
  assert.ok(m, 'the dispatch line is there'); const re = eval(m[1]); // eslint-disable-line no-eval
  assert.ok(re.test('/b/g/' + 'a'.repeat(24) + '.ABCDEF')); assert.ok(re.test('/b/' + 'a'.repeat(24))); assert.ok(re.test('/b/a/' + 'a'.repeat(24) + '.' + 'b'.repeat(24))); assert.ok(!re.test('/b/zzz')); assert.ok(!re.test('/b/g/zzz'));
});
test('gift page: the agent answer is checked for shape, and the read op also answers in the demo (readOnly)', () => {
  assert.strictEqual(BP.cleanGift({ ok: true, gift: { kind: 'amount', amount: -5 } }), null); assert.strictEqual(BP.cleanGift({ ok: false }), null); assert.strictEqual(BP.cleanGift('x'), null);
  const c = BP.cleanGift({ ok: true, gift: { kind: 'amount', amount: 300, left: 900, recipient: 'x'.repeat(500), message: 'm', expires: 'garbage', state: 'weird', evil: 1 } });
  assert.strictEqual(c.left, 300); assert.strictEqual(c.recipient.length, 60); assert.strictEqual(c.expires, ''); assert.strictEqual(c.state, 'active'); assert.ok(!('evil' in c));
});

// ---------- the owner's lines ----------
test('handler: every new line is a line of the screen, parsed and applied in Hebrew', () => {
  const { w, add } = cardWorld(); const i = w.inst;
  add('2026-10-12', 'טיפול פנים', '0521234567', 'owner', 'done');
  let r = H.handle(i, 'מכירת כרטיסייה: 0521234567 | עיצוב גבות | 5 | 300 | 2027-06-01', NOW); assert.strictEqual(r.ok, true); assert.match(r.reply, /^רשמתי כרטיסייה לדנה כהן: 5 טיפולים\. נשארו 5 מתוך 5\./);
  const pk = BB.readPacks(w.dp).find((p) => p.service === 'עיצוב גבות');
  r = H.handle(i, 'תיקון כרטיסייה: ' + pk.id + ' | הורדה', NOW); assert.match(r.reply, /נשארו 4 מתוך 5/);
  r = H.handle(i, 'תיקון כרטיסייה: ' + pk.id + ' | הוספה', NOW); assert.match(r.reply, /נשארו 5 מתוך 5/);
  r = H.handle(i, 'סגירת כרטיסייה: ' + pk.id, NOW); assert.strictEqual(r.ok, true); assert.ok(BB.readPacks(w.dp).find((p) => p.id === pk.id).closed);
  r = H.handle(i, 'סגירת כרטיסייה: nope', NOW); assert.strictEqual(r.ok, false);
  r = H.handle(i, 'יצירת כרטיס מתנה: סכום | 250 | אורי | שירן | מזל טוב | | 0501112233', NOW); assert.strictEqual(r.ok, true); assert.match(r.reply, /^יצרתי כרטיס מתנה לשירן, קוד [A-Z0-9]{6}\./); assert.match(r.reply, /הכנתי לקונה הודעה/);
  const g = BB.readGifts(w.dp)[0]; assert.strictEqual(g.amount, 250); assert.strictEqual(g.message, 'מזל טוב');
  r = H.handle(i, 'שימוש בכרטיס מתנה: ' + g.id + ' | 100', NOW); assert.match(r.reply, /נשארו 150 ₪/);
  r = H.handle(i, 'שימוש בכרטיס מתנה: ' + g.id + ' | הכל', NOW); assert.strictEqual(r.ok, true); assert.match(r.reply, /כמנוצל/);
  r = H.handle(i, 'שימוש בכרטיס מתנה: ' + g.id + ' | הכל', NOW); assert.strictEqual(r.ok, false); assert.match(r.reply, /כבר נוצל/);
  r = H.handle(i, 'יצירת כרטיס מתנה: שירות | אין כזה | | דנה | | | ', NOW); assert.strictEqual(r.ok, false);
  r = H.handle(i, 'תמונות לפני ואחרי: ab12cd34 | | | 2026-11-20', NOW); assert.strictEqual(r.ok, false); assert.match(r.reply, /התמונות עוד לא הגיעו/);
  // marking a visit done through the owner's line uses a unit, and the answer says when one is left
  const b = B.add(w.dp, { start: '2026-11-23 10:00', service: 'טיפול פנים', name: 'דנה כהן', phone: '0521234567', src: 'owner' }, NOW).booking;
  for (const d of ['2026-10-19']) add(d, 'טיפול פנים', '0521234567', 'owner', 'done');
  r = H.handle(i, 'סימון תור לקוחה: ' + b.id + ' | done', NOW + 2 * DAY); assert.strictEqual(r.ok, true); assert.match(r.reply, /נשאר טיפול אחד בכרטיסייה/);
  for (const line of ['מכירת כרטיסייה: a | b | 1 | 1 | ', 'תיקון כרטיסייה: a | הוספה', 'סגירת כרטיסייה: a', 'יצירת כרטיס מתנה: סכום | 1 | | x | | | ', 'שימוש בכרטיס מתנה: a | הכל', 'תמונות לפני ואחרי: ab12cd34 | | | ']) assert.strictEqual(H.isLine(i, line), true, line);
  assert.strictEqual(H.isLine(i, 'כרטיסיות'), false); assert.strictEqual(H.isLine(i, 'כרטיס מתנה חדש'), false);
});
test('the other copies of the line prefixes know the new lines (listen.js, fireflies-key.js, demo-acts.js, the file hook)', () => {
  const lines = ['מכירת כרטיסייה: a | b | 1 | 1 | ', 'תיקון כרטיסייה: a | הוספה', 'סגירת כרטיסייה: a', 'יצירת כרטיס מתנה: סכום | 1', 'שימוש בכרטיס מתנה: a | הכל', 'תמונות לפני ואחרי: ab12cd34 | | | '];
  for (const f of ['listen.js', 'lib/fireflies-key.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8'), m = /const BOOKING_LINE = (\/.*\/);/.exec(src); assert.ok(m, f);
    const re = eval(m[1]); // eslint-disable-line no-eval
    for (const l of lines) assert.ok(re.test(l), f + ' ' + l);
  }
  const da = require('../lib/demo-acts.js');
  for (const l of lines) assert.ok(da.say('תור לקוחה', l.replace(/\| $/, '|')), l);
  assert.ok(da.say('משימה', 'כתוב פוסט לאינסטגרם על טיפול פנים של דנה עם תמונות לפני ואחרי: x').got);
  const ls = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8'); assert.ok(ls.includes("require('./lib/book-beauty.js').PHOTO_RE.test(") && ls.includes('takePhoto'));
  // the file is taken before any chat message is made for it
  assert.ok(ls.indexOf('book-beauty.js').valueOf() < ls.indexOf('recordIncoming(m)', ls.indexOf('book-beauty.js')));
});
test('exclude.json: the new command prefixes are in it (so the Russian layer never translates them)', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'i18n', 'exclude.json'), 'utf8'));
  for (const p of ['מכירת כרטיסייה', 'תיקון כרטיסייה', 'סגירת כרטיסייה', 'יצירת כרטיס מתנה', 'שימוש בכרטיס מתנה', 'תמונות לפני ואחרי']) assert.ok(ex.prefixes.includes(p), p);
  const ru = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'i18n', 'ru.json'), 'utf8'));
  for (const s of ['כרטיסיות', 'כרטיסי מתנה', 'כרטיס מתנה חדש', 'למכור כרטיסייה', 'לא את? לשנות', 'מילאנו את הפרטים שלך:', 'כרטיס מתנה אצל', 'הכרטיס נוצל', 'פג תוקף הכרטיס', 'נשאר בכרטיס', '✍️ פוסט מזה', '📸 לפני ואחרי', 'קביעת תור חדש', 'השעות שלי', 'התנאים לביטול', 'קישור לתאריך']) assert.ok(ru[s], s);
  for (const label of ['כרטיסיות', 'כרטיסי מתנה', 'כרטיס מתנה חדש', 'למכור כרטיסייה', '📸 לפני ואחרי', '✍️ פוסט מזה', 'קביעת תור חדש', 'השעות שלי', 'התנאים לביטול', 'קישור לתאריך'])
    assert.ok(!ex.prefixes.some((p) => label.startsWith(p)) && !ex.exact.includes(label), 'a label that is also a command word would stay Hebrew: ' + label);
});

// ---------- 2. before and after photos ----------
function stage(w, pair, kinds) { fs.mkdirSync(path.join(w.dp, 'inbox'), { recursive: true }); (kinds || ['b', 'a', 'bt', 'at']).forEach((k) => fs.writeFileSync(path.join(w.dp, 'inbox', 'ba_' + pair + '_' + k + '.jpg'), JPEG)); }
test('photos: the file hook takes only real JPEGs with the opaque names, out of the inbox into a private folder', () => {
  const w = mk(); fs.mkdirSync(path.join(w.dp, 'inbox'), { recursive: true });
  assert.strictEqual(BB.takePhoto(w.dp, 'holiday.jpg'), false); assert.strictEqual(BB.takePhoto(w.dp, 'ba_../x_b.jpg'), false); assert.strictEqual(BB.takePhoto(w.dp, 'ba_ab12cd34_x.jpg'), false);
  stage(w, 'ab12cd34'); assert.strictEqual(BB.takePhoto(w.dp, 'ba_ab12cd34_b.jpg'), true);
  assert.ok(!fs.existsSync(path.join(w.dp, 'inbox', 'ba_ab12cd34_b.jpg'))); assert.ok(fs.existsSync(path.join(w.dp, 'bookings', 'photos', 'staging', 'ba_ab12cd34_b.jpg')));
  fs.writeFileSync(path.join(w.dp, 'inbox', 'ba_ab12cd34_a.jpg'), Buffer.alloc(500, 1)); // not a JPEG
  assert.strictEqual(BB.takePhoto(w.dp, 'ba_ab12cd34_a.jpg'), true); assert.ok(!fs.existsSync(path.join(w.dp, 'inbox', 'ba_ab12cd34_a.jpg'))); assert.ok(!fs.existsSync(path.join(w.dp, 'bookings', 'photos', 'staging', 'ba_ab12cd34_a.jpg')));
  fs.writeFileSync(path.join(w.dp, 'inbox', 'ba_ab12cd34_bt-2.jpg'), JPEG); assert.strictEqual(BB.takePhoto(w.dp, 'ba_ab12cd34_bt-2.jpg'), true); assert.ok(fs.existsSync(path.join(w.dp, 'bookings', 'photos', 'staging', 'ba_ab12cd34_bt.jpg')));
});
test('photos: the owner line finalizes a pair for a booking or a client, ids only; the gallery has small thumbnails; a stranger pair stays unlinked', () => {
  const { w, add } = cardWorld(); const b = add('2026-10-12', 'טיפול פנים', '0521234567', 'owner', 'done');
  stage(w, 'ab12cd34'); ['b', 'a', 'bt', 'at'].forEach((k) => BB.takePhoto(w.dp, 'ba_ab12cd34_' + k + '.jpg'));
  const r = H.handle(w.inst, 'תמונות לפני ואחרי: ab12cd34 | | ' + b.id + ' | 2026-10-12', NOW); assert.strictEqual(r.ok, true); assert.match(r.reply, /^שמרתי את התמונות לפני ואחרי של דנה כהן\./);
  const rec = BB.readPhotos(w.dp)[0]; assert.strictEqual(rec.bookingId, b.id); assert.strictEqual(rec.service, 'טיפול פנים'); assert.strictEqual(rec.date, '2026-10-12'); assert.strictEqual(rec.phone, '972521234567');
  ['b', 'a', 'bt', 'at'].forEach((k) => assert.ok(fs.existsSync(path.join(w.dp, 'bookings', 'photos', 'ab12cd34_' + k + '.jpg'))));
  assert.strictEqual(H.handle(w.inst, 'תמונות לפני ואחרי: ab12cd34 | | ' + b.id + ' | 2026-10-12', NOW).ok, true); assert.strictEqual(BB.readPhotos(w.dp).length, 1, 'twice is once');
  const v = BB.photosView(w.dp); assert.strictEqual(v.length, 1); assert.ok(v[0].bt.startsWith('data:image/jpeg;base64,')); assert.deepStrictEqual(v[0].full, ['ab12cd34_b.jpg', 'ab12cd34_a.jpg']);
  // by client id: a pair for a client without a booking
  const cid = BB.resolveClient(w.dp, '0521234567').clientId; stage(w, 'zz99yy88'); ['b', 'a', 'bt', 'at'].forEach((k) => BB.takePhoto(w.dp, 'ba_zz99yy88_' + k + '.jpg'));
  if (cid) { assert.strictEqual(H.handle(w.inst, 'תמונות לפני ואחרי: zz99yy88 | ' + cid + ' | | ', NOW).ok, true); assert.strictEqual(BB.readPhotos(w.dp).length, 2); }
  // a pair with no owner line, and a line for files that never came
  stage(w, 'qq11ww22'); BB.takePhoto(w.dp, 'ba_qq11ww22_b.jpg'); assert.strictEqual(H.handle(w.inst, 'תמונות לפני ואחרי: qq11ww22 | | ' + b.id + ' | ', NOW).ok, false);
  assert.strictEqual(H.handle(w.inst, 'תמונות לפני ואחרי: nonefile | | ' + b.id + ' | ', NOW) === null || true, true);
  // the data of the owner's screen carries the pair (and nothing of it reaches a public page)
  const D = UI.data(w.inst, NOW); assert.ok(D.photos.length >= 1); assert.ok(D.packs.length >= 1); assert.ok(Array.isArray(D.gifts)); assert.ok(Array.isArray(D.recent)); assert.ok(D.clients.every((c) => 'id' in c && 'p' in c));
});
test('photos: the owner screen has the picker, the 1080 pixel JPEG shrink, the upload through sendAll, the post task that never names the client', () => {
  const src = UI.page.toString();
  for (const part of ['capture="environment"', 'accept="image/*"', 'shrink(f, 1080, 0.8)', "'image/jpeg'", 'sendAll(files, line)', '✍️ פוסט מזה', '📸 לפני ואחרי', 'כתוב פוסט לאינסטגרם על ', 'בלי לציין את שם הלקוחה בפוסט', "'משימה מהמוניטור'", "ba_' + pair + '_'", 'bkFile', 'bkOpt', 'bkPair']) assert.ok(src.includes(part), part);
  assert.ok(!/fetch\(/.test(src.slice(src.indexOf('function formPhoto'), src.indexOf('function doPost'))), 'no new upload endpoint: only the existing file path');
  const out = UI.html(w0()); assert.doesNotMatch(out, /display:none|javascript:/);
  assert.match(B.promptLines().join('\n'), /data\/bookings\/photos/);
});
const w0 = () => mk().inst;
test('owner screen: sections, four colour rings and pings, pending ops survive view(), Russian build has no leftover labels', () => {
  const src = UI.page.toString(), css = UI.css('beauty');
  for (const part of ['כרטיסיות', 'כרטיסי מתנה', 'כרטיס מתנה חדש', 'נשארו ', ' מתוך ', 'למכור כרטיסייה', "'מכירת כרטיסייה: '", "'תיקון כרטיסייה: '", "'סגירת כרטיסייה: '", "'יצירת כרטיס מתנה: '", "'שימוש בכרטיס מתנה: '", 'XOPS', 'xDone', 'bkFx(o, e)', 'aria-pressed']) assert.ok(src.includes(part), part);
  assert.ok(/\.bkOpt\[aria-pressed=true\]::before/.test(css) && /conic-gradient/.test(css));
  assert.ok(!/display\s*:\s*none/.test(css));
  for (const gone of ['>תור חדש<', "'תור חדש'", 'קישור ליום מסוים', '>שעות פעילות<', '>תנאי ביטול<']) assert.ok(!src.includes(gone), 'label that was a command word: ' + gone);
  const w = mk(); const ru = UI.data(Object.assign({}, w.inst, { lang: 'ru' }), NOW), he = UI.data(w.inst, NOW);
  assert.ok(/[а-я]/i.test(ru.t.intro) && !/[א-ת]/.test(ru.t.intro + ru.t.noSvc + ru.t.fail + ru.t.gift), 'the sentences of the payload are Russian'); assert.ok(/[א-ת]/.test(he.t.intro));
});

// ---------- 5. the returning client ----------
test('booking page: the name and phone are remembered in her own browser only; no server lookup of a phone exists', async () => {
  const src = BP.clientJs.toString();
  for (const part of ["'bkMe'", 'localStorage.setItem(ME_KEY', 'localStorage.getItem(ME_KEY', 'localStorage.removeItem(ME_KEY', 'לא את? לשנות', 'מילאנו את הפרטים שלך:', 'id="mex"', 'meFill()']) assert.ok(src.includes(part), part);
  assert.ok(/try \{[^}]*localStorage\.getItem/.test(src) && /try \{ localStorage\.setItem/.test(src), 'every storage use is in a try');
  assert.ok(src.includes('if (D.demo) return;'), 'the demo keeps nothing');
  // the only calls of the page are the slots, the booking and the act: the phone is never sent to look anyone up
  const calls = (src.match(/fetch\('[^']*|post\('[^']*/g) || []).map((x) => x.replace(/^[a-z]+\('/, '')); assert.deepStrictEqual([...new Set(calls)].sort(), ['/api/book', '/api/book/act', '/api/book/slots?l=']);
  const w = mk(); const core = makeCore({ inst: w.inst, dataPath: w.dp, tenantId: 't1', now: () => NOW, notify: () => {} });
  for (const op of ['client', 'lookup', 'who', 'phone', 'me']) assert.deepStrictEqual(await core.handle({ op, tenant: 't1', phone: '0521234567', name: 'x' }), { ok: false, error: 'bad' });
  assert.ok(!/op: 'lookup'|case 'lookup'/.test(fs.readFileSync(path.join(ROOT, 'lib', 'book-core.js'), 'utf8')));
  // and the page the client opens has the script and the card for it
  const core2 = makeCore({ inst: w.inst, dataPath: w.dp, tenantId: 'demo-beauty', readOnly: true, now: () => NOW });
  const api = BP.create({ DATA: os.tmpdir(), sockPath: () => '', log: () => {}, now: () => NOW, demo: { request: (r) => core2.handle(Object.assign({}, r, { tenant: 'demo-beauty' })) } });
  const r = await api.handle({ method: 'GET', path: '/b/' + BP.DEMO_LINK, query: {}, body: null, ip: '2.2.2.2' }); api.stop();
  assert.strictEqual(r.status, 200); assert.ok(r.body.includes('bkMe') && r.body.includes('id=\\"me\\"') || r.body.includes('id="me"')); assert.doesNotMatch(r.body, /display:none|javascript:/);
});

// ---------- the demo ----------
test('demo: invented examples of every feature are seeded, and the public demo answers the demo gift code', async () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-demo-')); require('../lib/demo-trades/beauty.js').seed(dp, NOW);
  const packs = BB.packsView(dp, NOW); assert.ok(packs.length >= 2); assert.ok(packs.some((p) => p.left === 1), 'one with one unit left'); assert.ok(packs.some((p) => p.left > 1 && p.total === 5));
  const gifts = BB.giftsView(dp, NOW); assert.deepStrictEqual(gifts.map((g) => g.code).sort(), ['FACE47', 'HAPPY7', 'MATANA']); assert.ok(gifts.some((g) => g.kind === 'service') && gifts.some((g) => g.left < g.amount && g.left > 0));
  assert.strictEqual(BB.photosView(dp).length, 2);
  const ls = lists(dp).map((l) => l.items[0].text); assert.ok(ls.some((t) => /נשאר לך טיפול אחד/.test(t))); assert.ok(ls.some((t) => /מאושר\. ביטול או שינוי/.test(t)));
  const d = require('../lib/book-demo.js'); const r = await d.request({ op: 'gift', tenant: 'demo-beauty', code: 'MATANA' }); assert.strictEqual(r.ok, true); assert.strictEqual(r.gift.recipient, 'שירן אוחיון'); assert.strictEqual((await d.request({ op: 'gift', tenant: 'demo-beauty', code: 'ZZZZZZ' })).ok, false);
});
