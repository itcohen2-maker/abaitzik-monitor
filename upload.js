'use strict';
/*
  The big file upload service (11.10.2026). Runs as monitor-upload.service, user
  monitor, bound to 127.0.0.1 only; Caddy exposes /up/* of ilay.abaitzik.com.
  Protocol and rules: lib/upload-server.js. Staging: /var/lib/monitor-upload
  (systemd StateDirectory). Log: /var/log/monitor-upload.log.

  Only this instance's own tenant is served here. A customer's monitor runs as
  another user in another folder, so this process could not write its inbox;
  adding one means a second unit as that user, see setup/monitor-upload.service.

  Usage: node upload.js
*/
const fs = require('fs');
const path = require('path');
const inst = require('./lib/instance.js');
const { createUploadServer } = require('./lib/upload-server.js');

const PORT = Number(process.env.UPLOAD_PORT) || 8791;
const ROOT = process.env.UPLOAD_ROOT || '/var/lib/monitor-upload';

function origins() {
  const list = [];
  [inst.origin, inst.publicUrl].forEach((u) => {
    try { const x = new URL(u).origin; if (x && !list.includes(x)) list.push(x); } catch (e) {}
  });
  return list;
}

// The same code listen.js checks: ABAITZIK_OWNER_CODE, else data/owner-code.txt.
// Read again every ten seconds so a changed code takes effect without a restart.
let cached = null, cachedAt = 0;
function ownerCode() {
  if (Date.now() - cachedAt > 10000) {
    try {
      cached = process.env.ABAITZIK_OWNER_CODE
        || fs.readFileSync(path.join(inst.dataPath, 'owner-code.txt'), 'utf8').trim();
    } catch (e) {
      // 11.10: a customer has no personal code; setup/enable-upload.sh gives
      // each one an 8 digit upKey in its own keys.json, sealed in its page.
      try { cached = String(JSON.parse(fs.readFileSync(path.join(inst.dataPath, 'keys.json'), 'utf8')).upKey || '') || null; }
      catch (e2) { cached = null; }
    }
    cachedAt = Date.now();
  }
  return cached;
}

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (l) => console.log(ts() + '  ' + l);

if (require.main === module) {
  const tenants = {};
  tenants[inst.name] = { dataPath: inst.dataPath, origins: origins(), code: ownerCode };
  const up = createUploadServer({ root: ROOT, tenants, log });
  /*
    14.10: the PC queue for a customer's computer rides on this same service
    (lib/pc-api.js): /up/v1/<name>/pc/* is answered here, with the pcKey from
    keys.json, before the upload routes see the request. Without a pcKey the
    routes are 404 and nothing changes for an instance that has no computer.
  */
  const pc = require('./lib/pc-api.js').pcApi({ name: inst.name, dir: __dirname, dataPath: inst.dataPath, log });
  const uploads = up.server.listeners('request').slice();
  up.server.removeAllListeners('request');
  up.server.on('request', (req, res) => {
    pc.handle(req, res).then((done) => { if (!done) uploads.forEach((fn) => fn(req, res)); })
      .catch((e) => { log('pc error ' + (e && e.message)); if (!res.headersSent) { res.writeHead(500); res.end(); } });
  });
  up.server.listen(PORT, '127.0.0.1', () => log('listening on 127.0.0.1:' + PORT + ' for ' + inst.name + ', origins ' + origins().join(' ')));
  up.sweep();
  setInterval(() => { try { const r = up.sweep(); if (r.partial || r.finished) log('sweep ' + JSON.stringify(r)); } catch (e) { log('sweep failed: ' + e.message); } }, 3600 * 1000);
  const stop = () => { log('stopping'); up.server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
