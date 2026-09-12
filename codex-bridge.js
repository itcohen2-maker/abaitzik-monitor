'use strict';
// Bridge between the monitor and the local agent mailbox Codex set up.
//
// The mailbox listens on 127.0.0.1 only and refuses any request carrying an
// Origin header, so the phone can never talk to it: the monitor page is a
// static file on GitHub Pages and the mailbox is a process on this machine.
// Everything therefore crosses here, on the PC, in the same round in which I
// rebuild and push the page.
//
// What this does NOT do: it does not start a Codex session and it does not
// hand a message to one. The mailbox itself reports agentAutoDelivery false.
// A message pushed from here is stored and waiting, and the monitor says
// exactly that word and never says answered.
//
//   node codex-bridge.js health
//   node codex-bridge.js pull                 write new messages into data/codex
//   node codex-bridge.js push "טקסט"          queue a message from Itzik to Codex
//   node codex-bridge.js sync                 push the outbox, then pull

const fs = require('fs');
const path = require('path');

const CONN = path.join('C:', 'Users', 'User', 'OneDrive', 'Documents', 'pegasus',
  'agent-handoff', '.runtime', 'connection.json');
const IN = path.join(__dirname, 'data', 'codex', 'codex');
const OUT = path.join(__dirname, 'data', 'codex', 'outbox');
// The session to queue into. It lives under data/ (gitignored) because it names
// a session on this machine and has no business in a public repository.
const THREAD = path.join(__dirname, 'data', 'codex', 'thread.txt');

const { execFileSync } = require('child_process');

function thread() {
  if (!fs.existsSync(THREAD)) return '';
  return fs.readFileSync(THREAD, 'utf8').trim();
}

// The adapter Codex asked for. `delivered` is written only when this command
// actually exits zero; anything else leaves the message `stored`, which is what
// the screen already says. There is no optimistic case.
function cliEntry() {
  const guesses = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    path.join(process.env.HOME || '', '.npm-global', 'lib', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    '/usr/local/lib/node_modules/@openai/codex/bin/codex.js'
  ];
  return guesses.find(p => p && fs.existsSync(p)) || '';
}

function queueToSession(text) {
  const id = thread();
  if (!id) return { ok: false, why: 'אין מזהה שיחה ב-data/codex/thread.txt' };
  // The npm shim on Windows is a .cmd, and Node refuses to spawn one without a
  // shell. A shell is not an option here: the text is his, and it would be one
  // quote away from running as a command. So the CLI's own entry script is
  // called with this node, and the message stays a plain argument.
  const entry = cliEntry();
  if (!entry) return { ok: false, why: 'לא נמצא הקובץ של codex במחשב' };
  try {
    execFileSync(process.execPath, [entry, 'queue', '--thread', id, '--message', text],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, windowsHide: true });
    return { ok: true };
  } catch (e) {
    const why = String((e.stderr && e.stderr.toString()) || e.message || '').trim().slice(0, 300);
    return { ok: false, why: why || 'codex queue נכשל בלי הודעה' };
  }
}

function conn() {
  if (!fs.existsSync(CONN)) {
    throw new Error('the mailbox is not running: ' + CONN + ' is missing');
  }
  // The token is regenerated on every restart, so it is read fresh each call
  // and never copied anywhere else.
  const c = JSON.parse(fs.readFileSync(CONN, 'utf8'));
  if (!c.url || !c.token) throw new Error('connection.json has no url or token');
  return c;
}

async function call(method, route, body) {
  const c = conn();
  const res = await fetch(c.url + route, {
    method: method,
    headers: Object.assign({ Authorization: 'Bearer ' + c.token },
      body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error('mailbox ' + res.status + ': ' + (data.error || text));
    err.status = res.status;
    throw err;
  }
  return data;
}

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }

// Messages addressed to him or to me both belong on his screen: he is the one
// reading it, and a note Codex wrote to me is still news to him.
async function pull() {
  ensure(IN);
  const all = (await call('GET', '/messages')).messages || [];
  const mine = all.filter(m => m.from === 'codex' && (m.to === 'user' || m.to === 'claude'));
  let added = 0;
  mine.forEach(m => {
    const file = path.join(IN, m.id + '.json');
    if (fs.existsSync(file)) return;
    fs.writeFileSync(file, JSON.stringify({
      at: m.createdAt,
      from: 'codex',
      to: m.to,
      text: String(m.text || ''),
      replyTo: m.replyTo || '',
      state: 'received'
    }, null, 2), 'utf8');
    added++;
  });
  console.log('נמשכו ' + added + ' הודעות חדשות מקודקס (' + mine.length + ' בתיבה)');
  return added;
}

async function push(text, from) {
  const t = String(text || '').trim();
  if (!t) throw new Error('אין טקסט לשלוח');
  // The service answers 201 with {receipt, agentAutoDelivery, message}; the
  // stored record is the nested `message`, not the envelope.
  const res = await call('POST', '/messages', { from: from || 'user', to: 'codex', text: t });
  const m = res.message || res;
  if (!m.id) throw new Error('the mailbox stored nothing it could name');
  ensure(IN);
  const q = queueToSession(t);
  // His own message is written to the same folder so the screen shows one
  // thread, and its state is whichever of the two actually happened.
  fs.writeFileSync(path.join(IN, m.id + '.json'), JSON.stringify({
    at: m.createdAt,
    from: from || 'user',
    to: 'codex',
    text: t,
    replyTo: m.replyTo || '',
    state: q.ok ? 'delivered' : 'stored',
    error: q.ok ? '' : q.why
  }, null, 2), 'utf8');
  console.log(q.ok
    ? 'נמסר לשיחה של קודקס: ' + m.id
    : 'נשמר בתיבה בלבד (' + q.why + '): ' + m.id);
  return m;
}

// Anything he wrote on the phone lands here as a file, because the phone can
// only reach my channels, never the mailbox.
async function drainOutbox() {
  if (!fs.existsSync(OUT)) return 0;
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.json')).sort();
  let sent = 0;
  for (const f of files) {
    const full = path.join(OUT, f);
    const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!doc.text) { fs.unlinkSync(full); continue; }
    await push(doc.text, doc.from || 'user');
    fs.unlinkSync(full);
    sent++;
  }
  if (sent) console.log('נשלחו ' + sent + ' הודעות מהתור של איציק');
  return sent;
}

async function main() {
  const cmd = process.argv[2] || 'sync';
  if (cmd === 'health') {
    console.log(JSON.stringify(await call('GET', '/health')));
    return;
  }
  if (cmd === 'pull') { await pull(); return; }
  if (cmd === 'push') { await push(process.argv.slice(3).join(' ')); return; }
  if (cmd === 'sync') { await drainOutbox(); await pull(); return; }
  console.error('usage: node codex-bridge.js health|pull|push <text>|sync');
  process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error('!! ' + e.message); process.exit(1); });
}

module.exports = { pull, push, drainOutbox, call };
