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
// Task 4: E stands in for the page globals the board's handlers call (sendText, toast, leadDelAsk, the timers, Date).
function load(html, recs, E) {
  E = E || env();
  const fn = new Function('recs', 'D', 'esc', 'bzTel', 'BZ_ORDER', 'window', 'sendText', 'toast', 'leadDelAsk', 'setTimeout', 'clearTimeout', 'Date', leadsPart(html)
    + '\n;return {board:typeof ldBoardHtml==="function"?ldBoardHtml:null,table:typeof itsLeadsHtml==="function"?itsLeadsHtml:null,flag:typeof LD_BOARD==="undefined"?undefined:LD_BOARD,main:typeof ldMain==="function"?ldMain:null,'
    + 'lbWhen:typeof lbWhen==="function"?lbWhen:null,lbTap:typeof lbTap==="function"?lbTap:null,lbFilter:typeof lbFilter==="function"?lbFilter:null};');
  return fn(recs, { biz: recs }, esc, bzTel, ORDER, {}, E.sendText, E.toast, E.leadDelAsk, E.setTimeout, E.clearTimeout, E.Date);
}
function env(over) {
  const sent = [], toasts = [], tm = [];
  const E = Object.assign({
    sendText: (s, b) => { sent.push(b); return Promise.resolve('ok'); },
    toast: (t) => { toasts.push(t); },
    leadDelAsk: (n, id, after) => { after(); },
    setTimeout: (fn, ms) => { tm.push({ fn, ms, on: true }); return tm.length; },
    clearTimeout: (i) => { if (tm[i - 1]) tm[i - 1].on = false; },
    Date,
  }, over || {});
  E.sent = sent; E.toasts = toasts;
  E.tick = (ms) => tm.filter((t) => t.on && t.ms === ms).forEach((t) => { t.on = false; t.fn(); });
  return E;
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

test('board: zero leads opens with the card and ➕ להוסיף ליד, 300 leads open with no error', () => {
  const B = itzik([]);
  const e = B.board();
  assert.ok(e.includes('class="lbHi"') && e.includes('עוד אין כאן לידים'), 'the empty card');
  assert.ok(/data-bz="newtoggle">➕ להוסיף ליד</.test(e), 'its button opens the existing new lead box');
  assert.ok(e.includes('מהצ׳אט באתר ומהוואטסאפ'), 'his card names his sources');
  assert.ok(!e.includes('lbAsk'), 'no "מה חסר לך כאן?" in his copy');
  const many = [];
  for (let i = 0; i < 300; i++) many.push({ id: 'biz-' + i, kind: 'lead', name: 'ליד ' + i, status: ORDER[i % 6] || 'zz', at: '2026-11-1' + (i % 9) + 'T08:00:00.000Z', nextAt: i % 3 ? '' : '2020-01-01' });
  const h = itzik(many).board();
  assert.equal(h.split('<details class="lbRow ldRow').length - 1, 300 + 100 - many.filter((r, i) => i % 3 === 0 && (r.status === 'נסגר' || r.status === 'אבד')).length);
});

/*
  18.11.2026 evening: the board is every monitor's. The old table is gone from both copies; what stays his: the Meta
  inbox link, the scanner line, the empty card's sources, Tom in the forward button. "מה חסר לך כאן?" is a customer's only.
*/
const ily = (recs, E) => load(cut({ name: 'ily' }, page(recs)), recs, E);
test('board: a customer copy has the board, and the old table is gone from both copies', () => {
  const html = page(L);
  const own = cut({ name: 'abaitzik' }, html), cust = cut({ name: 'ily' }, html);
  for (const [who, h] of [['his', own], ['customer', cust]]) {
    assert.ok(h.includes('function ldBoardHtml('), 'ldBoardHtml: ' + who);
    assert.ok(!h.includes('itsLeadsHtml()') && !h.includes('function itsLeadsHtml'), 'no old table: ' + who);
    assert.ok(!h.includes('class="ldTbl"') && !h.includes('.ldTbl{'), 'no table markup or CSS: ' + who);
    assert.ok(!/LD_BOARD|ldMain/.test(h), 'no switch left: ' + who);
    assert.ok(h.includes('.lbGrp'), 'the board CSS: ' + who);
    assert.ok(h.includes("+ldBoardHtml()+newLeadHtml()"), 'the sheet calls the board: ' + who);
  }
  const B = ily(L);
  assert.equal(B.table, null);
  const h = B.board();
  assert.equal(h.split('<details class="lbGrp').length - 1, 5, 'five groups in a customer copy');
  assert.equal(h.split('<details class="lbRow ldRow').length - 1, 5 + 2);
});

test('board: what is his stays out of a customer copy', () => {
  const html = page(L);
  const own = cut({ name: 'abaitzik' }, html), cust = cut({ name: 'ily' }, html);
  assert.ok(own.includes('business.facebook.com/latest/inbox'), 'his Meta inbox');
  assert.ok(!cust.includes('business.facebook.com/latest/inbox'), 'no Meta inbox of his in a customer copy');
  assert.ok(!cust.includes('הסורק בודק כל 10 דקות'), 'no scanner line');
  assert.ok(!cust.includes('(טום, סוכן)') && own.includes('(טום, סוכן)'), 'Tom only in his forward button');
  assert.ok(!cust.includes('מהצ׳אט באתר ומהוואטסאפ'), 'his sources are not a customer\'s');
  const c = ily(L).board();
  assert.ok(c.includes('📤 להעביר בוואטסאפ למישהו אחר<'), 'a customer forwards to "someone else"');
  const D2 = { biz: L, leadScan: { ok: true, at: '2026-11-18T10:00:00.000Z' } };
  const fn = (h) => new Function('recs', 'D', 'esc', 'bzTel', 'BZ_ORDER', 'window', 'sendText', 'toast', 'leadDelAsk', 'setTimeout', 'clearTimeout', 'Date', leadsPart(h) + '\n;return ldBoardHtml;');
  const E = env();
  const ob = fn(own)(L, D2, esc, bzTel, ORDER, {}, E.sendText, E.toast, E.leadDelAsk, E.setTimeout, E.clearTimeout, Date)();
  const cb = fn(cust)(L, D2, esc, bzTel, ORDER, {}, E.sendText, E.toast, E.leadDelAsk, E.setTimeout, E.clearTimeout, Date)();
  assert.ok(ob.includes('הסורק בודק'), 'his board shows the scanner line');
  assert.ok(!cb.includes('הסורק'), 'a customer board never does, even with a leadScan');
});

test('board: a customer with no real lead gets the card, the add button and "מה חסר לך כאן?"', () => {
  const e = ily([]).board();
  assert.ok(e.includes('class="lbHi"') && e.includes('עוד אין כאן לידים'));
  assert.ok(e.includes('כל ליד שתכתוב או תגיד למוניטור נרשם כאן'), 'his own way in, not sources he does not have');
  assert.ok(/data-bz="newtoggle">➕ להוסיף ליד</.test(e));
  assert.ok(e.includes('class="lbAsk"') && e.includes('💡 מה חסר לך כאן?') && e.includes('data-bz="lbask"'));
  assert.ok(e.indexOf('lbHi') < e.indexOf('lbAsk'), 'the question closes the board');
  // test leads only: still the card, and the test rows under it
  const t = ily([L[4]]).board();
  assert.ok(t.includes('class="lbHi"') && t.includes('data-id="biz-5"'));
  // real leads: no card, the question at the very bottom
  const f = ily(L).board();
  assert.ok(!f.includes('class="lbHi"'));
  assert.ok(f.lastIndexOf('class="lbAsk"') > f.lastIndexOf('class="lbGrp'), 'after the groups');
  assert.ok(!f.includes('class="lbFlt"') || L.some((r) => r.source === 'signup'));
  assert.ok(!ily([L[1]]).board().includes('class="lbFlt"'), 'no trial week filter on a board with no signups');
});

test('board: "מה חסר לך כאן?" sends one line the server knows, and thanks', async () => {
  const M = mount(fx(), null, 'ily');
  const box = M.root.querySelector('.lbAsk');
  const btn = box.querySelector('[data-bz="lbask"]');
  let ev = M.tap(btn);
  assert.ok(ev.handled);
  assert.deepEqual(M.E.sent, [], 'empty: nothing goes');
  box.querySelector('.lbAskIn').value = '  עמודה   של סכום  ';
  ev = M.tap(btn);
  assert.ok(ev.handled);
  assert.deepEqual(M.E.sent, ['לוח לידים: חסר עמודה של סכום']);
  await flush();
  assert.ok(M.E.toasts.includes('תודה, העברתי לאיציק.'));
  assert.equal(box.querySelector('.lbAskIn').value, '');
  box.querySelector('.lbAskIn').value = 'א'.repeat(400);
  M.tap(btn);
  assert.equal(M.E.sent[1], 'לוח לידים: חסר ' + 'א'.repeat(300), 'cut to 300');
});

test('board: the row layout goes by the board width (container query), not the screen (18.11)', () => {
  const own = cut({ name: 'abaitzik' }, page(L));
  const css = own.slice(own.indexOf('.lbBoard{font'), own.indexOf('.lbBoard .lbSt,.lbNext,.lbRem,.lbSite{cursor:pointer}'));
  assert.ok(css.length > 100, 'the board CSS is in his copy');
  assert.ok(/\.lbBoard\{[^}]*container-type:inline-size/.test(css), 'the board is a size container');
  assert.ok(css.includes('@container (min-width:760px){'), 'the seven columns open by the board width');
  assert.ok(!/@media[^{]*\{[^@]*grid-template-columns/.test(css), 'no screen media query switches the grid');
});

test('one lead body (ldBodyHtml): the note box and the forward button are written once', () => {
  for (const who of ['abaitzik', 'ily']) {
    const part = leadsPart(cut({ name: who }, page(L)));
    assert.ok(/function ldBodyHtml\(/.test(part));
    assert.equal(part.split('data-bz="ldsend"').length - 1, 1, 'the note box is written once: ' + who);
    assert.equal(part.split('📤 להעביר בוואטסאפ').length - 1, who === 'ily' ? 1 : 2, 'the forward label: ' + who);
  }
});

/*
  Task 4: editing in the row, the reminder chips, filter and search. The handlers are page code too; they run on a
  minimal DOM written here (no DOM library in the repo): a small HTML parser for the board's own markup and the few
  DOM calls the handlers use (simple selectors, closest, classList, insertBefore, insertAdjacentHTML, cloneNode).
  An unsupported selector throws, so the stub never quietly matches what a browser would not.
*/
const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'wbr']);
const dec = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[k]));
const enc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
class El {
  constructor(tag, attrs) {
    this.tagName = tag; this.attrs = attrs || {}; this.childNodes = []; this.parentNode = null; this.data = ''; this.value = this.attrs.value || '';
    const self = this, l = () => (self.attrs.class || '').split(' ').filter(Boolean);
    this.classList = {
      contains: (c) => l().includes(c),
      add: (c) => { if (!l().includes(c)) self.attrs.class = l().concat(c).join(' '); },
      remove: (c) => { if (self.attrs.class != null) self.attrs.class = l().filter((x) => x !== c).join(' '); },
      toggle: (c, f) => { if (f === undefined) f = !l().includes(c); if (f) self.classList.add(c); else self.classList.remove(c); return f; },
    };
  }
  get children() { return this.childNodes.filter((n) => n.tagName !== '#text'); }
  getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  get textContent() { return this.tagName === '#text' ? this.data : this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; const t = new El('#text'); t.data = String(v); this.appendChild(t); }
  get innerHTML() { return this.childNodes.map(ser).join(''); }
  set innerHTML(h) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; parse(h).forEach((c) => this.appendChild(c)); }
  get outerHTML() { return ser(this); }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = this.childNodes.indexOf(ref); assert.ok(i > -1, 'insertBefore: ref is a child');
    n.parentNode = this; this.childNodes.splice(i, 0, n); return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); assert.ok(i > -1, 'removeChild: a child'); this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
  insertAdjacentHTML(pos, h) {
    const ns = parse(h);
    if (pos === 'beforeend') ns.forEach((n) => this.appendChild(n));
    else if (pos === 'afterbegin') { const f = this.childNodes[0]; ns.forEach((n) => this.insertBefore(n, f)); }
    else if (pos === 'beforebegin') ns.forEach((n) => this.parentNode.insertBefore(n, this));
    else if (pos === 'afterend') { const nx = this.nextSibling; ns.forEach((n) => this.parentNode.insertBefore(n, nx)); }
    else throw new Error('insertAdjacentHTML ' + pos);
  }
  cloneNode(deep) { const c = new El(this.tagName, Object.assign({}, this.attrs)); c.data = this.data; c.value = this.value; if (deep) this.childNodes.forEach((k) => c.appendChild(k.cloneNode(true))); return c; }
  matches(sel) { return sel.split(',').some((x) => chain(this, x.trim().split(/\s+/))); }
  closest(sel) { for (let n = this; n; n = n.parentNode) if (n.matches(sel)) return n; return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => n.children.forEach((c) => { if (c.matches(sel)) out.push(c); walk(c); }); walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() {}
  click() { this.clicked = (this.clicked || 0) + 1; }
}
function one(el, s) {
  if (/[:>~+]/.test(s)) throw new Error('stub: unsupported selector ' + s);
  if (el.tagName === '#text' || el.tagName === '#frag') return false;
  const m = /^[a-z0-9]+/i.exec(s); if (m && el.tagName !== m[0].toLowerCase()) return false;
  const re = /\.([-\w]+)|\[([-\w]+)(?:="([^"]*)"|=([^\]]*))?\]/g; let x;
  while ((x = re.exec(s))) {
    if (x[1]) { if (!el.classList.contains(x[1])) return false; continue; }
    const v = el.getAttribute(x[2]); if (v === null) return false;
    const w = x[3] !== undefined ? x[3] : x[4]; if (w !== undefined && v !== w) return false;
  }
  return true;
}
function chain(el, parts) {
  if (!one(el, parts[parts.length - 1])) return false;
  let i = parts.length - 2;
  for (let n = el.parentNode; i >= 0 && n; n = n.parentNode) if (one(n, parts[i])) i--;
  return i < 0;
}
function parse(h) {
  const root = new El('#frag'); let cur = root, m;
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  while ((m = re.exec(h))) {
    if (m[4] != null) { const t = new El('#text'); t.data = dec(m[4]); cur.appendChild(t); }
    else if (m[1]) { let n = cur; while (n !== root && n.tagName !== m[1].toLowerCase()) n = n.parentNode; if (n !== root) cur = n.parentNode; }
    else if (m[2]) {
      const a = {};
      m[3].replace(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, (z, k, x, y, w) => { a[k] = dec(x != null ? x : y != null ? y : w != null ? w : ''); return z; });
      const e = new El(m[2].toLowerCase(), a); cur.appendChild(e);
      if (!VOID.has(e.tagName)) cur = e;
    }
  }
  const out = root.childNodes.slice(); out.forEach((n) => { n.parentNode = null; }); return out;
}
function ser(n) {
  if (n.tagName === '#text') return enc(n.data);
  const a = Object.keys(n.attrs).map((k) => ' ' + k + (n.attrs[k] === '' ? '' : '="' + enc(n.attrs[k]) + '"')).join('');
  return '<' + n.tagName + a + '>' + (VOID.has(n.tagName) ? '' : n.childNodes.map(ser).join('') + '</' + n.tagName + '>');
}
const fx = () => JSON.parse(JSON.stringify(L));
const at = (iso) => { const T = Date.parse(iso); return class extends Date { static now() { return T; } }; };
const flush = () => new Promise((r) => setImmediate(r));
function mount(recs, over, who) {
  const E = env(over);
  const B = load(cut({ name: who || 'abaitzik' }, page(recs)), recs, E);
  assert.equal(typeof B.lbTap, 'function', 'lbTap is in the copy');
  const root = new El('div'); root.innerHTML = B.board();
  const tap = (n) => { assert.ok(n, 'there is something to tap'); const ev = { target: n, prevented: false, preventDefault() { this.prevented = true; } }; ev.handled = B.lbTap(ev, root); return ev; };
  const rows = (id) => root.querySelectorAll('.lbRow').filter((r) => r.getAttribute('data-id') === id);
  const grp = (g) => root.querySelector('.lbGrp[data-g="' + g + '"]');
  const gcount = (g) => grp(g).querySelector('.lbGh small').textContent;
  const today = () => root.querySelector('.lbToday');
  const shown = () => root.querySelectorAll('.lbRow').filter((r) => !r.classList.contains('lbHide')).map((r) => r.getAttribute('data-id'));
  return { B, E, root, tap, rows, grp, gcount, today, shown, recs };
}
const inGrp = (M, id) => { const r = M.rows(id).find((x) => x.parentNode.classList.contains('lbGrp')); return r && r.parentNode.getAttribute('data-g'); };
const inToday = (M, id) => M.rows(id).some((x) => x.parentNode.classList.contains('lbToday'));

