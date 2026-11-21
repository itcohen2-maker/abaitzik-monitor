#!/usr/bin/env node
'use strict';
/*
  Monthly dental lab report check (10.11.2026), phase 1 for Dr. Shulman.

  node lab-check.js <pdf...> [--data <tenant data dir>] [--dry]

  Reads each delivery note (pdftotext -layout), stores its parsed lines in
  <data>/lab/<lab>-<YYYYMM>.json and writes one report per note to
  <data>/reports/reports/<YYYYMMDD-HHMM>-lab.json, which the page shows on the
  "תשובות" screen. --dry prints the report and writes nothing.

  Patient data: <data> is gitignored everywhere and stays on the server.
  Nothing is sent to anyone from here.

  The incoming mail (11.11.2026): mail-sync.js calls lib/lab-mail.js for a monitor with labCheck:true in
  instance.json; it saves a mailed lab PDF and runs run([pdfPath], dataDir) as the monitor user. The report
  is the only output, plus a 📋 לטיפול item when duplicates are found.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const lc = require('./lib/lab-check.js');

function readPdf(file) {
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

function loadStored(dir, exceptLab, exceptNo) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) {}
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const d of Object.values(j.docs || {})) if (!(d.lab === exceptLab && d.no === exceptNo)) out.push(d);
    } catch (e) { /* a broken month file must not stop the check */ }
  }
  return out;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, file);
}

function run(pdfs, dataDir, opts) {
  const dry = !!(opts && opts.dry);
  const results = [];
  for (const pdf of pdfs) {
    const doc = lc.parseDoc(readPdf(pdf));
    const labDir = path.join(dataDir, 'lab');
    const dups = lc.findDuplicates(doc, loadStored(labDir, doc.lab, doc.no));
    const now = (opts && opts.now) || Date.now();
    const rep = lc.buildReport(doc, dups, now);
    if (!dry) {
      const month = (doc.date || '').slice(0, 7).replace('-', '') || 'unknown';
      const mf = path.join(labDir, doc.lab + '-' + month + '.json');
      let cur = { lab: doc.lab, month, docs: {} };
      try { cur = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) {}
      cur.docs[doc.no || path.basename(pdf)] = { ...doc, storedAt: rep.at };
      writeJson(mf, cur);
      const stamp = rep.at.slice(0, 16).replace(/[-T:]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
      writeJson(path.join(dataDir, 'reports', 'reports', stamp + '-lab.json'), rep);
    }
    results.push({ doc, dups, rep });
  }
  return results;
}

module.exports = { run, loadStored };

if (require.main === module) {
  const args = process.argv.slice(2);
  const pdfs = [];
  let data = null, dry = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data') data = args[++i];
    else if (args[i] === '--dry') dry = true;
    else pdfs.push(args[i]);
  }
  if (!pdfs.length) { console.error('שימוש: node lab-check.js <pdf...> [--data <תיקיית נתונים>] [--dry]'); process.exit(2); }
  if (!data) data = require('./lib/instance.js').dataPath;
  for (const r of run(pdfs, data, { dry })) console.log(r.rep.title + '\n\n' + r.rep.body + '\n');
}
