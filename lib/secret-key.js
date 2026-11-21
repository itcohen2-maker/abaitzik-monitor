'use strict';
/*
  2nd review (c): the per-install keys of the day token and the renewal link. A key is 64 hex characters, or it is
  refused (an empty or partial key never signs anything). A missing key is created once: a temp file at 0600, then
  renamed into place, read back and checked, so a half-written key is never used.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HEX64 = /^[a-f0-9]{64}$/;

function loadKey(DATA, name) {
  const f = path.join(DATA, name);
  let raw = null;
  try { raw = fs.readFileSync(f, 'utf8').trim(); } catch (e) { if (e.code !== 'ENOENT') throw new Error('key unreadable: ' + name); }
  if (raw !== null) {
    if (!HEX64.test(raw)) throw new Error('key invalid: ' + name);
    return raw;
  }
  fs.mkdirSync(DATA, { recursive: true });
  const k = crypto.randomBytes(32).toString('hex');
  const tmp = f + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, k, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, f);
  const back = fs.readFileSync(f, 'utf8').trim();
  if (!HEX64.test(back)) throw new Error('key invalid after create: ' + name);
  return back;
}

module.exports = { loadKey, HEX64 };
