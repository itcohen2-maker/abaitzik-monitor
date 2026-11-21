'use strict';
/*
  Itzik, 14.10.2026: "if a customer eats our daily or weekly quota, stop it and
  tell them it is blocked because of quota until manager approval."

  Pure decision logic: no files, no clock of its own, no network. worker.js
  reads quota.json and the pass, calls check(), and does the side effects.
  quota.json is written by tenants-health.js on Itzik's instance from the
  subscription status, so it only exists where the subscription is.
*/

const HOUR_MS = 60 * 60 * 1000;
// A quota reading older than this says nothing about right now; ignore it.
const QUOTA_MAX_AGE_MS = 3 * HOUR_MS;

/*
  Decide whether a customer's session must wait. Check order: day, five, week.
  A pass (approved by the manager) skips every check until its `until`.
*/
function check({ quota, limitPct, spentToday, dayUsd, pass, now }) {
  const t = now == null ? Date.now() : now;

  // A pass is the manager's approval: while it lasts nothing holds, the day
  // total included (otherwise a released day hold re-holds on the next tick).
  const passing = !!(pass && pass.until && t < Date.parse(pass.until));
  if (passing) return { hold: false };

  const spent = Number(spentToday) || 0;
  if (spent >= dayUsd) {
    return { hold: true, kind: 'day', reason: 'התקרה היומית של המוניטור, ' + spent.toFixed(2) + ' מתוך ' + dayUsd + ' דולר' };
  }

  // NaN from a missing or unreadable timestamp makes this false, so it is ignored.
  const fresh = quota && t - Date.parse(quota.at) <= QUOTA_MAX_AGE_MS;
  if (!fresh) return { hold: false };

  const five = quota.five && Number(quota.five.pct);
  if (five >= limitPct) {
    return { hold: true, kind: 'five', reason: 'מכסת חמש השעות של המנוי ב ' + five + ' אחוז' };
  }
  const week = quota.week && Number(quota.week.pct);
  if (week >= limitPct) {
    return { hold: true, kind: 'week', reason: 'המכסה השבועית של המנוי ב ' + week + ' אחוז' };
  }
  return { hold: false };
}

/*
  The pass written when the manager releases a hold of this kind. 'five' lasts
  until the five hour window resets; the others last a day.
*/
function passFor(kind, quota, now) {
  const base = now == null ? Date.now() : now;
  if (kind === 'five') {
    const resets = quota && quota.five ? Date.parse(quota.five.resets) : NaN;
    if (!isNaN(resets) && resets > base) return { until: new Date(resets).toISOString() };
    return { until: new Date(base + 5 * HOUR_MS).toISOString() };
  }
  return { until: new Date(base + 24 * HOUR_MS).toISOString() };
}

module.exports = { check, passFor };
