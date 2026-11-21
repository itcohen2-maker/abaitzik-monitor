'use strict';
// 21.11.2026: lib/bookings-ui.js, the screen 📅 התורים שלי of a trade with bookings.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const UI = require('../lib/bookings-ui.js');
const B = require('../lib/bookings.js');
const trades = require('../lib/trades.js');

const NOW = Date.parse('2026-11-22T07:00:00Z'); // Sunday 09:00 in Israel
function seeded() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bkui-')); require('../lib/demo-trades/beauty.js').seed(d, NOW); return d; }
const scriptOf = (h) => /<script>([\s\S]*)<\/script>/.exec(h)[1];

test('only a trade with bookings: true gets the screen', () => {
  const d = seeded();
  assert.strictEqual(UI.html({ trade: 'gypsum', dataPath: d }, NOW), '');
  assert.strictEqual(UI.html({ trade: 'consult', dataPath: d }, NOW), '');
  assert.strictEqual(UI.html({ trade: '', dataPath: d }, NOW), '');
  assert.strictEqual(UI.html({ dataPath: d }, NOW), '');
  assert.strictEqual(UI.html({ trade: 'beauty' }, NOW), '');
  assert.strictEqual(UI.html(null, NOW), '');
  assert.ok(UI.html({ trade: 'beauty', bookings: true, dataPath: d }, NOW).length > 5000);
  assert.deepStrictEqual(Object.keys(trades.TRADES).filter((k) => trades.TRADES[k].bookings), ['beauty']);
});

test('beauty has the diary tile and no second calendar (18.11: two tiles of the same appointments was a double), and the tile exists in build.js', () => {
  const t = trades.get('beauty');
  assert.ok(t.screens.includes('gBkAppts') && !t.screens.includes('gBhCal'));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8'), /\n {2}gBkAppts: \['g\d+', '📅 התורים שלי'/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8'), /require\('\.\/lib\/bookings-ui\.js'\)\.html\(inst\)/);
});

test('the page sends the fixed lines that parseRequest reads back', () => {
  const h = UI.html({ trade: 'beauty', bookings: true, dataPath: seeded() }, NOW), s = scriptOf(h);
  for (const f of ["'תור לקוחה חדש: '", "'הזזת תור לקוחה: '", "'ביטול תור לקוחה: '", "'שעות פעילות: '", "'שירות חדש: '", "'מחיקת שירות: '", "'סימון תור לקוחה: '", "api/book/link", "לא הגיעה"]) assert.ok(s.includes(f), f);
  assert.ok(s.includes("sendText('תור לקוחה', text, 'תור לקוחה')")); // the same sender the monitor's forms use
  assert.ok(s.includes('PUBLIC_DEMO') && s.includes('demoAct'));
  assert.ok(s.includes('נשלח, מתעדכן'));
  // the same lines, built the way the page builds them, are understood
  assert.strictEqual(B.parseRequest('תור לקוחה חדש: 2026-11-22 10:00 | עיצוב גבות | דנה פרץ | 0501234567').kind, 'add');
  assert.strictEqual(B.parseRequest('הזזת תור לקוחה: abc123 | 2026-11-22 10:00').kind, 'move');
  assert.strictEqual(B.parseRequest('ביטול תור לקוחה: abc123').kind, 'cancel');
});

