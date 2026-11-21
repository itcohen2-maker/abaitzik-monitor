'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pick } = require('../lib/plan-model.js');
const env = { MONITOR_PLAN_MODEL: 'claude-sonnet-5-5' };

test('a plain request is planned on the monitor\'s plan model', () => {
  assert.strictEqual(pick('תשלח לי את הקובץ מאתמול', env), 'claude-sonnet-5-5');
});

test('3D, design and visual work go to the heavy model', () => {
  for (const t of ['תעשה הדמיה בתלת מימד', 'צריכה מצגת ללקוח', 'תפתח את ה PSD', 'עיצוב חדש לכרית'])
    assert.strictEqual(pick(t, env), 'claude-opus-5-5', t);
  assert.strictEqual(pick('רנדר', Object.assign({ MONITOR_PLAN_HEAVY: 'x' }, env)), 'x');
});

test('without settings nothing changes: Opus plans', () => {
  assert.strictEqual(pick('שלום', {}), 'claude-opus-5-5');
});