test('lbWhen: the reminder chips are Israel time, whatever the device clock', () => {
  const W = itzik([]).lbWhen;
  assert.equal(typeof W, 'function');
  const a = Date.parse('2026-11-18T10:00:00Z'), b = Date.parse('2026-11-18T18:30:00Z');
  assert.equal(W('eve', a), '2026-11-18 19:00');
  assert.equal(W('tom', a), '2026-11-19 09:00');
  assert.equal(W('week', a), '2026-11-25 09:00');
  assert.equal(W('eve', b), '2026-11-19 19:00', '20:30 in Israel: 19:00 passed, so tomorrow');
  // 22:30Z on 30.11 is already 1.12 in Israel (a UTC device would still say 30.11)
  assert.equal(W('tom', Date.parse('2026-11-30T22:30:00Z')), '2026-12-02 09:00');
  assert.equal(W('eve', Date.parse('2026-11-30T22:30:00Z')), '2026-12-01 19:00');
  // a week over the night the clock goes back (25.10.2026) is still 09:00
  assert.equal(W('week', Date.parse('2026-10-24T10:00:00Z')), '2026-10-31 09:00');
  assert.equal(W('off', a), '');
});

test('board: Task 3 leftovers. ⏰ היום does not count a test lead, an unknown status gets the חדש stages, a legacy site is text', () => {
  const R = fx().concat([
    { id: 'biz-6', kind: 'lead', name: 'בדיקה עם תזכורת', status: 'חדש', at: '2026-11-13T08:00:00.000Z', test: true, nextAt: '2020-03-03' },
    { id: 'biz-7', kind: 'lead', name: 'ערן ישן', status: 'הצעה', at: '2026-11-12T08:00:00.000Z', site: 'eran.co.il' },
  ]);
  const h = itzik(R).board();
  const t = todayPart(h);
  assert.equal(t.split('<details class="lbRow').length - 1, 3, 'three rows in ⏰ היום');
  assert.ok(t.includes('⏰ היום (2)'), 'but the test lead is not counted');
  const M = mount(R);
  const r4 = M.rows('biz-4')[0], st = r4.querySelectorAll('[data-bz="ldst"]').map((b) => b.getAttribute('data-s'));
  assert.deepEqual(st, ['בשיחה', 'הצעה', 'נסגר', 'אבד'], 'xyz shows as חדש, so there is no חדש button');
  const s7 = M.rows('biz-7')[0].querySelector('.lbSite');
  assert.equal(s7.getAttribute('data-v'), 'eran.co.il', 'the old value is kept for editing');
  assert.equal(s7.querySelector('a'), null, 'not a link');
  assert.ok(s7.textContent.includes('eran.co.il'));
  const s2 = M.rows('biz-2')[0].querySelector('.lbSite');
  assert.equal(s2.querySelector('a'), null);
  assert.equal(s2.getAttribute('data-v'), 'javascript:alert(1)');
});

