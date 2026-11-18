'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../lib/leads.js');

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
