'use strict';
// 21.11.2026 security review: the customer's SUMIT id is the last paid record in numeric order (10 after 9).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');

test('negative: a lexical sort would pick 9 over 10; the numeric order picks the record 10', () => {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'renew-sort-'));
  process.env.MONITOR_DATA = DATA;
  fs.mkdirSync(path.join(DATA, 'pay'), { recursive: true });
  fs.writeFileSync(path.join(DATA, 'pay', '9.json'), JSON.stringify({ tenant: 'ten1', customerId: 111 }));
  fs.writeFileSync(path.join(DATA, 'pay', '10.json'), JSON.stringify({ tenant: 'ten1', customerId: 222 }));
  const R = require('../setup/renewal-check.js');
  assert.equal(R.customerIdOf('ten1'), 222);
  assert.equal(R.customerIdOf('nobody'), null);
});
