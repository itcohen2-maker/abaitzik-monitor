/*
  The one queue in the whole system.

  Itzik, 18.9: "it cannot be that you take one request at a time, then the
  monitor is worth nothing, it is not efficient and no client will want it."
  He is right, and the fix is not to run the sessions faster. It is to stop
  running them one at a time.

  Sessions can now run together. The single thing they cannot do together is
  write to this repository: two of them at `git commit` in the same second
  produce an index lock, a half staged tree, or a push that silently drops the
  other one's work. So the parallelism is everywhere and the queue is here, on
  the write alone, which is the smallest place it can live.

  Usage, from inside a session, instead of git add/commit/push:
    node push.js "the commit message"

  It waits its turn, builds, commits everything, pushes, and rebases once if
  the remote moved while it was waiting.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');

const HERE = __dirname;
const LOCK = path.join(HERE, 'data', 'status', 'push.lock');
const LOG = path.join(HERE, 'data', 'status', 'push.log');
// A build plus a push is seconds. A minute is already a stuck one, and holding
// the whole queue behind a corpse is the failure this file exists to avoid.
const STALE_MS = 3 * 60 * 1000;
const WAIT_MS = 4 * 60 * 1000;

const msg = process.argv.slice(2).join(' ').trim();
if (!msg) { console.error('צריך הודעת קומיט'); process.exit(2); }

function say(line) {
  const t = new Date().toTimeString().slice(0, 8);
  try { fs.appendFileSync(LOG, t + '  [' + process.pid + '] ' + line + '\n', 'utf8'); } catch (e) {}
  console.log(t + '  ' + line);
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function readLock() { try { return JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch (e) { return null; } }

function take() {
  const cur = readLock();
  if (cur && cur.pid && alive(cur.pid) && Date.now() - Date.parse(cur.at) < STALE_MS) return false;
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), msg: msg.slice(0, 80) }), 'utf8');
  // Written, then read back. Two processes can both find the lock free in the
  // same millisecond; only one of them is still named in the file afterwards.
  const back = readLock();
  return !!(back && back.pid === process.pid);
}
function release() { try { const c = readLock(); if (c && c.pid === process.pid) fs.unlinkSync(LOCK); } catch (e) {} }

const git = (...a) => execFileSync('git', a, { cwd: HERE, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

async function main() {
  const until = Date.now() + WAIT_MS;
  let waited = 0;
  while (!take()) {
    if (Date.now() > until) { say('!! חיכיתי ארבע דקות לתור ולא התפנה. לא דוחף.'); process.exit(3); }
    if (!waited) say('התור תפוס. ממתין.');
    waited += 1;
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  }
  try {
    // Built inside the lock on purpose: a build is a write to docs, and two of
    // those racing produce a page that matches neither session's data.
    await new Promise((res, rej) => execFile('node', ['build.js'], { cwd: HERE, timeout: 180000 },
      (e, o) => (e ? rej(new Error(String(o).slice(-200))) : res())));
    git('add', '-A');
    let out = '';
    try { out = git('commit', '-m', msg); }
    catch (e) {
      out = String((e.stdout || '') + (e.stderr || ''));
      if (/nothing to commit/i.test(out)) { say('אין מה לדחוף.'); return; }
      throw new Error(out.slice(-200));
    }
    try { git('push'); }
    catch (e) {
      say('הדחיפה נדחתה, מושך ומנסה שוב.');
      git('pull', '--rebase', '--autostash');
      git('push');
    }
    say('נדחף: ' + msg.split('\n')[0].slice(0, 70));
  } finally {
    release();
  }
}
main().catch((e) => { release(); say('!! ' + e.message); process.exit(1); });
