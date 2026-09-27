'use strict';
/*
  Keeps GitHub Actions storage from filling up.

  27.9: GitHub wrote that Actions storage was at 100%. Every push of this
  repository makes GitHub Pages store the whole docs folder as an artifact, 36MB
  because chat attachments live in docs/files, and each one is kept for a day.
  The listener pushes dozens of times a day, so thirty copies sat there at once.
  Once the site is deployed an old copy serves nothing, so every github-pages
  artifact but the newest is deleted. Runs hourly from a hidden scheduled task
  on the PC, where gh is signed in. Only this repository, never salinda-mobile.
*/
const { execFileSync } = require('child_process');
const REPO = 'itcohen2-maker/abaitzik-monitor';
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', windowsHide: true });

function main() {
  const list = JSON.parse(gh('api', `repos/${REPO}/actions/artifacts?per_page=100`));
  const pages = list.artifacts.filter(a => a.name === 'github-pages' && !a.expired)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const old = pages.slice(0, -1);
  let freed = 0;
  for (const a of old) {
    try { gh('api', '-X', 'DELETE', `repos/${REPO}/actions/artifacts/${a.id}`); freed += a.size_in_bytes; }
    catch (e) { /* already gone, or a network blip: the next hour tries again */ }
  }
  console.log(new Date().toISOString() + ` deleted ${old.length}, freed ${Math.round(freed / 1048576)}MB, kept ${pages.length ? 1 : 0}`);
}

if (require.main === module) main();
module.exports = { main };
