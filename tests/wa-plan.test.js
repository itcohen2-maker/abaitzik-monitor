'use strict';
/*
  4.11.2026, the plan after the Instinct comparison: the monitor speaks first once a
  day (open-loops + wa-daily), a long answer comes short with a link (#ans=), a quoted
  reply continues its thread, and each number belongs to one monitor only.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const loops = require('../lib/open-loops.js');
const out = require('../lib/wa-out.js');
const bridge = require('../wa-bridge.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'waplan-'));

test('the daily message says only what is new, and nothing when nothing is new', () => {
  const items = [{ key: 'a', t: 'ליד פתוח: רון' }, { key: 'b', t: 'ההצעה לשי נפתחה ועוד לא נחתמה' }];
  const first = loops.message(items, [], 'https://x/');
  assert.ok(first.includes('• ליד פתוח: רון') && first.includes('• ההצעה לשי'));
  assert.ok(first.includes('הכל במוניטור: https://x/'));
  const second = loops.message(items.concat([{ key: 'c', t: 'מחכה לאישור שלך: משהו' }]), ['a', 'b'], '');
  assert.ok(second.includes('• מחכה לאישור שלך: משהו'));
  assert.ok(!second.includes('רון'), 'old items are only counted');
  assert.ok(second.includes('ועוד 2 ששלחתי קודם ועדיין פתוחים.'));
  assert.strictEqual(loops.message(items, ['a', 'b'], ''), null);
  assert.ok(!/[-‐-―־]/.test(first + second), 'no dashes in what he reads');
});

test('quotes and forms: opened and not done count, signed and filled do not', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'sign')); fs.mkdirSync(path.join(d, 'forms'));
  fs.writeFileSync(path.join(d, 'sign', 'aa.def.json'), JSON.stringify({ client: 'שי בודק' }));
  fs.writeFileSync(path.join(d, 'sign', 'aa.json'), JSON.stringify({ openedAt: '2026-11-02T09:00:00Z' }));
  fs.writeFileSync(path.join(d, 'sign', 'bb.def.json'), JSON.stringify({ client: 'אחר' }));
  fs.writeFileSync(path.join(d, 'sign', 'bb.json'), JSON.stringify({ openedAt: 'x', signedAt: 'y' }));
  fs.writeFileSync(path.join(d, 'sign', 'cc.def.json'), JSON.stringify({ client: 'טיוטה' }));
  fs.writeFileSync(path.join(d, 'forms', 'ff.def.json'), JSON.stringify({ client: 'שי בודק', title: 'טופס חיבורים' }));
  fs.writeFileSync(path.join(d, 'forms', 'ff.json'), JSON.stringify({ openedAt: 'x' }));
  fs.writeFileSync(path.join(d, 'forms', 'gg.def.json'), JSON.stringify({ client: 'שי', title: 'מולא' }));
  fs.writeFileSync(path.join(d, 'forms', 'gg.json'), JSON.stringify({ openedAt: 'x', submittedAt: 'y' }));
  const q = loops.quotes(d);
  assert.deepStrictEqual(q.map((x) => x.key), ['quote:aa']);
  assert.ok(q[0].t.includes('שי בודק נפתחה ועוד לא נחתמה'));
  const f = loops.forms(d);
  assert.deepStrictEqual(f.map((x) => x.key), ['form:ff']);
});

test('leads and his waiting requests; money never appears', () => {
  const now = Date.parse('2026-11-04T10:00:00Z');
  const l = loops.leads({ now, contacts: [
    { name: 'רון', at: '2026-11-01T10:00:00Z', status: 'לטיפול', network: 'אתר' },
    { name: 'סגור', at: '2026-11-03T10:00:00Z', status: 'done' },
    { name: 'ישן', at: '2026-09-01T10:00:00Z', status: 'לטיפול' }] });
  assert.strictEqual(l.length, 1);
  assert.ok(l[0].t.includes('רון') && l[0].t.includes('מחכה 3 ימים'));
  const w = loops.waiting({ now, chat: [
    { id: 'q1', from: 'itzik', at: '2026-11-04T06:00:00Z', text: 'וואטסאפ\nתבדוק את הדוח' },
    { id: 'q2', from: 'itzik', at: '2026-11-04T06:00:00Z', text: 'נענה' },
    { from: 'claude', re: 'q2', at: '2026-11-04T06:10:00Z', text: 'x' },
    { id: 'q3', from: 'itzik', at: '2026-11-04T09:30:00Z', text: 'טרי מדי' }] });
  assert.deepStrictEqual(w.map((x) => x.key), ['wait:q1']);
  assert.ok(w[0].t.endsWith('תבדוק את הדוח'));
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'open-loops.js'), 'utf8');
  assert.ok(!/overdueDebtors|debts/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'no money in the daily message');
});

test('a template parameter is one line and short', () => {
  const s = out.oneLine('מה פתוח היום:\n• א\n• ב\n\nהכל במוניטור');
  assert.ok(!/[\r\n\t]/.test(s) && !/ {4}/.test(s));
  assert.ok(out.oneLine('א '.repeat(2000)).length <= 900);
});

test('a long answer goes short with a link and "הכל", a short one goes as is', () => {
  const long = 'פתיחה קצרה. '.repeat(10) + '\n\n' + 'המשך ארוך '.repeat(150);
  const s = bridge.shortOf(long, 'ntfy-abc');
  assert.ok(s && s.length < 700);
  assert.ok(s.startsWith('פתיחה קצרה.'));
  assert.ok(s.includes('#ans=ntfy-abc'));
  assert.ok(s.includes('כתוב "הכל"'));
  assert.strictEqual(bridge.shortOf('תשובה קצרה', 'x'), null);
  assert.ok(bridge.isAllCommand('הכל') && bridge.isAllCommand('את כל התשובה'));
  assert.ok(!bridge.isAllCommand('הכל בסדר?'));
});

test('the bridge: quoted replies continue the thread, routes keep numbers apart, alerts copy only priority 5', () => {
  const src = fs.readFileSync(path.join(ROOT, 'wa-bridge.js'), 'utf8');
  assert.ok(src.includes('m.context && m.context.id ? waOut.recall(DATA, m.context.id)'));
  assert.ok(src.includes('if (re) rec.re = re;'));
  assert.ok(src.includes("if (dest === 'other')") && src.includes("if (dest === 'unknown')"));
  assert.ok(src.includes('sl.lastIn[m.from] = Date.now()'), 'the 24 hour window is tracked');
  const nc = fs.readFileSync(path.join(ROOT, 'lib', 'notify-channels.js'), 'utf8');
  assert.ok(nc.includes('Number(opts.priority) >= 5') && nc.includes("kind: 'alert'"));
  const page = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  assert.ok(page.includes("var mm=/^#ans=(.+)$/.exec(location.hash||'')"));
  assert.ok(page.includes("if(ansOnly)return allAnswers().filter("));
});
