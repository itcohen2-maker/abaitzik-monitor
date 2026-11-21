'use strict';
/*
  19.11.2026, the end to end check of a new monitor: 🔌 חיבורים was empty ("0 מתוך 0") on a monitor opened with
  setup/new-tenant.sh. A self signup gets its personal connections page from signup-personalize.js; a monitor opened
  by hand never did. new-tenant.sh now runs this for every new monitor, and it can be run again safely.
  Same steps as signup-personalize.js connections(): a personal setup page from the clean template and a line in
  data/cal/sources.json with the monitor's folder, so cal-sync writes its data/conn/setup.json.
  Usage (root): node setup/tenant-connections.js <id> "<client name>"
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const REPO = path.join(__dirname, '..');
const DATA = path.join(REPO, 'data');
const TEMPLATE = '97353be7657c22ee625e';
const [id, name] = process.argv.slice(2);
if (!/^[a-z0-9_-]{1,32}$/.test(id || '')) { console.log('usage: tenant-connections.js <id> "<name>"'); process.exit(1); }
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const wr = (f, j) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(j, null, 1)); fs.renameSync(f + '.tmp', f); execFileSync('chown', ['monitor:monitor', f]); };
const sf = path.join(DATA, 'cal', 'sources.json');
const src = rd(sf, []);
if (Array.isArray(src) && src.some((x) => x && x.name === id && x.setup)) { console.log(id + ': already has a connections page'); process.exit(0); }
const def = rd(path.join(DATA, 'setup', TEMPLATE + '.def.json'), null);
if (!def) { console.log('no connections template ' + TEMPLATE); process.exit(1); }
const tok = crypto.randomBytes(10).toString('hex');
def.client = name || id;
wr(path.join(DATA, 'setup', tok + '.def.json'), def);
const list = Array.isArray(src) ? src.filter((x) => !(x && x.name === id)) : [];
list.push({ name: id, dir: '/home/' + id + '/' + id + '-monitor', setup: tok, tenant: true });
wr(sf, list);
console.log(id + ': connections page ' + tok);
