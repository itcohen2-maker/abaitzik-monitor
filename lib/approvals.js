'use strict';
/*
  24.10.2026: the approval inbox, "מחכה לך". A session that is about to send, pay,
  delete or change identity writes a choices doc with type "approve" and waits for
  the answer "אישור:". Kinds in BLOCKED are never shown, even with an approval: the
  agent does not ask for them. Pure functions, used by build.js and the tests.
*/
const APPROVE_KINDS = ['send', 'pay', 'delete', 'identity'];
const BLOCKED_KINDS = ['transfer', 'dm-cold', 'friend', 'whatsapp-other'];

// Blocked wins over everything; an unknown kind is "auto" (no approval needed).
function classify(action) {
  const kind = action ? action.kind : '';
  if (BLOCKED_KINDS.indexOf(kind) > -1) return 'blocked';
  if (APPROVE_KINDS.indexOf(kind) > -1) return 'approve';
  return 'auto';
}

function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

// Returns the card the page shows, or null when the doc must not be shown:
// not an approve doc, no id or question, a kind that is not approvable, or expired.
// A bad "expires" value is ignored (no expiry note) rather than hiding the card.
function normalize(doc, now) {
  if (!doc || doc.type !== 'approve') return null;
  const id = str(doc.id).trim();
  const question = str(doc.question).replace(/\s*\n\s*/g, ' ').trim();
  if (!id || !question) return null;
  if (classify(doc) !== 'approve') return null;
  const expMs = doc.expires ? Date.parse(doc.expires) : NaN;
  const nowMs = now === undefined ? Date.now() : now;
  if (!isNaN(expMs) && expMs <= nowMs) return null;
  return {
    id,
    type: 'approve',
    at: str(doc.at),
    question,
    preview: str(doc.preview),
    why: str(doc.why),
    kind: doc.kind,
    expires: isNaN(expMs) ? '' : str(doc.expires),
  };
}

module.exports = { APPROVE_KINDS, BLOCKED_KINDS, classify, normalize };
