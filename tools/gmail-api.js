'use strict';
/*
  10.11.2026: read-only reader for a second mailbox through the Gmail API (scope gmail.readonly,
  nothing can be sent, changed or deleted). Same command line as tools/mail-search.py, plus --account.
  Accounts are listed in data/gmail-accounts.json: { "hagitit7": { "setup": "<setup token>", "step": "google", "who": "hagitit7@gmail.com" } }
  The refresh token sits in data/setup/<token>.secrets.json, written by the Google button of the setup page.
  A session never runs this directly (denied in .claude/settings.json): it goes through mail-read.js.
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; }
const account = arg('account');
const days = parseInt(arg('days', '180'), 10);
const limit = parseInt(arg('limit', '10'), 10);
const frm = arg('from');
const id = arg('id');
const flagsWithValue = new Set(['account', 'days', 'limit', 'from', 'id']);
const rest = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { if (flagsWithValue.has(a.slice(2))) i++; continue; }
  rest.push(a);
}
const text = rest.join(' ');

function fail(m) { console.error(m); process.exit(1); }
const j = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

async function accessToken() {
  let acc;
  try { acc = j(path.join(ROOT, 'data/gmail-accounts.json'))[account]; } catch (e) {}
  if (!acc) fail('no such account: ' + account);
  let sec;
  try { sec = j(path.join(ROOT, 'data/setup', acc.setup + '.secrets.json'))[acc.step || 'google']; } catch (e) {}
  if (!sec) fail('account ' + account + ' is not connected yet (the Google button on its setup page was not completed)');
  const rt = JSON.parse(sec.value).refresh_token;
  const app = j(path.join(ROOT, 'data/oauth-app.json')).google;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, refresh_token: rt, grant_type: 'refresh_token' }),
  });
  const t = await r.json();
  if (!t.access_token) fail('token refresh failed: ' + String(t.error || '').slice(0, 80) + ' (the connection was probably revoked)');
  return t.access_token;
}

const B = 'https://gmail.googleapis.com/gmail/v1/users/me/';
let TOKEN;
async function api(p) {
  const r = await fetch(B + p, { headers: { Authorization: 'Bearer ' + TOKEN } });
  if (!r.ok) fail('gmail api ' + r.status + ' ' + (await r.text()).slice(0, 120));
  return r.json();
}
const hdr = (m, n) => ((m.payload.headers || []).find((h) => h.name.toLowerCase() === n) || {}).value || '';
const b64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function bodyOf(part) {
  let plain = '', html = '';
  (function walk(p) {
    if (!p) return;
    if (p.parts) p.parts.forEach(walk);
    else if (p.body && p.body.data && !(p.filename)) {
      if (p.mimeType === 'text/plain') plain += b64(p.body.data);
      else if (p.mimeType === 'text/html') html += b64(p.body.data);
    }
  })(part);
  if (plain.trim()) return plain;
  // keep link targets: invoices often hide the document behind a button
  return html.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, ' $2 ($1) ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function stamp(m) {
  const d = new Date(parseInt(m.internalDate, 10));
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

(async () => {
  if (!account) fail('usage: gmail-api.js --account <name> [text] [--from x] [--days n] [--limit n] [--id <id>]');
  TOKEN = await accessToken();
  if (id) {
    const m = await api('messages/' + encodeURIComponent(id) + '?format=full');
    console.log('From:', hdr(m, 'from'));
    console.log('Date:', hdr(m, 'date'));
    console.log('Subject:', hdr(m, 'subject'));
    console.log();
    console.log(bodyOf(m.payload).replace(/[ \t]+/g, ' ').trim().slice(0, 20000));
    return;
  }
  const q = [text, frm ? 'from:' + frm : '', 'newer_than:' + days + 'd'].filter(Boolean).join(' ');
  const l = await api('messages?maxResults=' + Math.min(limit, 50) + '&q=' + encodeURIComponent(q));
  if (!l.messages || !l.messages.length) return console.log('nothing found for:', q);
  for (const x of l.messages) {
    const m = await api('messages/' + x.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject');
    console.log('[' + x.id + '] ' + stamp(m) + ' | ' + hdr(m, 'from'));
    console.log('   ', hdr(m, 'subject'));
    console.log('   ', String(m.snippet || '').slice(0, 200));
  }
})().catch((e) => fail(String(e.message || e).slice(0, 300)));
