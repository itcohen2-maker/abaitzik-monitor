'use strict';
/*
  26.11.2026, Itzik: the 60 actions are said inside the monitor (the 📦 trial sheet), not on the outside pages.
  The line is empty for a family trial and for a paid plan; a trade trial gets the trade prices.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const plan = require('../lib/plan.js');

const NOW = Date.parse('2026-11-26T10:00:00Z');
const trial = plan.PACKAGES.trial;

test('a self signup trial: 60 free actions, a week, then the entry price', () => {
  const s = plan.freeLineFor({ plan: 'trial' }, trial, NOW);
  assert.match(s, /^יש לך 60 פעולות חינם, מספיק לשבוע של עבודה\. /);
  assert.match(s, /390 ₪ לחודש, רק אם תרצה להמשיך\.$/);
});

test('a trade trial (source day): the solo and pro prices, with VAT', () => {
  const s = plan.freeLineFor({ plan: 'trial', source: 'day' }, trial, NOW);
  assert.match(s, /עצמאי ב 149 ₪ לחודש \+ מע״מ, או מקצועי ב 249 ₪ לחודש \+ מע״מ/);
});

test('a family trial and a paid plan get no line', () => {
  assert.equal(plan.freeLineFor({ plan: 'trial', family: true }, trial, NOW), '');
  assert.equal(plan.freeLineFor({ plan: 'solo' }, plan.PACKAGES.solo, NOW), '');
  assert.equal(plan.freeLineFor(null, trial, NOW), '');
});
