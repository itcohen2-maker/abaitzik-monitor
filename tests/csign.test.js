'use strict';
// 14.11.2026: a customer's quote signed by his client, counted against his package (lib/csign.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../lib/csign.js');
const P = require('../lib/plan.js');

const NOW = Date.UTC(2026, 10, 14, 12);
const st = (plan, more) => Object.assign({ plan, month: P.monthOf(NOW), extra: 0 }, more || {});
const Q = { no: '1001', client: 'דנה <b>', items: [['ייעוץ <script>', 2, 500, 'שעתיים', 'שעות'], ['ריק', 0, 0]], disc: 10, valid: 30, notes: 'שורה א\nשורה ב' };
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'csign-')); }

test('csign: the month limit follows the package and the add-on', () => {
  assert.equal(C.limitFor(null), 5);
  assert.equal(C.limitFor(st('entry')), 5);
  assert.equal(C.limitFor(st('small', { addons: { sign50: { on: true } } })), 55);
  assert.equal(C.limitFor(st('medium')), Infinity);
  assert.equal(C.limitFor(st('large')), Infinity);
});

test('csign: a quote is cleaned, empty lines dropped, nothing without a client or items', () => {
  const c = C.clean(Q);
  assert.equal(c.items.length, 1);
  assert.equal(C.clean({ client: 'x', items: [] }), null);
  assert.equal(C.clean({ items: [['a', 1, 1]] }), null);
});

test('csign: the drawn quote escapes every value', () => {
  const h = C.docHtml({ q: C.clean(Q), biz: { name: 'עסק "שלי"' }, logo: '' });
  assert.ok(h.includes('דנה &lt;b&gt;'));
  assert.ok(!h.includes('<script>'));
  assert.ok(h.includes('עסק &quot;שלי&quot;'));
});

test('csign: links count to the limit, then stop', () => {
  const D = tmp();
  for (let i = 0; i < 5; i++) { const r = C.create(D, 'ten1', { q: Q }, st('entry'), NOW); assert.equal(r.ok, true); assert.equal(r.left, 4 - i); assert.ok(/^https:\/\/form\.it-solution\.co\.il\/c\/[a-f0-9]{24}$/.test(r.link)); }
  const no = C.create(D, 'ten1', { q: Q }, st('entry'), NOW);
  assert.equal(no.ok, false); assert.equal(no.why, 'limit'); assert.equal(no.limit, 5);
  assert.equal(C.create(D, 'ten2', { q: Q }, st('large'), NOW).left, -1);
  assert.equal(C.create(D, 'ten1', { q: {} }, st('entry'), NOW).why, 'bad');
});

test('csign: open is told once, signing keeps name, address and fingerprint and tells the customer', () => {
  const D = tmp(), told = [];
  const r = C.create(D, 'ten1', { q: Q, logo: 'javascript:alert(1)' }, st('entry'), NOW);
  const tell = (t, x) => told.push([t, x]);
  const render = (h, p, cb) => { fs.writeFileSync(p, 'PDF'); cb(null); };
  assert.equal(C.handlePost(D, { token: r.tok, open: true }, '1.2.3.4', 'ua', tell).status, 200);
  C.handlePost(D, { token: r.tok, open: true }, '1.2.3.4', 'ua', tell);
  assert.equal(told.length, 1);
  assert.equal(C.handlePost(D, { token: r.tok, name: 'ד', sig: 'data:image/png;base64,AAAA' }, '1.2.3.4', 'ua', tell, render).status, 400);
  assert.equal(C.handlePost(D, { token: r.tok, name: 'דנה כהן', sig: 'data:image/png;base64,AAAA' }, '1.2.3.4', 'ua', tell, render).status, 200);
  const rec = JSON.parse(fs.readFileSync(path.join(D, 'csign', r.tok + '.json'), 'utf8'));
  assert.equal(rec.logo, '');
  assert.equal(rec.state.name, 'דנה כהן'); assert.equal(rec.state.ip, '1.2.3.4'); assert.equal(rec.state.docHash.length, 64);
  assert.equal(told.length, 2); assert.equal(told[1][0], 'ten1'); assert.ok(told[1][1].includes('/c/' + r.tok + '/signed'));
  assert.equal(C.handlePost(D, { token: 'nope' }, '', '', tell).status, 404);
});
