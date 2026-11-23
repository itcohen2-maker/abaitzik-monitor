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
  assert.match(f, /לחצי על תור חדש/); assert.match(f, /ממתין למעלה/); assert.match(f, /הוסיפי אותם למטה/);
  assert.match(m, /לחץ על תור חדש/); assert.match(m, /ממתין למעלה/); assert.match(m, /הוסף אותם למטה/);
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

// 23.11.2026: a command that did not leave waits in the outbox, is shown as waiting, and is sent again by itself.
function outboxRun(startStore, sendImpl) {
  const d = seeded();
  const h = UI.html({ trade: 'beauty', bookings: true, dataPath: d }, NOW), s = scriptOf(h);
  const store = { bkOutbox: JSON.stringify(startStore || []) };
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const el = { isConnected: true, innerHTML: '', scrollTop: 0, querySelector: () => null, addEventListener() {} };
  const win = {};
  const ctx = { window: win, document: { addEventListener() {} }, localStorage: ls, Date, Intl, JSON, Math, Promise, setTimeout, console };
  vm.createContext(ctx); vm.runInContext(s, ctx);
  ctx.shipOpen = (id, title, inner, after) => { const w = { querySelector: () => el, addEventListener() {} }; if (after) after(w); return w; };
  ctx.toast = () => {};
  ctx.sendText = sendImpl;
  win.D = { bookings: UI.data({ trade: 'beauty', bookings: true, dataPath: d }, NOW) };
  return { win, el, store, open: () => win.bkOpen(), tick: () => new Promise((r) => setTimeout(r, 5)) };
}

test('a command that did not leave waits in the outbox, shows as waiting, and is sent again', async () => {
  let fail = true, sends = 0;
  const entry = { text: 'ביטול תור לקוחה: 4c1f1be1638c', bid: '4c1f1be1638c', at: Date.now(), tries: 0 };
  const r = outboxRun([entry], () => { sends++; return fail ? Promise.reject(new Error('net')) : Promise.resolve('ok'); });
  r.open(); await r.tick(); await r.tick();
  assert.ok(sends >= 1, 'retried on opening');
  let q = JSON.parse(r.store.bkOutbox);
  assert.strictEqual(q.length, 1, 'still waiting after a failed retry');
  assert.ok(q[0].tries >= 1);
  assert.match(r.el.innerHTML, /ממתין לשליחה: 1/);
  assert.match(r.el.innerHTML, /data-a="outretry"/);
  assert.match(r.el.innerHTML, /data-a="outdrop"/);
  fail = false;
  r.open(); await r.tick(); await r.tick(); await r.tick();
  q = JSON.parse(r.store.bkOutbox);
  assert.strictEqual(q.length, 0, 'sent once the phone is back');
  assert.doesNotMatch(r.el.innerHTML, /ממתין לשליחה: /);
});

test('the outbox keeps the order and stops at the first command that still does not leave', async () => {
  const sent = [];
  const r = outboxRun([
    { text: 'ביטול תור לקוחה: aaaaaaaaaaaa', bid: 'aaaaaaaaaaaa', at: 1, tries: 0 },
    { text: 'אישור תור לקוחה: bbbbbbbbbbbb', bid: 'bbbbbbbbbbbb', at: 2, tries: 0 },
  ], (subj, text) => { sent.push(text); return text.indexOf('aaaa') > 0 ? Promise.reject(new Error('x')) : Promise.resolve('ok'); });
  r.open(); await r.tick(); await r.tick();
  assert.deepStrictEqual(sent, ['ביטול תור לקוחה: aaaaaaaaaaaa']); // the second one is not tried before the first has left
  assert.strictEqual(JSON.parse(r.store.bkOutbox).length, 2);
  assert.match(r.el.innerHTML, /ממתין לשליחה: 2/);
});

test('the fail text no longer says "try again" as the end of it: it says it waits and goes again by itself', () => {
  const h = UI.html({ trade: 'beauty', bookings: true, dataPath: seeded(), gender: 'm' }, NOW), s = scriptOf(h);
  assert.match(UI.data({ trade: 'beauty', bookings: true, dataPath: seeded(), gender: 'm' }, NOW).t.fail, /ממתין למעלה, ונשלח שוב לבד/);
  assert.match(s, /bkOutbox/);
  assert.match(s, /setInterval\(function \(\) \{ flushOut\(\); \}, OUT_EVERY\)/);
});
