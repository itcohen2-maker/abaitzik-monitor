'use strict';
/*
  11.11.2026, Itzik: "תבנה את הכפילויות אצל ד״ר שולמן". The lab duplicate check (lab-check.js) ran only on
  files uploaded in the setup form. Now it also runs on the mail: the doctor forwards the lab's monthly
  report (a PDF) to his Gmail, and within 15 minutes the report is on his "תשובות" screen.

  For a monitor whose instance.json has "labCheck": true, called by mail-sync.js after the mail sort:
    1. Gmail search: a PDF attachment in the last 14 days, any folder (a mail he forwarded to himself counts).
    2. A message is handled once (state in <monitor>/data/lab/mail-state.json).
    3. Each PDF is downloaded (attachments.get, gmail.readonly) into <monitor>/data/files-private/lab/,
       mode 600, owned by the monitor's user. Patient data: it stays there, never in git, never sent anywhere.
    4. It is a lab report when the sender or subject names a lab, or lib/lab-check.js detectLab knows the text.
       Anything else is deleted at once and only its message id is kept, so it is not downloaded again.
    5. The same file (sha256) is never checked twice, also against what came through the setup form.
    6. lab-check.js runs as the monitor's own user, inside its own copy of the code: the report lands on
       "תשובות" and the month file in data/lab as today.
    7. Duplicates found: one "📋 לטיפול" item "נמצאו N כפילויות בדוח <lab>" (lib/handle.js). No patient names
       in it: the names are only inside the report.

  node lib/lab-mail.js --dry --only pablo   (through mail-sync.js: node mail-sync.js --lab-only [--dry] [--only pablo])
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
const LAB_HINT = /מעבד|קריאטיב|ניו דנט|סמייל טק|תעודת משלוח|\blab\b|dental ?lab|creative team/i;
const MAX_MSG = 15;

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const head = (m, n) => { const h = ((m.payload && m.payload.headers) || []).find((x) => x.name.toLowerCase() === n); return h ? h.value : ''; };
const b64buf = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function pdfParts(p) {
  const out = [];
  (function walk(x) {
    if (!x) return;
    const name = String(x.filename || '');
    if ((/\.pdf$/i.test(name) || x.mimeType === 'application/pdf') && x.body && (x.body.attachmentId || x.body.data)) out.push(x);
    (x.parts || []).forEach(walk);
  })(p);
  return out;
}

function pdfText(file) {
  try { return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 60000 }); } catch (e) { return ''; }
}

function knownShas(dir) {
  const set = new Set();
  let names = []; try { names = fs.readdirSync(dir); } catch (e) {}
  for (const n of names) { try { set.add(sha(fs.readFileSync(path.join(dir, n)))); } catch (e) {} }
  return set;
}

// Runs the check as the monitor's user in its own code copy; returns [{n, lab, no, lines}].
function checkAs(uid, monDir, pdf) {
  const js = 'const r=require("./lab-check.js").run([process.argv[1]],"data");'
    + 'console.log(JSON.stringify(r.map(x=>({n:x.dups.length,lab:x.doc.labName,no:x.doc.no||"",lines:x.doc.lines.length}))))';
  const args = ['-u', '#' + uid, '-H', process.execPath, '-e', js, pdf];
  const me = process.getuid ? process.getuid() : -1;
  const out = me === uid ? execFileSync(process.execPath, ['-e', js, pdf], { cwd: monDir, encoding: 'utf8', timeout: 300000 })
    : execFileSync('sudo', args, { cwd: monDir, encoding: 'utf8', timeout: 300000 });
  const line = String(out).trim().split('\n').pop();
  return JSON.parse(line);
}

function handleAs(uid, monDir, item) {
  const js = 'const h=require("./lib/handle.js");console.log(JSON.stringify(h.add(require("path").resolve("data"),JSON.parse(process.argv[1])).created))';
  const me = process.getuid ? process.getuid() : -1;
  const out = me === uid ? execFileSync(process.execPath, ['-e', js, JSON.stringify(item)], { cwd: monDir, encoding: 'utf8', timeout: 60000 })
    : execFileSync('sudo', ['-u', '#' + uid, '-H', process.execPath, '-e', js, JSON.stringify(item)], { cwd: monDir, encoding: 'utf8', timeout: 60000 });
  return String(out).trim() === 'true';
}

// api(access, url) -> json (mail-sync's helper). Returns { checked, dups, changed }.
async function sweep(src, access, api, opts) {
  opts = opts || {};
  const say = opts.say || console.log;
  const dry = !!opts.dry;
  const data = path.join(src.dir, 'data');
  const labDir = path.join(data, 'lab');
  const keepDir = path.join(data, 'files-private', 'lab');
  const stateF = path.join(labDir, 'mail-state.json');
  const st = fs.statSync(src.dir);
  const uid = st.uid, gid = st.gid;
  const state = readJson(stateF, { seen: [] });
  const seen = new Set(state.seen);
  const q = 'has:attachment filename:pdf newer_than:14d';
  const list = await api(access, GM + '/messages?' + new URLSearchParams({ q, maxResults: '40' }));
  const fresh = (list.messages || []).filter((x) => !seen.has(x.id)).reverse().slice(0, MAX_MSG);
  const res = { checked: 0, dups: 0, changed: false };
  if (!fresh.length) { say(src.name + ': מעבדה: אין מייל חדש עם PDF'); return res; }
  const known = knownShas(keepDir);
  if (!dry) { fs.mkdirSync(keepDir, { recursive: true, mode: 0o750 }); fs.chownSync(keepDir, uid, gid); }
  for (const x of fresh) {
    let ok = true;
    try {
      const m = await api(access, GM + '/messages/' + x.id + '?format=full');
      const hint = LAB_HINT.test(head(m, 'from') + ' ' + head(m, 'subject'));
      for (const p of pdfParts(m.payload)) {
        const body = p.body.data ? { data: p.body.data }
          : await api(access, GM + '/messages/' + x.id + '/attachments/' + p.body.attachmentId);
        const buf = b64buf(body.data);
        const h = sha(buf);
        if (known.has(h)) { say(src.name + ': מעבדה: הקובץ כבר נבדק'); continue; }
        const safe = String(p.filename || 'report.pdf').replace(/[^\w.֐-׿-]+/g, '_').slice(-80);
        const file = path.join(dry ? require('os').tmpdir() : keepDir, x.id + '-' + safe.replace(/(\.pdf)?$/i, '.pdf'));
        fs.writeFileSync(file, buf, { mode: 0o600 });
        let isLab = hint;
        if (!isLab) { try { isLab = require('./lab-check.js').detectLab(pdfText(file)) !== 'unknown'; } catch (e) { isLab = false; } }
        if (!isLab) { fs.unlinkSync(file); continue; }
        known.add(h);
        if (dry) { say(src.name + ': מעבדה (בדיקה יבשה): נמצא דוח מעבדה, לא נבדק ולא נשמר'); fs.unlinkSync(file); continue; }
        fs.chownSync(file, uid, gid);
        const out = checkAs(uid, src.dir, file);
        for (const r of out) {
          res.checked++; res.changed = true; res.dups += r.n;
          say(src.name + ': מעבדה: ' + r.lab + ' תעודה ' + r.no + ', ' + r.lines + ' שורות, ' + r.n + ' כפילויות');
          if (r.n > 0) {
            const made = handleAs(uid, src.dir, { key: 'lab-dup-' + x.id + '-' + r.no, kind: 'other', who: r.lab,
              title: 'נמצאו ' + r.n + ' כפילויות בדוח ' + r.lab + (r.no ? ', תעודה ' + r.no : ''), link: 'answers' });
            if (made) say(src.name + ': מעבדה: נפתח פריט ב לטיפול');
          }
        }
      }
    } catch (e) { ok = false; say(src.name + ': מעבדה: מייל ' + x.id + ' ' + String(e.message).split('\n')[0].slice(0, 120)); }
    if (ok) seen.add(x.id); // a failed message is tried again in the next round
  }
  if (!dry) {
    fs.mkdirSync(labDir, { recursive: true });
    fs.writeFileSync(stateF, JSON.stringify({ at: new Date().toISOString(), seen: Array.from(seen).slice(-500) }));
    fs.chownSync(stateF, uid, gid);
  }
  return res;
}

module.exports = { sweep, pdfParts, LAB_HINT };
