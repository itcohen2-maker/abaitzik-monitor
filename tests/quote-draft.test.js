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
  const out = JSON.parse(execFileSync('node', [path.join(ROOT, 'quote-draft.js'), f], { cwd: ROOT, env: Object.assign({}, process.env, { MONITOR_INSTANCE: path.join(d, 'instance.json') }), encoding: 'utf8' }).trim());
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
});

test('Israel offset: +02:00 in winter, +03:00 in summer; no prompt says +03:00 for every day', () => {
  const { ilOffset } = require('../lib/il-offset.js');
  assert.strictEqual(ilOffset(new Date('2026-11-16T08:00:00Z')), '+02:00');
  assert.strictEqual(ilOffset(new Date('2026-07-01T08:00:00Z')), '+03:00');
  for (const f of ['worker.js', 'net-daily.js', 'lib/campaign.js']) {
    assert.ok(!/ISO עם \+03:00/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
  }
});
