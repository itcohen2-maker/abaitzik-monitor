'use strict';
// 12.11.2026, Itzik: "📤 הודעות לשליחה" (lib/sendlist.js, lib/sendlist-ui.js). The monitor prepares the messages, he sends them.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.MONITOR_NO_GATE = '1';
const S = require('../lib/sendlist.js');
const ui = require('../lib/sendlist-ui.js');
const { renderPage } = require('../build.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sendlist-')); }
function put(d, name, o) {
  const f = path.join(S.dirOf(d), name + '.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(o));
}
const NOW = Date.parse('2026-11-12T12:00:00+03:00');
const list = (id, extra) => Object.assign({ id, at: '2026-11-12T10:00:00+03:00', title: 'ללקוחות', items: [
  { name: 'דנה', phone: '052-123-4567', text: 'שלום דנה, יש לי הצעה' },
  { name: 'יוסי', phone: '+972 50 765 4321', text: 'היי יוסי' },
] }, extra || {});

test('normalizePhone: Israeli forms all become 9725XXXXXXXX', () => {
  ['0521234567', '052-123 4567', '+972521234567', '972521234567', '00972521234567', '+972 (0) 52 123 4567', '521234567']
    .forEach((p) => assert.deepStrictEqual(S.normalizePhone(p), { ok: true, phone: '972521234567' }, p));
});

test('normalizePhone: another country keeps digits only, junk is bad', () => {
  assert.deepStrictEqual(S.normalizePhone('+1 (415) 555 2671'), { ok: true, phone: '14155552671' });
  assert.deepStrictEqual(S.normalizePhone('0044 20 7946 0958'), { ok: true, phone: '442079460958' });
  ['', 'abc', '12345', '0212345678', '+972 3 123 4567', '4155552671', null].forEach((p) => assert.strictEqual(S.normalizePhone(p).ok, false, String(p)));
});

test('waLink: wa.me with the text encoded', () => {
  assert.strictEqual(S.waLink('972521234567', 'היי & שלום?'), 'https://wa.me/972521234567?text=' + encodeURIComponent('היי & שלום?'));
  assert.ok(!/[ &?]/.test(S.waLink('972521234567', 'a b&c').split('?text=')[1]));
});

test('maskPhone: only the ends show', () => {
  assert.strictEqual(S.maskPhone('972521234567'), '052 XXX 4567');
  assert.strictEqual(S.maskPhone('14155552671'), '+141 XXX 671');
});

test('validate: 200 items and 1500 characters are the limits, and a bad phone is named', () => {
  const ok = { title: 't', items: Array.from({ length: 200 }, (_, i) => ({ name: 'n' + i, phone: '0521234567', text: 'x'.repeat(1500) })) };
  assert.deepStrictEqual(S.validate(ok), []);
  const many = { title: 't', items: ok.items.concat([{ name: 'x', phone: '0521234567', text: 'y' }]) };
  assert.ok(S.validate(many).some((e) => /200/.test(e)));
  const long = { title: 't', items: [{ name: 'a', phone: '0521234567', text: 'x'.repeat(1501) }] };
  assert.ok(S.validate(long).some((e) => /1500/.test(e)));
  const bad = { title: 't', items: [{ name: 'a', phone: '123', text: 'x' }] };
  assert.ok(S.validate(bad).some((e) => /phone/.test(e)));
  assert.ok(S.validate({ title: '', items: [] }).length >= 2);
});

test('forPage: newest first, phones normalized with a link, a bad phone keeps its row, no dashes', () => {
  const d = tmp();
  put(d, '20261110-0900-old', list('20261110-0900-old', { at: '2026-11-10T09:00:00+03:00', title: 'ישנה - מאוד' }));
  put(d, '20261112-1000-new', list('20261112-1000-new', { items: [
    { name: 'בן-ציון', phone: '052-123-4567', text: 'שלום' },
    { name: 'בלי מספר', phone: 'abc', text: 'שלום' },
  ] }));
  const r = S.forPage(d, NOW);
  assert.deepStrictEqual(r.map((x) => x.id), ['20261112-1000-new', '20261110-0900-old']);
  assert.strictEqual(r[0].items[0].link, 'https://wa.me/972521234567?text=' + encodeURIComponent('שלום'));
  assert.strictEqual(r[0].items[0].phoneMask, '052 XXX 4567');
  assert.strictEqual(r[0].items[1].bad, true);
  assert.strictEqual(r[0].items[1].link, '');
  assert.strictEqual(r[0].unsent, 1);
  assert.ok(!/[-–—]/.test(r[1].title + r[0].items[0].name));
});

test('forPage: a list older than 30 days leaves the payload, the file stays', () => {
  const d = tmp();
  put(d, '20261001-0900-x', list('20261001-0900-x', { at: '2026-10-01T09:00:00+03:00' }));
  put(d, '20261020-0900-y', list('20261020-0900-y', { at: '2026-10-20T09:00:00+03:00' }));
  assert.deepStrictEqual(S.forPage(d, NOW).map((x) => x.id), ['20261020-0900-y']);
  assert.strictEqual(fs.readdirSync(S.dirOf(d)).length, 2);
});

test('forPage: clamps to 200 items and 1500 characters', () => {
  const d = tmp();
  put(d, '20261112-1000-big', { id: '20261112-1000-big', at: '2026-11-12T10:00:00+03:00', title: 'big', items: Array.from({ length: 210 }, () => ({ name: 'a', phone: '0521234567', text: 'x'.repeat(1600) })) });
  const r = S.forPage(d, NOW)[0];
  assert.strictEqual(r.items.length, 200);
  assert.strictEqual(r.items[0].text.length, 1500);
});

test('forPage: nothing there, or a broken file, is an empty list', () => {
  const d = tmp();
  assert.deepStrictEqual(S.forPage(d, NOW), []);
  fs.mkdirSync(S.dirOf(d), { recursive: true });
  fs.writeFileSync(path.join(S.dirOf(d), 'x.json'), '{nope');
  assert.deepStrictEqual(S.forPage(d, NOW), []);
});

test('listener mark line: parseMark and markSent write sentAt into the file, once', () => {
  assert.deepStrictEqual(S.parseMark('📤 נשלח: 20261112-1000-new 3'), { listId: '20261112-1000-new', idx: 3 });
  assert.deepStrictEqual(S.parseMark('משימה 📤 נשלח: a-b 0'), { listId: 'a-b', idx: 0 });
  assert.strictEqual(S.parseMark('📤 נשלח: ../x 1'), null);
  assert.strictEqual(S.parseMark('שלום'), null);
  const d = tmp();
  put(d, '20261112-1000-new', list('20261112-1000-new'));
  assert.strictEqual(S.markSent(d, '20261112-1000-new', 1, '2026-11-12T11:00:00.000Z'), true);
  assert.strictEqual(S.markSent(d, '20261112-1000-new', 1), false);
  assert.strictEqual(S.markSent(d, '20261112-1000-new', 9), false);
  assert.strictEqual(S.markSent(d, '../evil', 0), false);
  const f = JSON.parse(fs.readFileSync(path.join(S.dirOf(d), '20261112-1000-new.json'), 'utf8'));
  assert.strictEqual(f.items[1].sentAt, '2026-11-12T11:00:00.000Z');
  assert.strictEqual(f.items[0].sentAt, undefined);
  assert.strictEqual(S.forPage(d, NOW)[0].sent, 1);
});

test('listener: listen.js handles the line before any session sees it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'listen.js'), 'utf8');
  assert.ok(/parseMark\(text\.replace/.test(src) && /markSent\(inst\.dataPath/.test(src));
});

test('add: writes a checked file with an id from the time and slug, refuses a bad list', () => {
  const d = tmp();
  const r = S.add(d, { title: 'ללקוחות', items: [{ name: 'דנה', phone: '0521234567', text: 'היי' }] }, 'Clients Nov');
  assert.strictEqual(r.ok, true);
  assert.ok(/^\d{8}-\d{4}-clients-nov$/.test(r.id));
  assert.strictEqual(S.forPage(d, Date.now()).length, 1);
  assert.strictEqual(S.add(d, { title: 'x', items: [] }).ok, false);
});

// Runs the module script with stubs for the page globals.
function page(lists, stored) {
  const store = Object.assign({}, stored ? { sendSent: JSON.stringify(stored) } : {});
  const tile = { hidden: true, cls: new Set(), classList: { add(c) { tile.cls.add(c); }, remove(c) { tile.cls.delete(c); } }, b: { textContent: '' }, sm: { textContent: '' },
    querySelector(s) { return s === 'b' ? tile.b : tile.sm; } };
  const sent = [];
  const document = { getElementById: (id) => (id === 'gSend' ? tile : null) };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const sendText = (a, b) => { sent.push(b); return Promise.resolve(); };
  const api = new Function('D', 'document', 'localStorage', 'esc', 'sendText', 'toast', 'on',
    ui.js + '\nreturn {sdPaint:sdPaint,sdMark:sdMark,sdHtml:sdHtml,sdMarks:sdMarks};')({ sendlist: lists }, document, localStorage, esc, sendText, () => {}, () => {});
  return { tile, api, sent, store };
}
const L = (extra) => Object.assign({ id: 'l1', title: 'ללקוחות', total: 2, items: [
  { i: 0, name: 'דנה', phoneMask: '052 XXX 4567', text: 'היי דנה', link: 'https://wa.me/972521234567?text=x', bad: false, sentAt: '' },
  { i: 1, name: 'יוסי', phoneMask: '050 XXX 4321', text: 'היי יוסי', link: 'https://wa.me/972507654321?text=y', bad: false, sentAt: '' },
] }, extra || {});

test('page: the tile and the sheet are in the built page, Itzik and a customer', () => {
  const base = { now: null, openCmds: [], builtAt: '2026-11-12T10:00:00.000Z', counts: { pending: 0, replied: 0, today: 0, leads: 0 }, choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [] };
  const html = renderPage(base);
  assert.ok(/id="gSend" hidden data-new="1"/.test(html), 'tile hidden and new');
  assert.ok(html.includes('function sdSheet') && html.includes("['sendlist',"));
  assert.ok(html.includes('ההודעות יוצאות מהוואטסאפ שלך, בשם שלך. לחיצה פותחת את הצ׳אט עם ההודעה מוכנה, ואתה לוחץ שלח.'));
  assert.ok(html.includes('לשלוח בוואטסאפ') && html.includes('העתקה'));
});

test('page: no lists, the tile stays hidden with no alert', () => {
  const p = page([]);
  p.api.sdPaint();
  assert.strictEqual(p.tile.hidden, true);
  assert.ok(!p.tile.cls.has('taskblink'));
});

test('page: an unsent row shows the tile with the shared alert (taskblink = alertfade)', () => {
  const p = page([L()]);
  p.api.sdPaint();
  assert.strictEqual(p.tile.hidden, false);
  assert.ok(p.tile.cls.has('taskblink'));
  assert.ok(/2/.test(p.tile.b.textContent));
  const css = renderPage({ now: null, openCmds: [], builtAt: 'x', counts: {}, choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [] });
  assert.ok(css.includes('.gt.updblink::before,.gt.taskblink::before') && css.includes('animation:alertfade 3.4s'));
});

test('page: every row sent (server mark or this phone) hides the tile and the alert', () => {
  const server = page([L({ items: L().items.map((x) => Object.assign({}, x, { sentAt: '2026-11-12T10:00:00Z' })) })]);
  server.api.sdPaint();
  assert.strictEqual(server.tile.hidden, true);
  const local = page([L()], { 'l1:0': 1, 'l1:1': 0 });
  local.api.sdPaint();
  assert.strictEqual(local.tile.hidden, true);
  assert.ok(!local.tile.cls.has('taskblink'));
});

test('page: a bad phone is not counted as waiting; a row with no valid number has no send button', () => {
  const bad = L({ items: [{ i: 0, name: 'אין', phoneMask: '', text: 'היי', link: '', bad: true, sentAt: '' }] });
  const p = page([bad]);
  p.api.sdPaint();
  assert.strictEqual(p.tile.hidden, true);
  const h = p.api.sdHtml([bad], {});
  assert.ok(!/sdGo/.test(h) && /העתקה/.test(h));
});

test('page: a tap marks the row on the phone and reports "📤 נשלח: <list> <idx>"', async () => {
  const p = page([L()]);
  p.api.sdMark('l1', 1);
  assert.strictEqual(p.api.sdMarks()['l1:1'], 0);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepStrictEqual(p.sent, ['📤 נשלח: l1 1']);
  assert.strictEqual(p.api.sdMarks()['l1:1'], 1);
  const h = p.api.sdHtml([L()], p.api.sdMarks());
  assert.ok(/sdDone/.test(h) && /✓ /.test(h));
  assert.ok(/href="https:\/\/wa\.me\/972521234567\?text=x"[^>]*target="_blank"/.test(h));
});

test('page: no dashes in the visible copy of the sheet', () => {
  const h = ui.js.match(/ההודעות[^']*/g).join(' ') + ' ' + [...ui.js.matchAll(/'([^']*[א-ת][^']*)'/g)].map((m) => m[1]).join(' ');
  assert.ok(!/[-–—]/.test(h.replace(/data-[a-z]+/g, '')), h.match(/.{0,20}[-–—].{0,20}/));
});
