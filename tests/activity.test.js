'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderPage } = require('../build');

const html = renderPage({ builtAt: '2026-09-15T06:00:00Z' });
const start = html.indexOf('function renderActivity(){');
const end = html.indexOf('function updateDot(){', start);
assert.ok(start >= 0 && end > start);
const source = html.slice(start, end);
const now = Date.parse('2026-09-15T06:00:00Z');

function view(report) {
  const element = { innerHTML: '' };
  const context = {
    D: { now: report, builtAt: new Date(now).toISOString() },
    Date: class extends Date { static now() { return now; } },
    document: { getElementById: () => element },
    esc: s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    stamp: s => s,
    since: () => 'לפני זמן',
  };
  vm.runInNewContext(source + '\nrenderActivity();', context);
  return element.innerHTML;
}

test('an old work report remains historical after a new page build', () => {
  const output = view({ at: '2026-09-10T10:50:00Z', text: 'עובד על הבקשות שלך', next: 'בדיקת המשחק' });
  assert.ok(output.includes('אין דיווח עדכני על העבודה'));
  assert.ok(output.includes('בדיווח האחרון: עובד על הבקשות שלך'));
  assert.ok(output.includes('המשך שתוכנן אז: בדיקת המשחק'));
  assert.ok(output.includes('2026-09-10T10:50:00Z'));
  assert.ok(!output.includes('הבא בתור:'));
});

test('a recent report is attributed and does not claim a live worker', () => {
  const output = view({ at: '2026-09-15T05:59:00Z', text: 'בודק' });
  assert.ok(output.includes('<b>דיווח אחרון על העבודה</b>'));
  assert.ok(output.includes('הדיווח אינו מאשר שמתבצעת עבודה עכשיו.'));
});

test('a missing report does not imply idle or listening', () => {
  const output = view(null);
  assert.ok(output.includes('אין דיווח על העבודה'));
  assert.ok(!output.includes('שקט כרגע'));
});

test('missing, invalid and future timestamps never claim a recent report', () => {
  for (const at of [undefined, 'invalid', '2026-09-16T06:00:00Z']) {
    const output = view({ at, text: 'עובד' });
    assert.ok(output.includes('אין דיווח עדכני על העבודה'));
    assert.ok(output.includes('מועד הדיווח אינו ידוע'));
  }
});

test('activity becomes stale at 25 minutes and is refreshed in an open tab', () => {
  assert.ok(view({ at: new Date(now - 25 * 60000).toISOString() }).includes('אין דיווח עדכני'));
  assert.ok(html.includes('setInterval(renderActivity,30000);'));
});

test('report text remains escaped', () => {
  const output = view({ at: '2026-09-15T05:59:00Z', text: '<img src=x>', next: '<script>' });
  assert.ok(!output.includes('<img'));
  assert.ok(!output.includes('<script>'));
  assert.ok(output.includes('&lt;img'));
});
