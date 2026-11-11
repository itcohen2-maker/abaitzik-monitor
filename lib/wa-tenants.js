'use strict';
/*
  11.11.2026, Itzik: "למה שלא נבנה את זה עכשיו? הוואטסאפ זה כל הקטע".
  One IT Solution WhatsApp number for every customer monitor. The customer writes to that number, and what he writes
  goes into HIS OWN monitor's request queue; the answer comes back to him on the same chat.

  data/wa-tenants.json (600, never in git):
    { "9725XXXXXXXX": { tenant: "t1a2b3c", dir: "/home/t1a2b3c/t1a2b3c-monitor", name, at, approved: false } }
  Itzik's own numbers stay on `allow` in data/wa.json and are checked first; a customer's number is never put there.

  Meta's test number: replies go only to approved recipients (up to 5, added by hand in the App Dashboard, WhatsApp,
  API Setup, "To", with a code Meta sends to that phone). `approved:false` means it waits for that; messages still
  reach his monitor, the reply just cannot go out yet. When the verified number arrives: phoneId and token in
  data/wa.json change, nothing here, and there is no recipient list any more.

  CLI (root, it sets the folder permissions):
    node lib/wa-tenants.js add <phone> <tenant> [name]     map a number to a customer monitor
    node lib/wa-tenants.js approved <phone>                 Itzik added it in Meta, replies can go out
    node lib/wa-tenants.js list
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function file(DATA) { return path.join(DATA, 'wa-tenants.json'); }
// 052-1234567, 0521234567, +972 52 123 4567 -> 972521234567; anything else -> ''
function norm(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(d)) d = '972' + d.slice(1);
  return /^9725\d{8}$/.test(d) ? d : '';
}
function all(DATA) { try { return JSON.parse(fs.readFileSync(file(DATA), 'utf8')) || {}; } catch (e) { return {}; } }
function save(DATA, o) {
  const f = file(DATA);
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { mode: 0o600 });
  fs.renameSync(f + '.tmp', f);
}
function lookup(DATA, from) { const t = all(DATA)[String(from || '')]; return t && t.tenant && t.dir ? t : null; }
function homeOf(tenant) { return '/home/' + tenant + '/' + tenant + '-monitor'; }
function add(DATA, phone, o) {
  const n = norm(phone);
  if (!n || !o || !/^[a-z][a-z0-9]{1,30}$/.test(String(o.tenant || ''))) return '';
  const a = all(DATA);
  a[n] = Object.assign({ approved: false }, a[n] || {}, o, { dir: o.dir || homeOf(o.tenant), at: (a[n] && a[n].at) || new Date().toISOString() });
  save(DATA, a);
  return n;
}
function chatDir(t) { return path.join(t.dir, 'data', 'chat', 'chat'); }
function forwarded(m) { return !!(m && m.context && (m.context.forwarded || m.context.frequently_forwarded)); }

// The request his monitor's worker gets. A forwarded message is someone else's words: keep it, list it, draft, send nothing.
function request(fw, text) {
  if (!fw) return text;
  return '↪ הודעה שהעברתי לך מהוואטסאפ, מלקוח או ממישהו אחר:' + '\n"' + text + '"\n\n'
    + 'תרשום אותה ב 📋 לטיפול: מי כתב, מה הוא מבקש ועד מתי צריך לחזור אליו. תכין לי טיוטת תשובה. לא שולחים לו כלום בלי אישור שלי.';
}

// Into his queue, the way the page itself writes a request (status working, the worker picks it up within a minute).
function write(t, kind, text, files) {
  const dir = chatDir(t);
  const pad = (n) => String(n).padStart(2, '0');
  const at = new Date();
  const base = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-' + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds()) + '-itzik-auto';
  let name = base + '.json';
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = base + '-' + i + '.json';
  const id = 'wa-' + at.getTime().toString(36) + crypto.randomBytes(3).toString('hex');
  const rec = { at: at.toISOString(), from: 'itzik', text: kind + '\n' + text, status: 'working', ackAt: at.toISOString(), id, auto: true, via: 'wa-bridge' };
  if (files && files.length) rec.files = files; // 11.11: a file from WhatsApp, in his data/inbox (lib/wa-media.js)
  fs.writeFileSync(path.join(dir, name + '.tmp'), JSON.stringify(rec, null, 1), { encoding: 'utf8', mode: 0o664 });
  fs.renameSync(path.join(dir, name + '.tmp'), path.join(dir, name));
  return id;
}

// A forwarded message is also a line in his 📋 לטיפול right away, without waiting for the worker.
function handleItem(t, mid, text, who) {
  try {
    return require('./handle.js').add(path.join(t.dir, 'data'), { key: 'wa-fwd-' + mid, kind: 'request', who: who || 'וואטסאפ',
      title: 'הועבר בוואטסאפ: ' + String(text).replace(/\s+/g, ' ').slice(0, 120), link: 'answers' }).created;
  } catch (e) { return false; }
}

// Root only: let the bridge (user monitor) write his queue and his 📋, read his answers, and show 📋 on his home.
function grant(t) {
  const d = t.dir;
  const acl = (args) => execFileSync('setfacl', args, { stdio: 'ignore' });
  fs.mkdirSync(path.join(d, 'data', 'handle', 'handle'), { recursive: true });
  try { execFileSync('chown', ['-R', t.tenant + ':' + t.tenant, path.join(d, 'data', 'handle')]); } catch (e) {}
  fs.mkdirSync(path.join(d, 'data', 'inbox'), { recursive: true });
  try { execFileSync('chown', [t.tenant + ':' + t.tenant, path.join(d, 'data', 'inbox')]); } catch (e) {}
  [d, path.join(d, 'data'), path.join(d, 'data', 'chat'), path.join(d, 'data', 'handle')].forEach((x) => acl(['-m', 'u:monitor:x', x]));
  // 11.11: data/inbox too, so a file sent on WhatsApp lands where a page upload does (lib/wa-media.js).
  [path.join(d, 'data', 'chat', 'chat'), path.join(d, 'data', 'handle', 'handle'), path.join(d, 'data', 'inbox')].forEach((x) => {
    acl(['-m', 'u:monitor:rwx', x]);
    acl(['-d', '-m', 'u:monitor:rw,u:' + t.tenant + ':rw', x]);
    try { execFileSync('sh', ['-c', 'for f in "$1"/*.json; do [ -f "$f" ] && setfacl -m u:monitor:rw "$f"; done; true', 'x', x], { stdio: 'ignore' }); } catch (e) {}
  });
  // instance.json is immutable (chattr +i); handle:true turns on 📋 לטיפול on his home (build.js).
  const inf = path.join(d, 'instance.json');
  let j = null; try { j = JSON.parse(fs.readFileSync(inf, 'utf8')); } catch (e) {}
  if (j && j.handle !== true) {
    let locked = false;
    try { locked = /i/.test(execFileSync('lsattr', ['-d', inf], { encoding: 'utf8' }).split(' ')[0]); } catch (e) {}
    try { if (locked) execFileSync('chattr', ['-i', inf]); j.handle = true; fs.writeFileSync(inf, JSON.stringify(j, null, 2) + '\n'); }
    finally { if (locked) try { execFileSync('chattr', ['+i', inf]); } catch (e) {} }
  }
}

module.exports = { norm, all, lookup, add, write, request, forwarded, handleItem, grant, homeOf, chatDir };

if (require.main === module) {
  const DATA = path.join(__dirname, '..', 'data');
  const [cmd, a, b, c] = process.argv.slice(2);
  if (cmd === 'add') {
    const n = add(DATA, a, { tenant: b, name: c || b });
    if (!n) { console.error('bad phone or tenant'); process.exit(1); }
    try { execFileSync('chown', ['monitor:monitor', file(DATA)]); } catch (e) {}
    try { grant(lookup(DATA, n)); } catch (e) { console.error('grant: ' + e.message); }
    console.log('mapped ' + n.slice(0, 5) + '... -> ' + b);
  } else if (cmd === 'approved') {
    const all0 = all(DATA), n = norm(a);
    if (!all0[n]) { console.error('not mapped'); process.exit(1); }
    all0[n].approved = true; save(DATA, all0); console.log('approved');
  } else {
    const x = all(DATA);
    Object.keys(x).forEach((k) => console.log(k.slice(0, 5) + '...' + k.slice(-2), x[k].tenant, x[k].approved ? 'approved' : 'waiting'));
  }
}
