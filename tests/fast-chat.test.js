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

test('user message is on disk while the model is still working', async () => {
  const d = tmp(); let seen = -1;
  await FC.turn(d, 'שאלה', { llm: async () => { seen = FC.load(d).msgs.length; return 'ok'; } });
  assert.equal(seen, 1);
});

test('sales: customerTurn throws keeps the seller line and the mode', async () => {
  const d = tmp();
  await FC.turn(d, 'אימון מכירות', { llm: stub('x'), salesTrain: salesStub });
  const bad = Object.assign({}, salesStub, { customerTurn: async () => { throw new Error('x'); } });
  const r = await FC.turn(d, 'היי, אני מציע שירות', { llm: stub('x'), salesTrain: bad });
  assert.equal(r.reply, FC.FAIL); assert.equal(r.mode, 'sales');
  const th = FC.load(d);
  assert.equal(th.mode, 'sales');
  assert.deepEqual(th.sales.turns, [{ who: 'me', t: 'היי, אני מציע שירות' }]);
});

test('sales: score failure keeps the training for a retry', async () => {
  const d = tmp();
  await FC.turn(d, 'אימון מכירות', { llm: stub('x'), salesTrain: salesStub });
  await FC.turn(d, 'שלום', { llm: stub('x'), salesTrain: salesStub });
  const bad = Object.assign({}, salesStub, { score: async () => { throw new Error('x'); } });
  const r = await FC.turn(d, 'סיימנו', { llm: stub('x'), salesTrain: bad });
  assert.equal(r.mode, 'sales'); assert.ok(FC.load(d).sales);
  const ok = await FC.turn(d, 'סיימנו', { llm: stub('x'), salesTrain: salesStub });
  assert.equal(ok.mode, 'chat'); assert.equal(ok.reply, '🎯 ציון: 70 מתוך 100');
});

test('coach: "אימון מכירות" switches to sales', async () => {
  const d = tmp();
  await FC.turn(d, 'אימון עסקי', { llm: stub('מה היעד?') });
  const r = await FC.turn(d, 'אימון מכירות', { llm: stub('x'), salesTrain: salesStub });
  assert.equal(r.mode, 'sales'); assert.equal(FC.load(d).mode, 'sales');
});

test('sales: "עצור אימון" exits without a score', async () => {
  const d = tmp(); let scored = 0;
  const st = Object.assign({}, salesStub, { score: async () => { scored++; return 'x'; } });
  await FC.turn(d, 'אימון מכירות', { llm: stub('x'), salesTrain: st });
  const r = await FC.turn(d, 'עצור אימון', { llm: stub('x'), salesTrain: st });
  assert.equal(r.mode, 'chat'); assert.equal(scored, 0); assert.equal(FC.load(d).sales, undefined);
});

test('coach: goal-only reply shows a confirmation, goals capped at 20', async () => {
  const d = tmp();
  await FC.turn(d, 'אימון עסקי', { llm: stub('שלום') });
  let r;
  for (let i = 0; i < 22; i++) r = await FC.turn(d, 'יעד ' + i, { llm: stub('יעד: מטרה ' + i) });
  assert.equal(r.reply, 'קבענו יעד: מטרה 21');
  const goals = JSON.parse(fs.readFileSync(path.join(d, 'fastchat', 'coach.json'), 'utf8')).goals;
  assert.equal(goals.length, 20); assert.equal(goals[19].text, 'מטרה 21');
});

test('non-owner prompt has no literal X placeholder', async () => {
  const a = stub('ok'); await FC.turn(tmp(), 'x', { llm: a, owner: false });
  assert.ok(!a.calls[0].s.includes('X ₪'));
});

test('chatOn / chatOff triggers', () => {
  for (const t of ['מצב שיחה', ' בוא נדבר ', 'מצב שיחה!']) assert.ok(FC.chatOn(t) && !FC.chatOff(t), t);
  for (const t of ['מצב בקשות', 'סיום שיחה.']) assert.ok(FC.chatOff(t) && !FC.chatOn(t), t);
  for (const t of ['בוא נדבר על המחיר', 'מצב שיחה עכשיו', '', null]) assert.ok(!FC.chatOn(t) && !FC.chatOff(t), String(t));
});
