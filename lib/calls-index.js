'use strict';
/*
  24.11.2026: the search index of the calls and meetings archive.
  Itzik: "חיפוש לפי שם", and the customer must find "חלון" inside "לחלון". Spec: docs/superpowers/specs/2026-11-24-calls-archive-design.md

  <data>/calls/index.sqlite (node:sqlite) is rebuildable from the items (lib/calls-store.js), so it is not in git or in backups.
    calls   FTS5 with tokenize='trigram remove_diacritics 1' over name, number, about, body (body = transcript + decided + tasks).
            The default unicode61 tokenizer does not find a word behind a Hebrew prefix letter; trigram does.
    meta    plain table (id, at ms, kind, status, plus name, number, contacts, topics) for filters and sort without touching FTS
  Trigram needs 3 characters: a query of 1 to 2 characters, and a phone number, go through contacts and LIKE instead.
  The store does not call this file: whoever writes an item calls upsert, whoever removes one calls drop, rebuild fixes everything.
  Every call opens the db and closes it at the end (short lived, two writers are possible).
  No logging here, and nothing printed except the CLI answer the customer asked for.
*/
// the ExperimentalWarning of node:sqlite must not reach the CLI output
const _emit = process.emitWarning;
process.emitWarning = function (w, ...a) {
  const t = typeof w === 'string' ? w : (w && w.message) || '';
  if (/SQLite/i.test(t) || a[0] === 'ExperimentalWarning' || (a[0] && a[0].type === 'ExperimentalWarning')) return;
  return _emit.call(process, w, ...a);
};
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = _emit;
const fs = require('fs');
const path = require('path');
const store = require('./calls-store.js');

const DAY = 86400000;
const SEP = '\n';
const dbFile = (dp) => path.join(dp, 'calls', 'index.sqlite');

