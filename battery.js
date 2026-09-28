'use strict';
/*
  Warns Itzik's phone before the laptop dies on battery.

  28.9.2026: the charger cable came loose in the night, the battery ran flat at
  06:48 and everything, remote control included, went down with it. Nobody knew
  until morning.

  Runs every 2 minutes from a scheduled task. It only speaks on a change, so a
  whole day costs a handful of messages out of the shared ntfy quota:
    cable pulled            one message
    under 20%, still off    one message
    under 10%, still off    one message
    cable back              one message (only if we warned about it)
  State lives in data/battery.json so a repeat run never repeats a message.

  Usage: node battery.js           check and notify on change
         node battery.js --status  print what it sees, send nothing
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ch = require('./lib/notify-channels.js');

const STATE = path.join(__dirname, 'data', 'battery.json');

function read() {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    '$b = Get-CimInstance Win32_Battery | Select-Object -First 1; ' +
    'if ($b) { "$($b.EstimatedChargeRemaining) $($b.BatteryStatus)" }'],
    { encoding: 'utf8', windowsHide: true }).trim();
  if (!out) return null;
  const [pct, status] = out.split(/\s+/).map(Number);
  // BatteryStatus 1 means discharging. Anything else means the cable is in.
  return { pct, onBattery: status === 1 };
}

function load() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; }
}

function log(msg) {
  console.log(new Date().toLocaleString('he-IL') + '  ' + msg);
}

(async () => {
  const b = read();
  if (!b) { log('אין סוללה, אין מה לבדוק'); return; }
  if (process.argv.includes('--status')) {
    console.log(b.pct + '% ' + (b.onBattery ? 'על סוללה' : 'מחובר לחשמל'));
    return;
  }

  const s = load();
  const next = { onBattery: b.onBattery, warned: s.warned || [], pct: b.pct, at: Date.now() };
  let title = null, body = null;

  if (b.onBattery) {
    if (!next.warned.includes('unplugged')) {
      title = 'המחשב על סוללה';
      body = 'החוט של המחשב לא מחובר. הסוללה על ' + b.pct + ' אחוז.';
      next.warned.push('unplugged');
    }
    if (b.pct < 20 && !next.warned.includes('20')) {
      title = 'הסוללה חלשה';
      body = 'המחשב על ' + b.pct + ' אחוז ולא מחובר לחשמל. כדאי לחבר את החוט.';
      next.warned.push('20');
    }
    if (b.pct < 10 && !next.warned.includes('10')) {
      title = 'המחשב עומד לכבות';
      body = 'נשארו ' + b.pct + ' אחוז בסוללה. בלי חשמל הוא יכבה בקרוב.';
      next.warned.push('10');
    }
  } else if (next.warned.length) {
    title = 'המחשב מחובר שוב';
    body = 'החוט חזר, המחשב נטען. הסוללה על ' + b.pct + ' אחוז.';
    next.warned = [];
  }

  if (title) {
    const r = await ch.notify(title, body);
    // A message that could not go out is queued by notify-channels, so the
    // state still advances: the queue owns the retry, not this script.
    log(title + ' | ' + (r.ok ? 'נשלח דרך ' + r.channel : 'לא נשלח, בתור: ' + r.tried.join(' | ')));
  }
  fs.writeFileSync(STATE, JSON.stringify(next, null, 2));
})().catch(e => { log('שגיאה: ' + e.message); process.exitCode = 1; });
