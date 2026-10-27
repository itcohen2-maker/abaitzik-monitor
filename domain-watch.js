'use strict';
/*
  27.10.2026, Itzik: "שים לך תזכורת לבדוק כל כמה זמן האם יש אישור".
  it-solution.co.il was bought at LiveDNS and pointed to Vercel's name servers,
  but the .il registry holds a new domain (serverHold) until it is checked.
  Every half hour (cron, no Claude) this asks a public resolver for the
  domain and then the site itself. Once the site answers, it writes one chat
  line, pushes once, and marks itself done so it never speaks again.
*/
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DOMAIN = 'it-solution.co.il';
const DONE = path.join(ROOT, 'data', 'status', 'domain-watch-done.json');

async function main() {
  if (fs.existsSync(DONE)) return;
  const r = new dns.Resolver(); r.setServers(['8.8.8.8', '1.1.1.1']);
  let ips = [];
  try { ips = await r.resolve4(DOMAIN); } catch { return console.log(new Date().toISOString(), 'not in DNS yet'); }
  let status = 0;
  try { status = (await fetch('https://' + DOMAIN + '/', { redirect: 'follow', signal: AbortSignal.timeout(20000) })).status; } catch (e) { return console.log(new Date().toISOString(), 'DNS ok', ips.join(','), 'site not answering yet:', e.message); }
  if (status !== 200) return console.log(new Date().toISOString(), 'DNS ok, site status', status);
  const at = new Date();
  const stamp = at.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  const line = { at: at.toISOString(), from: 'claude', text: 'הדומיין שוחרר: האתר נפתח בכתובת https://' + DOMAIN + ' 🎉\nאפשר להמשיך בממומן. הקישור לצ׳אט במודעות: https://' + DOMAIN + '/#chat\nבסשן הבא: להחליף את הקישור במודעות ולהקים את המייל info@' + DOMAIN + '.' };
  fs.writeFileSync(path.join(ROOT, 'data', 'chat', 'chat', stamp + '-claude-domain-live.json'), JSON.stringify(line, null, 1));
  fs.mkdirSync(path.dirname(DONE), { recursive: true });
  fs.writeFileSync(DONE, JSON.stringify({ at: at.toISOString(), ips }));
  spawnSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', timeout: 300000 });
  spawnSync('node', ['push.js', 'domain-watch: ' + DOMAIN + ' is live'], { cwd: ROOT, stdio: 'ignore', timeout: 300000 });
  spawnSync('node', ['notify.js', 'הדומיין שוחרר', 'האתר נפתח ב ' + DOMAIN + '. אפשר להמשיך בממומן.'], { cwd: ROOT, stdio: 'ignore', timeout: 60000 });
  console.log(at.toISOString(), 'LIVE', ips.join(','));
}
main().catch((e) => console.log(new Date().toISOString(), 'error', e.message));
