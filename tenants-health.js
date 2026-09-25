'use strict';
/*
  Is the other monitor alive. Nothing else.

  Itzik, 25.9: "תכין כפתור אצלי עם המוניטור של איליי, אם הוא ירוק הוא תקין, אם
  יש נתק יהיה אדום". He does not want to see Ilay's content, and the
  separation makes sure he cannot: different key, different topics, different
  data folder. What he wants is one bit, green or red, and this is what
  produces it.

  It runs on the server, under Itzik's instance, every minute. For every
  tenant listed in data/tenants/tenants/<id>.json it checks three things that
  can each fail silently: the listener service is running, the listener's
  heartbeat file is fresh, and the worker timer is armed. It writes the result
  back into the same file, which the build carries to the page as a colour.
  When the colour changes it rebuilds and publishes, so red is on his phone
  within a minute of the failure and not at the next hourly beat.

  It reads only data/status/live.json from the tenant's folder: the heartbeat,
  no messages, no chat. Everything else is asked of systemd.

  Usage: node tenants-health.js [--dry]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const DIR = path.join(inst.dataPath, 'tenants', 'tenants');
const DRY = process.argv.includes('--dry');
// The listener beats once an hour when idle; a file older than this means the
// beat stopped, whatever systemd says about the process.
const STALE_MS = 75 * 60 * 1000;

function active(unit) {
  try { return execFileSync('systemctl', ['is-active', unit], { encoding: 'utf8' }).trim() === 'active'; }
  catch (e) { return false; }
}

function check(t) {
  const problems = [];
  if (t.listener && !active(t.listener)) problems.push('המאזין לא רץ');
  if (t.timer && !active(t.timer)) problems.push('המענה האוטומטי לא מתוזמן');
  let beatAt = '';
  try {
    const live = JSON.parse(fs.readFileSync(path.join(t.dir, 'data', 'status', 'live.json'), 'utf8'));
    beatAt = live.at || '';
    if (!beatAt || Date.now() - Date.parse(beatAt) > STALE_MS) problems.push('הפעימה של המאזין ישנה');
    if (live.up === 0 && live.at && Date.now() - Date.parse(live.at) > 5 * 60 * 1000) problems.push('המאזין מדווח שהוא מנותק מהערוץ');
  } catch (e) { problems.push('אין קובץ פעימה'); }
  return { state: problems.length ? 'down' : 'ok', problems, beatAt };
}

function main() {
  if (!fs.existsSync(DIR)) { console.log('no tenants'); return; }
  let changed = false;
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
    const file = path.join(DIR, f);
    const t = JSON.parse(fs.readFileSync(file, 'utf8'));
    const r = check(t);
    const before = t.state;
    Object.assign(t, r, { checkedAt: new Date().toISOString() });
    if (!DRY) fs.writeFileSync(file, JSON.stringify(t, null, 1));
    if (before !== t.state) changed = true;
    console.log((t.state === 'ok' ? 'ok   ' : 'DOWN ') + t.id + (r.problems.length ? ': ' + r.problems.join(', ') : ''));
  }
  if (changed && !DRY) {
    // A colour change is worth a publish on its own; a same colour is not.
    try {
      execFileSync('node', ['build.js'], { cwd: __dirname, stdio: 'ignore' });
      execFileSync('git', ['add', '-A', '--', 'docs'], { cwd: __dirname });
      execFileSync('git', ['commit', '-q', '-m', 'tenants: health changed'], { cwd: __dirname });
      execFileSync('git', ['push', '-q'], { cwd: __dirname });
      console.log('published');
    } catch (e) { console.log('publish failed: ' + String(e.message).slice(0, 120)); }
  }
}

if (require.main === module) main();
module.exports = { check };
