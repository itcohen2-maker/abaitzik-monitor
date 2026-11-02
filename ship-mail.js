'use strict';
/*
  Reads the shipments mailbox and writes what it learns into the table.
  6.10.2026, Home Style, version 2. Switched off until the company gives the
  monitor read-only access to Yael's Outlook mailbox (their IT was asked).

    node ship-mail.js            one pass: fetch, apply, write, rebuild if anything changed

  Providers, chosen by SHIP_MAIL_PROVIDER:
    dir    JSON files {id, from, subject, received, body} dropped in data/mail-in/.
           Used to try the rules on real mails before the mailbox is connected.
    graph  Microsoft 365 through Microsoft Graph, application permission Mail.Read
           and nothing else, limited to one mailbox by the company's access policy.
           Needs GRAPH_TENANT, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_MAILBOX in
           the unit's environment file. NOT TRIED against a real tenant yet.

  It only ever reads mail: no send, no reply, no move, no delete. What a mail
  could not be tied to one row goes to mail-queue.json beside the table, where
  Rinat's screen can show it, and the table is not touched for it.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const lib = require('./lib/ship-mail.js');

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeAtomic(f, v) {
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(v), { mode: 0o640 });
  fs.renameSync(tmp, f);
}
const shortId = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

function dirProvider(dir) {
  return async () => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
      .map((f) => readJson(path.join(dir, f), null)).filter((m) => m && m.id);
  };
}

function graphProvider(env) {
  return async (since) => {
    const need = ['GRAPH_TENANT', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'GRAPH_MAILBOX'];
    for (const k of need) if (!env[k]) throw new Error('missing ' + k);
    const tok = await (await fetch('https://login.microsoftonline.com/' + encodeURIComponent(env.GRAPH_TENANT) + '/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.GRAPH_CLIENT_ID, client_secret: env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }).toString(),
    })).json();
    if (!tok.access_token) throw new Error('no token: ' + (tok.error || 'unknown'));
    let url = 'https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(env.GRAPH_MAILBOX)
      + '/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime asc&$select=id,subject,from,receivedDateTime,body'
      + (since ? '&$filter=receivedDateTime ge ' + since : '');
    const out = [];
    for (let page = 0; url && page < 20; page++) {
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok.access_token, Prefer: 'outlook.body-content-type="text"' } });
      if (!r.ok) throw new Error('graph ' + r.status);
      const j = await r.json();
      for (const m of j.value || []) {
        out.push({ id: shortId(m.id), from: (m.from && m.from.emailAddress && m.from.emailAddress.address) || '',
          subject: m.subject || '', received: m.receivedDateTime || '', body: (m.body && m.body.content) || '' });
      }
      url = j['@odata.nextLink'] || '';
    }
    return out;
  };
}

// One pass. Everything it touches is under `sd` (the shipments folder) and `state`.
async function run({ sd, provider, now }) {
  const rowsFile = path.join(sd, 'rows.json');
  const stateFile = path.join(sd, 'mail-state.json');
  const queueFile = path.join(sd, 'mail-queue.json');
  const state = readJson(stateFile, {});
  const msgs = await provider(state.lastReceived || '');
  const rows = readJson(rowsFile, null);
  if (!rows) throw new Error('no rows.json');
  const at = (now || new Date()).toISOString();
  const { applied, queued } = lib.apply(msgs, rows, at);
  if (applied.length) writeAtomic(rowsFile, rows);
  const queue = readJson(queueFile, []);
  const have = new Set(queue.map((q) => q.id));
  for (const q of queued) if (!have.has(q.id)) queue.push(Object.assign({ at }, q));
  writeAtomic(queueFile, queue.slice(-200));
  const last = msgs.map((m) => m.received).filter(Boolean).sort().pop();
  writeAtomic(stateFile, { lastReceived: last || state.lastReceived || '', ranAt: at, fetched: msgs.length });
  return { fetched: msgs.length, applied: applied.length, queued: queued.length };
}

module.exports = { run, dirProvider, graphProvider };

if (require.main === module) {
  const inst = require('./lib/instance.js');
  const sd = inst.shipmentsDir;
  if (!sd) { console.error('ship-mail: no shipmentsDir'); process.exit(1); }
  const kind = process.env.SHIP_MAIL_PROVIDER || '';
  const provider = kind === 'graph' ? graphProvider(process.env)
    : kind === 'dir' ? dirProvider(path.join(inst.dataPath, 'mail-in')) : null;
  if (!provider) { console.error('ship-mail: SHIP_MAIL_PROVIDER is not set (dir or graph); nothing to do'); process.exit(0); }
  run({ sd, provider }).then((r) => {
    console.log(new Date().toISOString() + ' fetched ' + r.fetched + ', applied ' + r.applied + ', queued ' + r.queued);
    if (r.applied) {
      execFileSync('node', ['build.js'], { cwd: __dirname, stdio: 'ignore', timeout: 120000 });
      execFileSync('chmod', ['-R', 'o+rX', path.join(__dirname, 'docs')]);
    }
  }).catch((e) => { console.error('ship-mail failed: ' + e.message); process.exit(1); });
}
