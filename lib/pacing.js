'use strict';

// Human pacing. The whole point is that a run should look like Itzik sitting
// down with his phone, not like a script. Quotas are deliberately low.

const QUIET_START = 23; // 23:00 local, stop working
const QUIET_END = 7;    // 07:00 local, start again

// Per network, per day. Replies only go to people who contacted us first,
// so these are safe numbers, but we still keep them modest.
const DAILY_QUOTA = {
  facebook: { replies: 40, likes: 120 },
  instagram: { replies: 40, likes: 120 },
  tiktok: { replies: 30, likes: 100 },
  youtube: { replies: 30, likes: 100 },
};

function isQuietHours(now = new Date()) {
  const h = now.getHours();
  return h >= QUIET_START || h < QUIET_END;
}

// Seconds to wait before the next action. Randomised so the gaps never form a
// pattern. Occasionally throws in a long pause, the way a person puts the
// phone down.
function nextDelaySeconds(rand = Math.random) {
  if (rand() < 0.12) return Math.round(120 + rand() * 240); // 2 to 6 min break
  return Math.round(25 + rand() * 95); // 25 to 120 seconds
}

function usedToday(state, network, kind) {
  const day = new Date().toISOString().slice(0, 10);
  const d = state.activity[day];
  if (!d || !d[network]) return 0;
  return d[network][kind] || 0;
}

function remaining(state, network, kind) {
  const quota = (DAILY_QUOTA[network] || {})[kind];
  if (quota == null) return Infinity;
  return Math.max(0, quota - usedToday(state, network, kind));
}

// Should we act right now? Returns { ok, reason }.
function check(state, network, kind, now = new Date()) {
  if (isQuietHours(now)) {
    return { ok: false, reason: 'שעות שקט, לא פועלים בין 23:00 ל־07:00' };
  }
  const left = remaining(state, network, kind);
  if (left <= 0) {
    return { ok: false, reason: `נגמרה המכסה היומית של ${kind} ב־${network}` };
  }
  return { ok: true, reason: null, remaining: left };
}

module.exports = {
  QUIET_START,
  QUIET_END,
  DAILY_QUOTA,
  isQuietHours,
  nextDelaySeconds,
  usedToday,
  remaining,
  check,
};
