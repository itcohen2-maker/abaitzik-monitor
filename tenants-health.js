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
const cr = require('./lib/change-requests.js');

const DIR = path.join(inst.dataPath, 'tenants', 'tenants');
const DRY = process.argv.includes('--dry');
// The listener beats once an hour when idle; a file older than this means the
// beat stopped, whatever systemd says about the process.
const STALE_MS = 75 * 60 * 1000;

function active(unit) {
  try { return execFileSync('systemctl', ['is-active', unit], { encoding: 'utf8' }).trim() === 'active'; }
  catch (e) { return false; }
}

function paused(t) {
  try { return JSON.parse(fs.readFileSync(path.join(t.dir, 'instance.json'), 'utf8')).paused === true; }
  catch (e) { return false; }
}

function check(t) {
  // 8.10: on hold by Itzik's decision. Nothing runs, so nothing is broken, and
  // the doctor must not try to bring it back.
  if (paused(t)) return { state: 'ok', problems: [], beatAt: '', paused: true };
  const problems = [];
  if (t.listener && !active(t.listener)) problems.push('המאזין לא רץ');
  if (t.timer && !active(t.timer)) problems.push('המענה האוטומטי לא מתוזמן');
  // A tenant that stopped receiving fixes is broken in a way nobody sees.
  if (t.syncError) problems.push('העדכונים לא מגיעים אליו');
  // 29.9: a tenant that syncs itself reports in its own folder; no report for
  // an hour means its sync timer is not running, which is how Ilay's stayed
  // unsynced after the move to his own user.
  if (t.selfSync) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(t.dir, 'data', 'status', 'sync.json'), 'utf8'));
      if (s.syncError || !s.at || Date.now() - Date.parse(s.at) > 60 * 60 * 1000) problems.push('העדכונים לא מגיעים אליו');
    } catch (e) { problems.push('העדכונים לא מגיעים אליו'); }
  }
  let beatAt = '';
  try {
    const live = JSON.parse(fs.readFileSync(path.join(t.dir, 'data', 'status', 'live.json'), 'utf8'));
    beatAt = live.at || '';
    if (!beatAt || Date.now() - Date.parse(beatAt) > STALE_MS) problems.push('הפעימה של המאזין ישנה');
    // 30.9: `up` is seconds since the listener started, so a beat written right
    // after a restart says 0 and stays that way until the next hourly beat. That
    // read as "disconnected" for an hour. The connection is `since`, empty only
    // while the listener has no stream.
    if (!live.since && live.at && Date.now() - Date.parse(live.at) > 5 * 60 * 1000) problems.push('המאזין מדווח שהוא מנותק מהערוץ');
  } catch (e) { problems.push('אין קובץ פעימה'); }
  // 27.9: what the tenant's own watchdog found (answers stuck, a stalled worker)
  // colours his tile too, so Itzik sees it without opening anything of Ilay's.
  try {
    const w = JSON.parse(fs.readFileSync(path.join(t.dir, 'data', 'status', 'watchdog.json'), 'utf8'));
    if (w.at && Date.now() - Date.parse(w.at) < 10 * 60 * 1000) (w.problems || []).forEach((p) => problems.push(p));
    else if (w.at) problems.push('השומר לא רץ');
  } catch (e) {}
  return { state: problems.length ? 'down' : 'ok', problems, beatAt };
}

/*
  7.10: Yael's record was written by hand in another shape (no dir, no units),
  so she showed red every two hours while her monitor ran fine. A record that
  lacks them gets the names every tenant is built with (setup/new-tenant.sh).
*/
function complete(t) {
  const u = t.user || t.id;
  const d = { dir: '/home/' + u + '/' + t.id + '-monitor', listener: 'monitor-listen-' + t.id,
    timer: 'monitor-worker-' + t.id + '.timer', user: u };
  Object.keys(d).forEach((k) => { if (!t[k]) t[k] = d[k]; });
  if (t.selfSync === undefined) t.selfSync = true;
  return t;
}