test('board: the next step goes to both rows of a lead (⏰ היום and its group), ⏳ then ✓ for 3 seconds', async () => {
  const M = mount(fx());
  assert.equal(M.rows('biz-1').length, 2, 'biz-1 is due: in ⏰ היום and in חדש');
  const g = M.rows('biz-1').find((r) => r.parentNode.classList.contains('lbGrp'));
  const ev = M.tap(g.querySelector('.lbNext'));
  assert.ok(ev.handled && ev.prevented, 'a tap on a field opens its editor and does not fold the row');
  const ed = g.querySelector('.lbEd');
  assert.ok(ed, 'the editor opens in the row');
  assert.equal(ed.querySelector('input').value, 'להתקשר אליה', 'with the current step');
  ed.querySelector('input').value = 'לשלוח הצעה';
  M.tap(ed.querySelector('[data-bz="lbnext"]'));
  assert.deepEqual(M.E.sent, ['ליד [biz-1]: צעד לשלוח הצעה']);
  assert.equal(g.querySelector('.lbEd'), null, 'the editor closes');
  M.rows('biz-1').forEach((r) => {
    const x = r.querySelector('.lbNext');
    assert.equal(x.getAttribute('data-v'), 'לשלוח הצעה');
    assert.equal(x.textContent, 'לשלוח הצעה');
    assert.ok(!x.classList.contains('lbNone'));
    assert.equal(x.getAttribute('data-mk'), 'wait', '⏳ at once, on both rows');
  });
  await flush();
  M.rows('biz-1').forEach((r) => assert.equal(r.querySelector('.lbNext').getAttribute('data-mk'), 'ok', '✓'));
  M.E.tick(3000);
  M.rows('biz-1').forEach((r) => assert.equal(r.querySelector('.lbNext').getAttribute('data-mk'), null, 'the ✓ goes after 3 seconds'));
  assert.equal(M.recs.find((r) => r.id === 'biz-1').next, 'לשלוח הצעה', 'a redraw keeps the new value');
});

