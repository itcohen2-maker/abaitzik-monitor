'use strict';
// 16.11.2026, Itzik: "ביקשתי שיכין לי הצעת מחיר והוא מתעלם ממני". A quote from the chat lands in 🧾,
// the tile comes back even when it was hidden, and answers are stamped with Israel's real offset.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BH = require('../lib/biz-home.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qd-'));

test('addQuote keeps a quote from the monitor and from the tile, one copy per id', () => {
  const d = tmp();
  const m = BH.addQuote(d, { client: 'דנה', items: [['ליווי', 2, 1500, '', 'חודשים']] }, 'monitor');
  assert.strictEqual(m.by, 'monitor');
  assert.strictEqual(m.no, '1001');
  BH.addQuote(d, { id: 'q1', client: 'רון', items: [['x', 1, 100]] }, 'owner');
  BH.addQuote(d, { id: 'q1', client: 'רון ב', items: [['x', 1, 100]] }, 'owner');
  const list = BH.readList(d, 'quote');
  assert.strictEqual(list.length, 2);
  assert.ok(list.some((q) => q.client === 'רון ב' && q.by === 'owner'));
  assert.strictEqual(BH.monitorQuote(d), m.id);
  assert.strictEqual(BH.addQuote(d, { client: '', items: [] }, 'monitor'), null, 'no client, no quote');
});

test('quote-draft.js writes the draft and removes the draft file', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'instance.json'), JSON.stringify({ name: 'qtest', dataPath: path.join(d, 'data') }));
  const dir = path.join(d, 'data', 'biz-home'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'draft-test.json');
  fs.writeFileSync(f, JSON.stringify({ client: 'בדיקה', items: [['הקמה', 1, 490]], disc: 10 }));
  const out = JSON.parse(execFileSync('node', [path.join(ROOT, 'quote-draft.js'), f], { cwd: ROOT, env: Object.assign({}, process.env, { ABAITZIK_INSTANCE_FILE: path.join(d, 'instance.json') }), encoding: 'utf8' }).trim());
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.net, 441);
});

test('🧾 comes back on a customer home when the monitor drafted a quote, even if hideTiles took it off', () => {
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const start = src.indexOf('const TENANT_TILES = {');
  const end = src.indexOf('function cutFor(');
  const { tenantTiles } = new Function('require', 'fs', 'path', src.slice(start, end) + '; return { tenantTiles };')((m) => require(m.startsWith('./') ? path.join(ROOT, m) : m), fs, path);
  const d = tmp();
  assert.ok(!/id="gBhQuote"/.test(tenantTiles({ screens: ['gFiles'], hideTiles: ['gBhQuote'], dataPath: d })), 'no draft, stays hidden');
  BH.addQuote(d, { client: 'דנה', items: [['ליווי', 1, 1500]] }, 'monitor');
  assert.ok(/id="gBhQuote"/.test(tenantTiles({ screens: ['gFiles'], hideTiles: ['gBhQuote'], dataPath: d })), 'back with a draft');
});

test('the page puts 🧾 back on this phone and blinks it softly; no 120 upsell left', () => {
  const js = BH.js;
  assert.ok(/bqMonSeen/.test(js) && /updblink/.test(js) && /tilesHidden/.test(js));
  assert.ok(!/120 ₪/.test(js), 'the 120 a month offer is gone since 14.11');
  assert.ok(/\/api\/quote\/save/.test(js));
  assert.ok(/\/api\/quote\/list/.test(js), 'the page reads its saved quotes back');
});

