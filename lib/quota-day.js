'use strict';
/*
  24.10.2026: the day's quota as one number, for the customer's page.
  The cost of today (Israel day) from data/status/usage.jsonl and the day cap are the
  ones worker.js quotaHold uses; worker.js now calls spentToday and dayCap from here, so
  the bar on the page and the hold can never disagree. Pure: paths and env come in.
*/
const fs = require('fs');
const path = require('path');

function israelDay(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d); }

function spentToday(statusDir, now) {
  const today = israelDay(new Date(now == null ? Date.now() : now));
  try {
    return fs.readFileSync(path.join(statusDir, 'usage.jsonl'), 'utf8').split('\n').filter(Boolean)
      .reduce((n, l) => { try { const u = JSON.parse(l); return israelDay(new Date(u.at)) === today ? n + (u.usd || 0) : n; } catch (e) { return n; } }, 0);
  } catch (e) { return 0; }
}

// A tier's ceiling, else MONITOR_DAY_USD, else 8 dollars (list price).
function dayCap(env, tier) {
  return tier ? tier.dayUsd : (Number((env || process.env).MONITOR_DAY_USD) || 8);
}

/*
  What the page shows, or null where no ceiling applies (Itzik's own monitor, or a
  customer on an own account without a tier). pct is the share used, 0 to 100.
*/
function view({ name, statusDir, ownAccount, tier, env, now }) {
  if (name === 'abaitzik' || (ownAccount && !tier)) return null;
  const cap = dayCap(env, tier);
  const used = spentToday(statusDir, now);
  const pct = cap > 0 ? Math.min(100, Math.round(used / cap * 100)) : 0;
  return { pct, used: Math.round(used * 100) / 100, cap };
}

module.exports = { spentToday, dayCap, view, israelDay };
