'use strict';
/*
  18.11.2026, Itzik: the leads board goes to every customer, "ושואלים אותם מה חסר להם"
  (docs/superpowers/specs/2026-11-18-leads-board-design.md, goal 10). At the bottom of a customer's board:
  "💡 מה חסר לך כאן?", one line. The page sends it as "לוח לידים: חסר <text>".

  Two sides, no model, and neither writes into the other's folder (as lib/change-requests.js):
  1. The customer's listener (listen.js): parse() and record() keep it in his data/status/leads-missing.json
     (0644, the last 200), and he is answered "תודה, העברתי לאיציק.".
  2. Itzik's tenants-health.js (every minute, as Itzik): collect() reads that file for each customer, and every
     line not handed over yet becomes an idea in Itzik's data/better/better (the 💡 רעיונות screen, by
     "tenant:<id>", area לידים, no size, so improve.js never builds it by itself) and one WhatsApp line to him:
     "💡 <name> בלוח הלידים: חסר לו: <text>". What was handed over is kept in his data/status/leads-missing-told.json.

  The customer's text is data: cleaned (no control characters, one line), at most 300 characters, on both sides.
*/
const fs = require('fs');
const path = require('path');

const MAX = 300;
const FILE = 'leads-missing.json';

function clean(x) {
  return String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX).trim();
}

// "לוח לידים: חסר <text>" on a line of its own (the page sends "<kind line>\n<text>\n\nקוד ...").
function parse(text) {
  const m = /^[ \t]*לוח לידים[ \t]*[:：][ \t]*חסר[ \t:：]*(.*)$/m.exec(String(text || ''));
  if (!m) return null;
  const t = clean(m[1]);
  return t ? { t } : null;
}

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, v, mode) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(v, null, 1), 'utf8');
  if (mode) { try { fs.chmodSync(tmp, mode); } catch (e) { /* the owner may still read it */ } }
  fs.renameSync(tmp, f);
}

// The customer's side. Returns the saved entry.
function record(dataPath, t, now) {
  const at = new Date(now || Date.now()).toISOString();
  const f = path.join(dataPath, 'status', FILE);
  let L = readJson(f, []);
  if (!Array.isArray(L)) L = [];
  const e = { id: at.replace(/\D/g, '').slice(0, 17) + '-' + (L.length % 1000), at, t: clean(t) };
  if (!e.t) throw new Error('empty');
  L.push(e);
  writeJson(f, L.slice(-200), 0o644);
  return e;
}

// Itzik's side. tenant: { id, dir, name }. Returns the WhatsApp lines to send him (one per new entry).
function collect(ownerData, tenant, now) {
  if (!tenant || !tenant.dir || !/^[A-Za-z0-9_-]{1,40}$/.test(String(tenant.id || ''))) return [];
  const L = readJson(path.join(tenant.dir, 'data', 'status', FILE), []);
  if (!Array.isArray(L) || !L.length) return [];
  const toldF = path.join(ownerData, 'status', 'leads-missing-told.json');
  const told = readJson(toldF, {});
  const seen = new Set(Array.isArray(told[tenant.id]) ? told[tenant.id] : []);
  const name = clean(tenant.name || tenant.id).slice(0, 60) || tenant.id;
  const dir = path.join(ownerData, 'better', 'better');
  const out = [];
  L.forEach((e, i) => {
    const id = clean(e && e.id).slice(0, 40);
    const t = clean(e && e.t);
    if (!id || !t || seen.has(id)) return;
    const at = new Date(now || Date.now()).toISOString();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, at.replace(/\D/g, '').slice(0, 12) + '-lm-' + tenant.id + '-' + id.replace(/[^0-9A-Za-z-]/g, '') + '.json');
    fs.writeFileSync(file, JSON.stringify({
      at, by: 'tenant:' + tenant.id, who: name,
      t: 'בלוח הלידים חסר: ' + t,
      d: name + ' כתב ב"מה חסר לך כאן?" שבתחתית לוח הלידים: ' + t,
      area: 'לידים', size: '',
    }, null, 1), 'utf8');
    seen.add(id);
    out.push('💡 ' + name + ' בלוח הלידים: חסר לו: ' + t);
  });
  if (out.length) { told[tenant.id] = Array.from(seen).slice(-400); writeJson(toldF, told); }
  return out;
}

module.exports = { parse, record, collect, clean, MAX };
