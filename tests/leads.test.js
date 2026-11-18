'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../lib/leads.js');
const A = require('../lib/alarms.js');

function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-')); return d; }

test('parse reads the page line after the kind line', () => {
  assert.deepStrictEqual(L.parse('ליד\nליד [biz-1-site]: סטטוס בשיחה'), { id: 'biz-1-site', act: 'סטטוס', arg: 'בשיחה' });
  assert.strictEqual(L.parse('ליד חדש: משה'), null);
});

test('found lead is added once, status, note and delete apply', () => {
  const d = tmp();
  try {
    const f = { src: 'fb-comment', key: 'c:1', name: 'ערן', text: 'פרטים', at: '2026-11-10T17:17:00Z' };
    const r = L.addFound(d, f);
    assert.ok(r && r.status === 'חדש' && r.last === 'פרטים');
    assert.strictEqual(L.addFound(d, f), null);
    assert.ok(L.apply(d, 'ליד [' + r.id + ']: סטטוס בשיחה').ok);
    assert.ok(L.apply(d, 'ליד [' + r.id + ']: הערה שלחתי הודעה').ok);
    const back = L.readAll(d)[0];
    assert.strictEqual(back.status, 'בשיחה');
    assert.match(back.note, /שלחתי הודעה/);
    assert.ok(!L.apply(d, 'ליד [' + r.id + ']: סטטוס משהו').ok);
    assert.ok(L.apply(d, 'ליד [' + r.id + ']: מחיקה').ok);
    assert.strictEqual(L.readAll(d).length, 0);
    assert.strictEqual(fs.readdirSync(path.join(d, 'biz', '_deleted')).length, 1);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test("a note asking to remove the lead removes it, not interested closes it", () => {
  const d = tmp();
  try {
    const a = L.addFound(d, { src: "site", key: "s:1", name: "משה", text: "x" });
    const b = L.addFound(d, { src: "site", key: "s:2", name: "הידי", text: "y" });
    assert.ok(L.apply(d, "ליד [" + a.id + "]: הערה תסיר אותו מפה").ok);
    assert.ok(L.apply(d, "ליד [" + b.id + "]: הערה לא מעוניין").ok);
    assert.ok(L.apply(d, "ליד [" + b.id + "]: הערה טום יוריד לו מחיר").ok);
    const left = L.readAll(d);
    assert.strictEqual(left.length, 1);
    assert.strictEqual(left[0].status, "אבד");
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test("a note on a new lead moves it to בשיחה, a note on a closed lead keeps its status", () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, "biz", "biz"), { recursive: true });
  const rec = { id: "biz-20261113202225-site", kind: "lead", name: "בדיקה", status: "חדש", note: "", at: "2026-11-13T20:22:25.923Z", source: "site" };
  fs.writeFileSync(path.join(d, "biz", "biz", rec.id + ".json"), JSON.stringify(rec));
  assert.ok(L.apply(d, "ליד [" + rec.id + "]: הערה לא הרגישה טוב. נקבע לדבר שוב").ok);
  const back = JSON.parse(fs.readFileSync(path.join(d, "biz", "biz", rec.id + ".json"), "utf8"));
  assert.strictEqual(back.status, "בשיחה");
  assert.match(back.note, /נקבע לדבר שוב/);
  // a note on a lead already נסגר keeps its status
  rec.status = "נסגר"; fs.writeFileSync(path.join(d, "biz", "biz", rec.id + ".json"), JSON.stringify(rec));
  assert.ok(L.apply(d, "ליד [" + rec.id + "]: הערה תודה").ok);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, "biz", "biz", rec.id + ".json"), "utf8")).status, "נסגר");
});

// 18.11.2026: leads board server actions: next step, site, reminder.
const NOW = Date.parse('2026-11-18T10:00:00Z');
function mk(d, extra) { return L.addFound(d, Object.assign({ src: 'site', key: 's:' + Math.random(), name: 'ערן', text: 'x', phone: '0501234567' }, extra || {})); }
function open(d) { return A.list(d).filter((a) => !a.cancelledAt && !a.sentAt); }

