'use strict';
// 18.11.2026, final review of the leads board: a full ISO nextAt is read by its Israel day.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const O = require('../lib/leads-open.js');

function put(d, r) { fs.mkdirSync(path.join(d, 'biz', 'biz'), { recursive: true }); fs.writeFileSync(path.join(d, 'biz', 'biz', r.id + '.json'), JSON.stringify(r)); }
const base = { kind: 'lead', status: 'בשיחה', at: '2026-11-01T07:30:00Z', updatedAt: '2026-11-01T07:30:00Z', source: 'site', next: 'להציע דמו' };

test('leads-open: a reminder at 00:30 Israel is counted on its Israel day', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lopen-'));
  try {
    const now = Date.parse('2026-11-14T10:00:00Z'); // today 14.11, tomorrow 15.11
    put(d, Object.assign({}, base, { id: 'biz-a', name: 'מחר', nextAt: '2026-11-14T22:30:00.000Z' })); // 15.11 00:30
    put(d, Object.assign({}, base, { id: 'biz-b', name: 'מחרתיים', nextAt: '2026-11-15T22:30:00.000Z' })); // 16.11 00:30
    put(d, Object.assign({}, base, { id: 'biz-c', name: 'ישן', nextAt: '2026-11-14' }));
    const ls = O.lines(d, now);
    assert.strictEqual(ls.length, 2, ls.join('\n'));
    assert.ok(ls.find((l) => l.startsWith('מחר')).endsWith('להציע דמו מחר'));
    assert.ok(ls.find((l) => l.startsWith('ישן')).endsWith('להציע דמו היום'));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
