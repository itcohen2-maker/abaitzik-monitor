'use strict';
/*
  21.11.2026 security review: the worker's plan gate (worker.js planHold). Fail closed: a plan file that is there but
  gives nothing (broken, empty, unreadable) holds the session. Only a customer with no plan file at all is not enforced,
  and Itzik's own monitor is never enforced.
  decide -> 'exempt' (no check), 'hold' (no session), 'check' (the level decides as before).
*/
function decide(o) {
  if (!o || o.name === 'abaitzik') return 'exempt';
  if (o.threw) return 'hold';
  if (!o.status) return o.fileExists ? 'hold' : 'exempt';
  if (!o.status.level) return 'hold';
  return 'check';
}
module.exports = { decide };
