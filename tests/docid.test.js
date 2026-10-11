'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDocs } = require('../build.js');

// 20.9.2026: every thread in the monitor was a thread of one. The loader
// overwrote the id inside each document with the name of its file, so `re` on
// my answer pointed at an id that no longer existed anywhere, his question and
// my answer never met, and nothing ever closed. These tests hold that line.

const DIR = 'tmp-docid';
const full = path.join(__dirname, '..', 'data', DIR, DIR);

function seed(files) {
  fs.mkdirSync(full, { recursive: true });
  Object.keys(files).forEach(name => {
    fs.writeFileSync(path.join(full, name), JSON.stringify(files[name]), 'utf8');
  });
}
function clean() {
  fs.rmSync(path.join(__dirname, '..', 'data', DIR), { recursive: true, force: true });
}

test('an id written inside the document survives the load', t => {
  t.after(clean);
  seed({
    '20260920-094815-itzik.json': { id: 'ntfy-k8DTtJ7B4TQD', from: 'itzik', text: 'שאלה' },
    '20260920-0952-claude.json': { from: 'claude', re: 'ntfy-k8DTtJ7B4TQD', text: 'תשובה' },
  });
  const docs = loadDocs(DIR);
  const his = docs.find(d => d.from === 'itzik');
  const mine = docs.find(d => d.from === 'claude');
  assert.equal(his.id, 'ntfy-k8DTtJ7B4TQD');
  assert.equal(mine.re, his.id);
  // The file name is still available, under its own field.
  assert.equal(his.file, '20260920-094815-itzik');
});

test('a document with no id of its own is still named after its file', t => {
  t.after(clean);
  seed({ 'now.json': { text: 'משהו' } });
  const docs = loadDocs(DIR);
  assert.equal(docs[0].id, 'now');
  assert.equal(docs[0].file, 'now');
});
