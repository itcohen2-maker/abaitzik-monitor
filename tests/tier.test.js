const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// 17.10.2026: the pro20 tier, a customer on his own $20 Claude Pro plan.
const tier = require('../lib/tier.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');

test('the tier is chosen only by MONITOR_TIER', () => {
  assert.strictEqual(tier.current({}), null);
  assert.strictEqual(tier.current({ MONITOR_TIER: 'nope' }), null);
  const t = tier.current({ MONITOR_TIER: 'pro20' });
  assert.strictEqual(t.name, 'pro20');
  assert.strictEqual(t.oneStage, true);
  assert.strictEqual(t.maxLive, 1);
  assert.ok(t.model.includes('haiku'));
  assert.strictEqual(t.dayUsd, 3);
});

test('the prompt lines are empty without a tier and plain Hebrew with one', () => {
  assert.deepStrictEqual(tier.promptLines(null), []);
  const lines = tier.promptLines(tier.current({ MONITOR_TIER: 'pro20' }));
  assert.ok(lines.length > 3);
  assert.ok(!lines.some((l) => l.includes('-') || l.includes('–')));
});

test('worker.js carries the tier in every place it is used', () => {
  assert.ok(src.includes('const MAX_LIVE = TIER ? TIER.maxLive : 3;'));
  assert.ok(src.includes('(TIER && TIER.oneStage)'));
  assert.ok(src.includes("require('./lib/tier.js').promptLines(TIER)"));
  assert.ok(src.includes('else if (lim) holdLimit(lim);'));
  assert.ok(src.includes('(ownAccount() && !TIER)'));
});

const limitBody = src.match(/function limitFailure\(text\) \{[\s\S]*?\n\}/)[0];
const limitFailure = new Function(limitBody + '; return limitFailure;')();

test('a usage limit is recognised, a credit failure is not', () => {
  assert.ok(limitFailure('Claude AI usage limit reached|1760000000') !== '');
  assert.ok(limitFailure('5-hour limit reached ∙ resets 3pm') !== '');
  assert.ok(limitFailure('rate_limit_error') !== '');
  assert.strictEqual(limitFailure('Credit balance is too low'), '');
  assert.strictEqual(limitFailure(''), '');
});
