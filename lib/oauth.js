'use strict';
/*
  5.11.2026: "Connect with Google" and "Connect with Facebook" on the client setup
  page (setup.js), instead of pasting an app password. Plan: plans/2026-11-05-oauth-google-meta.md.

  The flow, for both providers:
    /oauth/<p>/start?t=<setup token>&s=<step id>   -> 302 to the provider's consent screen
    /oauth/<p>/callback?code=...&state=...          -> code exchanged here, server side
  The state is signed (HMAC over provider, setup token, step, nonce, expiry), so a
  callback cannot be pointed at somebody else's setup page. Google also gets PKCE;
  the verifier stays in memory here, keyed by the nonce (a restart in the middle
  means the client taps the button again). Only what is needed to keep working is
  saved: Google's refresh token, Meta's long lived or system user token.

  data/oauth-app.json (600, never in git), written with `node lib/oauth.js set`:
    { "stateKey": "<hex>",
      "google": { "clientId": "...apps.googleusercontent.com", "clientSecret": "..." },
      "meta":   { "appId": "1107995065171769", "appSecret": "...", "configId": "..." } }
  No provider block means its button says "opens soon" and nothing breaks.

  Google: OAuth client of type Web in the project it-solution-monitor, redirect
  https://form.it-solution.co.il/oauth/google/callback. Publishing status must be
  "In production" (in "Testing" refresh tokens die after 7 days); unverified is fine
  for now, the client sees Google's warning screen once.
  Meta: app IT Solution Monitor, Facebook Login for Business, a configuration of type
  "System-user access token" (configId), redirect .../oauth/meta/callback. Until App
  Review it works only for people with a role in the app (testers).
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = 'https://form.it-solution.co.il';
const GRAPH = 'https://graph.facebook.com/v21.0';
const APP_FILE = () => process.env.OAUTH_APP_FILE || path.join(__dirname, '..', 'data', 'oauth-app.json');
const TTL = 10 * 60e3;
const pending = new Map(); // nonce -> { verifier, at }

const SCOPES = {
  google: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.events'],
  meta: [], // with Login for Business the permissions live in the configuration, not in the URL
};
// Short names a setup card may use instead of full Google scope URLs.
const GOOGLE_SHORT = {
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  'gmail.compose': 'https://www.googleapis.com/auth/gmail.compose',
  calendar: 'https://www.googleapis.com/auth/calendar.events',
};

function cfg() { try { return JSON.parse(fs.readFileSync(APP_FILE(), 'utf8')) || {}; } catch (e) { return {}; } }
function ready(p) {
  const c = cfg();
  if (!c.stateKey) return false;
  if (p === 'google') return !!(c.google && c.google.clientId && c.google.clientSecret);
  if (p === 'meta') return !!(c.meta && c.meta.appId && c.meta.appSecret && c.meta.configId);
  return false;
}
function redirectUri(p) { return BASE + '/oauth/' + p + '/callback'; }
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

function sign(payload, key) {
  const body = b64u(JSON.stringify(payload));
  return body + '.' + b64u(crypto.createHmac('sha256', key).update(body).digest());
}
// Returns the payload, or null when the signature, the provider or the expiry is wrong.
function verify(state, key, p, now) {
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(state || ''));
  if (!m || !key) return null;
  const want = b64u(crypto.createHmac('sha256', key).update(m[1]).digest());
  const a = Buffer.from(m[2]), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let o; try { o = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return null; }
  if (!o || o.p !== p || !(o.exp > (now || Date.now()))) return null;
  return o;
}

function scopesFor(p, list) {
  if (p !== 'google') return [];
  const out = new Set(['openid', 'email']);
  (list && list.length ? list : SCOPES.google).forEach((s) => out.add(GOOGLE_SHORT[s] || s));
  return [...out];
}

// The consent screen address. Returns { url } or { error: 'notready' }.
function startUrl(p, tok, step, scopes, now) {
  if (!ready(p)) return { error: 'notready' };
  const c = cfg(); now = now || Date.now();
  const nonce = b64u(crypto.randomBytes(12));
  const state = sign({ p, t: tok, s: step, n: nonce, exp: now + TTL }, c.stateKey);
  for (const [k, v] of pending) if (now - v.at > TTL) pending.delete(k);
  if (p === 'google') {
    const verifier = b64u(crypto.randomBytes(32));
    pending.set(nonce, { verifier, at: now });
    const q = new URLSearchParams({
      client_id: c.google.clientId, redirect_uri: redirectUri('google'), response_type: 'code',
      scope: scopesFor('google', scopes).join(' '), access_type: 'offline', prompt: 'consent',
      include_granted_scopes: 'true', state,
      code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
    });
    return { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q };
  }
  const q = new URLSearchParams({
    client_id: c.meta.appId, redirect_uri: redirectUri('meta'), response_type: 'code',
    config_id: c.meta.configId, override_default_response_type: 'true', state,
  });
  return { url: 'https://www.facebook.com/v21.0/dialog/oauth?' + q };
}

async function getJson(url, opts) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(20000) }, opts || {}));
  let j = {}; try { j = await r.json(); } catch (e) {}
  return j;
}
function postForm(url, params) {
  return getJson(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
}
function idEmail(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).email || ''; } catch (e) { return ''; }
}

/*
  The callback. query is the URLSearchParams of the request.
  Returns { ok: true, t, s, who, saved, pages? } or { ok: false, t?, s?, error }.
  error: 'state' (forged, old or another provider), 'denied' (the client pressed cancel),
  'norefresh' (Google gave no refresh token), 'exchange' (the provider refused the code).
*/
async function callback(p, query, now) {
  const c = cfg();
  const st = verify(query.get('state'), c.stateKey, p, now);
  if (!st) return { ok: false, error: 'state' };
  const base = { t: st.t, s: st.s };
  if (query.get('error')) return Object.assign({ ok: false, error: 'denied', detail: String(query.get('error')).slice(0, 80) }, base);
  const code = query.get('code');
  if (!code) return Object.assign({ ok: false, error: 'exchange' }, base);

  if (p === 'google') {
    const pv = pending.get(st.n); pending.delete(st.n);
    if (!pv) return Object.assign({ ok: false, error: 'state' }, base);
    const j = await postForm('https://oauth2.googleapis.com/token', {
      code, client_id: c.google.clientId, client_secret: c.google.clientSecret,
      redirect_uri: redirectUri('google'), grant_type: 'authorization_code', code_verifier: pv.verifier,
    });
    if (!j.access_token) return Object.assign({ ok: false, error: 'exchange', detail: String(j.error || '').slice(0, 80) }, base);
    if (!j.refresh_token) return Object.assign({ ok: false, error: 'norefresh' }, base);
    const who = idEmail(j.id_token);
    return Object.assign({ ok: true, who, saved: { provider: 'google', refresh_token: j.refresh_token, scope: j.scope || '', who, at: new Date(now || Date.now()).toISOString() } }, base);
  }

  const j = await getJson(GRAPH + '/oauth/access_token?' + new URLSearchParams({
    client_id: c.meta.appId, client_secret: c.meta.appSecret, redirect_uri: redirectUri('meta'), code }));
  if (!j.access_token) return Object.assign({ ok: false, error: 'exchange', detail: String((j.error && j.error.message) || '').slice(0, 80) }, base);
  let token = j.access_token;
  // A system user token from Login for Business does not expire. A plain user token
  // (short lived) is traded for a 60 day one; page tokens taken from it do not expire.
  if (j.expires_in && j.expires_in < 86400 * 7) {
    const l = await getJson(GRAPH + '/oauth/access_token?' + new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: c.meta.appId, client_secret: c.meta.appSecret, fb_exchange_token: token }));
    if (l.access_token) token = l.access_token;
  }
  const me = await getJson(GRAPH + '/me?fields=id,name&access_token=' + encodeURIComponent(token));
  const acc = await getJson(GRAPH + '/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=50&access_token=' + encodeURIComponent(token));
  const pages = (acc.data || []).map((x) => ({ id: x.id, name: x.name, token: x.access_token,
    ig: x.instagram_business_account ? { id: x.instagram_business_account.id, username: x.instagram_business_account.username || '' } : null }));
  const who = me.name || '';
  return Object.assign({ ok: true, who, pages: pages.map((x) => ({ id: x.id, name: x.name, ig: x.ig && x.ig.username })),
    saved: { provider: 'meta', token, user: me.id || '', who, pages, at: new Date(now || Date.now()).toISOString() } }, base);
}

