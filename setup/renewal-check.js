#!/usr/bin/env node
'use strict';
/*
  21.11.2026: the daily renewal check (lib/renewal.js), run by setup/monitor-renewal.timer as the monitor user:
    node setup/renewal-check.js
  Reads every paid customer's plan file and SUMIT's recurring items (inactive included, read only), tells the
  customer and Itzik once about a failed charge, marks the plan stopped after 7 days, and sends the month's summary
  1 to 2 days before the renewal. Read only with SUMIT; it writes the plan files, the customers' chat and Itzik's 📋 line.
*/
const fs = require('fs');
const path = require('path');
const R = require('../lib/renewal.js');
const PIO = require('../lib/plan-io.js');
const S = require('../lib/sumit.js');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.WA_BRIDGE_DATA || process.env.MONITOR_DATA || path.join(ROOT, 'data'); // the same data dir as the bridge: the link secret lives there

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }

// Every customer's plan file (not the demos, not Itzik's own monitor).
function plans() {
  const out = {};
  let names = [];
  try { names = fs.readdirSync(PIO.SPOOL).filter((f) => /^[a-z0-9-]+\.plan\.json$/.test(f)); } catch (e) { return out; }
  names.map((f) => f.replace(/\.plan\.json$/, '')).filter((n) => n !== 'abaitzik' && !/^demo/.test(n)).forEach((n) => {
    const st = PIO.stateOf(n);
    if (st) out[n] = st;
  });
  return out;
}
// The SUMIT customer id of a tenant: the last paid record of its first payment (lib/wa-bridge payDone writes data/pay/<pid>.json).
function customerIdOf(tenant) {
  let id = null;
  let names = [];
  try { names = fs.readdirSync(path.join(DATA, 'pay')).filter((f) => /^\d+\.json$/.test(f)); } catch (e) { return null; }
  // 21.11.2026 security review: numeric order (10 after 9), the last paid record of this tenant wins.
  names.sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach((f) => {
    const r = readJson(path.join(DATA, 'pay', f), null);
    if (r && r.tenant === tenant && r.customerId) id = r.customerId;
  });
  return id;
}
function tenantDir(tenant) {
  const t = readJson(path.join(DATA, 'tenants', 'tenants', tenant + '.json'), {});
  return t.dir || ('/home/' + tenant + '/' + tenant + '-monitor');
}
// A chat record from claude, with waPush so the WhatsApp bridge sends it to his phone (lib/meet-push.js does the same).
function tellChat(dir, text) {
  const cd = path.join(dir, 'data', 'chat', 'chat');
  fs.mkdirSync(cd, { recursive: true });
  const at = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-' + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds());
  let name = stamp + '-claude-renewal.json';
  for (let i = 2; fs.existsSync(path.join(cd, name)); i++) name = stamp + '-claude-renewal-' + i + '.json';
  fs.writeFileSync(path.join(cd, name), JSON.stringify({ at: at.toISOString(), from: 'claude', text, status: 'done', waPush: true, id: 'rn-' + at.getTime().toString(36) }, null, 1), { mode: 0o664 });
}
function tellItzik(tenant, text, key) {
  try { require('../lib/handle.js').complete({ key, kind: 'lead', who: tenant, title: text, link: 'biz' }); } catch (e) { console.error('handle: ' + e.message); }
}

async function main() {
  const report = await R.runOnce({
    DATA, now: Date.now(), plans: plans(), customerIdOf,
    listRecurring: (cid) => S.listRecurring(cid, undefined, true),
    tenantDir, tellChat, tellItzik,
    writePlan: (t, st) => PIO.write(t, st),
    readPlan: (t) => PIO.stateOf(t),
    // 21.11.2026: the renewal pay link for the chat and WhatsApp (lib/renew-link.js, 72 hours).
    payUrl: (t) => require('../lib/renew-link.js').url(DATA, t),
  });
  console.log(JSON.stringify(report));
}
if (require.main === module) main().catch((e) => { console.error('renewal: ' + e.message); process.exit(1); });

module.exports = { plans, customerIdOf, tenantDir, tellChat };
