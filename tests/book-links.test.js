'use strict';
// 22.11.2026: links that open the public booking page on a day, a service or a time (lib/book-links.js, the page's cleanPre,
// the deterministic handler, the CLI and the owner's screen).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const L = require('../lib/book-links.js');
const B = require('../lib/bookings.js');
const BP = require('../lib/book-page.js');
const H = require('../lib/bookings-handler.js');
const UI = require('../lib/bookings-ui.js');
const SL = require('../lib/sendlist.js');
const bh = require('../lib/biz-home.js');

const NOW = Date.parse('2026-11-22T06:00:00Z'); // Sunday 08:00 in Israel
const ROOT = path.join(__dirname, '..');
function world(over) {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-test-links-'));
  B.saveConfig(dp, { hours: { 0: [['09:00', '17:00']], 1: [['09:00', '17:00']], 2: [['09:00', '12:00'], ['14:00', '18:00']], 3: [['09:00', '17:00']], 4: [['09:00', '17:00']], 5: [], 6: [] },
    services: [{ id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 }, { id: 'face', name: 'טיפול פנים', minutes: 60, price: 320 }], slotMinutes: 15, bufferMinutes: 0 });
  const tok = B.ensureLinkToken(dp);
  bh.writeList(dp, 'client', [
    { id: 'c1', name: 'רוני דהן', phone: '972541112233' }, { id: 'c2', name: 'דנה פרץ', phone: '972501234567' }, { id: 'c3', name: 'דנה לוי', phone: '972529998877' },
    { id: 'c4', name: 'בלי טלפון', phone: '' },
  ]);
  return { dp, tok, inst: Object.assign({ dataPath: dp, trade: 'beauty', gender: 'f', bookings: true }, over) };
}

test('validParams: only a day inside two weeks that is open, a service that exists, a time on the slot grid of that day', () => {
  const w = world(), cfg = B.loadConfig(w.dp);
  assert.deepStrictEqual(L.validParams(cfg, { d: '2026-11-24', s: 'brows', t: '14:30' }, NOW), { d: '2026-11-24', s: 'brows', t: '14:30' }); // Tuesday, the afternoon range
  assert.deepStrictEqual(L.validParams(cfg, { d: '2026-11-22' }, NOW), { d: '2026-11-22' }); // today
  assert.deepStrictEqual(L.validParams(cfg, { d: '2026-12-06' }, NOW), { d: '2026-12-06' }); // day 14
  for (const bad of ['2026-12-07', '2026-11-21', '2026-11-27', '2026-11-28', 'garbage', '2026-02-30', '2026-13-01', '', null, 5]) assert.deepStrictEqual(L.validParams(cfg, { d: bad }, NOW), {}, String(bad)); // outside the window, past, closed days, nonsense
  assert.deepStrictEqual(L.validParams(cfg, { s: 'nope' }, NOW), {}); assert.deepStrictEqual(L.validParams(cfg, { s: 'face' }, NOW), { s: 'face' });
  assert.deepStrictEqual(L.validParams(cfg, { s: 'face;rm', d: 'x' }, NOW), {});
  for (const t of ['14:07', '12:00', '13:00', '08:45', '18:00', '24:00', '9:00', '14:60', '14:15 ', 'abc']) assert.deepStrictEqual(L.validParams(cfg, { d: '2026-11-24', t }, NOW), { d: '2026-11-24' }, t); // off grid, in the lunch break, outside hours
  assert.deepStrictEqual(L.validParams(cfg, { t: '10:00' }, NOW), {}); // a time needs a day
  assert.deepStrictEqual(L.validParams(cfg, { d: '2026-11-24', s: 'face', t: '09:00', extra: 'x' }, NOW), { d: '2026-11-24', s: 'face', t: '09:00' });
  assert.deepStrictEqual(L.validParams(cfg, null, NOW), {});
});

test('linkFor: the permanent link with only the valid parts, the service encoded', () => {
  assert.strictEqual(L.linkFor(null, 'a'.repeat(24), {}), 'https://form.it-solution.co.il/b/' + 'a'.repeat(24));
  assert.strictEqual(L.linkFor('https://x.test', 'b'.repeat(24), { d: '2026-11-24', s: 'brows', t: '10:00' }), 'https://x.test/b/' + 'b'.repeat(24) + '?d=2026-11-24&s=brows&t=10:00');
  assert.strictEqual(L.linkFor('https://x.test', 'b'.repeat(24), { s: 'a b' }), 'https://x.test/b/' + 'b'.repeat(24) + '?s=a%20b');
  assert.strictEqual(L.linkFor('https://x.test', 'b'.repeat(24), { d: '2026-11-24' }), 'https://x.test/b/' + 'b'.repeat(24) + '?d=2026-11-24');
});

