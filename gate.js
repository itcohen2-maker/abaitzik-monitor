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
  are, and costs him six digits once per phone.

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
// High enough to make guessing a six digit code off a stolen file slow, low
// enough that an old phone derives it in about a second. It runs once per
// device and the result is cached, so the cost is paid exactly once.
const ROUNDS = 210000;

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
function passphrase() { return fs.readFileSync(KEY_FILE, 'utf8').trim(); }

function salt() {
  if (!fs.existsSync(SALT_FILE)) {
    fs.writeFileSync(SALT_FILE, crypto.randomBytes(16).toString('base64'), 'utf8');
  }
  return Buffer.from(fs.readFileSync(SALT_FILE, 'utf8').trim(), 'base64');
}

let cached = null;
function key() {
  if (cached) return cached;
  cached = crypto.pbkdf2Sync(passphrase(), salt(), ROUNDS, 32, 'sha256');
  return cached;
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

module.exports = { enabled, seal, open, rounds: ROUNDS,
  saltB64: () => salt().toString('base64') };
