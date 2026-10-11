'use strict';
// Synthetic rows only: this repository is public and the real shipments file
// is the customer's. The real file is checked on the server, never committed.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../lib/ship-rules.js');

const TODAY = '2026-10-06';
const SUP = { KAPOOR: { days: 5 }, JEFF: { days: 10 } };
const row = (o) => Object.assign({ id: String(o.po) + 'x', po: '6001', supplier: 'JEFF', product: 'p', status: '', retd: '', etd: '', eta: '', customs: '' }, o);
const codes = (rows) => R.evaluate(rows, TODAY, SUP).map((a) => a.code + ':' + a.level);

test('arrival passed and not in stock is red', () => {
  assert.deepStrictEqual(codes([row({ eta: '2026-09-14', etd: '2026-07-01', customs: '1', status: 'שלחתי ניירת' })]), ['ETA_PASSED:red']);
});
test('a row that is in stock or cancelled raises nothing', () => {
  assert.deepStrictEqual(codes([row({ eta: '2026-01-01', status: 'במלאי' }), row({ po: '6002', eta: '2026-01-01', status: 'הזמנה מבוטלת' })]), []);
});
test('no customs file within two weeks of arrival: red, and not beyond that', () => {
  assert.deepStrictEqual(codes([row({ eta: '2026-10-12', etd: '2026-09-01', status: 'Goods On Board' })]), ['NO_SHO:red']);
  assert.deepStrictEqual(codes([row({ eta: '2026-12-12', etd: '2026-11-01', status: 'Goods On Board' })]), []);
  assert.deepStrictEqual(codes([row({ eta: '2026-10-12', etd: '2026-09-01', customs: '62450536', status: 'Goods On Board' })]), []);
});
test('booking: ten days for China, five for India, red once the date passed', () => {
  assert.deepStrictEqual(codes([row({ etd: '2026-10-14', eta: '2026-12-01' })]), ['NO_BOOKING:amber']);
  assert.deepStrictEqual(codes([row({ etd: '2026-10-14', eta: '2026-12-01', supplier: 'Kapoor' })]), []);
  assert.deepStrictEqual(codes([row({ etd: '2026-10-10', eta: '2026-12-01', supplier: 'Kapoor' })]), ['NO_BOOKING:amber']);
  assert.deepStrictEqual(codes([row({ etd: '2026-09-29', eta: '2026-12-01' })]), ['NO_BOOKING:red']);
  assert.deepStrictEqual(codes([row({ etd: '2026-10-14', eta: '2026-12-01', status: 'BOOKING CONFIRM' })]), []);
});
test('a deliberate hold on the booking is not an alert', () => {
  assert.deepStrictEqual(codes([row({ etd: '2026-09-29', eta: '2026-12-01', status: 'לא לאשר בוקינג' })]), []);
});
test('departure more than three weeks after the requested date', () => {
  assert.deepStrictEqual(codes([row({ retd: '2026-07-10', etd: '2026-12-14', eta: '2027-02-01', status: 'BOOKING CONFIRM' })]), ['ETD_SLIP:amber']);
  assert.deepStrictEqual(codes([row({ retd: '2026-12-01', etd: '2026-12-14', eta: '2027-02-01', status: 'BOOKING CONFIRM' })]), []);
});
test('an order starting with 7 is Shufersal: tracked, never red', () => {
  assert.deepStrictEqual(codes([row({ po: '7146', eta: '2026-09-14', etd: '2026-07-01', customs: '1', status: 'שלחתי ניירת' })]), ['ETA_PASSED:track']);
});
test('no departure and no arrival means not approved yet, not an error', () => {
  assert.deepStrictEqual(codes([row({ po: '7190' }), row({ po: '7191', status: 'נשלחה ניירת ללקוחה' })]), []);
});
test('a postponed season is left alone', () => {
  assert.deepStrictEqual(codes([row({ etd: '2026-09-01', eta: '2026-09-20', status: 'סחורה לא עברה בקרת איכות ועברה לעונה הבאה' })]), []);
});
test('series numbering is not a duplicate: only the same id counts', () => {
  const a = row({ po: '6107', product: 'מגבות 3/3', eta: '2026-09-14', customs: '1', id: '6107|2026|a' });
  const b = row({ po: '6167', product: 'מגבות 3/3', eta: '2026-12-14', customs: '', id: '6167|2026|a' });
  assert.deepStrictEqual(R.evaluate([a, b], TODAY, SUP).map((x) => x.po), ['6107']);
});
test('summary counts each row once, at its worst level', () => {
  const rows = [row({ eta: '2026-09-14', customs: '1', id: 'a', po: '6003' }), row({ po: '6004', id: 'b', etd: '2026-10-10', eta: '2026-12-01' }), row({ po: '6005', id: 'c', etd: '2026-12-01', eta: '2027-02-01', status: 'BOOKING CONFIRM' })];
  const s = R.summary(rows, R.evaluate(rows, TODAY, SUP), TODAY);
  assert.deepStrictEqual([s.open, s.red, s.amber, s.green], [3, 1, 1, 1]);
});
test('insights rank suppliers by average slip', () => {
  const rows = [row({ retd: '2026-01-01', etd: '2026-03-01' }), row({ retd: '2026-01-01', etd: '2026-02-01', po: '2' }), row({ supplier: 'SARA', retd: '2026-01-01', etd: '2026-01-05', po: '3' }), row({ supplier: 'SARA', retd: '2026-01-01', etd: '2026-01-03', po: '4' })];
  const i = R.insights(rows);
  assert.strictEqual(i[0].supplier, 'JEFF');
  assert.strictEqual(i[0].overThreeWeeks, 2);
});
test('insights merge the spellings of one supplier', () => {
  const rows = [row({ supplier: 'Shari', retd: '2026-01-01', etd: '2026-03-01' }), row({ supplier: 'SHARI', retd: '2026-01-01', etd: '2026-03-01', po: '2' })];
  const i = R.insights(rows);
  assert.strictEqual(i.length, 1);
  assert.strictEqual(i[0].orders, 2);
});