test('צעד sets the next step', () => {
  const d = tmp();
  try {
    const r = mk(d);
    const x = L.apply(d, 'ליד [' + r.id + ']: צעד להתקשר ולהציע דמו', NOW);
    assert.ok(x.ok);
    assert.strictEqual(L.readAll(d)[0].next, 'להתקשר ולהציע דמו');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('normSite accepts only http(s) hosts', () => {
  assert.strictEqual(L.normSite('eran.co.il'), 'https://eran.co.il');
  assert.strictEqual(L.normSite('http://a.com/x'), 'http://a.com/x');
  assert.strictEqual(L.normSite('javascript:alert(1)'), '');
  assert.strictEqual(L.normSite('"><img src=x onerror=1>'), '');
});

test('אתר saves, rejects bad input, clears on ביטול', () => {
  const d = tmp();
  try {
    const r = mk(d);
    assert.ok(L.apply(d, 'ליד [' + r.id + ']: אתר eran.co.il', NOW).ok);
    assert.strictEqual(L.readAll(d)[0].site, 'https://eran.co.il');
    assert.strictEqual(L.apply(d, 'ליד [' + r.id + ']: אתר javascript:x', NOW).ok, false);
    assert.strictEqual(L.readAll(d)[0].site, 'https://eran.co.il');
    const c = L.apply(d, 'ליד [' + r.id + ']: אתר ביטול', NOW);
    assert.ok(c.ok); assert.strictEqual(c.site, '');
    assert.strictEqual(L.readAll(d)[0].site, '');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('תזכורת creates one open alarm per lead, ביטול clears it', () => {
  const d = tmp();
  try {
    const r = mk(d);
    L.apply(d, 'ליד [' + r.id + ']: צעד להציע דמו', NOW);
    const x = L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-19 09:00', NOW);
    assert.ok(x.ok); assert.strictEqual(x.nextAt, '2026-11-19T07:00:00.000Z');
    assert.strictEqual(L.readAll(d)[0].nextAt, '2026-11-19T07:00:00.000Z');
    const al = A.list(d);
    assert.strictEqual(al.length, 1);
    assert.strictEqual(al[0].lead, r.id);
    assert.ok(al[0].text.includes('ערן') && al[0].text.includes('להציע דמו') && al[0].text.includes('0501234567'));
    assert.ok(L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-20 09:00', NOW).ok);
    assert.strictEqual(open(d).length, 1);
    assert.strictEqual(open(d)[0].due, '2026-11-20T07:00:00.000Z');
    assert.strictEqual(L.apply(d, 'ליד [' + r.id + ']: תזכורת בלי זמן', NOW).ok, false);
    const c = L.apply(d, 'ליד [' + r.id + ']: תזכורת ביטול', NOW);
    assert.ok(c.ok); assert.strictEqual(c.nextAt, '');
    assert.strictEqual(open(d).length, 0);
    assert.strictEqual(L.readAll(d)[0].nextAt, '');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('a past reminder time fails and keeps the old reminder', () => {
  const d = tmp();
  try {
    const r = mk(d);
    L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-19 09:00', NOW);
    assert.strictEqual(L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-01 09:00', NOW).ok, false);
    assert.strictEqual(open(d).length, 1);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('נסגר, אבד and מחיקה cancel the reminder, הערה does not', () => {
  for (const act of ['סטטוס נסגר', 'סטטוס אבד', 'מחיקה']) {
    const d = tmp();
    try {
      const r = mk(d);
      L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-19 09:00', NOW);
      assert.strictEqual(open(d).length, 1);
      L.apply(d, 'ליד [' + r.id + ']: ' + act, NOW);
      assert.strictEqual(open(d).length, 0, act);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  }
  const d = tmp();
  try {
    const r = mk(d);
    L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-19 09:00', NOW);
    L.apply(d, 'ליד [' + r.id + ']: הערה דיברנו', NOW);
    assert.strictEqual(open(d).length, 1);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('tick skips cancelled alarms and alarms of a deleted lead', () => {
  const d = tmp();
  try {
    const live = mk(d), gone = mk(d, { name: 'דני' }), canc = mk(d, { name: 'רון' });
    for (const r of [live, gone, canc]) L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-19 09:00', NOW);
    A.cancelLead(d, canc.id, NOW);
    const del = path.join(d, 'biz', '_deleted'); fs.mkdirSync(del, { recursive: true });
    fs.renameSync(path.join(d, 'biz', 'biz', gone.id + '.json'), path.join(del, gone.id + '.json'));
    const sent = [];
    const out = A.tick(d, Date.parse('2026-11-19T07:01:00Z'), { push() {}, wa(t) { sent.push(t); } });
    assert.strictEqual(out.length, 1);
    assert.ok(sent[0].includes('ערן'));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
