'use strict';
/*
  12.11.2026, Itzik: "כן, תבנה את החיבור המהיר". The quick WhatsApp connect: the code, the bridge's handling of the
  connect phrase and "ניתוק", the root provisioning, and the states of the 🔌 row. No network, no real WhatsApp.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'waq-'));
process.env.WA_BRIDGE_DATA = DATA;
const bridge = require('../wa-bridge.js');
const QK = require('../lib/wa-quick.js');
const WT = require('../lib/wa-tenants.js');
const PROV = require('../lib/wa-quick-provision.js');
const CONN = require('../lib/connections.js');

const KEY = 'ab12cd34ef56ab12cd34ef56ab12cd34';
const KEY2 = 'cd34ef56ab12cd34ef56ab12cd34ab12';
const w = (rel, o) => { const f = path.join(DATA, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const r = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));
w('wa.json', { allow: ['972500000001'] });
w('fastchat/tenants.json', { t1a2b3c: { key: KEY, dir: '/x' }, t9z8y7x: { key: KEY2, dir: '/y' } });
w('tenants/tenants/t1a2b3c.json', { id: 't1a2b3c', title: 'מסעדת דוגמה', user: 't1a2b3c', dir: path.join(DATA, 'home-t1') });
w('tenants/tenants/t9z8y7x.json', { id: 't9z8y7x', title: 'חנות', user: 't9z8y7x', dir: path.join(DATA, 'home-t9') });
fs.mkdirSync(path.join(DATA, 'home-t1'), { recursive: true });

const sent = [];
bridge._set({ waSend: async (to, text) => { sent.push([to, text]); return 'id'; }, markRead: () => {}, push: () => {} });
let n = 0;
const msg = (from, body) => ({ id: 'wamid.q' + (++n), from, type: 'text', text: { body } });
const phraseOf = (c) => QK.PHRASE + c;
const C1 = QK.code(KEY, 't1a2b3c');

test('code: 10 base32 characters, deterministic, per tenant and per key, unguessable without the key', () => {
  assert.match(C1, /^[A-Z2-7]{10}$/);
  assert.strictEqual(C1, QK.code(KEY, 't1a2b3c'));
  assert.notStrictEqual(C1, QK.code(KEY, 't9z8y7x'));
  assert.notStrictEqual(C1, QK.code(KEY2, 't1a2b3c'));
  assert.strictEqual(QK.code('short', 't1a2b3c'), '');
  assert.strictEqual(QK.code(KEY, '../x'), '');
});

test('link: wa.me on the shared number with the encoded phrase and code', () => {
  const l = QK.link(C1);
  assert.ok(l.startsWith('https://wa.me/' + WT.SHARED_PHONE + '?text='));
  assert.strictEqual(WT.SHARED_PHONE, '972528074881');
  assert.strictEqual(decodeURIComponent(l.split('?text=')[1]), 'היי, אני רוצה לחבר את הוואטסאפ שלי למוניטור. קוד: ' + C1);
  assert.strictEqual(QK.link(''), '');
});

test('parse and resolve: the code is found in the phrase (any case, direction marks), only the right tenant resolves', () => {
  assert.strictEqual(QK.parse(phraseOf(C1)), C1);
  assert.strictEqual(QK.parse('קוד:‏ ' + C1.toLowerCase() + '.'), C1);
  assert.strictEqual(QK.parse('קוד: abc'), '');
  assert.strictEqual(QK.resolve(DATA, C1), 't1a2b3c');
  assert.strictEqual(QK.resolve(DATA, QK.code(KEY2, 't9z8y7x')), 't9z8y7x');
  assert.strictEqual(QK.resolve(DATA, 'AAAAAAAAAA'), '');
  assert.strictEqual(QK.resolve(DATA, ''), '');
  assert.ok(QK.isDisconnect('ניתוק') && QK.isDisconnect(' תתנתק! ') && !QK.isDisconnect('ניתוק של הקו שלי בבקשה'));
});

test('bridge: a valid code leaves a pending file and answers at once', async () => {
  sent.length = 0;
  await bridge.onMessage(msg('972521111111', phraseOf(C1)), 'דני');
  const p = r('wa-tenants-pending/t1a2b3c.json');
  assert.strictEqual(p.op, 'add'); assert.strictEqual(p.tenant, 't1a2b3c'); assert.strictEqual(p.phone, '972521111111'); assert.strictEqual(p.name, 'דני'); assert.ok(p.at);
  assert.deepStrictEqual(sent, [['972521111111', '✓ מחבר אותך למוניטור שלך. תוך דקה אפשר לכתוב לי כאן כל בקשה.']]);
});

test('bridge: a wrong code gets one polite line, no file, and at most 3 replies a day per number', async () => {
  sent.length = 0;
  for (let i = 0; i < 5; i++) await bridge.onMessage(msg('972522222222', 'היי, אני רוצה לחבר את הוואטסאפ שלי למוניטור. קוד: ZZZZZZZZZZ'), 'x');
  assert.strictEqual(sent.length, 3, 'the 4th and 5th are silent');
  assert.ok(/הקוד לא תקין/.test(sent[0][1]));
  assert.ok(!fs.existsSync(path.join(DATA, 'wa-tenants-pending', 'zzz.json')));
  assert.ok(!QK.allowReply(DATA, '972522222222'));
  assert.ok(QK.allowReply(DATA, '972522222222', Date.now() + 36 * 3600e3), 'the next day it counts again');
});

test('bridge: an unknown sender who does not write the phrase gets no answer (as before)', async () => {
  sent.length = 0;
  await bridge.onMessage(msg('972523333333', 'שלום מי זה'), 'x');
  assert.strictEqual(sent.length, 0);
});

test('bridge: a number already mapped to another monitor is refused, never remapped', async () => {
  WT.add(DATA, '972524444444', { tenant: 't9z8y7x', name: 'חנות' });
  sent.length = 0;
  await bridge.onMessage(msg('972524444444', phraseOf(C1)), 'x');
  assert.ok(/כבר מחובר למוניטור אחר/.test(sent[0][1]) && /IT Solution/.test(sent[0][1]));
  assert.ok(!fs.existsSync(path.join(DATA, 'wa-tenants-pending', 't1a2b3c.json')) || r('wa-tenants-pending/t1a2b3c.json').phone !== '972524444444');
  assert.strictEqual(WT.lookup(DATA, '972524444444').tenant, 't9z8y7x');
  // his own code from the same number is just "already connected"
  sent.length = 0;
  await bridge.onMessage(msg('972524444444', phraseOf(QK.code(KEY2, 't9z8y7x'))), 'x');
  assert.ok(/כבר מחובר למוניטור שלך/.test(sent[0][1]));
});

test('bridge: a phone waiting for another tenant is not taken', async () => {
  fs.rmSync(path.join(DATA, 'wa-tenants-pending'), { recursive: true, force: true });
  QK.writePending(DATA, { op: 'add', tenant: 't9z8y7x', phone: '972525555555', name: 'a' });
  sent.length = 0;
  await bridge.onMessage(msg('972525555555', phraseOf(C1)), 'x');
  assert.ok(/לפנות אל IT Solution/.test(sent[0][1]));
  assert.ok(!fs.existsSync(path.join(DATA, 'wa-tenants-pending', 't1a2b3c.json')));
});

test('bridge: "ניתוק" from a mapped number leaves a remove request', async () => {
  sent.length = 0;
  await bridge.onMessage(msg('972524444444', 'ניתוק'), 'x');
  const p = r('wa-tenants-pending/t9z8y7x.json');
  assert.strictEqual(p.op, 'remove'); assert.strictEqual(p.phone, '972524444444');
  assert.ok(/מנתק/.test(sent[0][1]));
  // from an unknown number it is nothing
  sent.length = 0;
  await bridge.onMessage(msg('972526666666', 'ניתוק'), 'x');
  assert.strictEqual(sent.length, 0);
});

test('bridge: a mapped customer\'s ordinary message still goes to tenantMessage (not the connect path)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'wa-bridge.js'), 'utf8');
  assert.ok(/if \(tn\) return tenantMessage\(m, tn, contactName\)/.test(src));
});

test('bridge: the outbox is sent once as free text and deleted', async () => {
  QK.outbox(DATA, '972521111111', 'שלום');
  QK.outbox(DATA, 'not-a-number', 'x');
  sent.length = 0;
  bridge.outboxSweep();
  await new Promise((res) => setTimeout(res, 20));
  assert.deepStrictEqual(sent, [['972521111111', 'שלום']]);
  assert.deepStrictEqual(fs.readdirSync(path.join(DATA, 'wa-outbox')), []);
});

// ---- root provisioning ----
function fakeExec(calls) {
  return (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'node' && /wa-tenants\.js$/.test(args[0])) {
      if (args[1] === 'add') WT.add(DATA, args[2], { tenant: args[3], name: args[4] });
      if (args[1] === 'remove') WT.remove(DATA, args[2]);
      if (args[1] === 'approved') { const a = WT.all(DATA); a[args[2]].approved = true; fs.writeFileSync(path.join(DATA, 'wa-tenants.json'), JSON.stringify(a)); }
    }
  };
}

test('provision: add maps the number, writes his status, rebuilds as him, pushes once, confirms, moves the file', () => {
  fs.rmSync(path.join(DATA, 'wa-tenants-pending'), { recursive: true, force: true });
  fs.rmSync(path.join(DATA, 'wa-outbox'), { recursive: true, force: true });
  QK.writePending(DATA, { op: 'add', tenant: 't1a2b3c', phone: '972521111111', name: 'דני' });
  const calls = [];
  const out = PROV.run(DATA, { exec: fakeExec(calls), root: '/R', log: () => {} });
  assert.deepStrictEqual(out.done, ['t1a2b3c']);
  assert.strictEqual(WT.all(DATA)['972521111111'].tenant, 't1a2b3c');
  assert.ok(WT.all(DATA)['972521111111'].approved);
  const st = JSON.parse(fs.readFileSync(path.join(DATA, 'home-t1', 'data', 'conn', 'wa.json'), 'utf8'));
  assert.strictEqual(st.phone, '972521111111'); assert.strictEqual(st.via, 'shared');
  assert.ok(calls.some((c) => c[0] === 'sudo' && c.includes('t1a2b3c') && c.includes('build.js')), 'page rebuilt as the tenant');
  const pushes = calls.filter((c) => c[0] === 'sudo' && /notify\.js$/.test(c[4]));
  assert.strictEqual(pushes.length, 1);
  assert.strictEqual(pushes[0][5], '💬 מסעדת דוגמה התחבר לוואטסאפ במוניטור');
  const ob = fs.readdirSync(path.join(DATA, 'wa-outbox'));
  assert.strictEqual(ob.length, 1);
  assert.strictEqual(r('wa-outbox/' + ob[0]).to, '972521111111');
  assert.deepStrictEqual(fs.readdirSync(path.join(DATA, 'wa-tenants-pending')), []);
  assert.strictEqual(fs.readdirSync(path.join(DATA, 'wa-tenants-done')).length, 1);
  // running again changes nothing
  assert.deepStrictEqual(PROV.run(DATA, { exec: fakeExec([]), root: '/R', log: () => {} }), { done: [], failed: [] });
});

test('provision: a number mapped to another tenant is refused and never remapped', () => {
  fs.rmSync(path.join(DATA, 'wa-outbox'), { recursive: true, force: true });
  QK.writePending(DATA, { op: 'add', tenant: 't1a2b3c', phone: '972524444444', name: 'x' });
  const calls = [];
  PROV.run(DATA, { exec: fakeExec(calls), root: '/R', log: () => {} });
  assert.strictEqual(WT.lookup(DATA, '972524444444').tenant, 't9z8y7x');
  assert.ok(!calls.some((c) => c[0] === 'node' && c[2] === 'add'));
  assert.ok(/כבר מחובר למוניטור אחר/.test(r('wa-outbox/' + fs.readdirSync(path.join(DATA, 'wa-outbox'))[0]).text));
});

test('provision: remove drops the mapping and his status, rebuilds, confirms; a missing tenant keeps the file and counts tries', () => {
  fs.rmSync(path.join(DATA, 'wa-outbox'), { recursive: true, force: true });
  fs.rmSync(path.join(DATA, 'wa-tenants-pending'), { recursive: true, force: true });
  QK.writePending(DATA, { op: 'remove', tenant: 't1a2b3c', phone: '972521111111' });
  const calls = [];
  PROV.run(DATA, { exec: fakeExec(calls), root: '/R', log: () => {} });
  assert.strictEqual(WT.lookup(DATA, '972521111111'), null);
  assert.ok(!fs.existsSync(path.join(DATA, 'home-t1', 'data', 'conn', 'wa.json')));
  assert.ok(calls.some((c) => c.includes('build.js')));
  assert.ok(/ניתקתי/.test(r('wa-outbox/' + fs.readdirSync(path.join(DATA, 'wa-outbox'))[0]).text));
  QK.writePending(DATA, { op: 'add', tenant: 'nosuch', phone: '972521111112', name: 'x' });
  const out = PROV.run(DATA, { exec: fakeExec([]), root: '/R', log: () => {} });
  assert.deepStrictEqual(out.failed, ['nosuch']);
  assert.strictEqual(r('wa-tenants-pending/nosuch.json').tries, 1);
});

test('wa-tenants remove: only a mapped number', () => {
  WT.add(DATA, '972527777777', { tenant: 't1a2b3c', name: 'x' });
  assert.strictEqual(WT.remove(DATA, '972527777777').tenant, 't1a2b3c');
  assert.strictEqual(WT.remove(DATA, '972527777777'), null);
  assert.strictEqual(WT.remove(DATA, 'abc'), null);
});

// ---- the 🔌 row ----
function conn(plan, name, F, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wqconn-'));
  Object.keys(files || {}).forEach((f) => { const p = path.join(d, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof files[f] === 'string' ? files[f] : JSON.stringify(files[f])); });
  return CONN.list(d, name, F, { tok: 'a1b2c3d4e5f60718', setupDir: d }, plan).rows.find((x) => x.id === 'wa');
}

test('row, not connected: the primary action is the quick connect link, no own number link by default', () => {
  const row = conn('basic', 't1a2b3c', { wa: true }, { 'fc-key.txt': KEY });
  assert.strictEqual(row.on, false);
  assert.strictEqual(row.link, QK.link(QK.code(KEY, 't1a2b3c')));
  assert.strictEqual(row.linkLabel, 'חיבור מהיר');
  assert.ok(!row.link2);
  assert.strictEqual(QK.resolve(DATA, QK.code(KEY, 't1a2b3c')), 't1a2b3c', 'the page and the bridge agree on the code');
});

test('row, flag waOwn: the own number link appears as a second, smaller action', () => {
  const row = conn('basic', 't1a2b3c', { wa: true, waOwn: true }, { 'fc-key.txt': KEY });
  assert.ok(/^https:\/\/wa\.me\//.test(row.link));
  assert.strictEqual(row.link2, 'https://wa.abaitzik.com/api/wa/connect?t=t1a2b3c&c=' + KEY);
  assert.strictEqual(row.link2Label, 'מספר משלך, בשם העסק שלך');
});

test('row, quick connected: ✓ with the masked phone, no connect link, and how to disconnect', () => {
  const row = conn('basic', 't1a2b3c', { wa: true, waOwn: true }, { 'fc-key.txt': KEY, 'conn/wa.json': { phone: '972521234567', via: 'shared' } });
  assert.strictEqual(row.on, true);
  assert.strictEqual(row.who, '052 ••• 4567');
  assert.ok(!row.link && !row.link2);
  assert.ok(/ניתוק/.test(row.note));
});

test('row: without a code it stays the old coordinated text; a locked plan stays locked; the feature flag is known', () => {
  const none = conn('basic', 't1a2b3c', { wa: true }, {});
  assert.ok(!none.link && /בתיאום/.test(none.paid));
  assert.ok(require('../lib/features.js').read(os.tmpdir(), 'x').waOwn === false);
});
