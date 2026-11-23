'use strict';
/*
  22.11.2026: links that open the public booking page on a day, a service or a time. The business keeps ONE permanent link
  /b/<linkToken>; the same page accepts optional parameters
      d=YYYY-MM-DD   s=<service id>   t=HH:MM
  and opens with that service and day chosen and the times in view (t highlighted if it is still free). A specific link never
  locks the client in: she can change service and day. Invalid parameters are ignored silently, on the page's server side
  (lib/book-page.js cleanPre, which knows only what the agent's info tells it) and on its client side (against the live slots).

  This file is for the tenant's side (the owner's screen, the deterministic handler, the CLI, the worker): validParams checks
  a request against the business's real config, linkFor builds the URL, prepare writes a prepared message into a send list.
  Nothing is sent from here: the owner taps the wa.me link and sends it from her own WhatsApp.
*/
const fs = require('fs');
const path = require('path');
const B = require('./bookings.js');
const sendlist = require('./sendlist.js');
const T = require('./i18n-texts.js'); // 23.11.2026: Russian texts for an instance with lang "ru"

const C = B.core();
const BASE = 'https://form.it-solution.co.il', DAYS_AHEAD = 14;

// { d, s, t } with only the valid parts kept. t needs a valid day, and must be a slot start of that day's hours.
function validParams(cfg, p, now) {
  p = p || {}; now = now == null ? Date.now() : now;
  const out = {}, today = C.ymd(now);
  const str = (v) => (typeof v === 'string' ? v : '');
  const d = str(p.d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today && d <= C.addDays(today, DAYS_AHEAD) && !isNaN(C.localToMs(d, '12:00')) && C.ranges(cfg, d).length) out.d = d;
  const s = str(p.s);
  if (s && cfg.services.some((x) => x.id === s)) out.s = s;
  const t = str(p.t);
  if (out.d && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
    const tm = +t.slice(0, 2) * 60 + +t.slice(3), step = cfg.slotMinutes || 15;
    const on = C.ranges(cfg, out.d).some((r) => { const a = +r[0].slice(0, 2) * 60 + +r[0].slice(3), z = +r[1].slice(0, 2) * 60 + +r[1].slice(3); return tm >= a && tm < z && (tm - a) % step === 0; });
    if (on && !isNaN(C.localToMs(out.d, t))) out.t = t;
  }
  return out;
}
function linkFor(base, token, p) {
  const q = [];
  if (p && p.d) q.push('d=' + p.d);
  if (p && p.s) q.push('s=' + encodeURIComponent(p.s));
  if (p && p.t) q.push('t=' + p.t);
  return (base || BASE) + '/b/' + token + (q.length ? '?' + q.join('&') : '');
}
const dayLabel = (d) => 'יום ' + B.DAY_NAMES[C.dow(d)] + ' ' + d.slice(8) + '.' + d.slice(5, 7);

// who the owner means by "רוני": exactly one client with that name (or that first name) and a phone
function findRecipient(dp, name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (!n) return { error: 'name' };
  const list = require('./biz-home.js').readList(dp, 'client').filter((c) => c && c.name && c.phone);
  const exact = list.filter((c) => String(c.name).trim() === n);
  const pool = exact.length ? exact : list.filter((c) => String(c.name).trim().split(/\s+/)[0] === n);
  if (pool.length === 1) return { client: pool[0] };
  return { error: pool.length ? 'many' : 'none' };
}
// writes a one row send list: a prepared message with the right link for her to send. -> { ok, listId, name, text } | { ok:false, error }
function prepare(dp, o, now) {
  now = now == null ? Date.now() : now;
  const cfg = B.loadConfig(dp);
  if (!cfg.linkToken) return { ok: false, error: 'nolink' };
  const p = validParams(cfg, o, now);
  if (!p.d && !p.s) return { ok: false, error: 'params' };
  const r = findRecipient(dp, o.to);
  if (r.error) return { ok: false, error: r.error };
  const first = String(r.client.name).trim().split(/\s+/)[0], phone = B.normPhone(r.client.phone);
  if (!/^9725\d{8}$/.test(phone)) return { ok: false, error: 'phone' };
  const sv = p.s ? cfg.services.find((x) => x.id === p.s) : null;
  const url = linkFor(o.base, cfg.linkToken, p);
  const what = (sv ? ' ל' + sv.name : '') + (p.d ? ' ב' + dayLabel(p.d) + (p.t ? ' בשעה ' + p.t : '') : '');
  const ru = o.lang === 'ru';
  const text = ru ? T.linkText({ name: first, service: sv && sv.name, dayAcc: p.d ? T.dayAcc(C.dow(p.d), p.d) : '', time: p.d ? p.t : '', url })
    : 'היי ' + first + ', הנה קישור לקביעת תור' + what + ': ' + url;
  const id = C.ymd(now).replace(/-/g, '') + '-' + C.hm(now).replace(':', '') + '-bklink';
  const dir = sendlist.dirOf(dp);
  if (!B.realDir(path.join(dp, 'sendlist')) || !B.realDir(dir)) return { ok: false, error: 'unsafe' };
  fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, id + '.json'), n = 2, nid = id;
  while (fs.existsSync(file)) { nid = id + n; file = path.join(dir, nid + '.json'); n++; }
  B.writeAtomic(file, { id: nid, at: new Date(now).toISOString(), title: ru ? T.linkTitle(first) : 'קישור לקביעת תור ל' + first, items: [{ name: String(r.client.name).replace(/[-‐-―]/g, ' '), phone, text }] });
  return { ok: true, listId: nid, name: r.client.name, text };
}

