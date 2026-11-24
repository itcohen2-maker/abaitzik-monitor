'use strict';
/*
  24.11.2026, Itzik: "צריך לעשות סיכומים ומין לוח בקרה", "חיפוש לפי שם".
  The API of the calls archive (spec docs/superpowers/specs/2026-11-24-calls-archive-design.md, plan Task 5).
  handle(route, body, dataPath): the customer's own archive, dataPath is chosen by wa-bridge from his key, never from the body.
  hook(secret, body, ownerDataPath): the cloud PBX webhook, writes one inbox file in the right customer's directory.
  No function here logs a body, a query, a name or a number.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./calls-store.js');
const index = require('./calls-index.js');
const summary = require('./calls-summary.js');

const USD_PER_CALL = 0.01;
const MAX_HOOK = 2 * 1024 * 1024;

function ok(json) { return { status: 200, json }; }
function bad(status, error) { return { status, json: { error } }; }
function ms(at) { const n = typeof at === 'number' ? at : Date.parse(at); return Number.isFinite(n) ? n : 0; }

function retag(dataPath, b, now) {
  const days = Math.max(1, Math.min(90, parseInt(b.days, 10) || 30));
  const from = now - days * 86400000;
  const hit = store.list(dataPath).filter((it) => (it.status === 'summarized' || it.status === 'failed') && ms(it.at) >= from);
  if (!b.confirm) return ok({ count: hit.length, estimateUsd: Math.round(hit.length * USD_PER_CALL * 100) / 100 });
  hit.forEach((it) => { it.status = 'new'; it.tries = 0; store.write(dataPath, it); });
  return ok({ count: hit.length, marked: hit.length });
}

function handle(route, body, dataPath, now) {
  const b = body && typeof body === 'object' ? body : {};
  const t = now == null ? Date.now() : now;
  try {
    switch (route) {
      case 'search':
        return ok(index.search(dataPath, { q: b.q, from: b.from, to: b.to, kind: b.kind, topic: b.topic, contactId: b.contactId, limit: b.limit, offset: b.offset }));
      case 'item': {
        const it = store.read(dataPath, String(b.id || ''));
        return it ? ok({ item: it }) : bad(404, 'none');
      }
      case 'contact':
        if (!b.contactId) return bad(400, 'contactId');
        return ok(index.contactCard(dataPath, String(b.contactId)));
      case 'delete': {
        const id = String(b.id || '');
        const r = store.remove(dataPath, id, t);
        if (r.ok) index.drop(dataPath, id);
        return r.ok ? ok({ ok: true }) : bad(404, 'none');
      }
      case 'name': {
        const r = store.setName(dataPath, b.number, b.name);
        return r.ok ? ok({ ok: true }) : bad(400, 'name');
      }
      case 'topics':
        if (Array.isArray(b.list)) summary.setTopics(dataPath, b.list);
        return ok({ topics: summary.topics(dataPath) });
      case 'private': {
        let moved = 0;
        if (Array.isArray(b.list)) {
          moved = store.setPrivate(dataPath, b.list, t).moved;
          if (moved > 0) index.rebuild(dataPath);
        }
        return ok({ numbers: store.privateList(dataPath), moved });
      }
      case 'retag':
        return retag(dataPath, b, t);
      default:
        return bad(404, 'route');
    }
  } catch (e) { return bad(500, 'server'); }
}

function safe(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80); }

function customerId(ownerDataPath, secret) {
  let map = {};
  try { map = JSON.parse(fs.readFileSync(path.join(ownerDataPath, 'calls-hooks.json'), 'utf8')) || {}; } catch (e) { return null; }
  const s = Buffer.from(String(secret || ''));
  let found = null;
  for (const k of Object.keys(map)) {
    const kb = Buffer.from(k);
    if (kb.length === s.length && s.length > 0 && crypto.timingSafeEqual(kb, s)) found = map[k];
  }
  const id = found && typeof found === 'object' ? found.id : found;
  return typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

function hook(secret, body, ownerDataPath) {
  const id = customerId(ownerDataPath, secret);
  if (!id) return bad(404, 'none');
  let dir;
  try { dir = JSON.parse(fs.readFileSync(path.join(ownerDataPath, 'tenants', 'tenants', id + '.json'), 'utf8')).dir; } catch (e) { return bad(404, 'none'); }
  if (!dir || typeof dir !== 'string') return bad(404, 'none');
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  if (!b || b.extId == null || b.extId === '' || !b.at || !(ms(b.at) > 0)) return bad(400, 'fields');
  let raw; try { raw = JSON.stringify(b); } catch (e) { return bad(400, 'body'); }
  if (Buffer.byteLength(raw) > MAX_HOOK) return bad(413, 'big');
  const provider = safe(b.provider || 'hook') || 'hook';
  const inbox = path.join(dir, 'data', 'calls', 'inbox');
  // 24.11.2026 e2e: a second delivery of the same call before the round took the first one replaced it. Never overwrite:
  // the next free name; intake then sees the same provider+extId and keeps one item (a later transcript fills a waiting one).
  const base = path.join(inbox, provider + '-' + safe(b.extId));
  let file = base + '.json';
  for (let n = 2; fs.existsSync(file) && n < 50; n++) file = base + '-' + n + '.json';
  try {
    fs.mkdirSync(inbox, { recursive: true });
    const tmp = file + '.tmp' + process.pid;
    fs.writeFileSync(tmp, raw, { mode: 0o664 });
    fs.renameSync(tmp, file);
  } catch (e) { return bad(500, 'server'); }
  return ok({ ok: true });
}

module.exports = { handle, hook, customerId, retag, MAX_HOOK };
