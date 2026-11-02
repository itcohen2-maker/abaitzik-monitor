'use strict';
// 12.10: the העסק שלי tile. A customer gets it from screens (tenantTiles); Itzik's
// copy and any copy with biz: true and no screens list get the shared tile.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const inst = require('../lib/instance.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
const start = src.indexOf('const TENANT_TILES = {');
const end = src.indexOf('function cutFor(');
const { tenantTiles } = new Function(src.slice(start, end) + '; return { tenantTiles };')();

const count = (s, re) => (s.match(re) || []).length;

test('biz is a known instance field, off by default', () => {
  assert.strictEqual(inst.DEFAULTS.biz, false);
  // 17.10: on a fresh instance file, not this machine's: Itzik's own has biz: true on purpose.
  const os = require('os');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'biz-')), 'instance.json');
  fs.writeFileSync(file, '{}');
  const was = process.env.ABAITZIK_INSTANCE_FILE;
  process.env.ABAITZIK_INSTANCE_FILE = file;
  try { assert.strictEqual(inst.load().biz, false); }
  finally { if (was === undefined) delete process.env.ABAITZIK_INSTANCE_FILE; else process.env.ABAITZIK_INSTANCE_FILE = was; }
});

test('gBiz is absent from a customer home screen by default', () => {
  assert.ok(!tenantTiles({}).includes('id="gBiz"'));
  assert.ok(!tenantTiles({ screens: ['gTasks'] }).includes('id="gBiz"'));
});

test('gBiz is drawn with data-new when the screens list names it', () => {
  const html = tenantTiles({ screens: ['gBiz'] });
  assert.strictEqual(count(html, /id="gBiz"/g), 1);
  assert.ok(/id="gBiz" data-new="1"/.test(html));
  assert.ok(html.includes('💼 העסק שלי'));
});

test('the shared gBiz tile is written once, outside every ITZIK and TENANT block', () => {
  const idx = src.indexOf('id="gBiz" data-new="1"');
  assert.ok(idx > 0);
  assert.strictEqual(src.indexOf('id="gBiz" data-new="1"', idx + 1), -1);
  const before = src.slice(0, idx);
  const opened = count(before, /<!--ITZIK:BEGIN-->/g), closed = count(before, /<!--ITZIK:END-->/g);
  assert.strictEqual(opened, closed, 'not inside an ITZIK block');
  const tOpen = count(before, /<!--TENANT:BEGIN-->/g), tClose = count(before, /<!--TENANT:END-->/g);
  assert.strictEqual(tOpen, tClose, 'not inside a TENANT block');
  // The shared tile is gated by biz and by the absence of a screens list.
  assert.ok(src.includes("${inst.biz && !(Array.isArray(inst.screens) && inst.screens.length) ?"));
});

test('the client sheet is wired outside every /*ITZIK*/ block', () => {
  const idx = src.indexOf('function bizSheet(){');
  assert.ok(idx > 0);
  assert.ok(src.includes("on('gBiz',bizSheet);"));
  const before = src.slice(0, idx);
  assert.strictEqual(count(before, /\/\*ITZIK:BEGIN\*\//g), count(before, /\/\*ITZIK:END\*\//g));
});

test('the sheet never opens a browser dialog and never writes a file', () => {
  const s = src.slice(src.indexOf('function bizSheet(){'), src.indexOf("on('gBiz',bizSheet);"));
  assert.ok(!/window\.prompt|\bprompt\(|\balert\(|\bconfirm\(/.test(s));
  assert.ok(!/localStorage/.test(s));
});
