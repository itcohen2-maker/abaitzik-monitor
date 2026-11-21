#!/usr/bin/env node
// The subscribers' Drive folder (13.10.2026). A separate Google account, not itcohen2: it holds only the
// folder "מנויים", one subfolder per subscriber shared with that subscriber alone. The server reads and
// writes there through rclone (~/bin/rclone, remote "subs" in ~/.config/rclone/rclone.conf, not in git).
// Nothing private of Itzik's ever goes in: if the server is broken into, this folder is what is exposed.
//
//   node drive.js setup '<token json from "rclone authorize drive" on the PC>'
//   node drive.js status
//   node drive.js ls [subscriber]
//   node drive.js put <file> <subscriber>
//   node drive.js get <subscriber>/<name> <dest dir>
//   node drive.js share <subscriber> <email>     (makes the subfolder and shares it as editor)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RCLONE = path.join(os.homedir(), 'bin', 'rclone');
const REMOTE = 'subs';
const ROOT = 'מנויים';

const rc = (args, opts = {}) => execFileSync(RCLONE, args, { encoding: 'utf8', ...opts });
const at = sub => `${REMOTE}:${ROOT}${sub ? '/' + sub : ''}`;
const clean = s => {
  if (!s || /[\/\\]|^\.+$/.test(s)) throw new Error('bad subscriber name: ' + s);
  return s;
};

function setup(token) {
  JSON.parse(token);
  try { rc(['config', 'delete', REMOTE]); } catch {}
  rc(['config', 'create', REMOTE, 'drive', 'scope=drive', 'token=' + token, '--non-interactive']);
  rc(['mkdir', at()]);
  console.log('ok: ' + at());
}

async function share(sub, email) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('bad email: ' + email);
  rc(['mkdir', at(sub)]);
  const id = rc(['lsf', '--dirs-only', '--format', 'pi', '--separator', '\t', at()])
    .split('\n').map(l => l.split('\t')).find(([p]) => p === sub + '/');
  if (!id) throw new Error('folder not found after mkdir: ' + sub);
  rc(['about', REMOTE + ':']); // refreshes and saves the access token
  const conf = JSON.parse(rc(['config', 'dump']))[REMOTE];
  const { access_token } = JSON.parse(conf.token);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id[1]}/permissions?sendNotificationEmail=true`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + access_token, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }),
  });
  if (!r.ok) throw new Error('share failed: ' + r.status + ' ' + (await r.text()));
  console.log(`ok: ${sub} shared with ${email}\nhttps://drive.google.com/drive/folders/${id[1]}`);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (!fs.existsSync(RCLONE)) throw new Error('rclone missing at ' + RCLONE);
  if (cmd === 'setup') return setup(a);
  if (cmd === 'status') {
    try { rc(['lsf', '--max-depth', '1', at()], { stdio: ['ignore', 'pipe', 'pipe'] }); console.log('connected: ' + at()); }
    catch { console.log('not connected: run setup with a token from the PC'); process.exitCode = 1; }
    return;
  }
  if (cmd === 'ls') return void process.stdout.write(rc(['lsf', at(a && clean(a))]));
  if (cmd === 'put') return void rc(['copy', a, at(clean(b))], { stdio: 'inherit' });
  if (cmd === 'get') {
    const [sub, ...rest] = a.split('/');
    return void rc(['copy', at(clean(sub)) + '/' + rest.join('/'), b], { stdio: 'inherit' });
  }
  if (cmd === 'share') return share(clean(a), b);
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 13).join('\n'));
}

main().catch(e => { console.error(e.message); process.exit(1); });
