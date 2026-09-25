'use strict';
/*
  The customer picks his own code.

  Itzik, 25.9, choosing between showing Ilay the code at the office and letting
  Ilay choose it: "הוא בוחר קוד". Nobody else should know the code that opens
  somebody's monitor, not Itzik, and not a notification service in between.

  The server still has to know it, because the build seals the page with it.
  What nobody has to do is carry it. So the first visit is authorised by a
  one time setup token instead: it travels in the link Itzik forwards, in the
  URL fragment so it never reaches a server log, and the first time it is used
  it is burnt. The customer's phone sends the code he chose straight to this
  process over HTTPS, the code becomes the gate key, the salt is renewed so
  nothing sealed under the old key opens again, and the page is rebuilt.

  If Itzik or anyone else used the link first, the customer finds it spent and
  says so. That is the whole defence, and it is enough for a link that lives a
  few minutes in a WhatsApp thread between a father and his son.

  One process per instance, bound to localhost; Caddy forwards /api/ to it.

  Usage:
    node setup-server.js --port 8790          serve
    node setup-server.js --new-token          mint a token, print the link
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const inst = require('./lib/instance.js');
const TOKEN_FILE = path.join(inst.dataPath, 'setup-token.txt');
const KEY_FILE = path.join(HERE, 'gate-key.txt');
const SALT_FILE = path.join(HERE, 'gate-salt.txt');

/*
  What counts as a code. Six to eight digits, because that is what the gate
  card's keypad asks for and what the key derivation was tuned for, and not one
  of the handful of codes that are tried first by anybody guessing.
*/
function codeProblem(code) {
  const c = String(code == null ? '' : code);
  if (!/^[0-9]{6,8}$/.test(c)) return 'הקוד צריך להיות בין 6 ל 8 ספרות.';
  if (/^(\d)\1+$/.test(c)) return 'קוד שכולו אותה ספרה קל מדי לנחש.';
  const up = '0123456789012', down = '9876543210987';
  if (up.includes(c) || down.includes(c)) return 'קוד של ספרות עוקבות קל מדי לנחש.';
  return '';
}

function sameToken(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// Ten wrong tokens and the endpoint shuts for an hour. The token is 128 bits,
// so this is not about guessing it; it is about not being a free oracle.
let misses = 0, shutUntil = 0;

function apply(code) {
  fs.writeFileSync(KEY_FILE, code + '\n', { mode: 0o600 });
  try { fs.unlinkSync(SALT_FILE); } catch (e) { /* first time: none yet */ }
  fs.unlinkSync(TOKEN_FILE);
  execFileSync('node', ['build.js'], { cwd: HERE, stdio: 'ignore', timeout: 120000 });
  // Caddy runs as another user and must be able to read what was just built.
  try { execFileSync('chmod', ['-R', 'o+rX', path.join(HERE, 'docs')]); } catch (e) {}
}

function handle(req, res) {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && req.url.startsWith('/api/setup/state')) {
    return send(200, { open: fs.existsSync(TOKEN_FILE) });
  }
  if (req.method !== 'POST' || !req.url.startsWith('/api/setup')) return send(404, { ok: false });
  if (Date.now() < shutUntil) return send(429, { ok: false, error: 'יותר מדי ניסיונות. לנסות שוב בעוד שעה.' });
  let raw = '';
  req.on('data', (b) => { raw += b; if (raw.length > 2048) req.destroy(); });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { return send(400, { ok: false, error: 'בקשה לא תקינה.' }); }
    let token = '';
    try { token = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) {
      return send(410, { ok: false, error: 'הקישור הזה כבר שומש. אם זה לא היית אתה, תגיד לאבא מיד.' });
    }
    if (!sameToken(body.token, token)) {
      misses += 1;
      if (misses >= 10) { shutUntil = Date.now() + 3600000; misses = 0; }
      return send(403, { ok: false, error: 'הקישור לא תקין. כדאי לפתוח שוב את הקישור מההודעה.' });
    }
    const problem = codeProblem(body.code);
    if (problem) return send(400, { ok: false, error: problem });
    try { apply(String(body.code)); }
    catch (e) { return send(500, { ok: false, error: 'משהו נכשל בהגדרה. הקוד לא נשמר, אפשר לנסות שוב.' }); }
    send(200, { ok: true });
  });
}

function newToken() {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  const t = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(TOKEN_FILE, t + '\n', { mode: 0o600 });
  return t;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--new-token')) {
    const base = String(args[args.indexOf('--new-token') + 1] || '').replace(/\/+$/, '');
    const t = newToken();
    console.log((base || inst.publicUrl.replace(/\/+$/, '')) + '/start#t=' + t);
  } else {
    const port = Number(args[args.indexOf('--port') + 1]) || 8790;
    http.createServer(handle).listen(port, '127.0.0.1', () => console.log('setup on 127.0.0.1:' + port));
  }
}

module.exports = { codeProblem, sameToken };
