'use strict';
/*
  5.11.2026: reading a client's Gmail with the Google connection from the setup
  page (gmail.readonly), instead of IMAP with an app password. Read only by scope:
  this token cannot send, delete or mark anything.

  The output matches tools/mail-search.py, so the same callers can use either:
    [<id>] DD.MM.YYYY HH:MM | <From>
        <Subject>
        <snippet>
  search(access, { text, from, days, limit }) -> [{ id, when, from, subject, snippet }]
  format(list) -> the lines above
  CLI (for a check by hand, the access token from lib/oauth.js check):
    node lib/gmail-api.js <setup token> <step id> [--from x] [--days 7] [--limit 10] [text]
*/
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

function query(o) {
  const q = [];
  if (o.text) q.push(o.text);
  if (o.from) q.push('from:' + o.from);
  q.push('newer_than:' + Math.max(1, Math.min(3650, o.days || 180)) + 'd');
  return q.join(' ');
}
function head(m, name) {
  const h = ((m.payload && m.payload.headers) || []).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}
function when(ms) {
  // Israel time, the same as mail-search.py prints.
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(Number(ms))).reduce((a, x) => (a[x.type] = x.value, a), {});
  return p.day + '.' + p.month + '.' + p.year + ' ' + p.hour + ':' + p.minute;
}

async function get(access, url) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + access }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('gmail ' + r.status);
  return r.json();
}

async function search(access, o) {
  o = o || {};
  const limit = Math.max(1, Math.min(50, o.limit || 10));
  const list = await get(access, API + '/messages?' + new URLSearchParams({ q: query(o), maxResults: String(limit) }));
  const out = [];
  for (const it of (list.messages || [])) {
    const m = await get(access, API + '/messages/' + it.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject');
    out.push({ id: m.id, when: when(m.internalDate), from: head(m, 'From'), subject: head(m, 'Subject'), snippet: String(m.snippet || '').replace(/\s+/g, ' ').slice(0, 200) });
  }
  return out;
}

function format(list) {
  if (!list.length) return 'nothing found';
  return list.map((x) => '[' + x.id + '] ' + x.when + ' | ' + x.from + '\n    ' + x.subject + '\n    ' + x.snippet).join('\n');
}

module.exports = { search, format, query, when };

if (require.main === module) {
  const fs = require('fs'); const path = require('path');
  const a = process.argv.slice(2); const tok = a.shift(); const id = a.shift();
  const o = {}; const words = [];
  while (a.length) { const k = a.shift(); if (k === '--from') o.from = a.shift(); else if (k === '--days') o.days = +a.shift(); else if (k === '--limit') o.limit = +a.shift(); else words.push(k); }
  o.text = words.join(' ');
  const DIR = process.env.SETUP_DIR || path.join(__dirname, '..', 'data', 'setup');
  let saved; try { saved = JSON.parse(JSON.parse(fs.readFileSync(path.join(DIR, tok + '.secrets.json'), 'utf8'))[id].value); } catch (e) { console.error('no google connection for that page and step'); process.exit(2); }
  require('./oauth.js').check(saved).then((r) => {
    if (!r.ok) { console.error('google: ' + r.error); process.exit(1); }
    return search(r.access, o).then((l) => console.log(format(l)));
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
