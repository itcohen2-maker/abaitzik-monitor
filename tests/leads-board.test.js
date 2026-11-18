process.env.MONITOR_NO_GATE = '1';
'use strict';
// 18.11.2026: leads board (Monday style). Task 2: the lead fields reach the page.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bizRow } = require('../build.js');

test('bizRow: site, next and nextAt of a lead reach D.biz', () => {
  const row = bizRow({ id: 'l1', name: 'ערן', site: 'https://eran.co.il', next: 'להתקשר', nextAt: '2026-11-19T09:00:00.000Z', secret: 'x' });
  assert.equal(row.site, 'https://eran.co.il');
  assert.equal(row.next, 'להתקשר');
  assert.equal(row.nextAt, '2026-11-19T09:00:00.000Z');
  assert.equal(row.secret, undefined);
});
