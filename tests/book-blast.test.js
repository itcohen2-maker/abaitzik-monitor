'use strict';
// 22.11.2026: the blast radius. The appointments feature must never be able to break a monitor that does not use it
// (above all the platform owner's own). Off unless the instance says bookings: true; every call from shared code is wrapped.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
function build(inst, breakUi) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-blast-'));
  for (const f of ['build.js', 'gate.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'public'))) fs.cpSync(path.join(ROOT, 'public'), path.join(dir, 'public'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'gate-key.txt'), '482913');
  if (breakUi) fs.writeFileSync(path.join(dir, 'lib', 'bookings-ui.js'), "throw new Error('deliberately broken');\n");
  fs.writeFileSync(path.join(dir, 'instance.json'), JSON.stringify(Object.assign({ name: 'ily', owner: 'מור', pageTitle: 'המוניטור של מור', appTitle: 'המוניטור',
    publicUrl: 'https://x.example/', basePath: '/', origin: 'https://x.example', screens: ['gRemind', 'gTasks', 'gNotes'], chromeProfile: 'none', memoryDir: null }, inst)));
  const out = execFileSync(process.execPath, ['build.js'], { cwd: dir, env: Object.assign({}, process.env, { ABAITZIK_INSTANCE_FILE: '', MONITOR_NO_GATE: '1' }), stdio: 'pipe' }).toString();
  const page = fs.readFileSync(path.join(dir, 'docs', 'index.html'), 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { page, out };
}

test('an ordinary instance builds with a deliberately broken bookings module, and has no trace of the feature', () => {
  const r = build({}, true);
  assert.ok(r.page.length > 100000); assert.doesNotMatch(r.page, /bkOpen|gBkAppts/); // (the docked sheet rules in the desktop css name bkSheet in every trade page, they match nothing without the screen)
});

test('a trade instance WITHOUT bookings: true has none of it even with a working module', () => {
  const r = build({ trade: 'beauty', gender: 'f', screens: ['gRemind', 'gTasks', 'gNotes'] }, false);
  assert.ok(r.page.length > 100000); assert.doesNotMatch(r.page, /bkOpen|gBkAppts|תור לקוחה חדש/);
});

test('an instance with bookings: true and a broken module still builds, with the feature off', () => {
  const r = build({ trade: 'beauty', gender: 'f', bookings: true, screens: ['gRemind', 'gTasks', 'gNotes'] }, true);
  assert.ok(r.page.length > 100000); assert.doesNotMatch(r.page, /bkOpen/);
});

test('the same instance with a working module has the screen (so the checks above mean something)', () => {
  const r = build({ trade: 'beauty', gender: 'f', bookings: true, screens: ['gRemind', 'gTasks', 'gNotes'] }, false);
  assert.match(r.page, /gBkAppts/); assert.match(r.page, /תור לקוחה חדש/);
});

test('the shared code that runs for every instance is wrapped and conditional on bookings: true', () => {
  const L = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8').replace(/\r\n/g, '\n');
  const W = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8').replace(/\r\n/g, '\n');
  const Bd = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  // listen.js: the handler check and the agent's process are inside try, and need bookings: true
  for (const part of ["try { bkLine = !!(codeOk && !inst.publicDemo && inst.bookings === true && require('./lib/bookings-handler.js').isLine(inst, text)); } catch",
    "try {\n    if (inst.bookings === true && require('./lib/bookings-ui.js').enabled(inst)) {\n      const bookSup = require('./lib/book-supervisor.js').supervise(", "} catch (e) { say('!! תורים: הסוכן לא עלה: ' + e.message); }"]) assert.ok(L.includes(part), part.slice(0, 70));
  assert.ok(L.includes("say('תורים: ' + (bkA && bkA.ok ? 'בוצע' : 'נדחה')); // no name or phone in this log")); // no reply text, so no client name, in the listener log
  // worker.js: the prompt lines, the tool permission and the tick only for bookings instances, all caught
  assert.match(W, /\.\.\.\(\(\) => \{ try \{ return inst\.bookings === true && require\('\.\/lib\/bookings-ui\.js'\)\.enabled\(inst\) \? require\('\.\/lib\/bookings\.js'\)\.promptLines\(\) : \[\]; \} catch \(e\) \{ return \[\]; \} \}\)\(\),/);
  assert.match(W, /\.\.\.\(inst\.bookings === true \? \['Bash\(node booking\.js:\*\)'\] : \[\]\)/);
  assert.match(W, /if \(inst\.bookings !== true \|\| !require\('\.\/lib\/bookings-ui\.js'\)\.enabled\(inst\)\) return;/);
  assert.ok(!/'Bash\(node booking\.js:\*\)', 'Bash\(node build\.js/.test(W), 'the permission is not unconditional');
  // build.js: every call is in try
  assert.match(Bd, /\$\{\(\(\) => \{ try \{ return require\('\.\/lib\/bookings-ui\.js'\)\.html\(inst\); \} catch \(e\) \{ console\.error\('bookings off: ' \+ e\.message\); return ''; \} \}\)\(\)\}/);
  const calls = Bd.split('\n').filter((l) => /bookings-ui\.js/.test(l) && !/^\s*(\/\/|\*)/.test(l));
  for (const l of calls) assert.match(l, /try|catch/, 'not wrapped: ' + l.trim().slice(0, 100));
});

test('the instance default is off, signup of a NEW customer of a bookings trade turns it on, an existing one is untouched', () => {
  const I = require('../lib/instance.js');
  assert.strictEqual(I.DEFAULTS.bookings, false);
  const SP = require('../lib/signup-profile.js');
  assert.deepStrictEqual(SP.instanceFields({ trade: 'beauty', gender: 'f' }), { gender: 'f', trade: 'beauty', bookings: true });
  assert.deepStrictEqual(SP.instanceFields({ trade: 'gypsum' }), { trade: 'gypsum' }); // a trade without the diary
  assert.deepStrictEqual(SP.instanceFields({ gender: 'f' }), { gender: 'f' });
  assert.deepStrictEqual(SP.instanceFields(null), {});
  const UI = require('../lib/bookings-ui.js');
  assert.strictEqual(UI.enabled({ trade: 'beauty', dataPath: '/x' }), false); // the trade alone is not enough
  assert.strictEqual(UI.enabled({ trade: 'beauty', bookings: false, dataPath: '/x' }), false);
  assert.strictEqual(UI.enabled({ trade: 'beauty', bookings: true, dataPath: '/x' }), true);
  assert.strictEqual(UI.enabled({ trade: 'gypsum', bookings: true, dataPath: '/x' }), false);
  const demo = fs.readFileSync(path.join(ROOT, 'setup', 'demo-build.sh'), 'utf8');
  assert.match(demo, /j\.bookings=T\.bookings===true/);
});

test('the listener log never carries the lines of the appointments screen in the clear', () => {
  const L = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8');
  assert.strictEqual((L.match(/noBookingNames\(/g) || []).length, 2); // the places that log a message in the listener
  assert.match(L, /say\('הודעה: ' \+ noBookingNames\(/); assert.match(L, /logPull\('text', noBookingNames\(m\.message\)\)/);
  const M = require('../lib/fireflies-key.js'); // and the mask used for the receipt line
  assert.strictEqual(M.mask('תור לקוחה' + String.fromCharCode(10) + 'תור לקוחה חדש: 2026-11-23 10:00 | א | דנה | 0501234567'), 'תור לקוחה (הפרטים לא נרשמים כאן)');
  assert.strictEqual(M.mask('הזזת תור לקוחה: ab | 2026'), 'תור לקוחה (הפרטים לא נרשמים כאן)'); assert.strictEqual(M.mask('מה יש לי היום'), 'מה יש לי היום');
});
