'use strict';
/*
  21.11.2026 (security review): a SUMIT payment return is bound to one tenant and one order before it changes anything.
  - the payment is reserved on disk (DATA/pay/<pid>.lock, O_EXCL) BEFORE the first await, so a double click or two
    returns with the same payment id cannot both start a standing order;
  - the payment's ExternalIdentifier (SUMIT Payment.ExternalIdentifier, caller-supplied, returned by /billing/payments/get)
    must equal the tenant; when SUMIT returns it empty, only a recent start record of that tenant counts (24 hours,
    the ExpirationHours of the payment page);
  - the SUMIT CustomerID is bound to the tenant on first payment (DATA/pay/customers/<tenant>.json); another tenant
    with the same CustomerID, or the same tenant with another one, is refused;
  - a payment id already recorded for another tenant is refused.
  Nothing here calls SUMIT. The callers pass the payment record they fetched.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const START_MS = 24 * 3600e3;
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }

// 4th review: a lock is a handle { path, owner }. The lock file holds the owner id: only the owner releases it, and the
// owner heartbeats it (touch) between steps. A lock whose mtime is older than 10 minutes is taken over, once; the takeover
// is O_EXCL on a marker file, and a marker older than 10 minutes (its taker crashed) is cleared first.
const STALE_MS = 10 * 60e3;
function lockFile(DATA, name) {
  if (!/^[a-z0-9-]+$/.test(String(name || ''))) throw new Error('bad reservation name');
  const dir = path.join(DATA, 'pay'); fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name + '.lock');
}
// The takeover marker: O_EXCL. Returns true when this caller holds it.
function takeMarker(tk, t) {
  for (let i = 0; i < 2; i++) {
    try { fs.closeSync(fs.openSync(tk, 'wx')); return true; } catch (e) {
      if (e.code !== 'EEXIST') return false;
      let st; try { st = fs.statSync(tk); } catch (x) { continue; }
      if (t - st.mtimeMs < STALE_MS) return false;
      try { fs.unlinkSync(tk); } catch (x) { return false; }
    }
  }
  return false;
}
// The reservation of a payment id (or any name, e.g. 'order-<id>'). Null when someone else holds it.
function reserveName(DATA, name, now) {
  const f = lockFile(DATA, name);
  const t = now == null ? Date.now() : now;
  const owner = crypto.randomBytes(12).toString('hex');
  const body = JSON.stringify({ owner, at: new Date(t).toISOString() });
  try { fs.writeFileSync(f, body, { flag: 'wx' }); return { path: f, owner }; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  let st; try { st = fs.statSync(f); } catch (e) { return null; }
  if (t - st.mtimeMs < STALE_MS) return null;
  const tk = f + '.takeover';
  if (!takeMarker(tk, t)) return null;
  try {
    if (t - fs.statSync(f).mtimeMs < STALE_MS) return null;
    fs.unlinkSync(f);
    fs.writeFileSync(f, body, { flag: 'wx' });
    return { path: f, owner };
  } catch (e) { return null; } finally { try { fs.unlinkSync(tk); } catch (e) { /* gone */ } }
}
function reserve(DATA, pid) { return reserveName(DATA, String(pid).replace(/\D/g, '')); }
// Still ours? (the lock file names this owner)
function owned(h) { if (!h) return false; const r = readJson(h.path, null); return !!r && r.owner === h.owner; }
function assertOwned(h) { if (!owned(h)) throw new Error('lock lost: ' + (h && h.path)); }
// The heartbeat between steps: a slow holder that is still working keeps its lock; a holder that lost it throws.
function touch(h, now) {
  assertOwned(h);
  const t = (now == null ? Date.now() : now) / 1000;
  fs.utimesSync(h.path, t, t);
}
// Only the owner releases. A holder whose lock was taken over never deletes the new holder's lock.
function release(h) { if (h && owned(h)) { try { fs.unlinkSync(h.path); } catch (e) { /* already gone */ } } }

