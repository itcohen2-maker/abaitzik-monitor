const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/*
  16.10.2026, Alon: his key's credit ran out and the worker started three
  sessions a minute for nine hours, each dying on "Credit balance is too low".
  The account saying no is a stop with a request to the manager, not a retry.
*/
const src = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const body = src.match(/function accountFailure\(text\) \{[\s\S]*?\n\}/)[0];
const accountFailure = new Function(body + '; return accountFailure;')();

test('the credit message is an account failure', () => {
  assert.strictEqual(accountFailure('{"is_error":true,"api_error_status":400,"result":"Credit balance is too low"}'), 'Credit balance is too low');
  assert.ok(accountFailure('authentication_error: invalid x-api-key'));
});

test('an ordinary failure is not', () => {
  assert.strictEqual(accountFailure('Command failed: claude -p ... max turns reached'), '');
  assert.strictEqual(accountFailure(''), '');
});

test('the close handler files the hold and main honours it for an hour', () => {
  assert.ok(src.includes('const why = accountFailure(String(res ? res.result || \'\' : out));'));
  assert.ok(src.includes('if (why) holdAccount(why);'));
  assert.ok(src.includes('if (accountHeld()) return;'));
  assert.ok(/const ACCOUNT_RETRY_MS = 60 \* 60 \* 1000;/.test(src));
  assert.ok(src.includes('releaseAccount();'));
});

test('the watchdog names the reason', () => {
  const wd = fs.readFileSync(path.join(__dirname, '..', 'watchdog.js'), 'utf8');
  assert.ok(wd.includes("'account-hold.json'"));
  assert.ok(wd.includes('החשבון של המפתח דוחה סשנים: '));
});
