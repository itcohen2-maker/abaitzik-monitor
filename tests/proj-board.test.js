'use strict';
// Rinat's project sheet (14.10): a request under a topic, the results Claude
// gave to it, and the follow-ups on that same request. The parsing and the
// grouping live in lib/monitor-logic.js so they can be tested here.
const test = require('node:test');
const assert = require('node:assert/strict');
const ML = require('../lib/monitor-logic.js');

// Stands in for stamp() on the page: "dd.mm hh:mm" in local time.
const stampFn = (iso) => {
  const d = new Date(iso);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};
const PROJ = { title: 'קולקציית חורף 27/28', topics: [{ key: 'deck', title: 'מצגת', icon: '📊' }, 'לוחות השראה', 'הדמיות'] };

test('projTopicOf reads a new request: project, topic and body', () => {
  const p = ML.projTopicOf('פרויקט קולקציית חורף 27/28 / מצגת: לשים יותר צבע בשקף השני');
  assert.deepEqual(p, { project: 'קולקציית חורף 27/28', topic: 'מצגת', body: 'לשים יותר צבע בשקף השני', followOf: '' });
});

test('projTopicOf reads a follow-up and gives the stamp it quotes, body only', () => {
  const p = ML.projTopicOf('פרויקט X / הדמיות: הערה לשיפור על הבקשה מ14.10 12:30: לקרב את הזווית');
  assert.equal(p.followOf, '14.10 12:30');
  assert.equal(p.body, 'לקרב את הזווית');
  assert.equal(p.topic, 'הדמיות');
});

test('projTopicOf accepts the full-width colon too', () => {
  const p = ML.projTopicOf('פרויקט X / מצגת：שקף ראשון');
  assert.equal(p.topic, 'מצגת');
  assert.equal(p.body, 'שקף ראשון');
});

test('projTopicOf: an old-form message has no topic, so it goes to כללי on the board', () => {
  const p = ML.projTopicOf('פרויקט לוחות השראה: זה לא טוב הלוחות האלו נראה לא טוב תמחוק את זה');
  assert.deepEqual(p, { project: 'לוחות השראה', topic: '', body: 'זה לא טוב הלוחות האלו נראה לא טוב תמחוק את זה', followOf: '' });
});

test('projTopicOf strips the kind line and the code tail the server adds', () => {
  const p = ML.projTopicOf('פרויקט\nפרויקט לוחות השראה: זה לא טוב\n\nקוד');
  assert.deepEqual(p, { project: 'לוחות השראה', topic: '', body: 'זה לא טוב', followOf: '' });
  const q = ML.projTopicOf('פרויקט\nפרויקט X / מצגת: שורה\nשנייה\n\nקוד 1234');
  assert.equal(q.body, 'שורה\nשנייה');
});

test('projTopicOf returns null for text that is not a project message', () => {
  assert.equal(ML.projTopicOf('שלום, מה שלומך'), null);
  assert.equal(ML.projTopicOf(''), null);
  assert.equal(ML.projTopicOf(undefined), null);
});

test('projBoard groups requests by topic, newest first, with their results and follow-ups', () => {
  const chat = [
    { id: 'r1', at: '2026-10-10T08:00:00', from: 'itzik', text: 'פרויקט קולקציית חורף 27/28 / מצגת: שקף פתיחה' },
    { id: 'r2', at: '2026-10-11T09:00:00', from: 'itzik', text: 'פרויקט קולקציית חורף 27/28 / מצגת: שקף סיום' },
    { id: 'a1', at: '2026-10-10T08:05:00', from: 'claude', re: 'r1', text: 'הנה השקף. files/שקף 1.pdf' },
    { id: 'a2', at: '2026-10-10T08:06:00', from: 'claude', re: 'r1', text: 'גרסה נוספת' },
    { id: 'f1', at: '2026-10-10T10:00:00', from: 'itzik', text: 'פרויקט קולקציית חורף 27/28 / מצגת: הערה לשיפור על הבקשה מ' + stampFn('2026-10-10T08:00:00') + ': יותר צבע' },
    { id: 'a3', at: '2026-10-10T10:03:00', from: 'claude', re: 'f1', text: 'גרסה 2 files/שקף 1 v2.pdf' },
    { id: 'x1', at: '2026-10-10T11:00:00', from: 'itzik', text: 'פרויקט אחר / מצגת: לא שייך' },
  ];
  const b = ML.projBoard(chat, [], PROJ, stampFn);
  const deck = b.topics.find((t) => t.title === 'מצגת');
  assert.equal(deck.icon, '📊');
  assert.deepEqual(deck.rows.map((r) => r.root.id), ['r2', 'r1']);
  const r1 = deck.rows[1];
  assert.deepEqual(r1.results.map((m) => m.id), ['a1', 'a2']);
  assert.equal(r1.follows.length, 1);
  assert.equal(r1.follows[0].msg.id, 'f1');
  assert.deepEqual(r1.follows[0].results.map((m) => m.id), ['a3']);
  assert.deepEqual(deck.rows[0].results, []);
  assert.deepEqual(deck.rows[0].follows, []);
});

