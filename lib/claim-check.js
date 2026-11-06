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

/*
  6.11.2026, from reading Revora's code (Noam): an answer that says it sent,
  scheduled, issued, posted or printed something must have a matching action
  in the session's own transcript. The disk check above only knows files; a
  mail or a WhatsApp leaves no file in the repository, so "שלחתי" passed on
  nothing. Now each such verb needs a tool call of its kind in the session
  log (~/.claude/projects/<cwd>/<session>.jsonl). No log found: no accusation.
*/
const ACTIONS = [
  { kind: 'שליחה', verb: /(?:^|[^א-ת])(?<!לא )ו?(שלחתי|העברתי|השבתי)(?![א-ת])/,
    proof: /send|mail|smtp|wa-out|waSend|wa-send|notify|push\.js|ntfy|graph\.facebook|gmail|reply|forward|draft|messages/i },
  { kind: 'תזמון', verb: /(?:^|[^א-ת])(?<!לא )ו?(קבעתי|תזמנתי|זימנתי)(?![א-ת])/,
    proof: /calendar|event|appts|remind|cron|schedule|meeting/i },
  { kind: 'מסמך כספי', verb: /(?:^|[^א-ת])(?<!לא )ו?(הוצאתי|הפקתי)(?![א-ת])/,
    proof: /rivhit|invoice|receipt|quote|pdf|חשבונית|קבלה|הצעה/i },
  { kind: 'פרסום', verb: /(?:^|[^א-ת])(?<!לא )ו?(פרסמתי|העליתי לרשת|העליתי לאינסטגרם|העליתי לפייסבוק)(?![א-ת])/,
    proof: /publish|post|graph\.facebook|instagram|linkedin|upload|ner-post/i },
  { kind: 'הדפסה', verb: /(?:^|[^א-ת])(?<!לא )ו?(הדפסתי)(?![א-ת])/,
    proof: /print|lp\b|Out-Printer/i },
];

function sessionTools(home, repo, sessionId) {
  if (!sessionId) return null;
  const dir = path.join(home, '.claude', 'projects', repo.replace(/[^A-Za-z0-9]/g, '-'));
  const f = path.join(dir, sessionId + '.jsonl');
  let raw;
  try { raw = fs.readFileSync(f, 'utf8'); } catch (e) { return null; }
  const calls = [];
  raw.split('\n').forEach((l) => {
    if (!l) return;
    let j; try { j = JSON.parse(l); } catch (e) { return; }
    const c = j && j.message && Array.isArray(j.message.content) ? j.message.content : [];
    c.forEach((x) => { if (x && x.type === 'tool_use') calls.push(String(x.name || '') + ' ' + JSON.stringify(x.input || {})); });
  });
  return calls;
}

/* The answers of this session that claim an outward action with no such call. */
function emptyActions(all, list, since, home, repo, sessionId) {
  const calls = sessionTools(home, repo, sessionId);
  if (!calls) return [];
  const ids = new Set(list.map((m) => m.id).filter(Boolean));
  const out = [];
  all.filter((r) => r.from === 'claude' && ids.has(r.re) && Date.parse(r.at) >= since - 5000).forEach((r) => {
    const t = String(r.text || '');
    const miss = ACTIONS.filter((a) => a.verb.test(t) && !calls.some((c) => a.proof.test(c)));
    if (!miss.length) return;
    const msg = list.find((m) => m.id === r.re);
    if (msg && !out.some((o) => o.msg.id === msg.id)) out.push({ msg, answer: r, kinds: miss.map((a) => a.kind) });
  });
  return out;
}

module.exports.emptyActions = emptyActions;
module.exports.sessionTools = sessionTools;
module.exports.ACTIONS = ACTIONS;
