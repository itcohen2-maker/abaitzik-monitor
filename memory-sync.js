'use strict';
/*
  The server's sessions know what this PC knows.

  Itzik, 27.9: "השרת לא יודע עלינו כלום". Since 25.9 his messages are answered
  by Claude sessions on the server, and those sessions had an empty memory: they
  asked him for the shopping list link that was already written down here, and
  told him there was no earlier work on the receipts when there was a whole
  folder of it. The memory lives on this PC, so this copies it across.

  It mirrors the PC memory folder into the auto memory folder of the server
  sessions of his instance only (never a customer's), as a whole: a file deleted
  here is deleted there. It runs every fifteen minutes from a hidden scheduled
  task and does nothing when no file changed since the last copy.

  Usage: node memory-sync.js [--force]
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SRC = 'C:/Users/User/.claude/projects/C--Users-User/memory';
const KEY = 'C:/Users/User/.ssh/monitor_server';
const HOST = 'root@178.105.63.97';
const DEST = '/home/monitor/.claude/projects/-home-monitor-abaitzik-monitor/memory';
const STATE = path.join(__dirname, 'data', 'status', 'memory-sync.json');
const FORCE = process.argv.includes('--force');

function say(s) { console.log(new Date().toTimeString().slice(0, 8) + '  ' + s); }

function hashDir() {
  const h = crypto.createHash('sha256');
  const names = fs.readdirSync(SRC).filter((n) => fs.statSync(path.join(SRC, n)).isFile()).sort();
  names.forEach((n) => { h.update(n); h.update('\0'); h.update(fs.readFileSync(path.join(SRC, n))); h.update('\0'); });
  return { hash: h.digest('hex'), count: names.length };
}

function readState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } }

function main() {
  const { hash, count } = hashDir();
  const st = readState();
  if (!FORCE && st.hash === hash) { say('אין שינוי בזיכרון (' + count + ' קבצים).'); return; }
  const remote = 'set -e; D=' + DEST + '; rm -rf "$D.new"; mkdir -p "$D.new"; tar -xf - -C "$D.new";'
    + ' chown -R monitor:monitor "$D.new"; rm -rf "$D.old"; [ -d "$D" ] && mv "$D" "$D.old"; mv "$D.new" "$D"; rm -rf "$D.old";'
    + ' ls "$D" | wc -l';
  const tar = spawn('tar', ['-cf', '-', '-C', SRC, '.'], { windowsHide: true });
  const ssh = spawn('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', HOST, remote], { windowsHide: true });
  tar.stdout.pipe(ssh.stdin);
  let out = '', err = '';
  ssh.stdout.on('data', (b) => { out += b; });
  ssh.stderr.on('data', (b) => { err += b; });
  tar.stderr.on('data', (b) => { err += b; });
  ssh.on('close', (code) => {
    const got = parseInt(String(out).trim(), 10);
    if (code === 0 && got === count) {
      fs.mkdirSync(path.dirname(STATE), { recursive: true });
      fs.writeFileSync(STATE, JSON.stringify({ hash, count, at: new Date().toISOString() }, null, 1));
      say('הזיכרון הועתק לשרת: ' + count + ' קבצים.');
    } else {
      say('!! ההעתקה נכשלה (קוד ' + code + ', בשרת ' + out.trim() + ' מתוך ' + count + '): ' + err.trim().slice(0, 300));
      process.exitCode = 1;
    }
  });
}

main();
