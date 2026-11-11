'use strict';
// 11.11.2026, Itzik: a questionnaire while the trial monitor is built, and a welcome that is his alone.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const P = require('../lib/signup-profile.js');
const S = require('../lib/signup.js');

test('answers are cleaned: unknown values drop, at most three pains, text trimmed', () => {
  const a = P.sanitize({ biz: 'clinic', pains: ['money', 'x', 'leads', 'cal', 'mail'], talk: 'voice', bizName: ' <b>קליניקה</b> ', wish: 'שיזכיר לי', connect: 'nope' });
  assert.deepStrictEqual(a.pains, ['money', 'leads', 'cal']);
  assert.strictEqual(a.connect, '');
  assert.ok(!/[<>]/.test(a.bizName));
  assert.strictEqual(P.sanitize({}), null);
});

test('the welcome speaks his answers, no dashes', () => {
  const w = P.welcome('דנה', P.sanitize({ biz: 'clinic', pains: ['money'], talk: 'voice', bizName: 'הקליניקה של דנה', wish: 'לסדר את החייבים' }));
  assert.match(w.title, /דנה/);
  assert.match(w.body, /הקליניקה של דנה/);
  assert.match(w.body, /לקוחות שלא משלמים/);
  assert.match(w.body, /לסדר את החייבים/);
  assert.match(w.body, /מיקרופון/);
  assert.match(w.body, /חיבורים/);
  assert.ok(!/[–—]| - /.test(w.body + w.title));
});

test('the page token saves the answers and reads the status, a wrong token does not', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-'));
  try {
    const st = S.start(d, { name: 'דנה', email: 'dana@example.com', terms: true, ip: '1.1.1.1' }, Date.now());
    const f = path.join(d, 'signup', 'pending'); const pend = JSON.parse(fs.readFileSync(path.join(f, fs.readdirSync(f)[0]), 'utf8'));
    assert.ok(st.ok && pend);
    const v = S.verify(d, { email: 'dana@example.com', code: st.code });
    assert.ok(v.ok && /^[a-f0-9]{32}$/.test(v.pt));
    assert.strictEqual(S.saveProfile(d, { id: v.id, pt: 'f'.repeat(32), answers: { biz: 'shop' } }).ok, false);
    assert.ok(S.saveProfile(d, { id: v.id, pt: v.pt, answers: { biz: 'shop', pains: ['leads'] } }).ok);
    const s = S.status(d, { id: v.id, pt: v.pt });
    assert.ok(s.ok && s.state === 'queued' && !s.ready && s.host === '');
    const q = JSON.parse(fs.readFileSync(path.join(d, 'signup', 'queue', v.id + '.json'), 'utf8'));
    assert.strictEqual(q.profile.biz, 'shop');
    assert.ok(!JSON.stringify(q).includes(v.pt));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
