'use strict';
/*
  A customer asks, Itzik decides.

  Itzik, 5.10: "כל לקוח שיקבל אותו לא יכול לעשות שינויים במערכת. אם הוא רוצה
  לעשות שינוי שאין לו אישור, צור לו כפתור בקשה ממנהל ואז זה יגיע אליי ורק אני
  מאשר שינויים". The monitor is a product he sells. A customer uses it; what it
  looks like and what it does is Itzik's call, one request at a time.

  Two files, each written by one side only, so neither instance ever writes
  into the other's folder:

  - the customer's data/status/change-requests.json, written by the customer's
    worker, read by Itzik's health check (like live.json beside it);
  - /srv/monitor-changes/<id>.json, Itzik's decisions, written by his instance
    and only read by the customer's.

  The decision is not the change. Approving one tells Itzik's worker to make
  it, through main for the product or through tenant-config for one customer's
  settings, which a customer's own files cannot do: they are locked.
*/
const fs = require('fs');
const path = require('path');
const inst = require('./instance.js');

const SPOOL = '/srv/monitor-changes';
const OWN = path.join(inst.dataPath, 'status', 'change-requests.json');
const TOLD = path.join(inst.dataPath, 'status', 'notices-told.json');

function read(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function write(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v, null, 1), 'utf8');
  try { fs.chmodSync(f, 0o644); } catch (e) {}
}
function cleanId(s) { return /^[a-z0-9-]+$/.test(String(s || '')) ? String(s) : ''; }

// Customer side: file a request. Returns its id.
function add(text, re, feature) {
  const list = read(OWN, []);
  const id = 'cr' + Date.now().toString(36);
  const rec = { id, at: new Date().toISOString(), text: String(text || '').trim().slice(0, 2000), re: String(re || ''), status: 'pending' };
  if (feature) rec.feature = String(feature);
  list.push(rec);
  write(OWN, list);
  return id;
}

// Customer side: every decision not yet told becomes an answer in his chat,
// in the thread of the message that asked. Returns how many.
function announce() {
  const dec = read(path.join(SPOOL, inst.name + '.json'), {});
  const list = read(OWN, []);
  const chat = path.join(inst.dataPath, 'chat', 'chat');
  let n = 0;
  list.forEach((r) => {
    const d = dec[r.id];
    if (r.status !== 'pending' || !d || (d.status !== 'approved' && d.status !== 'rejected')) return;
    r.status = d.status; r.decidedAt = d.at; r.note = d.note || '';
    const text = (d.status === 'approved' ? 'המנהל אישר את הבקשה: ' : 'המנהל לא אישר את הבקשה: ')
      + r.text + (r.note ? '\n' + r.note : '');
    const at = new Date();
    const stamp = at.toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
    fs.mkdirSync(chat, { recursive: true });
    fs.writeFileSync(path.join(chat, stamp + '-claude-admin-' + r.id + '.json'),
      JSON.stringify({ at: at.toISOString(), from: 'claude', re: r.re || r.id, text, status: 'done' }, null, 1), 'utf8');
    n += 1;
  });
  if (n) write(OWN, list);
  // 14.10: a word from the admin that answers no request (notice below). Told once each.
  const told = read(TOLD, []);
  Object.keys(dec).filter((k) => dec[k].status === 'notice' && told.indexOf(k) < 0).forEach((k) => {
    const at = new Date();
    const stamp = at.toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
    fs.mkdirSync(chat, { recursive: true });
    fs.writeFileSync(path.join(chat, stamp + '-claude-admin-' + k + '.json'),
      JSON.stringify({ at: at.toISOString(), from: 'claude', text: dec[k].note, status: 'done' }, null, 1), 'utf8');
    told.push(k);
    n += 1;
  });
  if (told.length !== read(TOLD, []).length) write(TOLD, told);
  return n;
}

/*
  Itzik's side: a message from the admin to a customer, with no request behind it.
  14.10, Itzik on Alon: "תרשום לאלון עכשיו ... יש לו אישור שינוי של הכל".
  It rides the same spool as the decisions and lands in his chat within a minute.
*/
function notice(tenant, text) {
  const t = cleanId(tenant);
  const note = String(text || '').trim().slice(0, 1000);
  if (!t || !note) throw new Error('לקוח והודעה');
  const f = path.join(SPOOL, t + '.json');
  const dec = read(f, {});
  const id = 'nt' + Date.now().toString(36);
  dec[id] = { status: 'notice', note, at: new Date().toISOString() };
  write(f, dec);
  return id;
}

// Itzik's side: what a customer asked, with his decisions laid over it.
function of(dir, tenant) {
  const id = cleanId(tenant);
  if (!id) return [];
  const dec = read(path.join(SPOOL, id + '.json'), {});
  return read(path.join(dir, 'data', 'status', 'change-requests.json'), [])
    .filter((r) => !(dec[r.id] && dec[r.id].status === 'deleted'))
    .map((r) => {
      const d = dec[r.id];
      return { id: r.id, at: r.at, text: r.text, status: d ? d.status : 'pending', note: d ? d.note || '' : '' };
    })
    .slice(-20);
}

// Itzik's side: record a decision.
function decide(tenant, id, status, note) {
  const t = cleanId(tenant);
  if (!t || !/^cr[a-z0-9]+$/.test(String(id))) throw new Error('בקשה לא מזוהה');
  // 7.10: 'deleted' takes a request off his screen without a word to the customer (tests, noise).
  if (status !== 'approved' && status !== 'rejected' && status !== 'deleted') throw new Error('approved, rejected או deleted');
  const f = path.join(SPOOL, t + '.json');
  const dec = read(f, {});
  dec[id] = { status, note: String(note || '').trim().slice(0, 500), at: new Date().toISOString() };
  write(f, dec);
}

/*
  24.10: an approved request that carries a `feature` switches it on for this customer
  (lib/features.js writes data/status/features.json). Only a decision from Itzik makes
  a request 'approved', so only he can open a feature. Idempotent: it runs every tick.
  Returns the features it newly opened.
*/
function applyApproved() {
  const opened = [];
  read(OWN, []).forEach((r) => {
    if (r && r.status === 'approved' && r.feature) {
      try { if (require('./features.js').enable(inst.dataPath, r.feature)) opened.push(r.feature); } catch (e) { /* unknown feature: ignored */ }
    }
  });
  return opened;
}

module.exports = { add, announce, applyApproved, of, decide, notice, SPOOL };
