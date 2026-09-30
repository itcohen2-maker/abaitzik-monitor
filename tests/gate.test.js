// 30.9: the gate moved from a six digit code to five Hebrew words. These pin
// the two things that must not drift: what he types and what the key file
// holds fold to one string, and a copy that did not upgrade (Ilay's) derives
// exactly what it did before.
process.env.MONITOR_NO_GATE = '1';
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const gate = require('../gate.js');

// A gate.js of its own in a temp folder, with whatever key files the test
// wants next to it. Each folder is a fresh module, so nothing is cached across.
function copyWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  fs.copyFileSync(path.join(root, 'gate.js'), path.join(dir, 'gate.js'));
  for (const [n, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), v, 'utf8');
  const prev = process.env.MONITOR_NO_GATE;
  delete process.env.MONITOR_NO_GATE;
  const mod = require(path.join(dir, 'gate.js'));
  if (prev !== undefined) process.env.MONITOR_NO_GATE = prev;
  return { dir, mod, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
// The smallest payload the page renders, as in page.test.js (not required
// from there: requiring a test file runs its tests a second time).
function fixture() {
  return { now: null, openCmds: [], builtAt: '2026-09-30T08:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 }, choices: [], food: [],
    pending: [], replied: [], contacts: [], reports: [], chat: [] };
}
const SALT = Buffer.alloc(16, 7).toString('base64');
const NEW_SALT = Buffer.alloc(16, 9).toString('base64');

test('a passphrase folds to one form: spaces, NFC, marks and final letters', () => {
  const clean = 'שולחן כריך מגדלור פרפר ענן';
  const n = gate.normalize(clean);
  assert.equal(gate.normalize('  שולחן   כריך\tמגדלור  פרפר ענן  '), n, 'extra and trailing spaces');
  assert.equal(gate.normalize('שולחן כריך מגדלור פרפר ענן\n'), n, 'no-break spaces and a newline');
  assert.equal(gate.normalize('‏שולחן כריך‎ מגדלור פרפר ענן'), n, 'direction marks');
  assert.equal(gate.normalize(clean.normalize('NFD')), n, 'decomposed form');
  assert.equal(gate.normalize('שולחנ כריכ מגדלור פרפר עננ'), n, 'final letters typed as regular ones');
  assert.equal(gate.normalize('שֻׁלְחָן כריך מגדלור פרפר ענן'), gate.normalize('שלחן כריך מגדלור פרפר ענן'), 'niqqud dropped');
  // One space stays one space: words are not glued together.
  assert.notEqual(gate.normalize('שולחן כריך'), gate.normalize('שולחןכריך'));
  // A code is untouched, so every six digit copy derives what it always did.
  for (const c of ['482913', ' 482913\n', '90817263']) assert.equal(gate.normalize(c), c.trim());
});

test('the page folds what he types exactly as the server folds the key file', () => {
  const { renderPage } = require('../build.js');
  const html = renderPage(fixture({}));
  const at = html.indexOf('function gnorm(s){');
  assert.ok(at > 0, 'the page has gnorm');
  const src = html.slice(at, html.indexOf('\n', at));
  const gnorm = new Function(src + '\nreturn gnorm;')();
  for (const s of ['  שולחן   כריך  ', 'שולחנ כריכ', '‏ענן פרפר', 'שֻׁלְחָן'.normalize('NFD'), '482913', '', ' a  B ']) {
    assert.equal(gnorm(s), gate.normalize(s), JSON.stringify(s));
  }
  // The submit and the derive both go through it.
  assert.ok(html.includes("var code=gnorm(box.value);"));
  assert.ok(html.includes("enc.encode(gnorm(code))"));
});

test('a copy without gate-params.json keeps its salt, 210000 rounds and the keypad', () => {
  const c = copyWith({ 'gate-key.txt': '482913\n', 'gate-salt.txt': SALT });
  try {
    assert.deepEqual(c.mod.pageParams(), { salt: SALT, rounds: 210000 });
    assert.equal(c.mod.rounds, 210000);
    // Byte for byte the key the old gate.js derived: trim, then PBKDF2.
    const old = crypto.pbkdf2Sync('482913', Buffer.from(SALT, 'base64'), 210000, 32, 'sha256');
    const blob = c.mod.seal('שלום');
    const [ivB, bodyB] = blob.split('.');
    const all = Buffer.from(bodyB, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', old, Buffer.from(ivB, 'base64'));
    d.setAuthTag(all.subarray(all.length - 16));
    assert.equal(Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]).toString('utf8'), 'שלום');
  } finally { c.done(); }
});