// 23.11.2026: the confirmation of an appointment the owner just confirmed, as a prepared message to the client with the owner's
// cancellation terms and the client's own link. A one row send list, never sent from here. -> { ok, listId, text } | { ok:false, error }
const noDashes = (s) => String(s == null ? '' : s).replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
function confirmText(it, biz, cfg, base, lang) {
  const first = noDashes(it.name).split(' ')[0], ms = Date.parse(it.start), d = C.ymd(ms), h = cfg.cancelHours;
  const link = cfg.linkToken && it.tok ? (base || BASE) + '/b/a/' + cfg.linkToken + '.' + it.tok : '';
  const terms = (h > 0 ? 'ביטול או שינוי עד ' + h + ' שעות לפני התור, ' : 'אפשר לבטל או לשנות בכל זמן, ') + (link ? 'כאן: ' + link : 'דרך הוואטסאפ');
  if (lang === 'ru') return T.confirmText({ name: first, service: noDashes(it.service), dayAcc: T.dayAcc(C.dow(d), d), time: C.hm(ms), biz, hours: h, link });
  return 'היי ' + first + ', התור שלך ל' + noDashes(it.service) + ' ב' + dayLabel(d) + ' בשעה ' + C.hm(ms) + ' אצל ' + biz + ' מאושר. ' + terms + '.' + (h > 0 && link ? ' אחרי זה רק דרך הוואטסאפ.' : '');
}
function prepareConfirm(dp, it, biz, now, base, lang) {
  now = now == null ? Date.now() : now;
  const phone = B.normPhone(it && it.phone);
  if (!it || !/^9725\d{8}$/.test(phone)) return { ok: false, error: 'phone' };
  const text = confirmText(it, biz, B.loadConfig(dp), base, lang);
  const id = C.ymd(now).replace(/-/g, '') + '-' + C.hm(now).replace(':', '') + '-bkok';
  const dir = sendlist.dirOf(dp);
  if (!B.realDir(path.join(dp, 'sendlist')) || !B.realDir(dir)) return { ok: false, error: 'unsafe' };
  fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, id + '.json'), n = 2, nid = id;
  while (fs.existsSync(file)) { nid = id + n; file = path.join(dir, nid + '.json'); n++; }
  B.writeAtomic(file, { id: nid, at: new Date(now).toISOString(), title: lang === 'ru' ? T.confirmTitle(noDashes(it.name).split(' ')[0]) : 'אישור תור ל' + noDashes(it.name).split(' ')[0], items: [{ name: noDashes(it.name), phone, text }] });
  return { ok: true, listId: nid, text };
}

// 23.11.2026: the owner cancelled a client's booking: a prepared message to the client (never sent from here), with the booking link for a new
// appointment when the business has one. A one row send list. -> { ok, listId, text } | { ok:false, error }
function cancelledText(it, biz, cfg, base, lang) {
  const first = noDashes(it.name).split(' ')[0], ms = Date.parse(it.start), d = C.ymd(ms);
  if (lang === 'ru') return T.cancelledText({ name: first, service: noDashes(it.service), dayAcc: T.dayAcc(C.dow(d), d), time: C.hm(ms), biz, url: cfg.linkToken ? (base || BASE) + '/b/' + cfg.linkToken : '' });
  return 'היי ' + first + ', התור שלך ל' + noDashes(it.service) + ' ב' + dayLabel(d) + ' בשעה ' + C.hm(ms) + ' אצל ' + biz + ' בוטל.' + (cfg.linkToken ? ' לקביעת תור חדש: ' + (base || BASE) + '/b/' + cfg.linkToken + '.' : '');
}
function prepareCancelled(dp, it, biz, now, base, lang) {
  now = now == null ? Date.now() : now;
  const phone = B.normPhone(it && it.phone);
  if (!it || !/^9725\d{8}$/.test(phone)) return { ok: false, error: 'phone' };
  const text = cancelledText(it, biz, B.loadConfig(dp), base, lang);
  const id = C.ymd(now).replace(/-/g, '') + '-' + C.hm(now).replace(':', '') + '-bkcx';
  const dir = sendlist.dirOf(dp);
  if (!B.realDir(path.join(dp, 'sendlist')) || !B.realDir(dir)) return { ok: false, error: 'unsafe' };
  fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, id + '.json'), n = 2, nid = id;
  while (fs.existsSync(file)) { nid = id + n; file = path.join(dir, nid + '.json'); n++; }
  B.writeAtomic(file, { id: nid, at: new Date(now).toISOString(), title: lang === 'ru' ? T.cancelledTitle(noDashes(it.name).split(' ')[0]) : 'ביטול תור ל' + noDashes(it.name).split(' ')[0], items: [{ name: noDashes(it.name), phone, text }] });
  return { ok: true, listId: nid, text };
}

module.exports = { validParams, linkFor, prepare, prepareConfirm, prepareCancelled, confirmText, findRecipient, dayLabel, BASE, DAYS_AHEAD };
