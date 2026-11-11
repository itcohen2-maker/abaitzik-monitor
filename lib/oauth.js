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
  // 5.11: the client's Drive (meeting protocols in each customer's folder, the debtors file),
  // instead of sharing a folder with our service account; and YouTube uploads.
  drive: 'https://www.googleapis.com/auth/drive.file', // 11.11: only files the Monitor creates or the client picks (no restricted Drive scope in the Google verification)
  youtube: 'https://www.googleapis.com/auth/youtube.upload',
};

/*
  5.11: the providers that work as plain "public client + PKCE" (no secret of ours):
  - microsoft: the Entra app of data/ms-app.json (the one ms-cal.js used with a device code),
    with a "Mobile and desktop" redirect https://form.it-solution.co.il/oauth/microsoft/callback.
    One tap, the client signs in at Microsoft, no code to copy.
  - fireflies: Fireflies' own OAuth server (api.fireflies.ai/.well-known/oauth-authorization-server),
    the client id made once by dynamic registration: `node lib/oauth.js register fireflies`.
*/
const PUBLIC = {
  microsoft: { auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'openid email offline_access User.Read Calendars.ReadWrite' },
  fireflies: { auth: 'https://api.fireflies.ai/authorize', token: 'https://api.fireflies.ai/token', scope: 'profile email', resource: 'https://api.fireflies.ai/mcp' },
};
/*
  5.11: providers with a secret of ours (confidential clients), set with `node lib/oauth.js set <p> clientId|clientSecret`:
  - linkedin: app "IT Solution Monitor" (264220808) on the individual developer page, products
    "Sign In with OpenID Connect" and "Share on LinkedIn". Tokens live 60 days and LinkedIn gives
    no refresh token to such apps, so the daily check turns the card to "connect again" when it ends.
  - tiktok: an app on developers.tiktok.com with Login Kit and Content Posting (client key = clientId).
*/
const CONF = {
  linkedin: { auth: 'https://www.linkedin.com/oauth/v2/authorization', token: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'openid profile email w_member_social', sep: ' ' },
  tiktok: { auth: 'https://www.tiktok.com/v2/auth/authorize/', token: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic,video.upload', sep: ',', idParam: 'client_key' },
};
const PROVIDERS = ['google', 'meta', 'microsoft', 'fireflies', 'linkedin', 'tiktok'];

function cfg() { try { return JSON.parse(fs.readFileSync(APP_FILE(), 'utf8')) || {}; } catch (e) { return {}; } }
function msApp() {
  try { const o = JSON.parse(fs.readFileSync(process.env.MS_APP_FILE || path.join(__dirname, '..', 'data', 'ms-app.json'), 'utf8')); return o && o.clientId ? o : null; } catch (e) { return null; }
}
function publicClientId(p, c) {
  if (p === 'microsoft') { const m = msApp(); return m && m.clientId; }
  if (p === 'fireflies') return c.fireflies && c.fireflies.clientId;
  return null;
}
function ready(p) {
  const c = cfg();
  if (!c.stateKey) return false;
  if (p === 'google') return !!(c.google && c.google.clientId && c.google.clientSecret);
  if (p === 'meta') return !!(c.meta && c.meta.appId && c.meta.appSecret && c.meta.configId);
  if (PUBLIC[p]) return !!publicClientId(p, c);
  if (CONF[p]) return !!(c[p] && c[p].clientId && c[p].clientSecret);
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
// view: true when the tap came from Itzik's /view preview, so the callback returns there
// and the client's own page is never marked as opened.
function startUrl(p, tok, step, scopes, now, view) {
  if (!ready(p)) return { error: 'notready' };
  const c = cfg(); now = now || Date.now();
  const nonce = b64u(crypto.randomBytes(12));
  const state = sign(Object.assign({ p, t: tok, s: step, n: nonce, exp: now + TTL }, view ? { v: 1 } : {}), c.stateKey);
  for (const [k, v] of pending) if (now - v.at > TTL) pending.delete(k);
  if (p === 'google') {
    const verifier = b64u(crypto.randomBytes(32));
    pending.set(nonce, { verifier, at: now });
    const q = new URLSearchParams({
      client_id: c.google.clientId, redirect_uri: redirectUri('google'), response_type: 'code',
      scope: scopesFor('google', scopes).join(' '), access_type: 'offline', prompt: 'consent',
      state, // 11.11: no include_granted_scopes: an earlier YouTube grant was merged in, and Google refuses drive.file + youtube.upload together (400 invalid_request)
      code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
    });
    if (tok === 'f837b9adea42a6f2ceda' || tok === 'efaa088b8211e34746f6') q.set('hl', 'en'); // 11.11: the internal test page records the Google verification demo in English
    return { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q };
  }
  if (PUBLIC[p]) {
    const P = PUBLIC[p];
    const verifier = b64u(crypto.randomBytes(32));
    pending.set(nonce, { verifier, at: now });
    const o = { client_id: publicClientId(p, c), redirect_uri: redirectUri(p), response_type: 'code', scope: P.scope, state,
      code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' };
    if (p === 'microsoft') o.prompt = 'select_account';
    if (P.resource) o.resource = P.resource;
    return { url: P.auth + '?' + new URLSearchParams(o) };
  }
  if (CONF[p]) {
    const P = CONF[p];
    const o = { [P.idParam || 'client_id']: c[p].clientId, redirect_uri: redirectUri(p), response_type: 'code', scope: P.scope, state };
    return { url: P.auth + '?' + new URLSearchParams(o) };
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
  const base = { t: st.t, s: st.s, v: !!st.v };
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

  if (PUBLIC[p]) {
    const pv = pending.get(st.n); pending.delete(st.n);
    if (!pv) return Object.assign({ ok: false, error: 'state' }, base);
    const o = { grant_type: 'authorization_code', code, client_id: publicClientId(p, c), redirect_uri: redirectUri(p), code_verifier: pv.verifier };
    if (PUBLIC[p].resource) o.resource = PUBLIC[p].resource;
    const j = await postForm(PUBLIC[p].token, o);
    if (!j.access_token) return Object.assign({ ok: false, error: 'exchange', detail: String(j.error_description || j.error || '').split('\n')[0].slice(0, 120) }, base);
    if (!j.refresh_token) return Object.assign({ ok: false, error: 'norefresh' }, base);
    let who = idEmail(j.id_token);
    if (!who && p === 'microsoft') { try { const m = await getJson('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: 'Bearer ' + j.access_token } }); who = m.mail || m.userPrincipalName || ''; } catch (e) {} }
    return Object.assign({ ok: true, who, saved: { provider: p, refresh_token: j.refresh_token, scope: j.scope || '', who, at: new Date(now || Date.now()).toISOString() } }, base);
  }

  if (CONF[p]) {
    const P = CONF[p];
    const j = await postForm(P.token, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(p),
      [P.idParam || 'client_id']: c[p].clientId, client_secret: c[p].clientSecret });
    if (!j.access_token) return Object.assign({ ok: false, error: 'exchange', detail: String(j.error_description || j.error || '').slice(0, 120) }, base);
    let who = idEmail(j.id_token);
    if (!who && p === 'tiktok') {
      try { const u = await getJson('https://open.tiktokapis.com/v2/user/info/?fields=display_name', { headers: { Authorization: 'Bearer ' + j.access_token } }); who = (u.data && u.data.user && u.data.user.display_name) || ''; } catch (e) {}
    }
    const t = now || Date.now();
    return Object.assign({ ok: true, who, saved: { provider: p, access_token: j.access_token, refresh_token: j.refresh_token || '',
      expires_at: j.expires_in ? new Date(t + j.expires_in * 1000).toISOString() : '', scope: j.scope || '', who, at: new Date(t).toISOString() } }, base);
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
  if (PUBLIC[saved.provider]) {
    const p = saved.provider;
    if (!ready(p)) return { ok: false, revoked: false, error: 'notready' };
    const o = { grant_type: 'refresh_token', refresh_token: saved.refresh_token, client_id: publicClientId(p, c) };
    if (p === 'microsoft') o.scope = PUBLIC.microsoft.scope;
    if (PUBLIC[p].resource) o.resource = PUBLIC[p].resource;
    const j = await postForm(PUBLIC[p].token, o);
    // Microsoft and Fireflies may rotate the refresh token: the caller keeps r.refresh when it differs.
    if (j.access_token) return { ok: true, access: j.access_token, refresh: j.refresh_token || saved.refresh_token };
    return { ok: false, revoked: j.error === 'invalid_grant', error: String(j.error || 'refresh') };
  }
  if (CONF[saved.provider]) {
    const p = saved.provider, P = CONF[p];
    if (!ready(p)) return { ok: false, revoked: false, error: 'notready' };
    if (saved.refresh_token) {
      const j = await postForm(P.token, { grant_type: 'refresh_token', refresh_token: saved.refresh_token,
        [P.idParam || 'client_id']: c[p].clientId, client_secret: c[p].clientSecret });
      if (j.access_token) return { ok: true, access: j.access_token, refresh: j.refresh_token || saved.refresh_token };
      return { ok: false, revoked: j.error === 'invalid_grant', error: String(j.error || 'refresh') };
    }
    // No refresh token (LinkedIn): the access token itself must still answer.
    const r = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: 'Bearer ' + saved.access_token }, signal: AbortSignal.timeout(20000) });
    if (r.ok) return { ok: true, access: saved.access_token };
    return { ok: false, revoked: r.status === 401, error: 'linkedin ' + r.status };
  }
  if (saved.provider === 'meta') {
    const j = await getJson(GRAPH + '/me?fields=id&access_token=' + encodeURIComponent(saved.token));
    if (j.id) return { ok: true, access: saved.token };
    const e = j.error || {};
    return { ok: false, revoked: e.code === 190 || e.code === 102, error: String(e.message || 'meta').slice(0, 120) };
  }
  return { ok: false, revoked: false, error: 'provider' };
}

// 5.11: Fireflies hands out client ids by dynamic registration (RFC 7591). Done once; the id goes to data/oauth-app.json.
async function registerFireflies() {
  const j = await getJson('https://api.fireflies.ai/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'IT Solution Monitor', redirect_uris: [redirectUri('fireflies')], grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], token_endpoint_auth_method: 'none', client_uri: 'https://it-solution.co.il', policy_uri: 'https://it-solution.co.il/privacy', tos_uri: 'https://it-solution.co.il/terms' }) });
  if (!j.client_id) throw new Error('register: ' + JSON.stringify(j).slice(0, 200));
  return j.client_id;
}

module.exports = { ready, startUrl, callback, check, verify, sign, scopesFor, redirectUri, SCOPES, PROVIDERS, _pending: pending };

/*
  node lib/oauth.js set google clientId            the value is read from stdin, never the command line
  node lib/oauth.js set google clientSecret
  node lib/oauth.js set meta appId|appSecret|configId
  node lib/oauth.js status                         which providers are ready
  The state key is made on the first set.
*/
if (require.main === module) {
  const [cmd, p, field] = process.argv.slice(2);
  if (cmd === 'status') { console.log(PROVIDERS.map((x) => x + ': ' + (ready(x) ? 'ready' : 'not set')).join('\n')); process.exit(0); }
  if (cmd === 'register' && p === 'fireflies') {
    registerFireflies().then((id) => {
      const c = cfg(); c.stateKey = c.stateKey || crypto.randomBytes(32).toString('hex'); c.fireflies = { clientId: id };
      const f = APP_FILE(); fs.writeFileSync(f + '.tmp', JSON.stringify(c, null, 1), { mode: 0o600 }); fs.renameSync(f + '.tmp', f); fs.chmodSync(f, 0o600);
      console.log('fireflies client registered: ' + id);
    }, (e) => { console.error(e.message); process.exit(1); });
    return;
  }
  const ok = { google: ['clientId', 'clientSecret'], meta: ['appId', 'appSecret', 'configId'], linkedin: ['clientId', 'clientSecret'], tiktok: ['clientId', 'clientSecret'] };
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