// The tenant a payment id was already recorded for, or '' (lib/pay-guard owns the record name: DATA/pay/<pid>.json).
function ownerOf(DATA, pid) { const r = readJson(path.join(DATA, 'pay', String(pid).replace(/\D/g, '') + '.json'), null); return r ? String(r.tenant || '') : ''; }

// A payment-page start for this tenant in the last 24 hours (written by /api/pay/start, see startWrite).
function startRecent(DATA, tenant, now) {
  const s = readJson(path.join(DATA, 'pay', 'starts', tenant + '.json'), null);
  const t = s && Date.parse(s.at);
  return !!t && (now == null ? Date.now() : now) - t <= START_MS;
}
function startWrite(DATA, tenant, now) {
  const dir = path.join(DATA, 'pay', 'starts'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, tenant + '.json'), JSON.stringify({ at: new Date(now == null ? Date.now() : now).toISOString() }));
}

/*
  The payment belongs to this tenant. Async because an empty identifier is looked up at SUMIT (opts.lookup(customerId)
  returns the SUMIT customer's ExternalIdentifier: /accounting/customers/get). Fail closed, never open:
  - an echoed identifier must be this tenant ('tenant' otherwise, no lookup);
  - an empty one: the SUMIT customer must say this tenant ('tenant' foreign, 'unverified' when it says nothing,
    'lookup' when SUMIT can not answer or no lookup is given). A refusal calls opts.owner(text) once: the 📋 line
    so Itzik can approve by hand.
  Returns { ok: true } or { ok: false, why }.
*/
async function checkPayment(DATA, p, tenant, now, opts) {
  const o = opts || {};
  const refuse = (why) => {
    if (typeof o.owner === 'function') { try { o.owner('תשלום של ' + tenant + ' לא אומת (' + why + '). לאשר ידנית אחרי שבודקים בסאמיט.'); } catch (e) { /* the line is best effort */ } }
    return { ok: false, why };
  };
  const ext = String((p && p.ExternalIdentifier) || '');
  if (ext) return ext === tenant ? { ok: true } : { ok: false, why: 'tenant' };
  if (typeof o.lookup !== 'function') return refuse('lookup');
  let got;
  try { got = String((await o.lookup(p && p.CustomerID)) || ''); } catch (e) { return refuse('lookup'); }
  if (!got) return refuse('unverified');
  return got === tenant ? { ok: true } : refuse('tenant');
}

/*
  The SUMIT customer of this tenant. First payment binds it; a different customer, or the same customer on another
  tenant, is refused. Returns { ok: true } or { ok: false, why: 'customer' }.
*/
function bindCustomer(DATA, tenant, customerId) {
  const cid = Number(customerId);
  if (!cid) return { ok: false, why: 'customer' };
  const dir = path.join(DATA, 'pay', 'customers'); fs.mkdirSync(dir, { recursive: true });
  const mine = readJson(path.join(dir, tenant + '.json'), null);
  if (mine) return Number(mine.customerId) === cid ? { ok: true } : { ok: false, why: 'customer' };
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /\.json$/.test(f)); } catch (e) { names = []; }
  if (names.some((f) => Number((readJson(path.join(dir, f), {}) || {}).customerId) === cid)) return { ok: false, why: 'customer' };
  try { fs.writeFileSync(path.join(dir, tenant + '.json'), JSON.stringify({ customerId: cid, at: new Date().toISOString() }), { flag: 'wx' }); } catch (e) { return { ok: false, why: 'customer' }; }
  return { ok: true };
}

// The record a finished payment leaves (the same name for entry, offer, trade and add-on payments).
function recordWrite(DATA, pid, rec) {
  fs.mkdirSync(path.join(DATA, 'pay'), { recursive: true });
  const f = path.join(DATA, 'pay', String(pid).replace(/\D/g, '') + '.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(rec, null, 1)); fs.renameSync(f + '.tmp', f);
}

module.exports = { START_MS, reserve, reserveName, release, touch, owned, assertOwned, ownerOf, startRecent, startWrite, checkPayment, bindCustomer, recordWrite };