/*
  7.10, Itzik: "אם אתה מקבל התראה על מוניטורים אחרים שלא עובדים, אתה אמור
  לטפל בהם". A customer down for ten minutes starts a Claude session in his
  repo with the faults, as the watchdog's doctor does for his own. One at a
  time, an hour apart, three a day.
*/
const FIX = path.join(inst.dataPath, 'status', 'tenant-doctor.json');
const FIX_AFTER_MS = 10 * 60 * 1000;
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function fixer(t, now) {
  if (DRY || process.platform === 'win32' || t.state === 'ok' || !t.downSince) return;
  if (now - Date.parse(t.downSince) < FIX_AFTER_MS) return;
  let d = { day: '', runs: 0, pid: 0, log: [] };
  try { d = JSON.parse(fs.readFileSync(FIX, 'utf8')); } catch (e) {}
  const day = new Date(now).toISOString().slice(0, 10);
  if (d.day !== day) { d.day = day; d.runs = 0; }
  const last = Date.parse(((d.log || []).slice(-1)[0] || {}).at);
  if ((d.pid && alive(d.pid)) || d.runs >= 3 || (!isNaN(last) && now - last < 60 * 60 * 1000)) return;
  const text = [
    'אתה מתקן אוטומטי. המוניטור של הלקוח ' + (t.title || t.id) + ' בנתק יותר מעשר דקות:',
    t.problems.map((p) => '- ' + p).join('\n'),
    'הרשומה שלו: data/tenants/tenants/' + t.id + '.json. התיקייה שלו: ' + t.dir + ' (יחידות: ' + t.listener + ', ' + t.timer + ').',
    'למצוא את הסיבה ולתקן. תיקון בקוד נעשה כאן ולא בתיקיית הלקוח (הסנכרון דורס). לא לגעת בהודעות ובנתונים של הלקוח.',
    'מה שדורש root (systemd, משתמשים, Caddy) שולחים למחשב: node pc-task.js add --re tenant-' + t.id + ' "<המשימה>".',
    'אחרי תיקון בקוד: npm test, ואז node push.js "tenant-doctor: <מה תוקן>".',
    'בסוף רשומה אחת לאיציק ב data/chat/chat/ (from "claude"), בעברית פשוטה, בלי מקפים: מה נשבר אצל מי ומה תוקן, שורה או שתיים.',
  ].join('\n');
  const { spawn } = require('child_process');
  let out = 'ignore';
  try { out = fs.openSync('/var/log/monitor-tenants.log', 'a'); } catch (e) {}
  const c = spawn('claude', ['-p', '--dangerously-skip-permissions'], { cwd: __dirname, detached: true, stdio: ['pipe', out, out], shell: true });
  c.stdin.end(text, 'utf8');
  c.unref();
  d.runs += 1; d.pid = c.pid;
  d.log = (d.log || []).concat([{ at: new Date(now).toISOString(), tenant: t.id, problems: t.problems }]).slice(-30);
  try { fs.writeFileSync(FIX, JSON.stringify(d, null, 1)); } catch (e) {}
  console.log('fixer started for ' + t.id);
}

/*
  8.10, Itzik: "תן לי התראה ברגע שרינת מתחילה לעבוד עם המוניטור שלה, אני רוצה
  לדעת מתי היא התקינה". A record with watchFirstUse (an ISO time) rings his
  phone once, on the first message that reached the tenant's listener after
  that time. Only the arrival times and texts the listener already exposes in
  data/status are read; a system test ("בדיקת מערכת") does not count.
*/
function firstUse(t) {
  if (!t.watchFirstUse || t.firstUseAt) return '';
  const after = Date.parse(t.watchFirstUse);
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(t.dir, 'data', 'status', f), 'utf8')); } catch (e) { return null; } };
  const pulls = read('pulls.json');
  const seen = Array.isArray(pulls) ? pulls : ((read('live.json') || {}).recent || []);
  const hit = seen.find((x) => x && Date.parse(x.at) > after && !/בדיקת מערכת/.test(x.text || ''));
  return hit ? hit.at : '';
}

