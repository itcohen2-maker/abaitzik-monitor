'use strict';
// 23.11.2026: a signup made in Russian gives a Russian monitor and Russian mails; anything else stays Hebrew.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../lib/signup.js');
const M = require('../lib/mailer.js');
const RU = require('../lib/signup-ru.js');
const P = require('../lib/signup-profile.js');
const N = require('../lib/trial-nudge.js');
const QK = require('../lib/wa-quick.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'signup-ru-'));
const T0 = Date.UTC(2026, 10, 23, 10, 0, 0);
const who = (o) => Object.assign({ name: 'Анна', phone: '052-123-4567', email: 'anna@example.com', terms: true, ip: '1.2.3.4' }, o || {});
const queued = (d, id) => JSON.parse(fs.readFileSync(path.join(d, 'signup', 'queue', id + '.json'), 'utf8'));
const hasHebrew = (s) => /[֐-׿]/.test(s);

test('lang ru is kept with the pending signup, then on the queue entry', () => {
  const d = tmp();
  const r = S.start(d, who({ lang: 'ru' }), T0);
  assert.equal(r.ok, true); assert.equal(r.lang, 'ru');
  const pend = fs.readdirSync(path.join(d, 'signup', 'pending'))[0];
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'signup', 'pending', pend), 'utf8')).lang, 'ru');
  const v = S.verify(d, { email: 'anna@example.com', code: r.code }, T0 + 1000);
  assert.equal(v.ok, true); assert.equal(v.lang, 'ru');
  assert.equal(queued(d, v.id).lang, 'ru');
});

test('any lang other than ru is Hebrew and is not stored', () => {
  for (const bad of ['he', 'RU', 'ru ', 'en', '', null, undefined, 5, { lang: 'ru' }, ['ru']]) {
    const d = tmp();
    const r = S.start(d, who({ lang: bad }), T0);
    assert.equal(r.ok, true);
    assert.equal(r.lang, undefined, String(bad));
    const v = S.verify(d, { email: 'anna@example.com', code: r.code }, T0 + 1000);
    assert.equal(v.lang, '');
    assert.equal('lang' in queued(d, v.id), false);
  }
});

test('the code mail is Russian for ru and unchanged Hebrew otherwise', () => {
  const ru = M.codeMail('Анна', '123456', 'ru');
  assert.match(ru.subject, /123456/); assert.match(ru.subject, /Код подтверждения/);
  assert.ok(ru.text.includes('Ваш код подтверждения: 123456'));
  assert.ok(ru.text.includes('IT Solution'));
  assert.equal(hasHebrew(ru.subject + ru.text), false);
  const he = M.codeMail('רון', '123456');
  assert.deepStrictEqual(M.codeMail('רון', '123456', 'he'), he);
  assert.deepStrictEqual(M.codeMail('רון', '123456', ''), he);
  assert.ok(he.subject.startsWith('קוד אימות להרשמה'));
});

test('the ready mail keeps the link and the code, in Russian for ru', () => {
  const url = 'https://t123456.m.it-solution.co.il/#k=ABC123', pass = 'ABC123';
  const ru = M.readyMail('Анна', url, pass, 'ru');
  assert.equal(ru.subject, 'Ваш монитор готов');
  assert.ok(ru.text.includes(url)); assert.ok(ru.text.includes(': ' + pass));
  assert.equal(hasHebrew(ru.subject + ru.text), false);
  assert.deepStrictEqual(M.readyMail('רון', url, pass), M.readyMail('רון', url, pass, 'he'));
  assert.ok(M.readyMail('רון', url, pass).subject.includes('המוניטור שלך מוכן'));
});

test('the monitor is made Russian through instanceFields, only for ru', () => {
  assert.equal(P.instanceFields(null, 'ru').lang, 'ru');
  assert.equal(P.instanceFields({ gender: 'f' }, 'ru').lang, 'ru');
  assert.equal('lang' in P.instanceFields({ gender: 'f' }), false);
  assert.equal('lang' in P.instanceFields({ gender: 'f' }, 'he'), false);
});

test('trial week mails and WhatsApp lines have Russian versions', () => {
  const c = { name: 'Анна', url: 'https://t1.m.it-solution.co.il/', google: true, mails: 22, urgent: 3, daysLeft: 4, used: 12, total: 40, endText: 'в воскресенье в 10:00', lang: 'ru' };
  ['noEntry', 'idle', 'lastDay'].forEach((k) => {
    const m = N.mail(k, c);
    assert.equal(hasHebrew(m.subject + m.text), false, k);
    assert.ok(m.text.includes(c.url), k);
    const he = N.mail(k, Object.assign({}, c, { lang: '' }));
    assert.equal(hasHebrew(he.text), true, k);
  });
  assert.ok(N.mail('idle', c).text.includes('22 письма'.replace('письма', 'письма')));
  assert.equal(hasHebrew(RU.waText('wa1', 'https://wa.me/x')), false);
  assert.equal(hasHebrew(RU.endText(Date.UTC(2026, 10, 29, 8, 0))), false);
  Object.keys(RU.WA).forEach((k) => assert.equal(hasHebrew(RU.WA[k]), false, k));
});

test('tenantLang: the owner choice in Settings wins over instance.json', () => {
  const d = tmp();
  assert.equal(RU.tenantLang(d), '');
  fs.writeFileSync(path.join(d, 'instance.json'), JSON.stringify({ lang: 'ru' }));
  assert.equal(RU.tenantLang(d), 'ru');
  fs.mkdirSync(path.join(d, 'data', 'status'), { recursive: true });
  fs.writeFileSync(path.join(d, 'data', 'status', 'lang.json'), JSON.stringify({ lang: '' }));
  assert.equal(RU.tenantLang(d), '');
});

test('a Russian customer can disconnect WhatsApp in Russian, Hebrew still works', () => {
  assert.equal(QK.isDisconnect('отключить'), true);
  assert.equal(QK.isDisconnect('Отключить!'), true);
  assert.equal(QK.isDisconnect('ניתוק'), true);
  assert.equal(QK.isDisconnect('отключить мой счёт'), false);
});

test('the Russian tenant title and welcome carry the name', () => {
  const t = RU.tenantTexts('Анна');
  assert.ok(t.title.includes('Анна')); assert.ok(t.welcome.includes('Анна'));
  assert.equal(hasHebrew(t.title + t.welcome), false);
});
