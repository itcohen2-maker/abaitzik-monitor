'use strict';
/*
  24.11.2026: the store of the calls and meetings archive.
  Itzik: "צריך לעשות סיכומים ומין לוח בקרה", "חיפוש לפי שם". Spec: docs/superpowers/specs/2026-11-24-calls-archive-design.md

  One JSON file per call or meeting in <data>/calls/items/<id>.json is the source of truth (the search index,
  lib/calls-index.js, is rebuilt from these files). Everything here works on one customer's data folder (dataPath).
    items       intake (dedupe by provider+extId, the private list), read, list, write, remove
    private     data/calls/private.json: numbers that are never stored. A number added later moves its existing calls
                to data/_deleted/<YYYYMMDD>/ (nothing is erased), one line per call (the id only) to _deleted/log.txt
    contacts    data/calls/contacts.json (names the customer gave) + data/biz-home/clients.json + leads (data/biz/biz)
  No log line, error or return value here carries a name, a number or transcript text. Writes are tmp + rename.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TZ = 'Asia/Jerusalem';
const ID_RE = /^c-\d{14}-[0-9a-f]{6}$/;

// the same rule as lib/own-leads.js: 0 + 8 or 9 digits, 972 becomes 0
function normPhone(p) {
  let d = String(p == null ? '' : p).replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return /^0\d{8,9}$/.test(d) ? d : '';
}

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
function writeAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.' + Math.random().toString(16).slice(2, 8) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), 'utf8');
  fs.renameSync(tmp, file);
}
function dayStamp(ms) {
  const o = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  return o.year + o.month + o.day;
}
const itemsDir = (dp) => path.join(dp, 'calls', 'items');
const callsFile = (dp, n) => path.join(dp, 'calls', n);
const nowMs = (n) => (Number.isFinite(n) ? n : Date.now());

// ---- items ----

function read(dataPath, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  return readJson(path.join(itemsDir(dataPath), id + '.json'), null);
}

function write(dataPath, item) {
  if (!item || !ID_RE.test(String(item.id || ''))) throw new Error('calls-store: bad item id');
  writeAtomic(path.join(itemsDir(dataPath), item.id + '.json'), item);
}

// newest first (by `at`, then id)
function list(dataPath) {
  let names = [];
  try { names = fs.readdirSync(itemsDir(dataPath)).filter((n) => /\.json$/.test(n)); } catch (e) { return []; }
  return names.map((n) => readJson(path.join(itemsDir(dataPath), n), null)).filter((x) => x && x.id)
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || (a.id < b.id ? 1 : -1));
}

function stamp(at) { return new Date(at).toISOString().replace(/\D/g, '').slice(0, 14); }
function hashOf(provider, extId) { return crypto.createHash('sha1').update(String(provider) + String(extId)).digest('hex').slice(0, 6); }

// Move, never delete. A name already taken in the destination gets a counter, so nothing is overwritten.
function moveTo(src, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const base = path.basename(src).replace(/\.json$/, '');
  let dest = path.join(destDir, base + '.json'), n = 1;
  while (fs.existsSync(dest)) dest = path.join(destDir, base + '-' + (++n) + '.json');
  try { fs.renameSync(src, dest); } catch (e) { fs.copyFileSync(src, dest); fs.unlinkSync(src); }
  return dest;
}

function moveItem(dataPath, id, ms, why) {
  const src = path.join(itemsDir(dataPath), id + '.json');
  if (!ID_RE.test(id) || !fs.existsSync(src)) return false;
  moveTo(src, path.join(dataPath, '_deleted', dayStamp(ms)));
  try {
    fs.appendFileSync(path.join(dataPath, '_deleted', 'log.txt'), new Date(ms).toISOString() + ' שיחה ' + id + ' הועברה ל ' + dayStamp(ms) + ' (' + why + ')\n', 'utf8');
  } catch (e) { /* the log is a courtesy */ }
  return true;
}

// ---- the private list ----

