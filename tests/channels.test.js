'use strict';
/*
  The addresses that reach Itzik, pinned.

  With instance.json absent, the outbound ntfy topic, the mailbox and the
  inbound topic the listener subscribes to must be the literal values that
  were in the code before lib/instance.js existed. A wrong value here is not
  an error anyone sees: it is his phone going quiet while every log says
  "sent", and his voice notes landing on a topic nobody reads.

  The literals are written out on purpose. Changing a default means coming
  here and changing it knowingly.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// A private file per test process, never the real instance.json.
const FILE = path.join(require('os').tmpdir(), 'abaitzik-instance-' + process.pid + '.json');
process.env.ABAITZIK_INSTANCE_FILE = FILE;

// Every module under the repo is dropped from the cache, because the instance
// is read once at require time on purpose and anything that already holds it
// would keep yesterday's addresses.
function fresh() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(ROOT) && !k.includes('node_modules')) delete require.cache[k];
  }
}

// Load a module fresh with instance.json temporarily absent, then restore.
function without(fn) {
  const saved = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
  try {
    if (saved) fs.unlinkSync(FILE);
    fresh();
    return fn();
  } finally {
    if (saved !== null) fs.writeFileSync(FILE, saved);
    for (const k of Object.keys(require.cache)) {
      if (/[\/](lib[\/]instance|lib[\/]notify-channels|listen|inbox)\.js$/.test(k)) delete require.cache[k];
    }
  }
}

test('the listener subscribes to his inbound topic when nothing is configured', () => {
  without(() => {
    const l = require(path.join(ROOT, 'listen.js'));
    assert.equal(l.TOPIC, 'abaitzik-in-95e62e86c34f4853');
    assert.equal(l.LIVE, 'abaitzik-in-95e62e86c34f4853-live');
  });
});

test('the outbound channel still points at his phone and his mailbox', () => {
  without(() => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'notify-channels.js'), 'utf8');
    // The module keeps these private; read them through the instance it uses.
    const inst = require(path.join(ROOT, 'lib', 'instance.js')).load();
    assert.equal(inst.ntfy.out, 'abaitzik-cf9044bdcfa8');
    assert.equal(inst.mailbox, 'itcohen2@gmail.com');
    assert.equal(inst.origin, 'https://itcohen2-maker.github.io');
    assert.ok(/inst\.ntfy\.out/.test(src) && /inst\.mailbox/.test(src),
      'notify-channels reads its addresses from the instance, not from literals');
    assert.ok(!/abaitzik-cf9044bdcfa8/.test(src), 'no hard coded outbound topic left in notify-channels');
  });
});

test('a second instance moves every address at once', () => {
  const saved = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
  try {
    fs.writeFileSync(FILE, JSON.stringify({
      ntfy: { in: 'ily-in-3f7c1a9e04b2d856', out: 'ily-out-8b41ce22f0a7' },
      mailbox: 'ily@example.com',
      // A data folder with no keys.json: Itzik's real keys.json would win otherwise.
      dataDir: require('os').tmpdir(),
    }));
    fresh();
    const l = require(path.join(ROOT, 'listen.js'));
    assert.equal(l.TOPIC, 'ily-in-3f7c1a9e04b2d856');
    assert.equal(l.LIVE, 'ily-in-3f7c1a9e04b2d856-live');
    const inst = require(path.join(ROOT, 'lib', 'instance.js'));
    assert.equal(inst.ntfy.out, 'ily-out-8b41ce22f0a7');
    assert.equal(inst.mailbox, 'ily@example.com');
  } finally {
    if (saved !== null) fs.writeFileSync(FILE, saved); else fs.unlinkSync(FILE);
    fresh();
  }
});
