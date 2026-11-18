'use strict';
process.env.MONITOR_NO_GATE = '1';
// 18.11.2026: leads board (Monday style). Task 2: the lead fields reach the page. Task 3: the board's display.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { bizRow, renderPage } = require('../build.js');

test('bizRow: site, next and nextAt of a lead reach D.biz', () => {
  const row = bizRow({ id: 'l1', name: 'ערן', site: 'https://eran.co.il', next: 'להתקשר', nextAt: '2026-11-19T09:00:00.000Z', secret: 'x' });
  assert.equal(row.site, 'https://eran.co.il');
  assert.equal(row.next, 'להתקשר');
  assert.equal(row.nextAt, '2026-11-19T09:00:00.000Z');
  assert.equal(row.secret, undefined);
});

/*
  Task 3. The board is page code that runs only when the 🔔 sheet opens, so the test runs it the cheap way:
  the leads part of bizSheet (from "var LD_SRC=" to "function itsHtml(){") is cut out of the real renderPage
  output and evaluated with stubs for recs, D, esc, bzTel and BZ_ORDER (as lead-delete.test.js does with leadDelAsk).
  The customer copy goes through build.js's own cutFor, lifted as owner-cut.test.js lifts it.
*/
const SRC = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
const cut = new Function(SRC.slice(SRC.indexOf('function jsStandIns('), SRC.indexOf('// 22.10, Itzik: the lecture tile')) + '; return cutFor;')();
const page = (biz) => renderPage({ now: null, openCmds: [], builtAt: '2026-11-18T10:00:00.000Z', counts: { pending: 0, replied: 0, today: 0, leads: 0 }, choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [], biz: biz || [] });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bzTel = (p) => { const d = String(p || '').replace(/[^0-9+]/g, ''); return d ? '<a href="tel:' + esc(d) + '">' + esc(p) + '</a>' : ''; };
const ORDER = ['חדש', 'בשיחה', 'הצעה', 'נסגר', 'אבד'];
function leadsPart(html) {
  const i = html.indexOf('var LD_SRC=');
  const j = html.indexOf('function itsHtml(){', i);
  assert.ok(i > 0 && j > i, 'the leads part is in the page');
  return html.slice(i, j);
}
function load(html, recs) {
  const fn = new Function('recs', 'D', 'esc', 'bzTel', 'BZ_ORDER', 'window', leadsPart(html)
    + '\n;return {board:typeof ldBoardHtml==="function"?ldBoardHtml:null,table:itsLeadsHtml,flag:typeof LD_BOARD==="undefined"?undefined:LD_BOARD,main:typeof ldMain==="function"?ldMain:null};');
  return fn(recs, { biz: recs }, esc, bzTel, ORDER, {});
}
const itzik = (recs) => load(cut({ name: 'abaitzik' }, page(recs)), recs);
const groups = (h) => {
  const o = {};
  h.split('<details class="lbGrp').slice(1).forEach((s) => { o[/data-g="([^"]+)"/.exec(s)[1]] = s; });
  return o;
};
const todayPart = (h) => { const i = h.indexOf('class="lbToday'); assert.ok(i > 0, 'there is a ⏰ היום part'); return h.slice(i, h.indexOf('<details class="lbGrp', i)); };

const L = [
  { id: 'biz-1', kind: 'lead', name: 'דנה חדשה', phone: '050-1111111', status: 'חדש', at: '2026-11-18T08:00:00.000Z', source: 'signup', nextAt: '2020-01-01T08:00:00.000Z', next: 'להתקשר אליה', note: '17.11: דיברנו קצת' + String.fromCharCode(10) + '18.11: שלחתי הצעה', site: 'https://eran.co.il' },
  { id: 'biz-2', kind: 'lead', name: 'יוסי בשיחה', phone: '0522222222', status: 'בשיחה', at: '2026-11-17T08:00:00.000Z', source: 'site', nextAt: '2099-01-01T08:00:00.000Z', site: 'javascript:alert(1)' },
  { id: 'biz-3', kind: 'customer', name: 'רונית נסגר', status: 'נסגר', at: '2026-11-16T08:00:00.000Z', source: 'manual', nextAt: '2099-05-05', site: '"><img src=x onerror=alert(1)>' },
  { id: 'biz-4', kind: 'lead', name: 'משה מוזר', status: 'xyz', at: '2026-11-15T08:00:00.000Z', source: 'fb-comment', nextAt: '2020-02-02' },
  { id: 'biz-5', kind: 'lead', name: 'איציק בדיקה', status: 'חדש', at: '2026-11-14T08:00:00.000Z', source: 'site', test: true },
];

test('board: five groups by stage, an unknown status sits in חדש, נסגר and אבד are shut', () => {
  const B = itzik(L);
  assert.equal(B.flag, true, 'LD_BOARD is on in his copy');
  assert.equal(typeof B.board, 'function');
  const h = B.board();
  assert.equal(h.split('<details class="lbGrp').length - 1, 5);
  const g = groups(h);
  assert.deepEqual(Object.keys(g), ORDER);
  assert.ok(g['חדש'].includes('data-id="biz-4"'), 'xyz is in חדש');
  assert.ok(g['חדש'].includes('data-id="biz-1"'));
  assert.ok(g['בשיחה'].includes('data-id="biz-2"'));
  assert.ok(g['נסגר'].includes('data-id="biz-3"'));
  assert.ok(/^ lbShut"/.test(g['נסגר']) && /^ lbShut"/.test(g['אבד']), 'נסגר and אבד are marked lbShut');
  assert.ok(!g['נסגר'].slice(0, 80).includes(' open') && !g['אבד'].slice(0, 80).includes(' open'), 'shut groups are closed');
  assert.ok(!/^ lbShut/.test(g['חדש']) && g['חדש'].slice(0, 80).includes(' open'), 'open stages are open');
});

test('board: a passed reminder (also a date only one) is in ⏰ היום, a future one is not', () => {
  const t = todayPart(itzik(L).board());
  assert.ok(t.includes('data-id="biz-1"'), 'nextAt in 2020');
  assert.ok(t.includes('data-id="biz-4"'), 'date only nextAt in 2020');
  assert.ok(!t.includes('data-id="biz-2"'), 'nextAt in 2099');
  assert.ok(!t.includes('data-id="biz-3"'), 'date only nextAt in 2099');
});

test('board: the site is a safe link, a bad site is never a link', () => {
  const h = itzik(L).board();
  assert.ok(h.includes('<a href="https://eran.co.il" target="_blank" rel="noopener"'));
  assert.ok(!h.includes('href="javascript'));
  assert.ok(!h.includes('<img src=x'));
});

test('board: the DOM hooks of Task 4 are there on every row', () => {
  const h = itzik(L).board();
  const rows = h.split('<details class="lbRow ldRow').slice(1);
  assert.equal(rows.length, 5 + 2, 'every lead in its group, and the two due ones again in ⏰ היום');
  rows.forEach((r) => {
    assert.ok(/^[^>]*data-id="biz-[0-9]"[^>]*data-n="[^"]+"/.test(r), 'data-id and data-n');
    ['class="lbSt ldSt" data-s="', 'class="lbNext', 'class="lbSite', 'class="lbRem', 'data-bz="ldsend"', 'data-bz="lddel"', 'data-bz="ldcopy"'].forEach((k) => assert.ok(r.includes(k), k));
  });
  assert.ok(h.includes('class="lbFlt"') && ['all', 'signup', 'other'].every((f) => h.includes('data-f="' + f + '"')));
  assert.ok(h.includes('class="lbQ"'));
  const g = groups(h);
  assert.ok(g['חדש'].includes('class="lbSt ldSt" data-s="חדש">חדש<'), 'xyz shows as חדש');
  assert.ok(/ldTest/.test(g['חדש']) && g['חדש'].includes('בדיקה שלך'), 'the test lead is greyed and tagged');
});

test('board: a test lead is not counted, the history is newest first', () => {
  const h = itzik(L).board();
  assert.ok(h.includes('כל הלידים (4, 2 חדשים)'), 'the counter');
  const g = groups(h);
  assert.ok(g['חדש'].slice(0, g['חדש'].indexOf('</summary>')).includes('(2)'), 'חדש counts 2 (biz-1 and biz-4, not the test)');
  const r = h.slice(h.indexOf('data-id="biz-1"', h.indexOf('<details class="lbGrp')));
  assert.ok(r.indexOf('18.11: שלחתי הצעה') < r.indexOf('17.11: דיברנו קצת'), 'newest note first');
  assert.ok(r.slice(0, r.indexOf('</summary>')).includes('18.11: שלחתי הצעה'), 'the last note is on the row');
});

test('board: zero leads opens with "עוד אין לידים", 300 leads open with no error', () => {
  const B = itzik([]);
  assert.ok(B.board().includes('עוד אין לידים'));
  const many = [];
  for (let i = 0; i < 300; i++) many.push({ id: 'biz-' + i, kind: 'lead', name: 'ליד ' + i, status: ORDER[i % 6] || 'zz', at: '2026-11-1' + (i % 9) + 'T08:00:00.000Z', nextAt: i % 3 ? '' : '2020-01-01' });
  const h = itzik(many).board();
  assert.equal(h.split('<details class="lbRow ldRow').length - 1, 300 + 100 - many.filter((r, i) => i % 3 === 0 && (r.status === 'נסגר' || r.status === 'אבד')).length);
});

test("board: the switch is his only; a customer copy has no ldBoardHtml and keeps the old table", () => {
  const html = page(L);
  const own = cut({ name: 'abaitzik' }, html);
  assert.ok(own.includes('function ldBoardHtml('));
  const cust = cut({ name: 'ily' }, html);
  assert.ok(!cust.includes('ldBoardHtml'), 'no ldBoardHtml in a customer copy');
  assert.ok(!cust.includes('LD_BOARD=true'));
  assert.ok(!cust.includes('.lbGrp'), 'the board CSS is cut too');
  const B = load(cust, L);
  assert.equal(B.flag, false);
  assert.equal(B.board, null);
  assert.equal(B.main, B.table, 'the sheet calls the old table');
  assert.ok(B.table().includes('class="ldTbl"'));
  const O = load(own, L);
  assert.equal(O.main, O.board, 'his sheet calls the board');
});

test('the old table and the board share one lead body (ldBodyHtml), not two copies', () => {
  const part = leadsPart(cut({ name: 'abaitzik' }, page(L)));
  assert.ok(/function ldBodyHtml\(/.test(part));
  assert.equal(part.split('data-bz="ldsend"').length - 1, 1, 'the note box is written once');
  assert.equal(part.split('📤 להעביר בוואטסאפ').length - 1, 1, 'the forward button is written once');
  const t = itzik(L).table();
  assert.ok(t.includes('data-bz="ldsend"') && t.includes('class="ldTbl"'));
});
