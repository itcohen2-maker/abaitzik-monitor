'use strict';
/*
  12.11.2026, Itzik: a customer asked for the monitor to WhatsApp his 30 clients. It never does: our shared number must
  not message third parties (spam risk for every customer, cost, Meta consent rules; lib/approvals.js blocks the kind
  whatsapp-other and that stays). Instead: "המוניטור גם עושה לנו הודעות, מכין לנו אחד אחד לכל הזה, ואנחנו שולחים בעצמנו."

  The tile "📤 הודעות לשליחה", in every monitor. One list is one file:
    data/sendlist/sendlist/<YYYYMMDD-HHMM>-<slug>.json
      { id, at (ISO +03:00), title, note?, items:[{ name, phone, text, sentAt? }] }
  A session writes it (worker.js rule); the page shows each person with a wa.me link that opens HIS OWN WhatsApp with the
  text ready, and he presses send. Nothing leaves from our side.

  The page sends "📤 נשלח: <listId> <idx>" when he taps a row; listen.js calls markSent() with no model and the mark
  is written into the file as items[idx].sentAt, so it survives other devices. Limits: 200 items and 1500 characters
  a text. A list older than 30 days leaves the page payload (the file stays). Sealed payload only (D.sendlist).
  Visible copy has no dashes.
*/
const fs = require('fs');
const path = require('path');

const MAX_ITEMS = 200;
const MAX_TEXT = 1500;
const KEEP_DAYS = 30;

function dirOf(dataPath) { return path.join(dataPath, 'sendlist', 'sendlist'); }
function noDash(s) { return String(s == null ? '' : s).replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim(); }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { encoding: 'utf8', mode: 0o664 });
  fs.renameSync(f + '.tmp', f);
}

// 05XXXXXXXX, +972 5X..., 972-5X, 5XXXXXXXX (zero lost in a spreadsheet) -> 9725XXXXXXXX. Another country: digits only,
// and it needs the + or 00 prefix. Anything else is not valid: { ok:false, phone:'' }.
function normalizePhone(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: false, phone: '' };
  const plus = /^\s*(\+|00)/.test(s);
  let d = s.replace(/\D/g, '');
  if (/^\s*00/.test(s)) d = d.replace(/^00/, '');
  if (plus || /^972/.test(d)) {
    if (/^972/.test(d)) {
      d = '972' + d.slice(3).replace(/^0/, '');
      return /^9725\d{8}$/.test(d) ? { ok: true, phone: d } : { ok: false, phone: '' };
    }
    return d.length >= 8 && d.length <= 15 && d[0] !== '0' ? { ok: true, phone: d } : { ok: false, phone: '' };
  }
  if (/^05\d{8}$/.test(d)) return { ok: true, phone: '972' + d.slice(1) };
  if (/^5\d{8}$/.test(d)) return { ok: true, phone: '972' + d };
  return { ok: false, phone: '' };
}

function waLink(phone, text) { return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(String(text == null ? '' : text)); }

// The number as the page shows it: the sheet is on a phone in a client's hands, so only the ends show.
function maskPhone(phone) {
  const p = String(phone || '');
  if (/^972\d{9}$/.test(p)) return '0' + p.slice(3, 5) + ' XXX ' + p.slice(-4);
  if (p.length >= 8) return '+' + p.slice(0, 3) + ' XXX ' + p.slice(-3);
  return '';
}

// Problems with a list as written, for the session that writes it: [] means fine.
function validate(list) {
  const out = [];
  if (!list || typeof list !== 'object') return ['not an object'];
  if (!Array.isArray(list.items) || !list.items.length) out.push('no items');
  else {
    if (list.items.length > MAX_ITEMS) out.push('more than ' + MAX_ITEMS + ' items (' + list.items.length + ')');
    list.items.forEach((it, i) => {
      if (!it || !String(it.name || '').trim()) out.push('item ' + i + ': no name');
      if (!it || !String(it.text || '').trim()) out.push('item ' + i + ': no text');
      else if (String(it.text).length > MAX_TEXT) out.push('item ' + i + ': text over ' + MAX_TEXT + ' characters');
      if (it && !normalizePhone(it.phone).ok) out.push('item ' + i + ': phone not valid (' + (it.phone || 'empty') + ')');
    });
  }
  if (!String(list.title || '').trim()) out.push('no title');
  return out;
}

