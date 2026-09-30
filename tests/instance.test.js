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
// A private file per test process, never the real instance.json.
const FILE = path.join(require('os').tmpdir(), 'abaitzik-instance-' + process.pid + '.json');
process.env.ABAITZIK_INSTANCE_FILE = FILE;

// The hard coded values, as they were before the loader existed.
const BEFORE = {
  name: 'abaitzik',
  owner: 'איציק',
  publicUrl: 'https://itcohen2-maker.github.io/abaitzik-monitor/',
  basePath: '/abaitzik-monitor/',
  origin: 'https://itcohen2-maker.github.io',
  mailbox: 'itcohen2@gmail.com',
  dataDir: 'data',
  taskPrefix: 'AbaItzik',
  screens: null,
  chromeProfile: 'Profile 4',
};

/*
  The topics are not in the code any more (30.9, they were rotated after
  sitting in this public repository). They come from data/keys.json only, so
  every test that is about topics points dataDir at a folder holding fake
  ones. A real topic must never be written into this file again.
*/
const FAKE = {
  ntfyIn: 'test-in-topic',
  ntfyLive: 'test-live-topic',
  ntfyOut: 'test-out-topic',
  mail: 'itcohen2@gmail.com',
};
function fakeData(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abaitzik-keys-'));
  fs.writeFileSync(path.join(dir, 'keys.json'), JSON.stringify(Object.assign({}, FAKE, extra || {})));
  return dir;
}

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
  // The topics come from data/keys.json, tested below with fake ones.
  assert.equal(typeof i.ntfy.in, 'string');
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
  assert.equal(i.name, BEFORE.name);
  assert.equal(i.dataDir, BEFORE.dataDir);
  assert.ok(i.notes.some(n => /could not be read/.test(n)));
});

test('one field given, everything else stays as it was', () => {
  const i = loadWith(JSON.stringify({ owner: 'אילי', dataDir: fakeData() }));
  assert.equal(i.owner, 'אילי');
  assert.equal(i.ntfy.out, FAKE.ntfyOut);
  assert.equal(i.mailbox, BEFORE.mailbox);
  assert.equal(i.isDefault, false);
});

test('an inbound topic without a live topic does not pulse onto his channel', () => {
  // Inheriting BEFORE.ntfyLive here would turn his own indicator green off
  // somebody else's heartbeat, and keep it green while his listener is down.
  // A data folder with no keys.json, so the instance file alone is tested.
  const i = loadWith(JSON.stringify({ ntfy: { in: 'ily-in-3f7c1a9e04b2d856' }, dataDir: os.tmpdir() }));
  assert.equal(i.ntfy.live, 'ily-in-3f7c1a9e04b2d856-live');
  // The outbound topic is a separate address and is not derived from anything,
  // and with no keys.json there is none rather than a guessable default.
  assert.equal(i.ntfy.out, '');
});

test('a field of the wrong type keeps the default and says so', () => {
  const i = loadWith(JSON.stringify({ ntfy: 'ily-in-3f7c1a9e04b2d856', dataDir: 7 }));
  assert.notEqual(i.ntfy.in, 'ily-in-3f7c1a9e04b2d856');
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
  // Both repositories are public and a topic is a password. keys.json is the
  // only place the real topics live.
  const i = loadWith(JSON.stringify({ dataDir: fakeData() }));
  assert.equal(i.ntfy.in, FAKE.ntfyIn);
  assert.equal(i.ntfy.live, FAKE.ntfyLive);
  assert.equal(i.ntfy.out, FAKE.ntfyOut);
  assert.equal(i.mailbox, BEFORE.mailbox);
  assert.deepEqual(i.inTopics(), [FAKE.ntfyIn]);
  assert.deepEqual(i.outTopics(), [FAKE.ntfyOut]);
});

test('the code carries no topic: without keys.json there is no channel, and it says so', () => {
  const m = require(MODULE);
  assert.deepEqual(m.DEFAULTS.ntfy, { in: '', live: '', out: '' });
  const i = loadWith(JSON.stringify({ dataDir: os.tmpdir() }));
  assert.equal(i.ntfy.in, '');
  assert.equal(i.ntfy.out, '');
  assert.deepEqual(i.inTopics(), []);
  assert.deepEqual(i.outTopics(), []);
  assert.ok(i.notes.some(n => /no topic in data\/keys\.json/.test(n)));
  delete require.cache[require.resolve(MODULE)];
});

test('loading with keys does not leak the topics into the defaults', () => {
  loadWith(JSON.stringify({ dataDir: fakeData() }));
  const i = loadWith(JSON.stringify({ dataDir: os.tmpdir() }));
  assert.equal(i.ntfy.in, '');
  assert.equal(i.ntfy.out, '');
});

test('keys.json live wins even when instance.json names only an inbound topic', () => {
  const i = loadWith(JSON.stringify({ ntfy: { in: 'ily-in-3f7c1a9e04b2d856' }, dataDir: fakeData() }));
  assert.equal(i.ntfy.in, FAKE.ntfyIn);
  assert.equal(i.ntfy.live, FAKE.ntfyLive);
});

test('rotation window: old and new topics both live until the deadline, then only the new', () => {
  const until = new Date(Date.now() + 3600000).toISOString();
  const i = loadWith(JSON.stringify({ dataDir: fakeData({
    ntfyInOld: 'test-in-old', ntfyInOldUntil: until,
    ntfyOutOld: 'test-out-old', ntfyOutOldUntil: until,
  }) }));
  // The new topic is always first: it is the one a sender must reach.
  assert.deepEqual(i.inTopics(), ['test-in-topic', 'test-in-old']);
  assert.deepEqual(i.outTopics(), ['test-out-topic', 'test-out-old']);
  const after = Date.parse(until) + 1;
  assert.deepEqual(i.inTopics(after), ['test-in-topic']);
  assert.deepEqual(i.outTopics(after), ['test-out-topic']);
});

test('rotation window: an expired, malformed or missing deadline keeps only the new topic', () => {
  const past = new Date(Date.now() - 1000).toISOString();
  const a = loadWith(JSON.stringify({ dataDir: fakeData({ ntfyInOld: 'test-in-old', ntfyInOldUntil: past }) }));
  assert.deepEqual(a.inTopics(), ['test-in-topic']);
  const b = loadWith(JSON.stringify({ dataDir: fakeData({ ntfyInOld: 'test-in-old', ntfyInOldUntil: 'soon' }) }));
  assert.deepEqual(b.inTopics(), ['test-in-topic']);
  const c = loadWith(JSON.stringify({ dataDir: fakeData({ ntfyOutOld: 'test-out-old' }) }));
  assert.deepEqual(c.outTopics(), ['test-out-topic']);
  // A comma would turn one subscription into several.
  const future = new Date(Date.now() + 3600000).toISOString();
  const d = loadWith(JSON.stringify({ dataDir: fakeData({ ntfyInOld: 'x,y', ntfyInOldUntil: future }) }));
  assert.deepEqual(d.inTopics(), ['test-in-topic']);
});
