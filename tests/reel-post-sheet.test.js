process.env.MONITOR_NO_GATE = '1';
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { renderPage } = require('../build.js');
const fixture = () => ({ now: null, openCmds: [], builtAt: '2026-10-11T08:00:00.000Z', counts: { pending: 0, replied: 0, today: 0, leads: 0 }, choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [] });

// 11.10, Itzik: the פרסום files could not be copied on the iPhone. Each one
// now opens a sheet with a caption box and a copy button per network.
const html = renderPage(fixture({}));
const src = html.slice(html.indexOf('var POSTS=null;'), html.indexOf("on('gReels',reelSheet);"));
const posts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'files-private', 'reel-posts.json'), 'utf8'));
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (x) => x.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

function harness() {
  const copied = [], opened = [], timers = [];
  let sheet = null;
  const mk = () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, remove() { if (sheet === this) sheet = null; }, select() {}, setSelectionRange() {}, focus() {} });
  const ctx = {
    esc, GKEY: {}, fileEntry: () => ({ n: 'reel-posts.json' }),
    fileBlob: () => Promise.resolve({ text: () => Promise.resolve(JSON.stringify(posts)) }),
    fileOpen: (n) => opened.push(n),
    setTimeout: (f, ms) => timers.push([f, ms]),
    navigator: {},
    document: {
      getElementById: () => null, createElement: () => { const e = mk(); return e; },
      body: { appendChild(e) { if (e.id === 'postSheet') sheet = e; }, removeChild() {} },
      addEventListener() {}, removeEventListener() {},
      execCommand: (c) => { copied.push(ctx.__ta); return true; },
    },
  };
  ctx.document.execCommand = () => { copied.push(ctx.__last); return true; };
  const baseCreate = ctx.document.createElement;
  ctx.document.createElement = (t) => { const e = baseCreate(t); if (t === 'textarea') ctx.__ta = e; return e; };
  const origAppend = ctx.document.body.appendChild;
  ctx.document.body.appendChild = (e) => { if (e === ctx.__ta) ctx.__last = e.value; origAppend(e); };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx, copied, opened, timers, sheet: () => sheet };
}
const flush = () => new Promise((r) => setImmediate(r));
function buttons(h) {
  return [...h.matchAll(/<button type="button" class="([^"]*)" data-i="(\d+)" data-l="([^"]*)">([^<]*)<\/button>/g)]
    .map((m) => ({ cls: m[1], i: m[2], label: unesc(m[4]) }));
}
function tap(h, b) {
  const el = { textContent: b.label, classList: { add() {}, remove() {} }, getAttribute: (k) => ({ 'data-i': b.i, 'data-l': b.label })[k] ?? null };
  h.sheet().onclick({ target: el });
  return el;
}

for (const num of ['05', '06']) {
  test(`${num} פרסום opens a sheet with every copy button and the right text`, async () => {
    const h = harness();
    const d = posts[num];
    vm.runInContext(`postSheet({n:'${num} פרסום',r:'x-post.txt'})`, h.ctx);
    await flush(); await flush();
    const sheet = h.sheet();
    assert.ok(sheet, 'sheet is drawn');
    const inner = sheet.innerHTML;
    assert.ok(inner.includes(`<b>${num} פרסום</b>`));
    for (const t of ['אינסטגרם', 'טיקטוק', 'יוטיוב שורטס', 'את השיר מוסיפים רק דרך כפתור הצליל באפליקציה', 'שיר 15 עד 20 אחוז, צליל מקורי 100', 'הטקסט המלא']) assert.ok(inner.includes(t), t);
    for (const f of ['ig', 'tt', 'yt', 'ytd', 'song']) assert.ok(inner.includes(esc(d[f])), f + ' text shown');
    const bs = buttons(inner);
    const labels = bs.map((b) => b.label);
    for (const l of ['📋 העתקה לאינסטגרם', '📋 העתקה לטיקטוק', '📋 העתקת כותרת', '📋 העתקת תיאור', 'העתקת שם השיר']) assert.ok(labels.includes(l), l);
    assert.equal(labels.includes('📋 העתקת התגובה'), !!d.pin, 'pin button only when there is a pin');
    if (d.spare) assert.ok(inner.includes('אם השיר לא נמצא: ' + esc(d.spare)));
    // every button copies exactly its own text, synchronously inside the tap
    const want = { '📋 העתקה לאינסטגרם': d.ig, '📋 העתקה לטיקטוק': d.tt, '📋 העתקת כותרת': d.yt, '📋 העתקת תיאור': d.ytd, '📋 העתקת התגובה': d.pin };
    for (const b of bs) {
      h.copied.length = 0;
      const el = tap(h, b);
      assert.equal(h.copied.length, 1, 'copied in the tap itself: ' + b.label);
      assert.equal(el.textContent, 'הועתק ✓');
      if (want[b.label] !== undefined) assert.equal(h.copied[0], want[b.label], b.label);
    }
    assert.ok(h.timers.some((t) => t[1] === 2000), 'resets after two seconds');
  });
}

test('the reels list sends פרסום items to the sheet, and the full text link opens the txt', async () => {
  assert.ok(html.includes('else if(/פרסום$/.test(it.n))postSheet(it);'));
  const h = harness();
  vm.runInContext(`postSheet({n:'06 פרסום',r:'reel-06-rings-post.txt'})`, h.ctx);
  await flush(); await flush();
  h.sheet().onclick({ target: { getAttribute: (k) => (k === 'data-full' ? '1' : null) } });
  assert.deepEqual(h.opened, ['reel-06-rings-post.txt']);
});

test('a missing data file falls back to the old text viewer', async () => {
  const h = harness();
  h.ctx.fileEntry = () => null;
  vm.runInContext(`postSheet({n:'06 פרסום',r:'reel-06-rings-post.txt'})`, h.ctx);
  await flush(); await flush();
  assert.deepEqual(h.opened, ['reel-06-rings-post.txt']);
});
