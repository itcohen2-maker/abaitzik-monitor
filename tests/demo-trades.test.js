'use strict';
// 21.11.2026: the other trade demos (beauty, consult, photo), built from one maker (lib/demo-trades/make.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const trades = require('../lib/trades.js');
const TC = require('../lib/trade-cards.js');
const NOW = Date.parse('2026-11-21T22:30:00Z'); // 00:30 in Israel, the night build
const BAD = /[‐–—]|שולמן|פבלו|איליי|אלון|רינת|אמינוב|יהודה|שחר|יניב|נחמן|יואל|גיתית|לולוס|פגסוס|סלינדה|הום סטייל|איציק|יצחק|מספר[הת]|תספורת/;
const IDS = ['beauty', 'consult', 'photo'];
const read = (d, rel) => JSON.parse(fs.readFileSync(path.join(d, rel), 'utf8'));
function seeded(id) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-' + id + '-')); require('../lib/demo-trades/' + id + '.js').seed(d, NOW); return d; }
function allFiles(d) { const out = []; (function walk(x) { for (const f of fs.readdirSync(x)) { const p = path.join(x, f); if (fs.statSync(p).isDirectory()) walk(p); else out.push(p); } })(d); return out; }

for (const id of IDS) {
  test(id + ': a full day on the ring, invented data only, its own words', () => {
    const t = trades.get(id);
    assert.ok(t, 'trade ' + id);
    const M = require('../lib/demo-trades/' + id + '.js');
    const d = seeded(id);
    const items = TC.dayItems(d, NOW);
    assert.ok(items.length >= 3, 'day items ' + items.length);
    assert.ok(items.every((x) => x.m >= 360 && x.m < 1200), 'inside 06:00 to 20:00');
    for (const f of allFiles(d)) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), BAD, f);
    const c = M.context(NOW);
    assert.ok(c.includes(M.BIZ.name));
    assert.doesNotMatch(c, BAD);
    assert.strictEqual(read(d, 'conn/partner.json').pageName, M.BIZ.name);
    const h = TC.html({ trade: id, dataPath: d, publicDemo: true }, NOW);
    assert.match(h, /id="tradeRing"/);
    assert.match(h, /id="tradeWa"/);
    assert.doesNotMatch(h, BAD);
    assert.ok(t.did.length >= 3 && t.wa.length >= 3);
  });
}

test('beauty speaks to her in the feminine; no reminders or confirmations are promised yet (phase 2)', () => {
  const h = TC.html({ trade: 'beauty', dataPath: seeded('beauty'), publicDemo: true, gender: 'f' }, NOW); // demo-build.sh sets the demo's gender
  assert.match(h, /דברי/);
  assert.match(h, /כשתרצי\./);
  assert.match(h, /תשלומים: /);
  assert.doesNotMatch(h, /אישור הגעה|תזכורת לתור/);
});

test('consult: recorded meetings with a summary, decisions and tasks', () => {
  const m = read(seeded('consult'), 'biz-home/meetings.json');
  assert.ok(m.length >= 2);
  for (const x of m) { assert.ok(x.summary && x.decisions.length && x.tasksMe.length && x.next); }
});

test('photo: deposits and contracts wait, quotes not signed', () => {
  const d = seeded('photo');
  assert.ok(read(d, 'biz-home/quotes.json').filter((q) => !q.signed).length >= 2);
  assert.ok(read(d, 'money/money.json').debtors.length >= 2);
});

test('the gypsum home is unchanged by the feminine and the labels', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-g-')); require('../lib/demo-trades/gypsum.js').seed(d, NOW);
  const h = TC.html({ trade: 'gypsum', dataPath: d, publicDemo: true }, NOW);
  assert.match(h, /גבייה: <u[^>]*>3 תזכורות מוכנות<\/u>, כשתרצה\./);
  assert.match(h, /<b>דבר<\/b>/);
});

test('the wording follows what the customer said, not the trade (Itzik 21.11: a man can be a cosmetician)', () => {
  const d = seeded('beauty');
  const man = TC.html({ trade: 'beauty', dataPath: d, gender: '' }, NOW);
  assert.match(man, /<b>דבר<\/b>/);
  assert.match(man, /כשתרצה\./);
  const g = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gf-')); require('../lib/demo-trades/gypsum.js').seed(g, NOW);
  const woman = TC.html({ trade: 'gypsum', dataPath: g, gender: 'f' }, NOW);
  assert.match(woman, /<b>דברי<\/b>/);
  assert.match(woman, /כשתרצי\./);
});

// 21.11.2026: the monitor is the cosmetician's appointments diary (lib/bookings.js), the demo is built from it
test('beauty: bookings, the ring and the events come from one store; the three who did not come back', () => {
  const B = require('../lib/bookings.js');
  const d = seeded('beauty');
  const cfg = B.loadConfig(d);
  assert.deepStrictEqual(cfg.services.map((x) => [x.name, x.minutes, x.price]), [['עיצוב גבות', 20, 80], ['טיפול פנים', 60, 320], ['אנטי אייג׳ינג', 75, 450], ['פילינג', 60, 380]]);
  for (let d = 0; d < 7; d++) assert.deepStrictEqual(cfg.hours[d], [['09:00', '18:00']], 'the demo is open every day: ' + d);
  const ev = read(d, 'biz-home/events.json');
  assert.ok(ev.length >= 6 && ev.every((e) => e.src === 'booking'));
  assert.ok(ev.some((e) => e.title === 'עיצוב גבות: דנה פרץ'));
  assert.deepStrictEqual(B.lapsed(d, 8, NOW).map((x) => x.name).sort(), ['יעל שגיא', 'נועה ברק', 'שירן אוחיון'].sort());
  assert.ok(B.list(d, { from: '2026-11-22', to: '2026-11-22' }).length >= 3);
  assert.ok(trades.get('beauty').bookings === true);
  for (const id of ['gypsum', 'consult', 'photo']) assert.ok(!trades.get(id).bookings, id);
  assert.doesNotMatch(JSON.stringify(trades.get('beauty')) + require('../lib/demo-trades/beauty.js').context(NOW), /מערכת התורים שלך נשארת|מערכת תורים משלה|לא מחליף אותה/);
});
