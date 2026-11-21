'use strict';
// 21.11.2026: the gypsum contractor trade demo (lib/demo-trades/gypsum.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const G = require('../lib/demo-trades/gypsum.js');
const NOW = Date.parse('2026-11-21T22:30:00Z'); // 00:30 in Israel, the night build
const dayIL = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const BAD = /שולמן|פבלו|איליי|אלון|רינת|אמינוב|יהודה|שחר|יניב|נחמן|יואל|גיתית|לולוס|פגסוס|סלינדה|הום סטייל|איציק|יצחק|מספר[הת]|תספורת/;

function seeded() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gyp-')); G.seed(d, NOW); return d; }
const read = (d, rel) => JSON.parse(fs.readFileSync(path.join(d, rel), 'utf8'));
function allFiles(d) {
  const out = [];
  (function walk(x) { for (const f of fs.readdirSync(x)) { const p = path.join(x, f); if (fs.statSync(p).isDirectory()) walk(p); else out.push(p); } })(d);
  return out;
}

test('today has two sites, even at the 00:30 build', () => {
  const d = seeded();
  const today = dayIL(new Date(NOW).toISOString());
  assert.strictEqual(read(d, 'biz-home/events.json').filter((e) => dayIL(e.start) === today).length, 2);
});

test('the debt adds up and two quotes wait', () => {
  const d = seeded();
  const m = read(d, 'money/money.json');
  assert.strictEqual(m.debtors.reduce((a, x) => a + x[1], 0), m.debt);
  assert.strictEqual(read(d, 'biz-home/quotes.json').filter((q) => !q.signed).length, 2);
});

test('no real names and nothing of the barbershop', () => {
  const d = seeded();
  for (const f of allFiles(d)) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), BAD, f);
});

test('the chat context knows the business and the debtors', () => {
  const c = G.context(NOW);
  for (const s of ['דוד גבס ושיפוצים', 'משפחת לוי', 'יוסי אברהם', 'קבוצת אורן נכסים']) assert.ok(c.includes(s), s);
  assert.doesNotMatch(c, BAD);
});

test('the demo-data CLI seeds the trade with --trade', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gypcli-'));
  require('child_process').execFileSync(process.execPath, [path.join(__dirname, '..', 'lib', 'demo-data.js'), d, '--trade', 'gypsum']);
  assert.strictEqual(read(d, 'conn/partner.json').pageName, 'דוד גבס ושיפוצים');
});

test('the ribbon names the trade, the barbershop keeps its own', () => {
  const PD = require('../lib/public-demo.js');
  const g = PD.tail({ publicDemo: true, trade: 'gypsum' });
  assert.ok(g.includes('הדגמה: קבלן גבס ושיפוצים'));
  assert.ok(!g.includes('מספרה לדוגמה'));
  assert.ok(PD.tail({ publicDemo: true }).includes('הדגמה: מספרה לדוגמה'));
});

test('a trade demo opens folded, cards on top, without the manager card moved up', () => {
  const PD = require('../lib/public-demo.js');
  assert.ok(PD.head({ publicDemo: true, trade: 'gypsum' }).includes('window.DEMO_TRADE=true'));
  assert.ok(!PD.head({ publicDemo: true }).includes('window.DEMO_TRADE=true'));
  assert.match(require('../lib/demo-acts.js').client.toString(), /window\.DEMO_TRADE \? '1' : '0'/);
  assert.match(PD.tail({ publicDemo: true, trade: 'gypsum' }), /if\(!window\.DEMO_TRADE\)\{mgrUp\(\)/);
  const B = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
  assert.ok(B.includes("'approvalsBox','tradeCards',"));
});

test('demo-build drops the old install name before it builds (build.js writes the manifest only when missing)', () => {
  const S = fs.readFileSync(path.join(__dirname, '..', 'setup', 'demo-build.sh'), 'utf8');
  const rm = S.indexOf('rm -f "$APP/docs/manifest.webmanifest"'), build = S.indexOf('MONITOR_NO_GATE=1 node build.js');
  assert.ok(rm > -1 && rm < build);
});

test('the demo chat answers as the trade of the page it came from', async () => {
  const C = require('../lib/demo-chat.js');
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'gypchat-'));
  const seen = [];
  const llm = async (m, sys) => { seen.push(sys); return 'בסדר'; };
  await C.api('/api/demo/chat', { text: 'מי חייב לי כסף?', vid: 'abcdefgh12' }, { dataPath: dp, ip: '1.1.1.1', llm, origin: 'https://demo-gypsum.m.it-solution.co.il' });
  await C.api('/api/demo/chat', { text: 'מי חייב לי כסף?', vid: 'abcdefgh13' }, { dataPath: dp, ip: '1.1.1.2', llm, origin: 'https://evil.example' });
  assert.match(seen[0], /קבלן גבס ושיפוצים/);
  assert.match(seen[0], /משפחת לוי/);
  assert.doesNotMatch(seen[0], /מספר[הת]/);
  assert.match(seen[1], /מספרה/);
});

test('the bridge lets the trade demo hosts in', () => {
  const W = fs.readFileSync(path.join(__dirname, '..', 'wa-bridge.js'), 'utf8');
  assert.match(W, /require\('\.\/lib\/trades\.js'\)\.isDemoOrigin\(o\)/);
  assert.match(W, /origin: q\.headers\.origin/);
  const T = require('../lib/trades.js');
  assert.strictEqual(T.isDemoOrigin('https://demo-gypsum.m.it-solution.co.il'), true);
  assert.strictEqual(T.isDemoOrigin('https://demo-gypsum.m.it-solution.co.il.evil.com'), false);
  assert.strictEqual(T.isDemoOrigin(undefined), false);
});
