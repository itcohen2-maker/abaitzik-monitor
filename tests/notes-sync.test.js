'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ns = require('../lib/notes-sync.js');

test('a stale phone does not undo a newer edit, and a deleted note stays deleted', () => {
  let s = ns.merge(null, { notes: [{ id: 'a', upd: '2', text: 'new' }, { id: 'b', upd: '1', text: 'b' }], tasksDone: { t1: 'x' } });
  s = ns.merge(s, { notes: [{ id: 'a', upd: '1', text: 'old' }, { id: 'b', upd: '1', text: 'b' }], gone: { b: '3' } });
  assert.deepEqual(s.notes.map(n => n.text), ['new']);
  assert.ok(s.gone.b);
  s = ns.merge(s, { notes: [{ id: 'b', upd: '9', text: 'back' }] });
  assert.equal(s.notes.length, 1);
});

test('ticks are a union, an untick removes only its own key', () => {
  let s = ns.merge(null, { notes: [], tasksDone: { t1: 'x', t2: 'y' } });
  s = ns.merge(s, { notes: [], tasksDone: { t3: 'z' }, tasksUndone: ['t1'] });
  assert.deepEqual(Object.keys(s.tasksDone).sort(), ['t2', 't3']);
});

test('record writes the file and refuses what is not a sync', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-'));
  assert.equal(ns.record(dir, 'not json'), null);
  assert.equal(ns.record(dir, { hello: 1 }), null);
  ns.record(dir, JSON.stringify({ notes: [{ id: 'a', upd: '1', text: 'x' }] }));
  assert.equal(ns.read(dir).notes[0].text, 'x');
});
