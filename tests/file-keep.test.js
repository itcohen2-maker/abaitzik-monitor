'use strict';
/*
  14.11.2026: how long a customer's files are kept (lib/file-keep.js). Built on a temporary data folder:
  what goes, what stays, and that a lab report is remembered by its sha before it is deleted.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const K = require('../lib/file-keep.js');

const DAY = 864e5;
const NOW = Date.parse('2026-11-14T12:00:00Z');

function put(dir, rel, ageDays, body) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body || rel);
  const t = new Date(NOW - ageDays * DAY);
  fs.utimesSync(f, t, t);
}

function fresh() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fkeep-'));
  const P = path.join(d, 'files-private'), I = path.join(d, 'inbox');
  put(P, 'voice-1.m4a', 8);            // old voice note: goes
  put(P, 'voice-2.m4a', 2);            // new voice note: stays
  put(P, 'photo.jpg', 10);             // old photo: goes
  put(P, 'invoice-oct.pdf', 40);       // a document: kept a year
  put(P, 'invoice-2025.pdf', 400);     // over a year: goes
  put(P, 'setup/logo.png', 90);        // setup form: always
  put(P, 'nda-20261001-ab12cd.pdf', 500); // signed: always
  put(P, 'stk/sticker.png', 90);       // stickers: always
  put(P, 'pinned.jpg', 90);            // marked 📌: always
  put(P, 'sale-photo.jpg', 90);        // named by the sale screen: always
  put(P, 'lab/report-old.pdf', 31, 'LAB REPORT OLD'); // lab: 30 days
  put(P, 'lab/report-new.pdf', 5);
  put(P, 'setup/lab/report-setup.pdf', 31); // a lab report in the setup form goes too
  put(I, 'voice-1.m4a', 8, 'voice-1.m4a');  // the inbox copy of a file already in files-private
  put(I, 'big.mov.part2of3', 3);            // a leftover slice
  put(I, 'only-here.png', 9);               // a photo only in the inbox: 7 days
  put(I, 'contract.docx', 30);              // a document only in the inbox: a year
  fs.writeFileSync(path.join(d, 'files-pins.json'), JSON.stringify(['pinned.jpg']));
  fs.mkdirSync(path.join(d, 'sale', 'sale'), { recursive: true });
  fs.writeFileSync(path.join(d, 'sale', 'sale', 'x.json'), JSON.stringify({ photo: 'sale-photo.jpg' }));
  return d;
}
const exists = (d, rel) => fs.existsSync(path.join(d, rel));

test('a dry run deletes nothing and lists what would go', () => {
  const d = fresh();
  const r = K.prune(d, { dry: true, now: NOW });
  assert.ok(r.gone.length >= 5);
  assert.ok(exists(d, 'files-private/voice-1.m4a'));
});

test('old voice notes, photos, copies and slices go; documents, setup, signed, pinned and named stay', () => {
  const d = fresh();
  K.prune(d, { now: NOW });
  for (const rel of ['voice-1.m4a', 'photo.jpg', 'invoice-2025.pdf', 'lab/report-old.pdf', 'setup/lab/report-setup.pdf'])
    assert.ok(!exists(d, 'files-private/' + rel), rel + ' should be gone');
  for (const rel of ['voice-2.m4a', 'invoice-oct.pdf', 'setup/logo.png', 'nda-20261001-ab12cd.pdf', 'stk/sticker.png',
    'pinned.jpg', 'sale-photo.jpg', 'lab/report-new.pdf'])
    assert.ok(exists(d, 'files-private/' + rel), rel + ' should stay');
  for (const rel of ['voice-1.m4a', 'big.mov.part2of3', 'only-here.png']) assert.ok(!exists(d, 'inbox/' + rel), 'inbox/' + rel);
  assert.ok(exists(d, 'inbox/contract.docx'));
});

test('a deleted lab report is remembered by its sha', () => {
  const d = fresh();
  K.prune(d, { now: NOW });
  const shas = JSON.parse(fs.readFileSync(K.labShasFile(d), 'utf8'));
  const h = require('crypto').createHash('sha256').update('LAB REPORT OLD').digest('hex');
  assert.ok(shas.includes(h));
});

test('expiry: a date for what goes, null for what is kept for good', () => {
  const ctx = { pins: new Set(['a.jpg']), named: '' };
  assert.strictEqual(K.expiry('a.jpg', NOW, ctx), null);
  assert.strictEqual(K.expiry('setup/x.pdf', NOW, ctx), null);
  assert.strictEqual(K.expiry('b.jpg', NOW, ctx), new Date(NOW + 7 * DAY).toISOString());
  assert.strictEqual(K.expiry('lab/r.pdf', NOW, ctx), new Date(NOW + 30 * DAY).toISOString());
  assert.strictEqual(K.expiry('doc.pdf', NOW, ctx), new Date(NOW + 365 * DAY).toISOString());
});
