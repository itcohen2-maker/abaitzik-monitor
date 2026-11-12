'use strict';
/*
  12.11.2026, Itzik: "כן, תבנה את החיבור המהיר". The root side of the quick WhatsApp connect. Run as root every minute by
  setup/wa-kapso-provision.sh (monitor-wa-kapso.timer): node lib/wa-quick-provision.js

  The bridge (wa-bridge.js) leaves data/wa-tenants-pending/<tenant>.json { op, tenant, phone, name, at } when a customer
  sent his code (op add) or wrote "ניתוק" (op remove). Per file:
    add:    the phone is not mapped to another tenant (else refused, never remapped), then the existing CLI
            `node lib/wa-tenants.js add <phone> <tenant> <name>` (root: it sets the ACLs) and `approved <phone>`,
            his data/conn/wa.json { phone, via: 'shared', at } (what the 🔌 row reads), his page rebuilt as him,
            one push to Itzik, and a confirmation to the customer through data/wa-outbox (the bridge sweep sends it,
            free text, inside the 24 hour window he just opened).
    remove: `node lib/wa-tenants.js remove <phone>` (only when it is mapped to this tenant), conn/wa.json deleted,
            page rebuilt, confirmation, push.
  Then the file moves to data/wa-tenants-done/. A failure keeps the file, counts tries, and pushes Itzik on the 10th.
  Idempotent. Secrets: none involved.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const WT = require('./wa-tenants.js');
const QK = require('./wa-quick.js');

const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const wr = (f, o, mode) => { fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { mode: mode || 0o600 }); fs.renameSync(f + '.tmp', f); };

function defaultExec(cmd, args, opts) { return execFileSync(cmd, args, Object.assign({ stdio: 'ignore' }, opts || {})); }

/*
  o.exec(cmd, args, opts) runs a program (tests replace it); o.root is the repo folder; o.log(line).
  Returns { done: [tenant...], failed: [tenant...] }.
*/
function run(DATA, o) {
  o = o || {};
  const exec = o.exec || defaultExec;
  const R = o.root || path.join(__dirname, '..');
  const log = o.log || ((s) => console.log(new Date().toISOString() + ' ' + s));
  const P = QK.pendDir(DATA), DONE = path.join(DATA, 'wa-tenants-done');
  const out = { done: [], failed: [] };
  backfill(DATA, exec, log);
  let files = [];
  try { files = fs.readdirSync(P).filter((f) => /^[a-z0-9][a-z0-9-]*\.json$/.test(f)); } catch (e) { return out; }
  const push = (title, text) => { try { exec('sudo', ['-u', 'monitor', 'node', path.join(R, 'notify.js'), title, text]); } catch (e) { log('notify failed'); } };
  const tell = (phone, text) => {
    const dir = path.join(DATA, 'wa-outbox');
    fs.mkdirSync(dir, { recursive: true });
    try { exec('chown', ['monitor:monitor', dir]); } catch (e) { /* tests, or not root */ }
    const f = QK.outbox(DATA, phone, text);
    try { exec('chown', ['monitor:monitor', f]); } catch (e) { /* same */ }
  };
  const finish = (f, rec, extra) => {
    fs.mkdirSync(DONE, { recursive: true });
    try { exec('chown', ['monitor:monitor', DONE]); } catch (e) { /* same */ }
    const to = path.join(DONE, rec.tenant + '-' + Date.now().toString(36) + '.json');
    wr(to, Object.assign({}, rec, { doneAt: new Date().toISOString() }, extra || {}));
    try { exec('chown', ['monitor:monitor', to]); } catch (e) { /* same */ }
    fs.unlinkSync(f);
  };
  const fail = (f, rec, why) => {
    rec.tries = (rec.tries || 0) + 1; rec.err = why;
    wr(f, rec);
    log(path.basename(f) + ': ' + why);
    if (rec.tries === 10) push('💬 חיבור וואטסאפ מהיר תקוע', 'החיבור של ' + rec.tenant + ' לא הושלם: ' + why);
    out.failed.push(rec.tenant);
  };

  files.forEach((fn) => {
    const f = path.join(P, fn);
    const rec = rd(f, null);
    if (!rec || !QK.TENANT_RE.test(String(rec.tenant || '')) || fn !== rec.tenant + '.json') { log(fn + ': bad pending file'); return; }
    const phone = WT.norm(rec.phone);
    const tr = rd(path.join(DATA, 'tenants', 'tenants', rec.tenant + '.json'), null);
    if (!phone || !tr || !tr.user || !/^[a-z][a-z0-9]{1,30}$/.test(String(tr.user))) return fail(f, rec, !phone ? 'bad phone' : 'no tenant record');
    const dir = tr.dir || WT.homeOf(tr.user);
    const title = tr.title || rec.tenant;
    const statusFile = path.join(dir, 'data', 'conn', 'wa.json');
    const rebuild = () => { try { exec('sudo', ['-H', '-u', tr.user, 'node', 'build.js'], { cwd: dir, timeout: 300000 }); } catch (e) { log(rec.tenant + ': page rebuild failed, it follows with the next build'); } };
    const mapped = WT.all(DATA)[phone];

    if (rec.op === 'remove') {
      if (mapped && mapped.tenant === rec.tenant) {
        try { exec('node', [path.join(R, 'lib', 'wa-tenants.js'), 'remove', phone], { cwd: R }); } catch (e) { return fail(f, rec, 'remove failed'); }
      }
      try { fs.unlinkSync(statusFile); } catch (e) { /* none */ }
      rebuild();
      tell(phone, '✓ ניתקתי את המספר הזה מהמוניטור. אפשר לחבר שוב בכל רגע מ 🔌 חיבורים.');
      push('💬 ' + title + ' התנתק מהוואטסאפ', 'המספר נותק מהמוניטור לבקשת הלקוח');
      finish(f, rec);
      log(rec.tenant + ': disconnected');
      out.done.push(rec.tenant);
      return;
    }

    if (mapped && mapped.tenant !== rec.tenant) {
      // never silently remapped: the customer is told, Itzik hears about it
      tell(phone, 'המספר הזה כבר מחובר למוניטור אחר, לכן לא חיברתי אותו. כדאי לפנות אל IT Solution.');
      push('💬 חיבור וואטסאפ נדחה', title + ' ניסה לחבר מספר שכבר מחובר למוניטור אחר (' + mapped.tenant + ')');
      finish(f, rec, { err: 'mapped to ' + mapped.tenant });
      log(rec.tenant + ': refused, number mapped to ' + mapped.tenant);
      return;
    }
    if (!fs.existsSync(dir)) return fail(f, rec, 'tenant folder missing');
    if (!mapped) {
      try { exec('node', [path.join(R, 'lib', 'wa-tenants.js'), 'add', phone, rec.tenant, String(rec.name || title)], { cwd: R }); } catch (e) { return fail(f, rec, 'wa-tenants add failed'); }
    }
    try { exec('node', [path.join(R, 'lib', 'wa-tenants.js'), 'approved', phone], { cwd: R }); } catch (e) { /* the shared number has no recipient list: harmless */ }
    try {
      fs.mkdirSync(path.dirname(statusFile), { recursive: true });
      wr(statusFile, { phone, via: 'shared', at: new Date().toISOString() }, 0o644);
      try { exec('chown', ['-R', tr.user + ':' + tr.user, path.dirname(statusFile)]); } catch (e) { /* tests, or not root */ }
    } catch (e) { return fail(f, rec, 'could not write the status file'); }
    rebuild();
    tell(phone, '✓ התחברת. אפשר לכתוב לי כאן כל בקשה, והתשובה תגיע לכאן. לניתוק כתבו: ניתוק');
    push('💬 ' + title + ' התחבר לוואטסאפ במוניטור', 'דרך החיבור המהיר, ' + QK.mask(phone));
    finish(f, rec);
    log(rec.tenant + ': connected ' + QK.mask(phone));
    out.done.push(rec.tenant);
  });
  return out;
}

