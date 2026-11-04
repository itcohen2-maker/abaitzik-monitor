'use strict';
/*
  The monthly action packages (lib/plan.js). Times are fixed so the tests do not
  depend on the clock. 4.11.2026, Itzik's packages.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const plan = require('../lib/plan.js');

const NOW = Date.parse('2026-11-15T10:00:00Z');
const line = (at, msgs, usd) => JSON.stringify({ at, msgs, usd });
const medium = { plan: 'medium', month: '2026-11', extra: 0, history: [] };

test('the Israel month, not the UTC one', () => {
  assert.equal(plan.monthOf(Date.parse('2026-11-30T22:30:00Z')), '2026-12');
  assert.equal(plan.monthOf(Date.parse('2026-11-30T21:30:00Z')), '2026-11');
});

test('usage sums msgs of this month only, skips bad lines', () => {
  const t = [line('2026-11-02T08:00:00Z', 3, 0.5), line('2026-10-31T08:00:00Z', 9, 9), 'junk', '', line('2026-11-09T08:00:00Z', 2, 0.25)].join('\n');
  assert.deepEqual(plan.usage(t, '2026-11'), { actions: 5, usd: 0.75 });
});

test('a planner line carries zero actions', () => {
  const t = [line('2026-11-02T08:00:00Z', 0, 0.3), line('2026-11-02T08:01:00Z', 1, 0.1)].join('\n');
  assert.equal(plan.usage(t, '2026-11').actions, 1);
});

test('no state or an unknown package means no enforcement', () => {
  assert.equal(plan.status(null, '', NOW), null);
  assert.equal(plan.status({ plan: 'huge', month: '2026-11' }, '', NOW), null);
});

test('ok below 80, warn from 80, full at 100', () => {
  const at = (n) => plan.status(medium, line('2026-11-05T08:00:00Z', n, 0), NOW);
  assert.equal(at(799).level, 'ok');
  assert.equal(at(800).level, 'warn');
  assert.equal(at(999).level, 'warn');
  assert.equal(at(1000).level, 'full');
  assert.equal(at(1000).pct, 100);
  assert.equal(at(1500).pct, 100);
});

test('an add-on raises the total for its month and is gone the next', () => {
  const s = Object.assign({}, medium, { extra: 200 });
  assert.equal(plan.status(s, '', NOW).total, 1200);
  assert.equal(plan.status(s, '', Date.parse('2026-12-02T10:00:00Z')).total, 1000);
});

test('the count starts again in a new month', () => {
  const t = line('2026-11-05T08:00:00Z', 1000, 5);
  assert.equal(plan.status(medium, t, NOW).level, 'full');
  assert.equal(plan.status(medium, t, Date.parse('2026-12-01T10:00:00Z')).used, 0);
});

test('cost guard at 40 percent of the package price in dollars', () => {
  const limit = 0.4 * 1400 / 3.7;
  assert.equal(plan.status(medium, line('2026-11-05T08:00:00Z', 1, limit - 1), NOW).cheap, false);
  assert.equal(plan.status(medium, line('2026-11-05T08:00:00Z', 1, limit + 0.01), NOW).cheap, true);
});

test('the customer view carries actions and never dollars', () => {
  const v = plan.view(plan.status(medium, line('2026-11-05T08:00:00Z', 10, 3), NOW));
  assert.equal(v.used, 10);
  assert.equal(v.total, 1000);
  assert.ok(!('usd' in v) && !('price' in v) && !('costLimit' in v) && !('cheap' in v));
});

test('request texts parse back, and a forged text does not', () => {
  assert.deepEqual(plan.parseRequest(plan.upgradeText('medium', 'large')), { kind: 'upgrade', to: 'large' });
  assert.deepEqual(plan.parseRequest(plan.addonText()), { kind: 'addon' });
  assert.equal(plan.parseRequest('שדרוג חבילה ל Huge'), null);
  assert.equal(plan.parseRequest('בקשה אחרת'), null);
});

test('the upgrade text names the difference to pay in advance', () => {
  assert.match(plan.upgradeText('medium', 'large'), /^שדרוג חבילה ל Large, תשלום ההפרש מראש: 1,200 ₪/);
  assert.match(plan.addonText(), /^תוספת 200 פעולות, 300 ₪ מראש/);
  assert.match(plan.addonText(), /אחרי שהתשלום הגיע/);
  assert.equal(plan.upgradeDiff('small', 'medium'), 700);
});

test('upgrade applies once, add-on adds 200, ids are idempotent', () => {
  let s = plan.applyRequest(medium, { kind: 'upgrade', to: 'large' }, 'cr1', NOW);
  assert.equal(s.plan, 'large');
  assert.deepEqual(s.applied, ['cr1']);
  const again = plan.applyRequest(s, { kind: 'upgrade', to: 'large' }, 'cr1', NOW);
  assert.equal(again, s);
  s = plan.applyRequest(s, { kind: 'addon' }, 'cr2', NOW);
  s = plan.applyRequest(s, { kind: 'addon' }, 'cr3', NOW);
  assert.equal(s.extra, 400);
  assert.equal(plan.status(s, '', NOW).total, 2400);
});

test('an upgrade never goes down or sideways', () => {
  const s = plan.applyRequest(medium, { kind: 'upgrade', to: 'small' }, 'cr1', NOW);
  assert.equal(s.plan, 'medium');
  assert.equal(s.history.slice(-1)[0].kind, 'ignored');
});

test('applying in a new month rolls the add-on away first', () => {
  const old = { plan: 'medium', month: '2026-10', extra: 400, history: [] };
  const s = plan.applyRequest(old, { kind: 'addon' }, 'cr9', NOW);
  assert.equal(s.month, '2026-11');
  assert.equal(s.extra, 200);
});

test('the messages to the customer have no dashes and no dollars', () => {
  Object.values(plan.SAY).forEach((m) => assert.ok(!/[-–—$]/.test(m)));
  assert.match(plan.SAY.warn, /80%/);
});
