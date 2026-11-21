/*
  What Pegasus has to do, decided without a model.

  Itzik, 16.10.2026, after the ten minute wake burned 200 dollars of API credit
  in nine hours on "nothing new": "תמיד תחשבו איך אנחנו חוסכים". A wake is only
  allowed to start Claude when there is work: a decision he answered on the
  Pegasus screen and nobody picked up yet. The cards live in
  data/pegasus/pegasus/*.json (shown on the 🐎 פגסוס screen): a card with `ask`
  and `opts` waits on him; the listener writes `answer` when he taps a button;
  the wake sets `taken` when it hands the card to a session.

  The PC reads the cards from origin/main of the monitor repo (git show), so it
  never touches the working tree it shares with other sessions.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REL = path.join('data', 'pegasus', 'pegasus');

function readDir(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch (e) { return []; }
  return names.map((n) => {
    try { return Object.assign({ file: n }, JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))); } catch (e) { return null; }
  }).filter(Boolean);
}

// The same cards, read from origin/main of a repo clone (the PC's monitor
// repo) without touching its working tree.
function readGit(repo, ref) {
  ref = ref || 'origin/main';
  const run = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let names = [];
  try { names = run(['ls-tree', '--name-only', ref, REL.split(path.sep).join('/') + '/']).split('\n').filter((n) => n.endsWith('.json')); } catch (e) { return []; }
  return names.map((p) => {
    try { return Object.assign({ file: path.basename(p) }, JSON.parse(run(['show', ref + ':' + p]))); } catch (e) { return null; }
  }).filter(Boolean);
}

const waiting = (cards) => cards.filter((c) => c.ask && !c.answer && !c.closed);
const todo = (cards) => cards.filter((c) => c.ask && c.answer && !c.taken).sort((a, b) => (a.answeredAt || '') < (b.answeredAt || '') ? -1 : 1);

// "פגסוס: <ask> ← <pick>" is what the card's button sends (build.js renderPegasus).
function parseAnswer(text) {
  const m = /^פגסוס:\s*([\s\S]+?)\s*←\s*([\s\S]+)$/.exec(String(text || '').trim());
  return m ? { ask: m[1].trim(), pick: m[2].trim() } : null;
}

// Writes the answer on the card whose ask matches. Returns the card or null.
function answer(dir, askText, pick, at) {
  const want = String(askText || '').trim();
  const card = readDir(dir).find((c) => c.ask && String(c.ask).trim() === want && !c.answer && !c.closed);
  if (!card) return null;
  const f = path.join(dir, card.file);
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d.answer = pick;
  d.answeredAt = at || new Date().toISOString();
  fs.writeFileSync(f, JSON.stringify(d, null, 1), 'utf8');
  return Object.assign({ file: card.file }, d);
}

function take(dir, file, at) {
  const f = path.join(dir, file);
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d.taken = at || new Date().toISOString();
  fs.writeFileSync(f, JSON.stringify(d, null, 1), 'utf8');
  return d;
}

// The task text a session gets for one answered card.
function task(card) {
  return ['החלטה של איציק מהמוניטור (' + (card.answeredAt || '').slice(0, 16) + '):',
    'השאלה: ' + card.ask,
    'התשובה שלו: ' + card.answer,
    card.plan ? 'הרקע וההמלצה שהוצגו לו: ' + card.plan : '',
    card.ref ? 'איפה הפרטים: ' + card.ref : '',
  ].filter(Boolean).join('\n');
}

module.exports = { REL, readDir, readGit, waiting, todo, parseAnswer, answer, take, task };
