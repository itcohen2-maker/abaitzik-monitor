'use strict';
/*
  Media that already went up does not stay on the site.

  26.10.2026, GitHub Actions storage at 90%: every Pages deploy carries all of
  docs/, and the story videos in docs/plate/media and docs/ner/media were most
  of it. Itzik: "אחרי שאיכסנו את זה באתר בסטורי אין לנו צריך לשמור העתקים. יש גם
  בטח בדרייב". So once a day this removes from each queue's media folder every
  file that no waiting item uses: items marked posted, old draft versions,
  posts that left the queue. A file younger than a day is kept, in case its
  queue line is still on the way. The removal stays in git history.

  Usage: node media-clean.js        remove and publish
         node media-clean.js --dry  list only
*/
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const QUEUES = ['docs/plate', 'docs/ner'];
const DAY = 24 * 3600 * 1000;
const dry = process.argv.includes('--dry');

function waiting(dir) {
  let items = [];
  try { items = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'queue.json'), 'utf8')); } catch { return null; }
  // Whatever a waiting item points at, under any field name, is in use.
  return JSON.stringify(items.filter(it => !it.posted));
}

// When the file first came into git. The mtime is no good: every pull rewrites it.
// A file git does not know yet counts as new.
function added(f) {
  const r = spawnSync('git', ['log', '--diff-filter=A', '-1', '--format=%ct', '--', f], { cwd: ROOT, encoding: 'utf8' });
  const t = parseInt(r.stdout, 10);
  return t ? t * 1000 : Date.now();
}

const gone = [];
for (const dir of QUEUES) {
  const used = waiting(dir);
  if (used === null) continue; // no readable queue: touch nothing
  const media = path.join(ROOT, dir, 'media');
  let names = [];
  try { names = fs.readdirSync(media); } catch { continue; }
  for (const n of names) {
    const f = path.join(media, n);
    if (used.includes(n) || Date.now() - added(f) < DAY) continue;
    gone.push(path.relative(ROOT, f));
  }
}

if (!gone.length) process.exit(0);
console.log((dry ? 'would remove ' : 'removing ') + gone.length + ':\n' + gone.join('\n'));
if (dry) process.exit(0);
for (const f of gone) fs.unlinkSync(path.join(ROOT, f));
spawnSync('node', ['push.js', `media-clean: ${gone.length} posted or unused files out of docs`], { cwd: ROOT, stdio: 'inherit', timeout: 300000 });
