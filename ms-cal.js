'use strict';
/*
  4.11.2026: Microsoft 365 calendar for a client monitor, with no browser of ours.
  Device code flow: the setup page asks Microsoft for a short code, the client
  opens microsoft.com/devicelogin on any device, types the code, signs in with
  their own 365 account and approves. Their password never reaches us. We keep
  only the refresh token, in data/setup/<token>.secrets.json (600), under "cal".

  data/ms-app.json (600, not in git): { "clientId": "...", "tenant": "common" }
  The app is registered once in Microsoft Entra: "Accounts in any organizational
  directory and personal Microsoft accounts", Allow public client flows = Yes,
  delegated permissions Calendars.ReadWrite, User.Read, offline_access. No secret.
*/
const fs = require('fs');
const path = require('path');
const SCOPE = 'offline_access User.Read Calendars.ReadWrite';
const pending = new Map(); // setup token -> { device_code, interval, expiresAt, nextAt }

function app() {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ms-app.json'), 'utf8'));
    if (o && /^[0-9a-f-]{36}$/i.test(o.clientId || '')) return { clientId: o.clientId, tenant: o.tenant || 'common' };
  } catch (e) {}
  return null;
}
function ready() { return !!app(); }

async function form(url, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return j;
}

async function start(tok) {
  const a = app(); if (!a) return { error: 'notready' };
  const j = await form('https://login.microsoftonline.com/' + a.tenant + '/oauth2/v2.0/devicecode', { client_id: a.clientId, scope: SCOPE });
  if (!j.device_code) return { error: 'ms', detail: j.error || 'devicecode' };
  pending.set(tok, { device_code: j.device_code, interval: (j.interval || 5) * 1000, expiresAt: Date.now() + (j.expires_in || 900) * 1000, nextAt: 0 });
  return { code: j.user_code, url: j.verification_uri || 'https://microsoft.com/devicelogin', minutes: Math.round((j.expires_in || 900) / 60) };
}

// Returns { status: 'pending' | 'ok' | 'expired' | 'declined' | 'none' | 'error', tokens?, who? }
async function poll(tok) {
  const a = app(); const p = pending.get(tok);
  if (!a || !p) return { status: 'none' };
  if (Date.now() > p.expiresAt) { pending.delete(tok); return { status: 'expired' }; }
  if (Date.now() < p.nextAt) return { status: 'pending' };
  p.nextAt = Date.now() + p.interval;
  const j = await form('https://login.microsoftonline.com/' + a.tenant + '/oauth2/v2.0/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: a.clientId, device_code: p.device_code });
  if (j.access_token) {
    pending.delete(tok);
    let who = '';
    try { const m = await (await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: 'Bearer ' + j.access_token } })).json(); who = m.mail || m.userPrincipalName || ''; } catch (e) {}
    return { status: 'ok', who, tokens: { refresh_token: j.refresh_token, scope: j.scope, who } };
  }
  if (j.error === 'authorization_pending') return { status: 'pending' };
  if (j.error === 'slow_down') { p.interval += 5000; return { status: 'pending' }; }
  pending.delete(tok);
  if (j.error === 'expired_token') return { status: 'expired' };
  if (j.error === 'authorization_declined') return { status: 'declined' };
  return { status: 'error', detail: j.error_description ? String(j.error_description).split('\n')[0].slice(0, 200) : (j.error || '') };
}

// For the monitor later: a fresh access token from the saved refresh token.
// Microsoft may rotate the refresh token; the caller saves the new one.
async function accessToken(refreshToken) {
  const a = app(); if (!a) throw new Error('ms-app.json missing');
  const j = await form('https://login.microsoftonline.com/' + a.tenant + '/oauth2/v2.0/token', { grant_type: 'refresh_token', client_id: a.clientId, refresh_token: refreshToken, scope: SCOPE });
  if (!j.access_token) throw new Error(j.error || 'refresh');
  return { access: j.access_token, refresh: j.refresh_token || refreshToken };
}

module.exports = { ready, start, poll, accessToken };
