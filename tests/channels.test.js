'use strict';
/*
  The addresses that reach Itzik, pinned.

  The outbound ntfy topic, the mailbox and the inbound topic the listener
  subscribes to must be the ones in data/keys.json. A wrong value here is not
  an error anyone sees: it is his phone going quiet while every log says
  "sent", and his voice notes landing on a topic nobody reads.

  30.9: the real topics used to be written out here as literals, in a public
  repository, and were rotated because of it. These tests use fake topics in
  a temporary data folder. A real topic must never be written here again.
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

const os = require('os');
const FAKE = { ntfyIn: 'test-in-topic', ntfyLive: 'test-live-topic', ntfyOut: 'test-out-topic', mail: 'itcohen2@gmail.com' };

// Run fn with an instance whose data folder holds fake keys, then restore.
async function withKeys(extra, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abaitzik-chan-'));
  fs.mkdirSync(path.join(dir, 'status'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'keys.json'), JSON.stringify(Object.assign({}, FAKE, extra || {})));
  const saved = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
  try {
    fs.writeFileSync(FILE, JSON.stringify({ dataDir: dir }));
    fresh();
    return await fn(dir);
  } finally {
    if (saved !== null) fs.writeFileSync(FILE, saved); else if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
    fresh();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// A fetch that records every URL and answers 200, so nothing leaves the machine.
async function recordingFetch(fn) {
  const calls = [];
  const real = global.fetch;
  global.fetch = async (url) => { calls.push(String(url)); return { ok: true, status: 200, text: async () => '{}' }; };
  try { await fn(); } finally { global.fetch = real; }
  return calls;
}

test('the listener subscribes to the inbound topic from keys.json', async () => {
  await withKeys({}, () => {
    const l = require(path.join(ROOT, 'listen.js'));
    assert.equal(l.TOPIC, FAKE.ntfyIn);
    assert.equal(l.LIVE, FAKE.ntfyLive);
    assert.deepEqual(l.inTopics(), [FAKE.ntfyIn]);
  });
});

test('the outbound channel reads its addresses from the instance, never from literals', async () => {
  await withKeys({}, () => {
    const inst = require(path.join(ROOT, 'lib', 'instance.js'));
    assert.equal(inst.ntfy.out, FAKE.ntfyOut);
    assert.equal(inst.mailbox, 'itcohen2@gmail.com');
    assert.equal(inst.origin, 'https://itcohen2-maker.github.io');
  });
  for (const file of ['lib/notify-channels.js', 'lib/instance.js', 'listen.js', 'inbox.js', 'alarm.js', 'build.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!/abaitzik-(in-)?[0-9a-f]{12,}|abz-[0-9a-f]{40}/.test(src), 'a topic literal in ' + file);
  }
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'notify-channels.js'), 'utf8');
  assert.ok(/inst\.ntfy\.out/.test(src) && /inst\.ntfy\.live/.test(src) && /inst\.mailbox/.test(src));
});

test('rotation window: the listener holds old and new inbound topics on one connection', async () => {
  const until = new Date(Date.now() + 3600000).toISOString();
  await withKeys({ ntfyInOld: 'test-in-old', ntfyInOldUntil: until }, () => {
    const l = require(path.join(ROOT, 'listen.js'));
    assert.equal(l.TOPIC, FAKE.ntfyIn);
    assert.deepEqual(l.inTopics(), ['test-in-topic', 'test-in-old']);
    assert.deepEqual(l.inTopics(Date.parse(until) + 1), ['test-in-topic']);
  });
  // The connection is made to all of them, comma separated, as ntfy takes it.
  const src = fs.readFileSync(path.join(ROOT, 'listen.js'), 'utf8');
  assert.ok(src.includes("fetch('https://ntfy.sh/' + topics.join(',') + '/json?since=' + since"));
  assert.ok(src.includes('const topics = inst.inTopics();'));
});

test('rotation window: a notification reaches the new topic first and the old one too', async () => {
  const until = new Date(Date.now() + 3600000).toISOString();
  await withKeys({ ntfyOutOld: 'test-out-old', ntfyOutOldUntil: until }, async () => {
    const ch = require(path.join(ROOT, 'lib', 'notify-channels.js'));
    let r;
    const calls = await recordingFetch(async () => { r = await ch.notify('t', 'b'); });
    assert.equal(r.ok, true);
    assert.equal(r.channel, 'ntfy');
    assert.deepEqual(calls, ['https://ntfy.sh/test-out-topic', 'https://ntfy.sh/test-out-old']);
  });
});

test('after the window a notification goes to the new topic only', async () => {
  const past = new Date(Date.now() - 1000).toISOString();
  await withKeys({ ntfyOutOld: 'test-out-old', ntfyOutOldUntil: past }, async () => {
    const ch = require(path.join(ROOT, 'lib', 'notify-channels.js'));
    const calls = await recordingFetch(async () => { await ch.notify('t', 'b'); });
    assert.deepEqual(calls, ['https://ntfy.sh/test-out-topic']);
  });
});

test('the heartbeat goes to this instance\'s own live topic', async () => {
  await withKeys({}, async () => {
    const ch = require(path.join(ROOT, 'lib', 'notify-channels.js'));
    const calls = await recordingFetch(async () => { await ch.pulse('{}'); });
    assert.deepEqual(calls, ['https://ntfy.sh/test-live-topic']);
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
