'use strict';
/*
  The improver. The reviewer's other half.

  Itzik, 5.10: "where is the app that keeps fixing and improving itself? if
  there is none, build it." review.js only finds things, every morning, and
  they waited on the "רעיונות" screen for him to press "רוצה את זה". This one
  takes one of them a day and builds it, without asking.

  It is careful in the one way that matters here: other sessions are writing
  to this repository at the same time. So the work happens in a separate
  worktree, the tests run there, and only a patch that passes comes back to
  the real tree, through push.js like every other change. A patch that fails
  the tests, or no longer applies, is dropped and the idea is marked as tried,
  so the same idea is not burned on every morning.

  One idea a day, small or medium only. Large ones stay on the screen for him.

  Usage: node improve.js            build one idea, publish, tell him
         node improve.js --dry      say which idea it would take, change nothing
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const DRY = process.argv.includes('--dry');
const HERE = __dirname;
const DIR = path.join(inst.dataPath, 'better', 'better');
const CHAT = path.join(inst.dataPath, 'chat', 'chat');
const ORDER = { 'קטן': 0, 'בינוני': 1 };

const log = line => console.log(new Date().toISOString().slice(11, 19) + '  ' + line);
const sh = (cmd, args, cwd, timeout) => execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeout || 600000 });

function ideas() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => {
    try { return Object.assign(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), { _file: f }); } catch (e) { return null; }
  }).filter(Boolean);
}

function pick() {
  return ideas()
    .filter(x => !x.built && !x.tried && x.size in ORDER)
    .sort((a, b) => ORDER[a.size] - ORDER[b.size] || (a.at < b.at ? -1 : 1))[0] || null;
}

function mark(idea, fields) {
  const file = path.join(DIR, idea._file);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify(Object.assign(doc, fields), null, 1));
}

function prompt(idea) {
  return [
    'אתה משפר את "המוניטור", אפליקציית דף אחד לטלפון. build.js בונה את הדף (HTML, CSS ו-JS בתוך מחרוזות).',
    'בודק השיפורים מצא את השיפור הזה, והמשימה שלך היא לבנות אותו עכשיו, עד הסוף:',
    '',
    'כותרת: ' + idea.t,
    'פירוט: ' + idea.d,
    'איפה בדף: ' + (idea.area || 'לא צוין'),
    '',
    'כללים:',
    '- שינוי קטן ומדויק, רק מה שהשיפור הזה צריך. לא לשנות דברים אחרים בדרך.',
    '- לא לגעת בתיקייה data ולא בתיקייה docs. רק קוד.',
    '- להתאים לסגנון הקוד שמסביב, כולל הערה קצרה למה.',
    '- כל טקסט שמופיע בדף: עברית פשוטה, בלי מקפים, בלי אימוג׳י חדשים.',
    '- בסוף להריץ npm test ולוודא שהכל עובר. אם לא עובר, לתקן עד שעובר.',
    '- אם השיפור לא אפשרי בלי החלטה של אדם, לא לשנות כלום.',
    '',
    'השורה האחרונה בפלט: JSON בלבד, בשורה אחת:',
    '{"done":true|false,"say":"משפט אחד או שניים בעברית של יום יום, בלי מונחים טכניים ובלי שמות קבצים: מה השתנה בדף ואיפה רואים את זה"}',
  ].join('\n');
}

function runClaude(text, cwd) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Read,Grep,Glob,Edit,Write,Bash(npm test:*),Bash(node --test:*),Bash(node build.js:*)',
      '--output-format', 'text'];
    const child = spawn('claude', args, { cwd, env: process.env });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('timeout')); }, 35 * 60 * 1000);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('claude exited ' + code + ': ' + err.slice(0, 200)));
      resolve(out);
    });
    child.stdin.end(text);
  });
}

function verdict(out) {
  const lines = out.trim().split('\n').reverse();
  for (const l of lines) {
    const a = l.indexOf('{'), b = l.lastIndexOf('}');
    if (a < 0 || b < a) continue;
    try { const v = JSON.parse(l.slice(a, b + 1)); if ('done' in v) return v; } catch (e) {}
  }
  return { done: false, say: '' };
}

function tell(text) {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const p = n => String(n).padStart(2, '0');
  const name = il.getFullYear() + p(il.getMonth() + 1) + p(il.getDate()) + '-' + p(il.getHours()) + p(il.getMinutes()) + '-claude-improve.json';
  fs.mkdirSync(CHAT, { recursive: true });
  fs.writeFileSync(path.join(CHAT, name), JSON.stringify({ at: now.toISOString(), from: 'claude', text }, null, 1));
}

async function main() {
  const idea = pick();
  if (!idea) { log('nothing to build'); return; }
  log('idea: ' + idea.t + ' (' + idea.size + ')');
  if (DRY) return;

  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'improve-'));
  fs.rmdirSync(wt);
  sh('git', ['worktree', 'add', '-q', '--detach', wt, 'HEAD'], HERE);
  let patch = '', v = { done: false, say: '' }, why = '';
  try {
    // data/, node_modules/ and the gate key are not in git; the worktree
    // borrows them so the build and the tests see what the real tree sees.
    // Without the key the gate tests fail and every idea was dropped (5.10).
    for (const f of ['data', 'node_modules', 'gate-key.txt']) {
      if (fs.existsSync(path.join(HERE, f))) fs.symlinkSync(path.join(HERE, f), path.join(wt, f));
    }
    v = verdict(await runClaude(prompt(idea), wt));
    if (!v.done) why = 'the session did not finish it';
    else {
      try { sh('npm', ['test'], wt, 900000); } catch (e) { why = 'tests failed in the worktree'; }
      if (!why) {
        sh('git', ['add', '-A', '--', '.', ':!docs', ':!data', ':!node_modules'], wt);
        patch = sh('git', ['diff', '--cached', '--binary'], wt);
        if (!patch.trim()) why = 'no change came out';
      }
    }
  } catch (e) {
    why = String(e.message).slice(0, 160);
  } finally {
    try { sh('git', ['worktree', 'remove', '--force', wt], HERE); } catch (e) {}
  }

  if (!why) {
    const pf = path.join(os.tmpdir(), 'improve-' + process.pid + '.patch');
    fs.writeFileSync(pf, patch);
    try {
      sh('git', ['apply', '--check', pf], HERE);
      sh('git', ['apply', pf], HERE);
      try { sh('npm', ['test'], HERE, 900000); }
      catch (e) { sh('git', ['apply', '-R', pf], HERE); why = 'tests failed after merging with the live tree'; }
    } catch (e) {
      if (!why) why = 'the patch no longer applies';
    }
    fs.unlinkSync(pf);
  }

  if (why) {
    mark(idea, { tried: new Date().toISOString(), why });
    log('dropped: ' + why);
    return;
  }

  mark(idea, { built: new Date().toISOString(), say: v.say || '' });
  tell('שיפור חדש נבנה לבד הבוקר: ' + idea.t + '.\n' + (v.say || idea.d) + '\n' + inst.publicUrl);
  log('built: ' + idea.t);
  try { sh('node', ['push.js', 'המשפר: ' + idea.t], HERE, 300000); }
  catch (e) { log('publish failed: ' + String(e.message).slice(0, 120)); }
  try { sh('node', ['notify.js', '🛠 שיפור חדש במוניטור', idea.t], HERE, 60000); } catch (e) {}
}

main().catch(e => { log('IMPROVE FAILED: ' + e.message); process.exit(1); });
