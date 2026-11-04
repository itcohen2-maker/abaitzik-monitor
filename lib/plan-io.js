'use strict';
/*
  4.11.2026: the file side of lib/plan.js. The plan file is written by Itzik's instance
  only (tenants-health.js); a customer's worker, listener and build only read it.
*/
const fs = require('fs');
const path = require('path');
const plan = require('./plan.js');

const SPOOL = '/srv/monitor-changes';
function file(id) { return path.join(SPOOL, id + '.plan.json'); }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function readText(f) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } }

// null for Itzik's own monitor and for a customer with no plan file (no enforcement).
function stateOf(id) {
  if (!id || id === 'abaitzik') return null;
  const s = readJson(file(id), null);
  return plan.valid(s) ? s : null;
}
function statusOf(id, statusDir, now) {
  const s = stateOf(id);
  return s ? plan.status(s, readText(path.join(statusDir, 'usage.jsonl')), now) : null;
}

// Written aside and renamed, so a reader never sees half a file.
function write(id, state) {
  const f = file(id);
  const tmp = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  try { fs.chmodSync(tmp, 0o644); } catch (e) {}
  fs.renameSync(tmp, f);
}

/*
  Itzik's side: carry out every approved package request of one customer, and roll the
  month over. `reqs` is lib/change-requests.js of(): id, text, status. Returns the new
  state, or null when nothing changed (nothing to write).
*/
function applyApproved(id, reqs, now) {
  const before = readJson(file(id), null);
  if (!plan.valid(before)) return null;
  let s = plan.rollover(before, plan.monthOf(now));
  (reqs || []).forEach((r) => {
    if (r.status !== 'approved') return;
    const q = plan.parseRequest(r.text);
    if (q) s = plan.applyRequest(s, q, r.id, now);
  });
  return JSON.stringify(s) === JSON.stringify(before) ? null : s;
}

/*
  Itzik's board: every customer record with the package, the month's actions and the
  list price dollars. Dollars stay on his page only.
*/
function board(root, now) {
  const dir = path.join(root, 'data', 'tenants', 'tenants');
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /^[a-z0-9-]+\.json$/.test(f)); } catch (e) { return []; }
  return names.map((n) => {
    const t = readJson(path.join(dir, n), null);
    if (!t || !t.id || !t.dir) return null;
    const text = readText(path.join(t.dir, 'data', 'status', 'usage.jsonl'));
    const st = plan.status(readJson(file(t.id), null), text, now);
    const u = plan.usage(text, plan.monthOf(now));
    return { id: t.id, title: t.title || t.id, plan: st ? st.label : '', total: st ? st.total : 0, used: u.actions,
      usd: u.usd, level: st ? st.level : '', cheap: st ? st.cheap : false,
      // On Itzik's subscription the dollars are list price, not a real cost.
      onHis: !fs.existsSync(path.join(SPOOL, t.id + '.own')) };
  }).filter(Boolean);
}

module.exports = { SPOOL, file, stateOf, statusOf, write, applyApproved, board };
