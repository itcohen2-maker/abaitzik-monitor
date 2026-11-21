'use strict';
/*
  16.11.2026: the wa-bridge delivered one message twice, 22 seconds apart (two ids, the same text).
  The session of the first copy answered it; the second copy had no answer of its own, so the
  session-end check reported "הודעה נשארה בלי תשובה" and sent it back to the queue. He asked once.
  A repeat of a message that is already answered, sent within 10 minutes with the same text, is the
  same request, so it counts as answered by its twin.
*/
const WINDOW_MS = 10 * 60 * 1000;
const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

// records: chat records (id, from, text, at). answered: Set of ids that have an answer of mine.
// Returns the ids of his messages that are repeats of an already answered message.
function twinIds(records, answered) {
  const out = new Set();
  const mine = (records || []).filter((m) => m && m.from === 'itzik' && m.id && norm(m.text) && m.at);
  mine.forEach((m) => {
    if (answered.has(m.id)) return;
    const t = Date.parse(m.at);
    const twin = mine.some((o) => o.id !== m.id && answered.has(o.id) && norm(o.text) === norm(m.text) &&
      Math.abs(Date.parse(o.at) - t) <= WINDOW_MS);
    if (twin) out.add(m.id);
  });
  return out;
}

module.exports = { twinIds };
