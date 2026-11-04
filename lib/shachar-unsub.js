'use strict';
/*
  4.11.2026, Itzik: a mail that asks to leave Shachar's mailing list is handled automatically.
  Mail to shachar@abaitzik.com is forwarded by Forward Email into itcohen2@gmail.com, and every
  Shachar letter says "reply with הסר" or mail shachar@abaitzik.com with subject הסרה. This module
  decides which fetched messages are such requests and writes the sender into `unsub` of
  data/shachar/state.json, which lib/shachar.js sendLetter already honours. No reply is sent.
  tools/mail-unsub.py fetches (read only); mail-check.js calls scan() after each mail check.
*/
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const SHACHAR = 'shachar@abaitzik.com';
const ASK = /(הסר|להסיר|unsubscribe|\bremove\b)/i; // הסר also covers הסרה and הסרת
const QUOTE_CUT = /^\s*(on .{5,200}wrote:|בתאריך .{3,200}(כתב|כתבה)|-{2,}\s*(original message|הודעה מקורית)|_{5,}|from:.*@)/i;
const FOOTER = /(להסרה מרשימת התפוצה|או להשיב למייל הזה במילה הסר)/g;

// The reply quotes the letter, whose footer itself says הסר, so quoted text and the footer are cut first.
function stripQuoted(body) {
  const out = [];
  for (const line of String(body || '').split(/\r?\n/)) {
    if (QUOTE_CUT.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(FOOTER, ' ');
}

function senderAddress(from) {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(String(from || '')) || /([^\s<>"',;]+@[^\s<>"',;]+)/.exec(String(from || ''));
  return m ? m[1].toLowerCase() : null;
}

// msg: { from, to, subject, body }. True when it is addressed to Shachar (or a Re: of his letter) and asks for removal.
function isRemovalRequest(msg) {
  const from = senderAddress(msg.from);
  if (!from || from === SHACHAR) return false;
  const toShachar = String(msg.to || '').toLowerCase().includes(SHACHAR);
  const replyToLetter = /^\s*(re|השב|בהמשך)\s*:/i.test(msg.subject || '') && /שחר|shachar/i.test(msg.subject || '');
  if (!toShachar && !replyToLetter) return false;
  const text = (msg.subject || '').replace(FOOTER, ' ') + '\n' + stripQuoted(msg.body).slice(0, 1500);
  return ASK.test(text);
}

// Adds the sender of each request to `unsub`, once. Reads the raw state so no other field is lost.
// Returns { added: [email...], seen: [uid...] } and writes the state only when something was added.
function applyRemovals(dir, msgs, seen) {
  const file = path.join(dir, 'shachar', 'state.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { added: [], seen: [], error: 'no-state' }; }
  const unsub = Array.isArray(state.unsub) ? state.unsub.slice() : [];
  const added = [], done = [];
  for (const m of msgs) {
    if (seen.includes(m.uid)) continue;
    done.push(m.uid);
    if (!isRemovalRequest(m)) continue;
    const e = senderAddress(m.from);
    if (!unsub.includes(e)) { unsub.push(e); added.push(e); }
  }
  if (added.length) {
    state.unsub = unsub;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  return { added, seen: done };
}

// Called from mail-check.js. Each handled uid is remembered in data/status/shachar-unsub-seen.json.
function scan(root) {
  const seenFile = path.join(root, 'data/status/shachar-unsub-seen.json');
  let seen = [];
  try { seen = JSON.parse(fs.readFileSync(seenFile, 'utf8')); } catch (e) {}
  const out = execFileSync('/usr/bin/python3', ['-I', path.join(root, 'tools/mail-unsub.py'), '--days', '3'], { encoding: 'utf8', timeout: 180000 });
  const msgs = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const r = applyRemovals(path.join(root, 'data'), msgs, seen);
  if (r.error) return r;
  if (r.seen.length) fs.writeFileSync(seenFile, JSON.stringify(seen.concat(r.seen).slice(-2000)));
  for (const e of r.added) {
    spawnSync('/usr/bin/node', ['notify.js', '🌅 שחר: הוסר מרשימת התפוצה', `${e} ביקש הסרה ולא יקבל יותר מיילים משחר.`], { cwd: root, stdio: 'ignore', timeout: 60000 });
  }
  return r;
}

module.exports = { stripQuoted, senderAddress, isRemovalRequest, applyRemovals, scan };
