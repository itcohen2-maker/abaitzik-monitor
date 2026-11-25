'use strict';
// 25.11.2026: notes from the Raindrop demo are kept on our side and reported once (lib/rd-notes.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const N = require('../lib/rd-notes.js');

function env() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdn-'));
  const DATA = path.join(root, 'data'), pages = path.join(root, 'p');
  fs.mkdirSync(DATA); fs.mkdirSync(pages);
  const sent = [];
  return { DATA, pages, sent, notify: (k, t) => sent.push(t) };
}
let ipN = 0;
const ip = () => '10.0.0.' + (++ipN);

test('a draft is kept but not reported until it is sent', () => {
  const e = env();
  assert.strictEqual(N.handlePost(e.DATA, { id: 'abc12345', gate: 'app', screen: '/events', name: 'צליל', text: 'חסר שלב', state: 'draft' }, ip()).status, 200);
  assert.strictEqual(N.load(e.DATA).notes[0].text, 'חסר שלב');
  assert.strictEqual(N.sweep(e.DATA, e.notify, { pagesDir: e.pages }), 0);
  N.handlePost(e.DATA, { id: 'abc12345', gate: 'app', screen: '/events', name: 'צליל', text: 'חסר שלב אחד', state: 'sent' }, ip());
  assert.strictEqual(N.sweep(e.DATA, e.notify, { pagesDir: e.pages }), 1);
  assert.match(e.sent[0], /צליל \(המערכת הפנימית\): חסר שלב אחד/);
  assert.match(e.sent[0], /https:\/\/form\.it-solution\.co\.il\/p\/[a-f0-9]{20}\.html/);
  // reported once
  assert.strictEqual(N.sweep(e.DATA, e.notify, { pagesDir: e.pages }), 0);
  const page = fs.readdirSync(e.pages)[0];
  assert.match(fs.readFileSync(path.join(e.pages, page), 'utf8'), /חסר שלב אחד/);
});

test('a draft left unsent for two hours is reported anyway', () => {
  const e = env(); const t0 = Date.parse('2026-11-25T10:00:00Z');
  N.handlePost(e.DATA, { id: 'draft0001', gate: 'portal', name: 'כפיר', text: 'הקיט יקר', state: 'draft' }, ip(), { now: t0 });
  assert.strictEqual(N.sweep(e.DATA, e.notify, { pagesDir: e.pages, now: t0 + 3600e3 }), 0);
  assert.strictEqual(N.sweep(e.DATA, e.notify, { pagesDir: e.pages, now: t0 + 2 * 3600e3 + 1 }), 1);
  assert.match(e.sent[0], /טיוטה שלא נשלחה/);
});

test('an edit after the report is reported again', () => {
  const e = env();
  N.handlePost(e.DATA, { id: 'edit00001', gate: 'app', text: 'א', state: 'sent' }, ip());
  N.sweep(e.DATA, e.notify, { pagesDir: e.pages });
  N.handlePost(e.DATA, { id: 'edit00001', gate: 'app', text: 'א ועוד', state: 'sent' }, ip());
  assert.strictEqual(N.sweep(e.DATA, e.notify, { pagesDir: e.pages }), 1);
});

test('test notes are kept and never reported or listed', () => {
  const e = env();
  N.handlePost(e.DATA, { id: 'test00001', gate: 'app', text: 'בדיקה', state: 'sent', test: true }, ip());
  assert.strictEqual(N.load(e.DATA).notes.length, 1);
  assert.strictEqual(N.sweep(e.DATA, e.notify, { pagesDir: e.pages }), 0);
});

test('bad input is refused, text is escaped on the page', () => {
  const e = env();
  assert.strictEqual(N.handlePost(e.DATA, { id: '../x', gate: 'app', text: 'x' }, ip()).status, 400);
  assert.strictEqual(N.handlePost(e.DATA, { id: 'okid00001', gate: 'nope', text: 'x' }, ip()).status, 400);
  assert.strictEqual(N.handlePost(e.DATA, null, ip()).status, 400);
  N.handlePost(e.DATA, { id: 'xss000001', gate: 'supplier', name: '<b>', text: '<script>alert(1)</script>', state: 'sent' }, ip());
  N.sweep(e.DATA, e.notify, { pagesDir: e.pages });
  const html = fs.readFileSync(path.join(e.pages, fs.readdirSync(e.pages)[0]), 'utf8');
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('one address is limited per hour', () => {
  const e = env(); const a = ip(); let last;
  for (let i = 0; i < 401; i++) last = N.handlePost(e.DATA, { id: 'lim' + String(i).padStart(6, '0'), gate: 'app', text: 'x', test: true }, a);
  assert.strictEqual(last.status, 429);
});
