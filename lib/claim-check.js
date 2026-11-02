/*
  An answer that says it did something is held against the disk.

  Itzik, 22.10.2026: "למה שאני מבקש משהו במוניטור זה לא נעשה, ורק כשאני מבקש
  פה זה נעשה?". At 18:16 a session answered him "השלמתי את ההוראות" on the
  cameras tile, and committed only the rebuilt page: the instructions file had
  not changed since 16:18. The watchdog looked for "אריח" claims against
  build.js alone, and only after the fact, so this one passed.

  Now, when a session closes, each answer it wrote that says it did, added,
  fixed or updated something is checked against what changed since it began:
  commits and uncommitted files outside the page and the chat, and the private
  files. Nothing changed: a correction goes under that answer, and his message
  opens again once, with the reason, so the next session does the work. A
  second empty claim on the same message is told to him instead of looping.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERB = /(?:^|[^א-ת])(?<!לא )(השלמתי|עדכנתי|תיקנתי|הוספתי|הכנתי|הקמתי|שיניתי|התקנתי|העליתי|הסרתי|החלפתי|סידרתי|בניתי|יישרתי|שמתי)(?![א-ת])/;
// Written on every build or every tick, so a change here proves nothing.
const NOISE = /^(docs\/|data\/(chat|status|reports|commands|backup|pc|replies)\/|backups\/)/;

function claims(text) { return VERB.test(String(text || '')); }

function walk(dir, since, depth) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth > 0 && walk(p, since, depth - 1)) return true; }
      else if (fs.statSync(p).mtimeMs > since) return true;
    }
  } catch (e) {}
  return false;
}

// Did anything real change in the repository or the private files since `since` (ms)?
function workSince(repo, dataPath, since) {
  const real = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean).some((f) => !NOISE.test(f));
  try {
    const log = execFileSync('git', ['log', '--name-only', '--format=', '--since=' + new Date(since - 60000).toISOString()],
      { cwd: repo, encoding: 'utf8', timeout: 15000 });
    if (real(log)) return true;
    const st = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8', timeout: 15000 });
    if (real(st.split('\n').map((l) => l.slice(3)).join('\n'))) return true;
  } catch (e) { return true; } // git itself failed: do not accuse a session on no evidence
  return walk(path.join(dataPath, 'files-private'), since, 3);
}

/*
  all: every chat record (with .file). list: the messages the session took.
  Returns the messages whose answer from this session claimed work that did not happen.
*/
function emptyClaims(all, list, since, repo, dataPath) {
  const ids = new Set(list.map((m) => m.id).filter(Boolean));
  const said = all.filter((r) => r.from === 'claude' && ids.has(r.re) && Date.parse(r.at) >= since - 5000 && claims(r.text));
  if (!said.length || workSince(repo, dataPath, since)) return [];
  return list.filter((m) => said.some((r) => r.re === m.id)).map((m) => ({ msg: m, answer: said.find((r) => r.re === m.id) }));
}

module.exports = { claims, workSince, emptyClaims, VERB, NOISE };
