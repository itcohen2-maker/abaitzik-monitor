'use strict';
/*
  21.11.2026, Itzik chose "1": a private VIDEO named in a WhatsApp answer goes out as a direct link
  form.it-solution.co.il/p/<20 hex>.mp4 (no password), because WhatsApp opens links in its own browser, where the
  monitor's sealed page asks for the password again. Every other private file (invoices, documents) stays behind
  the password (#file=). The link name is an HMAC of the file's name, size and time with a key kept 0600, so the
  same file always gets the same link and nobody can guess another one. Caddy serves /p/*.(html|pdf|mp4|jpg).
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VIDEO = /\.(mp4)$/i; // Caddy's /p/ rule serves mp4 only among the video types
const BASE = 'https://form.it-solution.co.il/p/';

function key(DATA) {
  const f = path.join(DATA, 'status', 'video-link.key');
  try { const k = fs.readFileSync(f, 'utf8').trim(); if (k.length >= 32) return k; } catch (e) {}
  const k = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, k, { mode: 0o600 });
  return k;
}
// The direct link of one private video, or null (not a video, missing, or the folder can not be written).
function linkFor(DATA, name, dir) {
  if (!VIDEO.test(name) || name.indexOf('..') >= 0 || name.indexOf('/') >= 0) return null;
  const src = path.join(DATA, 'files-private', name);
  let st; try { st = fs.statSync(src); } catch (e) { return null; }
  if (!st.isFile()) return null;
  const id = crypto.createHmac('sha256', key(DATA)).update(name + '|' + st.size + '|' + Math.floor(st.mtimeMs)).digest('hex').slice(0, 20);
  const out = path.join(dir || '/srv/private-pages/p', id + '.mp4');
  try {
    if (!fs.existsSync(out)) { const tmp = out + '.tmp'; fs.copyFileSync(src, tmp); fs.chmodSync(tmp, 0o644); fs.renameSync(tmp, out); }
  } catch (e) { return null; }
  return BASE + id + '.mp4';
}
module.exports = { linkFor, VIDEO, BASE };