function privateList(dataPath) {
  const o = readJson(callsFile(dataPath, 'private.json'), {});
  const arr = Array.isArray(o) ? o : (Array.isArray(o.numbers) ? o.numbers : []);
  return Array.from(new Set(arr.map(normPhone).filter(Boolean)));
}

// setPrivate(dataPath, numbers[], now) -> { moved }. The list is replaced; calls of every number on it are moved out.
function setPrivate(dataPath, numbers, now) {
  const list_ = Array.from(new Set((Array.isArray(numbers) ? numbers : []).map(normPhone).filter(Boolean)));
  writeAtomic(callsFile(dataPath, 'private.json'), { numbers: list_ });
  const ms = nowMs(now);
  const set = new Set(list_);
  let moved = 0;
  list(dataPath).forEach((it) => {
    if (it.kind !== 'meet' && set.has(normPhone(it.number)) && moveItem(dataPath, it.id, ms, 'private')) moved++;
  });
  return { moved };
}

function remove(dataPath, id, now) {
  return { ok: moveItem(dataPath, String(id || ''), nowMs(now), 'removed') };
}

// ---- intake ----

function findExisting(dataPath, provider, extId) {
  const h = hashOf(provider, extId);
  let names = [];
  try { names = fs.readdirSync(itemsDir(dataPath)); } catch (e) { return null; }
  for (const n of names) {
    if (!n.endsWith('-' + h + '.json')) continue;
    const it = readJson(path.join(itemsDir(dataPath), n), null);
    if (it && it.provider === provider && String(it.extId) === String(extId)) return it;
  }
  return null;
}

function intake(dataPath, call, now) {
  const c = call && typeof call === 'object' ? call : null;
  if (!c || !c.provider || c.extId == null || c.extId === '' || !Number.isFinite(Date.parse(c.at))) return { ok: false, skipped: 'bad' };
  const kind = c.kind === 'meet' ? 'meet' : 'call';
  const num = normPhone(c.number);
  if (kind === 'call' && num && privateList(dataPath).indexOf(num) >= 0) return { ok: true, skipped: 'private' };
  const transcript = String(c.transcript || '');
  const old = findExisting(dataPath, c.provider, c.extId);
  if (old) {
    if (old.status === 'waiting' && transcript.trim()) {
      old.transcript = transcript; old.status = 'new';
      if (Array.isArray(c.segments) && c.segments.length) old.segments = c.segments;
      if (c.durationSec) old.durationSec = c.durationSec;
      if (c.audioUrl) old.audioUrl = c.audioUrl;
      write(dataPath, old);
    }
    return { ok: true, id: old.id, dup: true };
  }
  const id = 'c-' + stamp(c.at) + '-' + hashOf(c.provider, c.extId);
  const item = {
    id, kind, provider: c.provider, extId: String(c.extId), at: new Date(c.at).toISOString(),
    durationSec: Number(c.durationSec) || 0, direction: c.direction === 'out' ? 'out' : 'in',
    number: num || String(c.number || ''), contactId: '', name: String(c.name || ''),
    transcript, audioUrl: c.audioUrl || '', summary: c.summary || null,
    topics: [], contactIds: [], segments: Array.isArray(c.segments) ? c.segments : [],
    status: transcript.trim() ? 'new' : 'waiting', tries: 0, deleted: false,
  };
  if (Array.isArray(c.people)) item.people = c.people.map((p) => ({ name: String((p && p.name) || ''), email: String((p && p.email) || '') }));
  write(dataPath, item);
  return { ok: true, id };
}

// ---- contacts ----

