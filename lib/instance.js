'use strict';
/*
  Which monitor this is.

  Until now there was one monitor and every one of its addresses was written
  into the code: Itzik's ntfy topics, his mailbox, his GitHub Pages URL, his
  data folder. Ilay is getting his own, and Itzik said plainly that he does not
  want to see Ilay's content and Ilay should not see his, so a shared instance
  was never on the table: gate.js derives one key for the whole payload, and
  anyone who can open the page opens all of it, including the medical
  appointments.

  So the addresses move here, into one file that every other file reads from,
  and `instance.json` at the root says which monitor this copy is.

  The iron rule of this module: **it never throws.** A missing file, a broken
  file, a missing field, all fall back to the value that is in the code today.
  An instance that fails to start because of its configuration is a monitor
  that does not catch his messages, and that is the one failure this whole
  system exists to prevent. Every default below is Itzik's current value, word
  for word, so deleting instance.json changes nothing at all.

  Plan: תוכנית מוניטור לאילי.md, sections 1 and 2.
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Fields where an explicit null means "none" and is kept as null.
const NULLABLE = new Set(['memoryDir', 'driveFolder']);

const DEFAULTS = {
  name: 'abaitzik',
  owner: 'איציק',
  publicUrl: 'https://itcohen2-maker.github.io/abaitzik-monitor/',
  basePath: '/abaitzik-monitor/',
  origin: 'https://itcohen2-maker.github.io',
  ntfy: {
    in: 'abaitzik-in-95e62e86c34f4853',
    live: 'abaitzik-in-95e62e86c34f4853-live',
    out: 'abaitzik-cf9044bdcfa8',
  },
  mailbox: ['itcohen2', 'gmail.com'].join('@'),
  dataDir: 'data',
  taskPrefix: 'AbaItzik',
  pageTitle: 'אבא איציק בבנייה עצמית',
  appTitle: 'המוניטור',
  // null means every screen. It has to stay null by default, because today
  // there is no filtering at all and the default must change nothing.
  screens: null,
  chromeProfile: 'Profile 4',
  /*
    The one machine allowed to listen and answer. Empty means any machine,
    which is what a copy with no instance.json has always done.

    25.9: the listener moved to the cloud server and the guard script on the
    PC was switched off, but the PC's scheduled task starts listen.js directly
    every five minutes, not through the guard. From 13:19 two listeners caught
    every message, both wrote receipts, both built and pushed the page, and
    the server's checkout was left mid rebase twice in an afternoon. The task
    cannot be disabled without an administrator, so the program itself checks
    where it is running and leaves quietly anywhere else.
  */
  serverHost: '',
  memoryDir: 'C:/Users/User/.claude/projects/C--Users-User/memory',
  driveFolder: '',
};

/*
  A deep merge of exactly two levels, which is all the shape above has, and a
  type check per field.

  The type check is the part that matters. A hand edited instance.json with
  `"ntfy": "abaitzik-in-..."` instead of an object would otherwise leave the
  listener with no topic to subscribe to and no error to show for it. A field
  of the wrong type is treated the same as a missing one: the default stands,
  and the reason is recorded on the returned object rather than thrown.
*/
function merge(base, over, notes, at) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!over || typeof over !== 'object' || Array.isArray(over)) return out;
  for (const key of Object.keys(base)) {
    if (!(key in over)) continue;
    const want = base[key], got = over[key];
    const where = at ? at + '.' + key : key;
    // A null default (screens) accepts anything but undefined, since its
    // whole point is that the shape is not fixed.
    if (want === null) { out[key] = got === undefined ? null : got; continue; }
    /*
      Null given for a field that has a default means "none", not "wrong".

      Ilay's instance says memoryDir: null, because his monitor must not pack
      Itzik's memory folder into its backups. The first version read that null
      as a type mismatch, kept the default, and his copy would have carried his
      father's memory files in every backup it made, with only a note in
      inst.notes to say so. The fields where null is a real answer are listed.
    */
    if (got === null && NULLABLE.has(key)) { out[key] = null; continue; }
    if (want !== null && typeof want === 'object' && !Array.isArray(want)) {
      // `"ntfy": "ily-in-..."` instead of the object it should be. Without
      // this the mismatch vanished into the recursion and left no note, so the
      // instance came up on Itzik's topics with nothing saying why.
      if (!got || typeof got !== 'object' || Array.isArray(got)) {
        notes.push(where + ': wrong type, keeping the default');
        continue;
      }
      out[key] = merge(want, got, notes, where);
      continue;
    }
    if (typeof got !== typeof want || (Array.isArray(want) !== Array.isArray(got))) {
      notes.push(where + ': wrong type, keeping the default');
      continue;
    }
    out[key] = got;
  }
  for (const key of Object.keys(over)) {
    if (!(key in base)) notes.push((at ? at + '.' : '') + key + ': unknown field, ignored');
  }
  return out;
}