test('board: a failed or silent send turns the field red, a tap sends it again, the last change wins', async () => {
  const sent = [], pend = [];
  const M = mount(fx(), { sendText: (s, b) => { sent.push(b); if (sent.length === 1) return Promise.reject(new Error('down')); return new Promise((res, rej) => pend.push({ res, rej })); } });
  const row = M.grp('בשיחה').querySelector('.lbRow');
  assert.equal(row.getAttribute('data-id'), 'biz-2');
  const f = row.querySelector('.lbNext');
  const setNext = (v) => { M.tap(row.querySelector('.lbTools [data-k="next"]')); row.querySelector('.lbEd input').value = v; M.tap(row.querySelector('[data-bz="lbnext"]')); };
  setNext('א'); await flush();
  assert.equal(f.getAttribute('data-mk'), 'bad', 'a failed send is red');
  M.tap(f);
  assert.equal(sent[1], 'ליד [biz-2]: צעד א', 'a tap on the red field sends it again');
  assert.equal(f.getAttribute('data-mk'), 'wait');
  M.E.tick(30000);
  assert.equal(f.getAttribute('data-mk'), 'bad', 'no answer in 30 seconds is red');
  setNext('ב'); setNext('ג');
  assert.deepEqual(sent.slice(2), ['ליד [biz-2]: צעד ב', 'ליד [biz-2]: צעד ג']);
  pend[2].res('ok'); await flush();
  assert.equal(f.getAttribute('data-mk'), 'ok');
  pend[1].rej(new Error('late')); await flush();
  assert.equal(f.getAttribute('data-mk'), 'ok', 'a late answer of an older send changes nothing');
  M.E.tick(30000);
  assert.equal(f.getAttribute('data-mk'), 'ok', 'nor does its timer');
  assert.equal(f.textContent, 'ג');
});

