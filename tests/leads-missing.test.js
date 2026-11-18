'use strict';
process.env.MONITOR_NO_GATE = '1'; // the 💡 screen test below loads build.js
// 18.11.2026: "מה חסר לך כאן?" at the bottom of a customer's leads board (lib/leads-missing.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LM = require('../lib/leads-missing.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lm-'));
const T0 = Date.parse('2026-11-18T10:00:00Z');
const ideasIn = (owner) => { const d = path.join(owner, 'better', 'better'); try { return fs.readdirSync(d).map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))); } catch (e) { return []; } };
// one run of the health check: collect, then every line "reaches" Itzik
const run = (owner, T, now) => { const g = LM.collect(owner, T, now); g.items.forEach((it) => LM.done(owner, T, it, now)); return g; };

test('parse: only the line the button sends, as the first content line (after the "ליד" kind line)', () => {
  assert.deepEqual(LM.parse('ליד\nלוח לידים: חסר עמודה של סכום\n\nקוד 1234'), { t: 'עמודה של סכום' });
  assert.deepEqual(LM.parse('לוח לידים: חסר   עמודה \t של  סכום  '), { t: 'עמודה של סכום' });
  assert.equal(LM.parse('לוח לידים: חסר '), null, 'empty');
  assert.equal(LM.parse('ליד [biz-1]: הערה לוח לידים: חסר משהו'), null, 'not inside a line');
  assert.equal(LM.parse('ליד\nליד [biz-1]: הערה משהו\nלוח לידים: חסר משהו'), null, 'not a line further down');
  assert.equal(LM.parse('משימה\nתסדר את זה\nלוח לידים: חסר משהו'), null, 'not under another first line');
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

test('collect and done: a line is an idea and handed over only once it reached Itzik, and only once', () => {
  const owner = tmp(), tdir = tmp(), tdata = path.join(tdir, 'data');
  LM.record(tdata, 'עמודה של סכום', T0);
  LM.record(tdata, 'סינון לפי עיר', T0 + 1000);
  const T = { id: 't94a54d', dir: tdir, name: 'חן נעים' };
  const g = LM.collect(owner, T, T0 + 2000);
  assert.deepEqual(g.items.map((x) => x.line), ['💡 חן נעים בלוח הלידים: חסר לו: עמודה של סכום', '💡 חן נעים בלוח הלידים: חסר לו: סינון לפי עיר']);
  assert.equal(ideasIn(owner).length, 0, 'nothing is an idea before it reached him');
  // WhatsApp and the push both failed for the second: it comes again next run
  LM.done(owner, T, g.items[0], T0 + 3000);
  assert.deepEqual(LM.collect(owner, T, T0 + 60000).items.map((x) => x.t), ['סינון לפי עיר'], 'not handed over: tried again');
  run(owner, T, T0 + 60000);
  assert.deepEqual(LM.collect(owner, T, T0 + 120000).items, [], 'handed over once');
  const ideas = ideasIn(owner);
  assert.equal(ideas.length, 2);
  ideas.forEach((x) => {
    assert.equal(x.by, 'tenant:t94a54d');
    assert.equal(x.area, 'לידים');
    assert.equal(x.size, '', 'no size: improve.js never builds a customer text by itself');
    assert.ok(x.at && x.t.startsWith('בלוח הלידים חסר: ') && x.d.startsWith('חן נעים כתב'));
  });
});

test('caps: 3 a run and 10 an Israel day per customer, the rest waits; a file over 64KB is not read', () => {
  const owner = tmp(), tdir = tmp(), tdata = path.join(tdir, 'data');
  for (let i = 0; i < 200; i++) LM.record(tdata, 'הצפה ' + i, T0 + i);
  const T = { id: 'flood', dir: tdir, name: 'לקוח' };
  let total = 0;
  for (let r = 0; r < 10; r++) {
    const g = run(owner, T, T0 + 60000 * (r + 1));
    assert.ok(g.items.length <= 3, 'at most 3 a run');
    total += g.items.length;
    if (r === 0) assert.equal(g.held, 197, 'the rest is held, counted for one log line');
  }
  assert.equal(total, 10, 'at most 10 a day');
  assert.equal(ideasIn(owner).length, 10);
  // 10.11 21:59Z is still the same Israel day as 10:00Z? no: 22:00Z is 00:00 in Israel, a new day
  const late = Date.parse('2026-11-18T21:50:00Z'), next = Date.parse('2026-11-18T22:05:00Z');
  assert.equal(run(owner, T, late).items.length, 0, 'same Israel day: nothing more');
  assert.equal(run(owner, T, next).items.length, 3, 'a new Israel day opens again');
  // another customer has his own count
  const t2 = tmp(); LM.record(path.join(t2, 'data'), 'שלי', T0);
  assert.equal(run(owner, { id: 'other', dir: t2, name: 'ב' }, late).items.length, 1);
  // a big file is not read at all
  const t3 = tmp(); fs.mkdirSync(path.join(t3, 'data', 'status'), { recursive: true });
  fs.writeFileSync(path.join(t3, 'data', 'status', 'leads-missing.json'), JSON.stringify([{ id: 'a1', t: 'x'.repeat(70 * 1024) }]));
  const g3 = LM.collect(owner, { id: 'big', dir: t3, name: 'ג' }, T0);
  assert.deepEqual([g3.items.length, g3.why], [0, 'big']);
});

test('collect: a customer file is data: cleaned, cut, and a bad id or a missing file is nothing', () => {
  const owner = tmp(), tdir = tmp();
  fs.mkdirSync(path.join(tdir, 'data', 'status'), { recursive: true });
  fs.writeFileSync(path.join(tdir, 'data', 'status', 'leads-missing.json'), JSON.stringify([
    { id: '../../x', t: 'שורה\nשנייה ' + 'ב'.repeat(400) }, { id: 'a2' }, 'junk', null,
  ]));
  const T = { id: 'ily', dir: tdir, name: 'איליי' };
  const g = run(owner, T, T0);
  assert.equal(g.items.length, 1);
  assert.ok(!g.items[0].line.includes('\n'));
  assert.ok(g.items[0].line.length <= '💡 איליי בלוח הלידים: חסר לו: '.length + 300);
  fs.readdirSync(path.join(owner, 'better', 'better')).forEach((f) => assert.ok(!f.includes('/') && !f.includes('..'), f));
  assert.deepEqual(LM.collect(owner, { id: '../x', dir: tdir }).items, []);
  assert.deepEqual(LM.collect(owner, { id: 'nobody', dir: tmp() }).items, []);
  assert.deepEqual(LM.collect(owner, { id: 'x' }).items, []);
});

test('the listener and the health check are wired to it', () => {
  const L = fs.readFileSync(path.join(__dirname, '..', 'listen.js'), 'utf8');
  const i = L.indexOf("require('./lib/leads-missing.js').parse("), j = L.indexOf("require('./lib/leads.js').parse(");
  assert.ok(i > 0 && j > i, 'the missing line is caught before the leads actions');
  assert.ok(/inst\.name !== 'abaitzik' && !inst\.publicDemo && require\('\.\/lib\/leads-missing\.js'\)\.parse\(/.test(L), 'a customer only, never the public demo');
  const blk = L.slice(i, j);
  assert.ok(blk.includes('if (lmOk) fs.unlinkSync(path.join(CHAT, name));'), 'silent when it worked (the page thanked him)');
  assert.ok(!blk.includes('תודה') && !/העברתי ל /.test(L), 'no second thanks, no stray space');
  assert.ok(/codeOk && \(inst\.biz \|\| inst\.name !== 'abaitzik'\) && require\('\.\/lib\/leads\.js'\)\.parse\(/.test(L), "a customer's board actions are applied too");
  const H = fs.readFileSync(path.join(__dirname, '..', 'tenants-health.js'), 'utf8');
  const h = H.slice(H.indexOf("require('./lib/leads-missing.js')"));
  assert.ok(H.includes('LM.collect(inst.dataPath, T)'), 'Itzik collects them');
  assert.ok(h.includes("require('./lib/wa-out.js').sendOwner(inst.dataPath, it.line)"), 'and hears on WhatsApp');
  assert.ok(/\.then\(\(\) => \{ LM\.done\(inst\.dataPath, T, it\)/.test(h), 'handed over only after WhatsApp or the push went');
  assert.ok(H.includes('if (!(ij && ij.publicDemo))'), 'never a public demo');
});

// Review 18.11: build.js turned every `by` that is not radar or pains into "review", so a customer's idea showed as
// "🔍 בודק השיפורים". betterBy keeps "tenant:<id>", and the 💡 screen (renderIdeas, page code) says "💬 לקוח כתב".
test('the 💡 screen shows a customer idea as a customer idea', () => {
  const { betterBy, renderPage } = require('../build.js');
  assert.equal(betterBy('tenant:t94a54d'), 'tenant:t94a54d');
  assert.equal(betterBy('tenant:../x'), 'review', 'an id only');
  assert.equal(betterBy('pains'), 'pains');
  assert.equal(betterBy('radar'), 'radar');
  assert.equal(betterBy(undefined), 'review');
  const html = renderPage({ now: null, openCmds: [], builtAt: '2026-11-18T10:00:00.000Z', counts: { pending: 0, replied: 0, today: 0, leads: 0 }, choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [], biz: [] });
  const i = html.indexOf('function renderIdeas(){');
  assert.ok(i > 0, 'renderIdeas is in the page');
  const src = html.slice(i, html.indexOf('\n}\n', i) + 2);
  const list = { innerHTML: '' };
  const doc = { getElementById: (id) => (id === 'ideaList' ? list : null), querySelectorAll: () => [] };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = { better: [
    { by: betterBy('tenant:t94a54d'), t: 'בלוח הלידים חסר: עמודה', d: 'חן כתב', at: '2026-11-18T10:00:00Z' },
    { by: betterBy('review'), t: 'שיפור של הבודק', d: 'x', at: '2026-11-18T10:00:00Z' },
  ] };
  new Function('D', 'document', 'esc', 'ideaDone', 'stamp', 'dwRe', 'IDEAS', 'var IDEAS_SHOWN=[];' + src + ';renderIdeas();')(D, doc, esc, () => [], () => '18.11', () => {}, []);
  const h = list.innerHTML;
  const cust = h.slice(0, h.indexOf('בלוח הלידים חסר: עמודה'));
  assert.ok(cust.lastIndexOf('💬 לקוח כתב') > cust.lastIndexOf('class="idea"'), 'the customer idea carries the customer tag: ' + h.slice(0, 400));
  const rev = h.slice(0, h.indexOf('שיפור של הבודק'));
  assert.ok(rev.lastIndexOf('🔍 בודק השיפורים') > rev.lastIndexOf('class="idea"'), 'the reviewer keeps its tag');
});
