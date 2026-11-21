'use strict';
/*
  21.11.2026, security. Itzik's private mail addresses and phone were written in the code, and the code is public.
  They live in data/private-ids.json now (data/ is not in git). A copy without that file, a customer's for one,
  knows none of them, and every caller treats an empty list as "no one is his".
  Tests point PRIVATE_IDS_FILE at tests/private-ids.fixture.json, which holds made up addresses.
*/
const fs = require('fs');
const path = require('path');

let cache = null;
function ids() {
  if (cache) return cache;
  const f = process.env.PRIVATE_IDS_FILE || path.join(__dirname, '..', 'data', 'private-ids.json');
  try { cache = JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch (e) { cache = {}; }
  return cache;
}
function list(key) {
  const v = ids()[key];
  return (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).toLowerCase());
}
module.exports = { ids, list };
