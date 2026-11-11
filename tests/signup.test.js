'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../lib/signup.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'signup-'));
const T0 = Date.UTC(2026, 10, 11, 10, 0, 0);
const who = (o) => Object.assign({ name: 'רון כהן', phone: '052-123-4567', email: 'Ron@Example.com', terms: true, ip: '1.2.3.4' }, o || {});

test('start checks every field', () => {
  const d = tmp();
  assert.equal(S.start(d, who({ name: 'a' }), T0).error, 'name');
  assert.equal(S.start(d, who({ phone: '123' }), T0).error, 'phone');
  assert.equal(S.start(d, who({ email: 'nope' }), T0).error, 'email');
  assert.equal(S.start(d, who({ terms: false }), T0).error, 'terms');
  const r = S.start(d, who({ phone: '+972 52 123 4567' }), T0);
  assert.equal(r.ok, true);
  assert.match(r.code, /^\d{6}$/);
  assert.equal(r.email, 'ron@example.com');
});

test('the right code queues one monitor, a second click does not open another', () => {
  const d = tmp();
  const r = S.start(d, who(), T0);
  const v = S.verify(d, { email: 'ron@example.com', code: r.code }, T0 + 60e3);
  assert.equal(v.ok, true); assert.equal(v.fresh, true); assert.match(v.id, /^t[a-f0-9]{6}$/);
  const again = S.verify(d, { email: 'RON@example.com', code: r.code }, T0 + 70e3);
  assert.equal(again.ok, true); assert.equal(again.fresh, false); assert.equal(again.id, v.id);
  const q = JSON.parse(fs.readFileSync(path.join(d, 'signup', 'queue', v.id + '.json'), 'utf8'));
  assert.equal(q.phone, '0521234567'); assert.equal(q.state, 'queued');
});

test('a wrong code counts tries, then the code is gone', () => {
  const d = tmp();
  const r = S.start(d, who(), T0);
  const bad = r.code === '000000' ? '111111' : '000000';
  for (let i = 1; i < S.TRIES; i++) assert.equal(S.verify(d, { email: 'ron@example.com', code: bad }, T0).error, 'code');
  assert.equal(S.verify(d, { email: 'ron@example.com', code: bad }, T0).error, 'tries');
  assert.equal(S.verify(d, { email: 'ron@example.com', code: r.code }, T0).error, 'none');
});

test('a code expires after 15 minutes', () => {
  const d = tmp();
  const r = S.start(d, who(), T0);
  assert.equal(S.verify(d, { email: 'ron@example.com', code: r.code }, T0 + S.CODE_MS + 1).error, 'expired');
});

test('limits: 3 codes an hour per email, 10 per address', () => {
  const d = tmp();
  for (let i = 0; i < 3; i++) assert.equal(S.start(d, who(), T0 + i).ok, true);
  assert.equal(S.start(d, who(), T0 + 5).error, 'limit');
  assert.equal(S.start(d, who(), T0 + 3600e3 + 10).ok, true);
  const d2 = tmp();
  for (let i = 0; i < 10; i++) assert.equal(S.start(d2, who({ email: 'a' + i + '@x.co' }), T0 + i).ok, true);
  assert.equal(S.start(d2, who({ email: 'z@x.co' }), T0 + 20).error, 'limit');
});

test('the code is never stored in the clear', () => {
  const d = tmp();
  const r = S.start(d, who(), T0);
  const dirP = path.join(d, 'signup', 'pending');
  const txt = fs.readdirSync(dirP).map((f) => fs.readFileSync(path.join(dirP, f), 'utf8')).join('');
  assert.equal(txt.includes(r.code), false);
});

// 11.11.2026, Itzik: the signup is name and mail; a phone is optional.
test('a signup without a phone is fine, a wrong phone is not', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'su-'));
  try {
    const r = S.start(d, { name: 'רון', email: 'ron@example.com', terms: true, ip: '1.1.1.1' }, Date.now());
    assert.ok(r.ok);
    assert.equal(S.start(d, { name: 'רון', phone: '123', email: 'ron2@example.com', terms: true, ip: '1.1.1.2' }, Date.now()).error, 'phone');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
