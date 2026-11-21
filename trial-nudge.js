'use strict';
/*
  12.11.2026, Itzik: the three trial week mails (rules and texts in lib/trial-nudge.js): not opened after a few
  hours, not back for two days, and the last day. Run as root at the end of setup/signup-provision.sh (every minute,
  with /etc/monitor.env for SMTP), so it reads each trial's home. Each mail goes once per trial; what went is kept in
  data/signup/nudges.json, and a mail that failed is tried again on the next run. Each sent mail is one line in
  Itzik's 📋 לטיפול.
  node trial-nudge.js [--dry] [--now <ISO>]   --dry prints what it would send, sends and writes nothing.
*/
const fs = require('fs');
const path = require('path');
const N = require('./lib/trial-nudge.js');
const HERE = __dirname;
const DATA = path.join(HERE, 'data');
const DRY = process.argv.includes('--dry');
const NOW = (() => { const i = process.argv.indexOf('--now'); return i > 0 ? Date.parse(process.argv[i + 1]) : Date.now(); })();
const SENT = path.join(DATA, 'signup', 'nudges.json');
function rd(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function say(s) { console.log(new Date(NOW).toISOString().slice(0, 16) + 'Z nudge ' + s); }
function home(id) { return '/home/' + id + '/' + id + '-monitor'; }

(async () => {
  const Q = path.join(DATA, 'signup', 'queue');
  let names = [];
  try { names = fs.readdirSync(Q).filter((n) => /^t[a-f0-9]{6}\.json$/.test(n)); } catch (e) { return; }
  const sent = rd(SENT, {});
  const sources = rd(path.join(DATA, 'cal', 'sources.json'), []);
  let changed = false;
  for (const n of names) {
    const q = rd(path.join(Q, n), null);
    if (!q || q.state !== 'ready' || !q.email || !q.host) continue;
    const id = q.id || n.slice(0, -5);
    if (!fs.existsSync(path.join(home(id), 'data'))) continue;
    const plan = rd('/srv/monitor-changes/' + id + '.plan.json', null);
    if (!plan || plan.plan !== 'trial' || !plan.start) continue; // paid already, or not a trial
    const start = Date.parse(plan.start);
    const ses = (rd(path.join(DATA, 'visits', id + '.json'), {}).sessions || []);
    const lastVisit = ses.reduce((m, s) => Math.max(m, s.last || s.start || 0), 0);
    const my = sent[id] || {};
    const k = N.decide({ start, days: 7, lastVisit, sent: my }, NOW);
    if (!k) continue;
    const src = sources.find((x) => x && x.name === id) || {};
    const mails = rd(path.join(home(id), 'data', 'biz-home', 'mail.json'), []);
    const since = (Array.isArray(mails) ? mails : []).filter((m) => Date.parse(m.at) > (k === 'lastDay' ? start : lastVisit));
    let used = 0;
    try { used = require('./lib/plan.js').usage(fs.readFileSync(path.join(home(id), 'data', 'status', 'usage.jsonl'), 'utf8'), { from: start, to: start + 7 * 864e5 }).actions; } catch (e) { used = 0; }
    const c = { name: q.name || '', url: 'https://' + q.host + '/', google: !!(src.step && src.mail), mails: since.length,
      urgent: since.filter((m) => m.tag === 'דחוף').length, daysLeft: Math.max(1, Math.ceil((start + 7 * 864e5 - NOW) / 864e5)),
      used, total: 40, endText: N.endText(start + 7 * 864e5) };
    const m = N.mail(k, c);
    if (DRY) { say(id + ' ' + k + ' → ' + q.email + '\n' + m.subject + '\n' + m.text); continue; }
    const r = await require('./lib/mailer.js').send(DATA, { to: q.email, subject: m.subject, text: m.text });
    if (!r.ok) { say(id + ' ' + k + ' failed: ' + (r.error || '')); continue; }
    my[k] = new Date(NOW).toISOString(); sent[id] = my; changed = true;
    say(id + ' ' + k + ' sent');
    const T = { noEntry: 'לא נכנס למוניטור כמה שעות אחרי ההרשמה, נשלחה לו תזכורת במייל', idle: 'לא נכנס יומיים, נשלחה לו תזכורת במייל', lastDay: 'יום אחרון לשבוע הניסיון, נשלח לו מייל עם ההצעה להמשיך' };
    // as monitor, never root: it writes Itzik's data and pushes his repo (the same way signup-provision.sh does)
    try {
      require('child_process').execFileSync('sudo', ['-u', 'monitor', 'node', '-e', 'require("./lib/handle.js").complete(JSON.parse(process.argv[1]))',
        JSON.stringify({ key: 'nudge-' + k + '-' + id, kind: 'lead', who: q.name || q.email, title: T[k], link: 'biz' })], { cwd: HERE, timeout: 30000, stdio: 'ignore' });
    } catch (e) { say(id + ' handle: ' + e.message.slice(0, 80)); }
  }
  if (changed) { fs.writeFileSync(SENT, JSON.stringify(sent, null, 1)); try { const o = fs.statSync(path.join(DATA, 'signup')); fs.chownSync(SENT, o.uid, o.gid); } catch (e) {} }
})();
