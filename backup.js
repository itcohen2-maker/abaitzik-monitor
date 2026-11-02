'use strict';
// Bundles the local copy of the artifact database together with Claude's
// memory files into one dated JSON, and keeps the last 14.
// The memory folder is the part that exists nowhere else, so it matters most.
// Usage: node backup.js
//
// It used to read only `data/backup/<collection>/`, a folder written by hand
// whenever somebody remembered to pull the database. On 13.9 that folder was
// three days stale and had never contained `pegasus` at all, so three nightly
// backups in a row had quietly saved a snapshot of the 10th. A backup that is
// silently old is worse than no backup, because it is trusted.
//
// So the live collections are read from `data/<c>/<c>/`, which is the layout
// build.js already reads and the one every write lands in. `data/backup/` is
// still merged underneath, so anything that only ever existed in the old hand
// made snapshot survives; the live copy wins on a conflict.
//
// What it still cannot do: a document Itzik wrote from his phone lives in the
// artifact database and reaches the disk only when Claude pulls it. Node has
// no way to reach that database, so `staleDays` in the manifest reports the age
// of the newest file in each collection. A collection that stops moving while
// the screen keeps filling means the pull is overdue, and the number is there
// to be looked at rather than assumed.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const LEGACY = path.join(DATA, 'backup');
const MEM = 'C:/Users/User/.claude/projects/C--Users-User/memory';
const OUT = path.join(ROOT, 'backups');

// Not collections: `backup` is the legacy snapshot folder handled separately,
// and `inbox` is a scratch spool for messages already recorded as chat.
const NOT_A_COLLECTION = new Set(['backup', 'inbox']);

function readColl(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { out[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { out[f.replace(/\.json$/, '')] = { unreadable: String(e.message) }; }
  }
  return out;
}

// Age in days of the newest document in a collection folder, or null when the
// folder is empty. Used for the staleness column, not for deciding anything.
function newestAgeDays(dir) {
  if (!fs.existsSync(dir)) return null;
  let newest = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const t = fs.statSync(path.join(dir, f)).mtimeMs;
    if (t > newest) newest = t;
  }
  if (!newest) return null;
  return Math.round(((Date.now() - newest) / 86400000) * 10) / 10;
}

function isDir(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

function build() {
  const bundle = {
    exportedAt: new Date().toISOString(),
    manifest: { collections: {}, memoryFiles: 0 },
    collections: {},
    memory: {},
    local: {},
  };

  // The hand made snapshot first, so the live copy below overwrites it.
  if (isDir(LEGACY)) {
    for (const c of fs.readdirSync(LEGACY)) {
      const dir = path.join(LEGACY, c);
      if (isDir(dir) && c !== 'memory') bundle.collections[c] = readColl(dir);
    }
  }

  // The live collections. `data/<c>/<c>/` is the shape read_db's out_dir
  // produces and the shape build.js reads; a `data/<c>` with no nested folder
  // of the same name is something else and is left alone.
  for (const c of fs.readdirSync(DATA)) {
    if (NOT_A_COLLECTION.has(c)) continue;
    const nested = path.join(DATA, c, c);
    if (!isDir(nested)) continue;
    const docs = readColl(nested);
    bundle.collections[c] = Object.assign({}, bundle.collections[c], docs);
    bundle.manifest.collections[c] = {
      documents: Object.keys(bundle.collections[c]).length,
      staleDays: newestAgeDays(nested),
    };
  }

  // Collections that exist only in the legacy folder still get a manifest row,
  // so a folder that stopped being written is visible rather than absent.
  for (const c of Object.keys(bundle.collections)) {
    if (bundle.manifest.collections[c]) continue;
    bundle.manifest.collections[c] = {
      documents: Object.keys(bundle.collections[c]).length,
      staleDays: newestAgeDays(path.join(LEGACY, c)),
      legacyOnly: true,
    };
  }

  if (fs.existsSync(MEM)) {
    for (const f of fs.readdirSync(MEM)) {
      if (f.endsWith('.md')) bundle.memory[f] = fs.readFileSync(path.join(MEM, f), 'utf8');
    }
  }
  bundle.manifest.memoryFiles = Object.keys(bundle.memory).length;

  // Two small files that are not collections and that a new machine cannot
  // rebuild: the monitor's own state, and the push channel. Both are private,
  // which this bundle already is - it carries commenters' full names and never
  // goes anywhere but Drive.
  for (const f of ['state.json', 'ntfy-topic.txt']) {
    const p = path.join(DATA, f);
    if (fs.existsSync(p)) bundle.local[f] = fs.readFileSync(p, 'utf8');
  }

  fs.mkdirSync(OUT, { recursive: true });
  const name = 'abaitzik-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(bundle, null, 1), 'utf8');

  // keep the last 14 files, drop the rest
  const olds = fs.readdirSync(OUT).filter(f => /^abaitzik-backup-.*\.json$/.test(f)).sort();
  while (olds.length > 14) fs.unlinkSync(path.join(OUT, olds.shift()));

  const docs = Object.values(bundle.collections).reduce((n, c) => n + Object.keys(c).length, 0);
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(name, kb + 'KB', 'collections:', Object.keys(bundle.collections).length,
    'documents:', docs, 'memory files:', bundle.manifest.memoryFiles);
  for (const [c, m] of Object.entries(bundle.manifest.collections)) {
    console.log('  ' + c.padEnd(10), String(m.documents).padStart(4),
      'newest ' + (m.staleDays == null ? 'none' : m.staleDays + 'd old') + (m.legacyOnly ? ' (legacy only)' : ''));
  }
}
build();
