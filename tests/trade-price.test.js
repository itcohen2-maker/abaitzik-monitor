'use strict';
/*
  21.11.2026, Itzik approved the trade packages for the monitor (lib/plan.js): solo 149 and pro 249 before VAT,
  for customers who signed up from the trade page (/day/). Times are fixed so the tests do not depend on the clock.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../lib/plan.js');
const A = require('../lib/addons.js');
const S = require('../lib/sumit.js');

const BANKS = {};
const at = (iso) => Date.parse(iso);

test('solo and pro packages: 60 and 150 actions, 149 and 249 before VAT', () => {
  assert.deepEqual([P.PACKAGES.solo.label, P.PACKAGES.solo.actions, P.PACKAGES.solo.price], ['עצמאי', 60, 149]);
  assert.deepEqual([P.PACKAGES.pro.label, P.PACKAGES.pro.actions, P.PACKAGES.pro.price], ['מקצועי', 150, 249]);
});

test('VAT is 18 percent on top: 149 is 175.82, 249 is 293.82', () => {
  assert.equal(P.withVat(149), 175.82);
  assert.equal(P.withVat(249), 293.82);
});

test('upgrade ladder: solo and pro go up, entry keeps its old list', () => {
  assert.deepEqual(P.upgradesFrom('solo').map((x) => x.plan), ['pro', 'small', 'medium', 'large']);
  assert.deepEqual(P.upgradesFrom('pro').map((x) => x.plan), ['small', 'medium', 'large']);
  assert.deepEqual(P.upgradesFrom('entry').map((x) => x.plan), ['small', 'medium', 'large']);
  assert.equal(P.canUpgrade('pro', 'solo'), false);
  assert.equal(P.canUpgrade('solo', 'entry'), false);
});

test('upgrade difference is taken from the price the customer joined at (grandfathered)', () => {
  const joined = { plan: 'solo', price: 149, start: '2026-11-20T10:00:00Z' };
  const o = P.upgradeOptions(joined).find((x) => x.plan === 'pro');
  assert.equal(o.diff, 100);
  assert.equal(P.priceOf(joined), 149);
  assert.equal(P.priceOf({ plan: 'pro' }), 249);
});

test('launch line until the end of 31.12.2026 in Israel, gone from 1.1.2027', () => {
  assert.match(P.launchLine(at('2026-12-31T20:00:00Z')), /מחיר השקה למצטרפים עד 31\.12\.2026, והוא נשאר שלך כל עוד המנוי פעיל/);
  assert.equal(P.launchLine(at('2027-01-01T00:30:00+02:00')), '');
  assert.equal(P.launchOn(at('2026-12-31T23:30:00+02:00')), true);
});

test('a day source: trade set or a /day/ ref, never a family trial, never the old ref', () => {
  // 21.11.2026 security review: only the server token (source day) decides; a ref or a trade does not.
  assert.equal(P.isDaySource({ ref: 'm-gypsum' }), false);
  assert.equal(P.isDaySource({ ref: 'm-photo' }), false);
  assert.equal(P.isDaySource({ source: 'day' }), true);
  assert.equal(P.isDaySource({ trade: 'beauty' }), false);
  assert.equal(P.isDaySource({ ref: 'shai' }), false);
  assert.equal(P.isDaySource({ source: 'day', family: true }), false);
  assert.equal(P.isDaySource({}), false);
});

test('day trial texts show 149 and 249 with VAT, and the launch line before the deadline', () => {
  const day = { plan: 'trial', start: '2026-12-01T10:00:00Z', source: 'day' };
  const end = P.sayFor(day, 'ended', at('2026-12-10T10:00:00Z'));
  assert.match(end, /149 ₪ לחודש/);
  assert.match(end, /249 ₪ לחודש/);
  assert.match(end, /\+ מע״מ/);
  assert.match(end, /מחיר השקה למצטרפים עד 31\.12\.2026/);
  assert.doesNotMatch(end, /390/);
  assert.doesNotMatch(end, /[-–]/);
  const warn = P.sayFor(day, 'warn', at('2026-12-10T10:00:00Z'));
  assert.match(warn, /149 ₪/);
  assert.doesNotMatch(warn, /390/);
});

test('day trial texts drop the launch line after the deadline', () => {
  const day = { plan: 'trial', start: '2027-01-02T10:00:00Z', source: 'day' };
  const end = P.sayFor(day, 'ended', at('2027-01-03T10:00:00Z'));
  assert.match(end, /149 ₪ לחודש/);
  assert.doesNotMatch(end, /מחיר השקה/);
});

test('everyone else keeps the 390 entry texts unchanged', () => {
  const other = { plan: 'trial', start: '2026-12-01T10:00:00Z', ref: 'shai' };
  assert.equal(P.sayFor(other, 'ended', at('2026-12-10T10:00:00Z')), P.SAY.trialEnd);
  assert.match(P.SAY.trialEnd, /390/);
});

test('the day trial becomes a paid package with the price joined at, after a payment', () => {
  const trial = { plan: 'trial', start: '2026-12-01T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [], ref: 'm-beauty' };
  const next = P.applyDayPayment(trial, { plan: 'pro', price: 249 }, 555, at('2026-12-12T10:00:00Z'));
  assert.equal(next.plan, 'pro');
  assert.equal(next.price, 249);
  assert.equal(next.month, '2026-12');
  assert.equal(next.start, undefined);
  assert.ok(next.applied.indexOf('pay-555') > -1);
  assert.equal(P.applyDayPayment(next, { plan: 'pro', price: 249 }, 555, at('2026-12-12T11:00:00Z')), next);
});

test('payment check: 149 is accepted for solo and not for pro, the card amount may be gross or net', () => {
  assert.equal(S.paymentOk({ ValidPayment: true, Amount: 149 }, 149), true);
  assert.equal(S.paymentOk({ ValidPayment: true, Amount: 175.82 }, 149), true);
  assert.equal(S.paymentOk({ ValidPayment: true, Amount: 149 }, 249), false);
  assert.equal(S.paymentOk({ ValidPayment: false, Amount: 175.82 }, 149), false);
});

test('SUMIT bodies for a trade package: name and price before VAT, VATIncluded false', () => {
  const c = { CompanyID: 1, APIKey: 'x' };
  const b = S.beginBody(c, { tenant: 't1', items: [{ name: 'המוניטור העסקי, חבילת עצמאי', price: 149 }] });
  assert.equal(b.VATIncluded, false);
  assert.equal(b.Items[0].Item.Name, 'המוניטור העסקי, חבילת עצמאי');
  assert.equal(b.Items[0].UnitPrice, 149);
  const r = S.recurringBody(c, 9, at('2026-12-12T10:00:00Z'), { name: 'המוניטור העסקי, חבילת מקצועי', price: 249 });
  assert.equal(r.VATIncluded, false);
  assert.equal(r.Items[0].UnitPrice, 249);
  assert.equal(r.Items[0].Item.Name, 'המוניטור העסקי, חבילת מקצועי');
});

test('upgrade requests: pro is a valid target from solo, entry is not', () => {
  const solo = { plan: 'solo', price: 149, start: '2026-11-20T10:00:00Z', month: '2026-12', extra: 0 };
  const q = A.quote(solo, 'upgrade:pro', {}, BANKS);
  assert.equal(q.ok, true);
  assert.equal(A.total(q), 100);
  assert.equal(A.quote(solo, 'upgrade:entry', {}, BANKS).why, 'unknown');
  assert.deepEqual(P.parseRequest('שדרוג חבילה ל pro, תשלום ההפרש מראש: 100 ₪. לאשר רק אחרי שהתשלום הגיע.'), { kind: 'upgrade', to: 'pro' });
});

test('add-ons for solo and pro: image 25 or 5 for 99, and 100 actions for 99; the old 200 stays for old packages', () => {
  const solo = { plan: 'solo', price: 149, month: '2026-12', extra: 0 };
  assert.equal(A.quote(solo, 'image', {}, BANKS).ok, true);
  assert.equal(A.total(A.quote(solo, 'image', {}, BANKS)), 25);
  assert.equal(A.total(A.quote(solo, 'image5', {}, BANKS)), 99);
  assert.equal(A.total(A.quote(solo, 'actions100', {}, BANKS)), 99);
  const m = A.menu(solo, BANKS).addons.map((x) => x.key);
  assert.ok(m.indexOf('actions100') > -1);
  assert.equal(m.indexOf('actions'), -1);
  const ent = A.menu({ plan: 'entry', month: '2026-12', extra: 0 }, BANKS).addons.map((x) => x.key);
  assert.ok(ent.indexOf('actions') > -1);
  assert.equal(ent.indexOf('actions100'), -1);
  const after = A.apply({ plan: 'solo', price: 149, month: '2026-12', extra: 0, history: [], applied: [] },
    A.quote(solo, 'actions100', {}, BANKS), 777, at('2026-12-05T10:00:00Z'));
  assert.equal(after.extra, 100);
});
const NOW = Date.parse('2026-12-12T10:00:00Z');

test('connections: solo and pro get the basics and meeting summaries, not Microsoft or YouTube', () => {
  const C = require('../lib/connections.js');
  for (const plan of ['solo', 'pro']) {
    assert.equal(C.allowed(plan, 'ten1', 'fireflies'), true);
    assert.equal(C.allowed(plan, 'ten1', 'google'), true);
    assert.equal(C.allowed(plan, 'ten1', 'microsoft'), false);
    assert.equal(C.allowed(plan, 'ten1', 'youtube'), false);
  }
});

test('meeting summaries: 3 actions in solo and pro, none in entry, counted in usage.jsonl', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const M = require('../lib/meet-push.js');
  const P2 = require('../lib/plan.js');
  assert.equal(P2.SUMMARY_ACTIONS, 3);
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-'));
  const m = { id: 'f1', title: 'פגישה', summary: 'סיכום', tasksMe: [] };
  M.write(D, m, NOW, { plan: 'solo' });
  M.write(D, Object.assign({}, m, { id: 'f2' }), NOW, { plan: 'entry' });
  const lines = fs.readFileSync(path.join(D, 'status', 'usage.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].msgs, 3);
  assert.equal(P2.usage(fs.readFileSync(path.join(D, 'status', 'usage.jsonl'), 'utf8'), P2.monthOf(NOW)).actions, 3);
});

// 21.11.2026 security review: the price is decided on the server by the date, and every paid path writes the price.
test('negative: after LAUNCH_UNTIL the order price and the texts use the regular price, not the launch price', () => {
  const table = { launch: { solo: 149, pro: 249 }, regular: { solo: 199, pro: 299 } };
  assert.equal(P.priceFor('solo', at('2026-12-31T10:00:00Z'), table), 149);
  assert.equal(P.priceFor('solo', at('2027-01-02T10:00:00Z'), table), 199);
  assert.equal(P.priceFor('pro', at('2027-01-02T10:00:00Z'), table), 299);
  assert.match(P.dayTexts(at('2027-01-02T10:00:00Z'), table).trialEnd, /199 ₪ לחודש/);
  assert.doesNotMatch(P.dayTexts(at('2027-01-02T10:00:00Z'), table).trialEnd, /149/);
  assert.match(P.dayTexts(at('2026-12-10T10:00:00Z'), table).trialEnd, /149 ₪ לחודש/);
});

test('every paid path writes the price: an entry payment sets 390 and clears a stop; an unknown plan changes nothing', () => {
  const st = { plan: 'trial', start: '2026-12-01T10:00:00Z', month: '2026-12', extra: 0, applied: [], history: [], suspended: true };
  const e = P.applyEntryPayment(st, 'entry', 901, NOW);
  assert.equal(e.plan, 'entry');
  assert.equal(e.price, 390);
  assert.equal(e.suspended, undefined);
  assert.equal(e.start, undefined);
  assert.equal(P.applyEntryPayment(st, 'huge', 902, NOW), st);
});