test('a copy with gate-params.json seals under its own salt and rounds, and the old key cannot open it', () => {
  const words = 'שולחן כריך מגדלור פרפר ענן';
  const legacy = copyWith({ 'gate-key.txt': '482913\n', 'gate-salt.txt': SALT });
  const fresh = copyWith({ 'gate-key.txt': '  ' + words.replace(/ /g, '  ') + ' \n', 'gate-salt.txt': SALT,
    'gate-params.json': JSON.stringify({ salt: NEW_SALT, rounds: 600000 }) });
  try {
    assert.deepEqual(fresh.mod.pageParams(), { salt: NEW_SALT, rounds: 600000, words: 1 });
    assert.ok(fresh.mod.NEW_ROUNDS >= 600000);
    const blob = fresh.mod.seal('הודעה');
    assert.equal(fresh.mod.open(blob), 'הודעה');
    assert.throws(() => legacy.mod.open(blob), 'the six digit key must not open a passphrase blob');
    assert.throws(() => fresh.mod.open(legacy.mod.seal('x')), 'and the other way round');
    // The messy key file derives the same key as the clean words would, once
    // folded (final letters become regular ones on both sides).
    const k = crypto.pbkdf2Sync(fresh.mod.normalize(words), Buffer.from(NEW_SALT, 'base64'), 600000, 32, 'sha256');
    const [ivB, bodyB] = blob.split('.');
    const all = Buffer.from(bodyB, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivB, 'base64'));
    d.setAuthTag(all.subarray(all.length - 16));
    assert.equal(Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]).toString('utf8'), 'הודעה');
    // Sealed files are named by the key, so the names change with it too.
    assert.notEqual(fresh.mod.fileId('a.pdf'), legacy.mod.fileId('a.pdf'));
  } finally { legacy.done(); fresh.done(); }
});

test('a broken gate-params.json stops the build instead of falling back', () => {
  for (const bad of ['{', JSON.stringify({ salt: 'AA==', rounds: 600000 }), JSON.stringify({ salt: NEW_SALT, rounds: 1000 })]) {
    const c = copyWith({ 'gate-key.txt': '482913', 'gate-salt.txt': SALT, 'gate-params.json': bad });
    try { assert.throws(() => c.mod.seal('x'), bad); } finally { c.done(); }
  }
});

test('the browser derives the same key as the server from the typed words', async () => {
  const words = 'גזר עוגה מגדלור פרפר ענן';
  const c = copyWith({ 'gate-key.txt': words + '\n', 'gate-salt.txt': SALT,
    'gate-params.json': JSON.stringify({ salt: NEW_SALT, rounds: 100000 }) });
  try {
    const { renderPage } = require('../build.js');
      const html = renderPage(fixture({}));
    const src = html.slice(html.indexOf('function gnorm(s){'), html.indexOf('\n', html.indexOf('function gnorm(s){')));
    const gnorm = new Function(src + '\nreturn gnorm;')();
    const typed = ' גזר  עוגה מגדלור פרפר עננ ';
    const subtle = globalThis.crypto.subtle;
    const base = await subtle.importKey('raw', new TextEncoder().encode(gnorm(typed)), 'PBKDF2', false, ['deriveKey']);
    const k = await subtle.deriveKey({ name: 'PBKDF2', salt: Buffer.from(NEW_SALT, 'base64'), iterations: 100000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
    const blob = c.mod.seal('נפתח');
    const [ivB, bodyB] = blob.split('.');
    const out = await subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(ivB, 'base64') }, k, Buffer.from(bodyB, 'base64'));
    assert.equal(new TextDecoder().decode(out), 'נפתח');
  } finally { c.done(); }
});

test('the lock card: a text keyboard for a passphrase, the keypad for a code', () => {
  const { renderPage } = require('../build.js');
  const html = renderPage(fixture({}));
  const ui = html.slice(html.indexOf('function gateUI(){'), html.indexOf('function gateBoot(){'));
  const words = ui.slice(ui.indexOf('<form id="gateForm" class="gw">'), ui.indexOf(':\'<form id="gateForm">'));
  assert.ok(words.includes('type="password"'));
  assert.ok(words.includes('autocorrect="off"') && words.includes('autocapitalize="off"'));
  assert.ok(!words.includes('inputmode') && !words.includes('maxlength'), 'nothing may block a long Hebrew passphrase');
  assert.ok(ui.includes('id="gateEye"'));
  // The keypad copy is exactly what it was.
  assert.ok(ui.includes('<form id="gateForm"><input id="gateIn" type="tel" inputmode="numeric" autocomplete="off"\'\n  +\' maxlength="12" placeholder="הקוד">'));
  assert.ok(html.includes("var W=!!(GATE&&GATE.words);"));
  // The page takes its salt and rounds from the gate, not from a constant.
  const src = fs.readFileSync(path.join(root, 'build.js'), 'utf8');
  assert.ok(src.includes('JSON.stringify(gate.pageParams())'));
});

test('gate-params.json never reaches the repository', () => {
  const ig = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert.ok(ig.includes('gate-params.json'), 'a tracked gate-params.json would reach every customer copy');
  assert.ok(ig.includes('gate-key.txt'));
});
