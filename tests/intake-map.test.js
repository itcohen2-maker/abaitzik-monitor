'use strict';
/*
  24.10.2026, stage 7: the intake mapping (lib/intake-map.js) against the real form.
  The fixture is one complete response (tests/fixtures/intake-answers.json). The form
  itself is read from setup/intake-form.gs, so a renamed question or a changed choice
  fails here instead of silently losing an answer in production.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mapIntake, parseCsv, answersFromCsv, choiceStrings, RULES } = require('../lib/intake-map.js');

const ROOT = path.join(__dirname, '..');
const FORM = fs.readFileSync(path.join(ROOT, 'setup', 'intake-form.gs'), 'utf8');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'intake-answers.json'), 'utf8'));
// Questions only: section headers (addSectionHeaderItem) are not answered, so they have no rule.
const formTitles = [...new Set([...FORM.matchAll(/add(?:MultipleChoice|Text|ParagraphText)Item\(\)\.setTitle\('([^']+)'\)/g)].map((m) => m[1]))];

test('every question in the form has a rule, and every rule is a question in the form', () => {
  const ruleTitles = RULES.map((r) => r.title);
  assert.equal(new Set(ruleTitles).size, ruleTitles.length, 'no question twice in the table');
  assert.deepEqual(ruleTitles.filter((t) => !formTitles.includes(t)), [], 'rules name no question the form lacks');
  assert.deepEqual(formTitles.filter((t) => !ruleTitles.includes(t)), [], 'form questions with no rule');
});

test('every answer the table names is a choice in the form', () => {
  for (const c of choiceStrings()) assert.ok(FORM.includes(c), 'not in the form: ' + c);
});

test('the realistic fixture covers every question of the form', () => {
  assert.deepEqual(formTitles.filter((t) => !(t in FIXTURE)), []);
});

test('a complete response maps to the expected instance', () => {
  const m = mapIntake(FIXTURE);
  assert.equal(m.owner, 'דנה כהן');
  assert.equal(m.pageTitle, 'המוניטור של דנה כהן');
  assert.equal(m.welcome.startsWith('שלום דנה, '), true);
  assert.deepEqual(m.screens, ['gToday', 'gTasks', 'gNotes', 'gRemind', 'gCIdeas', 'gPlan', 'gVoices',
    'gFiles', 'gRemote', 'gBiz', 'gPush', 'gBrief']);
  assert.equal(m.biz, true);
  assert.equal(m.computer, 'mac');
  assert.equal(m.phone, 'ios');
  assert.equal(m.profile.tone, 'casual', 'חברי is casual');
  assert.deepEqual(m.profile.services, ['הכל יחד']);
  assert.deepEqual(m.profile.modules, ['biz', 'morning'], 'Morning named in a free text answer');
  assert.equal(m.profile.bank, 'בנק הפועלים');
  assert.equal(m.profile.suggestedTier, 'pro20', '20 dollar Claude Pro named in the last answer');
  assert.equal(m.profile.business, '', 'business name is not asked, never guessed');
  assert.equal(m.profile.hours, '', 'opening hours are not asked, never guessed');
});

test('answers the table cannot place go to intakeNotes for the operator', () => {
  const m = mapIntake(FIXTURE);
  assert.ok(m.intakeNotes.includes('איך אתה מוציא חשבוניות?: רואה חשבון'), 'invoices stay a note');
  assert.ok(m.intakeNotes.some((n) => n.startsWith('מה הכי מתסכל אצל לקוחות?: ')));
  assert.ok(m.intakeNotes.some((n) => n.includes('ניתן לזהות מורנינג')));
  assert.ok(m.intakeNotes.some((n) => n.includes('להציע את הפרופיל pro20')));
  assert.ok(m.intakeNotes.some((n) => n.startsWith('לא נשאל בשאלון: שם העסק')));
});

test('the phone or mail for a call back is never written to the proposal', () => {
  const out = JSON.stringify(mapIntake(FIXTURE));
  assert.equal(out.includes('050-1234567'), false);
  assert.ok(mapIntake(FIXTURE).intakeNotes.some((n) => n.startsWith('טלפון או מייל לחזרה: לא נכתב')));
});

test('an empty response is a plain monitor: the two default screens, formal tone, no biz', () => {
  const m = mapIntake({});
  assert.deepEqual(m.screens, ['gTasks', 'gNotes']);
  assert.equal(m.biz, false);
  assert.equal(m.profile.tone, 'formal');
  assert.deepEqual(m.profile.modules, []);
  assert.equal(m.pageTitle, 'המוניטור');
  assert.ok(m.intakeNotes.some((n) => n.includes('השם חסר')));
});

test('no customers yet and no money screen: biz stays off, no gBiz tile', () => {
  const m = mapIntake({ 'כמה לקוחות פעילים יש לך עכשיו?': 'אין עדיין', 'מה מתאר הכי טוב את מה שאתה עושה ביום יום?': 'לומד' });
  assert.equal(m.biz, false);
  assert.equal(m.screens.includes('gBiz'), false);
});

test('a computer that is not there means no remote tile', () => {
  const m = mapIntake({ 'איזה מחשב יש לך?': 'אין לי מחשב', 'אתה עובד בעיקר מול מחשב או מול טלפון?': 'מחשב' });
  assert.equal(m.computer, null);
  assert.equal(m.screens.includes('gRemote'), false);
});

test('an unknown key, or a free text answer to a closed question, is noted and not guessed', () => {
  const m = mapIntake({ 'שאלה שלא קיימת בטופס': 'משהו', 'איזה טלפון יש לך?': 'נוקיה 3310' });
  assert.ok(m.intakeNotes.includes('לא בטופס המיפוי, שאלה שלא קיימת בטופס: משהו'));
  assert.ok(m.intakeNotes.includes('איזה טלפון יש לך?: נוקיה 3310'));
  assert.equal(m.phone, null);
});

test('the proposal loads with the instance loader and raises no unknown field notes', () => {
  const file = path.join(os.tmpdir(), 'intake-map-test-' + process.pid + '.json');
  fs.writeFileSync(file, JSON.stringify(mapIntake(FIXTURE)), 'utf8');
  const prev = process.env.ABAITZIK_INSTANCE_FILE;
  process.env.ABAITZIK_INSTANCE_FILE = file;
  try {
    const inst = require('../lib/instance.js').load();
    assert.deepEqual(inst.notes.filter((n) => n.includes('unknown field')), []);
    assert.equal(inst.profile.suggestedTier, 'pro20');
    assert.deepEqual(inst.screens, mapIntake(FIXTURE).screens);
  } finally {
    if (prev === undefined) delete process.env.ABAITZIK_INSTANCE_FILE; else process.env.ABAITZIK_INSTANCE_FILE = prev;
    fs.unlinkSync(file);
  }
});

test('customer-visible copy has no dashes and never names Itzik', () => {
  const m = mapIntake(FIXTURE);
  for (const s of [m.welcome, m.pageTitle]) {
    assert.doesNotMatch(s, /[-–—־]/);
    assert.equal(s.includes('איציק'), false);
  }
});

test('parseCsv handles quotes, doubled quotes, commas and line breaks inside fields', () => {
  const rows = parseCsv('a,"b, c","say ""hi""",d\r\n"x\ny",z,,\n');
  assert.deepEqual(rows, [['a', 'b, c', 'say "hi"', 'd'], ['x\ny', 'z', '', '']]);
});

test('answersFromCsv picks the last response by default and a numbered one on request', () => {
  const csv = '﻿Timestamp,איך קוראים לך?,איזה מחשב יש לך?\n'
    + '24/10/2026 10:00:00,רונית,ווינדוס\n'
    + '24/10/2026 11:00:00,"לוי, אבי",מק (אפל)\n';
  const last = answersFromCsv(csv);
  assert.equal(last.row, 2);
  assert.deepEqual(last.answers, { 'איך קוראים לך?': 'לוי, אבי', 'איזה מחשב יש לך?': 'מק (אפל)' });
  assert.equal(answersFromCsv(csv, 1).answers['איך קוראים לך?'], 'רונית');
  assert.throws(() => answersFromCsv(csv, 3), /אין תשובה מספר 3/);
});
