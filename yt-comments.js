'use strict';
/*
  12.11.2026: reads the public YouTube comments of every monitor that gave a channel in 🔌 חיבורים
  (lib/yt-comments.js). Runs as root from monitor-yt.timer every 15 minutes: it writes into each customer's own
  data/yt as that customer's user, and rebuilds only a monitor whose comments changed.
    node yt-comments.js [--dry] [--only <name>]
  Needs YT_API_KEY (/etc/monitor.env). Log: /var/log/monitor-yt.log
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Y = require('./lib/yt-comments.js');

const REPO = __dirname;
const DATA = path.join(REPO, 'data');
const DRY = process.argv.includes('--dry');
const oi = process.argv.indexOf('--only'), ONLY = oi > 0 ? process.argv[oi + 1] : '';
const log = (s) => console.log(new Date().toISOString().slice(11, 19) + '  ' + s);

function targets() {
  const out = [{ name: 'abaitzik', dir: REPO, data: DATA, owner: true }];
  let all = {}; try { all = JSON.parse(fs.readFileSync(path.join(DATA, 'fastchat', 'tenants.json'), 'utf8')) || {}; } catch (e) {}
  for (const n of Object.keys(all)) { const t = all[n]; if (t && t.dir && n !== 'demo' && fs.existsSync(path.join(t.dir, 'data'))) out.push({ name: n, dir: t.dir, data: path.join(t.dir, 'data') }); }
  return out.filter((t) => !ONLY || t.name === ONLY);
}

async function main() {
  const key = String(process.env.YT_API_KEY || '').trim();
  if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(key)) { log('no YT_API_KEY'); process.exit(1); }
  for (const t of targets()) {
    if (!fs.existsSync(path.join(t.data, 'yt', 'channel.json'))) continue;
    const st = fs.statSync(t.data);
    const chown = (f) => { try { fs.chownSync(f, st.uid, st.gid); fs.chmodSync(f, 0o640); } catch (e) {} };
    let r;
    try { r = DRY ? { changed: false, dry: true } : await Y.run(t.data, key, { chown }); }
    catch (e) { log(t.name + ': ' + e.message); continue; }
    if (DRY) { log(t.name + ': ' + JSON.stringify(Y.forPage(t.data) && Y.forPage(t.data).ch)); continue; }
    if (r.err) log(t.name + ': ' + r.err);
    if (!r.changed) continue;
    log(t.name + ': changed, rebuilding');
    try {
      const args = t.owner ? ['push.js', 'yt comments'] : ['build.js'];
      execFileSync('sudo', ['-u', '#' + st.uid, '-H', process.execPath].concat(args), { cwd: t.dir, timeout: 600000, stdio: 'ignore' });
      if (!t.owner) execFileSync('chmod', ['-R', 'o+rX', path.join(t.dir, 'docs')]);
    } catch (e) { log(t.name + ': build failed ' + String(e.message).split('\n')[0].slice(0, 100)); }
  }
}
main().catch((e) => { log('fatal ' + e.message); process.exit(1); });
