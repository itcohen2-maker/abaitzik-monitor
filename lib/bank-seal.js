'use strict';
/*
  14.11.2026: bank files at rest are sealed. Itzik asked whether the bank path is encrypted
  "at the best level"; the line was (TLS 1.3), the file on the server was not: data/bank/bank/*.json
  held the balance and every payee as plain text, readable from any copy of the data folder.

  Now each file is { "sealed": "<iv>.<AES-256-GCM body+tag>" } under the monitor's own key
  (gate.js, the key that already seals the page and the messages). It stays valid JSON, so a
  generic reader skips it instead of crashing, and open() gives back the real document.
  Without a gate key (tests, a monitor without the lock) the file is written plain, as before.
  Honest limit: the key lives on the same server, so this protects a copied or leaked data
  folder or backup, not a full takeover of the server.
*/
const fs = require('fs');
const gate = require('../gate.js');

function seal(doc) {
  const text = JSON.stringify(doc);
  if (!gate.enabled()) return JSON.stringify(doc, null, 1);
  return JSON.stringify({ sealed: gate.seal(text), v: 1 });
}

// A parsed file in, the real document out (a plain old file passes through); null when it does not open.
function open(parsed) {
  if (!parsed || typeof parsed !== 'object' || typeof parsed.sealed !== 'string') return parsed;
  try { return JSON.parse(gate.open(parsed.sealed)); } catch (e) { return null; }
}

function write(file, doc) {
  fs.writeFileSync(file, seal(doc), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch (e) {}
}

function read(file) {
  try { return open(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { return null; }
}

module.exports = { seal, open, write, read };
