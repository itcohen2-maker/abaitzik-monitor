'use strict';
/*
  18.11.2026, Itzik: the leads board goes to every customer, "ושואלים אותם מה חסר להם"
  (docs/superpowers/specs/2026-11-18-leads-board-design.md, goal 10). At the bottom of a customer's board:
  "💡 מה חסר לך כאן?", one line. The page sends it as "לוח לידים: חסר <text>" and thanks him itself.

  Two sides, no model, and neither writes into the other's folder (as lib/change-requests.js):
  1. The customer's listener (listen.js): parse() and record() keep it in his data/status/leads-missing.json
     (0644, the last 200). Silent when it worked: the page already said "תודה, העברתי לאיציק.".
  2. Itzik's tenants-health.js (every minute, as Itzik): collect() reads that file for each customer and gives the
     lines not handed over yet; once a line reached Itzik (WhatsApp, or a push when WhatsApp failed), done() makes it
     an idea in his data/better/better (the 💡 רעיונות screen, by "tenant:<id>", area לידים, no size, so improve.js
     never builds it by itself) and marks it handed over in his data/status/leads-missing-told.json. A line that did
     not reach him is tried again on the next run.

  Review 18.11, a flood guard: the customer's file is his to write (his sessions too), so it is data and is capped:
  a file over 64KB is not read, at most 3 lines per customer per run and 10 per customer per Israel day reach Itzik;
  the rest waits, silently, with one log line. The text is cleaned (no control characters, one line), at most 300.
*/
const fs = require('fs');
const path = require('path');

const MAX = 300;
const FILE = 'leads-missing.json';
const MAX_BYTES = 64 * 1024;
const PER_RUN = 3;
const PER_DAY = 10;

function clean(x) {
  return String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX).trim();
}

/*
  The page sends "<kind line>\n<text>\n\nקוד ..." (ntfyText), the kind being "ליד". Only the line the button sends
  counts: the first content line, or the one right after a "ליד" kind line. Never a line further down.
*/
function parse(text) {
  const L = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  let first = L[0] || '';
  if (first === 'ליד') first = L[1] || '';
  const m = /^לוח לידים[ \t]*[:：][ \t]*חסר[ \t:：]*(.*)$/.exec(first);
  if (!m) return null;
  const t = clean(m[1]);
  return t ? { t } : null;
}

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, v, mode) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(v, null, 1), 'utf8');
  if (mode) { try { fs.chmodSync(tmp, mode); } catch (e) { /* the owner may still read it */ } }
  fs.renameSync(tmp, f);
}
function ilDay(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
const okId = (id) => /^[A-Za-z0-9_-]{1,40}$/.test(String(id || ''));

// The customer's side. Returns the saved entry.
function record(dataPath, t, now) {
  const at = new Date(now || Date.now()).toISOString();
  const f = path.join(dataPath, 'status', FILE);
  let L = readJson(f, []);
  if (!Array.isArray(L)) L = [];
  const e = { id: at.replace(/\D/g, '').slice(0, 17) + '-' + (L.length % 1000), at, t: clean(t) };
  if (!e.t) throw new Error('empty');
  L.push(e);
  writeJson(f, L.slice(-200), 0o644);
  return e;
}

/*
  Review 18.11, round 2: what is kept per customer in Itzik's data/status/leads-missing-told.json:
    ids   lines that are finished (reached him, or given up after MAX_TRIES failed tries),
    day   the Israel day of n, n: send ATTEMPTS that day (every try counts, also one that failed: a WhatsApp and a push
          that keep failing, or a push that throws after it went, can never send more than PER_DAY a day),
    tries tries per line not finished yet,
    lock  when a run took this customer's lines; another run leaves him alone for LOCK_MS, so two runs never send twice.
*/
const TOLD = 'leads-missing-told.json';
const MAX_TRIES = 3;
const LOCK_MS = 5 * 60 * 1000;
function toldOf(ownerData) { const t = readJson(path.join(ownerData, 'status', TOLD), {}); return t && typeof t === 'object' && !Array.isArray(t) ? t : {}; }
function mine(told, id, day) {
  const m = told[id] && typeof told[id] === 'object' && !Array.isArray(told[id]) ? told[id] : {};
  return { ids: Array.isArray(m.ids) ? m.ids : [], day, n: m.day === day ? (+m.n || 0) : 0,
    tries: m.tries && typeof m.tries === 'object' && !Array.isArray(m.tries) ? m.tries : {}, lock: +m.lock || 0,
    later: m.later && typeof m.later === 'object' && !Array.isArray(m.later) ? m.later : {} };
}
function save(ownerData, tenantId, m) {
  const told = toldOf(ownerData);
  told[tenantId] = { ids: m.ids.slice(-400), day: m.day, n: m.n, tries: m.tries, lock: m.lock || 0, later: m.later };
  writeJson(path.join(ownerData, 'status', TOLD), told);
}

/*
  Itzik's side. tenant: { id, dir, name }. Returns { items: [{ id, t, line, name }], held, why }: at most PER_RUN items,
  never past PER_DAY attempts this Israel day. Every item returned is counted as an attempt and the customer is locked
  until finish() of each and unlock(). held: new lines waiting over a cap. why: 'big' (a file over 64KB) or 'busy'
  (another run holds him).
*/
function collect(ownerData, tenant, now) {
  const out = { items: [], held: 0, why: '' };
  if (!tenant || !tenant.dir || !okId(tenant.id)) return out;
  const ms = now || Date.now();
  const f = path.join(tenant.dir, 'data', 'status', FILE);
  let st; try { st = fs.statSync(f); } catch (e) { return out; }
  if (!st.isFile()) return out;
  if (st.size > MAX_BYTES) { out.why = 'big'; return out; }
  const L = readJson(f, []);
  if (!Array.isArray(L) || !L.length) return out;
  const m = mine(toldOf(ownerData), tenant.id, ilDay(ms));
  if (m.lock && ms - m.lock < LOCK_MS) { out.why = 'busy'; return out; }
  const seen = new Set(m.ids);
  const room = Math.max(0, Math.min(PER_RUN, PER_DAY - m.n));
  const name = clean(tenant.name || tenant.id).slice(0, 60) || tenant.id;
  L.forEach((e) => {
    const id = clean(e && e.id).replace(/[^0-9A-Za-z-]/g, '').slice(0, 40);
    const t = clean(e && e.t);
    if (!id || !t || seen.has(id)) return;
    if (m.later[id] === m.day) return; // round 3: given up today but its idea was not written: tomorrow again
    seen.add(id);
    if (out.items.length < room) out.items.push({ id, t, line: '💡 ' + name + ' בלוח הלידים: חסר לו: ' + t, name });
    else out.held++;
  });
  if (out.items.length) {
    out.items.forEach((it) => { m.tries[it.id] = (+m.tries[it.id] || 0) + 1; });
    m.n += out.items.length;
    m.lock = ms;
    save(ownerData, tenant.id, m);
  }
  return out;
}

function idea(ownerData, tenant, item, ms) {
  const at = new Date(ms).toISOString();
  const dir = path.join(ownerData, 'better', 'better');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, at.replace(/\D/g, '').slice(0, 12) + '-lm-' + tenant.id + '-' + item.id + '.json'), JSON.stringify({
    at, by: 'tenant:' + tenant.id, who: item.name,
    t: 'בלוח הלידים חסר: ' + item.t,
    d: item.name + ' כתב ב"מה חסר לך כאן?" שבתחתית לוח הלידים: ' + item.t,
    area: 'לידים', size: '',
  }, null, 1), 'utf8');
}