// A person is one entry; id is p<phone> when he has a phone, else e<email>, else n<name> (a name only, e.g. a client).
function build(dataPath) {
  const map = new Map(); // id -> { id, name, phones, emails, aliases }
  const add = (o, name, phones, emails, aliases) => {
    const ph = Array.from(new Set((phones || []).map(normPhone).filter(Boolean)));
    const em = Array.from(new Set((emails || []).map((e) => String(e || '').trim().toLowerCase()).filter((e) => /@/.test(e))));
    name = String(name || '').replace(/\s+/g, ' ').trim();
    const id = ph.length ? 'p' + ph[0] : em.length ? 'e' + em[0] : name ? 'n' + name.toLowerCase() : '';
    if (!id) return;
    let c = map.get(id);
    if (!c) { c = { id, name: '', phones: [], emails: [], aliases: [] }; map.set(id, c); }
    if (name && !c.name) c.name = name; // sources are added in priority order: the first name stays
    ph.forEach((x) => { if (c.phones.indexOf(x) < 0) c.phones.push(x); });
    em.forEach((x) => { if (c.emails.indexOf(x) < 0) c.emails.push(x); });
    (aliases || []).concat(name ? [name] : []).forEach((a) => { a = String(a || '').trim().toLowerCase(); if (a && c.aliases.indexOf(a) < 0) c.aliases.push(a); });
  };
  const given = readJson(callsFile(dataPath, 'contacts.json'), {});
  Object.keys(given && typeof given === 'object' ? given : {}).forEach((k) => {
    const v = given[k]; add(map, typeof v === 'string' ? v : (v && v.name), [k], v && v.emails);
  });
  const clients = readJson(path.join(dataPath, 'biz-home', 'clients.json'), []);
  (Array.isArray(clients) ? clients : []).forEach((k) => {
    if (!k) return;
    add(map, k.name, [k.phone, k.mobile].concat(Array.isArray(k.phones) ? k.phones : []), [k.email].concat(Array.isArray(k.emails) ? k.emails : []), k.aliases);
  });
  const dir = path.join(dataPath, 'biz', 'biz');
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch (e) { /* no leads here */ }
  names.forEach((n) => {
    const r = readJson(path.join(dir, n), null);
    if (r && (r.phone || r.email)) add(map, r.name === 'בלי שם' ? '' : r.name, [r.phone], [r.email]);
  });
  return Array.from(map.values());
}

function contacts(dataPath) {
  return build(dataPath).map((c) => ({ id: c.id, name: c.name, phones: c.phones, emails: c.emails }));
}

function setName(dataPath, number, name) {
  const n = normPhone(number);
  const nm = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!n || !nm) return { ok: false };
  const o = readJson(callsFile(dataPath, 'contacts.json'), {});
  const cur = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  cur[n] = nm;
  writeAtomic(callsFile(dataPath, 'contacts.json'), cur);
  return { ok: true };
}

// resolve(dataPath, item) -> a copy with contactIds and name filled. A call: by its number. A meeting: every person by
// email, else by name. A number or an email nobody knows still gets its own contact id (p.../e...), so it has a card.
function resolve(dataPath, item) {
  const all = build(dataPath);
  const byPhone = new Map(), byEmail = new Map(), byName = new Map();
  all.forEach((c) => {
    c.phones.forEach((p) => byPhone.set(p, c)); c.emails.forEach((e) => byEmail.set(e, c));
    c.aliases.forEach((a) => { if (!byName.has(a)) byName.set(a, c); });
  });
  const out = Object.assign({}, item);
  const ids = [];
  const push = (id) => { if (id && ids.indexOf(id) < 0) ids.push(id); };
  if (item.kind === 'meet') {
    (Array.isArray(item.people) ? item.people : []).forEach((p) => {
      const em = String((p && p.email) || '').trim().toLowerCase();
      const nm = String((p && p.name) || '').trim().toLowerCase();
      const c = (em && byEmail.get(em)) || (nm && byName.get(nm));
      push(c ? c.id : (em ? 'e' + em : ''));
    });
  } else {
    const ph = normPhone(item.number);
    const c = ph && byPhone.get(ph);
    if (c) { push(c.id); if (c.name) out.name = c.name; } else if (ph) push('p' + ph);
  }
  out.contactIds = ids;
  return out;
}

module.exports = { normPhone, intake, read, list, write, privateList, setPrivate, remove, contacts, setName, resolve };