/*
  Is a saved connection still alive? Used by oauth-health.js once a day.
  Returns { ok: true, access? } or { ok: false, revoked: bool, error }.
  revoked = the client (or the provider) cut it, so a new tap is needed; anything else is a passing failure.
*/
async function check(saved) {
  const c = cfg();
  if (saved.provider === 'google') {
    if (!ready('google')) return { ok: false, revoked: false, error: 'notready' };
    const j = await postForm('https://oauth2.googleapis.com/token', {
      grant_type: 'refresh_token', refresh_token: saved.refresh_token, client_id: c.google.clientId, client_secret: c.google.clientSecret });
    if (j.access_token) return { ok: true, access: j.access_token };
    return { ok: false, revoked: j.error === 'invalid_grant', error: String(j.error || 'refresh') };
  }
  if (saved.provider === 'meta') {
    const j = await getJson(GRAPH + '/me?fields=id&access_token=' + encodeURIComponent(saved.token));
    if (j.id) return { ok: true, access: saved.token };
    const e = j.error || {};
    return { ok: false, revoked: e.code === 190 || e.code === 102, error: String(e.message || 'meta').slice(0, 120) };
  }
  return { ok: false, revoked: false, error: 'provider' };
}

module.exports = { ready, startUrl, callback, check, verify, sign, scopesFor, redirectUri, SCOPES, _pending: pending };

/*
  node lib/oauth.js set google clientId            the value is read from stdin, never the command line
  node lib/oauth.js set google clientSecret
  node lib/oauth.js set meta appId|appSecret|configId
  node lib/oauth.js status                         which providers are ready
  The state key is made on the first set.
*/
if (require.main === module) {
  const [cmd, p, field] = process.argv.slice(2);
  if (cmd === 'status') { console.log('google: ' + (ready('google') ? 'ready' : 'not set') + '\nmeta: ' + (ready('meta') ? 'ready' : 'not set')); process.exit(0); }
  const ok = { google: ['clientId', 'clientSecret'], meta: ['appId', 'appSecret', 'configId'] };
  if (cmd !== 'set' || !ok[p] || ok[p].indexOf(field) < 0) { console.error('usage: node lib/oauth.js set google clientId|clientSecret | set meta appId|appSecret|configId | status'); process.exit(2); }
  const v = fs.readFileSync(0, 'utf8').trim();
  if (!v || v.length > 500) { console.error('empty or too long'); process.exit(2); }
  const c = cfg();
  c.stateKey = c.stateKey || crypto.randomBytes(32).toString('hex');
  c[p] = c[p] || {}; c[p][field] = v;
  const f = APP_FILE();
  fs.writeFileSync(f + '.tmp', JSON.stringify(c, null, 1), { mode: 0o600 }); fs.renameSync(f + '.tmp', f); fs.chmodSync(f, 0o600);
  console.log(p + '.' + field + ' saved (' + v.length + ' chars). ' + p + ': ' + (ready(p) ? 'ready' : 'still missing fields'));
}
