'use strict';
// Bundles the local copy of the artifact database together with Claude's
// memory files into one dated JSON, and keeps the last 14.
// The memory folder is the part that exists nowhere else, so it matters most.
// Usage: node backup.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data', 'backup');
const MEM = 'C:/Users/User/.claude/projects/C--Users-User/memory';
const OUT = path.join(ROOT, 'backups');

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

function build() {
  const bundle = { exportedAt: new Date().toISOString(), collections: {}, memory: {} };
  if (fs.existsSync(DATA)) {
    for (const c of fs.readdirSync(DATA)) {
      const dir = path.join(DATA, c);
      if (fs.statSync(dir).isDirectory() && c !== 'memory') bundle.collections[c] = readColl(dir);
    }
  }
  if (fs.existsSync(MEM)) {
    for (const f of fs.readdirSync(MEM)) {
      if (f.endsWith('.md')) bundle.memory[f] = fs.readFileSync(path.join(MEM, f), 'utf8');
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const name = 'abaitzik-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(bundle, null, 1), 'utf8');

  // keep the last 14 files, drop the rest
  const olds = fs.readdirSync(OUT).filter(f => /^abaitzik-backup-.*\.json$/.test(f)).sort();
  while (olds.length > 14) fs.unlinkSync(path.join(OUT, olds.shift()));

  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(name, kb + 'KB', 'collections:', Object.keys(bundle.collections).length,
    'memory files:', Object.keys(bundle.memory).length);
}
build();