test('board: a stage moves the row to its group and fixes every counter; נסגר also drops the reminder and ⏰ היום', async () => {
  const M = mount(fx());
  assert.ok(M.root.querySelector('.bzSec').textContent.includes('(4, 2 חדשים)'));
  // biz-4 (xyz, shown as חדש) is due, so it is in ⏰ היום too. The stage is picked in the ⏰ היום copy.
  const tr = M.rows('biz-4').find((r) => r.parentNode.classList.contains('lbToday'));
  M.tap(tr.querySelector('[data-bz="ldst"][data-s="הצעה"]'));
  assert.deepEqual(M.E.sent, ['ליד [biz-4]: סטטוס הצעה'], 'sent once, by the board');
  assert.equal(inGrp(M, 'biz-4'), 'הצעה', 'the group row moved');
  assert.ok(inToday(M, 'biz-4'), 'and the ⏰ היום copy stays');
  assert.equal(M.grp('הצעה').querySelector('.lbEmpty'), null);
  assert.ok(M.grp('הצעה').querySelector('.lbHd'), 'the moved row gets the column header');
  assert.equal(M.gcount('חדש'), '(1)');
  assert.equal(M.gcount('הצעה'), '(1)');
  assert.ok(M.root.querySelector('.bzSec').textContent.includes('(4, חדש אחד)'));
  M.rows('biz-4').forEach((r) => {
    assert.equal(r.getAttribute('data-s'), 'הצעה');
    assert.equal(r.querySelector('.lbSt').getAttribute('data-s'), 'הצעה');
    assert.equal(r.querySelector('.lbSt').textContent, 'הצעה');
    assert.ok(!r.classList.contains('ldNew'));
    assert.deepEqual(r.querySelectorAll('[data-bz="ldst"]').map((b) => b.getAttribute('data-s')), ['חדש', 'בשיחה', 'נסגר', 'אבד']);
  });
  // biz-1 closed from the stage label on its row
  const g1 = M.rows('biz-1').find((r) => r.parentNode.classList.contains('lbGrp'));
  const ev = M.tap(g1.querySelector('.lbSt'));
  assert.ok(ev.prevented);
  M.tap(g1.querySelector('.lbEd [data-bz="lbst"][data-s="נסגר"]'));
  assert.equal(M.E.sent[1], 'ליד [biz-1]: סטטוס נסגר');
  assert.equal(inGrp(M, 'biz-1'), 'נסגר');
  assert.ok(!inToday(M, 'biz-1'), 'a closed lead leaves ⏰ היום');
  const rem = M.rows('biz-1')[0].querySelector('.lbRem');
  assert.ok(rem.classList.contains('lbNone') && !rem.classList.contains('lbDue') && rem.textContent === '⏰', 'its reminder is cleared');
  assert.equal(M.today().querySelector('.lbTh').textContent, '⏰ היום (1)');
  assert.equal(M.gcount('חדש'), '(0)');
  assert.equal(M.grp('חדש').querySelector('.lbEmpty'), null, 'the test lead is still a row in חדש');
  assert.ok(M.grp('נסגר').querySelector('.lbHd'));
  assert.equal(M.gcount('נסגר'), '(2)');
  assert.ok(M.root.querySelector('.bzSec').textContent.includes('כל הלידים (4)'));
});