test('projBoard: the default topics appear even when empty, and a project without topics gets them', () => {
  const b = ML.projBoard([], [], { title: 'P' }, stampFn);
  assert.deepEqual(b.topics.map((t) => t.title), ['מצגת', 'לוחות השראה', 'הדמיות']);
  assert.ok(b.topics.every((t) => t.rows.length === 0));
  assert.deepEqual(ML.DEFAULT_TOPICS, ['מצגת', 'לוחות השראה', 'הדמיות']);
});

test('projBoard: a topic only the chat knows comes after the declared ones, כללי last', () => {
  const chat = [
    { id: 'n1', at: '2026-10-10T08:00:00', from: 'itzik', text: 'פרויקט P: בלי נושא' },
    { id: 'n2', at: '2026-10-10T08:01:00', from: 'itzik', text: 'פרויקט P / פוסטרים: משהו' },
  ];
  const b = ML.projBoard(chat, [], { title: 'P', topics: ['מצגת'] }, stampFn);
  assert.deepEqual(b.topics.map((t) => t.title), ['מצגת', 'פוסטרים', 'כללי']);
  assert.equal(b.topics[2].rows[0].root.id, 'n1');
});

test('projBoard: pending requests appear at once, and a pending copy of an echoed message is not shown twice', () => {
  const at = '2026-10-12T07:00:00.000Z';
  const pending = [
    { at, text: 'פרויקט P / הדמיות: חדש ממתין' },
    { at, text: 'פרויקט P / מצגת: כבר הגיע מהשרת' },
  ];
  const chat = [{ id: 'e1', at: '2026-10-12T07:00:20.000Z', from: 'itzik', text: 'פרויקט\nפרויקט P / מצגת: כבר הגיע מהשרת\n\nקוד' }];
  const b = ML.projBoard(chat, pending, { title: 'P', topics: ['מצגת', 'הדמיות'] }, stampFn);
  const deck = b.topics.find((t) => t.title === 'מצגת');
  const viz = b.topics.find((t) => t.title === 'הדמיות');
  assert.equal(deck.rows.length, 1);
  assert.equal(deck.rows[0].root.id, 'e1');
  assert.equal(viz.rows.length, 1);
  assert.equal(viz.rows[0].root.pend, true);
  assert.equal(viz.rows[0].results.length, 0);
});

test('projBoard: a follow-up whose request is not in the list is kept as its own row, not dropped', () => {
  const chat = [{ id: 'o1', at: '2026-10-10T10:00:00', from: 'itzik', text: 'פרויקט P / מצגת: הערה לשיפור על הבקשה מ01.01 01:01: משהו' }];
  const b = ML.projBoard(chat, [], { title: 'P', topics: ['מצגת'] }, stampFn);
  assert.equal(b.topics[0].rows.length, 1);
  assert.equal(b.topics[0].rows[0].root.id, 'o1');
});

test('projBoard ignores other projects and claude messages that are not requests', () => {
  const chat = [{ id: 'c9', at: '2026-10-10T10:00:00', from: 'claude', text: 'פרויקט P / מצגת: לא בקשה' }];
  const b = ML.projBoard(chat, [], { title: 'P', topics: ['מצגת'] }, stampFn);
  assert.equal(b.topics[0].rows.length, 0);
});
