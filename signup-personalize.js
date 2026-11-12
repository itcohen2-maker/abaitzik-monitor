'use strict';
/*
  11.11.2026, Itzik: "שאלון אפיון ... המשהו אישי הזה שיהיה רק בשבילו" and "צריך לתת לו את טופס החיבורים, בתוך המוניטור".
  Run as root by setup/signup-provision.sh after every pass (every minute). For each self signup trial:
   1. connections: once the monitor exists, a personal setup page from the clean template (data/setup/<tok>.def.json)
      and a line in data/cal/sources.json, so 🔌 חיבורים in his monitor has its buttons (cal-sync copies the steps in).
   2. the questionnaire (queue profile, from the signup page): his welcome plan in "תשובות", a section in his
      profile.md, his monitor rebuilt, and one line in Itzik's 📋 לטיפול. Once per answers (personalized).
  --dry prints what it would do.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const P = require('./lib/signup-profile.js');

const DRY = process.argv.includes('--dry');
const REPO = __dirname;
const DATA = path.join(REPO, 'data');
const Q = path.join(DATA, 'signup', 'queue');
const TEMPLATE = '97353be7657c22ee625e';
const LOG = '/var/log/monitor-signup.log';

function log(s) { const l = new Date().toISOString().slice(0, 19) + 'Z personalize ' + s; if (DRY) console.log(l); else try { fs.appendFileSync(LOG, l + '\n'); } catch (e) { console.log(l); } }
function rd(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function wr(f, j, owner) {
  if (DRY) return;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(j, null, 1)); fs.renameSync(f + '.tmp', f);
  if (owner) try { execFileSync('chown', [owner + ':' + owner, f]); } catch (e) {}
}
function home(id) { return '/home/' + id + '/' + id + '-monitor'; }

function connections(q, qf) {
  if (q.setup) return;
  const def = rd(path.join(DATA, 'setup', TEMPLATE + '.def.json'), null);
  if (!def) { log(q.id + ' no connections template'); return; }
  const tok = crypto.randomBytes(10).toString('hex');
  def.client = q.name || q.id;
  wr(path.join(DATA, 'setup', tok + '.def.json'), def, 'monitor');
  const sf = path.join(DATA, 'cal', 'sources.json');
  const src = rd(sf, []);
  if (Array.isArray(src) && !src.some((x) => x && x.name === q.id)) { src.push({ name: q.id, setup: tok, tenant: true }); wr(sf, src, 'monitor'); }
  q.setup = tok; wr(qf, q, 'monitor');
  log(q.id + ' connections page ready');
}

function personalize(q, qf) {
  const p = q.profile;
  if (!p || q.personalized === p.at) return;
  const dir = home(q.id);
  if (!fs.existsSync(path.join(dir, 'data'))) return;
  const w = P.welcome(q.name, p);
  const at = new Date().toISOString();
  const stamp = at.replace(/\D/g, '').slice(0, 12);
  wr(path.join(dir, 'data', 'reports', 'reports', stamp + '-welcome.json'), { at, title: w.title, body: w.body }, q.id);
  const pf = path.join(dir, 'data', 'profile.md');
  if (!DRY) {
    let locked = false;
    try { locked = /i/.test(execFileSync('lsattr', ['-d', pf], { encoding: 'utf8' }).split(' ')[0]); } catch (e) {}
    try {
      if (locked) execFileSync('chattr', ['-i', pf]);
      const cur = fs.existsSync(pf) ? fs.readFileSync(pf, 'utf8') : '# ' + q.name + '\n';
      fs.writeFileSync(pf, cur.replace(/\n## מטופס האפיון בהרשמה[\s\S]*$/, '\n').replace(/\n*$/, '\n') + P.profileSection(p));
      execFileSync('chown', [q.id + ':' + q.id, pf]);
    } catch (e) { log(q.id + ' profile.md: ' + e.message); }
    finally { if (locked) try { execFileSync('chattr', ['+i', pf]); } catch (e) {} }
    // 12.11.2026, the longer questionnaire: the 🏡 personal tiles he picked, and a morning reminder at the hour his day starts.
    // Written as root into his folder, then handed to his user. Once per answers, like the rest of this function.
    try {
      const dataDir = path.join(dir, 'data');
      if (p.personal && p.personal.length) {
        require('./lib/personal.js').setPicked(dataDir, p.personal.join(','));
        execFileSync('chown', ['-R', q.id + ':' + q.id, path.join(dataDir, 'personal')]);
      }
      if (p.start && !q.morningRoutine) {
        const R = require('./lib/routines.js');
        const r = R.add(dataDir, { text: 'בוקר טוב. פותחים את המוניטור ורואים מה יש לך היום', kind: 'remind', sched: { freq: 'daily', hm: P.START[p.start] } });
        if (r.ok) { q.morningRoutine = r.rec.id; execFileSync('chown', ['-R', q.id + ':' + q.id, path.join(dataDir, 'routines')]); }
      }
    } catch (e) { log(q.id + ' personal/morning: ' + e.message.slice(0, 80)); }
    try { execFileSync('sudo', ['-u', q.id, '-H', 'node', 'build.js'], { cwd: dir, stdio: 'ignore', timeout: 180000 }); } catch (e) { log(q.id + ' build: ' + e.message.slice(0, 80)); }
    try { execFileSync('sudo', ['-u', 'monitor', 'node', '-e', 'require("./lib/handle.js").complete({key:"signup-profile-"+process.argv[1],kind:"lead",who:process.argv[2],title:process.argv[3],link:"biz"})', q.id, q.name, P.summaryLine(q.name, p)], { cwd: REPO, stdio: 'ignore' }); } catch (e) {}
  }
  q.personalized = p.at; wr(qf, q, 'monitor');
  log(q.id + ' welcome written' + (DRY ? ' (dry): ' + w.title : ''));
}

// 11.11: he chose WhatsApp and gave his mobile: map it to his monitor (lib/wa-tenants.js), open his queue to the bridge,
// and ask Itzik to approve the number on Meta's test number (by hand, Meta sends that phone a code). Once per number.
function whatsapp(q, qf) {
  const p = q.profile;
  if (!p || p.talk !== 'wa' || !p.waPhone || q.waMapped === p.waPhone) return;
  const dir = home(q.id);
  if (!fs.existsSync(path.join(dir, 'data'))) return;
  const WT = require('./lib/wa-tenants.js');
  if (DRY) { log(q.id + ' whatsapp (dry) ' + p.waPhone.slice(0, 5) + '...'); return; }
  const n = WT.add(DATA, p.waPhone, { tenant: q.id, dir, name: q.name || q.id });
  if (!n) return;
  try { execFileSync('chown', ['monitor:monitor', path.join(DATA, 'wa-tenants.json')]); } catch (e) {}
  try { WT.grant(WT.lookup(DATA, n)); } catch (e) { log(q.id + ' whatsapp grant: ' + e.message); }
  try { execFileSync('sudo', ['-u', 'monitor', 'node', '-e', 'require("./lib/handle.js").complete({key:"wa-approve-"+process.argv[1],kind:"request",who:process.argv[2],title:"להוסיף את "+process.argv[2]+" ("+process.argv[3]+") למספרים המאושרים בוואטסאפ. אחרי זה: node lib/wa-tenants.js approved "+process.argv[3],link:"biz"})', q.id, q.name || q.id, '0' + n.slice(3)], { cwd: REPO, stdio: 'ignore' }); } catch (e) {}
  q.waMapped = p.waPhone; wr(qf, q, 'monitor');
  log(q.id + ' whatsapp mapped');
}

let names = [];
try { names = fs.readdirSync(Q).filter((n) => /^t[a-f0-9]{6}\.json$/.test(n)); } catch (e) { process.exit(0); }
for (const n of names) {
  const qf = path.join(Q, n), q = rd(qf, null);
  if (!q || !/^t[a-f0-9]{6}$/.test(q.id)) continue;
  if (!['ready', 'mailfail'].includes(q.state)) continue;
  try { connections(q, qf); } catch (e) { log(q.id + ' connections: ' + e.message); }
  try { personalize(q, qf); } catch (e) { log(q.id + ' personalize: ' + e.message); }
  try { whatsapp(q, qf); } catch (e) { log(q.id + ' whatsapp: ' + e.message); }
}