test('Israel offset: +02:00 in winter, +03:00 in summer; no prompt says +03:00 for every day', () => {
  const { ilOffset } = require('../lib/il-offset.js');
  assert.strictEqual(ilOffset(new Date('2026-11-16T08:00:00Z')), '+02:00');
  assert.strictEqual(ilOffset(new Date('2026-07-01T08:00:00Z')), '+03:00');
  for (const f of ['worker.js', 'net-daily.js', 'lib/campaign.js']) {
    assert.ok(!/ISO עם \+03:00/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
  }
});

test('a quote is a document: the worker sends a PDF, never a WhatsApp text to the client', () => {
  const w = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  assert.ok(!/לנסח הודעה, הצעה או תשובה/.test(w), 'the message rule no longer says הצעה');
  assert.ok(/quote-draft\.js <הקובץ> --pdf/.test(w));
  const html = require('../lib/csign.js').pdfHtml({ q: require('../lib/csign.js').clean({ no: '1001', client: 'רינת', items: [['ייעוץ', 1, 1500]] }), biz: { name: 'IT Solution', vat: '028445518' }, logo: '' });
  assert.ok(/size:A4/.test(html) && /IT Solution/.test(html) && /028445518/.test(html));
});

test('business details come from data/biz-home/biz.json when instance.json has only biz: true', () => {
  const d = tmp(), root = tmp();
  fs.writeFileSync(path.join(root, 'instance.json'), JSON.stringify({ biz: true }));
  fs.mkdirSync(path.join(d, 'biz-home'), { recursive: true });
  fs.writeFileSync(path.join(d, 'biz-home', 'biz.json'), JSON.stringify({ name: 'IT Solution', vat: '028445518' }));
  assert.strictEqual(BH.bizInfo(root, d).name, 'IT Solution');
  assert.deepStrictEqual(BH.bizInfo(root), {});
});

test('a new Rivhit document from the chat goes to the Lolos PC at once; a customer gets an honest line', () => {
  const w = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  assert.ok(/מסמך חדש בריווחית \(תעודת משלוח/.test(w));
  assert.ok(/מיד `node pc-task\.js add --pc lolos --re <id>/.test(w));
  assert.ok(/מסמכים חשבונאיים, ומפיקים אותם רק בתוכנת הנהלת החשבונות של הלקוח/.test(w));
});

test('Fireflies key: saved into keys.json by the listener, masked in logs, the message never kept', () => {
  const FK = require('../lib/fireflies-key.js');
  const d = tmp();
  fs.writeFileSync(path.join(d, 'keys.json'), JSON.stringify({ sealMsgs: 'x' }));
  const key = 'abcd1234efgh5678ijkl9012';
  assert.strictEqual(FK.parseMsg('משימה\n🎙️ מפתח פיירפליס: ' + key), key);
  assert.ok(!FK.mask('🎙️ מפתח פיירפליס: ' + key).includes(key));
  assert.strictEqual(FK.setKey(d, 'short').ok, false);
  assert.strictEqual(FK.setKey(d, key).ok, true);
  const k = JSON.parse(fs.readFileSync(path.join(d, 'keys.json'), 'utf8'));
  assert.strictEqual(k.firefliesKey, key); assert.strictEqual(k.sealMsgs, 'x', 'other keys stay');
  assert.ok(FK.hasKey(d));
  assert.ok(FK.setKey(d, 'הסרה').removed); assert.ok(!FK.hasKey(d));
  const L = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8');
  assert.ok(/fireflies-key\.js'\)\.mask\(text\)/.test(L) && /unlinkSync\(path\.join\(CHAT, name\)\); \} catch \(e\) \{ \/\* already gone/.test(L));
});

test('16.11: the manager round builds with now as a number (a LinkedIn queue crashed it for a day)', () => {
  const M = require('../lib/manager.js');
  const r = M.build({ now: Date.now(), linkedin: [{ date: '2026-11-17' }] });
  assert.ok(r && Array.isArray(r.items));
});

test('16.11: a comment that asks is a lead, a blessing is not; the manager line says what the hunt found', () => {
  const I = require('../lib/lead-intent.js');
  for (const s of ['פרטים', 'כמה זה עולה?', 'מוניטור', 'אשמח לפרטים בפרטי', 'איך מצטרפים?', 'אפשר להזמין אותך להרצאה?', 'שלחתי לך הודעה'])
    assert.ok(I.isLead(s), s);
  for (const s of ['רפואה שלמה 🙏', 'השראה❤️', 'אתה מלך', 'בהצלחה🙌', 'גם הלחם לא שיא הבריאות'])
    assert.ok(!I.isLead(s), s);
  const M = require('../lib/manager.js');
  const now = Date.now(), at = new Date(now - 5 * 60000).toISOString();
  const ok = [{ f: 'lead-scan.json', name: 'IT Solution', maxMin: 40, s: { at, ok: true } }, { f: 'social-dm.json', name: 'הודעות', maxMin: 40, s: { at } },
    { f: 'comment-leads.json', name: 'תגובות', maxMin: 60, s: { at, ok: true, today: { scanned: 318, added: 1 } } }];
  const a = M.leadHuntItem(ok, now);
  assert.strictEqual(a.st, 'done'); assert.ok(/318/.test(a.sub) && /1 לידים/.test(a.sub));
  ok[2].s.at = new Date(now - 3 * 3600000).toISOString();
  assert.strictEqual(M.leadHuntItem(ok, now).st, 'warn');
  assert.strictEqual(require('../lib/leads.js').SOURCES['igc-own'], 'תגובה באינסטגרם של אבא איציק');
});
