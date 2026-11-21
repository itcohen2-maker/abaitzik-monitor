'use strict';
// 14.11.2026: a meeting summary to WhatsApp and the owner's tasks to the calendar (lib/meet-push.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const M = require('../lib/meet-push.js');

const MEET = { id: 'ff-123', client: 'דנה', summary: 'דיברנו על השותפות.', decisions: ['מתחילים בינואר'], tasksMe: ['לשלוח הצעת מחיר', 'לקבוע פגישה'], tasksClient: ['לשלוח לוגו'], next: 'פגישה בעוד שבוע' };

test('meet push: the text has the summary, decisions, both task lists and the next step', () => {
  const t = M.text(MEET);
  ['סיכום הפגישה עם דנה', 'דיברנו על השותפות.', 'מתחילים בינואר', 'לשלוח הצעת מחיר', 'לשלוח לוגו', 'פגישה בעוד שבוע'].forEach((x) => assert.ok(t.includes(x), x));
});

test('meet push: the next working day skips Friday and Saturday', () => {
  assert.equal(M.nextWorkDay(Date.UTC(2026, 10, 12, 10)), '2026-11-15'); // Thursday -> Sunday
  assert.equal(M.nextWorkDay(Date.UTC(2026, 10, 15, 10)), '2026-11-16'); // Sunday -> Monday
});

test('meet push: one chat record for WhatsApp and one calendar file per task, never twice', () => {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpush-'));
  const r = M.write(D, MEET, Date.UTC(2026, 10, 15, 10));
  assert.ok(/-claude-push\.json$/.test(r.chat));
  const rec = JSON.parse(fs.readFileSync(path.join(D, 'chat', 'chat', r.chat), 'utf8'));
  assert.equal(rec.waPush, true); assert.equal(rec.from, 'claude');
  assert.equal(r.adds.length, 2);
  const a = JSON.parse(fs.readFileSync(r.adds[0], 'utf8'));
  assert.equal(a.date, '2026-11-16'); assert.ok(a.title.includes('לשלוח הצעת מחיר'));
  assert.equal(M.write(D, MEET, Date.UTC(2026, 10, 15, 10)).adds.length, 0);
});
