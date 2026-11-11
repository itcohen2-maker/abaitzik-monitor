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
