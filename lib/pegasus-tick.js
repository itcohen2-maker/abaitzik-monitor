'use strict';
/*
  Pegasus while the PC is off (Itzik, 1.10: "גם אם המחשב מכובה יש לנו את השרת").
  No sudo here for a timer of its own, so the worker, already every minute,
  starts pegasus-server.js every ten. It rides on the worker and not on the
  watchdog because only the worker's unit has KillMode=process: a child of the
  watchdog is killed the moment the watchdog exits. pegasus-server.js decides
  alone: it exits at once while the PC is awake, and holds its own lock and caps.
  Only where a Pegasus clone sits next to the monitor, which is Itzik's server.
*/
const fs = require('fs');
const path = require('path');
const inst = require('./instance.js');

const ROOT = path.join(__dirname, '..');
const EVERY_MS = 10 * 60 * 1000;

function tick(now) {
  if (process.platform === 'win32') return;
  if (!fs.existsSync(path.join(ROOT, '..', 'pegasus', '.git'))) return;
  const status = path.join(inst.dataPath, 'status');
  const last = path.join(status, 'pegasus-tick.json');
  let at = '';
  try { at = JSON.parse(fs.readFileSync(last, 'utf8')).at; } catch (e) {}
  if (at && now - Date.parse(at) < EVERY_MS - 30 * 1000) return;
  try { fs.writeFileSync(last, JSON.stringify({ at: new Date(now).toISOString() })); } catch (e) { return; }
  let out = 'ignore';
  try { out = fs.openSync(path.join(status, 'pegasus-server.log'), 'a'); } catch (e) {}
  const c = require('child_process').spawn(process.execPath, [path.join(ROOT, 'pegasus-server.js')],
    { cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
  c.unref();
}

module.exports = { tick };
