#!/usr/bin/env node
'use strict';
/*
  14.11.2026, Itzik: "אחרי שהוא משלם... אתה שולח לו לינק להתקנה והכל קורה בלי ההתערבות שלי".
  Run as root by monitor-addon-provision.timer every minute. wa-bridge.js addonDone leaves
  data/pay/provision/<tenant>-<kind>.json (state queued) after SUMIT confirmed the payment; this does
  what needs root, then tells the customer in his own monitor's chat:
    bank:        setup/enable-bank.sh <tenant> <bank> <kind> (his computer's key, the installer, a private
                 link that deletes itself after 48 hours), and a message with the link and three steps.
    accounting:  a request in his monitor's queue, so his monitor starts the connection with him.
  A failure is never silent: state failed, the reason kept, and Itzik gets one line.
  Log: /var/log/monitor-addon-provision.log
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = '/home/monitor/abaitzik-monitor';
const Q = path.join(REPO, 'data', 'pay', 'provision');
const LOG = '/var/log/monitor-addon-provision.log';
const SOFTWARE = require(path.join(REPO, 'lib', 'addons.js')).SOFTWARE;

function log(s) { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + s + '\n'); }
function rj(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function save(f, o) { fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(f + '.tmp', f); execFileSync('chown', ['monitor:monitor', f]); }

function tenantDir(id) {
  const t = rj(path.join(REPO, 'data', 'tenants', 'tenants', id + '.json'));
  return t && t.dir ? t.dir : '/home/' + id + '/' + id + '-monitor';
}
// A record in his chat. from claude: a message he reads. from itzik, status working: a request his monitor handles.
function chat(dir, from, text, status) {
  const cd = path.join(dir, 'data', 'chat', 'chat');
  const st = fs.statSync(cd);
  const pad = (n) => String(n).padStart(2, '0');
  const at = new Date();
  const base = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-' + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds()) + '-' + (from === 'claude' ? 'claude' : 'itzik') + '-addon';
  let name = base + '.json';
  for (let i = 2; fs.existsSync(path.join(cd, name)); i++) name = base + '-' + i + '.json';
  const id = 'ad-' + at.getTime().toString(36) + crypto.randomBytes(3).toString('hex');
  const rec = from === 'claude' ? { at: at.toISOString(), from: 'claude', text, status: 'done', id }
    : { at: at.toISOString(), from: 'itzik', text, status: status || 'new', id, auto: true, via: 'addon' };
  const f = path.join(cd, name);
  fs.writeFileSync(f + '.tmp', JSON.stringify(rec, null, 1), { mode: 0o664 });
  fs.renameSync(f + '.tmp', f);
  fs.chownSync(f, st.uid, st.gid);
  return id;
}
function tellItzik(title, text) {
  try { execFileSync('sudo', ['-u', 'monitor', 'node', path.join(REPO, 'notify.js'), title, text], { cwd: REPO, timeout: 30000, stdio: 'ignore' }); } catch (e) { log('notify failed: ' + e.message); }
}

function bank(job, dir) {
  const a = job.answers || {};
  if (!/^[a-z0-9-]{2,24}$/.test(a.bank || '') || !/^(private|business)$/.test(a.kind || '')) throw new Error('bad answers');
  const out = execFileSync('bash', [path.join(REPO, 'setup', 'enable-bank.sh'), job.tenant, a.bank, a.kind], { cwd: REPO, timeout: 300000, encoding: 'utf8' });
  const m = /^link:\s+200\s+(https:\/\/form\.it-solution\.co\.il\/p\/[a-f0-9]{20}\.zip)/m.exec(out);
  if (!m) throw new Error('no working link in enable-bank output: ' + out.split('\n').filter((l) => /^(link|key|route|note)/.test(l)).join(' | '));
  chat(dir, 'claude', [
    'חיבור הבנק מוכן. פעם אחת, במחשב שלך:',
    '1. פותחים את הקישור ומורידים את הקובץ: ' + m[1],
    '2. קליק ימני על הקובץ שירד, "חלץ הכל".',
    '3. לחיצה כפולה על Bank-Setup.',
    '',
    'מעכשיו, כשרוצים תנועות עדכניות, כותבים למוניטור בוואטסאפ: בנק',
    'במחשב נפתח חלון של הבנק, אתה נכנס בעצמך כרגיל, והמוניטור מוריד את התנועות של 90 הימים האחרונים ומתנתק לבד.',
    'הסיסמה והקוד מה SMS נשארים רק אצלך. אנחנו לא רואים ולא שומרים אותם.',
    'הקישור פעיל 48 שעות. אם הוא פג, כותבים כאן "קישור חדש לבנק".',
  ].join('\n'));
  return m[1];
}

function accounting(job, dir) {
  const sw = SOFTWARE[(job.answers || {}).software] || 'תוכנת הנהלת חשבונות';
  chat(dir, 'itzik', [
    'חיבור להנהלת חשבונות (תוספת ששולמה עכשיו)',
    'הלקוח שילם על חיבור להנהלת חשבונות. התוכנה שלו: ' + sw + '.',
    'תתחיל את החיבור איתו עכשיו: תסביר לו בשתיים שלוש שורות פשוטות מה צריך ממנו כדי לחבר את ' + sw + ' לקריאה בלבד,',
    'ומה הוא יקבל (חשבוניות, קבלות, מי חייב לו). בלי לבקש סיסמה בצ׳אט. אם זו תוכנה שאין לנו חיבור אליה, תגיד לו בכנות',
    'שנחבר דרך ייצוא קובץ, ותסביר איך מייצאים.',
  ].join('\n'), 'new');
  return sw;
}

function main() {
  let files = [];
  try { files = fs.readdirSync(Q).filter((f) => /^[a-z0-9-]+-(bank|accounting)\.json$/.test(f)); } catch (e) { return; }
  for (const f of files) {
    const file = path.join(Q, f);
    const job = rj(file);
    if (!job || job.state !== 'queued') continue;
    if (!/^[a-z0-9-]{1,32}$/.test(job.tenant || '') || job.tenant === 'abaitzik') { job.state = 'bad'; save(file, job); continue; }
    job.state = 'running'; job.startedAt = new Date().toISOString(); save(file, job);
    try {
      const dir = tenantDir(job.tenant);
      job.result = job.kind === 'bank' ? bank(job, dir) : accounting(job, dir);
      job.state = 'done'; job.doneAt = new Date().toISOString();
      log(job.tenant + ' ' + job.kind + ' done ' + job.result);
    } catch (e) {
      job.state = 'failed'; job.error = String(e.message).slice(0, 400);
      log(job.tenant + ' ' + job.kind + ' FAILED ' + job.error);
      tellItzik('תוספת ששולמה לא נפתחה', job.tenant + ': ' + (job.kind === 'bank' ? 'חיבור לבנק' : 'הנהלת חשבונות') + '. ' + job.error.slice(0, 160));
    }
    save(file, job);
  }
}

if (require.main === module) {
  const lock = '/run/monitor-addon-provision.lock';
  let fd; try { fd = fs.openSync(lock, 'wx'); } catch (e) {
    try { if (Date.now() - fs.statSync(lock).mtimeMs > 15 * 60 * 1000) fs.unlinkSync(lock); } catch (x) {}
    process.exit(0);
  }
  try { main(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
module.exports = { main };