test('board: reminder chips set Israel time, join ⏰ היום when due today, off and a picked date', async () => {
  const M = mount(fx(), { Date: at('2026-11-18T10:00:00Z') });
  const g = M.grp('בשיחה').querySelector('.lbRow');
  M.tap(g.querySelector('.lbRem'));
  M.tap(g.querySelector('.lbEd [data-bz="lbrem"][data-r="eve"]'));
  assert.deepEqual(M.E.sent, ['ליד [biz-2]: תזכורת 2026-11-18 19:00']);
  assert.ok(inToday(M, 'biz-2'), 'due today: it joins ⏰ היום');
  assert.equal(M.today().querySelector('.lbTh').textContent, '⏰ היום (3)');
  M.rows('biz-2').forEach((r) => {
    const x = r.querySelector('.lbRem');
    assert.equal(x.textContent, '⏰ 18.11 19:00');
    assert.ok(!x.classList.contains('lbDue') && !x.classList.contains('lbNone'), 'today at 19:00 is not passed yet');
    assert.equal(x.getAttribute('data-mk'), 'wait');
  });
  assert.equal(M.recs.find((r) => r.id === 'biz-2').nextAt, '2026-11-18 19:00');
  // off, from the ⏰ היום copy
  const t = M.rows('biz-2').find((r) => r.parentNode.classList.contains('lbToday'));
  M.tap(t.querySelector('.lbTools [data-k="rem"]'));
  M.tap(t.querySelector('.lbEd [data-r="off"]'));
  assert.equal(M.E.sent[1], 'ליד [biz-2]: תזכורת ביטול');
  assert.ok(!inToday(M, 'biz-2'));
  assert.equal(M.today().querySelector('.lbTh').textContent, '⏰ היום (2)');
  assert.ok(M.rows('biz-2')[0].querySelector('.lbRem').classList.contains('lbNone'));
  // a picked date and time, sent as is (Israel time)
  M.tap(g.querySelector('.lbRem'));
  M.tap(g.querySelector('.lbEd [data-r="pick"]'));
  const dt = g.querySelector('.lbEd input');
  assert.equal(dt.getAttribute('type'), 'datetime-local');
  dt.value = '2026-11-17T08:00';
  M.tap(g.querySelector('.lbEd [data-r="set"]'));
  assert.equal(M.E.sent.length, 2, 'a passed time is not sent');
  assert.ok(M.E.toasts.some((x) => x.includes('כבר עבר')));
  dt.value = '2026-11-20T08:30';
  M.tap(g.querySelector('.lbEd [data-r="set"]'));
  assert.equal(M.E.sent[2], 'ליד [biz-2]: תזכורת 2026-11-20 08:30');
  assert.ok(!inToday(M, 'biz-2'));
  assert.equal(M.rows('biz-2')[0].querySelector('.lbRem').textContent, '⏰ 20.11 08:30');
});

test('board: a note goes to the top of the history in both rows, once, and a חדש lead moves to בשיחה like the server does', async () => {
  const M = mount(fx());
  const g = M.rows('biz-1').find((r) => r.parentNode.classList.contains('lbGrp'));
  g.querySelector('.ldNoteBox input').value = 'שלחתי מחירון';
  const ev = M.tap(g.querySelector('.ldNoteBox [data-bz="ldsend"]'));
  assert.ok(ev.handled, 'the board handles it, the table handler does not send it again');
  assert.deepEqual(M.E.sent, ['ליד [biz-1]: הערה שלחתי מחירון']);
  M.rows('biz-1').forEach((r) => {
    const first = r.querySelector('.lbHist').children[0];
    assert.ok(/^[0-9]+[.][0-9]+: שלחתי מחירון$/.test(first.textContent), 'newest first: ' + first.textContent);
    assert.ok(r.querySelector('.lbLast').textContent.endsWith(': שלחתי מחירון'));
  });
  assert.equal(g.querySelector('.ldNoteBox input').value, '');
  assert.equal(inGrp(M, 'biz-1'), 'בשיחה');
  // a lead with no history gets one
  const r2 = M.grp('בשיחה').querySelectorAll('.lbRow').find((r) => r.getAttribute('data-id') === 'biz-2');
  r2.querySelector('.ldNoteBox input').value = 'לא מעוניין';
  M.tap(r2.querySelector('.ldNoteBox [data-bz="ldsend"]'));
  assert.ok(r2.querySelector('.lbHist').textContent.includes('לא מעוניין'));
  assert.equal(inGrp(M, 'biz-2'), 'אבד', '"לא מעוניין" closes it as lost, as the server does');
});

test('board: notes add up: a failed note stays red after a later one goes, and a tap sends it again', async () => {
  const sent = [];
  const M = mount(fx(), { sendText: (s, b) => { sent.push(b); return sent.length === 1 ? Promise.reject(new Error('down')) : Promise.resolve('ok'); } });
  const r = M.grp('בשיחה').querySelector('.lbRow');
  const note = (v) => { r.querySelector('.ldNoteBox input').value = v; M.tap(r.querySelector('.ldNoteBox [data-bz="ldsend"]')); };
  note('א'); await flush();
  const f = r.querySelector('.lbLast');
  assert.equal(f.getAttribute('data-mk'), 'bad');
  note('ב'); await flush();
  assert.equal(f.getAttribute('data-mk'), 'bad', 'note א still did not go');
  M.tap(f);
  assert.equal(sent[2], 'ליד [biz-2]: הערה א', 'a tap sends the note that did not go');
  assert.equal(sent.length, 3, 'and only that one');
  await flush();
  assert.equal(f.getAttribute('data-mk'), 'ok');
});

