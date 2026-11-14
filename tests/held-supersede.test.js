'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { supersede } = require('../lib/held-supersede.js');

function write(dir, name, obj) { fs.writeFileSync(path.join(dir, name), JSON.stringify(obj), 'utf8'); }
function read(dir, name) { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); }

test('15.11: a coded voice note closes its held copy sent ten seconds earlier, and nothing else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'held-'));
  write(dir, '20261114-142324-itzik-auto.json', { at: '2026-11-14T14:23:24.292Z', from: 'unverified', status: 'held', heldWhy: 'no-code', text: 'הודעה קולית: voice-20261114162316.m4a', files: ['voice-20261114162316.m4a'] });
  write(dir, '20261114-141000-itzik-auto.json', { at: '2026-11-14T14:10:00.000Z', from: 'unverified', status: 'held', text: 'הודעה קולית: old.m4a' });
  write(dir, '20261114-142334-itzik-auto.json', { at: '2026-11-14T14:23:34.968Z', from: 'itzik', status: 'working', text: 'הודעה קולית מהמוניטור\n\nקוד ••••49' });
  write(dir, 'x-other.json', { at: '2026-11-14T14:23:30.000Z', from: 'unverified', status: 'held', text: 'שאלה רגילה' });
  const rec = read(dir, '20261114-142334-itzik-auto.json');
  assert.equal(supersede(dir, '20261114-142334-itzik-auto.json', rec), 1);
  const old = read(dir, '20261114-142324-itzik-auto.json');
  assert.equal(old.status, 'done');
  assert.equal(old.mergedInto, '20261114-142334-itzik-auto.json');
  assert.equal(old.heldWhy, 'no-code');
  // 10 minutes before is outside the window; a non voice held message stays held
  assert.equal(read(dir, '20261114-141000-itzik-auto.json').status, 'held');
  assert.equal(read(dir, 'x-other.json').status, 'held');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('15.11: an uncoded or non voice message closes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'held-'));
  write(dir, 'a.json', { at: '2026-11-14T14:23:24.000Z', from: 'unverified', status: 'held', text: 'הודעה קולית: v.m4a' });
  assert.equal(supersede(dir, 'b.json', { at: '2026-11-14T14:23:30.000Z', from: 'unverified', text: 'הודעה קולית: v.m4a' }), 0);
  assert.equal(supersede(dir, 'b.json', { at: '2026-11-14T14:23:30.000Z', from: 'itzik', text: 'שאלה' }), 0);
  assert.equal(read(dir, 'a.json').status, 'held');
  fs.rmSync(dir, { recursive: true, force: true });
});
