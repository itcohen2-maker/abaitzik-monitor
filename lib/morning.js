'use strict';
/*
  Morning (Green Invoice) client, read only.

  24.10.2026, Stage 4 of the money work. Used by money.js, and only when the
  'morning' feature is on (lib/features.js, approved by Itzik). It reads open
  invoices and never creates, changes or closes a document, and never moves money.

  Keys: env MORNING_ID and MORNING_SECRET, per tenant env file. Nothing here
  stores them; the caller passes them in.

  Assumptions about the Morning API. Written from the public docs as remembered,
  not checked against a live account. Check each one in the sandbox before
  trusting the numbers:
  - POST /account/token with {id, secret} returns {token, expires}. `expires`
    is read as milliseconds when it is large, seconds otherwise. The token is
    sent as "Authorization: Bearer <token>".
  - POST /documents/search takes {type, status, page, pageSize} and returns
    {items, total}. Paging stops when a page comes back short.
  - Document type codes: 300 (tax invoice) and 305 (tax invoice receipt) are
    assumed. Status 0 is assumed to be "open". Because the status code is an
    assumption, every document is also checked by its own unpaid amount, so a
    closed one with nothing left to pay never counts as open.
  - Amounts are shekels as numbers. Paid amount is read from payedAmount or
    paidAmount, or summed from payments[].amount. Client name is client.name
    or clientName. Dates are ISO strings, or anything Date.parse reads.
  A missing paid amount counts as zero. A missing due date falls back to the
  document date.

  Failure rule (saving skill, rule 4): a failed login or a refused request
  throws once and the caller stops. Nothing here retries.
*/

const BASE = 'https://api.greeninvoice.co.il/api/v1';
const SANDBOX_BASE = 'https://sandbox.d.greeninvoice.co.il/api/v1';
const INVOICE_TYPES = [300, 305];
const OPEN_STATUS = 0;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

class MorningError extends Error {
  constructor(msg, status) { super(msg); this.name = 'MorningError'; this.status = status || 0; }
}

function baseFor(sandbox) { return sandbox ? SANDBOX_BASE : BASE; }

// Epoch in milliseconds, whatever unit the server used.
function expiresMs(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? n : n * 1000;
}

async function call(fetchFn, url, init) {
  let res;
  try { res = await fetchFn(url, init); } catch (e) { throw new MorningError('no answer from Morning: ' + e.message, 0); }
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok) throw new MorningError('Morning answered ' + res.status, res.status);
  return body || {};
}

/*
  A token for one run. The caller asks once per run, so there is no cache to
  go stale and no secret written anywhere.
*/
async function token(creds, opts) {
  const o = opts || {};
  const fetchFn = o.fetch || globalThis.fetch;
  if (!creds || !creds.id || !creds.secret) throw new MorningError('no MORNING_ID or MORNING_SECRET', 0);
  const body = await call(fetchFn, baseFor(o.sandbox) + '/account/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: creds.id, secret: creds.secret }),
  });
  if (!body.token) throw new MorningError('Morning gave no token', 0);
  return { token: String(body.token), expiresAt: expiresMs(body.expires) };
}

function paidOf(d) {
  if (typeof d.payedAmount === 'number') return d.payedAmount;
  if (typeof d.paidAmount === 'number') return d.paidAmount;
  if (Array.isArray(d.payments)) {
    return d.payments.reduce((a, p) => a + (Number(p && p.amount) || 0), 0);
  }
  return 0;
}

// One document, as money.js needs it. Returns null when nothing is left to pay.
function normalize(d) {
  if (!d || typeof d !== 'object') return null;
  const amount = Number(d.amount) || 0;
  const left = Math.round((amount - paidOf(d)) * 100) / 100;
  if (!(left > 0)) return null;
  const date = d.documentDate || d.date || d.createdDate || '';
  const due = d.dueDate || date;
  const t = Date.parse(due);
  return {
    id: String(d.id || d.documentNumber || d.number || ''),
    number: String(d.number || d.documentNumber || ''),
    client: String((d.client && d.client.name) || d.clientName || ''),
    date: String(date),
    due: isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '',
    amount,
    left,
  };
}

/*
  Every open invoice of the account, normalized. Read only.
  Returns {items, total}; items are the ones with something left to pay.
  opts.token lets a caller reuse one login; opts.fetch is the injected fetch for tests.
*/
async function openInvoices(creds, opts) {
  const o = opts || {};
  const fetchFn = o.fetch || globalThis.fetch;
  const tk = o.token || (await token(creds, o));
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk.token };
  const items = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await call(fetchFn, baseFor(o.sandbox) + '/documents/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: INVOICE_TYPES, status: [OPEN_STATUS], page, pageSize: PAGE_SIZE }),
    });
    const rows = Array.isArray(body.items) ? body.items : (Array.isArray(body.data) ? body.data : []);
    total = Number(body.total) || total;
    rows.forEach((r) => { const n = normalize(r); if (n) items.push(n); });
    if (rows.length < PAGE_SIZE) break;
  }
  return { items, total: total || items.length };
}

module.exports = { BASE, SANDBOX_BASE, INVOICE_TYPES, MorningError, token, openInvoices, normalize, baseFor };
