'use strict';
/*
  21.11.2026, Itzik: a campaign taste: one full questionnaire (campQuiz, sent as "קמפיין: ... (שאלון)") with its images,
  once per customer, the trial included. The second one gets one line: Small at 700 + מע״מ with its actions.
  21.11.2026 security review: the counter lives in the bridge's own directory (DATA/taste/<tenant>.json), never in the
  customer's folder (his session could delete it). A symlink is never followed, and a counter that can not be read
  or written refuses the questionnaire.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const T = require('../lib/taste.js');

const Q = 'קמפיין: קרוסלה מהחומר שלי (שאלון)\nעסק: מספרה';
const NOW = Date.parse('2026-12-12T10:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'taste-'));

test('the first questionnaire of a trial, solo or pro customer passes and is counted once, in the bridge dir', () => {
  const D = tmp();
  for (const plan of ['trial', 'solo', 'pro']) {
    const t = 'ten-' + plan;
    assert.deepEqual(T.gate(D, t, plan, Q, NOW, true), { pass: true, marked: true });
    assert.equal(JSON.parse(fs.readFileSync(path.join(D, 'taste', t + '.json'), 'utf8')).at, new Date(NOW).toISOString());
  }
});

test('the second questionnaire gets the Small line with 700 and + מע״מ and 500 actions, not a quiz', () => {
  const D = tmp();
  T.gate(D, 't1', 'solo', Q, NOW, true);
  const g = T.gate(D, 't1', 'solo', Q, NOW, true);
  assert.equal(g.pass, false);
  assert.match(g.line, /Small/);
  assert.match(g.line, /700 ₪ לחודש \+ מע״מ/);
  assert.match(g.line, /500 פעולות/);
  assert.doesNotMatch(g.line, /[-–]/);
});

test('negative: a counter deleted or written in the customer folder does not reset anything (the bridge dir decides)', () => {
  const D = tmp(), customer = tmp();
  T.gate(D, 't1', 'solo', Q, NOW, true);
  fs.mkdirSync(path.join(customer, 'data', 'status'), { recursive: true });
  fs.writeFileSync(path.join(customer, 'data', 'status', 'campaign-taste.json'), '{}');
  assert.equal(T.gate(D, 't1', 'solo', Q, NOW, true).pass, false);
});

test('negative: a symlink where the counter goes is never followed: refused, nothing written to its target', () => {
  const D = tmp(), victim = path.join(tmp(), 'victim.json');
  fs.mkdirSync(path.join(D, 'taste'), { recursive: true });
  fs.writeFileSync(victim, 'keep');
  fs.symlinkSync(victim, path.join(D, 'taste', 't1.json'));
  const g = T.gate(D, 't1', 'solo', Q, NOW, true);
  assert.equal(g.pass, false);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep');
});

test('negative: a counter that can not be written refuses the questionnaire (fail closed)', () => {
  const D = tmp();
  fs.writeFileSync(path.join(D, 'taste'), 'a file where the folder should be');
  const g = T.gate(D, 't1', 'solo', Q, NOW, true);
  assert.equal(g.pass, false);
  assert.ok(g.line);
});

test('other packages, other messages and a plain chat never touch the counter', () => {
  const D = tmp();
  assert.deepEqual(T.gate(D, 't1', 'entry', Q, NOW, true), { pass: true });
  assert.deepEqual(T.gate(D, 't1', 'small', Q, NOW, true), { pass: true });
  assert.deepEqual(T.gate(D, 't1', 'solo', 'שלום, מה מחכה לי היום?', NOW, true), { pass: true });
  assert.equal(fs.existsSync(path.join(D, 'taste')), false);
});

test('the campaign taste is OFF by default: the gate passes and counts nothing (third review)', () => {
  const D = tmp();
  assert.equal(T.TASTE_ON, false);
  assert.deepEqual(T.gate(D, 't1', 'solo', Q, NOW), { pass: true });
  assert.deepEqual(T.gate(D, 't1', 'solo', Q, NOW), { pass: true });
  assert.equal(fs.existsSync(path.join(D, 'taste')), false);
});
