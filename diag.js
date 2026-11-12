'use strict';
/*
  12.11.2026, Itzik: "האבחון חייב להיות אוטומטי לגמרי, אל תכניס אותי לעבודה שאני לא מבין בה".
  The runner of the free AI diagnosis (it-solution.co.il/ai). wa-bridge.js queues every form in data/diag/queue/;
  this turns each into one mail from info@it-solution.co.il: a reader with NO tools (claude -p --model sonnet --tools "")
  gets the stranger's answers as quoted data and writes the diagnosis, lib/diag.js checks it, the mailer sends it, the
  lead in data/biz/biz gets it, Itzik gets one line push. An answer that fails the check twice is never sent: it becomes
  a 📋 לטיפול item for Itzik. At most 20 a day, the rest wait in the queue marked held.
  Timer monitor-diag.timer every minute (setup/monitor-diag.service). Log /var/log/monitor-diag.log.
  Itzik's own instance only. Nothing starts without SMTP settings, so no model call is spent on a mail that cannot go out.

  Usage: node diag.js           one pass
         node diag.js --dry     prints the queue and what it would do, calls nothing
*/
const { spawn, execFile } = require('child_process');
const path = require('path');
const inst = require('./lib/instance.js');
const D = require('./lib/diag.js');

const DRY = process.argv.includes('--dry');
const log = (s) => console.log(new Date().toISOString() + ' ' + s);

// The reader. Same environment handling as mail-read.js (the OAuth token from /etc/monitor.env when run from a session or
// a unit), same login marker for the watchdog. cwd is the data folder of the queue, never the code.
function model(prompt) {
  const R = require('./mail-read.js');
  return new Promise((resolve, reject) => {
    const child = spawn('claude', D.modelArgs(), { cwd: path.join(inst.dataPath, 'diag'), env: R.childEnv() });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('timeout')); }, 4 * 60 * 1000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const msg = err.trim() || out.trim();
      if (code !== 0) {
        if (R.LOGIN_REFUSED.test(msg)) R.markLogin(false, msg.slice(-200));
        return reject(new Error('claude exited ' + code + ': ' + msg.slice(-200)));
      }
      R.markLogin(true);
      resolve(out.trim());
    });
    child.stdin.end(prompt);
  });
}

function notify(title, text) {
  execFile(process.execPath, [path.join(__dirname, 'notify.js'), title, text], { cwd: __dirname, timeout: 60000 }, (e) => { if (e) log('notify failed: ' + e.message); });
}

async function main() {
  if (inst.name !== 'abaitzik') return log('not the owner instance, nothing to do');
  const M = require('./lib/mailer.js');
  const fs = require('fs');
  fs.mkdirSync(D.dirOf(inst.dataPath, 'queue'), { recursive: true });
  const left = fs.readdirSync(D.dirOf(inst.dataPath, 'queue')).filter((f) => f.endsWith('.json'));
  if (DRY) return log('queue ' + left.length + ', sent today ' + D.sentToday(inst.dataPath, Date.now()) + ' of ' + D.DAILY_MAX + ', smtp ' + (M.ready() ? 'set' : 'missing'));
  if (!left.length) return;
  if (!M.ready()) return log('no SMTP settings, the queue (' + left.length + ') waits');
  const H = require('./lib/handle.js');
  const r = await D.run(inst.dataPath, {
    model,
    mail: (m) => M.send(inst.dataPath, m),
    notify,
    handle: (o) => H.complete(o),
    log,
  });
  log('pass: ' + JSON.stringify(r));
}

main().catch((e) => { log('diag failed: ' + String(e.message || e).slice(0, 300)); process.exitCode = 1; });
