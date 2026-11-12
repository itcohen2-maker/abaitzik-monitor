'use strict';
/*
  12.11.2026, Itzik: "תיתן לי אפשרות חוץ מטופל גם למחוק אותו, הליד שנכנס זה אני הייתי, הוא לא נחשב."
  "🗑 מחיקת ליד: <bizId>" (lib/lead-delete.js), the test marking of his own phone and mail (lib/own-leads.js), the page
  confirm. Nothing here calls push.js, publishSoon or notify: every side effect is a mock or never reached.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('../lib/lead-delete.js');
const OWN = require('../lib/own-leads.js');
const H = require('../lib/handle.js');
const L = require('../lib/leads.js');
const biz = require('../lib/biz.js');
const stranger = require('../lib/wa-stranger.js');

process.env.MONITOR_NO_GATE = '1';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lead-del-'));
const put = (d, rel, o) => { const f = path.join(d, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o), 'utf8'); return f; };
const ls = (p) => { try { return fs.readdirSync(p); } catch (e) { return []; } };
const AT = '2026-11-12T08:15:30.123Z';
const ID = 'biz-20261112081530-site';

test('parse: the exact line, with the kind line and the code line around it; strict id', () => {
  assert.deepStrictEqual(D.parse('🗑 מחיקת ליד: ' + ID), { id: ID });
  assert.deepStrictEqual(D.parse('משימה\n🗑 מחיקת ליד: ' + ID + '\n\nקוד 123456'), { id: ID });
  assert.deepStrictEqual(D.parse('🗑️ מחיקת ליד: biz-20261112081530-wa7525'), { id: 'biz-20261112081530-wa7525' });
  assert.strictEqual(D.parse('🗑 מחיקת ליד: ../../etc/passwd'), null);
  assert.strictEqual(D.parse('🗑 מחיקת ליד: biz-1'), null);
  assert.strictEqual(D.parse('🗑 מחיקת ליד: x-20261112081530-site'), null);
  assert.strictEqual(D.parse('🗑 מחיקת ליד: ' + ID + ' ועוד מילים'), null);
  assert.strictEqual(D.parse('✓ טופל: h123'), null);
});

test('the listener applies it only with the owner code, silently, with no model', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'listen.js'), 'utf8');
  assert.ok(/const ldD = codeOk && inst\.biz && require\('\.\/lib\/lead-delete\.js'\)\.parse\(text\);/.test(src));
  const i = src.indexOf('const ldD = ');
  const block = src.slice(i, src.indexOf('12.11.2026, Itzik: "📤 הודעות לשליחה"', i));
  assert.ok(/fs\.unlinkSync\(path\.join\(CHAT, name\)\)/.test(block), 'the request message is dropped, like ✓ טופל');
  assert.ok(!/ch\.notify|runSession|execFile|spawn/.test(block), 'no model and no push in the handler');
});

test('apply: the biz record, its handle items and its chat message MOVE to _deleted/<day>, nothing is erased', () => {
  const d = tmp();
  put(d, 'biz/biz/' + ID + '.json', { id: ID, kind: 'lead', name: 'איציק בדיקה', at: AT, source: 'site', status: 'חדש' });
  put(d, 'biz/biz/biz-other-site.json', { id: 'biz-other-site', kind: 'lead', name: 'אחר', at: '2026-11-11T08:00:00.000Z' });
  H.add(d, { key: 'lead:' + AT, kind: 'lead', who: 'איציק', title: 'ליד חדש מהאתר', link: 'biz', at: AT, bizId: ID });
  H.add(d, { key: 'lead:2026-11-11T08:00:00.000Z', kind: 'lead', who: 'אחר', title: 'ליד חדש מהאתר', link: 'biz', at: '2026-11-11T08:00:00.000Z', bizId: 'biz-other-site' });
  H.add(d, { key: 'setup:tok:1', kind: 'setup', who: 'שולמן', title: 'מילא טופס', link: 'answers' });
  put(d, 'chat/chat/20261112-081530-lead.json', { at: AT, from: 'unverified', heldWhy: 'lead', text: 'ליד מהאתר' });
  put(d, 'chat/chat/other-lead.json', { at: '2026-11-11T08:00:00.000Z', heldWhy: 'lead', text: 'ליד מהאתר' });
  const r = D.apply(d, ID, Date.parse('2026-11-12T09:00:00Z'));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.moved.map((x) => x.kind).sort(), ['biz', 'chat', 'handle']);
  assert.deepStrictEqual(ls(path.join(d, 'biz', 'biz')), ['biz-other-site.json']);
  assert.strictEqual(H.open(d).length, 2, 'only his own item left the queue');
  assert.deepStrictEqual(ls(path.join(d, 'chat', 'chat')), ['other-lead.json']);
  const day = ls(path.join(d, '_deleted')).find((x) => /^\d{8}$/.test(x));
  assert.strictEqual(day, '20261112');
  const files = ls(path.join(d, '_deleted', day));
  assert.strictEqual(files.length, 3, 'moved, not deleted: all three are there');
  assert.ok(files.includes(ID + '.json'));
  const log = fs.readFileSync(path.join(d, '_deleted', 'log.txt'), 'utf8').trim().split('\n');
  assert.strictEqual(log.length, 1);
  assert.ok(log[0].includes(ID));
});

test('apply: an old handle item with no bizId is matched by its key, a whatsapp lead by the phone key', () => {
  const d = tmp();
  put(d, 'biz/biz/' + ID + '.json', { id: ID, kind: 'lead', name: 'x', at: AT, source: 'site' });
  H.add(d, { key: 'lead:' + AT, kind: 'lead', who: 'x', title: 't', link: 'biz', at: AT });
  const wa = 'biz-20261112081530-wa1111';
  put(d, 'biz/biz/' + wa + '.json', { id: wa, kind: 'lead', name: 'דנה', at: AT, source: 'whatsapp', srcKey: 'wa:972521111111' });
  H.add(d, { key: 'wa-lead-972521111111-2026-11-12', kind: 'lead', who: 'דנה', title: 't', link: 'biz', at: AT });
  H.add(d, { key: 'wa-lead-972522222222-2026-11-12', kind: 'lead', who: 'אחרת', title: 't', link: 'biz', at: AT });
  assert.strictEqual(D.apply(d, ID).ok, true);
  assert.strictEqual(H.open(d).length, 2);
  assert.strictEqual(D.apply(d, wa).ok, true);
  assert.deepStrictEqual(H.open(d).map((x) => x.who), ['אחרת']);
});

test('apply: an unknown or already deleted lead is not an error and moves nothing; a bad id is refused', () => {
  const d = tmp();
  assert.strictEqual(D.apply(d, ID).ok, false);
  assert.strictEqual(D.apply(d, '../x').ok, false);
  assert.deepStrictEqual(ls(path.join(d, '_deleted')), []);
});

test('apply: a scanner lead that was deleted does not come back when the same comment is seen again', () => {
  const d = tmp();
  const f = { src: 'fb-comment', key: 'c:77', name: 'ערן', text: 'פרטים', at: '2026-11-12T07:00:00Z' };
  const r = L.addFound(d, f);
  assert.ok(r);
  assert.strictEqual(D.apply(d, r.id).ok, true);
  assert.strictEqual(L.addFound(d, f), null);
  assert.strictEqual(L.readAll(d).length, 0);
});

test('handle: bizId is stored and goes to the page; an old site item gets it from its key', () => {
  const d = tmp();
  H.add(d, { key: 'k1', kind: 'lead', who: 'a', title: 't', link: 'biz', bizId: ID, at: '2026-11-12T10:00:00.000Z' });
  H.add(d, { key: 'k2', kind: 'lead', who: 'b', title: 't', link: 'biz', bizId: '../evil' });
  H.add(d, { key: 'lead:' + AT, kind: 'lead', who: 'c', title: 't', link: 'biz', at: AT });
  const p = H.forPage(d);
  assert.strictEqual(p.find((x) => x.who === 'a').bizId, ID);
  assert.strictEqual(p.find((x) => x.who === 'b').bizId, undefined);
  assert.strictEqual(p.find((x) => x.who === 'c').bizId, ID);
});

// 4. his own phone and mail are tests
test('own contacts: the constant list, the normalized allow list, phone formats and mails', () => {
  const d = tmp();
  assert.ok(OWN.isOwn(d, { phone: '0526507525' }));
  assert.ok(OWN.isOwn(d, { phone: '+972 52-650-7525' }));
  assert.ok(OWN.isOwn(d, { email: 'ITCOHEN2@gmail.com' }));
  assert.ok(OWN.isOwn(d, { email: 'hagitit7@gmail.com' }));
  assert.ok(OWN.isOwn(d, { email: 'info@it-solution.co.il' }));
  assert.ok(!OWN.isOwn(d, { phone: '0521111111', email: 'dana@example.com' }));
  put(d, 'wa.json', { allow: ['972541234567'] });
  assert.ok(OWN.isOwn(d, { phone: '054-1234567' }), 'the allow list in data/wa.json counts');
  assert.ok(OWN.isOwnText(d, 'ליד מהאתר\nשם: דנה\nאימייל: itcohen2@gmail.com\nטלפון: לא ניתן'));
  assert.ok(OWN.isOwnText(d, 'ליד מהאתר\nשם: דנה\nטלפון: 052-650-7525'));
  assert.ok(!OWN.isOwnText(d, 'ליד מהאתר\nשם: דנה\nאימייל: dana@example.com\nטלפון: 0521111111'));
});

test('own lead from the scanner is created with test:true and is not counted in the summary', () => {
  const d = tmp();
  const mine = L.addFound(d, { src: 'leadform', key: 'f1', name: 'איציק', text: 'בדיקה', at: AT, email: 'hagitit7@gmail.com' });
  const real = L.addFound(d, { src: 'leadform', key: 'f2', name: 'דנה', text: 'שלום', at: AT, phone: '0521111111' });
  assert.strictEqual(mine.test, true);
  assert.ok(!real.test);
  const s = biz.summary(L.readAll(d), Date.parse(AT));
  assert.strictEqual(s.open, 1);
  assert.strictEqual(s.counts.lead, 1);
});

test('own lead from the site: created and marked test, with no item, and manager and page counts skip it', () => {
  const text = 'ליד מהאתר\nשם: איציק\nאימייל: itcohen2@gmail.com\nטלפון: לא ניתן\nמקור: site\nשלום';
  const d = tmp();
  assert.strictEqual(biz.isTestLead(text), false, 'it is still a lead that is created');
  assert.ok(biz.leadFromSite(text, AT, ID));
  assert.ok(OWN.isOwnText(d, text));
  const M = require('../lib/manager.js');
  const item = M.leadsItem
    ? M.leadsItem([{ heldWhy: 'lead', at: new Date().toISOString(), text }], [], Date.now(), (t) => biz.isTestLead(t) || OWN.isOwnText(d, t))
    : null;
  if (item) assert.strictEqual(item.st, 'done');
});

test('own lead from whatsapp: record test:true, no 📋 item, no push; a stranger still gets all of it', async () => {
  const d = tmp();
  const items = [], pushes = [];
  const o = { textOf: (m) => m.text.body, handle: (x) => items.push(x), notify: (t, b) => pushes.push([t, b]), publish: () => {}, send: async () => {}, log: () => {} };
  const msg = (from, body, n) => ({ id: 'w' + n, from, type: 'text', text: { body } });
  const mine = await stranger.intake(d, msg('972526507525', 'בדיקה', 1), Object.assign({ name: 'איציק', now: Date.parse(AT) }, o));
  assert.strictEqual(mine.rec.test, true);
  assert.strictEqual(items.length, 0);
  assert.strictEqual(pushes.length, 0);
  const real = await stranger.intake(d, msg('972521111111', 'היי', 2), Object.assign({ name: 'דנה', now: Date.parse(AT) }, o));
  assert.ok(!real.rec.test);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].bizId, real.rec.id, 'the item records its lead id');
  assert.strictEqual(pushes.length, 1);
});

// 2. the page
const { renderPage } = require('../build.js');
const page = () => renderPage({ now: null, openCmds: [], builtAt: 'x', counts: {}, choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [] });

test('page: a delete button next to ✓ טופל in 📋 לטיפול, on the new lead card and in the leads table', () => {
  const html = page();
  assert.ok(html.includes('data-a="del"') && html.includes('🗑 מחיקה'), 'the handle row');
  assert.ok(html.includes('class="lbDel"'), 'the new lead card');
  assert.ok(html.includes('data-bz="lddel"') && html.includes('ldTestTag') && html.includes('בדיקה שלך'), 'the leads table and the greyed test row');
  assert.ok(!html.includes('data-bz="lddel">🗑️ למחוק'), 'the old two tap lead delete is gone');
});

test('page: the confirm is in the page (no window.confirm), says the sentence, and sends the line with the id', async () => {
  const html = page();
  const i = html.indexOf('function leadDelAsk(');
  assert.ok(i > 0);
  const j = html.indexOf('/*ITZIK:END*/', i);
  const src = html.slice(i, j > 0 ? j : i + 3000);
  assert.ok(!/\bconfirm\s*\(/.test(src), 'no window.confirm');
  assert.ok(src.includes('למחוק את הליד ') && src.includes('הוא לא ייספר בדוחות.') && src.includes('>מחיקה<') && src.includes('>ביטול<'));
  // run it against stubs
  const store = {}, sent = [], root = [];
  const mk = () => ({ id: '', className: '', _h: '', setAttribute() {}, remove() { const k = root.indexOf(this); if (k >= 0) root.splice(k, 1); }, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; } });
  const fn = new Function('document', 'localStorage', 'sendText', 'markSent', 'toast', 'paintHandle', 'esc',
    'function ldGone(){try{return JSON.parse(localStorage.getItem("leadGone")||"[]")||[];}catch(e){return [];}}\n' + src + '\nreturn {ask:leadDelAsk,gone:ldGone};');
  const el = mk();
  const doc = { getElementById: () => null, createElement: () => el, body: { appendChild: (x) => root.push(x) } };
  const api = fn(doc, { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    (s, t, k) => { sent.push([s, t, k]); return Promise.resolve(); }, () => {}, () => {}, () => {}, (s) => String(s));
  let after = 0;
  api.ask('איציק בדיקה', ID, () => { after++; });
  assert.ok(el.innerHTML.includes('למחוק את הליד איציק בדיקה? הוא לא ייספר בדוחות.'));
  assert.strictEqual(sent.length, 0, 'nothing is sent before the confirm');
  el.onclick({ target: { getAttribute: () => 'n' } });
  assert.strictEqual(sent.length, 0, 'cancel sends nothing');
  api.ask('איציק בדיקה', ID, () => { after++; });
  const btn = { disabled: false, getAttribute: () => 'y' };
  el.onclick({ target: btn });
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(sent, [['מחיקת ליד', '🗑 מחיקת ליד: ' + ID, 'משימה']]);
  assert.ok(D.parse(sent[0][1]), 'the listener parses exactly what the page sends');
  assert.deepStrictEqual(api.gone(), [ID], 'hidden at once on this phone');
  assert.strictEqual(after, 1);
});

test('page: the new lead tile uses the shared alertfade, not a strong blink', () => {
  const css = page();
  assert.ok(css.includes('.gt.leadNew:not(.lnSeen)::before') && /animation:alertfade 3\.4s/.test(css));
  assert.ok(/\.gt\.leadNew:not\(\.lnSeen\),[^{]*\{animation:none!important\}/.test(css), 'the old hardblink is switched off');
  assert.ok(css.includes('.gt{background:linear-gradient(150deg,#1b8aa5,#0e5a73)!important}'), 'the tile has the tile colour under the fade');
});
