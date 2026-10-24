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
  assert.deepStrictEqual(features.read(d), { bank: false });
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

test('the tile is in a customer page, hidden, with the waving hand', () => {
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const start = src.indexOf('const TENANT_TILES = {');
  const end = src.indexOf('function cutFor(');
  const { tenantTiles } = new Function(src.slice(start, end) + '; return { tenantTiles };')();
  const html = tenantTiles({ screens: ['gFiles'] });
  const m = /<button[^>]*id="gBank"[^>]*>/.exec(html);
  assert.ok(m, 'gBank tile present in the markup');
  assert.ok(/\bhidden\b/.test(m[0]) && /data-new="1"/.test(m[0]));
  assert.ok(html.includes('🏦 חיבור הבנק'));
  assert.ok(/features: require\('\.\/lib\/features\.js'\)\.read\(inst\.dataPath\)/.test(src), 'payload carries features');
  assert.ok(src.includes("boot('features',applyFeatures)") && src.includes("['features',applyFeatures]"));
});

test('the help sheet row is only for a feature that is off, and sends feature-bank', () => {
  const help = require('../lib/help-ui.js');
  assert.ok(/id="qhBank" hidden>🏦 אני רוצה לחבר את הבנק/.test(help.html));
  assert.ok(help.js.includes("'feature-bank'") && help.js.includes('D.features.bank===true'));
  assert.ok(help.js.includes('אחרי שיאשר, יופיע לך אריח 🏦 חיבור הבנק.'));
});

test('listen.js routes feature-bank like help-human, through change-requests', () => {
  const src = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8');
  const m = /const helpM = [^\/]*(\/\^.*\/)\.exec\(text\);/.exec(src);
  assert.ok(m, 'helpM regex found');
  const re = eval(m[1]);
  assert.ok(re.exec('feature-bank\nאני רוצה לחבר את הבנק'));
  assert.ok(re.exec('help-human\nx') && re.exec('no-answer\nx'));
  assert.ok(!re.exec('feature-other\nx'));
  assert.ok(src.includes("'בקשה לפתוח חיבור בנק: ' + inst.name, rec.id, 'bank'"));
  assert.ok(src.includes('הבקשה הגיעה לאיציק. אחרי שיאשר, יופיע לך אריח 🏦 חיבור הבנק.'));
});

test('an approved request with a feature opens it, a pending one does not', () => {
  const d = tmp();
  const instFile = path.join(d, 'instance.json');
  fs.writeFileSync(instFile, JSON.stringify({ name: 'bankt', dataDir: path.join(d, 'data') }));
  const code = `
    const cr = require(${JSON.stringify(path.join(ROOT, 'lib', 'change-requests.js'))});
    const fs = require('fs'), path = require('path');
    const id = cr.add('בקשה לפתוח חיבור בנק: bankt', 'r1', 'bank');
    const f = path.join(${JSON.stringify(path.join(d, 'data'))}, 'status', 'change-requests.json');
    const out = [cr.applyApproved().length];
    const l = JSON.parse(fs.readFileSync(f, 'utf8')); l[0].status = 'approved'; fs.writeFileSync(f, JSON.stringify(l));
    out.push(cr.applyApproved().join(), cr.applyApproved().length);
    console.log(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['-e', code], { env: Object.assign({}, process.env, { ABAITZIK_INSTANCE_FILE: instFile }), encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout.trim()), [0, 'bank', 0]);
  assert.strictEqual(features.read(path.join(d, 'data')).bank, true);
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
