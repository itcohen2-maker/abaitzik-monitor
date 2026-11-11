'use strict';
// 11.11.2026: the control board extras (chat bar, updates, morning report) exist only for Itzik and for a monitor with board:true.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('../lib/board-feed.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'bf-')); }
function put(dp, rel, obj) { const f = path.join(dp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj)); }

test('only abaitzik and a monitor with board:true get the board extras', () => {
  const dp = tmp();
  assert.ok(F.forPage({ name: 'abaitzik', dataPath: dp }, Date.now()));
  assert.ok(F.forPage({ name: 'ilay', board: true, dataPath: dp }, Date.now()));
  assert.strictEqual(F.forPage({ name: 'alon', board: false, dataPath: dp }, Date.now()), null);
  assert.strictEqual(F.forPage({ name: 'pablo', dataPath: dp }, Date.now()), null);
  assert.strictEqual(F.forPage({ name: 'ilay', dataPath: dp }, Date.now()), null);
});

test('the morning report is on for Itzik and off for a customer, and the prefs file changes it', () => {
  const dp = tmp();
  assert.strictEqual(F.readPrefs(dp, 'itzik').report.show, true);
  assert.strictEqual(F.readPrefs(dp, 'mine').report.show, false);
  put(dp, 'board-prefs.json', { report: { show: true, includes: ['דחוף'] }, hideRows: ['li'], updates: { google: false, max: 5 } });
  const p = F.readPrefs(dp, 'mine');
  assert.strictEqual(p.report.show, true);
  assert.deepStrictEqual(p.report.includes, ['דחוף']);
  assert.deepStrictEqual(p.hideRows, ['li']);
  assert.strictEqual(p.updates.google, false);
  assert.strictEqual(p.updates.max, 5);
});

test('a customer without Google gets one line saying it appears after connecting, and no mail text', () => {
  const dp = tmp();
  const b = F.forPage({ name: 'ilay', board: true, dataPath: dp }, Date.now());
  assert.match(b.mailNote, /אחרי שמחברים את גוגל/);
});

test('only important mail reaches the updates, as the one line summary, never marketing', () => {
  const dp = tmp(), now = Date.parse('2026-11-11T10:00:00Z');
  put(dp, 'biz-home/mail.json', [
    { id: '1', at: '2026-11-11T08:00:00Z', subject: 'חשבונית 123', text: 'חשבונית על 500 ש״ח מספק', tag: 'חשוב', reply: '' },
    { id: '2', at: '2026-11-11T08:05:00Z', subject: 'מבצע', text: 'הנחה על הכל', tag: 'פרסומת', reply: '' },
    { id: '3', at: '2026-11-11T08:10:00Z', subject: 'שלום', text: 'סתם הודעה', tag: 'רגיל', reply: '' },
  ]);
  const b = F.forPage({ name: 'ilay', board: true, dataPath: dp }, now);
  const t = b.updates.map((u) => u.t).join('|');
  assert.match(t, /חשבונית על 500/);
  assert.ok(!/הנחה|סתם הודעה/.test(t));
  assert.strictEqual(b.mailNote, '');
});

test('Itzik: the manager round and the important lines of the brief, no dashes', () => {
  const dp = tmp(), now = Date.parse('2026-11-11T12:00:00Z');
  put(dp, 'manager/manager/20261111.json', { at: '2026-11-11T11:00:00Z', day: '2026-11-11', items: [
    { k: 'mail', t: 'מיילים נקראו', st: 'done' }, { k: 'clients', t: 'לקוח עם תקלה', st: 'warn' }, { k: 'candles', t: 'נרות עובד - תקין', st: 'done' }] });
  put(dp, 'reports/reports/20261111-0708-morning-brief.json', { at: '2026-11-11T05:00:00Z', title: 'דוח בוקר', body: 'דחוף:\n1. חשבונית מספק על 143 דולר - לא לשלם\n2. וובינר של BDO\n\nמיילים:\n1. כלום' });
  const b = F.forPage({ name: 'abaitzik', dataPath: dp }, now);
  const t = b.updates.map((u) => u.t).join('|');
  assert.match(t, /חשבונית מספק/);
  assert.ok(!/וובינר/.test(t));
  assert.match(t, /הסבב האחרון/);
  assert.ok(!/[-‐‑‒–—]/.test(t));
});
