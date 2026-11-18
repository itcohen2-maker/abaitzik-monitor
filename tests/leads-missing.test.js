'use strict';
// 18.11.2026: "מה חסר לך כאן?" at the bottom of a customer's leads board (lib/leads-missing.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LM = require('../lib/leads-missing.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lm-'));

test('parse: the line the page sends, after its kind line, and nothing else', () => {
  assert.deepEqual(LM.parse('ליד\nלוח לידים: חסר עמודה של סכום'), { t: 'עמודה של סכום' });
  assert.deepEqual(LM.parse('לוח לידים: חסר   עמודה \t של  סכום  '), { t: 'עמודה של סכום' });
  assert.equal(LM.parse('לוח לידים: חסר '), null, 'empty');
  assert.equal(LM.parse('ליד [biz-1]: הערה לוח לידים: חסר משהו'), null, 'only a line of its own');
  assert.equal(LM.parse('ליד [biz-1]: הערה משהו'), null);
  assert.equal(LM.parse(''), null);
  assert.equal(LM.parse('לוח לידים: חסר ' + 'א'.repeat(500)).t.length, 300, 'at most 300');
});

test('record: the customer side keeps it in his status folder, readable, and never more than 200', () => {
  const d = tmp();
  const e = LM.record(d, 'עמודה\u0007 של סכום', Date.parse('2026-11-18T18:00:00Z'));
  assert.equal(e.t, 'עמודה של סכום', 'control characters out');
  const f = path.join(d, 'status', 'leads-missing.json');
  const L = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(L.length, 1);
  assert.equal(L[0].at, '2026-11-18T18:00:00.000Z');
  assert.equal(fs.statSync(f).mode & 0o777, 0o644, "Itzik's process reads it");
  assert.throws(() => LM.record(d, '   '));
  for (let i = 0; i < 210; i++) LM.record(d, 'שורה ' + i, Date.parse('2026-11-18T18:00:00Z') + i + 1);
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).length, 200);
});

test("collect: every new line is one idea in Itzik's ideas and one WhatsApp line, once", () => {
  const owner = tmp(), tdir = tmp();
  const tdata = path.join(tdir, 'data');
  LM.record(tdata, 'עמודה של סכום', Date.parse('2026-11-18T18:00:00Z'));
  LM.record(tdata, 'סינון לפי עיר', Date.parse('2026-11-18T18:01:00Z'));
  const T = { id: 't94a54d', dir: tdir, name: 'חן נעים' };
  const out = LM.collect(owner, T, Date.parse('2026-11-18T18:02:00Z'));
  assert.deepEqual(out, ['💡 חן נעים בלוח הלידים: חסר לו: עמודה של סכום', '💡 חן נעים בלוח הלידים: חסר לו: סינון לפי עיר']);
  const dir = path.join(owner, 'better', 'better');
  const ideas = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.equal(ideas.length, 2);
  ideas.forEach((x) => {
    assert.equal(x.by, 'tenant:t94a54d');
    assert.equal(x.area, 'לידים');
    assert.equal(x.size, '', 'no size: improve.js never builds a customer text by itself');
    assert.ok(x.at && x.t.startsWith('בלוח הלידים חסר: ') && x.d.startsWith('חן נעים כתב'));
  });
  assert.deepEqual(LM.collect(owner, T), [], 'handed over once');
  LM.record(tdata, 'עוד משהו', Date.parse('2026-11-18T18:03:00Z'));
  assert.deepEqual(LM.collect(owner, T), ['💡 חן נעים בלוח הלידים: חסר לו: עוד משהו']);
  assert.equal(fs.readdirSync(dir).length, 3);
});

test('collect: a customer file is data: cleaned, cut, and a bad id or a missing file is nothing', () => {
  const owner = tmp(), tdir = tmp();
  fs.mkdirSync(path.join(tdir, 'data', 'status'), { recursive: true });
  fs.writeFileSync(path.join(tdir, 'data', 'status', 'leads-missing.json'), JSON.stringify([
    { id: '../../x', t: 'שורה\nשנייה ' + 'ב'.repeat(400) }, { id: 'a2' }, 'junk', null,
  ]));
  const out = LM.collect(owner, { id: 'ily', dir: tdir, name: 'איליי' });
  assert.equal(out.length, 1);
  assert.ok(!out[0].includes('\n'));
  assert.ok(out[0].length <= '💡 איליי בלוח הלידים: חסר לו: '.length + 300);
  fs.readdirSync(path.join(owner, 'better', 'better')).forEach((f) => assert.ok(!f.includes('/') && !f.includes('..'), f));
  assert.deepEqual(LM.collect(owner, { id: '../x', dir: tdir }), []);
  assert.deepEqual(LM.collect(owner, { id: 'nobody', dir: tmp() }), []);
  assert.deepEqual(LM.collect(owner, { id: 'x' }), []);
});

test('the listener and the health check are wired to it', () => {
  const L = fs.readFileSync(path.join(__dirname, '..', 'listen.js'), 'utf8');
  const i = L.indexOf("require('./lib/leads-missing.js').parse("), j = L.indexOf("require('./lib/leads.js').parse(");
  assert.ok(i > 0 && j > i, 'the missing line is caught before the leads actions');
  assert.ok(/inst\.name !== 'abaitzik' && require\('\.\/lib\/leads-missing\.js'\)\.parse\(/.test(L), 'a customer only');
  assert.ok(L.includes("'תודה, העברתי ל"), 'he is answered');
  assert.ok(/codeOk && \(inst\.biz \|\| inst\.name !== 'abaitzik'\) && require\('\.\/lib\/leads\.js'\)\.parse\(/.test(L), "a customer's board actions are applied too");
  const H = fs.readFileSync(path.join(__dirname, '..', 'tenants-health.js'), 'utf8');
  assert.ok(H.includes("require('./lib/leads-missing.js').collect(inst.dataPath"), 'Itzik collects them');
  assert.ok(H.includes("require('./lib/wa-out.js').sendOwner(inst.dataPath"), 'and hears on WhatsApp');
});