test('prepare: a prepared message in a send list with the right link, never sent', () => {
  const w = world();
  const r = L.prepare(w.dp, { to: 'רוני', d: '2026-11-24', s: 'brows', base: 'https://x.test' }, NOW);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.name, 'רוני דהן');
  assert.strictEqual(r.text, 'היי רוני, הנה קישור לקביעת תור לעיצוב גבות ביום שלישי 24.11: https://x.test/b/' + w.tok + '?d=2026-11-24&s=brows');
  const lists = SL.all(w.dp); assert.strictEqual(lists.length, 1); assert.strictEqual(SL.validate(lists[0]).length, 0);
  const pg = SL.forPage(w.dp, NOW)[0]; assert.strictEqual(pg.items.length, 1);
  assert.ok(pg.items[0].link.startsWith('https://wa.me/972541112233?text=')); assert.strictEqual(pg.items[0].sentAt, ''); // a tap on her own WhatsApp, nothing went out
  // with a time; a second request makes a second list, not an overwrite
  const r2 = L.prepare(w.dp, { to: 'רוני דהן', d: '2026-11-24', t: '14:30' }, NOW);
  assert.strictEqual(r2.ok, true); assert.match(r2.text, /ביום שלישי 24\.11 בשעה 14:30: https:\/\/form\.it-solution\.co\.il\/b\/[a-f0-9]{24}\?d=2026-11-24&t=14:30$/);
  assert.strictEqual(SL.all(w.dp).length, 2);
  // refusals
  assert.strictEqual(L.prepare(w.dp, { to: 'רוני', d: '2026-11-28' }, NOW).error, 'params'); // a closed day and no service
  assert.strictEqual(L.prepare(w.dp, { to: 'רוני' }, NOW).error, 'params');
  assert.strictEqual(L.prepare(w.dp, { to: 'דנה', s: 'face' }, NOW).error, 'many'); // two clients called Dana
  assert.strictEqual(L.prepare(w.dp, { to: 'דנה פרץ', s: 'face' }, NOW).ok, true); // the full name is enough
  assert.strictEqual(L.prepare(w.dp, { to: 'מישהי', s: 'face' }, NOW).error, 'none');
  assert.strictEqual(L.prepare(w.dp, { to: 'בלי טלפון', s: 'face' }, NOW).error, 'none'); // no phone, no message to prepare
  assert.strictEqual(L.prepare(w.dp, { to: '', s: 'face' }, NOW).error, 'name');
  const c = B.loadConfig(w.dp); c.linkToken = ''; B.saveConfig(w.dp, c);
  assert.strictEqual(L.prepare(w.dp, { to: 'רוני', s: 'face' }, NOW).error, 'nolink');
});

test('the deterministic line and the CLI prepare the same message, and answer in Hebrew', () => {
  const w = world();
  assert.deepStrictEqual(B.parseRequest('קישור ליום: 2026-11-24 | עיצוב גבות | 14:30 | רוני'), { kind: 'link', d: '2026-11-24', service: 'עיצוב גבות', t: '14:30', to: 'רוני' });
  assert.deepStrictEqual(B.parseRequest('קישור ליום: 2026-11-24 |  |  | רוני'), { kind: 'link', d: '2026-11-24', service: '', t: '', to: 'רוני' });
  const wire = (x) => 'תור לקוחה\n' + x + '\n\nקוד';
  const r = H.handle(w.inst, wire('קישור ליום: 2026-11-24 | עיצוב גבות | | רוני'), NOW);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.changed, true); assert.strictEqual(r.reply, 'הכנתי הודעה לרוני דהן עם הקישור. היא מחכה ב 📤 הודעות לשליחה.');
  assert.match(SL.all(w.dp)[0].items[0].text, /\?d=2026-11-24&s=brows$/);
  assert.strictEqual(H.handle(w.inst, wire('קישור ליום: 2026-11-24 | ציפורניים | | רוני'), NOW).reply, 'לא מצאתי את השירות הזה ברשימה.');
  assert.match(H.handle(w.inst, wire('קישור ליום: 2026-11-28 | | | רוני'), NOW).reply, /צריך יום בשבועיים הקרובים שהעסק פתוח בו/);
  assert.match(H.handle(w.inst, wire('קישור ליום: 2026-11-24 | עיצוב גבות | | מישהי'), NOW).reply, /לא מצאתי לקוחה בשם מישהי עם טלפון/);
  assert.match(H.handle(w.inst, wire('קישור ליום: 2026-11-24 | עיצוב גבות | | דנה'), NOW).reply, /יש כמה לקוחות בשם דנה/);
  // the CLI: exit 0 when prepared, 2 when refused, one JSON line
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'booking.js'), ...a, '--data', w.dp], { encoding: 'utf8' });
  const ok = run('link', '--to', 'רוני', '--day', '2026-11-24', '--service', 'עיצוב גבות', '--time', '14:30');
  assert.strictEqual(ok.status, 0); const j = JSON.parse(ok.stdout.trim()); assert.strictEqual(j.ok, true); assert.match(j.text, /ביום שלישי 24\.11 בשעה 14:30/);
  const no = run('link', '--to', 'מישהי', '--day', '2026-11-24');
  assert.strictEqual(no.status, 2); assert.strictEqual(JSON.parse(no.stdout.trim()).error, 'none');
  assert.strictEqual(run('link', '--to', 'רוני', '--day', '2026-11-24', '--service', 'x').status, 2);
  // the worker is told how
  assert.match(B.promptLines().join('\n'), /node booking\.js link --to/);
});