function open(dataPath, opts) {
  const readonly = !!(opts && opts.readonly);
  if (readonly) return new DatabaseSync(dbFile(dataPath), { readOnly: true });
  fs.mkdirSync(path.join(dataPath, 'calls'), { recursive: true });
  const db = new DatabaseSync(dbFile(dataPath));
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS calls USING fts5(
    id UNINDEXED, at UNINDEXED, kind UNINDEXED, contacts UNINDEXED, topics UNINDEXED,
    name, number, about, body, tokenize='trigram remove_diacritics 1')`);
  db.exec(`CREATE TABLE IF NOT EXISTS meta(
    id TEXT PRIMARY KEY, at INTEGER, kind TEXT, status TEXT, name TEXT, number TEXT, contacts TEXT, topics TEXT)`);
  db.exec('CREATE INDEX IF NOT EXISTS meta_at ON meta(at)');
  return db;
}

const list = (a) => (Array.isArray(a) ? a : []);
const joined = (a) => (a.length ? SEP + a.join(SEP) + SEP : '');

function bodyOf(item) {
  const s = item.summary || {};
  return [item.transcript || '', list(s.decided).join('\n'), list(s.tasks).map((t) => (t && t.text) || '').join('\n')]
    .filter(Boolean).join('\n');
}
function nameOf(item) {
  if (item.name) return String(item.name);
  return list(item.people).map((p) => (p && p.name) || '').filter(Boolean).join(', ');
}

function put(db, item) {
  const at = Date.parse(item.at) || 0;
  const name = nameOf(item);
  const number = store.normPhone(item.number) || String(item.number || '');
  const contacts = joined(list(item.contactIds));
  const topics = joined(list(item.topics));
  const s = item.summary || {};
  db.prepare('DELETE FROM calls WHERE id = ?').run(item.id);
  db.prepare('INSERT INTO calls(id, at, kind, contacts, topics, name, number, about, body) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(item.id, String(at), item.kind || 'call', contacts, topics, name, number, String(s.about || ''), bodyOf(item));
  db.prepare('INSERT OR REPLACE INTO meta(id, at, kind, status, name, number, contacts, topics) VALUES (?,?,?,?,?,?,?,?)')
    .run(item.id, at, item.kind || 'call', item.status || '', name, number, contacts, topics);
}

function inTx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* ignore */ } throw e; }
}

// the names and contact ids are refreshed from the contacts at index time
function upsert(dataPath, item) {
  if (!item || !item.id) return;
  const db = open(dataPath);
  try { inTx(db, () => put(db, store.resolve(dataPath, item))); } finally { db.close(); }
}

function drop(dataPath, id) {
  if (!fs.existsSync(dbFile(dataPath))) return;
  const db = open(dataPath);
  try { inTx(db, () => { db.prepare('DELETE FROM calls WHERE id = ?').run(id); db.prepare('DELETE FROM meta WHERE id = ?').run(id); }); } finally { db.close(); }
}

function rebuild(dataPath) {
  const items = store.list(dataPath);
  const db = open(dataPath);
  try {
    return inTx(db, () => {
      db.exec('DELETE FROM calls');
      db.exec('DELETE FROM meta');
      items.forEach((it) => put(db, store.resolve(dataPath, it)));
      return items.length;
    });
  } finally { db.close(); }
}

// ---- search ----

function dateMs(v, isTo) {
  if (v == null || v === '') return null;
  const ms = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  return isTo && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? ms + DAY : ms; // a bare date means the whole day
}

function ftsQuery(q) {
  const words = String(q).split(/\s+/).filter(Boolean).map((w) => store.normPhone(w) || w);
  return words.filter((w) => Array.from(w).length >= 3).map((w) => '"' + w.replace(/"/g, '""') + '"').join(' AND ');
}

function snippetOf(item, words) {
  const body = bodyOf(item).replace(/\s+/g, ' ');
  if (!body) return '';
  let i = -1;
  const low = body.toLowerCase();
  for (const w of words) { i = low.indexOf(w.toLowerCase()); if (i >= 0) break; }
  const start = i < 0 ? 0 : Math.max(0, i - 40);
  return (start > 0 ? '…' : '') + body.slice(start, start + 120);
}

function search(dataPath, opts) {
  const o = opts || {};
  const q = String(o.q == null ? '' : o.q).trim();
  const limit = Math.max(1, Math.min(1000, parseInt(o.limit, 10) || 30));
  const offset = Math.max(0, parseInt(o.offset, 10) || 0);
  const empty = { total: 0, rows: [] };
  if (!fs.existsSync(dbFile(dataPath))) {
    if (!store.list(dataPath).length) return empty;
    rebuild(dataPath); // a lost index is built again from the items
  }
  const db = open(dataPath);
  try {
    const where = [];
    const args = [];
    let words = [];
    if (q) {
      const phone = store.normPhone(q);
      const fts = phone ? '' : ftsQuery(q);
      if (fts) {
        where.push('m.id IN (SELECT id FROM calls WHERE calls MATCH ?)');
        args.push(fts);
        words = q.split(/\s+/).filter((w) => Array.from(w).length >= 3);
      } else {
        // 1 to 2 characters, or a phone: contacts first (LIKE), then their calls, plus the call's own name and number
        const ids = [];
        const low = q.toLowerCase();
        store.contacts(dataPath).forEach((c) => {
          const hit = phone ? c.phones.indexOf(phone) >= 0
            : (c.name || '').toLowerCase().indexOf(low) >= 0 || c.phones.some((p) => p.indexOf(q.replace(/\D/g, '') || '\u0000') >= 0);
          if (hit) ids.push(c.id);
        });
        if (phone) ids.push('p' + phone);
        const ors = [];
        ids.forEach((id) => { ors.push('instr(m.contacts, ?) > 0'); args.push(SEP + id + SEP); });
        if (phone) { ors.push('m.number = ?'); args.push(phone); }
        else { ors.push('instr(lower(m.name), ?) > 0'); args.push(low); }
        words = [q];
        where.push('(' + ors.join(' OR ') + ')');
      }
    }
    if (o.kind) { where.push('m.kind = ?'); args.push(String(o.kind)); }
    const from = dateMs(o.from, false), to = dateMs(o.to, true);
    if (from != null) { where.push('m.at >= ?'); args.push(from); }
    if (to != null) { where.push('m.at < ?'); args.push(to); }
    if (o.topic) { where.push('instr(m.topics, ?) > 0'); args.push(SEP + o.topic + SEP); }
    if (o.contactId) { where.push('instr(m.contacts, ?) > 0'); args.push(SEP + o.contactId + SEP); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = db.prepare('SELECT COUNT(*) AS n FROM meta m' + w).get(...args).n;
    const found = db.prepare('SELECT m.id, m.name, m.number FROM meta m' + w + ' ORDER BY m.at DESC, m.id DESC LIMIT ? OFFSET ?')
      .all(...args, limit, offset);
    const rows = [];
    found.forEach((f) => {
      const it = store.read(dataPath, f.id);
      if (!it) return; // the index is ahead of the files: skip, rebuild fixes it
      const s = it.summary || {};
      rows.push({
        id: it.id, at: it.at, kind: it.kind, name: f.name, number: f.number, durationSec: it.durationSec,
        about: s.about || '', decided: list(s.decided), tasks: list(s.tasks), topics: list(it.topics),
        status: it.status, snippet: snippetOf(it, words),
      });
    });
    return { total, rows };
  } finally { db.close(); }
}

// the card of one contact: all his calls (newest first) and the tasks nobody marked done
function contactCard(dataPath, contactId) {
  const known = store.contacts(dataPath).find((c) => c.id === contactId);
  const v = String(contactId || '').slice(1);
  const contact = known || { id: contactId, name: contactId[0] === 'n' ? v : '', phones: contactId[0] === 'p' ? [v] : [], emails: contactId[0] === 'e' ? [v] : [] };
  const calls = search(dataPath, { contactId, limit: 1000 }).rows;
  const open = [];
  calls.forEach((c) => c.tasks.forEach((t) => {
    if (t && t.text && !t.done) open.push({ text: t.text, due: t.due || '', callId: c.id });
  }));
  return { contact, calls, open };
}

// lines for the chat prompt of a customer who has an archive
function promptLines() {
  return [
    'ללקוח יש ארכיון שיחות ופגישות עם תמלול וסיכום.',
    'כשהוא שואל על שיחה או פגישה שהייתה, הרץ node lib/calls-index.js search "<המילים שלו>".',
    'כל שורה בתשובה היא תאריך, שם, על מה הייתה השיחה, ומזהה.',
    'ענה רק ממה שחזר משם, וציין את התאריך ואת האדם.',
    'אם לא חזר כלום, אמר שלא נמצאה שיחה כזאת. לעולם לא להמציא.',
  ];
}

// ---- CLI: node lib/calls-index.js search "<q>" | rebuild ----

function dataPathOfCli() {
  return process.env.CALLS_DATA_PATH || require('./instance.js').dataPath;
}
function dateIL(at) {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}
if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const dp = dataPathOfCli();
  if (cmd === 'search') {
    const r = search(dp, { q: rest.join(' '), limit: 10 });
    r.rows.forEach((x) => console.log([dateIL(x.at), x.name || x.number || '-', x.about || x.snippet.slice(0, 80), 'id ' + x.id].join(' · ')));
    if (!r.rows.length) console.log('לא נמצאה שיחה');
  } else if (cmd === 'rebuild') {
    console.log(rebuild(dp));
  } else {
    console.log('usage: node lib/calls-index.js search "<q>" | rebuild');
    process.exitCode = 1;
  }
}

module.exports = { open, upsert, drop, rebuild, search, contactCard, promptLines };
