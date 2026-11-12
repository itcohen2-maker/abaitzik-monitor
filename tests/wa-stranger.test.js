'use strict';
/*
  12.11.2026, Itzik: "כל מי שכותב למספר ואינו לקוח ייכנס כליד אצלך ויקבל תשובה אוטומטית."
  A stranger on the shared number becomes a lead (biz record + 📋 לטיפול item + push) and gets one auto reply a day.
  No network, no real WhatsApp: the bridge is given fake send, notify and handle.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wast-'));
process.env.WA_BRIDGE_DATA = DATA;
const bridge = require('../wa-bridge.js');
const ST = require('../lib/wa-stranger.js');
const H = require('../lib/handle.js');
const QK = require('../lib/wa-quick.js');

const KEY = 'ab12cd34ef56ab12cd34ef56ab12cd34';
const w = (rel, o) => { const f = path.join(DATA, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
w('wa.json', { allow: ['972500000001'] });
w('fastchat/tenants.json', { t1a2b3c: { key: KEY, dir: '/x' } });
w('tenants/tenants/t1a2b3c.json', { id: 't1a2b3c', title: 'מסעדה', user: 't1a2b3c', dir: path.join(DATA, 'home-t1') });
fs.mkdirSync(path.join(DATA, 'home-t1'), { recursive: true });

const sent = [], pushes = [];
bridge._set({
  waSend: async (to, text) => { sent.push([to, text]); return 'id'; }, markRead: () => {}, push: () => {},
  stranger: {
    handle: (o) => H.add(DATA, o),
    publish: () => {},
    notify: (title, text) => pushes.push([title, text]),
    voice: async () => 'שלום אני מחפש מוניטור',
  },
});
let n = 0;
const msg = (from, body, extra) => Object.assign({ id: 'wamid.s' + (++n), from, type: 'text', text: { body } }, extra || {});
const leads = () => { const d = path.join(DATA, 'biz', 'biz'); try { return fs.readdirSync(d).map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))); } catch (e) { return []; } };
const reset = () => { sent.length = 0; pushes.length = 0; };

test('a stranger becomes a lead: record, one item in לטיפול, one push, one reply', async () => {
  reset();
  await bridge.onMessage(msg('972521111111', 'היי, אני רוצה מוניטור לעסק'), 'דנה לוי');
  const L = leads();
  assert.strictEqual(L.length, 1);
  assert.strictEqual(L[0].kind, 'lead');
  assert.strictEqual(L[0].name, 'דנה לוי');
  assert.strictEqual(L[0].phone, '0521111111');
  assert.strictEqual(L[0].source, 'whatsapp');
  assert.strictEqual(L[0].ref, 'whatsapp');
  assert.strictEqual(L[0].status, 'חדש');
  assert.match(L[0].note, /היי, אני רוצה מוניטור לעסק/);
  assert.strictEqual(H.open(DATA).length, 1);
  assert.strictEqual(H.open(DATA)[0].kind, 'lead');
  assert.strictEqual(H.open(DATA)[0].link, 'biz');
  assert.ok(!/[-‐‑‒–—]/.test(H.open(DATA)[0].title));
  assert.strictEqual(pushes.length, 1);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0][0], '972521111111');
  assert.strictEqual(sent[0][1], ST.REPLY);
});

test('a second message within 24h is appended: same record, same item, no second reply, no second push', async () => {
  reset();
  await bridge.onMessage(msg('972521111111', 'ושאלה על המחיר'), 'דנה לוי');
  const L = leads();
  assert.strictEqual(L.length, 1);
  assert.match(L[0].note, /היי, אני רוצה מוניטור לעסק/);
  assert.match(L[0].note, /\d\d:\d\d: ושאלה על המחיר/);
  assert.strictEqual(L[0].last, 'ושאלה על המחיר');
  assert.strictEqual(H.open(DATA).length, 1);
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(pushes.length, 0);
});

test('a name falls back to the number; a voice note is transcribed; other media is only noted', async () => {
  reset();
  await bridge.onMessage(msg('972522222222', '', { type: 'audio', audio: { id: 'm1' } }), '');
  await bridge.onMessage(msg('972523333333', '', { type: 'image', image: { id: 'img1', caption: 'הלוגו שלי' } }), 'רן');
  const L = leads();
  const v = L.find((x) => x.phone === '0522222222');
  assert.strictEqual(v.name, '0522222222');
  assert.match(v.note, /🎙️ שלום אני מחפש מוניטור/);
  const im = L.find((x) => x.phone === '0523333333');
  assert.match(im.note, /\(שלח תמונה\) הלוגו שלי/);
  assert.strictEqual(sent.length, 2);
});

test('the push is once per 2 hours per number, the reply once per 24 hours, a new day is a new lead', async () => {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wast2-'));
  const out = { sent: [], pushes: [] };
  const deps = (now) => ({ now, name: 'ג', textOf: (m) => m.text.body, handle: (o) => H.add(D, o), notify: (t, b) => out.pushes.push([t, b]), send: async (to) => { out.sent.push(to); } });
  const T0 = Date.parse('2026-11-12T08:00:00Z');
  const M = (t) => ({ id: 'x' + t, from: '972524444444', type: 'text', text: { body: 'א' + t } });
  let r = await ST.intake(D, M(1), deps(T0));
  assert.ok(r.created && r.replied && r.pushed);
  r = await ST.intake(D, M(2), deps(T0 + 3 * 3600e3));
  assert.ok(!r.created && r.pushed && !r.replied);
  r = await ST.intake(D, M(3), deps(T0 + 3.5 * 3600e3));
  assert.ok(!r.created && !r.pushed && !r.replied);
  r = await ST.intake(D, M(4), deps(T0 + 30 * 3600e3));
  assert.ok(r.created && r.replied && r.pushed);
  assert.strictEqual(out.sent.length, 2);
  assert.strictEqual(H.open(D).length, 2);
});

test('the shared unknown sender limit (3 a day) stops the reply', async () => {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wast3-'));
  let sentN = 0;
  const T0 = Date.parse('2026-11-12T01:00:00Z');
  for (let i = 0; i < 3; i++) QK.allowReply(D, '972525555555', T0);
  const r = await ST.intake(D, { id: 'q', from: '972525555555', type: 'text', text: { body: 'שלום' } },
    { now: T0, textOf: (m) => m.text.body, handle: (o) => H.add(D, o), notify: () => {}, send: async () => { sentN++; } });
  assert.ok(r.created && !r.replied);
  assert.strictEqual(sentN, 0);
});

test('untouched: Itzik (allow), a connect phrase and a disconnect word from a stranger never become leads', async () => {
  reset();
  const before = leads().length, hb = H.open(DATA).length;
  await bridge.onMessage(msg('972500000001', 'מה המצב'), 'איציק');
  await bridge.onMessage(msg('972526666666', QK.PHRASE + QK.code(KEY, 't1a2b3c')), 'לקוחה');
  await bridge.onMessage(msg('972527777777', 'ניתוק'), 'מישהו');
  assert.strictEqual(leads().length, before);
  assert.strictEqual(H.open(DATA).length, hb);
  assert.ok(!sent.some((s) => s[1] === ST.REPLY));
  assert.strictEqual(pushes.length, 0);
});
