/*
  Tasks the server hands to the PC.

  Itzik, 1.10: "תבנה שהמחשב יקלוט לבד משימות מהמוניטור שהשרת מסמן לו".
  Until today a message that needed his browser, Rivhit or a file on his
  desktop got one line from the server ("open CLAUDE.cmd on the desktop") and
  stopped there, and the work waited for him to remember. Now the server
  session marks it here, and pc-pull.js on the PC picks it up by itself the
  next minute the PC is on, does it there, and the answer lands in the same
  thread on his page.

  The records live on the server, in data/pc/pc/<id>.json. The PC never keeps
  its own copy; it reaches them over ssh, through the commands below.

  Usage (on the server, as monitor):
    node pc-task.js add --re <his message id> "<what to do, in full>"
    node pc-task.js next              claims the oldest waiting task, prints it
    node pc-task.js done <id>         answer text on stdin, writes it to the chat and pushes
    node pc-task.js fail <id>         reason on stdin; back to the queue once, then told to him
    node pc-task.js list
    node pc-task.js add --test "<task>"   a dry run of the whole path: the answer
                                          stays in the task record, nothing reaches his chat
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const inst = require('./lib/instance.js');
const DIR = path.join(inst.dataPath, 'pc', 'pc');
const CHAT = path.join(inst.dataPath, 'chat', 'chat');
const LOCK = path.join(inst.dataPath, 'status', 'pc-task.lock');
// A claimed task whose PC session never reported back (the PC went to sleep,
// the lid closed) goes back to the queue after this long.
const STALE_MS = 45 * 60 * 1000;
const MAX_TRIES = 2;

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function write(t) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, t.id + '.json'), JSON.stringify(t, null, 1), 'utf8');
}
function all() {
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch (e) { return []; }
  return files.map((f) => readJson(path.join(DIR, f), null)).filter(Boolean)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
function get(id) {
  const t = readJson(path.join(DIR, String(id).replace(/[^\w-]/g, '') + '.json'), null);
  if (!t) { console.error('no such task: ' + id); process.exit(2); }
  return t;
}
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}
// One claimer at a time. mkdir is atomic on every filesystem this runs on.
function locked(fn) {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  for (let i = 0; i < 50; i++) {
    try { fs.mkdirSync(LOCK); break; } catch (e) {
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 60 * 1000) fs.rmdirSync(LOCK); } catch (e2) {}
      if (i === 49) { console.error('busy'); process.exit(3); }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(LOCK); } catch (e) {} }
}
function stdin() {
  try { return fs.readFileSync(0, 'utf8').trim(); } catch (e) { return ''; }
}
function hisMessage(re) {
  let files = [];
  try { files = fs.readdirSync(CHAT); } catch (e) { return null; }
  for (const f of files) {
    const d = readJson(path.join(CHAT, f), null);
    if (d && d.id === re) return d;
  }
  return null;
}
// The answer goes in as a reply in his thread, the same record a server
// session writes, so the page shows it under the message it answers.
function reply(t, text, slug) {
  const d = new Date();
  fs.mkdirSync(CHAT, { recursive: true });
  const f = path.join(CHAT, stamp(d) + '-claude-pc-' + slug + '-' + t.id.slice(-5) + '.json');
  fs.writeFileSync(f, JSON.stringify({ at: d.toISOString(), from: 'claude', re: t.re, text, pc: true }, null, 1), 'utf8');
}
function push(msg) {
  try { execFileSync(process.execPath, [path.join(HERE, 'push.js'), msg], { cwd: HERE, stdio: 'inherit' }); }
  catch (e) { console.error('push failed: ' + e.message); }
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'add') {
  const test = rest.includes('--test');
  const ri = rest.indexOf('--re');
  const re = ri > -1 ? rest[ri + 1] : '';
  const task = rest.filter((x, i) => x !== '--test' && i !== ri && i !== ri + 1).join(' ').trim();
  if ((!re && !test) || !task) { console.error('usage: node pc-task.js add --re <id> "<task>"'); process.exit(2); }
  const id = 'pc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  write(Object.assign({ id, re, at: new Date().toISOString(), task, status: 'pending', tries: 0 }, test ? { test: true } : {}));
  console.log(id);
} else if (cmd === 'next') {
  // The PC asks every minute it is awake, so this is also its heartbeat.
  // pegasus-server.js reads it to stand in for the PC only while it is off.
  try { fs.writeFileSync(path.join(inst.dataPath, 'status', 'pc-seen.json'), JSON.stringify({ at: new Date().toISOString() })); } catch (e) {}
  const t = locked(() => {
    const now = Date.now();
    const free = all().find((x) => x.status === 'pending' ||
      (x.status === 'claimed' && now - Date.parse(x.claimedAt) > STALE_MS && (x.tries || 0) < MAX_TRIES));
    if (!free) return null;
    free.status = 'claimed';
    free.claimedAt = new Date().toISOString();
    free.tries = (free.tries || 0) + 1;
    write(free);
    return free;
  });
  if (t) {
    const m = hisMessage(t.re);
    console.log(JSON.stringify(Object.assign({}, t, { message: m ? (m.note || m.text || '') : '' })));
  }
} else if (cmd === 'done') {
  const text = stdin();
  if (!text) { console.error('empty answer'); process.exit(2); }
  const t = locked(() => {
    const x = get(rest[0]);
    x.status = 'done';
    x.doneAt = new Date().toISOString();
    if (x.test) x.answer = text;
    write(x);
    return x;
  });
  if (t.test) { console.log('test task, answer kept in the record'); process.exit(0); }
  reply(t, text, 'done');
  push('המחשב סיים משימה: ' + t.task.slice(0, 60));
} else if (cmd === 'fail') {
  const why = stdin() || 'הסשן במחשב נגמר בלי תשובה';
  const t = locked(() => {
    const x = get(rest[0]);
    x.lastError = why.slice(0, 500);
    x.status = (x.tries || 0) >= MAX_TRIES ? 'failed' : 'pending';
    write(x);
    return x;
  });
  if (t.status === 'failed' && !t.test) {
    reply(t, 'המחשב ניסה פעמיים ולא הצליח לבצע את זה. מה שנתקע: ' + why.slice(0, 300), 'failed');
    push('משימת מחשב נכשלה: ' + t.task.slice(0, 60));
  }
  console.log(t.status);
} else if (cmd === 'list') {
  all().forEach((t) => console.log([t.id, t.status, t.at, t.task.slice(0, 80)].join('  ')));
} else {
  console.error('usage: node pc-task.js add|next|done|fail|list');
  process.exit(2);
}