/*
  Itzik's side, after one try of a line. ok: it reached him (WhatsApp or the push). Returns 'done', 'retry' (it waits
  for a next run) or 'gaveup' (MAX_TRIES failed: finished anyway, and still written to the 💡 screen).
  Round 3: when that idea cannot be written, a given up line is not finished: 'later', it waits for the next Israel day.
*/
function finish(ownerData, tenant, item, ok, now) {
  if (!okId(tenant && tenant.id) || !item || !item.id) return '';
  const ms = now || Date.now();
  const m = mine(toldOf(ownerData), tenant.id, ilDay(ms));
  const tries = +m.tries[item.id] || 0;
  const res = ok ? 'done' : tries >= MAX_TRIES ? 'gaveup' : 'retry';
  let res2 = res;
  if (res !== 'retry') {
    let wrote = true;
    try { idea(ownerData, tenant, item, ms); } catch (e) { wrote = false; }
    if (!wrote && res === 'gaveup') { m.later[item.id] = m.day; res2 = 'later'; }
    else {
      // done: it reached him, so it is finished even when the idea could not be written
      if (!m.ids.includes(item.id)) m.ids.push(item.id);
      delete m.tries[item.id]; delete m.later[item.id];
    }
  }
  save(ownerData, tenant.id, m);
  return res2;
}
const done = (ownerData, tenant, item, now) => finish(ownerData, tenant, item, true, now);

// The run is over for this customer (every finish() came back): the next run may take his lines.
function unlock(ownerData, tenant) {
  if (!okId(tenant && tenant.id)) return;
  const m = mine(toldOf(ownerData), tenant.id, ilDay(Date.now()));
  const told = toldOf(ownerData);
  if (!told[tenant.id]) return;
  told[tenant.id].lock = 0;
  writeJson(path.join(ownerData, 'status', TOLD), told);
  return m;
}

module.exports = { parse, record, collect, finish, done, unlock, clean, MAX, MAX_BYTES, PER_RUN, PER_DAY, MAX_TRIES, LOCK_MS };
