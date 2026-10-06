'use strict';
// The customer's request to the admin is filed by the listener itself (6.10).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'listen.js'), 'utf8');

test('a request to the admin is filed by code, only on a customer instance, only when the code is verified', () => {
  const i = src.indexOf("/^\\s*(?:משימה)?\\s*בקשה ממנהל\\s*[:：]/.test(text)");
  assert.ok(i > 0, 'the intake must match the request prefix');
  const guard = src.slice(i - 80, i + 20);
  assert.ok(guard.includes("codeOk && inst.name !== 'abaitzik'"), 'guard: verified code, never on Itzik\'s own instance');
  const body = src.slice(i, i + 900);
  assert.ok(body.includes("require('./lib/change-requests.js')") && body.includes('cr.add('), 'files through the change-requests library');
  assert.ok(body.includes("rec.status = 'done'"), 'closes the message so no session answers it again');
});
