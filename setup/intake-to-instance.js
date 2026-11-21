#!/usr/bin/env node
'use strict';
/*
  24.10.2026, stage 7: from the "שאלון אפיון" to an instance.json proposal.

    node setup/intake-to-instance.js <responses.csv> [row] [--out file]
    node setup/intake-to-instance.js <answers.json> [--out file]

  The CSV is the Google Form export (one response per line, header = question titles).
  row is 1 based over the responses; the default is the last one. The JSON is an object
  of question title to answer, the same shape. The mapping is in lib/intake-map.js.

  Output is JSON on stdout, or written to --out. Feed it to setup/new-tenant.sh with
  --from-intake. Nothing here touches a server, a customer or the network.
*/
const fs = require('fs');
const path = require('path');
const { mapIntake, answersFromCsv } = require('../lib/intake-map.js');

function usage(msg) {
  if (msg) process.stderr.write(msg + '\n');
  process.stderr.write('שימוש: node setup/intake-to-instance.js <responses.csv|answers.json> [row] [--out file]\n');
  process.exit(1);
}

function main(argv) {
  const args = argv.slice(2);
  let out = '';
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      out = args[++i] || '';
      if (!out) usage('--out בלי שם קובץ');
    } else pos.push(args[i]);
  }
  if (!pos.length || pos.length > 2) usage();
  const file = pos[0];
  const row = pos[1];
  if (row !== undefined && !/^\d+$/.test(row)) usage('השורה חייבת להיות מספר, למשל 3');

  const text = fs.readFileSync(file, 'utf8');
  let answers;
  const isJson = path.extname(file).toLowerCase() === '.json' || text.trim().startsWith('{');
  if (isJson) {
    answers = JSON.parse(text);
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) usage('קובץ התשובות חייב להיות אובייקט JSON');
  } else {
    const got = answersFromCsv(text, row);
    answers = got.answers;
    process.stderr.write('תשובה ' + got.row + ' מתוך ' + got.of + '\n');
  }

  const instance = mapIntake(answers);
  const json = JSON.stringify(instance, null, 1) + '\n';
  if (out) {
    fs.writeFileSync(out, json, 'utf8');
    process.stderr.write('נכתב: ' + out + ', הערות למפעיל: ' + instance.intakeNotes.length + '\n');
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) {
  try { main(process.argv); } catch (e) { process.stderr.write(e.message + '\n'); process.exit(1); }
}

module.exports = { main };
