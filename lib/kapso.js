'use strict';
/*
  12.11.2026, Itzik: a customer connects his own WhatsApp number himself from the 🔌 screen, through Kapso
  (a WhatsApp BSP), and the server wires it to his monitor. This is the Kapso Platform API side, no dependencies.
  Base https://api.kapso.ai/platform/v1, header X-API-Key. Config (never in git): data/kapso.json
    { apiKey, project, kapsoProjectSecret }     kapsoProjectSecret signs the project webhook (verifyProjectWebhook)
  State: data/kapso/customers.json { <tenantId>: <kapso customer id> }.
  CLI (root or monitor):  node lib/kapso.js hook <phone_number_id>   registers the per number webhook again.
*/
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const BASE = 'https://api.kapso.ai/platform/v1';
const HOOK_URL = 'https://wa.abaitzik.com/webhook';
const FALLBACK_HOME = 'https://it-solution.co.il';

const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
function wr(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { mode: 0o600 });
  fs.renameSync(f + '.tmp', f);
}
const cfgFile = (dp) => path.join(dp, 'kapso.json');
const custFile = (dp) => path.join(dp, 'kapso', 'customers.json');
function cfg(dp) { return rd(cfgFile(dp), {}) || {}; }

let transport = null; // tests replace it: (method, url, headers, body) => Promise<{status, body}>
function _set(o) { if (o && 'request' in o) transport = o.request; }

function request(method, url, headers, body) {
  if (transport) return transport(method, url, headers, body);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
      const ch = [];
      res.on('data', (c) => ch.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(ch).toString('utf8') }));
    });
    r.on('error', reject);
    r.setTimeout(15000, () => r.destroy(new Error('timeout')));
    if (body) r.write(body);
    r.end();
  });
}

// One Platform API call. Throws with the status and a short reason, never with the key.
async function call(dp, method, p, payload) {
  const c = cfg(dp);
  if (!c.apiKey) throw new Error('no kapso key');
  const body = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null;
  const h = { 'X-API-Key': c.apiKey, Accept: 'application/json' };
  if (body) { h['Content-Type'] = 'application/json'; h['Content-Length'] = body.length; }
  const r = await request(method, BASE + p, h, body);
  let j = null; try { j = JSON.parse(r.body); } catch (e) { /* not json */ }
  if (r.status < 200 || r.status > 299) throw new Error('kapso ' + method + ' ' + p.split('?')[0] + ' ' + r.status + ' ' + String(r.body || '').slice(0, 160).replace(/\s+/g, ' '));
  return j || {};
}

// The customer in Kapso for this tenant, created once.
async function ensureCustomer(dp, tenantId, name) {
  const map = rd(custFile(dp), {}) || {};
  if (map[tenantId]) return map[tenantId];
  const j = await call(dp, 'POST', '/customers', { customer: { name: String(name || tenantId), external_customer_id: String(tenantId) } });
  const id = j.data && j.data.id;
  if (!id) throw new Error('kapso customer without id');
  const again = rd(custFile(dp), {}) || {};
  again[tenantId] = id;
  wr(custFile(dp), again);
  return id;
}

function tenantRec(dp, tenantId) { return rd(path.join(dp, 'tenants', 'tenants', tenantId + '.json'), null); }

// A fresh setup link each call. Back to the customer's monitor on success or failure, else the IT Solution site.
// Dedicated and coexistence (the WhatsApp Business app next to the API) are both offered; he picks.
async function setupLink(dp, tenantId) {
  const rec = tenantRec(dp, tenantId) || {};
  const id = await ensureCustomer(dp, tenantId, rec.title || tenantId);
  const home = rec.host && /^[a-z0-9.-]+$/i.test(String(rec.host)) ? 'https://' + rec.host + '/' : FALLBACK_HOME;
  const j = await call(dp, 'POST', '/customers/' + encodeURIComponent(id) + '/setup_links', { setup_link: {
    success_redirect_url: home, failure_redirect_url: home,
    allowed_connection_types: ['coexistence', 'dedicated'],
  } });
  const url = j.data && j.data.url;
  if (!url || !/^https:\/\//.test(url)) throw new Error('kapso setup link without url');
  return url;
}

// Per number webhook in Meta's payload, to Itzik's bridge. secret is Itzik's wa.json kapsoSecret.
async function registerNumberWebhook(dp, phoneId, secret, url) {
  if (!phoneId || !secret) throw new Error('webhook needs phone id and secret');
  return call(dp, 'POST', '/whatsapp/phone_numbers/' + encodeURIComponent(phoneId) + '/webhooks',
    { whatsapp_webhook: { kind: 'meta', url: url || HOOK_URL, secret_key: secret, active: true } });
}

// The number shown to people, digits only ('' if Kapso does not say).
async function phoneDisplay(dp, phoneId) {
  try {
    const j = await call(dp, 'GET', '/whatsapp/phone_numbers/' + encodeURIComponent(phoneId));
    const d = j.data || {};
    return String(d.display_phone_number_normalized || d.display_phone_number || '').replace(/[^\d+]/g, '');
  } catch (e) { return ''; }
}

// Which tenant a Kapso customer is: the customer map first, then the external id we gave it (the tenant id).
function tenantOf(dp, customer) {
  const c = customer || {};
  const map = rd(custFile(dp), {}) || {};
  const hit = Object.keys(map).find((t) => c.id && map[t] === c.id);
  if (hit) return hit;
  const ext = String(c.external_id || c.external_customer_id || '');
  return ext && /^[a-z0-9][a-z0-9-]{0,40}$/.test(ext) && tenantRec(dp, ext) ? ext : '';
}

function hdr(headers, name) {
  if (!headers) return '';
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name);
  const v = k ? headers[k] : '';
  return Array.isArray(v) ? String(v[0] || '') : String(v || '');
}
// Project webhook: X-Webhook-Signature = hex HMAC-SHA256 of the raw body with the webhook's secret.
function verifyProjectWebhook(raw, headers, secret) {
  try {
    if (!secret) return false;
    const want = Buffer.from(crypto.createHmac('sha256', String(secret)).update(raw).digest('hex'));
    const got = Buffer.from(hdr(headers, 'x-webhook-signature'));
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  } catch (e) { return false; }
}

module.exports = { ensureCustomer, setupLink, registerNumberWebhook, phoneDisplay, tenantOf, verifyProjectWebhook, tenantRec, cfg, _set, HOOK_URL };

if (require.main === module) {
  const dp = path.join(__dirname, '..', 'data');
  if (process.argv[2] === 'hook' && process.argv[3]) {
    const secret = (rd(path.join(dp, 'wa.json'), {}) || {}).kapsoSecret;
    registerNumberWebhook(dp, process.argv[3], secret).then(() => console.log('ok'), (e) => {
      // Kapso allows one meta webhook per number: 'already exists' on a retry is fine.
      if (/ 422 /.test(e.message) && /exist|already|taken/i.test(e.message)) { console.log('ok (already there)'); return; }
      console.error(e.message); process.exit(1);
    });
  }
}
