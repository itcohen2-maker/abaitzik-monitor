'use strict';
/*
  10.11.2026, Itzik: "אם טופס של ליד או לקוח חזר וצריך טיפול, זה חייב להבהב במוניטור, לטיפול. וזה התפקיד של המנהל."
  Dr. Shulman finished his setup form at 23:06; the push fell into quiet hours and nothing stayed on the home screen.

  The "📋 לטיפול" queue: one persistent item per returned form that needs Itzik. An item is a file,
    data/handle/handle/<YYYYMMDD-HHMM>-<slug>.json
      { id, key, at, kind, who, title, link, done:false }
  Items are made by COMPLETIONS only (a setup form finished, an agreement, NDA, document or quote signed, a new lead),
  never by an open or an upload. add() is idempotent on `key`: the same completion makes one item, however many
  times it is reported, and an item that was marked done is not made again.
  `link` is where to look in the monitor, one of the MG_GO keys of the home screen: answers, biz, cal, plate, status.

  Marking done needs no model: the page sends "✓ טופל: <id>" and listen.js calls done().
  The page gets open items only (forPage) in its sealed payload, never in the public live.json. Visible copy has no dashes.
  Shared by every monitor (dataPath is the instance's); a customer's page opts in later through build.js.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TZ = 'Asia/Jerusalem';
const KINDS = ['setup', 'setup-missing', 'sign', 'agreement', 'nda', 'doc', 'quote', 'lead', 'form', 'request', 'other'];
const LINKS = ['answers', 'biz', 'cal', 'plate', 'status', 'tenants'];

function dirOf(dataPath) { return path.join(dataPath, 'handle', 'handle'); }
function noDash(s) { return String(s == null ? '' : s).replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim(); }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { encoding: 'utf8', mode: 0o664 });
  fs.renameSync(f + '.tmp', f);
}
function stamp(ms) {
  const o = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  return o.year + o.month + o.day + '-' + (o.hour === '24' ? '00' : o.hour) + o.minute;
}
function idOf(key) { return 'h' + crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 10); }

function all(dataPath) {
  const dir = dirOf(dataPath);
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (e) { return []; }
  return files.sort().map((f) => { const r = readJson(path.join(dir, f), null); if (r && r.id) r._file = f; return r; }).filter((r) => r && r.id);
}

// add(dataPath, {key, kind, who, title, link, at?}) -> {created, item}. The same key never makes a second item.
function add(dataPath, o) {
  o = o || {};
  const key = String(o.key || '').trim();
  if (!key) return { created: false, why: 'no key' };
  const id = idOf(key);
  const have = all(dataPath).find((r) => r.id === id);
  if (have) return { created: false, item: have };
  const ms = o.at ? Date.parse(o.at) : Date.now();
  const at = new Date(isNaN(ms) ? Date.now() : ms).toISOString();
  const slug = String(o.kind || 'other').replace(/[^a-z]/g, '') + '-' + id.slice(1, 7);
  const item = {
    id, key, at,
    kind: KINDS.indexOf(o.kind) >= 0 ? o.kind : 'other',
    who: noDash(o.who).slice(0, 80),
    title: noDash(o.title).slice(0, 160),
    link: LINKS.indexOf(o.link) >= 0 ? o.link : 'answers',
    done: false,
  };
  // 12.11.2026: the biz record this item was made for (a lead), so "🗑 מחיקת ליד" moves exactly its items (lib/lead-delete.js).
  if (/^biz-[A-Za-z0-9_-]{4,70}$/.test(String(o.bizId || ''))) item.bizId = o.bizId;
  writeJson(path.join(dirOf(dataPath), stamp(Date.parse(at)) + '-' + slug + '.json'), item);
  return { created: true, item };
}

// done(dataPath, id) -> true when an open item was marked, false when it is unknown or already done.
function done(dataPath, id) {
  id = String(id || '').trim();
  const r = all(dataPath).find((x) => x.id === id);
  if (!r || r.done) return false;
  const f = path.join(dirOf(dataPath), r._file);
  delete r._file;
  r.done = true; r.doneAt = new Date().toISOString();
  writeJson(f, r);
  return true;
}

// Open items, newest first.
function open(dataPath) {
  return all(dataPath).filter((r) => !r.done).map((r) => { delete r._file; return r; }).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

function forPage(dataPath) {
  return open(dataPath).map((r) => {
    const o = { id: r.id, at: r.at, kind: r.kind, who: r.who, title: r.title, link: r.link };
    // a site lead item made before bizId existed: its key is "lead:<at>" and its record is biz-<digits of at>-site
    let b = r.bizId;
    if (!b && r.kind === 'lead' && /^lead:\d{4}-\d{2}-\d{2}T/.test(String(r.key))) b = 'biz-' + String(r.key).slice(5).replace(/\D/g, '').slice(0, 14) + '-site';
    if (b) o.bizId = b;
    return o;
  });
}

// For the manager: { n, oldest (item or null), hours (age of the oldest) }.
function summary(dataPath, now) {
  const o = open(dataPath);
  if (!o.length) return { n: 0, oldest: null, hours: 0 };
  const oldest = o[o.length - 1];
  return { n: o.length, oldest, hours: Math.max(0, ((now || Date.now()) - Date.parse(oldest.at)) / 3600000) };
}

// A completion reported by a running server (wa-bridge): add the item, and rebuild the page so the tile shows it.
// One push for a burst (20 seconds), and none when the item already existed.
let pushTimer = null;
function publishSoon() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    try { require('child_process').execFile(process.execPath, [path.join(__dirname, '..', 'push.js'), 'לטיפול: פריט חדש'], { cwd: path.join(__dirname, '..'), timeout: 240000 }, () => {}); } catch (e) { /* the next build carries it */ }
  }, 20000);
}
function complete(o) {
  const r = add(require('./instance.js').dataPath, o);
  if (r.created) publishSoon();
  return r;
}

// A request from a customer's monitor (kind request): one item per request, closed when Itzik decides it.
// whole: reqs is the customer's full list (its file was read), so an open item whose request is gone from it
// (deleted there, or a test) is closed too. 11.11.2026: Dr. Shulman's two mail requests left his list on 10.11 and
// stayed open on Itzik's screen for a day.
function fromRequests(dataPath, tenant, who, reqs, skip, whole) {
  let changed = false;
  if (whole) {
    const ids = new Set((reqs || []).map((x) => idOf('req:' + tenant + ':' + x.id)));
    open(dataPath).forEach((r) => { if (String(r.key).startsWith('req:' + tenant + ':') && !ids.has(r.id) && done(dataPath, r.id)) changed = true; });
  }
  (reqs || []).forEach((x) => {
    const key = 'req:' + tenant + ':' + x.id;
    if (x.status === 'pending') {
      if (!(skip || []).includes(x) && add(dataPath, { key, kind: 'request', who, title: x.text, link: 'tenants', at: x.at }).created) changed = true;
    } else if (done(dataPath, idOf(key))) changed = true;
  });
  return changed;
}

// Close every open item whose key starts with prefix (a form finished again replaces its earlier item). -> count closed.
function closePrefix(dataPath, prefix) {
  let n = 0;
  open(dataPath).forEach((r) => { if (String(r.key).startsWith(prefix) && done(dataPath, r.id)) n++; });
  return n;
}

module.exports = { closePrefix, fromRequests, complete, publishSoon, KINDS, LINKS, dirOf, idOf, add, done, open, all, forPage, summary };
