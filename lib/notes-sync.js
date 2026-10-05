'use strict';
/*
  The notes and the task ticks, kept on the server as well as the phone.

  The improvements reviewer, 5.10: notes and task ticks lived only in the
  phone's storage, so a new phone, a cleared Safari or a few days away could
  wipe a customer's ideas without a word. Itzik: "רוצה את זה". The page now
  sends its whole set after every change, and the copy here is what a phone
  with nothing in it is filled from.

  Merged, never replaced. Two phones, or one phone that missed the last copy,
  must not wipe each other: a note is kept by id with the newer edit winning,
  and a note that was deleted on any device stays deleted through its
  tombstone. Ticks are a union, an untick only counts from the device that
  sends it.
*/
const fs = require('fs');
const path = require('path');

function newer(a, b) { return String(a && a.upd || '') >= String(b && b.upd || ''); }

function merge(have, got) {
  have = have || {};
  got = got || {};
  const gone = Object.assign({}, have.gone || {}, got.gone || {});
  const byId = {};
  [].concat(have.notes || [], got.notes || []).forEach(function (n) {
    if (!n || !n.id || gone[n.id]) return;
    if (!byId[n.id] || newer(n, byId[n.id])) byId[n.id] = n;
  });
  const tasksDone = Object.assign({}, have.tasksDone || {}, got.tasksDone || {});
  (got.tasksUndone || []).forEach(function (k) { delete tasksDone[k]; });
  const tasksCleared = Object.assign({}, have.tasksCleared || {}, got.tasksCleared || {});
  return {
    at: got.at || have.at || new Date().toISOString(),
    notes: Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) { return String(a.upd || '') < String(b.upd || '') ? 1 : -1; }),
    gone: gone,
    tasksDone: tasksDone,
    tasksCleared: tasksCleared,
  };
}

function file(dir) { return path.join(dir, 'state.json'); }

function read(dir) {
  try { return JSON.parse(fs.readFileSync(file(dir), 'utf8')); } catch (e) { return null; }
}

// Returns the merged state, or null when what arrived is not a sync at all.
function record(dir, raw) {
  let got;
  try { got = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
  if (!got || !Array.isArray(got.notes)) return null;
  const out = merge(read(dir), got);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file(dir) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(out), 'utf8');
  fs.renameSync(tmp, file(dir));
  return out;
}

module.exports = { merge, record, read };