function main() {
  if (!fs.existsSync(DIR)) { console.log('no tenants'); return; }
  let changed = false;
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
    const file = path.join(DIR, f);
    const t = complete(JSON.parse(fs.readFileSync(file, 'utf8')));
    const r = check(t);
    const before = t.state;
    /*
      5.10: a customer's change requests, which only Itzik can approve. A new
      one rings his phone; any change in them republishes his page.
    */
    const known = new Set((t.requests || []).map((x) => x.id));
    const reqs = t.dir ? cr.of(t.dir, t.id) : [];
    const fresh = reqs.filter((x) => x.status === 'pending' && !known.has(x.id));
    if (JSON.stringify(reqs) !== JSON.stringify(t.requests || [])) changed = true;
    t.requests = reqs;
    if (fresh.length && !DRY) {
      try {
        execFileSync('node', ['notify.js', '📨 ' + (t.title || t.id) + ' מבקש שינוי', fresh.map((x) => x.text).join(' · ').slice(0, 300)],
          { cwd: __dirname, stdio: 'ignore', timeout: 60000 });
      } catch (e) { console.log('request alert failed: ' + String(e.message).slice(0, 120)); }
    }
    delete t.paused;
    Object.assign(t, r, { checkedAt: new Date().toISOString() });
    if (r.state === 'ok') delete t.downSince; else if (!t.downSince) t.downSince = new Date().toISOString();
    if (!DRY) fs.writeFileSync(file, JSON.stringify(t, null, 1));
    if (before !== t.state) changed = true;
    /*
      30.9: a customer going down is an alarm, not a colour. The phone rings
      the moment it happens, again every two hours while it stays down, and
      once more when it is back, so a red tile never waits for him to look.
    */
    if (!DRY) {
      const down = t.state !== 'ok';
      const again = down && (!t.alertedAt || Date.now() - Date.parse(t.alertedAt) > 2 * 60 * 60 * 1000);
      if ((before && before !== t.state) || again) {
        const title = down ? '🔴 ' + (t.title || t.id) + ' בנתק' : '🟢 ' + (t.title || t.id) + ' חזר לתקין';
        const msg = down ? (r.problems.join(' · ') || 'לא עונה') : 'הכל תקין שוב';
        try {
          execFileSync('node', ['notify.js', title, msg], { cwd: __dirname, stdio: 'ignore', timeout: 60000 });
          if (down) t.alertedAt = new Date().toISOString(); else delete t.alertedAt;
          fs.writeFileSync(file, JSON.stringify(t, null, 1));
          console.log('alerted: ' + title);
        } catch (e) { console.log('alert failed: ' + String(e.message).slice(0, 120)); }
      }
    }
    const used = firstUse(t);
    if (used && !DRY) {
      try {
        execFileSync('node', ['notify.js', '🎉 ' + (t.title || t.id) + ': התחילה לעבוד',
          'ההודעה הראשונה הגיעה ' + new Date(used).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })],
          { cwd: __dirname, stdio: 'ignore', timeout: 60000 });
        t.firstUseAt = used;
        fs.writeFileSync(file, JSON.stringify(t, null, 1));
        changed = true;
        console.log('first use: ' + t.id);
      } catch (e) { console.log('first use alert failed: ' + String(e.message).slice(0, 120)); }
    }
    fixer(t, Date.now());
    console.log((t.state === 'ok' ? 'ok   ' : 'DOWN ') + t.id + (r.problems.length ? ': ' + r.problems.join(', ') : ''));
  }
  if (changed && !DRY) {
    // A colour change is worth a publish on its own; a same colour is not.
    /*
      Through push.js, never around it.

      The first version built and pushed on its own. A worker session that was
      pushing at the same second hit a conflict on the generated docs files
      and had to untangle it, which it reported on 25.9. push.js is the one
      queue every writer to this repository goes through; this is a writer.
    */
    try {
      execFileSync('node', ['push.js', 'tenants: health changed'], { cwd: __dirname, stdio: 'ignore', timeout: 240000 });
      console.log('published');
    } catch (e) { console.log('publish failed: ' + String(e.message).slice(0, 120)); }
  }
}

if (require.main === module) main();
module.exports = { check, complete, firstUse };
