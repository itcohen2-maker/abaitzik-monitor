'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const nw = require('../note-write.js');
const ns = require('../lib/notes-sync.js');

test('the script goes under its heading and keeps his own lines', () => {
  const n = nw.withScript({ id: 'a', text: 'ריל על הכיסא\nרעיון: לשבת', html: '<h1>ריל על הכיסא</h1><div><b>רעיון</b>: לשבת</div>', upd: '1' }, 'שורה 1\nשורה 2');
  assert.match(n.text, /^ריל על הכיסא\nרעיון: לשבת\n\n✍️ התסריט\nשורה 1\nשורה 2$/);
  assert.ok(n.html.startsWith('<h1>ריל על הכיסא</h1><div><b>רעיון</b>'));
  assert.equal(n.by, 'monitor');
  assert.ok(n.upd > '1');
});

test('a second request replaces the script, not adds another', () => {
  let n = nw.withScript({ id: 'a', text: 'רעיון' }, 'ישן');
  n = nw.withScript(n, 'חדש');
  assert.equal(n.text.split(nw.HEAD).length, 2);
  assert.ok(n.text.endsWith('חדש'));
  assert.equal(n.html.split('<h2>' + nw.HEAD).length, 2);
  assert.ok(!n.html.includes('ישן'));
});

test('writes to the synced notes, starts from the message when the note is missing, never revives a deleted one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-'));
  ns.record(dir, { notes: [{ id: 'a', text: 'רעיון', upd: '1' }], gone: { z: '1' } });
  nw.write(dir, 'a', 'תסריט');
  assert.ok(ns.read(dir).notes.find(n => n.id === 'a').text.endsWith('תסריט'));
  assert.throws(() => nw.write(dir, 'b', 'x'));
  nw.write(dir, 'b', 'x', 'רעיון חדש');
  assert.ok(ns.read(dir).notes.find(n => n.id === 'b').text.startsWith('רעיון חדש'));
  assert.throws(() => nw.write(dir, 'z', 'x', 'y'));
});
