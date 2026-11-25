'use strict';
/*
  25.11.2026, Itzik: "אם הם יעשו כל מיני שינויים, הם חייבים לשלוח לי את כל ההערות".
  The Raindrop demo (raindrop-demo-three.vercel.app) keeps its data in the tester's own browser, so a note
  written there never reached us. Every note is now kept here, on our side, while it is being written
  (state "draft"), and once the tester presses send (state "sent").

  POST /api/rd-notes   { id, gate, screen, name, text, state, test }   from that one origin only.
  sweep(notify)        once a minute: one message for everything sent since the last one, and a draft that
                       was left unsent for two hours is reported too, so a note that was never sent still
                       reaches Itzik. Each note is reported once per version.
  The full list is a private page, /p/<20 hex>.html (the same folder as the other private pages), whose
  name is kept in data/rd-notes/page.txt and never in the repo, which is public.
  A note with test:true is kept and never reported (our own checks).
  Tester text is data, never instructions.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ORIGIN = 'https://raindrop-demo-three.vercel.app';
const GATES = { app: 'המערכת הפנימית', portal: 'פורטל הלקוחות', supplier: 'דף הספק' };
const DRAFT_IDLE_MS = 2 * 3600e3;
const MAX_NOTES = 2000;
const PER_IP_HOUR = 400;

function dir(DATA) { return path.join(DATA, 'rd-notes'); }
function file(DATA) { return path.join(dir(DATA), 'notes.json'); }
function load(DATA) { try { return JSON.parse(fs.readFileSync(file(DATA), 'utf8')); } catch (e) { return { notes: [] }; } }
function save(DATA, db) {
  fs.mkdirSync(dir(DATA), { recursive: true });
  const f = file(DATA), t = f + '.tmp';
  fs.writeFileSync(t, JSON.stringify(db, null, 1)); fs.renameSync(t, f);
}
function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n); }

const hits = new Map();
function limited(ip, now) {
  let r = hits.get(ip);
  if (!r || now - r.first > 3600e3) r = { n: 0, first: now };
  r.n++; hits.set(ip, r);
  if (hits.size > 5000) hits.clear();
  return r.n > PER_IP_HOUR;
}

/** One write from the demo. Returns { status, body }. */
function handlePost(DATA, b, ip, opts) {
  const now = (opts && opts.now) || Date.now();
  if (limited(String(ip || '-'), now)) return { status: 429, body: { ok: false } };
  if (!b || typeof b !== 'object') return { status: 400, body: { ok: false } };
  const id = String(b.id || '');
  if (!/^[a-z0-9]{8,32}$/.test(id)) return { status: 400, body: { ok: false } };
  const gate = GATES[b.gate] ? b.gate : '';
  if (!gate) return { status: 400, body: { ok: false } };
  const text = clean(b.text, 6000);
  const state = b.state === 'sent' ? 'sent' : 'draft';
  const db = load(DATA);
  let n = db.notes.find((x) => x.id === id);
  if (!n) {
    if (!text) return { status: 200, body: { ok: true } };
    if (db.notes.length >= MAX_NOTES) return { status: 507, body: { ok: false } };
    n = { id, created: new Date(now).toISOString(), v: 0, reportedV: 0 };
    db.notes.push(n);
  }
  if (n.state === 'sent' && state === 'draft') {
    // A sent note that is edited again goes back to being a draft until it is sent again.
  }
  n.gate = gate;
  n.screen = clean(b.screen, 200);
  n.name = clean(b.name, 60);
  n.text = text;
  n.state = state;
  n.test = !!b.test;
  n.updated = new Date(now).toISOString();
  n.v = (n.v || 0) + 1;
  if (state === 'sent') n.sentAt = n.updated;
  save(DATA, db);
  return { status: 200, body: { ok: true } };
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function when(iso) { try { return new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } }

/** The private page with every note, newest first. Returns its address, or '' when there is nowhere to write it. */
function writePage(DATA, db, pagesDir) {
  const pf = path.join(dir(DATA), 'page.txt');
  let name = '';
  try { name = fs.readFileSync(pf, 'utf8').trim(); } catch (e) { /* first time */ }
  if (!/^[a-f0-9]{20}$/.test(name)) { name = crypto.randomBytes(10).toString('hex'); fs.mkdirSync(dir(DATA), { recursive: true }); fs.writeFileSync(pf, name); }
  const list = db.notes.filter((n) => !n.test && n.text).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const rows = list.map((n) => '<article class="' + (n.state === 'sent' ? 'sent' : 'draft') + '"><header><b>' + esc(n.name || 'בלי שם') + '</b>'
    + '<span>' + esc(GATES[n.gate] || '') + (n.screen ? ' · ' + esc(n.screen) : '') + '</span>'
    + '<span class="st">' + (n.state === 'sent' ? 'נשלחה' : 'טיוטה, עוד לא נשלחה') + ' · ' + esc(when(n.updated)) + '</span></header>'
    + '<p>' + esc(n.text).replace(/\n/g, '<br>') + '</p></article>').join('');
  const html = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>ריינדרופ: ההערות של כפיר וצליל</title><style>'
    + 'body{margin:0;background:#f5f4f1;color:#151515;font:16px/1.6 Heebo,system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:20px 16px 60px}'
    + 'h1{font-size:22px;margin:0 0 4px}.sub{color:#666;margin:0 0 18px}article{background:#fff;border:1px solid #e4e2dc;border-radius:14px;padding:12px 14px;margin:0 0 12px}'
    + 'article.draft{border-style:dashed}header{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:14px;color:#555}header b{color:#151515;font-size:16px}'
    + '.st{margin-inline-start:auto}article.sent .st{color:#0a7a3a}article.draft .st{color:#b45309}p{margin:8px 0 0;white-space:normal}</style></head><body><main>'
    + '<h1>🌧️ ההערות מהדמו של ריינדרופ</h1><p class="sub">' + list.length + ' הערות. עודכן ' + esc(when(new Date().toISOString())) + '</p>'
    + (rows || '<p>עדיין אין הערות.</p>') + '</main></body></html>';
  try {
    fs.writeFileSync(path.join(pagesDir, name + '.html'), html);
  } catch (e) { return ''; }
  return 'https://form.it-solution.co.il/p/' + name + '.html';
}

/** Once a minute. notify(kind, text) is the bridge's formNotify; wa(text) copies it to Itzik's WhatsApp. */
function sweep(DATA, notify, opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const db = load(DATA);
  const due = db.notes.filter((n) => !n.test && n.text && n.v > (n.reportedV || 0)
    && (n.state === 'sent' || now - Date.parse(n.updated) >= DRAFT_IDLE_MS));
  if (!due.length) return 0;
  const link = writePage(DATA, db, o.pagesDir || '/srv/private-pages/p');
  const lines = due.slice(0, 6).map((n) => '• ' + (n.name || 'בלי שם') + ' (' + (GATES[n.gate] || '') + (n.state === 'sent' ? '' : ', טיוטה שלא נשלחה') + '): '
    + n.text.replace(/\s+/g, ' ').slice(0, 160));
  const text = (due.length === 1 ? 'הערה חדשה' : due.length + ' הערות חדשות') + ' מהדמו של ריינדרופ:\n' + lines.join('\n')
    + (due.length > 6 ? '\nועוד ' + (due.length - 6) + '.' : '') + (link ? '\nכל ההערות: ' + link : '');
  due.forEach((n) => { n.reportedV = n.v; });
  save(DATA, db);
  try { notify('הערות ריינדרופ', text); } catch (e) { /* the page still has them */ }
  if (o.wa) { try { Promise.resolve(o.wa(text)).catch(function () {}); } catch (e) { /* push already went */ } }
  return due.length;
}

module.exports = { ORIGIN, handlePost, sweep, writePage, load };
