'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const EMPTY = {
  version: 1,
  updatedAt: null,
  // Commands Itzik leaves for the next run. Newest first.
  commands: [],
  // Everything we have seen, keyed by network:externalId
  items: {},
  // Rolling counters so we can honour the daily quota / pacing rules
  activity: {},
};

function load() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return Object.assign({}, EMPTY, JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') return JSON.parse(JSON.stringify(EMPTY));
    throw err;
  }
}

function save(state) {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
  return state;
}

function key(network, externalId) {
  return `${network}:${externalId}`;
}

// An item is one person's comment / story reply / DM that reached us.
// We never create items for people who did not contact us first.
function upsertItem(state, item) {
  const k = key(item.network, item.externalId);
  const prev = state.items[k] || {};
  state.items[k] = Object.assign(
    {
      network: item.network,
      externalId: item.externalId,
      author: '',
      text: '',
      postTitle: '',
      postUrl: '',
      seenAt: new Date().toISOString(),
      liked: false,
      repliedAt: null,
      replyText: null,
      category: null,
      skipped: false,
      skipReason: null,
    },
    prev,
    item
  );
  return state.items[k];
}

function markReplied(state, network, externalId, replyText) {
  const it = state.items[key(network, externalId)];
  if (!it) return null;
  it.repliedAt = new Date().toISOString();
  it.replyText = replyText;
  bump(state, network, 'replies');
  return it;
}

function markLiked(state, network, externalId) {
  const it = state.items[key(network, externalId)];
  if (!it) return null;
  if (!it.liked) {
    it.liked = true;
    bump(state, network, 'likes');
  }
  return it;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function bump(state, network, kind) {
  const day = today();
  state.activity[day] = state.activity[day] || {};
  state.activity[day][network] = state.activity[day][network] || {};
  const bucket = state.activity[day][network];
  bucket[kind] = (bucket[kind] || 0) + 1;
}

function pending(state) {
  return Object.values(state.items).filter((i) => !i.repliedAt && !i.skipped);
}

module.exports = {
  STATE_FILE,
  load,
  save,
  key,
  upsertItem,
  markReplied,
  markLiked,
  bump,
  pending,
  today,
};
