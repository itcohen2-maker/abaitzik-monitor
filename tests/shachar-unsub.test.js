'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isRemovalRequest, senderAddress, applyRemovals } = require('../lib/shachar-unsub.js');

const TO = 'shachar@abaitzik.com';
const QUOTED = '\n\nבתאריך יום ג, 3 בנוב 2026 כתב שחר <shachar@abaitzik.com>:\n> להסרה מרשימת התפוצה: mailto:x (או להשיב למייל הזה במילה הסר).';

test('removal words in subject or body, to Shachar', () => {
  assert.ok(isRemovalRequest({ from: 'Dana <Dana@Example.com>', to: TO, subject: 'הסרה', body: '' }));
  assert.ok(isRemovalRequest({ from: 'a@b.co', to: TO, subject: 'Re: שחר', body: 'הסר אותי בבקשה' + QUOTED }));
  assert.ok(isRemovalRequest({ from: 'a@b.co', to: TO, subject: 'x', body: 'Please unsubscribe me' }));
  assert.ok(isRemovalRequest({ from: 'a@b.co', to: TO, subject: 'x', body: 'אפשר להסיר אותי?' }));
  assert.ok(isRemovalRequest({ from: 'a@b.co', to: '', subject: 'Re: שחר מוכן', body: 'remove me' }));
});

test('quoted footer of the letter does not count, nor mail not meant for Shachar', () => {
  assert.equal(isRemovalRequest({ from: 'a@b.co', to: TO, subject: 'Re: שחר מוכן', body: 'תודה רבה, אהבתי!' + QUOTED }), false);
  assert.equal(isRemovalRequest({ from: 'a@b.co', to: TO, subject: 'Re: x', body: 'תודה\n> להסרה מרשימת התפוצה' }), false);
  assert.equal(isRemovalRequest({ from: 'a@b.co', to: 'contact@abaitzik.com', subject: 'הסרה', body: '' }), false);
  assert.equal(isRemovalRequest({ from: 'Shachar <shachar@abaitzik.com>', to: TO, subject: 'הסרה', body: '' }), false);
});

test('senderAddress lowercases', () => {
  assert.equal(senderAddress('"Dana L" <Dana@Example.COM>'), 'dana@example.com');
  assert.equal(senderAddress('x@y.io'), 'x@y.io');
});

test('applyRemovals adds once, keeps other fields, mode 600, marks seen', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'unsub-'));
  fs.mkdirSync(path.join(d, 'shachar'));
  const f = path.join(d, 'shachar', 'state.json');
  fs.writeFileSync(f, JSON.stringify({ invites: [{ email: 'a@b.co' }], custom: 7, unsub: ['old@x.io'] }));
  const msgs = [{ uid: '1', from: 'A <A@B.co>', to: TO, subject: 'הסרה', body: '' }, { uid: '2', from: 'c@d.io', to: TO, subject: 'Re: שחר', body: 'תודה' }];
  const r = applyRemovals(d, msgs, []);
  assert.deepEqual(r.added, ['a@b.co']);
  assert.deepEqual(r.seen, ['1', '2']);
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual(s.unsub, ['old@x.io', 'a@b.co']);
  assert.equal(s.custom, 7);
  // Windows has no Unix permission bits (a file always reads back 0o666), so the mode is asserted only where it exists.
  if (process.platform !== 'win32') assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  assert.deepEqual(applyRemovals(d, msgs, ['1', '2']).added, []);
});