function load() {
  const notes = [];
  let raw = null;
  /*
    ABAITZIK_INSTANCE_FILE points the loader at another file. The tests use it:
    they used to rewrite the real instance.json while other test files, run in
    parallel by node --test, were loading build.js, which then read a
    temporary data folder and failed. A test that edits shared state under a
    running suite is the same collision this repository keeps fixing in
    production, one level down.
  */
  const file = process.env.ABAITZIK_INSTANCE_FILE || path.join(ROOT, 'instance.json');
  try {
    if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    notes.push('instance.json could not be read: ' + e.message);
  }
  const inst = merge(DEFAULTS, raw, notes, '');
  /*
    The topics come from data/keys.json when it has them.

    instance.json is committed, and both repositories are public. An ntfy
    topic is a password: whoever knows it can read what reaches the phone and
    publish into the inbox. So the committed file may leave the ntfy block and
    the mailbox out, and the real values live in data/keys.json, which is
    ignored by git and already holds them for the page payload. A value in
    keys.json wins over one in instance.json, so an instance that still
    carries topics in the clear can be cleaned without a code change.
  */
  try {
    const kf = path.join(path.isAbsolute(inst.dataDir) ? inst.dataDir : path.join(ROOT, inst.dataDir), 'keys.json');
    const k = JSON.parse(fs.readFileSync(kf, 'utf8'));
    if (typeof k.ntfyIn === 'string' && k.ntfyIn) {
      inst.ntfy.in = k.ntfyIn;
      inst.ntfy.live = typeof k.ntfyLive === 'string' && k.ntfyLive ? k.ntfyLive : k.ntfyIn + '-live';
    }
    if (typeof k.ntfyOut === 'string' && k.ntfyOut) inst.ntfy.out = k.ntfyOut;
    if (typeof k.mail === 'string' && k.mail) inst.mailbox = k.mail;
  } catch (e) { /* no keys.json: the instance file and the defaults stand */ }
  /*
    The heartbeat topic follows the inbound one unless it is spelled out.

    Without this, a second instance that sets only `ntfy.in` inherits Itzik's
    `live` topic from the defaults, and both monitors pulse onto his channel.
    The page reads that channel to decide whether its listener is alive, so his
    indicator would go green off Ilay's heartbeat and stay green through his
    own listener being down. Silent, and exactly backwards.
  */
  const gaveIn = raw && raw.ntfy && typeof raw.ntfy.in === 'string';
  const gaveLive = raw && raw.ntfy && typeof raw.ntfy.live === 'string';
  if (gaveIn && !gaveLive) inst.ntfy.live = inst.ntfy.in + '-live';
  inst.isDefault = raw === null;
  inst.notes = notes;
  // The one derived value, because every caller that wants the data folder
  // wants it absolute and would otherwise join it against its own __dirname.
  inst.dataPath = path.isAbsolute(inst.dataDir)
    ? inst.dataDir : path.join(ROOT, inst.dataDir);
  return inst;
}

module.exports = load();
module.exports.DEFAULTS = DEFAULTS;
module.exports.load = load;
