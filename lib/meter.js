'use strict';
/*
  21.11.2026 security review: the bridge's own meter of the messages it accepts for a tenant.
  DATA/meter/<tenant>.json { month, n } is the count (the bridge's data, the customer's session can not write it).
  <spool>/<tenant>.meter.json is the same count for the customer's page (plan-io reads it; the bridge writes it).
  lib/plan.js status uses it for solo and pro: past CHAT_FREE free chat messages, the messages count as actions.
*/
const fs = require('fs');
const path = require('path');
const P = require('./plan.js');

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function check(tenant) { if (!/^[a-z0-9-]+$/.test(String(tenant || ''))) throw new Error('bad tenant'); }
function writeAtomic(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f); }

// One accepted message. Returns the month's count after it.
function bump(DATA, spool, tenant, now) {
  check(tenant);
  const month = P.monthOf(now == null ? Date.now() : now);
  const f = path.join(DATA, 'meter', tenant + '.json');
  const cur = readJson(f, null);
  const n = cur && cur.month === month ? (Number(cur.n) || 0) + 1 : 1;
  const o = { month, n };
  writeAtomic(f, o);
  if (spool) writeAtomic(path.join(spool, tenant + '.meter.json'), o);
  return n;
}
// The month's count for a tenant (0 for another month or nothing yet).
function read(DATA, tenant, now) {
  check(tenant);
  const month = P.monthOf(now == null ? Date.now() : now);
  const cur = readJson(path.join(DATA, 'meter', tenant + '.json'), null);
  return { month, n: cur && cur.month === month ? Number(cur.n) || 0 : 0 };
}

// 2nd review (7): a free tile message (lib/plan.js billable) is not counted by the meter.
function countable(text) { return P.billable({ text: String(text || '') }); }

module.exports = { bump, read, countable };
