'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CS = require('../lib/contact-status.js');

test('parse and apply write status, never delete', () => {
  assert.deepStrictEqual(CS.parse('סטטוס ליד: דנה כהן · טופל\n\nקוד 1'), { name: 'דנה כהן', status: 'done' });
  assert.strictEqual(CS.parse('סטטוס ליד: x · משהו'), null);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-'));
  const dir = path.join(d, 'contacts', 'contacts'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ name: 'דנה כהן', test: true }));
  const r = CS.apply(d, 'דנה כהן', 'done', 1e12);
  assert.ok(r.ok);
  const o = JSON.parse(fs.readFileSync(path.join(dir, 'a.json'), 'utf8'));
  assert.strictEqual(o.status, 'done'); assert.ok(o.updatedAt);
  assert.strictEqual(CS.apply(d, 'אחר', 'done').ok, false);
  assert.ok(fs.existsSync(path.join(dir, 'a.json')));
});
