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

// 18.11.2026, final review of the leads board.
test('review 1: cancelled and replaced reminders do not fill the 200 slots; a deleted lead\'s alarm is marked cancelled', () => {
  const d = tmp();
  try {
    const r = mk(d);
    for (let i = 0; i < 201; i++) {
      const hh = String(10 + (i % 12)).padStart(2, '0'), dd = String(19 + Math.floor(i / 12) % 9).padStart(2, '0');
      assert.ok(L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-' + dd + ' ' + hh + ':00', NOW).ok, 'cycle ' + i);
    }
    const plain = A.add(d, '2026-11-25 09:00', 'תזכיר לי', NOW);
    assert.strictEqual(plain.ok, true, plain.why);
    assert.strictEqual(A.isOpen({ cancelledAt: 'x' }), false);
    assert.strictEqual(A.isOpen({ doneAt: 'x' }), false);
    assert.strictEqual(A.isOpen({ due: 'x' }), true);
    // a deleted lead: tick marks its alarm cancelled, so it stops counting
    const g = mk(d, { name: 'דני' });
    L.apply(d, 'ליד [' + g.id + ']: תזכורת 2026-11-30 09:00', NOW);
    fs.unlinkSync(path.join(d, 'biz', 'biz', g.id + '.json'));
    A.tick(d, NOW, { push() {}, wa() {} });
    assert.ok(A.list(d).find((a) => a.lead === g.id).cancelledAt);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('review 2: נסגר, אבד and a "לא מעוניין" note clear nextAt', () => {
  for (const act of ['סטטוס נסגר', 'סטטוס אבד', 'הערה לא מעוניין']) {
    const d = tmp();
    try {
      const r = mk(d);
      L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-19 09:00', NOW);
      L.apply(d, 'ליד [' + r.id + ']: ' + act, NOW);
      assert.strictEqual(L.readAll(d)[0].nextAt, '', act);
      assert.strictEqual(open(d).length, 0, act);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  }
});

test('review 4: a lead reminder goes out once with ⏰, in the exact format', () => {
  const d = tmp();
  try {
    const r = mk(d);
    L.apply(d, 'ליד [' + r.id + ']: צעד להציע דמו', NOW);
    L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-19 09:00', NOW);
    const sent = [];
    A.tick(d, Date.parse('2026-11-19T07:01:00Z'), { push() {}, wa(t) { sent.push(t); } });
    assert.deepStrictEqual(sent, ['⏰ ערן: להציע דמו · 0501234567']);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('review 5: a new next step updates the text of the open reminder', () => {
  const d = tmp();
  try {
    const r = mk(d);
    L.apply(d, 'ליד [' + r.id + ']: צעד להציע דמו', NOW);
    L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-19 09:00', NOW);
    L.apply(d, 'ליד [' + r.id + ']: צעד לשלוח הצעת מחיר', NOW);
    assert.strictEqual(open(d)[0].text, '⏰ ערן: לשלוח הצעת מחיר · 0501234567');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('review 6: snooze from WhatsApp moves the lead\'s nextAt; a deleted lead is not written back', () => {
  const d = tmp();
  try {
    const r = mk(d);
    L.apply(d, 'ליד [' + r.id + ']: תזכורת 2026-11-19 09:00', NOW);
    const T = Date.parse('2026-11-19T07:01:00Z');
    A.tick(d, T, { push() {}, wa() {} });
    const a = A.list(d).find((x) => x.lead === r.id);
    const h = A.act(d, a.id, '1h', T);
    assert.ok(h.ok);
    assert.strictEqual(L.readAll(d)[0].nextAt, new Date(T + 3600e3).toISOString());
    const g = mk(d, { name: 'דני' });
    L.apply(d, 'ליד [' + g.id + ']: תזכורת 2026-11-19 09:00', NOW);
    const b = A.list(d).find((x) => x.lead === g.id);
    fs.unlinkSync(path.join(d, 'biz', 'biz', g.id + '.json'));
    assert.ok(A.act(d, b.id, 'tom', T).ok);
    assert.ok(!fs.existsSync(path.join(d, 'biz', 'biz', g.id + '.json')));
    // a lead closed after the reminder went out keeps an empty nextAt when the old message is snoozed
    L.apply(d, 'ליד [' + r.id + ']: סטטוס נסגר', T);
    assert.ok(A.act(d, h.id, 'tom', T).ok);
    assert.strictEqual(L.readAll(d).find((x) => x.id === r.id).nextAt, '');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('25.11: a trial signup is created with no "לחזור מחר", every other lead keeps it', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-'));
  const a = L.addFound(d, { src: 'signup', key: 'signup:t1', name: 'נרשם', phone: '0501234567', at: '2026-11-24T22:26:00.000Z' });
  const b = L.addFound(d, { src: 'whatsapp', key: 'wa:1', name: 'פונה', phone: '0507654321', at: '2026-11-24T22:26:00.000Z' });
  assert.strictEqual(a.next, ''); assert.strictEqual(a.nextAt, '');
  assert.strictEqual(b.next, 'לחזור מחר'); assert.ok(b.nextAt);
});
