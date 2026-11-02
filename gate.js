/*
  The lock on the monitor.

  Itzik, 17.9: "move all the details to private storage." GitHub Pages will not
  serve a private repository on a free account, so the page cannot be made
  private where it stands. What it can be is unreadable: the data is encrypted
  before it is published, and the page asks for a code once per device and
  decrypts in the browser.

  The trade he chose, in his words, was that a login screen with a code by email
  is four screens between him and a message he wants to read now. This keeps the
  address, the shortcut on his home screen and the push links exactly as they
  are, and costs him the code once per phone (five Hebrew words since 30.9).

  What this does not defend against: somebody who has both the link and the
  code. It is a lock on a public door, not a private room. The passphrase lives
  in `gate-key.txt`, which is gitignored, and the salt is published on purpose,
  because a salt is not a secret and the browser needs it to derive the key.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const KEY_FILE = path.join(HERE, 'gate-key.txt');
const SALT_FILE = path.join(HERE, 'gate-salt.txt');
const PARAMS_FILE = path.join(HERE, 'gate-params.json');
// High enough to make guessing a six digit code off a stolen file slow, low
// enough that an old phone derives it in about a second. It runs once per
// device and the result is cached, so the cost is paid exactly once.
const LEGACY_ROUNDS = 210000;
/*
  30.9, the passphrase. A six digit code under any number of rounds is a
  million guesses, and the sealed files are public, so an audit found it could
  be brute forced offline. The fix is a passphrase of five Hebrew words, and with
  it the rounds go to 600000 (an iPhone derives that in well under a second,
  once per device).

  Its salt and rounds live in gate-params.json, next to the key and gitignored
  like it, and not in gate-salt.txt: that one is tracked, and every customer
  copy takes the tracked files from this repository every five minutes, so a
  new salt there would reach Ilay and lock his phone out of his own code. A
  copy with no gate-params.json keeps exactly what it had: gate-salt.txt,
  210000 rounds and the numeric keypad.
*/
const ROUNDS = 600000;

/*
  What he types and what the key file holds are brought to one form before
  either becomes a key. On an iPhone the same words can arrive as a different
  string: a double space, a space the keyboard added at the end, a direction
  mark, Hebrew in a decomposed form, or a final letter typed as a regular one.
  None of those may lock him out, so all of them are folded away here, and the
  page runs the very same steps (gnorm in build.js). Digits pass through
  untouched, so every six digit code derives exactly what it always did.
*/
function normalize(s) {
  return String(s == null ? '' : s)
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ךםןףץ]/g, (c) => 'כמנפצ'.charAt('ךםןףץ'.indexOf(c)));
}

/*
  Off for the tests, on everywhere else.

  The suite renders the page and reads his data back out of it, which is exactly
  what the gate removes, so every one of those checks would fail for the right
  reason and tell us nothing. The gate's own behaviour is tested separately, on
  this module and on the page's gate code, rather than by leaving the data in.
*/
function enabled() {
  if (process.env.MONITOR_NO_GATE) return false;
  return fs.existsSync(KEY_FILE);
}
function passphrase() { return normalize(fs.readFileSync(KEY_FILE, 'utf8')); }

function legacySalt() {
  if (!fs.existsSync(SALT_FILE)) {
    fs.writeFileSync(SALT_FILE, crypto.randomBytes(16).toString('base64'), 'utf8');
  }
  return Buffer.from(fs.readFileSync(SALT_FILE, 'utf8').trim(), 'base64');
}

/*
  The salt and rounds this copy seals with. A gate-params.json that is there
  but broken stops the build rather than falling back: falling back would
  publish under the old salt and rounds, and his phone would find a page that
  no longer matches the words he was given.
*/
function params() {
  if (!fs.existsSync(PARAMS_FILE)) return { salt: legacySalt(), rounds: LEGACY_ROUNDS, words: false };
  const p = JSON.parse(fs.readFileSync(PARAMS_FILE, 'utf8'));
  const s = Buffer.from(String(p.salt || ''), 'base64');
  const r = Number(p.rounds);
  if (s.length < 16) throw new Error('gate-params.json: salt must be at least 16 bytes');
  if (!Number.isInteger(r) || r < 100000 || r > 10000000) throw new Error('gate-params.json: rounds out of range');
  return { salt: s, rounds: r, words: true };
}
function salt() { return params().salt; }

let cached = null;
function key() {
  if (cached) return cached;
  const p = params();
  cached = crypto.pbkdf2Sync(passphrase(), p.salt, p.rounds, 32, 'sha256');
  return cached;
}
// What the page needs to derive the same key: public by design. `words` only
// switches the box to a text keyboard; a copy without it ships the same GATE
// object byte for byte as before.
function pageParams() {
  const p = params();
  const o = { salt: p.salt.toString('base64'), rounds: p.rounds };
  if (p.words) o.words = 1;
  return o;
}

/*
  One sealed blob, in the shape WebCrypto reads back.

  A fresh IV per call, never reused, because AES-GCM under a repeated IV leaks
  the plaintext difference between two builds, and two builds of this page differ
  by exactly the messages that were added since the last one.
*/
function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(Buffer.from(text, 'utf8')), c.final()]);
  return iv.toString('base64') + '.' + Buffer.concat([body, c.getAuthTag()]).toString('base64');
}

function open(blob) {
  const [ivB, bodyB] = String(blob).split('.');
  const iv = Buffer.from(ivB, 'base64');
  const all = Buffer.from(bodyB, 'base64');
  const tag = all.subarray(all.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]).toString('utf8');
}

/*
  Files, 27.9. Itzik's chat attachments sat in docs/files, readable by anyone
  with the address, a hospital appointment among them. They are sealed the same
  way as the data, as bytes: a 12 byte IV, then the ciphertext and its tag. The
  published name is a keyed hash of the real one, so the address says nothing.
*/
function sealBytes(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]);
}
function fileId(name) {
  return crypto.createHmac('sha256', key()).update('file:' + name).digest('hex').slice(0, 24);
}

module.exports = { enabled, seal, open, sealBytes, fileId, normalize, pageParams,
  NEW_ROUNDS: ROUNDS, LEGACY_ROUNDS,
  get rounds() { return params().rounds; },
  saltB64: () => salt().toString('base64') };
