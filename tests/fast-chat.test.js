'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FC = require('../lib/fast-chat.js');
const ST = require('../lib/sales-train.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fc-'));
function stub(reply) { const calls = []; const f = async (m, s, i) => { calls.push({ m, s, i }); return reply; }; f.calls = calls; return f; }
const salesStub = Object.assign({}, ST, { customerTurn: async () => 'לקוח אומר משהו', score: async () => '🎯 ציון: 70 מתוך 100', keep: () => 'x.txt' });

test('simple turn saves two messages and the file', async () => {
  const d = tmp(); const llm = stub('שלום לך');
  const r = await FC.turn(d, 'שלום', { llm });
  assert.equal(r.reply, 'שלום לך'); assert.equal(r.mode, 'chat');
  assert.deepEqual(r.thread.map((m) => m.from), ['me', 'bot']);
  assert.ok(fs.existsSync(path.join(d, 'fastchat', 'thread.json')));
  assert.equal(FC.load(d).msgs.length, 2);
});

test('keeps 40 messages, sends at most 20', async () => {
  const d = tmp(); const llm = stub('ok');
  for (let i = 0; i < 45; i++) await FC.turn(d, 'הודעה ' + i, { llm });
  assert.equal(FC.load(d).msgs.length, 40);
  const last = llm.calls[llm.calls.length - 1].i;
  assert.ok(last.split('\n').filter((l) => /^(משתמש|מוניטור): /.test(l)).length <= 20);
});

test('long text is cut to 2000', async () => {
  const d = tmp();
  const r = await FC.turn(d, 'א'.repeat(3000), { llm: stub('ok') });
  assert.equal(r.thread[0].text.length, 2000);
});

test('llm failure: fixed reply, user message kept', async () => {
  const d = tmp();
  const r = await FC.turn(d, 'שאלה', { llm: async () => { throw new Error('timeout'); } });
  assert.equal(r.reply, 'לא הצלחתי לענות עכשיו, נסה שוב');
  const th = FC.load(d);
  assert.equal(th.msgs.length, 1); assert.equal(th.msgs[0].text, 'שאלה');
});

test('sales mode start and score', async () => {
  const d = tmp();
  const a = await FC.turn(d, 'אימון מכירות', { llm: stub('x'), salesTrain: salesStub });
  assert.equal(a.mode, 'sales');
  const b = await FC.turn(d, 'שלום, מה שלומך', { llm: stub('x'), salesTrain: salesStub });
  assert.equal(b.reply, 'לקוח אומר משהו'); assert.equal(b.mode, 'sales');
  const c = await FC.turn(d, 'סיימנו', { llm: stub('x'), salesTrain: salesStub });
  assert.equal(c.mode, 'chat'); assert.equal(c.reply, '🎯 ציון: 70 מתוך 100');
  assert.equal(FC.load(d).sales, undefined);
});

test('coach mode saves the goal and hides the goal line', async () => {
  const d = tmp();
  const a = await FC.turn(d, 'אימון עסקי', { llm: stub('מה היעד שלך?') });
  assert.equal(a.mode, 'coach');
  const b = await FC.turn(d, 'אני רוצה לקוחות', { llm: stub('מצוין, קבענו.\nיעד: 3 לקוחות חדשים') });
  assert.equal(b.reply, 'מצוין, קבענו.');
  const goals = JSON.parse(fs.readFileSync(path.join(d, 'fastchat', 'coach.json'), 'utf8')).goals;
  assert.equal(goals.length, 1); assert.equal(goals[0].text, '3 לקוחות חדשים');
  const llm = stub('איך הלך?');
  await FC.turn(d, 'עוד', { llm });
  assert.ok(llm.calls[0].s.includes('3 לקוחות חדשים'));
  const e = await FC.turn(d, 'סיום אימון', { llm });
  assert.equal(e.mode, 'chat');
});

test('two parallel turns keep four messages in order', async () => {
  const d = tmp();
  const slow = async (m, s, i) => { await new Promise((r) => setTimeout(r, i.includes('ראשונה') ? 60 : 5)); return 'תשובה'; };
  await Promise.all([FC.turn(d, 'ראשונה', { llm: slow }), FC.turn(d, 'שנייה', { llm: slow })]);
  assert.deepEqual(FC.load(d).msgs.map((m) => m.text), ['ראשונה', 'תשובה', 'שנייה', 'תשובה']);
});

test('add-on rule only for non owner', async () => {
  const a = stub('ok'); const b = stub('ok');
  await FC.turn(tmp(), 'x', { llm: a, owner: false }); await FC.turn(tmp(), 'x', { llm: b, owner: true });
  assert.ok(a.calls[0].s.includes('תוספת בתשלום'));
  assert.ok(!b.calls[0].s.includes('תוספת בתשלום'));
});
