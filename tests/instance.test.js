'use strict';
/*
  The configuration must not be able to change Itzik's monitor.

  This is the question he asked before any of this was built: if we start
  putting his addresses in a file, what happens to him. The answer has to be
  nothing, and that is what this file pins down. The values below are copied
  from the code as it stood before lib/instance.js existed, and they are
  written out as literals on purpose: anyone who edits a default has to come
  here and change it deliberately, with this file explaining what breaks.

  What breaks, concretely: the ntfy topic is the only way his voice memos reach
  a machine, and the mailbox is the only way a report reaches him. A typo in
  either is silence, and silence looks exactly like a working monitor.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MODULE = path.join(__dirname, '..', 'lib', 'instance.js');
const FILE = path.join(__dirname, '..', 'instance.json');

// The hard coded values, as they were before the loader existed.
const BEFORE = {
  name: 'abaitzik',
  owner: 'איציק',
  publicUrl: 'https://itcohen2-maker.github.io/abaitzik-monitor/',
  basePath: '/abaitzik-monitor/',
  origin: 'https://itcohen2-maker.github.io',
  ntfyIn: 'abaitzik-in-95e62e86c34f4853',
  ntfyLive: 'abaitzik-in-95e62e86c34f4853-live',
  ntfyOut: 'abaitzik-cf9044bdcfa8',
  mailbox: 'itcohen2@gmail.com',
  dataDir: 'data',
  taskPrefix: 'AbaItzik',
  screens: null,
  chromeProfile: 'Profile 4',
};

// Each case loads the module fresh against a temporary root, because the
// loader reads the file once at require time on purpose: a monitor that
// re-read its own configuration mid run could change topics under itself.
function loadWith(contents) {
  const saved = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
  try {
    if (contents === null) { if (saved) fs.unlinkSync(FILE); }
    else fs.writeFileSync(FILE, contents);
    delete require.cache[require.resolve(MODULE)];
    return require(MODULE).load();
  } finally {
    if (saved !== null) fs.writeFileSync(FILE, saved);
    else if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
    delete require.cache[require.resolve(MODULE)];
  }
}

test('with no instance.json at all, every value is the one that was in the code', () => {
  const i = loadWith(null);
  assert.equal(i.name, BEFORE.name);
  assert.equal(i.owner, BEFORE.owner);
  assert.equal(i.publicUrl, BEFORE.publicUrl);
  assert.equal(i.basePath, BEFORE.basePath);
  assert.equal(i.origin, BEFORE.origin);
  assert.equal(i.ntfy.in, BEFORE.ntfyIn);
  assert.equal(i.ntfy.live, BEFORE.ntfyLive);
  assert.equal(i.ntfy.out, BEFORE.ntfyOut);
  assert.equal(i.mailbox, BEFORE.mailbox);
  assert.equal(i.dataDir, BEFORE.dataDir);
  assert.equal(i.taskPrefix, BEFORE.taskPrefix);
  assert.equal(i.screens, BEFORE.screens);
  assert.equal(i.chromeProfile, BEFORE.chromeProfile);
  assert.equal(i.isDefault, true);
});

test('a broken instance.json falls back rather than throwing', () => {
  // A half written file is what a crash during an edit leaves behind. The
  // monitor has to come up anyway; a listener that will not start is the one
  // failure this system exists to prevent.
  const i = loadWith('{ "name": "ily", ');
  assert.equal(i.ntfy.in, BEFORE.ntfyIn);
  assert.equal(i.mailbox, BEFORE.mailbox);
  assert.ok(i.notes.some(n => /could not be read/.test(n)));
});

test('one field given, everything else stays as it was', () => {
  const i = loadWith(JSON.stringify({ owner: 'אילי' }));
  assert.equal(i.owner, 'אילי');
  assert.equal(i.ntfy.out, BEFORE.ntfyOut);
  assert.equal(i.mailbox, BEFORE.mailbox);
  assert.equal(i.isDefault, false);
});

test('an inbound topic without a live topic does not pulse onto his channel', () => {
  // Inheriting BEFORE.ntfyLive here would turn his own indicator green off
  // somebody else's heartbeat, and keep it green while his listener is down.
  // A data folder with no keys.json, so the instance file alone is tested.
  const i = loadWith(JSON.stringify({ ntfy: { in: 'ily-in-3f7c1a9e04b2d856' }, dataDir: os.tmpdir() }));
  assert.equal(i.ntfy.live, 'ily-in-3f7c1a9e04b2d856-live');
  assert.notEqual(i.ntfy.live, BEFORE.ntfyLive);
  // The outbound topic is a separate address and is not derived from anything.
  assert.equal(i.ntfy.out, BEFORE.ntfyOut);
});

test('a field of the wrong type keeps the default and says so', () => {
  const i = loadWith(JSON.stringify({ ntfy: 'ily-in-3f7c1a9e04b2d856', dataDir: 7 }));
  assert.equal(i.ntfy.in, BEFORE.ntfyIn);
  assert.equal(i.dataDir, BEFORE.dataDir);
  assert.ok(i.notes.length >= 2);
});

test('the data folder is handed over absolute, so no caller has to guess', () => {
  const i = loadWith(null);
  assert.ok(path.isAbsolute(i.dataPath));
  assert.equal(path.basename(i.dataPath), 'data');
  const abs = path.join(os.tmpdir(), 'ily-data');
  assert.equal(loadWith(JSON.stringify({ dataDir: abs })).dataPath, abs);
});

test('memoryDir null means no memory folder, not the default one', () => {
  // Ilay's backups must never pack his father's memory files.
  const i = loadWith(JSON.stringify({ memoryDir: null }));
  assert.equal(i.memoryDir, null);
  assert.ok(!i.notes.some(n => /memoryDir/.test(n)));
});

test('data/keys.json supplies the topics, so the committed file can leave them out', () => {
  // Both repositories are public and a topic is a password. Itzik's keys.json
  // holds his real topics; with instance.json absent the loader must still
  // come up on them, and they must equal the literals the code used to carry.
  const i = loadWith(null);
  assert.equal(i.ntfy.in, BEFORE.ntfyIn);
  assert.equal(i.ntfy.out, BEFORE.ntfyOut);
  assert.equal(i.mailbox, BEFORE.mailbox);
});
