'use strict';
// 24.11.2026: lib/calls-ui.js, the screen 🗂️ שיחות ופגישות (the calls archive).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const UI = require('../lib/calls-ui.js');

const ROOT = path.join(__dirname, '..');
const scriptOf = (h) => /<script>([\s\S]*)<\/script>/.exec(h)[1];

function build(inst) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calls-ui-'));
  for (const f of ['build.js', 'gate.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'public'))) fs.cpSync(path.join(ROOT, 'public'), path.join(dir, 'public'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'gate-key.txt'), '482913');
  fs.writeFileSync(path.join(dir, 'instance.json'), JSON.stringify(Object.assign({ name: 'ily', owner: 'מור', pageTitle: 'המוניטור של מור', appTitle: 'המוניטור',
    publicUrl: 'https://x.example/', basePath: '/', origin: 'https://x.example', screens: ['gRemind', 'gTasks', 'gNotes'], chromeProfile: 'none', memoryDir: null }, inst)));
  execFileSync(process.execPath, ['build.js'], { cwd: dir, env: Object.assign({}, process.env, { ABAITZIK_INSTANCE_FILE: '', MONITOR_NO_GATE: '1' }), stdio: 'pipe' });
  const page = fs.readFileSync(path.join(dir, 'docs', 'index.html'), 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return page;
}

test('enabled only with inst.calls === true', () => {
  assert.strictEqual(UI.enabled({ calls: true }), true);
  for (const v of [{}, { calls: false }, { calls: 'true' }, { calls: 1 }, null, undefined]) assert.strictEqual(UI.enabled(v), false);
  assert.strictEqual(UI.html({}), '');
  assert.strictEqual(UI.html(null), '');
  assert.strictEqual(lib().calls, false); // the instance default
});
function lib() { return require('../lib/instance.js').DEFAULTS; }

test('html has the search input, the chips and no data', () => {
  const h = UI.html({ calls: true }), s = scriptOf(h);
  assert.ok(h.length > 5000);
  for (const f of ['id="clQ"', 'placeholder="חיפוש: שם, מספר או מילה"', "'היום'", "'השבוע'", "'הכל'", "'שיחות'", "'פגישות'", 'תמלול מלא', '▶️ האזנה', 'עוד', 'תן שם למספר', 'תייג מחדש 30 ימים', '250', 'data-a="del2"',
    "'/../calls/' + route", "'search'", "'item'", "'contact'", "'delete'", "'name'", "'topics'", "'private'", "'retag'"]) assert.ok(s.includes(f), f);
  assert.ok(s.includes('עוד אין שיחות. ברגע שהמרכזייה תעביר שיחה, היא תופיע כאן עם סיכום.'));
  assert.ok(s.includes('הסיכום לא הצליח, התמלול המלא כאן'));
  assert.ok(!s.includes('window.confirm') && !/\bconfirm\(/.test(s), 'in page confirm only');
  assert.ok(!s.includes('fetch('), 'only the page helper fcPost sends');
  assert.doesNotMatch(h, /<table/i);
});

test('everything from the API goes through esc, never raw into innerHTML', () => {
  const s = scriptOf(UI.html({ calls: true }));
  // run the page against a stub dom and feed it a hostile row
  const vm = require('vm');
  const els = {};
  const mk = () => ({ innerHTML: '', _l: {}, addEventListener(t, f) { this._l[t] = f; }, querySelector(q) { return els[q] || (els[q] = mk()); }, setAttribute() {}, getAttribute() { return null; }, value: '' });
  const calls = [];
  const doc = { _l: {}, addEventListener(t, f) { this._l[t] = f; } };
  const ctx = { window: null, document: doc, setTimeout, clearTimeout, toast() {},
    fcPost(p, b) { calls.push([p, b]); return Promise.resolve(p.endsWith('search') ? { total: 1, rows: [{ id: 'c1', at: Date.now(), kind: 'call', name: '<img src=x onerror=alert(1)>', number: '0501234567', durationSec: 400, about: '<b>x</b>', decided: [], tasks: [{ text: '<script>1</script>', due: '' }], topics: ['<i>'], status: 'done' }] } : { topics: [], numbers: [] }); },
    shipOpen(id, label, h, after) { const w = mk(); w.querySelector('.cl'); after(w); return w; } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(s, ctx);
  doc._l.click({ target: { closest: (q) => (q === '#gCalls' ? {} : null) } });
  return new Promise((r) => setTimeout(r, 30)).then(() => {
    assert.ok(calls.some((c) => c[0] === '/../calls/search'));
    const out = els['#clList'].innerHTML;
    assert.ok(out.includes('&lt;img src=x'), out);
    assert.ok(!out.includes('<img') && !out.includes('<script') && !out.includes('<b>x'));
    assert.ok(out.includes('📞') && out.includes('✅') && out.includes('תמלול מלא'));
  });
});

test('build with calls true lists gCalls among the tiles, and without it there is no trace', () => {
  const on = build({ calls: true });
  assert.match(on, /id="gCalls"/); assert.match(on, /שיחות ופגישות/); assert.match(on, /id="clQ"/);
  const off = build({});
  assert.ok(off.length > 100000);
  assert.doesNotMatch(off, /gCalls|clOpen|clQ/);
  const bad = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  assert.match(bad, /\n {2}gCalls: \['g\d+', '🗂️ שיחות ופגישות'/);
  assert.match(bad, /require\('\.\/lib\/calls-ui\.js'\)\.html\(inst\)/);
});

test('copy has no dash punctuation', () => {
  const h = UI.html({ calls: true }), s = scriptOf(h);
  const lits = s.match(/'[^'\\\n]*[֐-׿][^'\\\n]*'/g) || [];
  assert.ok(lits.length > 30, 'literals ' + lits.length);
  for (const l of lits) assert.doesNotMatch(l.replace(/(aria|data)-[a-z]+/g, ''), /[-‐-―]/, l);
  assert.doesNotMatch(s, /\s[–—]\s|[֐-׿] - [֐-׿]/);
  const style = /<style>([\s\S]*?)<\/style>/.exec(h)[1];
  assert.doesNotMatch(style, /[֐-׿]/);
  assert.match(style, /Heebo/);
});