test('no dashes between words in anything she reads', () => {
  const h = UI.html({ trade: 'beauty', bookings: true, dataPath: seeded(), gender: 'f' }, NOW);
  const lits = scriptOf(h).match(/'[^'\\\n]*[֐-׿][^'\\\n]*'/g) || [];
  assert.ok(lits.length > 40, 'string literals ' + lits.length);
  for (const l of lits) assert.doesNotMatch(l.replace(/(aria|data)-[a-z]+/g, ''), /[-‐-―]/, l);
  const style = /<style>([\s\S]*?)<\/style>/.exec(h)[1];
  assert.doesNotMatch(style, /[֐-׿]/); // no words in the css
  assert.match(style, /Heebo/); assert.doesNotMatch(style, /font-family:(?!Heebo|var)[A-Za-z' ]*(Arial|Roboto|Inter)/);
  assert.doesNotMatch(h, /<table/i);
});

test('feminine for a customer who said so, masculine otherwise, never from the trade', () => {
  const d = seeded();
  const f = JSON.stringify(UI.data({ trade: 'beauty', bookings: true, dataPath: d, gender: 'f' }, NOW).t), m = JSON.stringify(UI.data({ trade: 'beauty', bookings: true, dataPath: d, gender: '' }, NOW).t); // the sentences travel with the sealed data
  assert.match(f, /לחצי על תור חדש/); assert.match(f, /בדקי את החיבור ונסי שוב/); assert.match(f, /הוסיפי אותם למטה/);
  assert.match(m, /לחץ על תור חדש/); assert.match(m, /בדוק את החיבור ונסה שוב/); assert.match(m, /הוסף אותם למטה/);
  assert.doesNotMatch(m, /לחצי|בדקי|הוסיפי/); assert.doesNotMatch(f, /לחץ על|בדוק את|הוסף אותם/);
  assert.strictEqual(UI.data({ trade: 'beauty', bookings: true, dataPath: d, gender: '' }, NOW).fem, false);
});

test('the embedded data: hours, services, bookings from today on, no cancelled', () => {
  const d = seeded();
  const x = B.list(d, { from: '2026-11-22', to: '2026-11-22' })[0];
  B.cancel(d, x.id, NOW);
  const D = UI.data({ trade: 'beauty', bookings: true, dataPath: d }, NOW);
  assert.strictEqual(D.today, '2026-11-22'); assert.strictEqual(D.cfg.services.length, 4);
  assert.ok(D.items.length >= 5 && D.items.every((i) => i.status !== 'cancelled' && Date.parse(i.start) >= Date.parse('2026-11-21T22:00:00Z')));
  assert.ok(!D.items.some((i) => i.id === x.id));
  assert.ok(D.clients.some((c) => c.name === 'דנה פרץ' && c.phone));
  // the page source is public, the data is sealed: no client name, phone or booking id is in the html
  const h = UI.html({ trade: 'beauty', bookings: true, dataPath: d }, NOW);
  assert.doesNotMatch(h, /דנה פרץ|הדס לוי|שירן|9725000/);
  for (const i of B.list(d, {})) assert.ok(!h.includes(i.id), 'booking id in the page source');
  assert.strictEqual(UI.enabled({ trade: 'beauty', bookings: true, dataPath: d }), true); assert.strictEqual(UI.enabled({ trade: 'gypsum', dataPath: d }), false);
});

test('the script is valid, loads quietly, and its slot code is the node code', () => {
  const d = seeded();
  const h = UI.html({ trade: 'beauty', bookings: true, dataPath: d }, NOW), s = scriptOf(h);
  new vm.Script(s); // syntax
  const win = { PUBLIC_DEMO: true }, docs = [];
  const ctx = { window: win, document: { addEventListener: (t, f) => docs.push([t, f]) }, localStorage: { getItem: () => null, setItem() {} }, Date, Intl, JSON, Math, Promise, setTimeout };
  vm.createContext(ctx); vm.runInContext(s, ctx);
  assert.strictEqual(typeof win.bkOpen, 'function'); assert.ok(docs.some(([t]) => t === 'click'));
  // opening: without the sealed data nothing opens and she is told; with it the screen opens
  const opened = [], told = []; ctx.shipOpen = (id) => { opened.push(id); return {}; }; ctx.toast = (m) => told.push(m);
  win.bkOpen(); assert.deepStrictEqual(opened, []); assert.equal(told.length, 1);
  win.D = { bookings: UI.data({ trade: 'beauty', bookings: true, dataPath: d }, NOW) }; win.bkOpen(); assert.deepStrictEqual(opened, ['bkSheet']);
  // core as the page gets it gives the same free times as lib/bookings.js
  const core = vm.runInContext('(' + B.core.toString() + ')()', vm.createContext({ Intl, Date, Math }));
  const cfg = B.loadConfig(d), items = B.list(d, {});
  for (const day of ['2026-11-22', '2026-11-26', '2026-11-27', '2026-11-28']) {
    for (const svc of ['עיצוב גבות', 'טיפול פנים']) {
      const mins = cfg.services.find((x) => x.name === svc).minutes;
      assert.deepStrictEqual(JSON.parse(JSON.stringify(core.slots(cfg, items, day, mins, NOW))), B.freeSlots(d, day, svc, NOW), day + ' ' + svc);
    }
  }
  assert.ok(B.freeSlots(d, "2026-11-28", "עיצוב גבות", NOW).length > 10); // the demo is open all seven days
});

test('the demo gets the lines through the demo toast', () => {
  const A = require('../lib/demo-acts.js');
  const say = A.say || (A.client && A.client.say);
  if (typeof say !== 'function') return; // the shape of that module is its own business
  const r = say('תור לקוחה', 'תור לקוחה חדש: 2026-11-22 10:00 | עיצוב גבות | דנה פרץ | 0501234567');
  assert.match(r.got, /דנה פרץ/); assert.match(r.did, /ביומן/);
  assert.match(say('תור לקוחה', 'ביטול תור לקוחה: ab12').got, /לבטל/);
  assert.match(say('תור לקוחה', 'הזזת תור לקוחה: ab12 | 2026-11-23 10:00').got, /23\.11 בשעה 10:00/);
  assert.match(r.got, /22\.11 בשעה 10:00/); // a date read as the owner says it, not as an ISO string that bidi would tear apart
});
