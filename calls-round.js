'use strict';
/*
  24.11.2026, the calls archive, the round. Runs every 2 minutes as the customer's own user (monitor-calls-<id>.timer):
  1. data/calls/inbox/*.json (written by the webhook) -> intake -> inbox/done/ (bad file -> inbox/bad/)
  2. data/biz-home/meetings.json -> one item per meeting (the same meeting twice is one item)
  3. up to 10 items that need a summary -> Haiku with the customer's own key -> calendar tasks
  4. every changed item into the search index.
  Itzik: "צריך לעשות סיכומים ומין לוח בקרה", "חיפוש לפי שם".
  A lock (round.lock, stale after 10 minutes) keeps two rounds apart. Logs carry counts and ids only, never names, numbers or text.
  Never throws on one bad item. Spec: docs/superpowers/specs/2026-11-24-calls-archive-design.md
*/
process.removeAllListeners('warning');
const fs = require('fs');
const path = require('path');
const Store = require('./lib/calls-store.js');
const Index = require('./lib/calls-index.js');
const Sum = require('./lib/calls-summary.js');

const MAX_SUMMARIES = 10, LOCK_STALE_MS = 10 * 60 * 1000;

function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function log(s) { try { console.log(new Date().toISOString() + ' ' + s); } catch (e) {} }

function takeLock(dataPath, now) {
  const f = path.join(dataPath, 'calls', 'round.lock');
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); } catch (e) {}
  try {
    if (fs.existsSync(f)) {
      const cur = readJson(f, null);
      const age = now - (cur && Number(cur.at) || 0);
      if (cur && age < LOCK_STALE_MS && age > -LOCK_STALE_MS) return null;
      try { fs.unlinkSync(f); } catch (e) {}
    }
    fs.writeFileSync(f, JSON.stringify({ pid: process.pid, at: now }), { flag: 'wx' });
    return f;
  } catch (e) { return null; }
}

function moveTo(dataPath, name, sub) {
  const dir = path.join(dataPath, 'calls', 'inbox');
  const dest = path.join(dir, sub);
  try { fs.mkdirSync(dest, { recursive: true }); } catch (e) {}
  try { fs.renameSync(path.join(dir, name), path.join(dest, name)); } catch (e) { try { fs.unlinkSync(path.join(dir, name)); } catch (e2) {} }
}

// Same file and line shape as worker.js logUsage; the cost of a claude -p text answer is not known, so usd is 0. No content, only the id.
function usageLine(dataPath, who, id) {
  try {
    const d = path.join(dataPath, 'status');
    fs.mkdirSync(d, { recursive: true });
    fs.appendFileSync(path.join(d, 'usage.jsonl'), JSON.stringify({ at: new Date().toISOString(), who, usd: 0, kind: 'calls-summary', id, models: {} }) + '\n');
  } catch (e) {}
}

function meetingText(m) {
  const s = m && m.summary;
  if (typeof s === 'string') return s.trim();
  if (s && typeof s === 'object') return String(s.overview || s.short_summary || s.text || '').trim();
  return '';
}

async function round(dataPath, opts) {
  const o = opts || {};
  const now = typeof o.now === 'number' ? o.now : Date.now();
  const out = { taken: 0, summarized: 0, failed: 0 };
  const lock = takeLock(dataPath, now);
  if (!lock) return out;
  const changed = new Set();
  try {
    // 1. the inbox
    const inbox = path.join(dataPath, 'calls', 'inbox');
    let names = [];
    try { names = fs.readdirSync(inbox).filter((n) => n.endsWith('.json')).sort(); } catch (e) {}
    for (const n of names) {
      try {
        const call = JSON.parse(fs.readFileSync(path.join(inbox, n), 'utf8'));
        const r = Store.intake(dataPath, call, now);
        if (!r || !r.ok) { moveTo(dataPath, n, 'bad'); continue; }
        moveTo(dataPath, n, 'done');
        if (r.id) { changed.add(r.id); if (!r.dup) out.taken++; }
      } catch (e) { moveTo(dataPath, n, 'bad'); }
    }
    // 2. meetings
    const meets = readJson(path.join(dataPath, 'biz-home', 'meetings.json'), []);
    for (const m of Array.isArray(meets) ? meets : []) {
      try {
        if (!m || !m.id || !m.at) continue;
        const r = Store.intake(dataPath, { kind: 'meet', provider: 'meet', extId: m.id, at: m.at, people: Array.isArray(m.people) ? m.people : [], name: m.client || m.title || '', transcript: meetingText(m) }, now);
        if (r && r.ok && r.id && !r.dup) { out.taken++; changed.add(r.id); }
      } catch (e) {}
    }
    // 3. summaries
    const llm = o.llm || ((m, s, i, ms) => require('./lib/sales-train.js').llm(m, s, i, ms, process.env));
    let who = o.who;
    if (!who) { try { who = require('./lib/instance.js').name; } catch (e) { who = ''; } }
    let n = 0;
    for (const it of Store.list(dataPath)) {
      if (n >= MAX_SUMMARIES) break;
      try {
        let cur = Store.read(dataPath, it.id);
        if (!Sum.needs(cur)) continue;
        n++;
        cur = Store.resolve(dataPath, cur);
        const r = await Sum.summarize(dataPath, cur, llm, now);
        usageLine(dataPath, who, it.id);
        changed.add(it.id);
        if (r && r.ok) {
          out.summarized++;
          try { Sum.calTasks(dataPath, r.item); } catch (e) {}
        } else out.failed++;
      } catch (e) { out.failed++; }
    }
    // 4. names and contacts, then the search index for what changed
    for (const id of changed) {
      try {
        let cur = Store.read(dataPath, id);
        if (!cur) continue;
        const res = Store.resolve(dataPath, cur);
        if (JSON.stringify(res) !== JSON.stringify(cur)) { Store.write(dataPath, res); cur = res; }
        Index.upsert(dataPath, cur);
      } catch (e) {}
    }
  } finally {
    try { fs.unlinkSync(lock); } catch (e) {}
  }
  return out;
}

module.exports = { round };

if (require.main === module) {
  (async () => {
    try {
      const inst = require('./lib/instance.js');
      const r = await round(inst.dataPath, {});
      if (r.taken || r.summarized || r.failed) log('calls round taken=' + r.taken + ' summarized=' + r.summarized + ' failed=' + r.failed);
    } catch (e) { log('calls round error ' + String(e && e.message).slice(0, 80)); process.exitCode = 1; }
  })();
}
