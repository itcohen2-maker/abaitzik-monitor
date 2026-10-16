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
    node pc-task.js add --quiet --re <id> "<task>"   a routine job (the 07:00 network
                                          report): its output is the work itself, so a
                                          success writes nothing to his chat. A final
                                          failure still does, in the thread of <id>.
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
/*
  2.10, Itzik: "למה הוא אומר לי המחשב מכובה ולא מוסיף". The PC was on and adding
  the item; the reply said "it will run as soon as the PC is on", which reads as
  "the PC is off". Every pc-pull run calls next once a minute, so that call is the
  heartbeat: seen in the last 3 minutes means on, and the reply can say so.
*/
const SEEN = path.join(inst.dataPath, "status", "pc-seen.json");
function pcOnline() {
  const s = readJson(SEEN, null);
  const at = s && Date.parse(s.at);
  return { on: Boolean(at && Date.now() - at < 3 * 60 * 1000), at: s ? s.at : null };
}

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

/*
  15.10, Rinat's research collection: the computer sent back 1,025 files and a
  76KB "done" body; the API took 64KB, dropped the connection, and nothing was
  logged. Twice. After the second try nothing ever claimed the task again and
  nothing failed it, so it sat "claimed" for hours and the watchdog shouted
  every hour. Three rules from that evening:
    - the answer is cut here, not refused: over 12 files/ lines become 6 and a
      count, and the text is capped, whatever the computer's script version;
    - a claimed task past its stale time with no tries left is failed here, in
      next, so the queue never holds a task forever;
    - add --then "<what the server does with the result>" reopens the original
      message when the computer is done (reopenAt, reopenNote), so the server
      session that promised "when the material is back I will..." actually runs.
*/
const MAX_ANSWER = 12000;
function trimAnswer(text) {
  let lines = String(text || '').split('\n');
  const files = lines.filter((l) => /^files\//.test(l.trim()));
  if (files.length > 12) {
    const first = files.slice(0, 6);
    const dir = (files[0].match(/^(files\/pc-out\/[^/]+\/)/) || [])[1];
    lines = lines.filter((l) => !/^files\//.test(l.trim())).concat(first,
      ['הועלו ' + files.length + ' קבצים למוניטור' + (dir ? ', כולם בתיקייה ' + dir : '') + '.']);
  }
  let out = lines.join('\n');
  if (out.length > MAX_ANSWER) out = out.slice(0, MAX_ANSWER) + '\n(התשובה קוצרה)';
  return out;
}
function reopen(re, note) {
  let files = [];
  try { files = fs.readdirSync(CHAT); } catch (e) { return false; }
  for (const f of files) {
    const p = path.join(CHAT, f);
    const d = readJson(p, null);
    if (!d || d.id !== re) continue;
    d.status = 'working';
    d.reopenAt = new Date().toISOString();
    d.reopenNote = String(note || '').slice(0, 2000);
    fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
    const seenP = path.join(inst.dataPath, 'status', 'worker-seen.json');
    const seen = readJson(seenP, {});
    if (seen[f]) { delete seen[f]; try { fs.writeFileSync(seenP, JSON.stringify(seen, null, 1), 'utf8'); } catch (e) {} }
    return true;
  }
  return false;
}
function failExhausted() {
  const now = Date.now();
  const dead = locked(() => all().filter((x) => x.status === 'claimed' && now - Date.parse(x.claimedAt) > STALE_MS && (x.tries || 0) >= MAX_TRIES)
    .map((x) => { x.status = 'failed'; x.lastError = 'המחשב לקח את המשימה ' + x.tries + ' פעמים ולא החזיר תשובה'; write(x); return x; }));
  dead.filter((t) => !t.test).forEach((t) => {
    reply(t, 'המחשב ניסה פעמיים ולא החזיר תשובה על זה. מה שנתקע: הסשן במחשב נגמר בלי להודיע. אפשר לבקש שוב.', 'failed');
    push('משימת מחשב נכשלה: ' + t.task.slice(0, 60));
  });
}

if (cmd === 'add') {
  const test = rest.includes('--test');
  const quiet = rest.includes('--quiet');
  const ri = rest.indexOf('--re');
  const re = ri > -1 ? rest[ri + 1] : '';
  const ti = rest.indexOf('--then');
  const then = ti > -1 ? String(rest[ti + 1] || '').trim() : '';
  const task = rest.filter((x, i) => x !== '--test' && x !== '--quiet' && i !== ri && i !== ri + 1 && i !== ti && i !== ti + 1).join(' ').trim();
  if ((!re && !test) || !task) { console.error('usage: node pc-task.js add --re <id> [--then "<what the server does next>"] "<task>"'); process.exit(2); }
  // 15.10, Rinat's deck: the session queued the task and wrote the synthesis file after it.
  // Her computer claimed the task 23 seconds later, listed the monitor's files, the file
  // was not there yet, and the session there gave up: "the content file is not on the
  // computer". A task that names files/<name> is refused until every such file exists.
  const priv = path.join(inst.dataPath, 'files-private');
  const named = (task.match(/files\/[^\s"'`)<>|]+/g) || []).map((s) => decodeURIComponent(s.slice(6)).replace(/[.,;:]+$/, ''));
  const missing = named.filter((n) => !fs.existsSync(path.join(priv, n)));
  if (missing.length && !test) {
    console.error('הקבצים האלה עדיין לא קיימים ב data/files-private, לכתוב אותם קודם ואז להוסיף את המשימה: ' + missing.join(', '));
    process.exit(2);
  }
  const id = 'pc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  write(Object.assign({ id, re, at: new Date().toISOString(), task, status: 'pending', tries: 0 },
    test ? { test: true } : {}, quiet ? { quiet: true } : {}, then ? { then } : {}));
  const o = pcOnline();
  console.log(id);
  console.log(o.on ? 'pc: on' : 'pc: off, last seen ' + (o.at || 'never'));
} else if (cmd === 'online') {
  const o = pcOnline();
  console.log(o.on ? 'on' : 'off ' + (o.at || 'never'));
} else if (cmd === 'next') {
  // The PC asks every minute it is awake, so this is also its heartbeat.
  // pegasus-server.js reads it to stand in for the PC only while it is off.
  try { fs.writeFileSync(path.join(inst.dataPath, 'status', 'pc-seen.json'), JSON.stringify({ at: new Date().toISOString() })); } catch (e) {}
  failExhausted();
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
    // 16.10: every task the PC gets carries the savings rules on top (skill saving).
    const sv = require('./lib/saving.js').promptLines();
    console.log(JSON.stringify(Object.assign({}, t, { task: (sv.length ? sv.join('
') + '
' : '') + t.task, message: m ? (m.note || m.text || '') : '' })));
  }
} else if (cmd === 'done') {
  const text = trimAnswer(stdin());
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
  if (t.quiet) {
    locked(() => { const x = get(t.id); x.answer = text; write(x); });
    push('המחשב סיים משימה קבועה: ' + t.task.slice(0, 60));
    process.exit(0);
  }
  reply(t, text, 'done');
  if (t.then && t.re) {
    const ok = reopen(t.re, 'המחשב סיים את המשימה "' + t.task.slice(0, 80) + '" והחזיר: ' + text.slice(0, 600) + '\nהמשך לפי התוכנית: ' + t.then);
    console.log(ok ? 'ההודעה המקורית נפתחה מחדש להמשך בשרת' : 'ההודעה המקורית לא נמצאה, אין המשך');
  }
  push('המחשב סיים משימה: ' + t.task.slice(0, 60));
} else if (cmd === 'reopen') {
  // node pc-task.js reopen <message id> "<note for the session>": a message of his goes
  // back to the worker with the note, even though an answer already hangs on it.
  const ok = reopen(rest[0], rest.slice(1).join(' '));
  console.log(ok ? 'reopened' : 'no such message');
  if (!ok) process.exit(2);
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
} else if (cmd === 'usage') {
  // 12.10, Itzik: "בדו"חות תכניס גם כמה טוקנים". The PC's sessions run on his
  // subscription too, so pc-pull.js sends each one's usage line here and it
  // lands in the same usage.jsonl that usage-watch.js counts.
  try {
    const u = JSON.parse(stdin());
    const line = { at: new Date().toISOString(), who: inst.name, src: 'pc', task: String(rest[0] || ''),
      usd: +u.usd || 0, turns: +u.turns || 0, ms: +u.ms || 0, sub: +u.sub || 0, models: u.models || {} };
    fs.appendFileSync(path.join(inst.dataPath, 'status', 'usage.jsonl'), JSON.stringify(line) + '\n');
    console.log('ok');
  } catch (e) { console.error('bad usage line: ' + e.message); process.exit(2); }
} else if (cmd === 'sub') {
  // 12.10: the subscription's own meter, read on the PC (pc-pull.js subSnapshot).
  // The latest goes to subscription.json, every reading to subscription.jsonl for the trend.
  try {
    const u = JSON.parse(stdin());
    const snap = Object.assign({ at: new Date().toISOString() }, u);
    fs.writeFileSync(path.join(inst.dataPath, 'status', 'subscription.json'), JSON.stringify(snap, null, 1));
    fs.appendFileSync(path.join(inst.dataPath, 'status', 'subscription.jsonl'), JSON.stringify(snap) + '\n');
    console.log('ok');
  } catch (e) { console.error('bad subscription line: ' + e.message); process.exit(2); }
} else if (cmd === 'list') {
  all().forEach((t) => console.log([t.id, t.status, t.at, t.task.slice(0, 80)].join('  ')));
} else {
  console.error('usage: node pc-task.js add|next|done|fail|usage|sub|list');
  process.exit(2);
}