test('board: a change that did not go stays red after the tab is drawn again (review, 18.11)', async () => {
  const M = mount(fx(), { sendText: () => Promise.reject(new Error('down')) });
  const r = M.grp('בשיחה').querySelector('.lbRow');
  M.tap(r.querySelector('.lbTools [data-k="next"]')); r.querySelector('.lbEd input').value = 'לחזור אליו';
  M.tap(r.querySelector('[data-bz="lbnext"]'));
  r.querySelector('.ldNoteBox input').value = 'דיברנו';
  M.tap(r.querySelector('.ldNoteBox [data-bz="ldsend"]'));
  M.tap(r.querySelector('[data-bz="ldst"][data-s="הצעה"]'));
  await flush();
  // bzRe: the pane is drawn again from recs, which already holds the new values
  M.root.innerHTML = M.B.board();
  const r2 = M.rows('biz-2')[0];
  assert.equal(r2.parentNode.getAttribute('data-g'), 'הצעה');
  ['.lbNext', '.lbSt', '.lbLast'].forEach((c) => assert.equal(r2.querySelector(c).getAttribute('data-mk'), 'bad', c + ' is still red, not shown as saved'));
  assert.ok(M.B.board().includes('class="lbSt ldSt" data-s="הצעה">הצעה<'), 'the label markup Task 3 tests hold to is kept');
});

test('board: a note still on its way is not sent again by a tap', async () => {
  const sent = [], pend = [];
  const M = mount(fx(), { sendText: (s, b) => { sent.push(b); return new Promise((res, rej) => pend.push({ res, rej })); } });
  const r = M.grp('בשיחה').querySelector('.lbRow');
  r.querySelector('.ldNoteBox input').value = 'א';
  M.tap(r.querySelector('.ldNoteBox [data-bz="ldsend"]'));
  M.E.tick(30000);
  const f = r.querySelector('.lbLast');
  assert.equal(f.getAttribute('data-mk'), 'bad', 'no answer in 30 seconds is red');
  M.tap(f);
  assert.equal(sent.length, 1, 'not sent twice while the first is still out');
  assert.ok(M.E.toasts.some((x) => x.includes('בדרך')));
  pend[0].res('ok'); await flush();
  assert.equal(f.getAttribute('data-mk'), 'ok', 'the late answer saves it');
});

test('board: the site is normalised as the server does, a bad one is not sent, and it can be removed', async () => {
  const M = mount(fx());
  const r = M.grp('בשיחה').querySelector('.lbRow');
  M.tap(r.querySelector('.lbTools [data-k="site"]'));
  assert.equal(r.querySelector('.lbEd input').value, 'javascript:alert(1)');
  r.querySelector('.lbEd input').value = 'javascript:alert(2)';
  M.tap(r.querySelector('.lbEd [data-bz="lbsite"]'));
  assert.equal(M.E.sent.length, 0, 'a bad site is not sent');
  assert.ok(M.E.toasts.length);
  r.querySelector('.lbEd input').value = 'www.eran.co.il/x';
  M.tap(r.querySelector('.lbEd [data-bz="lbsite"]'));
  assert.deepEqual(M.E.sent, ['ליד [biz-2]: אתר https://www.eran.co.il/x']);
  const a = r.querySelector('.lbSite a');
  assert.ok(a && a.getAttribute('href') === 'https://www.eran.co.il/x' && a.getAttribute('rel') === 'noopener');
  const ev = M.tap(a);
  assert.ok(ev.handled && !ev.prevented, 'a tap on the link opens the site');
  M.tap(r.querySelector('.lbTools [data-k="site"]'));
  M.tap(r.querySelector('.lbEd [data-bz="lbsite"][data-x="1"]'));
  assert.equal(M.E.sent[1], 'ליד [biz-2]: אתר ביטול');
  assert.ok(r.querySelector('.lbSite').classList.contains('lbNone'));
});

test('board: filter and search are on the page only, no sending', () => {
  const M = mount(fx());
  M.tap(M.root.querySelector('.lbFlt [data-f="signup"]'));
  assert.deepEqual([...new Set(M.shown())], ['biz-1']);
  assert.ok(M.root.querySelector('.lbFlt [data-f="signup"]').classList.contains('on'));
  assert.ok(!M.root.querySelector('.lbFlt [data-f="all"]').classList.contains('on'));
  assert.ok(M.grp('נסגר').classList.contains('lbHide'), 'a group with nothing to show hides while filtering');
  M.tap(M.root.querySelector('.lbFlt [data-f="all"]'));
  M.root.querySelector('.lbQ').value = '052-222';
  M.B.lbFilter(M.root);
  assert.deepEqual(M.shown(), ['biz-2'], 'by phone digits');
  M.root.querySelector('.lbQ').value = 'דנה';
  M.B.lbFilter(M.root);
  assert.deepEqual([...new Set(M.shown())], ['biz-1'], 'by name');
  M.root.querySelector('.lbQ').value = '';
  M.B.lbFilter(M.root);
  assert.equal(M.shown().length, 7);
  assert.equal(M.root.querySelectorAll('.lbHide').length, 0);
  assert.equal(M.E.sent.length, 0);
});

