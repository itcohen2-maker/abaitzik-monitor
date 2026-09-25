'use strict';
/*
  Every fix reaches every monitor.

  Itzik, 25.9: "התיקונים תמיד צריכים להיות גם במוניטור של איליי אם יש כשל".
  A fix that lands in his copy and not in Ilay's is a bug Ilay still has, and
  Itzik would only find out when his son hits it. So this is not something to
  remember to do; it runs every five minutes on the server.

  For each tenant in data/tenants/tenants it fetches this repository's main,
  and if it moved since the last sync, copies every tracked file into the
  tenant's checkout except the three things that are the tenant's own:
  docs/ (his built page, which must never receive Itzik's files), instance.json
  (who he is) and nothing under data/, which is untracked anyway. Then it
  rebuilds the tenant's page and makes it readable to the web server.

  It records the synced commit per tenant, so a quiet five minutes costs one
  git fetch and nothing else.

  Usage: node tenants-sync.js [--force]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const DIR = path.join(inst.dataPath, 'tenants', 'tenants');
const FORCE = process.argv.includes('--force');

function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }

function sync(t) {
  const cwd = t.dir;
  try { git(cwd, ['remote', 'get-url', 'code']); }
  catch (e) { git(cwd, ['remote', 'add', 'code', git(__dirname, ['remote', 'get-url', 'origin'])]); }
  git(cwd, ['fetch', '-q', 'code']);
  const head = git(cwd, ['rev-parse', 'code/main']);
  if (!FORCE && t.syncedTo === head) return { changed: false, head };
  // Everything tracked upstream, minus what is the tenant's own.
  git(cwd, ['checkout', 'code/main', '--', '.', ':(exclude)docs', ':(exclude)instance.json']);
  execFileSync('node', ['build.js'], { cwd, stdio: 'ignore', timeout: 180000 });
  try { execFileSync('chmod', ['-R', 'o+rX', path.join(cwd, 'docs')]); } catch (e) {}
  // The tenant's own history records what it runs; nothing is pushed.
  try {
    git(cwd, ['add', '-A', '.']);
    git(cwd, ['commit', '-q', '-m', 'sync code ' + head.slice(0, 8)]);
  } catch (e) { /* nothing to commit */ }
  return { changed: true, head };
}

function main() {
  if (!fs.existsSync(DIR)) return;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
    const file = path.join(DIR, f);
    const t = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!t.dir) continue;
    try {
      const r = sync(t);
      if (r.changed) {
        t.syncedTo = r.head; t.syncedAt = new Date().toISOString(); delete t.syncError;
        console.log(new Date().toISOString().slice(11, 19) + '  ' + t.id + ' synced to ' + r.head.slice(0, 8));
      }
    } catch (e) {
      t.syncError = String(e.message).slice(0, 200);
      console.log(new Date().toISOString().slice(11, 19) + '  ' + t.id + ' SYNC FAILED: ' + t.syncError);
    }
    // Re-read before writing: the health check writes this file every minute.
    const now = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const k of ['syncedTo', 'syncedAt', 'syncError']) {
      if (k in t) now[k] = t[k]; else delete now[k];
    }
    fs.writeFileSync(file, JSON.stringify(now, null, 1));
  }
}

if (require.main === module) main();
