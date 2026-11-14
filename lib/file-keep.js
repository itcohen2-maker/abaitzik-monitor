'use strict';
/*
  How long a customer's files are kept. 14.11.2026, approved by Itzik.

  Until now a customer's files were never deleted (build.js pruneOldFiles left every monitor but his own
  alone), while the upload panel told the customer "נשמר 7 ימים". Alon had voice notes from 11.10.
  Deleting everything after 7 days would have broken what the AI needs later (compare this month's
  invoice with last month's), so the rule goes by kind, not by age alone:

    kept until the customer deletes it: a file he marked 📌 (data/files-pins.json), the setup form
      (setup/), signed documents, stickers and music, carousels, and any file a screen names
      (sale, contacts, the 🎁 ready tile)
    lab reports (lab/): 30 days. They hold patient names, the month to month check reads the lines
      kept in data/lab/<lab>-<YYYYMM>.json and not the PDF, and the PDF is still in the doctor's mail.
      The PDF's sha256 is remembered in data/lab/known-shas.json, so the same report is never checked twice.
    voice notes, photos, screenshots, video: 7 days (a voice note's transcript stays in the chat)
    documents and anything else: 365 days
    data/inbox is a spool: a file that already has its copy in files-private (same name and size) and a
      leftover upload slice go after a day; anything else there follows the same kinds.

  Never touches the chat, notes, reports or the lab month files: those are data, not files.
  node -e "require('./lib/file-keep.js').prune('<data dir>', { dry: true })" lists what would go.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DAY = 864e5;
const MEDIA = /\.(m4a|mp3|ogg|oga|opus|wav|aac|amr|webm|jpe?g|png|gif|webp|heic|heif|bmp|mp4|mov|m4v|3gp)$/i;
const ALWAYS = /^(setup\/|stk\/|music\/|appt-|lead-|carousel-)/;
const SIGNED = /(^|\/)(nda-|agr-|agreement|signed|quote-)|\.signed\.pdf$|חתום|חתימה|הסכם/i;
const SLICE = /\.part\d+of\d+$/;
const LAB = /(^|\/)lab\//;

function walk(dir, base = '') {
  let out = [];
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of list) {
    if (e.name.startsWith('.')) continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out = out.concat(walk(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

function pins(dataPath) {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(dataPath, 'files-pins.json'), 'utf8'));
    return new Set(Array.isArray(a) ? a.map(String) : []);
  } catch (e) { return new Set(); }
}

// Every screen that names a file in its own data.
function named(dataPath) {
  let s = '';
  for (const d of ['sale/sale', 'contacts/contacts', 'ready']) {
    const dir = path.join(dataPath, d);
    let list = [];
    try { list = fs.readdirSync(dir); } catch (e) { continue; }
    for (const f of list) { try { s += fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) {} }
  }
  return s;
}

function context(dataPath) { return { pins: pins(dataPath), named: named(dataPath) }; }

// Days a file is kept; Infinity = until the customer deletes it.
function days(rel, ctx) {
  rel = String(rel);
  const base = rel.split('/').pop();
  if (ctx.pins.has(rel)) return Infinity;
  // a lab report goes after 30 days wherever it sits, the setup form's lab folder too (patient names)
  if (LAB.test(rel)) return 30;
  if (ALWAYS.test(rel) || SIGNED.test(rel)) return Infinity;
  if (ctx.named && (ctx.named.includes('"' + rel + '"') || ctx.named.includes('"' + base + '"'))) return Infinity;
  if (MEDIA.test(rel)) return 7;
  return 365;
}

// When the file goes, as an ISO date, or null when it is kept for good.
function expiry(rel, mtimeMs, ctx) {
  const d = days(rel, ctx);
  return d === Infinity ? null : new Date(mtimeMs + d * DAY).toISOString();
}

function labShasFile(dataPath) { return path.join(dataPath, 'lab', 'known-shas.json'); }
function rememberSha(dataPath, full) {
  const f = labShasFile(dataPath);
  let a = [];
  try { a = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  if (!Array.isArray(a)) a = [];
  let h;
  try { h = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'); } catch (e) { return false; }
  if (!a.includes(h)) a.push(h);
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', JSON.stringify(a.slice(-5000)));
    fs.renameSync(f + '.tmp', f);
    return true;
  } catch (e) { return false; }
}

function prune(dataPath, opt = {}) {
  const dry = !!opt.dry, now = opt.now || Date.now();
  const src = path.join(dataPath, 'files-private');
  const inbox = path.join(dataPath, 'inbox');
  const ctx = context(dataPath);
  const gone = [], kept = [];
  const drop = (full, label, why) => {
    if (dry) { gone.push(label + '  (' + why + ')'); return; }
    try { fs.unlinkSync(full); gone.push(label); } catch (e) {}
  };
  const copies = new Set();
  for (const rel of walk(src)) {
    const full = path.join(src, rel);
    let st; try { st = fs.statSync(full); } catch (e) { continue; }
    copies.add(rel.split('/').pop() + '|' + st.size);
    const d = days(rel, ctx);
    if (d === Infinity || now - st.mtimeMs < d * DAY) { kept.push(rel + '  (' + (d === Infinity ? 'לתמיד' : d + ' ימים') + ')'); continue; }
    // a lab report is remembered before it goes, or it would be checked again when it comes back
    if (LAB.test(rel) && !dry && !rememberSha(dataPath, full)) continue;
    drop(full, rel, d + ' ימים');
  }
  for (const rel of walk(inbox)) {
    const full = path.join(inbox, rel);
    let st; try { st = fs.statSync(full); } catch (e) { continue; }
    const age = now - st.mtimeMs;
    if (copies.has(rel.split('/').pop() + '|' + st.size) || SLICE.test(rel)) {
      if (age > DAY) drop(full, 'inbox/' + rel, 'עותק או שארית');
      else kept.push('inbox/' + rel + '  (עותק, יום)');
      continue;
    }
    const d = days(rel, ctx);
    if (d === Infinity || age < d * DAY) { kept.push('inbox/' + rel + '  (' + (d === Infinity ? 'לתמיד' : d + ' ימים') + ')'); continue; }
    drop(full, 'inbox/' + rel, d + ' ימים');
  }
  if (dry) return { gone, kept };
  if (gone.length) console.log('customer files removed by the keep rules: ' + gone.length);
  return { gone, kept };
}

module.exports = { days, expiry, context, prune, labShasFile, MEDIA, SIGNED, ALWAYS };
