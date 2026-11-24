'use strict';
// 24.11.2026: the chat asks the calls archive only for a customer with "calls": true (lib/calls-index.js promptLines, CLI).
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');

test('worker: the archive prompt lines and the search tool come only with inst.calls === true', () => {
  assert.ok(/inst\.calls === true \? require\('\.\/lib\/calls-index\.js'\)\.promptLines\(inst\.dataPath\) : \[\]/.test(src), 'prompt lines gated');
  assert.ok(/inst\.calls === true \? \['Bash\(node lib\/calls-index\.js:\*\)'\] : \[\]/.test(src), 'tool gated');
  assert.strictEqual((src.match(/calls-index\.js/g) || []).length, 2, 'nowhere else');
});

test('promptLines name the search command and forbid inventing', () => {
  const l = require('../lib/calls-index.js').promptLines().join('\n');
  assert.ok(l.includes('node lib/calls-index.js search'));
  assert.ok(/להמציא/.test(l));
});
