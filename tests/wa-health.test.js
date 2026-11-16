'use strict';
// 16.11.2026: tests for lib/wa-health.js (missed WhatsApp answers, log failures) and the manager's 💬 line.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('../lib/wa-health.js');
const M = require('../lib/manager.js');

const NOW = Date.parse('2026-11-16T10:00:00Z');
function iso(minAgo) { return new Date(NOW - minAgo * 60e3).toISOString(); }
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wah-'));
  const data = path.join(root, 'data');
  const chat = path.join(data, 'chat', 'chat');
  const tdir = path.join(root, 'tenant');
  fs.mkdirSync(chat, { recursive: true }); fs.mkdirSync(path.join(data, 'status'), { recursive: true });
  fs.mkdirSync(path.join(tdir, 'data', 'chat', 'chat'), { recursive: true });
  fs.writeFileSync(path.join(data, 'wa.json'), JSON.stringify({ allow: ['972500000001'] }));
  fs.writeFileSync(path.join(data, 'wa-tenants.json'), JSON.stringify({ '972500000002': { tenant: 'pablo', dir: tdir, at: iso(300) } }));
  const w = (dir, f, j) => fs.writeFileSync(path.join(dir, f), JSON.stringify(j));
  return { data, chat, tchat: path.join(tdir, 'data', 'chat', 'chat'), w };
}

test('a page chat task answered and never sent is a missed answer; a sent one is not', () => {
  const s = setup();
  s.w(s.chat, 'q1.json', { from: 'itzik', at: iso(120), id: 'wa-1', text: 'שיחה\nהצעת מחיר' });
  s.w(s.chat, 'a1.json', { from: 'claude', at: iso(100), re: 'wa-1', text: 'הנה' });
  s.w(s.chat, 'q2.json', { from: 'itzik', at: iso(120), id: 'wa-2', text: 'וואטסאפ\nמה עם בזק' });
  s.w(s.chat, 'a2.json', { from: 'claude', at: iso(100), re: 'wa-2', text: 'בדקתי' });
  fs.writeFileSync(path.join(s.data, 'status', 'wa-bridge.json'), JSON.stringify({ sent: { 'a2.json': 1 } }));
  const h = H.check({ dataPath: s.data, now: NOW, logText: '', isActive: () => true });
  assert.strictEqual(h.monitors.find(m => m.name === 'abaitzik').missed, 1);
  assert.match(H.problems(h).join(' '), /abaitzik: תשובה אחת לא יצאה/);
});

test('a form event, a fresh answer and an answer older than a day are not counted', () => {
  const s = setup();
  s.w(s.chat, 'q1.json', { from: 'itzik', at: iso(120), id: 'wa-1', text: 'דף הקמה\nנפתח' });
  s.w(s.chat, 'a1.json', { from: 'claude', at: iso(100), re: 'wa-1', text: 'ראיתי' });
  s.w(s.chat, 'q2.json', { from: 'itzik', at: iso(20), id: 'wa-2', text: 'שיחה\nעכשיו' });
  s.w(s.chat, 'a2.json', { from: 'claude', at: iso(5), re: 'wa-2', text: 'עוד רגע יוצא' });
  s.w(s.chat, 'q3.json', { from: 'itzik', at: iso(2000), id: 'wa-3', text: 'שיחה\nישן' });
  s.w(s.chat, 'a3.json', { from: 'claude', at: iso(1990), re: 'wa-3', text: 'ישן' });
  const h = H.check({ dataPath: s.data, now: NOW, logText: '', isActive: () => true });
  assert.deepStrictEqual(H.problems(h), []);
});

test('a customer: only questions after his WhatsApp was connected count, keyed tenant/file', () => {
  const s = setup();
  s.w(s.tchat, 'old.json', { from: 'itzik', at: iso(400), id: 'fc-1', text: 'שיחה\nלפני החיבור' });
  s.w(s.tchat, 'olda.json', { from: 'claude', at: iso(390), re: 'fc-1', text: 'תשובה' });
  s.w(s.tchat, 'new.json', { from: 'itzik', at: iso(60), id: 'fc-2', text: 'שיחה\nאחרי החיבור' });
  s.w(s.tchat, 'newa.json', { from: 'claude', at: iso(50), re: 'fc-2', text: 'תשובה' });
  let h = H.check({ dataPath: s.data, now: NOW, logText: '', isActive: () => true });
  assert.strictEqual(h.monitors.find(m => m.name === 'pablo').missed, 1);
  fs.writeFileSync(path.join(s.data, 'status', 'wa-bridge.json'), JSON.stringify({ sent: { 'pablo/newa.json': 1 } }));
  h = H.check({ dataPath: s.data, now: NOW, logText: '', isActive: () => true });
  assert.deepStrictEqual(H.problems(h), []);
});

test('log: a failed send that went out later is fine; Meta failures and a stopped bridge are reported', () => {
  const log = [
    iso(30) + ' send failed a.json: graph 409 in flight',
    iso(29) + ' out a.json -> wa-1',
    iso(20) + ' status failed MzdC 131042 Business eligibility payment issue Message failed',
    iso(600) + ' send failed old.json: graph 500',
  ].join('\n');
  const s = setup();
  const h = H.check({ dataPath: s.data, now: NOW, logText: log, isActive: () => false });
  const p = H.problems(h);
  assert.match(p[0], /הגשר לוואטסאפ לא רץ/);
  assert.strictEqual(h.fails.length, 1);
  assert.match(p.join(' '), /131042/);
});

test('manager 💬 line: done when clean, warn with the first problem, none on a customer monitor', () => {
  assert.strictEqual(M.waItem(undefined), null);
  const ok = M.waItem({ active: true, logRead: true, monitors: [{ name: 'abaitzik', missed: 0 }, { name: 'pablo', missed: 0 }], fails: [] });
  assert.strictEqual(ok.st, 'done'); assert.match(ok.t, /וואטסאפ/);
  const bad = M.waItem({ active: true, logRead: true, monitors: [{ name: 'pablo', missed: 2 }], fails: [] });
  assert.strictEqual(bad.st, 'warn'); assert.match(bad.t + bad.sub, /pablo: 2 תשובות/);
});