test('the page cleans d, s and t on its server side with only what the agent\'s info lets it verify', () => {
  const info = { slotMinutes: 15, services: [{ id: 'brows' }, { id: 'face' }],
    days: [{ d: '2026-11-22', closed: false }, { d: '2026-11-23', closed: false }, { d: '2026-11-27', closed: true }, { d: '2026-12-06', closed: false }] };
  const P = BP.cleanPre;
  assert.deepStrictEqual(P({ d: '2026-11-23', s: 'brows', t: '10:15' }, info), { d: '2026-11-23', s: 'brows', t: '10:15' });
  assert.deepStrictEqual(P({ d: '2026-11-27', s: 'face', t: '10:00' }, info), { s: 'face' }); // a closed day is dropped, and its time with it
  assert.deepStrictEqual(P({ d: '2026-12-07' }, info), {}); // outside the window
  assert.deepStrictEqual(P({ d: '2026-11-23', t: '10:07' }, info), { d: '2026-11-23' }); // off the step
  assert.deepStrictEqual(P({ d: '2026-11-23', t: '25:00' }, info), { d: '2026-11-23' });
  assert.deepStrictEqual(P({ t: '10:00' }, info), {}); assert.deepStrictEqual(P({ s: 'nope' }, info), {}); assert.deepStrictEqual(P({}, info), {}); assert.deepStrictEqual(P(null, info), {});
  assert.deepStrictEqual(P({ d: ['2026-11-23'], s: { x: 1 }, t: 5 }, info), {}); // not strings
  assert.deepStrictEqual(P({ d: '2026-11-23', s: '<script>', t: '10:00;' }, info), { d: '2026-11-23' });
});

test('the owner\'s screen has the link choices, "לשלוח קישור" on free gaps, and the tomorrow block', () => {
  const w = world();
  const h = UI.html(w.inst, NOW);
  assert.ok(h.includes('לשלוח קישור') && h.includes('קישור כללי') && h.includes('קישור לתאריך') && h.includes("data-a=\"gaplink\"") && h.includes('כל השירותים'));
  assert.ok(h.includes('class="bkTom"') && h.includes('aria-label="מחר"'));
  assert.ok(h.includes("'?' + q.join('&')")); // the link builder
  const D = UI.data(w.inst, NOW); assert.strictEqual(D.cfg.remindAt, '18:00'); assert.match(D.link, /^https:\/\/form\.it-solution\.co\.il\/b\/[a-f0-9]{24}$/);
  const lits = (/<script>([\s\S]*)<\/script>/.exec(h)[1].match(/'[^'\\\n]*[֐-׿][^'\\\n]*'/g) || []);
  for (const l of lits) assert.doesNotMatch(l.replace(/(aria|data)-[a-z]+/g, ''), /[-‐-―]/, l);
});

test('the page script: a link that names a time highlights it when free, says so calmly when taken, and never locks her in', () => {
  const src = BP.clientJs.toString();
  assert.ok(src.includes('השעה הזאת כבר נתפסה, יש עוד שעות פנויות'));
  assert.ok(src.includes('applyPre') && src.includes('st.pre') && src.includes('scrollIntoView'));
  // the choices are made by clicking the same buttons she uses, so every one of them stays changeable
  assert.ok(src.includes("[data-s=\"' + p.s + '\"]") && src.includes("[data-d=\"' + p.d + '\"]") && src.includes('!el.disabled'));
  assert.doesNotMatch(src, /\.disabled\s*=\s*true[^;]*pre/);
});