/*
  12.11.2026: Dr. Shulman's number was mapped (data/wa-tenants.json, approved) on 11.11, before the quick connect
  existed, so his data/conn/wa.json was never written and his page asked him to connect a WhatsApp he already talks
  through. Any approved mapping whose customer has no status file gets one, and his page is rebuilt. Once per customer.
*/
function backfill(DATA, exec, log) {
  const map = WT.all(DATA);
  Object.keys(map).forEach((phone) => {
    const m = map[phone] || {};
    if (!m.approved || !QK.TENANT_RE.test(String(m.tenant || ''))) return;
    const tr = rd(path.join(DATA, 'tenants', 'tenants', m.tenant + '.json'), null);
    if (!tr || !tr.user || !/^[a-z][a-z0-9]{1,30}$/.test(String(tr.user))) return;
    const dir = tr.dir || WT.homeOf(tr.user);
    if (!fs.existsSync(path.join(dir, 'data'))) return;
    const own = rd(path.join(dir, 'data', 'wa.json'), {});
    const statusFile = path.join(dir, 'data', 'conn', 'wa.json');
    if ((own.phoneId && own.kapsoKey) || fs.existsSync(statusFile)) return;
    try {
      fs.mkdirSync(path.dirname(statusFile), { recursive: true });
      wr(statusFile, { phone: WT.norm(phone) || phone, via: 'shared', at: m.at || new Date().toISOString() }, 0o644);
      try { exec('chown', ['-R', tr.user + ':' + tr.user, path.dirname(statusFile)]); } catch (e) { /* tests, or not root */ }
      try { exec('sudo', ['-H', '-u', tr.user, 'node', 'build.js'], { cwd: dir, timeout: 300000 }); } catch (e) { /* the next build */ }
      log(m.tenant + ': already mapped, status file written');
    } catch (e) { log(m.tenant + ': backfill failed ' + e.message); }
  });
}

module.exports = { run, backfill };

if (require.main === module) run(path.join(__dirname, '..', 'data'));
