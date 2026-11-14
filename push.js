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

const FLUSH = process.argv[2] === '--flush';
const msg = FLUSH ? 'flush' : process.argv.slice(2).join(' ').trim();
if (!msg) { console.error('צריך הודעת קומיט'); process.exit(2); }
/*
  10.11.2026, Itzik's carousel did not show for 35 minutes. Every push starts a
  GitHub Pages deploy that takes about five minutes, and a newer push cancels the
  one still running. With pushes every minute or two (health board, sessions,
  agents) no deploy finished between 15:16 and 15:50. So on Itzik's own page a
  push to GitHub is spaced: if the last one was under GAP_MS ago, the commit stays
  local and one detached "push.js --flush" pushes everything together when the
  gap is over. The newest deploy always carries every commit before it.
*/
const GAP_MS = 6 * 60 * 1000;
const REMOTE = path.join(HERE, 'data', 'status', 'push-remote.json');
const FLOCK = path.join(HERE, 'data', 'status', 'push-flush.lock');
function remoteState() { try { return JSON.parse(fs.readFileSync(REMOTE, 'utf8')) || {}; } catch (e) { return {}; } }
function markPushed() { try { fs.writeFileSync(REMOTE, JSON.stringify({ lastPush: new Date().toISOString() }), 'utf8'); } catch (e) {} }
function sinceLastPush() { const t = Date.parse(remoteState().lastPush || ''); return isNaN(t) ? Infinity : Date.now() - t; }
function flusherAlive() { try { const f = JSON.parse(fs.readFileSync(FLOCK, 'utf8')); return !!(f.pid && alive(f.pid)); } catch (e) { return false; } }
function startFlusher() {
  if (flusherAlive()) return;
  const c = require('child_process').spawn(process.execPath, [__filename, '--flush'], { cwd: HERE, detached: true, stdio: 'ignore' });
  c.unref();
}

// 24.10.2026: a session that ran this as root left docs/ owned by root, and every
// later build by the monitor user failed with EACCES until the files were handed
// back. On the server the repo belongs to the owner of this folder, so root hands
// the run to that user instead of writing as itself.
if (process.getuid && process.getuid() === 0) {
  const owner = fs.statSync(HERE).uid;
  if (owner !== 0) {
    const name = execFileSync('id', ['-nu', String(owner)], { encoding: 'utf8' }).trim();
    try {
      execFileSync('sudo', ['-E', '-u', name, process.execPath, __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
      process.exit(0);
    } catch (e) { process.exit(e.status || 1); }
  }
}

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

const git = (...a) => execFileSync('git', a, { cwd: HERE, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
/*
  14.11: a pull --rebase that hit a conflict (both sides rebuilt docs/) was left half done, and the
  watchdog then called git stuck. On failure the rebase is aborted: the repo is back where it was,
  and the next build publishes again.
*/
const pullRebase = () => {
  try { git('pull', '--rebase', '--autostash'); }
  catch (e) { try { git('rebase', '--abort'); } catch (e2) { /* no rebase running */ } throw e; }
};

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
    /*
      One retry, because the failure is a race and not a refusal.

      18.9, 21:00: add died with "open(bl.tmp): No such file or directory"
      — another session had created and deleted a temp file in the repo
      root while add was walking the tree. main() threw, nothing was
      committed, and the answer that session had written never reached the
      page. The same call succeeded a moment later by hand.
    */
    try { git('add', '-A'); }
    catch (e) {
      say('הוספה נכשלה, מנסה שוב: ' + String(e.message || e).slice(-120));
      git('add', '-A');
    }
    let out = '';
    try { out = git('commit', '-m', msg); }
    catch (e) {
      out = String((e.stdout || '') + (e.stderr || ''));
      if (/nothing to commit/i.test(out)) { say('אין מה לדחוף.'); return; }
      throw new Error(out.slice(-200));
    }
    /*
      14.10: a customer's page is served straight from this server's docs by
      Caddy, so the build above is the publish; GitHub is only a backup that an
      instance may not have (no key, no repository yet). Sessions in Rinat's
      monitor read the push error as "the reply will not reach her", spent
      their turn on it and left notes unanswered. For a customer a failed push
      is one calm line and exit 0. Itzik's own page is GitHub Pages, so there
      it stays an error.
    */
    let ownPage = true;
    try { ownPage = JSON.parse(fs.readFileSync(path.join(HERE, 'instance.json'), 'utf8')).name === 'abaitzik'; } catch (e) {}
    if (ownPage && sinceLastPush() < GAP_MS) {
      startFlusher();
      say('נשמר, יידחף יחד עם הבאים (פרסום קודם עוד רץ): ' + msg.split(String.fromCharCode(10))[0].slice(0, 60));
      return;
    }
    try { git('push'); markPushed(); }
    catch (e) {
      try {
        say('הדחיפה נדחתה, מושך ומנסה שוב.');
        pullRebase();
        git('push'); markPushed();
      } catch (e2) {
        if (ownPage) throw e2;
        say('נבנה ופורסם בשרת. גיבוי לגיטהאב לא מחובר למופע הזה, זה בסדר, לא צריך לעשות כלום.');
        return;
      }
    }
    say('נדחף: ' + msg.split('\n')[0].slice(0, 70));
  } finally {
    release();
  }
}
async function flush() {
  try { fs.writeFileSync(FLOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8'); } catch (e) {}
  try {
    const wait = GAP_MS - sinceLastPush();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait + 2000));
    const until = Date.now() + WAIT_MS;
    while (!take()) { if (Date.now() > until) { say('!! flush: התור לא התפנה.'); return; } await new Promise((r) => setTimeout(r, 2000)); }
    try {
      let ahead = '';
      try { ahead = git('rev-list', '--count', '@{u}..HEAD').trim(); } catch (e) { ahead = '1'; }
      if (ahead === '0') { say('flush: אין מה לדחוף.'); return; }
      try { git('push'); }
      catch (e) { say('flush: נדחה, מושך ומנסה שוב.'); pullRebase(); git('push'); }
      markPushed();
      say('נדחף יחד: ' + ahead + ' קומיטים');
    } finally { release(); }
  } catch (e) { say('!! flush: ' + String(e.message || e).slice(-160)); }
  finally { try { const f = JSON.parse(fs.readFileSync(FLOCK, 'utf8')); if (f.pid === process.pid) fs.unlinkSync(FLOCK); } catch (e) {} }
}
if (FLUSH) flush();
else main().catch((e) => { release(); say('!! ' + e.message); process.exit(1); });
