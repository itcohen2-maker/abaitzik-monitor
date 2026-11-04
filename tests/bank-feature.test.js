'use strict';
/*
  24.10: the bank tile is built and ready but hidden until the customer asks and Itzik
  approves. The switch is data/status/features.json {"bank":true} (lib/features.js).
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bankfeat-'));
const features = require('../lib/features.js');
const bankUi = require('../lib/bank-ui.js');

test('features.json gating: off by default, on only for exactly true', () => {
  const d = tmp();
  // 24.10.2026: 'morning' joined the known flags, off by default like the bank one.
  assert.deepStrictEqual(features.read(d), { bank: false, morning: false, money: false });
  fs.mkdirSync(path.join(d, 'status'));
  fs.writeFileSync(path.join(d, 'status', 'features.json'), '{"bank":"yes"}');
  assert.strictEqual(features.read(d).bank, false);
  fs.writeFileSync(path.join(d, 'status', 'features.json'), 'not json');
  assert.strictEqual(features.read(d).bank, false);
  assert.strictEqual(features.enable(d, 'bank'), true);
  assert.strictEqual(features.read(d).bank, true);
  assert.strictEqual(features.enable(d, 'bank'), false, 'second enable changes nothing');
  assert.throws(() => features.enable(d, 'nope'));
});

function runPage(D) {
  const tile = { hidden: true };
  const document = { getElementById: (id) => (id === 'gBank' ? tile : null) };
  new Function('D', 'document', features.js + '; applyFeatures();')(D, document);
  return tile.hidden;
}

test('the page hides the tile when the feature is off and shows it when on', () => {
  assert.strictEqual(runPage({}), true);
  assert.strictEqual(runPage({ features: { bank: false } }), true);
  assert.strictEqual(runPage({ features: { bank: 'true' } }), true);
  assert.strictEqual(runPage({ features: { bank: true } }), false);
});

test('4.11: no bank tile on any page; the bank is connected through Claude in the terminal', () => {
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const start = src.indexOf('const TENANT_TILES = {');
  const end = src.indexOf('function cutFor(');
  const { tenantTiles } = new Function(src.slice(start, end) + '; return { tenantTiles };')();
  assert.ok(!/id="gBank"/.test(tenantTiles({ screens: ['gFiles'] })), 'no bank tile for a customer');
  assert.ok(!/<button[^>]*id="gBank"/.test(src), 'no bank tile for the owner either');
  assert.ok(!src.includes("require('./lib/bank-ui.js').js"), 'the bank screen is not on any page');
});

test('4.11: bank is on for the owner and off for any customer, whatever the file says', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'status'));
  fs.writeFileSync(path.join(d, 'status', 'features.json'), '{"bank":true,"money":true}');
  assert.strictEqual(features.read(d, 'abaitzik').bank, true);
  assert.strictEqual(features.read(d, 'shai').bank, false);
  assert.strictEqual(features.read(d, 'shai').money, true, 'other flags untouched');
  assert.strictEqual(features.read(tmp(), 'abaitzik').bank, true, 'owner needs no file');
});

test('the help sheet has no bank request any more', () => {
  const help = require('../lib/help-ui.js');
  assert.ok(!/qhBank/.test(help.html) && !/qhBank/.test(help.js));
  assert.ok(!help.js.includes("'feature-bank'"));
});

test('listen.js answers an old feature-bank request plainly and opens no approval', () => {
  const src = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8');
  const m = /const helpM = [^\/]*(\/\^.*\/)\.exec\(text\);/.exec(src);
  assert.ok(m, 'helpM regex found');
  const re = eval(m[1]);
  assert.ok(re.exec('feature-bank\nאני רוצה לחבר את הבנק'));
  assert.ok(re.exec('help-human\nx') && re.exec('no-answer\nx'));
  assert.ok(!re.exec('feature-other\nx'));
  assert.ok(!src.includes("'בקשה לפתוח חיבור בנק: ' + inst.name, rec.id, 'bank'"));
  assert.ok(src.includes('חיבור לבנק לא קיים במוניטור הזה.'));
});

test('an approved bank request in a customer monitor still opens nothing', () => {
  const d = tmp();
  const instFile = path.join(d, 'instance.json');
  fs.writeFileSync(instFile, JSON.stringify({ name: 'bankt', dataDir: path.join(d, 'data') }));
  const code = `
    const cr = require(${JSON.stringify(path.join(ROOT, 'lib', 'change-requests.js'))});
    const fs = require('fs'), path = require('path');
    cr.add('בקשה לפתוח חיבור בנק: bankt', 'r1', 'bank');
    const f = path.join(${JSON.stringify(path.join(d, 'data'))}, 'status', 'change-requests.json');
    const l = JSON.parse(fs.readFileSync(f, 'utf8')); l[0].status = 'approved'; fs.writeFileSync(f, JSON.stringify(l));
    cr.applyApproved();
    console.log('ok');`;
  const r = spawnSync(process.execPath, ['-e', code], { env: Object.assign({}, process.env, { ABAITZIK_INSTANCE_FILE: instFile }), encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(features.read(path.join(d, 'data')).bank, false);
  assert.strictEqual(features.read(path.join(d, 'data'), 'bankt').bank, false);
});

test('the bank screen text: no dashes, the required parts, the existing file flow', () => {
  const all = bankUi.BANK_TEXT.map((x) => x[1]).join('\n');
  assert.ok(!/[-‐-―־]/.test(all), 'no dash of any kind');
  assert.ok(!/[-‐-―־]/.test(bankUi.BTN));
  for (const w of ['לא מבקש סיסמה', 'בנק הפועלים', 'עו״ש', 'לא מוצאים את הכפתור? מצלמים את מסך התנועות ושולחים', 'כרטיס אשראי']) assert.ok(all.includes(w), w);
  assert.strictEqual(all.split('\n').filter((l) => /^[1-5]\. /.test(l)).length, 5);
  assert.strictEqual(bankUi.BANK_SUBJECT, 'קובץ בנק');
  assert.ok(bankUi.js.includes("openPicker('full','',true)") && bankUi.js.includes("getElementById('fCap')"));
});