function all(dataPath) {
  const dir = dirOf(dataPath);
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (e) { return []; }
  return files.sort().map((f) => {
    const r = readJson(path.join(dir, f), null);
    if (!r || !Array.isArray(r.items)) return null;
    r._file = f;
    if (!r.id) r.id = f.replace(/\.json$/, '');
    return r;
  }).filter(Boolean);
}

// What the page gets: newest first, nothing older than 30 days, at most 200 items and 1500 characters a text,
// phones normalized (a bad one keeps its row and is marked bad), a wa.me link per good row.
function forPage(dataPath, now) {
  const t = now || Date.now();
  return all(dataPath).filter((l) => {
    const ms = Date.parse(l.at);
    return !(ms < t - KEEP_DAYS * 86400000);
  }).sort((a, b) => (String(a.at) < String(b.at) ? 1 : String(a.at) > String(b.at) ? -1 : 0)).map((l) => {
    const items = l.items.slice(0, MAX_ITEMS).map((it, i) => {
      it = it || {};
      const n = normalizePhone(it.phone);
      const text = String(it.text == null ? '' : it.text).slice(0, MAX_TEXT);
      return {
        i, name: noDash(it.name).slice(0, 80), phoneMask: n.ok ? maskPhone(n.phone) : '', bad: !n.ok || !text,
        text, link: n.ok && text ? waLink(n.phone, text) : '', sentAt: it.sentAt || '',
      };
    });
    return {
      id: l.id, at: l.at, title: noDash(l.title).slice(0, 120), note: l.note ? noDash(l.note).slice(0, 300) : '',
      total: items.length, sent: items.filter((x) => x.sentAt).length,
      unsent: items.filter((x) => !x.sentAt && !x.bad).length, items,
    };
  });
}

// "📤 נשלח: <listId> <idx>" -> true when the row was marked now, false when unknown, already marked or a bad id.
function markSent(dataPath, listId, idx, nowIso) {
  listId = String(listId || '').trim();
  idx = Number(idx);
  if (!/^[\w]+(?:-[\w]+)*$/.test(listId) || !Number.isInteger(idx) || idx < 0) return false;
  const l = all(dataPath).find((x) => x.id === listId);
  if (!l || !l.items[idx] || l.items[idx].sentAt) return false;
  const file = path.join(dirOf(dataPath), l._file);
  delete l._file;
  l.items[idx].sentAt = nowIso || new Date().toISOString();
  writeJson(file, l);
  return true;
}

// The listener's line. -> { listId, idx } or null.
function parseMark(text) {
  const m = /^\s*(?:משימה)?\s*📤\s*נשלח\s*[:：]\s*([\w-]+)\s+(\d{1,3})\s*$/.exec(String(text || ''));
  return m ? { listId: m[1], idx: Number(m[2]) } : null;
}

// Writes a checked list: node lib/sendlist.js add <dataPath> <list.json>. The id and the file name come from the time and
// the slug, so a session does not have to get them right.
function stamp(ms) {
  const o = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  return o.year + o.month + o.day + '-' + (o.hour === '24' ? '00' : o.hour) + o.minute;
}
function add(dataPath, list, slug) {
  const bad = validate(list);
  if (bad.length) return { ok: false, errors: bad };
  const st = stamp(Date.now());
  const sl = String(slug || 'list').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'list';
  const id = st + '-' + sl;
  const out = { id, at: new Date().toISOString(), title: list.title, items: list.items.map((x) => ({ name: x.name, phone: x.phone, text: x.text })) };
  if (list.note) out.note = list.note;
  writeJson(path.join(dirOf(dataPath), id + '.json'), out);
  return { ok: true, id };
}

module.exports = { MAX_ITEMS, MAX_TEXT, KEEP_DAYS, dirOf, normalizePhone, waLink, maskPhone, validate, all, forPage, markSent, parseMark, add };

if (require.main === module) {
  const [cmd, dp, f, slug] = process.argv.slice(2);
  if (cmd === 'add' && dp && f) {
    const r = add(dp, readJson(f, null), slug);
    console.log(JSON.stringify(r));
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'check' && f) {
    const e = validate(readJson(f, null));
    console.log(e.length ? e.join('\n') : 'ok');
    process.exit(e.length ? 1 : 0);
  } else console.log('usage: node lib/sendlist.js add <dataPath> <list.json> [slug] | check - <list.json>');
}