test('handled hides the same alert only, and for seven days at most', () => {
  const rows = [row({ po: '6201', eta: '2026-09-14', customs: '1', id: 'h1' }), row({ po: '6202', eta: '2026-09-20', customs: '1', id: 'h2' })];
  const al = R.evaluate(rows, TODAY, SUP);
  const h = { 'h1|ETA_PASSED': { id: 'h1', code: 'ETA_PASSED', at: '2026-10-05T09:00:00Z' } };
  assert.deepStrictEqual(R.applyHandled(al, h, TODAY).map((a) => a.id), ['h2']);
  // another code on the same row is not hidden
  assert.strictEqual(R.applyHandled(al, { 'h1|NO_SHO': { id: 'h1', code: 'NO_SHO', at: '2026-10-05' } }, TODAY).length, 2);
  // a week and a day later it is back
  assert.strictEqual(R.applyHandled(al, h, '2026-10-13').length, 2);
  assert.strictEqual(R.applyHandled(al, null, TODAY).length, 2);
});

test('ship-done writes only an alert that exists today', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { shipDone } = require('../tools/ship-done.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-'));
  fs.writeFileSync(path.join(dir, 'rows.json'), JSON.stringify([row({ po: '6201', eta: '2026-09-14', customs: '1', id: '6201|2026|a' })]));
  const now = new Date('2026-10-06T09:00:00Z');
  assert.throws(() => shipDone(dir, '6201|2026|a', 'NO_SHO', 'yael', now));
  assert.throws(() => shipDone(dir, 'nope', 'ETA_PASSED', 'yael', now));
  shipDone(dir, '6201|2026|a', 'ETA_PASSED', 'yael', now);
  const h = JSON.parse(fs.readFileSync(path.join(dir, 'handled.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(h), ['6201|2026|a|ETA_PASSED']);
  assert.strictEqual(R.applyHandled(R.evaluate(JSON.parse(fs.readFileSync(path.join(dir, 'rows.json'), 'utf8')), TODAY, SUP), h, TODAY).length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ship-undo takes back a mark, and only a mark that exists', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { shipDone, shipUndo } = require('../tools/ship-done.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-'));
  fs.writeFileSync(path.join(dir, 'rows.json'), JSON.stringify([row({ po: '6201', eta: '2026-09-14', customs: '1', id: '6201|2026|a' })]));
  const now = new Date('2026-10-06T09:00:00Z');
  assert.throws(() => shipUndo(dir, '6201|2026|a', 'ETA_PASSED'));
  shipDone(dir, '6201|2026|a', 'ETA_PASSED', 'yael', now);
  assert.strictEqual(shipUndo(dir, '6201|2026|a', 'ETA_PASSED').po, '6201, JEFF');
  const h = JSON.parse(fs.readFileSync(path.join(dir, 'handled.json'), 'utf8'));
  assert.deepStrictEqual(h, {});
  assert.strictEqual(R.applyHandled(R.evaluate(JSON.parse(fs.readFileSync(path.join(dir, 'rows.json'), 'utf8')), TODAY, SUP), h, TODAY).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