test('board: delete removes every row of the lead and fixes the counters', () => {
  const M = mount(fx());
  const g = M.rows('biz-1').find((r) => r.parentNode.classList.contains('lbGrp'));
  const ev = M.tap(g.querySelector('[data-bz="lddel"]'));
  assert.ok(ev.handled);
  assert.equal(M.rows('biz-1').length, 0);
  assert.equal(M.gcount('חדש'), '(1)');
  assert.equal(M.today().querySelector('.lbTh').textContent, '⏰ היום (1)');
  assert.ok(M.root.querySelector('.bzSec').textContent.includes('(3, חדש אחד)'));
});

test('the board handlers are wired in every copy', () => {
  const html = page(L);
  for (const who of ['abaitzik', 'ily']) {
    const h = cut({ name: who }, html);
    assert.ok(h.includes('if(lbTap(e,el))return;'), 'the sheet click goes to the board first: ' + who);
    ['function lbTap(', 'function lbWhen(', 'function lbFilter(', 'data-bz="lbed"', 'LBS.el=el;'].forEach((k) => assert.ok(h.includes(k), k + ': ' + who));
    // the old table's handlers are gone (lbTap takes every row)
    assert.ok(!h.includes("a==='ldnote'"), 'no old ldnote handler: ' + who);
  }
});

/*
  18.11.2026, a live incident: a new page global window.lbState collided with a function lbState and broke the leads
  button. Every name the leads part declares at its top level must be declared nowhere else in the page's scripts,
  in his copy and in a customer's, and every inline script of the page must still parse.
*/
function scripts(h) {
  const out = [];
  h.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g, (m, a, b) => { if (!/\bsrc=|type="(?!text\/javascript)/.test(a || '')) out.push(b); return m; });
  return out;
}
test('the leads board declares no name the rest of the page declares, and every page script parses', () => {
  const html = page(L);
  for (const who of ['abaitzik', 'ily']) {
    const h = cut({ name: who }, html);
    const part = leadsPart(h);
    const names = new Set();
    part.replace(/^ {2}(?:function ([\w$]+)\(|var ([\w$]+)=)/gm, (m, f, v) => { names.add(f || v); return m; });
    ['ldBoardHtml', 'lbTap', 'lbWhen', 'LB_ASK', 'LB_HI', 'LBS', 'ldScanHtml', 'LD_FWD'].forEach((n) => assert.ok(names.has(n), n + ' is a top level name of the part: ' + who));
    const rest = h.replace(part, '');
    names.forEach((n) => {
      const re = new RegExp('(?:function\\s+' + n.replace('$', '\\$') + '\\s*\\(|(?:var|let|const)\\s+' + n.replace('$', '\\$') + '\\b|window\\.' + n.replace('$', '\\$') + '\\s*=|[,{]\\s*' + n.replace('$', '\\$') + '\\s*=[^=])');
      const m = re.exec(rest);
      assert.ok(!m, who + ': "' + n + '" is declared outside the leads part too: ' + (m && rest.slice(Math.max(0, m.index - 60), m.index + 60)));
    });
    assert.equal(part.split('function lbTap(').length - 1, 1, 'one lbTap: ' + who);
    assert.ok(!/window\.ldBoardSt\s*=/.test(rest) && rest.split('ldBoardSt').length === 1, 'ldBoardSt is the board\'s alone: ' + who);
    const S = scripts(h);
    assert.ok(S.length > 3, 'the page has scripts: ' + who);
    S.forEach((code, i) => { try { new Function(code); } catch (e) { assert.fail(who + ': script ' + i + ' does not parse: ' + e.message); } });
  }
});

// 18.11.2026, final review: "⏰ צריך לחזור" (dueHtml, his and a customer's) shows nextAt in Israel time, a date only
// one stays a date; the leads sheet (owner) counts a full ISO nextAt by its Israel day.
function pageFn(html, name, deps) {
  // the helper sits on a line of its own in the page
  const line = html.split(String.fromCharCode(10)).find((l) => l.trim().startsWith('function ' + name + '('));
  assert.ok(line, name + ' is in the page');
  const k = Object.keys(deps || {});
  return new Function(...k, line + '; return ' + name + ';')(...k.map((x) => deps[x]));
}
test('review 3: ⏰ צריך לחזור prints the reminder in Israel time, a date only one as before, in a customer copy too', () => {
  const html = page(L);
  for (const who of ['abaitzik', 'ily']) {
    const h = cut({ name: who }, html);
    const f = pageFn(h, 'bzNextAtTxt');
    assert.equal(f('2026-11-19T07:00:00.000Z'), '19.11 09:00', who);
    assert.equal(f('2026-11-14T22:30:00.000Z'), '15.11 00:30', who);
    assert.equal(f('2026-11-19'), '2026-11-19', who);
    assert.equal(f(''), '', who);
    assert.ok(h.includes("esc(bzNextAtTxt(d.nextAt))"), 'dueHtml uses it: ' + who);
    assert.ok(!h.includes("' · '+esc(d.nextAt)"), 'no raw nextAt: ' + who);
  }
});
test('review 7: the leads sheet counts a full ISO nextAt by its Israel day', () => {
  const own = cut({ name: 'abaitzik' }, page(L));
  const lbDay = pageFn(own, 'lbDay');
  const f = pageFn(own, 'lbDueDay', { lbDay });
  assert.equal(f('2026-11-14T22:30:00.000Z'), '2026-11-15');
  assert.equal(f('2026-11-14'), '2026-11-14');
  assert.ok(!/String\(r\.nextAt\)\.slice\(0,10\)/.test(own), 'no UTC day slice of nextAt left');
});
