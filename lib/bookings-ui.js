'use strict';
/*
  21.11.2026, Itzik: "if she has no appointment management she will not buy the monitor". The screen 📅 התורים שלי of a
  service trade whose entry in lib/trades.js has bookings: true (the cosmetician): the day and the next six days as a
  quiet agenda, the free gaps between appointments, a new appointment with the free times of the day, move and cancel,
  and her hours and services. The store and every rule are lib/bookings.js; this file only draws and sends.

  The page is static, so everything it needs is computed at build time (hours, services, the next 60 days of bookings,
  the client names and phones) and travels in the SEALED payload (build.js payload.bookings, read from window.D.bookings
  when the screen opens, as lib/biz-home.js does). The public page source holds the code and no client data at all.
  The free times are computed on the page by the very same code as in node (bookings.core,
  put on the page with toString). A change is not written by the page: it goes the way every form of the monitor goes,
  sendText (the same sender as the tasks and personal appointments forms), as one of these fixed lines that
  lib/bookings.js parseRequest reads back and `node booking.js apply "<line>"` runs:
    תור לקוחה חדש: <YYYY-MM-DD HH:MM> | <service> | <name> | <phone>
    הזזת תור לקוחה: <id> | <YYYY-MM-DD HH:MM>
    ביטול תור לקוחה: <id>
    שעות פעילות: ראשון 09:00 עד 18:00 | ... | שבת סגור        שירות חדש: <name> | <minutes> | <price>        הסרת שירות: <name>
  Until the monitor has written it and rebuilt, the page shows the change as "נשלח, מתעדכן" (kept on the phone, dropped
  as soon as the built data has it). In the public demo nothing is sent: the change is kept in the page and the usual
  demo toast says what the monitor would do (lib/demo-acts.js).
  Not a trade with bookings: html() is '' and the page is as it was.
*/
const trades = require('./trades.js');
const B = require('./bookings.js');
const bh = require('./biz-home.js');
const BP = require('./book-page.js');
const HL = require('./book-health.js');
const BB = require('./book-beauty.js');

// The few sentences that address her, in the feminine when the customer said so at signup (never from the trade), else masculine.
function words(fem) {
  return {
    intro: fem ? 'התורים של היום ושל הימים הבאים, ומה עוד פנוי. לחצי על תור חדש כדי לקבוע.' : 'התורים של היום ושל הימים הבאים, ומה עוד פנוי. לחץ על תור חדש כדי לקבוע.',
    noSvc: fem ? 'עוד אין שירותים. הוסיפי אותם למטה, ואז אפשר לקבוע תור.' : 'עוד אין שירותים. הוסף אותם למטה, ואז אפשר לקבוע תור.',
    wa: 'אפשר לקבוע תור אצלי בקישור: ',
    gift: 'הנה כרטיס מתנה בשבילך: ',
    fail: fem ? 'לא נשלח. בדקי את החיבור ונסי שוב.' : 'לא נשלח. בדוק את החיבור ונסה שוב.',
  };
}

// The sentences of the payload are data, so the Russian layer (lib/i18n.js) never walks them: they are translated here.
function wordsFor(inst) {
  const w = words(inst.gender === 'f');
  if (inst.lang !== 'ru') return w;
  const I = require('./i18n.js'), out = {};
  Object.keys(w).forEach((k) => { out[k] = I.t('ru', w[k]); });
  return out;
}
// What the page needs, computed at build time.
function data(inst, now) {
  const dp = inst.dataPath, c = B.core(), today = c.ymd(now), cfg = B.loadConfig(dp);
  const win = B.list(dp, { from: today, to: c.addDays(today, 60) }), all = B.readItems(dp);
  const clients = bh.readList(dp, 'client').filter((x) => x && x.name).slice(0, 300);
  const phones = Array.from(new Set(win.map((i) => i.phone).filter(Boolean)));
  // the number of times each of these phones was marked "did not come" (the hint to block)
  const noshows = {}; all.forEach((i) => { if (i.status === 'noshow' && i.phone && phones.indexOf(i.phone) >= 0) noshows[i.phone] = (noshows[i.phone] || 0) + 1; });
  const nameOf = (p) => { const x = clients.find((y) => y.phone && B.normPhone(y.phone) === p) || all.find((i) => i.phone === p); return x ? String(x.name) : ''; };
  return {
    now, today, fem: inst.gender === 'f', t: wordsFor(inst),
    cfg,
    // the permanent public booking link (lib/book-page.js); the demo shows its demo link, a customer without one asks for it on the screen
    link: cfg.linkToken ? BP.BASE + '/b/' + cfg.linkToken : (inst.publicDemo ? BP.BASE + '/b/' + BP.DEMO_LINK : ''),
    // 24.11.2026: punch cards, gift cards, the clients' before and after pairs (small thumbnails only, capped) and the visits of the last 120 days
    packs: BB.packsView(dp, now), gifts: BB.giftsView(dp, now), photos: BB.photosView(dp),
    recent: all.filter((i) => i.status !== 'cancelled' && i.status !== 'noshow' && Date.parse(i.end) < now && Date.parse(i.start) > now - 120 * 864e5).slice(-150)
      .map((i) => ({ id: i.id, start: i.start, end: i.end, service: i.service, name: i.name, phone: i.phone, clientId: i.clientId || '' })),
    items: win.map((i) => ({ id: i.id, clientId: i.clientId || '', start: i.start, end: i.end, serviceId: i.serviceId, service: i.service, name: i.name, phone: i.phone, src: i.src, hasClient: !!i.clientId, status: i.status,
      blocked: cfg.blocked.indexOf(i.phone) >= 0 })),
    clients: clients.map((x) => ({ id: String(x.id || ''), name: String(x.name), phone: String(x.phone || ''), p: B.normPhone(x.phone) })),
    // the health declarations of the phones above (the newest of each, signature checked again), inside the sealed payload like everything here
    health: HL.forPhones(dp, phones, now), healthQ: HL.publicQuestions(), noshows,
    blockedList: cfg.blocked.map((p) => ({ phone: p, name: nameOf(p) })),
  };
}

// The page side, put on the page with toString. Plain ES5, no closing script tag inside. coreFn is bookings.core.
function page(coreFn) {
  var K = coreFn(), W = window;
  // the data of the sealed payload, taken when the screen opens (window.D.bookings); empty until then
  var D = { items: [], cfg: { hours: {}, services: [], slotMinutes: 15, bufferMinutes: 0, cancelHours: 24 }, clients: [], packs: [], gifts: [], photos: [], recent: [], t: { intro: '', noSvc: '', fail: '', gift: '' } };
  var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  // 23.11.2026: the same names for the hours line that is sent (the server reads them in Hebrew); lib/i18n.js leaves what follows /*keep*/ as it is
  var DAYS_SENT = /*keep*/ ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var STAT = { booked: 'מחכה לאישור', confirmed: 'מאושר', done: 'הסתיים', noshow: 'לא הופיע' };
  var KEY = 'bkPend', HOLD = 6 * 3600e3;
  var pend = [], note = '', askCancel = '', askBlock = '', moreId = '', body = null, onAct = null;
  function demo() { return !!W.PUBLIC_DEMO; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
  function clean(s) { return String(s == null ? '' : s).replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  try { var raw = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(raw)) pend = raw; } catch (e) { pend = []; }
  function save() { if (demo()) return; try { localStorage.setItem(KEY, JSON.stringify(pend)); } catch (e) {} }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // what is on the page now: the built data with the changes that were sent and are not in it yet
  function view() {
    var out = D.items.map(copy), keep = [], t = Date.now();
    pend.forEach(function (op) {
      if (!op || op.at < t - HOLD) return;
      if (XOPS[op.t]) { if (!xDone(op)) keep.push(op); return; }
      if (op.phone) { keep.push(op); return; } // block and unblock are applied by phoneFlag
      var i, it;
      if (op.t === 'add') {
        if (out.some(function (x) { return !x.pending && x.start === op.it.start && x.name === op.it.name; })) return;
        it = copy(op.it); it.pending = true; out.push(it);
      } else {
        for (i = 0; i < out.length; i++) if (out[i].id === op.id) break;
        if (i === out.length) return;
        if (op.t === 'confirm') { if (out[i].status === 'confirmed') return; out[i].status = 'confirmed'; }
        else if (op.t === 'client') { if (out[i].hasClient) return; out[i].hasClient = true; }
        else if (op.t === 'mark') { if (out[i].status === op.status) return; out[i].status = op.status; }
        else if (op.t === 'cancel') out.splice(i, 1);
        else {
          if (out[i].start === op.start) return;
          var len = Date.parse(out[i].end) - Date.parse(out[i].start);
          out[i].start = op.start; out[i].end = K.iso(Date.parse(op.start) + len); out[i].pending = true; out[i].status = 'booked';
        }
      }
      keep.push(op);
    });
    if (keep.length !== pend.length) { pend = keep; save(); }
    return out;
  }
  function cfgView() {
    var c = { hours: D.cfg.hours, services: D.cfg.services.slice(), slotMinutes: D.cfg.slotMinutes, bufferMinutes: D.cfg.bufferMinutes, limits: D.cfg.limits, cancelHours: D.cfg.cancelHours == null ? 24 : D.cfg.cancelHours,
      approval: D.cfg.approval || 'approve', blocked: (D.cfg.blocked || []).slice() }, t = Date.now();
    pend.forEach(function (op) {
      if (!op || op.at < t - HOLD) return;
      if (op.t === 'hours' && !same(op.hours, D.cfg.hours)) c.hours = op.hours;
      if (op.t === 'svc') c.services = c.services.filter(function (s) { return s.name !== op.s.name; }).concat([op.s]);
      if (op.t === 'limits') c.limits = { perHour: op.h, perDay: op.d };
      if (op.t === 'cxh') c.cancelHours = op.h;
      if (op.t === 'unsvc') c.services = c.services.filter(function (s) { return s.name !== op.name; });
      if (op.t === 'hl') c.services = c.services.map(function (s) { if (s.name !== op.name) return s; var n = copy(s); n.health = op.on; return n; });
      if (op.t === 'mode') c.approval = op.m;
      if (op.t === 'block' && c.blocked.indexOf(op.phone) < 0) c.blocked.push(op.phone);
      if (op.t === 'unblock') c.blocked = c.blocked.filter(function (p) { return p !== op.phone; });
    });
    return c;
  }
  function add(op) { op.at = Date.now(); pend.push(op); save(); }

  // the one sender of the monitor's forms (sendText), or the demo toast
  function send(text) {
    if (demo()) { try { if (W.demoAct) W.demoAct('תור לקוחה', text); } catch (e) {} return Promise.resolve(); }
    if (typeof sendText !== 'function') return Promise.reject(new Error('no sender'));
    return sendText('תור לקוחה', text, 'תור לקוחה').then(function (r) {
      try { if (typeof markSent === 'function') markSent('text'); if (typeof renderSent === 'function') renderSent(); if (typeof renderThread === 'function') renderThread(); } catch (e) {}
      return r;
    });
  }
  function failText() { return D.t.fail; }
  function sent(msg) {
    note = msg; render();
    setTimeout(function () { if (note === msg) { note = ''; render(); } }, 9000);
  }

  // ---- the agenda ----
  function dayTitle(day, d) {
    var w = DAYS[K.dow(day)];
    return d === 0 ? 'היום ' + w : d === 1 ? 'מחר ' + w : w;
  }
  function gaps(day, its, c) {
    var out = [], nowMs = Date.now(), r = K.ranges(c, day), min = c.services.length ? Math.min.apply(null, c.services.map(function (s) { return s.minutes; })) : 30;
    r.forEach(function (x) {
      var a = K.localToMs(day, x[0]), b = K.localToMs(day, x[1]), cur = Math.max(a, nowMs);
      if (isNaN(a) || isNaN(b)) return;
      its.forEach(function (i) {
        var s = Date.parse(i.start), e = Date.parse(i.end);
        if (e <= cur || s >= b) return;
        if (s - cur >= min * 60000) out.push([cur, s, a]);
        cur = Math.max(cur, e);
      });
      if (b - cur >= min * 60000) out.push([cur, b, a]);
    });
    return out;
  }
  function validPh(p) { return /^9725[0-9]{8}$/.test(String(p || '')); }
  // is this phone blocked from the link, with the changes that were sent and are not in the built data yet
  function phoneFlag(phone, base) {
    var v = base, t = Date.now();
    pend.forEach(function (op) {
      if (!op || op.at < t - HOLD || op.phone !== phone) return;
      if (op.t === 'block') v = true; else if (op.t === 'unblock') v = false;
    });
    return v;
  }
  function nsText(n) { return n === 1 ? 'לא הגיעה פעם אחת' : 'לא הגיעה ' + n + ' פעמים'; }
  function rowHtml(i) {
    var st = i.pending ? 'booked' : i.status, id = esc(i.id), over = Date.parse(i.end) < Date.now();
    var waiting = i.src === 'link' && i.status === 'booked' && !i.pending && !over; // from the public link, not confirmed yet
    var sub = esc(i.name) + (i.pending ? '<span class="bkPend"> · נשלח, מתעדכן</span>' : waiting ? '<span class="bkPend"> · ממתין לאישור</span>' : '');
    var ask = askCancel === i.id, ph = validPh(i.phone) ? i.phone : '', hl = ph && D.health && D.health[ph];
    var blocked = ph && phoneFlag(ph, !!i.blocked), ns = ph ? ((D.noshows || {})[ph] || 0) : 0;
    var chips = (hl ? '<button type="button" class="bkChip bkChipB" data-a="hlview" data-id="' + id + '">📋 הצהרת בריאות</button>' : '')
      + (blocked ? '<span class="bkChip bkChipR">חסומה</span>' : '') + (ns ? '<span class="bkChip bkChipN">' + nsText(ns) + '</span>' : '');
    // a booking from the public link is not a client of hers until she taps once
    var addC = i.src === 'link' && !i.hasClient && i.id ? '<button type="button" class="bkLink" data-a="addclient" data-id="' + id + '">להוסיף ללקוחות</button>' : '';
    var acts = '', extra = '';
    if (!(i.pending && !i.id)) {
      if (over) acts = (st === 'noshow' ? '' : '<button type="button" class="bkLink" data-a="noshow" data-id="' + id + '">לא הגיעה</button>') + addC
        + (st === 'noshow' || !i.id ? '' : '<button type="button" class="bkLink" data-a="photo" data-id="' + id + '"' + ctxAttrs({ clientId: i.clientId || '', phone: ph, name: i.name }) + '>📸 לפני ואחרי</button>')
        + (i.id ? '<button type="button" class="bkLink" data-a="ccard"' + ctxAttrs({ clientId: i.clientId || '', phone: ph, name: i.name }) + '>כרטיס לקוחה</button>' : '');
      else acts = (waiting ? '<button type="button" class="bkLink" data-a="ok" data-id="' + id + '">לאשר</button>' : '') + '<button type="button" class="bkLink" data-a="move" data-id="' + id + '">להזיז</button>'
        + '<button type="button" class="bkLink' + (ask ? ' bkWarn' : '') + '" data-a="' + (ask ? 'cancel2' : 'cancel') + '" data-id="' + id + '">' + (ask ? 'לבטל באמת' : 'לבטל') + '</button>' + addC;
      // blocking a client from the link (her own bookings made by the owner are not touched). From two no shows it opens by itself.
      if (ph && i.id) {
        var openMore = moreId === i.id || ns >= 2, askB = askBlock === i.id;
        acts += '<button type="button" class="bkLink" data-a="more" data-id="' + id + '" aria-expanded="' + openMore + '">' + (openMore ? 'פחות' : 'עוד') + '</button>';
        if (openMore) extra = '<div class="bkMore">' + (ns >= 2 ? '<span class="bkHint">היא לא הגיעה ' + ns + ' פעמים. אפשר לחסום מהקישור.</span>' : '')
          + (blocked ? '<button type="button" class="bkLink" data-a="unblock" data-phone="' + ph + '">לבטל חסימה</button>' : '<button type="button" class="bkLink' + (askB ? ' bkWarn' : '') + '" data-a="' + (askB ? 'block2' : 'block') + '" data-id="' + id + '">' + (askB ? 'לחסום באמת' : 'לחסום מהקישור') + '</button>') + '</div>';
      }
    }
    return '<div class="bkRow" data-id="' + id + '"><span class="bkT"><bdi dir="ltr">' + K.hm(Date.parse(i.start)) + '</bdi></span>'
      + '<span class="bkM"><b>' + esc(i.service) + '</b><small>' + sub + '</small>' + (chips ? '<small class="bkChips">' + chips + '</small>' : '') + '</span>'
      + '<i class="bkDot s' + esc(st) + '" role="img" aria-label="' + esc(STAT[st] || '') + '" title="' + esc(STAT[st] || '') + '"></i>'
      + (acts ? '<span class="bkAct">' + acts + '</span>' : '') + extra + '</div>';
  }
  function agenda() {
    var c = cfgView(), v = view(), t = K.ymd(Date.now()), h = '';
    for (var d = 0; d < 7; d++) {
      var day = K.addDays(t, d), its = v.filter(function (i) { return K.ymd(Date.parse(i.start)) === day; }).sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); });
      var parts = its.map(function (i) { return [Date.parse(i.start), rowHtml(i)]; });
      gaps(day, its, c).forEach(function (g) { parts.push([g[0], '<div class="bkGap"><span>פנוי <bdi dir="ltr">' + K.hm(g[0]) + '</bdi> עד <bdi dir="ltr">' + K.hm(g[1]) + '</bdi></span>' + gapLink(day, g, c) + '</div>']); });
      parts.sort(function (a, b) { return a[0] - b[0]; });
      h += '<div class="bkDay"><b>' + dayTitle(day, d) + '</b><span>' + day.slice(8) + '.' + day.slice(5, 7) + '</span></div>'
        + (parts.length ? parts.map(function (p) { return p[1]; }).join('') : '<div class="bkGap">יום סגור</div>');
    }
    return h;
  }
  // ---- hours and services ----
  // a select of quarter hours, not a time input: always 24 hours and always readable, whatever the phone's locale
  function timeSel(k, val, label) {
    var o = '', t, hh, mm, v, seen = false;
    for (t = 0; t < 1440; t += 15) {
      hh = Math.floor(t / 60); mm = t % 60; v = K.pad(hh) + ':' + K.pad(mm);
      if (v === val) seen = true;
      o += '<option' + (v === val ? ' selected' : '') + '>' + v + '</option>';
    }
    if (!seen) o = '<option selected>' + esc(val) + '</option>' + o;
    return '<select data-k="' + k + '" aria-label="' + esc(label) + '">' + o + '</select>';
  }
  function modeHtml() {
    var m = cfgView().approval, f = D.fem;
    var opts = [['approve', f ? 'אני מאשרת כל תור' : 'אני מאשר כל תור', 'תורים מהקישור מחכים ברשימה לאישור שלך'], ['auto', 'אישור אוטומטי', 'תור שנקבע מאושר מיד']];
    return '<div class="bkSec">איך מאשרים תורים מהקישור</div><div class="bkModes" role="radiogroup" aria-label="איך מאשרים תורים מהקישור">'
      + opts.map(function (o) { return '<button type="button" role="radio" class="bkMode" data-a="mode" data-m="' + o[0] + '" aria-checked="' + (m === o[0]) + '"><b>' + o[1] + '</b><small>' + o[2] + '</small></button>'; }).join('') + '</div>';
  }
  function settings() {
    var c = cfgView(), h = '<div class="bkSec">השעות שלי</div>';
    for (var d = 0; d < 7; d++) {
      var r = c.hours[d] && c.hours[d].length ? c.hours[d][0] : ['09:00', '17:00'], closed = !(c.hours[d] && c.hours[d].length);
      h += '<div class="bkHrs" data-d="' + d + '"><b>' + DAYS[d] + '</b><label class="bkChk"><input type="checkbox" data-k="closed"' + (closed ? ' checked' : '') + '> סגור</label>'
        + timeSel('from', r[0], 'פתיחה ' + DAYS[d]) + '<span>עד</span>' + timeSel('to', r[1], 'סגירה ' + DAYS[d]) + '</div>';
    }
    h += '<button type="button" class="bkBtn" data-a="hours">לשמור שעות</button>';
    // 23.11.2026: the cancellation terms, written in the confirmation her client gets and enforced on the client's own page
    h += '<div class="bkSec">התנאים לביטול</div><p class="bkIntro">עד כמה זמן לפני התור לקוחה יכולה לבטל או לשנות בעצמה. התנאי נכתב באישור שהיא מקבלת.</p><label class="bkCxl">ביטול או שינוי עד <select data-k="cxh" aria-label="ביטול או שינוי עד כמה שעות לפני התור">'
      + [[0, 'בלי הגבלה'], [2, '2'], [4, '4'], [12, '12'], [24, '24'], [48, '48']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === c.cancelHours ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select> שעות לפני התור</label>';
    h += modeHtml();
    h += '<div class="bkSec">שירותים ומחירים</div>';
    h += c.services.length ? c.services.map(function (s) {
      return '<div class="bkSvc"><span class="bkM"><b>' + esc(s.name) + '</b><small>' + s.minutes + ' דק׳, ' + s.price + ' ₪</small></span><button type="button" class="bkLink" data-a="unsvc" data-name="' + esc(s.name) + '">להסיר</button>'
        + '<label class="bkHlChk"><input type="checkbox" data-k="hl" data-name="' + esc(s.name) + '"' + (s.health ? ' checked' : '') + '> דורש הצהרת בריאות</label></div>';
    }).join('') : '<div class="bkGap">עוד אין שירותים</div>';
    h += '<form class="bkAdd" data-a="svcform"><input data-k="sn" placeholder="שם השירות" aria-label="שם השירות" autocomplete="off"><input data-k="sm" inputmode="numeric" placeholder="דקות" aria-label="כמה דקות"><input data-k="sp" inputmode="numeric" placeholder="מחיר" aria-label="מחיר בשקלים">'
      + '<button type="submit" class="bkBtn">להוסיף שירות</button></form>';
    // the clients she blocked from the link
    var bl = c.blocked || [];
    h += '<div class="bkSec">חסומות</div>' + (bl.length ? bl.map(function (p) {
      var nm = ((D.blockedList || []).filter(function (x) { return x.phone === p; })[0] || {}).name || '';
      return '<div class="bkSvc"><span class="bkM"><b>' + esc(nm || 'לקוחה') + '</b><small><bdi dir="ltr">' + esc(p) + '</bdi></small></span><button type="button" class="bkLink" data-a="unblock" data-phone="' + esc(p) + '">לבטל חסימה</button></div>';
    }).join('') : '<div class="bkGap">אין לקוחות חסומות. אפשר לחסום מהקישור בכפתור עוד שליד התור.</div>');
    return h;
  }
  // the permanent link her clients book with: shown, copied, shared on WhatsApp; made once on the first tap
  // ---- links that open the booking page on a day, a service or a time ----
  var lk = { mode: 'all', d: '', s: '' };
  function mkLink(d, sv, t) {
    var q = []; if (d) q.push('d=' + d); if (sv) q.push('s=' + encodeURIComponent(sv)); if (t) q.push('t=' + t);
    return D.link + (q.length ? '?' + q.join('&') : '');
  }
  function openDays() {
    var c = cfgView(), t = K.ymd(Date.now()), out = [];
    for (var i = 0; i <= 14; i++) { var d = K.addDays(t, i); if (K.ranges(c, d).length) out.push(d); }
    return out;
  }
  function dayName(d) { return DAYS[K.dow(d)] + ' ' + d.slice(8) + '.' + d.slice(5, 7); }
  function curLink() {
    if (lk.mode !== 'day') return D.link;
    var od = openDays(), d = od.indexOf(lk.d) >= 0 ? lk.d : od[0];
    return mkLink(d, lk.s, '');
  }
  // the first start on the slot grid that is inside this free gap, or '' when there is none
  function gapStart(day, g) {
    var step = (cfgView().slotMinutes || 15) * 60000, k = Math.ceil((g[0] - g[2]) / step), t = g[2] + k * step;
    return t < g[1] ? K.hm(t) : '';
  }
  function gapLink(day, g, c) {
    var t = D.link ? gapStart(day, g) : '';
    return t ? '<button type="button" class="bkLink" data-a="gaplink" data-d="' + day + '" data-t="' + t + '">לשלוח קישור</button>' : '';
  }
  function linkSheet(day, t) {
    var c = cfgView(), url = '';
    var inner = '<div class="bk"><p class="bkIntro">הקישור פותח את דף ההזמנה על ' + esc(dayName(day)) + ' בשעה ' + t + '. מי שמקבל אותו יכול לשנות יום ושירות.</p>'
      + '<label class="bkL2">שירות (לא חובה)<select id="bkLs"><option value="">כל השירותים</option>' + c.services.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('') + '</select></label>'
      + '<div class="bkUrl" id="bkLu"></div><div class="bkAct2"><button type="button" class="bkBtn" id="bkLc">להעתיק</button><button type="button" class="bkBtn alt" id="bkLw">לשלוח בוואטסאפ</button></div></div>';
    sheetOf('bkLinkS', 'קישור לקביעת תור', inner, function (w) {
      function upd() { url = mkLink(day, w.querySelector('#bkLs').value, t); w.querySelector('#bkLu').innerHTML = '<bdi dir="ltr">' + esc(url) + '</bdi>'; }
      upd(); w.querySelector('#bkLs').addEventListener('change', upd);
      w.querySelector('#bkLc').addEventListener('click', function () { copyText(url); });
      w.querySelector('#bkLw').addEventListener('click', function () { W.open('https://wa.me/?text=' + encodeURIComponent(D.t.wa + url), '_blank', 'noopener'); });
    });
  }
  function copyText(x) {
    try { navigator.clipboard.writeText(x).then(function () { sent('הקישור הועתק.'); }, function () { sent('ההעתקה לא הצליחה. אפשר ללחוץ על הקישור ולהעתיק.'); }); } catch (e) { sent('ההעתקה לא הצליחה. אפשר ללחוץ על הקישור ולהעתיק.'); }
  }
  // after the evening hour of the reminders, tomorrow at a glance: time, first name, service
  function tomorrowBlock() {
    var t = K.addDays(K.ymd(Date.now()), 1), remindAt = (D.cfg && D.cfg.remindAt) || '18:00';
    if (K.hm(Date.now()) < remindAt) return '';
    var its = view().filter(function (i) { return K.ymd(Date.parse(i.start)) === t; }).sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); });
    if (!its.length) return '';
    return '<div class="bkTom" role="region" aria-label="מחר"><b>מחר</b><span>' + (its.length === 1 ? 'תור אחד' : its.length + ' תורים') + '</span>'
      + its.map(function (i) { return '<div><bdi dir="ltr">' + K.hm(Date.parse(i.start)) + '</bdi> ' + esc(String(i.name).split(' ')[0]) + ', ' + esc(i.service) + '</div>'; }).join('') + '</div>';
  }
  function linkBlock() {
    var l = D.link;
    if (!l) return '<div class="bkLinkBox"><b>הקישור לקביעת תור</b><small>קישור אחד קבוע ללקוחות. הם קובעים לבד, והתור נכנס ליומן.</small><button type="button" class="bkBtn" data-a="mklink">ליצור קישור</button></div>';
    var day = lk.mode === 'day', od = openDays(), cur = od.indexOf(lk.d) >= 0 ? lk.d : od[0];
    return '<div class="bkLinkBox"><b>הקישור לקביעת תור</b>'
      + '<div class="bkSeg" role="group" aria-label="סוג הקישור"><button type="button" data-a="lkmode" data-m="all" aria-pressed="' + (!day) + '">קישור כללי</button><button type="button" data-a="lkmode" data-m="day" aria-pressed="' + day + '">קישור לתאריך</button></div>'
      + (day ? '<div class="bkPick"><select data-k="lkd" aria-label="יום">' + od.map(function (d) { return '<option value="' + d + '"' + (d === cur ? ' selected' : '') + '>' + esc(dayName(d)) + '</option>'; }).join('') + '</select>'
        + '<select data-k="lks" aria-label="שירות"><option value="">כל השירותים</option>' + cfgView().services.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === lk.s ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></div>' : '')
      + '<div class="bkUrl"><bdi dir="ltr">' + esc(curLink()) + '</bdi></div><div class="bkAct2"><button type="button" class="bkBtn" data-a="copy">להעתיק</button><button type="button" class="bkBtn alt" data-a="wa">לשלוח בוואטסאפ</button></div></div>';
  }
  function doLink(a) {
    if (a === 'copy') {
      copyText(curLink());
    } else if (a === 'wa') {
      W.open('https://wa.me/?text=' + encodeURIComponent(D.t.wa + curLink()), '_blank', 'noopener');
    } else if (a === 'mklink') {
      var g = W.D || {};
      if (demo() || !g.visitKey || !g.payApi) { sent(D.t.fail); return; }
      fetch(g.payApi + '/api/book/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: g.visitKey }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j && j.link) { D.link = j.link; render(); } else sent(D.t.fail); }, function () { sent(D.t.fail); });
    }
  }
  function doConfirm(id) {
    send('אישור תור לקוחה: ' + id).then(function () { add({ t: 'confirm', id: id }); sent('נשלח, מתעדכן. התור יסומן כמאושר.'); }, function () { sent(failText()); });
  }
  function doAddClient(id) {
    send('הוספת לקוחה: ' + id).then(function () { add({ t: 'client', id: id }); sent('נשלח, מתעדכן. הלקוחה תיכנס לרשימת הלקוחות שלך.'); }, function () { sent(failText()); });
  }
  function doNoshow(id) {
    send('סימון תור לקוחה: ' + id + ' | noshow').then(function () { add({ t: 'mark', id: id, status: 'noshow' }); sent('נשלח, מתעדכן. התור סומן כתור שלא הגיעו אליו.'); }, function () { sent(failText()); });
  }
  // what waits for her confirmation from the public link, at the very top: one tap clears a lock made by a stranger under a real client's phone
  function pendTop() {
    var t = Date.now(), its = view().filter(function (i) { return i.src === 'link' && i.status === 'booked' && !i.pending && Date.parse(i.end) > t; })
      .sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); }).slice(0, 10);
    if (!its.length) return '';
    return '<div class="bkPendTop" role="region" aria-label="ממתינים לאישור"><b>ממתינים לאישור</b><span>' + its.length + '</span>'
      + its.map(function (i) { return '<div class="bkPTd">' + esc(dayName(K.ymd(Date.parse(i.start)))) + '</div>' + rowHtml(i); }).join('') + '</div>';
  }
  // the caps of the link and "open the link again now"
  function limitsHtml() {
    var c = cfgView(), l = c.limits || { perHour: 12, perDay: 40 };
    return '<div class="bkSec">קביעה דרך הקישור</div><p class="bkIntro">כמה תורים אפשר לקבוע מהקישור. כשהמספר מגיע, הקישור נסגר זמנית.</p>'
      + '<div class="bkLim"><label>בשעה<input data-k="lh" inputmode="numeric" value="' + l.perHour + '"></label><label>ביום<input data-k="ld" inputmode="numeric" value="' + l.perDay + '"></label></div>'
      + '<button type="button" class="bkBtn" data-a="limits">לשמור מגבלות</button><button type="button" class="bkBtn alt" data-a="reopen">לפתוח את הקישור שוב עכשיו</button>';
  }
  function doLimits() {
    var h = parseInt(body.querySelector('[data-k="lh"]').value, 10), d = parseInt(body.querySelector('[data-k="ld"]').value, 10);
    if (!(h >= 1 && h <= 200 && d >= 1 && d <= 1000)) { sent('המגבלה צריכה להיות בין 1 ל 200 בשעה ובין 1 ל 1000 ביום.'); return; }
    send('מגבלות קישור: ' + h + ' | ' + d).then(function () { add({ t: 'limits', h: h, d: d }); sent('נשלח, מתעדכן. המגבלות החדשות ייכנסו לתוקף.'); }, function () { sent(failText()); });
  }
  function doCancelTerms(v) {
    var h = parseInt(v, 10); if (!(h === 0 || h === 2 || h === 4 || h === 12 || h === 24 || h === 48)) return;
    send('תנאי ביטול: ' + (h === 0 ? 'ללא הגבלה' : h)).then(function () { add({ t: 'cxh', h: h }); sent(h === 0 ? 'נשלח, מתעדכן. לקוחות יוכלו לבטל או לשנות בכל זמן.' : 'נשלח, מתעדכן. לקוחות יוכלו לבטל או לשנות עד ' + h + ' שעות לפני התור.'); }, function () { sent(failText()); });
  }
  function doMode(m) {
    send('אישור תורים: ' + (m === 'auto' ? 'אוטומטי' : 'ידני')).then(function () { add({ t: 'mode', m: m }); sent(m === 'auto' ? 'נשלח, מתעדכן. תור שנקבע מהקישור יהיה מאושר מיד.' : 'נשלח, מתעדכן. תורים מהקישור יחכו לאישור שלך.'); }, function () { sent(failText()); });
  }
  function doHealthSvc(name, on) {
    send('הצהרת בריאות לשירות: ' + clean(name) + ': ' + (on ? 'כן' : 'לא')).then(function () { add({ t: 'hl', name: name, on: !!on }); sent(on ? 'נשלח, מתעדכן. לשירות ' + name + ' לקוחה תמלא הצהרת בריאות ותחתום עליה לפני שהתור נקבע.' : 'נשלח, מתעדכן. לשירות ' + name + ' כבר לא תידרש הצהרת בריאות.'); }, function () { sent(failText()); });
  }
  function phoneOf(id) { var it = view().filter(function (x) { return x.id === id; })[0]; return it && validPh(it.phone) ? it.phone : ''; }
  function doBlock(id) {
    var ph = phoneOf(id); askBlock = ''; if (!ph) return;
    send('חסימת לקוחה: ' + id).then(function () { add({ t: 'block', phone: ph }); sent('נשלח, מתעדכן. היא לא תוכל לקבוע תור חדש דרך הקישור, ותורים שכבר נקבעו נשארים.'); }, function () { sent(failText()); });
  }
  function doUnblock(ph) {
    send('ביטול חסימה: ' + ph).then(function () { add({ t: 'unblock', phone: ph }); sent('נשלח, מתעדכן. היא יכולה שוב לקבוע תור דרך הקישור.'); }, function () { sent(failText()); });
  }
  // the health declaration of a client: the answers (yes in red), her note, the signature as a small drawing, and the date
  function healthSheet(id) {
    var it = view().filter(function (x) { return x.id === id; })[0], r = it && D.health && D.health[it.phone];
    if (!r) return;
    var day = K.ymd(Date.parse(r.at)), dmy = day.slice(8) + '.' + day.slice(5, 7) + '.' + day.slice(0, 4), qs = Object.keys(r.answers).sort();
    var sig = /^[ML0-9,]+$/.test(String(r.sig || '')) ? '<svg class="bkSig" viewBox="0 0 300 120" role="img" aria-label="חתימה"><path d="' + r.sig + '" fill="none" stroke="#16202c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
    var inner = '<div class="bk"><p class="bkIntro">' + esc(it.name) + ', נחתם ב ' + dmy + '. ' + (r.valid ? 'בתוקף, עד שנה מהחתימה.' : 'עברה שנה מהחתימה, כדאי לבקש הצהרה חדשה.') + '</p>'
      + qs.map(function (q) { var a = r.answers[q] || {}, y = a.a === 'y'; return '<div class="bkHq' + (y ? ' y' : '') + '"><span>' + esc((r.q || {})[q] || q) + '</span><b>' + (y ? 'כן' : 'לא') + '</b>' + (y && a.d ? '<small>' + esc(a.d) + '</small>' : '') + '</div>'; }).join('')
      + (r.note ? '<div class="bkHq"><span>' + esc((r.q || {}).q8 || 'הערה') + '</span><small>' + esc(r.note) + '</small></div>' : '') + sig + '</div>';
    sheetOf('bkHealth', 'הצהרת בריאות', inner, function () {});
  }
  function doReopen() {
    send('פתיחת קישור: עכשיו').then(function () { sent('נשלח, מתעדכן. הקישור ייפתח שוב והספירה של השעה תתחיל מחדש.'); }, function () { sent(failText()); });
  }
  // ---- 24.11.2026: punch cards, gift cards, the client card and before and after photos (lib/book-beauty.js) ----
  // These ops are not about one booking: view() keeps them until the built data has what they asked for (xDone), or they are old.
  var XOPS = { psell: 1, padj: 1, pclose: 1, gnew: 1, guse: 1, photo: 1 };
  var askPack = '';
  function dmy(d) { return d ? d.slice(8) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : ''; }
  function xDone(op) {
    var f;
    if (op.t === 'psell') return (D.packs || []).some(function (p) { return p.service === op.service && p.total === op.total && ((op.cid && p.clientId === op.cid) || (op.phone && p.phone === op.phone)) && Date.parse(p.createdAt) >= op.at - 300000; });
    if (op.t === 'padj' || op.t === 'pclose') { f = (D.packs || []).filter(function (p) { return p.id === op.id; })[0]; return !f || (op.t === 'padj' ? f.adjust !== op.base : f.closed); }
    if (op.t === 'gnew') return (D.gifts || []).some(function (g) { return g.recipient === op.recipient && Date.parse(g.createdAt) >= op.at - 300000; });
    if (op.t === 'guse') { f = (D.gifts || []).filter(function (g) { return g.id === op.id; })[0]; return !f || f.left !== op.base; }
    if (op.t === 'photo') return (D.photos || []).some(function (x) { return x.id === op.pair; });
    return false;
  }
  function liveX(op, t) { return op && XOPS[op.t] && op.at >= t - HOLD && !xDone(op); }
  // the cards as built, with what was sent and is not in the built data yet
  function packsList() {
    var out = (D.packs || []).map(copy), t = Date.now();
    pend.forEach(function (op) {
      if (!liveX(op, t)) return;
      if (op.t === 'psell') out.unshift({ id: '', pending: true, clientId: op.cid, phone: op.phone, name: op.name, service: op.service, total: op.total, left: op.total, used: 0, closed: false, expired: false });
      else if (op.t === 'padj') out.forEach(function (x) { if (x.id === op.id) { x.left = Math.max(0, x.left + op.d); x.pending = true; } });
      else if (op.t === 'pclose') out.forEach(function (x) { if (x.id === op.id) x.closed = true; });
    });
    return out;
  }
  function giftsList() {
    var out = (D.gifts || []).map(copy), t = Date.now();
    pend.forEach(function (op) {
      if (!liveX(op, t)) return;
      if (op.t === 'gnew') out.unshift({ id: '', pending: true, code: '', kind: op.k, amount: op.k === 'amount' ? op.v : 0, left: op.k === 'amount' ? op.v : 1, service: op.k === 'service' ? op.v : '', recipient: op.recipient, expires: op.expires, state: 'active', url: '' });
      else if (op.t === 'guse') out.forEach(function (g) { if (g.id === op.id) { g.pending = true; g.left = op.amt > 0 ? Math.max(0, g.left - op.amt) : 0; if (g.left <= 0) g.state = 'used'; } });
    });
    return out;
  }
  function photosList() {
    var out = (D.photos || []).map(copy), t = Date.now();
    pend.forEach(function (op) { if (liveX(op, t) && op.t === 'photo') out.unshift({ id: op.pair, pending: true, clientId: op.clientId, phone: op.phone, name: op.name, bookingId: op.bookingId, service: op.service, date: op.date, bt: op.bt, at: op.at2, full: [op.pair + '_b.jpg', op.pair + '_a.jpg'] }); });
    return out;
  }
  function ctxOf(b) { return { clientId: b.getAttribute('data-cid') || '', phone: b.getAttribute('data-ph') || '', name: b.getAttribute('data-nm') || '' }; }
  function ctxAttrs(c) { return ' data-cid="' + esc(c.clientId || '') + '" data-ph="' + esc(c.phone || '') + '" data-nm="' + esc(c.name || '') + '"'; }
  function mineOf(c, x) { return !!((c.clientId && x.clientId === c.clientId) || (c.phone && x.phone === c.phone)); }
  function leftText(p) { return 'נשארו ' + p.left + ' מתוך ' + p.total; }
  function packSub(p) { return esc(p.service) + ', ' + leftText(p) + (p.pending ? '<span class="bkPend"> · נשלח, מתעדכן</span>' : '') + (p.expired ? ' · פג תוקף' : p.expires ? ' · עד ' + dmy(p.expires) : ''); }
  function packRow(p) {
    var id = esc(p.id), ask = askPack === p.id, acts = '';
    if (p.id) acts = '<button type="button" class="bkLink" data-a="padj" data-id="' + id + '" data-d="up" aria-label="להוסיף טיפול אחד">+1</button><button type="button" class="bkLink" data-a="padj" data-id="' + id + '" data-d="down" aria-label="להוריד טיפול אחד">−1</button>'
      + '<button type="button" class="bkLink' + (ask ? ' bkWarn' : '') + '" data-a="' + (ask ? 'pclose2' : 'pclose') + '" data-id="' + id + '">' + (ask ? 'לסגור באמת' : 'לסגור') + '</button>'
      + '<button type="button" class="bkLink" data-a="ccard"' + ctxAttrs(p) + '>כרטיס לקוחה</button>';
    return '<div class="bkSvc bkPack"><span class="bkM"><b>' + esc(p.name) + '</b><small>' + packSub(p) + '</small></span>' + (acts ? '<span class="bkAct">' + acts + '</span>' : '') + '</div>';
  }
  function packsHtml() {
    var ps = packsList(), open = ps.filter(function (p) { return !p.closed; }), shut = ps.filter(function (p) { return p.closed; }).slice(0, 3);
    return '<div class="bkSec">כרטיסיות</div><p class="bkIntro">הלקוחה קונה כמה טיפולים מראש. כל ביקור שמסומן כהסתיים מוריד טיפול אחד, ובטיפול האחרון אכין לך הודעה לחידוש.</p>'
      + (open.length ? open.map(packRow).join('') : '<div class="bkGap">עוד אין כרטיסיות</div>')
      + shut.map(function (p) { return '<div class="bkGap"><span>' + esc(p.name) + ', ' + esc(p.service) + ' · סגורה</span></div>'; }).join('')
      + '<button type="button" class="bkBtn" data-a="psellform">למכור כרטיסייה</button>';
  }
  function giftWorth(g) { return g.kind === 'amount' ? (g.left < g.amount ? g.left + ' ₪ מתוך ' + g.amount + ' ₪' : g.amount + ' ₪') : g.service; }
  function giftRow(g) {
    var id = esc(g.id), chip = g.state === 'used' ? '<span class="bkChip bkChipN">נוצל</span>' : g.state === 'expired' ? '<span class="bkChip bkChipR">פג תוקף</span>' : '<span class="bkChip">פעיל</span>';
    var acts = g.id && g.url ? '<button type="button" class="bkLink" data-a="gcopy" data-id="' + id + '">להעתיק קישור</button><button type="button" class="bkLink" data-a="gwa" data-id="' + id + '">לשלוח בוואטסאפ</button>'
      + (g.state === 'active' ? '<button type="button" class="bkLink" data-a="guseform" data-id="' + id + '">לסמן שימוש</button>' : '') : '';
    return '<div class="bkSvc bkGiftRow"><span class="bkM"><b>' + esc(g.recipient) + '</b><small>' + esc(giftWorth(g)) + (g.code ? ' · קוד <bdi dir="ltr">' + esc(g.code) + '</bdi>' : '') + (g.expires ? ' · עד ' + dmy(g.expires) : '')
      + (g.pending ? '<span class="bkPend"> · נשלח, מתעדכן</span>' : '') + '</small><small class="bkChips">' + chip + '</small></span>' + (acts ? '<span class="bkAct">' + acts + '</span>' : '') + '</div>';
  }
  function giftsHtml() {
    var gs = giftsList();
    return '<div class="bkSec">כרטיסי מתנה</div><p class="bkIntro">כרטיס יפה עם קוד ודף לשיתוף. הלקוחה שמקבלת אותו לוחצת וקובעת תור.</p>'
      + (gs.length ? gs.map(giftRow).join('') : '<div class="bkGap">עוד אין כרטיסי מתנה</div>') + '<button type="button" class="bkBtn" data-a="gnewform">כרטיס מתנה חדש</button>';
  }
  function clientsHtml() {
    var cs = (D.clients || []).slice(0, 60);
    return '<div class="bkSec">הלקוחות</div><p class="bkIntro">הכרטיס של כל לקוחה: הכרטיסיות שלה והתמונות לפני ואחרי.</p>'
      + (cs.length ? '<div class="bkChips bkCl">' + cs.map(function (c) { return '<button type="button" class="bkChip bkChipB" data-a="ccard"' + ctxAttrs({ clientId: c.id, phone: validPh(c.p) ? c.p : '', name: c.name }) + '>' + esc(c.name) + '</button>'; }).join('') + '</div>' : '<div class="bkGap">עוד אין לקוחות</div>');
  }
  // a person for the pickers: the client records, then people who booked from the link and are not clients yet (by phone)
  function people() {
    var out = [], seen = {};
    (D.clients || []).forEach(function (c) { out.push({ ref: c.id, name: c.name, clientId: c.id, phone: validPh(c.p) ? c.p : '' }); if (validPh(c.p)) seen[c.p] = 1; });
    view().forEach(function (i) { if (validPh(i.phone) && !seen[i.phone]) { seen[i.phone] = 1; out.push({ ref: i.phone, name: i.name, clientId: i.clientId || '', phone: i.phone }); } });
    return out;
  }
  // ---- the sale of a punch card ----
  function formPack(pre) {
    var c = cfgView(), ps = people();
    if (!c.services.length) { sent(D.t.noSvc); return; }
    if (!ps.length) { sent('עוד אין לקוחות. אפשר להוסיף לקוחה מתור שנקבע, ואז למכור לה כרטיסייה.'); return; }
    var inner = '<form class="bk bkForm" id="bkPf" novalidate><label>לקוחה<select id="bkPc">' + ps.map(function (p) { var sel = pre && ((pre.clientId && p.clientId === pre.clientId) || (pre.phone && p.phone === pre.phone)); return '<option value="' + esc(p.ref) + '"' + (sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>'
      + '<label>טיפול<select id="bkPs">' + c.services.map(function (s) { return '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>'; }).join('') + '</select></label>'
      + '<label>כמה טיפולים בכרטיסייה<input id="bkPn" inputmode="numeric" value="5"></label><label>כמה שולמו, בשקלים<input id="bkPp" inputmode="numeric" placeholder="0"></label>'
      + '<label>בתוקף עד (לא חובה)<input id="bkPe" type="date" min="' + K.addDays(K.ymd(Date.now()), 1) + '"></label><div class="bkSay" id="bkSay" role="status"></div><button type="submit" class="bkPrimary">למכור</button></form>';
    return sheetOf('bkPack', 'כרטיסייה חדשה', inner, function (w) {
      w.querySelector('#bkPf').addEventListener('submit', function (e) {
        e.preventDefault();
        var sel = w.querySelector('#bkPc'), ref = sel.value, who = ps.filter(function (p) { return p.ref === ref; })[0], sv = w.querySelector('#bkPs').value, n = parseInt(w.querySelector('#bkPn').value, 10), pr = parseFloat(w.querySelector('#bkPp').value || '0'), ex = w.querySelector('#bkPe').value, say = w.querySelector('#bkSay');
        if (!who || !sv || !(n >= 1 && n <= 100) || !(pr >= 0)) { say.textContent = 'צריך לקוחה, טיפול, מספר טיפולים בין 1 ל 100 ומחיר.'; return; }
        say.textContent = 'שולח...';
        send('מכירת כרטיסייה: ' + ref + ' | ' + clean(sv) + ' | ' + n + ' | ' + pr + ' | ' + ex).then(function () {
          add({ t: 'psell', cid: who.clientId, phone: who.phone, name: who.name, service: sv, total: n });
          w.remove(); sent('נשלח, מתעדכן. הכרטיסייה של ' + who.name + ' תיכנס לרשימה.');
        }, function () { say.textContent = failText(); });
      });
    });
  }
  function doPackAdj(id, d) {
    var p = packsList().filter(function (x) { return x.id === id; })[0], base = ((D.packs || []).filter(function (x) { return x.id === id; })[0] || {}).adjust;
    if (!p || base == null) return;
    if (d < 0 && p.left <= 0) { sent('בכרטיסייה הזאת לא נשארו טיפולים.'); return; }
    send('תיקון כרטיסייה: ' + id + ' | ' + (d > 0 ? 'הוספה' : 'הורדה')).then(function () { add({ t: 'padj', id: id, d: d, base: base }); sent('נשלח, מתעדכן. מספר הטיפולים שנשארו ישתנה.'); }, function () { sent(failText()); });
  }
  function doPackClose(id) {
    askPack = '';
    send('סגירת כרטיסייה: ' + id).then(function () { add({ t: 'pclose', id: id }); sent('נשלח, מתעדכן. הכרטיסייה תיסגר.'); }, function () { sent(failText()); });
  }
  // ---- gift cards ----
  function formGift() {
    var c = cfgView(), kind = 'amount';
    var inner = '<form class="bk bkForm" id="bkGf" novalidate><div class="bkSeg" role="group" aria-label="סוג הכרטיס"><button type="button" class="bkOpt" data-g="amount" aria-pressed="true">סכום בשקלים</button><button type="button" class="bkOpt" data-g="service" aria-pressed="false">טיפול</button></div>'
      + '<div id="bkGv"></div><label>שם הקונה<input id="bkGb" autocomplete="off"></label><label>טלפון הקונה, לשליחת הקישור (לא חובה)<input id="bkGp" inputmode="tel" autocomplete="off"></label>'
      + '<label>למי המתנה<input id="bkGr" autocomplete="off"></label><label>ברכה (לא חובה)<textarea id="bkGm" maxlength="300" rows="3"></textarea></label>'
      + '<label>בתוקף עד (ברירת מחדל: שנה)<input id="bkGe" type="date" min="' + K.addDays(K.ymd(Date.now()), 1) + '"></label><div class="bkSay" id="bkSay" role="status"></div><button type="submit" class="bkPrimary">ליצור כרטיס מתנה</button></form>';
    return sheetOf('bkGift', 'כרטיס מתנה חדש', inner, function (w) {
      function val() {
        w.querySelector('#bkGv').innerHTML = kind === 'amount' ? '<label>סכום בשקלים<input id="bkGa" inputmode="numeric" placeholder="300"></label>'
          : '<label>טיפול<select id="bkGs">' + c.services.map(function (s) { return '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>'; }).join('') + '</select></label>';
      }
      val();
      w.addEventListener('click', function (e) {
        var o = e.target.closest && e.target.closest('[data-g]'); if (!o) return;
        bkFx(o, e); kind = o.getAttribute('data-g');
        [].forEach.call(w.querySelectorAll('[data-g]'), function (b) { b.setAttribute('aria-pressed', b === o ? 'true' : 'false'); }); val();
      });
      w.querySelector('#bkGf').addEventListener('submit', function (e) {
        e.preventDefault();
        var say = w.querySelector('#bkSay'), rec = clean(w.querySelector('#bkGr').value), buyer = clean(w.querySelector('#bkGb').value), ph = clean(w.querySelector('#bkGp').value), msg = clean(w.querySelector('#bkGm').value), ex = w.querySelector('#bkGe').value;
        var v = kind === 'amount' ? parseFloat(w.querySelector('#bkGa').value) : w.querySelector('#bkGs') ? w.querySelector('#bkGs').value : '';
        if (!rec || (kind === 'amount' ? !(v > 0 && v <= 100000) : !v)) { say.textContent = 'צריך שם למי המתנה, וסכום או טיפול.'; return; }
        if (ph && ph.replace(/\D/g, '').length < 9) { say.textContent = 'הטלפון נראה קצר מדי. אפשר גם בלי טלפון.'; return; }
        say.textContent = 'שולח...';
        send('יצירת כרטיס מתנה: ' + (kind === 'amount' ? 'סכום' : 'שירות') + ' | ' + (kind === 'amount' ? v : clean(v)) + ' | ' + buyer + ' | ' + rec + ' | ' + msg + ' | ' + ex + ' | ' + ph).then(function () {
          add({ t: 'gnew', k: kind, v: kind === 'amount' ? v : String(v), recipient: rec, expires: ex });
          w.remove(); sent('נשלח, מתעדכן. כרטיס המתנה ל' + rec + ' ייכנס לרשימה, ושם יהיה הקישור לשיתוף.');
        }, function () { say.textContent = failText(); });
      });
    });
  }
  function giftById(id) { return giftsList().filter(function (g) { return g.id === id; })[0]; }
  function giftText(g) { return D.t.gift + g.url; }
  function formGiftUse(id) {
    var g = giftById(id); if (!g) return;
    var inner = '<form class="bk bkForm" id="bkUf" novalidate><p class="bkIntro">' + esc(g.recipient) + ', ' + esc(giftWorth(g)) + '</p>'
      + (g.kind === 'amount' ? '<label>כמה נוצל, בשקלים (ריק: הכל)<input id="bkUa" inputmode="numeric" placeholder="הכל"></label>' : '')
      + '<div class="bkSay" id="bkSay" role="status"></div><button type="submit" class="bkPrimary">לסמן שימוש</button></form>';
    return sheetOf('bkGiftUse', 'שימוש בכרטיס', inner, function (w) {
      w.querySelector('#bkUf').addEventListener('submit', function (e) {
        e.preventDefault();
        var inp = w.querySelector('#bkUa'), amt = inp ? parseFloat(inp.value) : 0, say = w.querySelector('#bkSay');
        if (inp && inp.value.trim() && !(amt > 0 && amt <= g.left)) { say.textContent = 'הסכום צריך להיות גדול מאפס ולא יותר ממה שנשאר: ' + g.left + ' ₪.'; return; }
        say.textContent = 'שולח...';
        var base = ((D.gifts || []).filter(function (x) { return x.id === id; })[0] || {}).left;
        send('שימוש בכרטיס מתנה: ' + id + ' | ' + (amt > 0 ? amt : 'הכל')).then(function () { add({ t: 'guse', id: id, amt: amt > 0 ? amt : 0, base: base }); w.remove(); sent('נשלח, מתעדכן. הכרטיס יסומן כמנוצל.'); }, function () { say.textContent = failText(); });
      });
    });
  }
  // ---- the client card and the before and after photos ----
  function pairHtml(x) {
    var ok = function (u) { return typeof u === 'string' && u.indexOf('data:image/jpeg;base64,') === 0 && /^[A-Za-z0-9+\/=:;,]+$/.test(u); };
    return '<div class="bkPair"><div class="bkPh">' + (ok(x.bt) ? '<img alt="לפני" src="' + x.bt + '">' : '') + '<span>לפני</span></div><div class="bkPh">' + (ok(x.at) ? '<img alt="אחרי" src="' + x.at + '">' : '') + '<span>אחרי</span></div>'
      + '<small>' + esc(dmy(x.date)) + (x.service ? ' · ' + esc(x.service) : '') + (x.pending ? '<span class="bkPend"> · נשלח, מתעדכן</span>' : '') + '</small>'
      + '<button type="button" class="bkLink" data-a="post" data-pair="' + esc(x.id) + '">✍️ פוסט מזה</button></div>';
  }
  function cardSheet(c) {
    var ps = packsList().filter(function (p) { return !p.closed && mineOf(c, p); }), ph = photosList().filter(function (x) { return mineOf(c, x); });
    var inner = '<div class="bk"><p class="bkIntro"><b>' + esc(c.name) + '</b>' + (c.phone ? '<br><bdi dir="ltr">' + esc(c.phone) + '</bdi>' : '') + '</p>'
      + '<div class="bkSec">כרטיסיות</div>' + (ps.length ? ps.map(function (p) { return '<div class="bkSvc"><span class="bkM"><b>' + esc(p.service) + '</b><small>' + leftText(p) + '</small></span></div>'; }).join('') : '<div class="bkGap">אין כרטיסייה פתוחה</div>')
      + '<div class="bkSec">לפני ואחרי</div>' + (ph.length ? ph.map(pairHtml).join('') : '<div class="bkGap">עוד אין תמונות</div>')
      + '<button type="button" class="bkBtn" data-a="photo"' + ctxAttrs(c) + '>📸 לפני ואחרי</button><button type="button" class="bkBtn alt" data-a="psellform"' + ctxAttrs(c) + '>למכור כרטיסייה</button></div>';
    return sheetOf('bkCard', 'כרטיס לקוחה', inner, function (w) { w.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-a]')) onAct(e); }); });
  }
  function rid() { var s = ''; while (s.length < 8) s += Math.random().toString(36).slice(2); return s.slice(0, 8); }
  // the browser makes the pictures small before they leave the phone: 1080 pixels at the most, JPEG; plus a small one for the gallery
  function shrink(file, max, q) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k));
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        cv.toBlob(function (b) { if (b) res(b); else rej(new Error('jpeg')); }, 'image/jpeg', q);
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image')); };
      im.src = url;
    });
  }
  function readUrl(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.onerror = rej; r.readAsDataURL(blob); }); }
  function formPhoto(c, bookingId) {
    var past = (D.recent || []).concat(view().filter(function (i) { return i.id && Date.parse(i.end) < Date.now(); })).filter(function (i) { return mineOf(c, i) || (!c.clientId && !c.phone && i.name === c.name); });
    var seenB = {}; past = past.filter(function (i) { if (seenB[i.id]) return false; seenB[i.id] = 1; return true; }).sort(function (a, b) { return Date.parse(b.start) - Date.parse(a.start); }).slice(0, 12);
    var st = { b: null, a: null }, busyP = false;
    var slot = function (k, t) { return '<div class="bkSlot" data-slot="' + k + '"><b>' + t + '</b><div class="bkPrev" id="bkPv' + k + '"></div><label class="bkPickBtn">📷 לצלם<input type="file" accept="image/*" capture="environment" class="bkFile" data-slot="' + k + '"></label><label class="bkPickBtn">🖼 מהגלריה<input type="file" accept="image/*" class="bkFile" data-slot="' + k + '"></label></div>'; };
    var inner = '<form class="bk bkForm" id="bkPhf" novalidate><p class="bkIntro">' + esc(c.name) + '. התמונות נשמרות אצלך בלבד, ולא מופיעות בדף הקביעה.</p>'
      + (past.length ? '<label>איזה טיפול<select id="bkPhb"><option value="">בלי תור מסוים</option>' + past.map(function (i) { return '<option value="' + esc(i.id) + '"' + (i.id === bookingId ? ' selected' : '') + '>' + dmy(K.ymd(Date.parse(i.start))).slice(0, 5) + ' · ' + esc(i.service) + '</option>'; }).join('') + '</select></label>' : '')
      + '<div class="bkSlots">' + slot('b', 'לפני') + slot('a', 'אחרי') + '</div><div class="bkSay" id="bkSay" role="status"></div><button type="submit" class="bkPrimary" id="bkPhGo">לשמור את התמונות</button></form>';
    return sheetOf('bkPhoto', 'לפני ואחרי', inner, function (w) {
      var say = w.querySelector('#bkSay');
      w.addEventListener('change', function (e) {
        var inp = e.target; if (!inp.classList || !inp.classList.contains('bkFile') || !inp.files || !inp.files[0]) return;
        var k = inp.getAttribute('data-slot'), f = inp.files[0], box = w.querySelector('.bkSlot[data-slot="' + k + '"]');
        say.textContent = 'מכווץ את התמונה...';
        shrink(f, 1080, 0.8).then(function (full) { return shrink(f, 300, 0.6).then(function (th) { return readUrl(th).then(function (u) { st[k] = { full: full, th: th, url: u }; }); }); }).then(function () {
          w.querySelector('#bkPv' + k).innerHTML = '<img alt="" src="' + st[k].url + '">'; box.classList.add('on'); say.textContent = '';
        }, function () { st[k] = null; box.classList.remove('on'); say.textContent = 'התמונה לא נפתחה. נסי תמונה אחרת.'; });
      });
      w.querySelector('#bkPhf').addEventListener('submit', function (e) {
        e.preventDefault(); if (busyP) return;
        if (!st.b || !st.a) { say.textContent = 'צריך תמונה של לפני ותמונה של אחרי.'; return; }
        var sel = w.querySelector('#bkPhb'), bid = sel ? sel.value : '', it = past.filter(function (i) { return i.id === bid; })[0], day = it ? K.ymd(Date.parse(it.start)) : K.ymd(Date.now()), pair = rid();
        if (!c.clientId && !bid) { say.textContent = 'כדי לשמור, צריך לבחור טיפול, או להוסיף את הלקוחה ללקוחות.'; return; }
        // only ids travel in this line, never a name or a phone; the files carry opaque names
        var line = /*keep*/ 'תמונות לפני ואחרי: ' + pair + ' | ' + c.clientId + ' | ' + bid + ' | ' + day;
        var op = { t: 'photo', pair: pair, clientId: c.clientId, phone: c.phone, name: c.name, bookingId: bid, service: it ? it.service : '', date: day, bt: st.b.url, at2: st.a.url };
        var finish = function () { add(op); w.remove(); sent('נשלח, מתעדכן. התמונות של ' + c.name + ' יופיעו בכרטיס שלה.'); };
        if (demo()) { try { if (W.demoAct) W.demoAct('תור לקוחה', line); } catch (e2) { /* the demo only says what would happen */ } finish(); return; }
        if (typeof sendAll !== 'function') { say.textContent = failText(); return; }
        busyP = true; say.textContent = 'שולח...';
        var files = [['b', st.b.full], ['a', st.a.full], ['bt', st.b.th], ['at', st.a.th]].map(function (x) { return new File([x[1]], 'ba_' + pair + '_' + x[0] + '.jpg', { type: 'image/jpeg' }); });
        sendAll(files, line).then(function () { busyP = false; finish(); }, function () { busyP = false; say.textContent = failText(); });
      });
    });
  }
  // the one place that puts a task on the monitor's channel (a normal task: the kind is the word the channel knows)
  function postOut(text) { return sendText('משימה מהמוניטור', text, 'משימה'); }
  // the owner asks the monitor for an Instagram post from a pair: a normal task, and the post never names the client
  function doPost(id) {
    var x = photosList().filter(function (p) { return p.id === id; })[0]; if (!x) return;
    var first = String(x.name || '').split(' ')[0], files = (x.full || []).map(function (f) { return 'data/bookings/photos/' + f; }).join(/*keep*/ ' ו ');
    var text = /*keep*/ 'כתוב פוסט לאינסטגרם על ' + (x.service || /*keep*/ 'הטיפול') + /*keep*/ ' של ' + first + /*keep*/ ' עם תמונות לפני ואחרי: ' + files + /*keep*/ '. בלי לציין את שם הלקוחה בפוסט, ובלי שום פרט שמזהה אותה. התמונות הן הראשונה לפני והשנייה אחרי. הפוסט מחכה לאישור שלי.';
    if (demo()) { try { if (W.demoAct) W.demoAct('משימה', text); } catch (e) { /* the demo only says what would happen */ } sent('הבקשה נשלחה למוניטור: פוסט לאינסטגרם מהתמונות.'); return; }
    if (typeof sendText !== 'function') { sent(failText()); return; }
    postOut(text).then(function () { sent('נשלח למוניטור: פוסט לאינסטגרם מהתמונות. הוא יחכה לאישור שלך.'); }, function () { sent(failText()); });
  }
  function render() {
    if (!body || !body.isConnected) return;
    var top = body.scrollTop;
    body.innerHTML = '<div class="bk' + (demo() ? ' bkDemo' : '') + '"><p class="bkIntro">' + esc(D.t.intro) + '</p>'
      + pendTop() + '<div class="bkTop"><button type="button" class="bkPrimary" data-a="new">➕ קביעת תור חדש</button></div>' + tomorrowBlock() + linkBlock()
      + (note ? '<div class="bkNote" role="status">' + esc(note) + '</div>' : '')
      + agenda() + packsHtml() + giftsHtml() + clientsHtml() + limitsHtml() + settings() + '</div>';
    body.scrollTop = top;
  }

  // ---- the new appointment and the move sheet ----
  function sheetOf(id, title, inner, after) {
    if (typeof shipOpen !== 'function') return null;
    return shipOpen(id, title, inner, after);
  }
  function timeOptions(w, ignoreId) {
    var c = cfgView(), sel = w.querySelector('#bkTime'), day = w.querySelector('#bkDate').value, say = w.querySelector('#bkSay');
    var svc = w.querySelector('#bkSvc'), mins = svc ? Number(svc.options[svc.selectedIndex].getAttribute('data-m')) : Number(w.getAttribute('data-m'));
    var its = view().filter(function (i) { return i.id !== ignoreId; });
    var s = day && mins ? K.slots(c, its, day, mins, Date.now()) : [];
    sel.innerHTML = s.length ? s.map(function (x) { return '<option value="' + x.time + '">' + x.time + '</option>'; }).join('') : '<option value="">אין שעה פנויה</option>';
    say.textContent = !day ? '' : (s.length ? '' : (K.ranges(c, day).length ? 'אין שעה פנויה ביום הזה, אפשר לבחור יום אחר.' : 'היום הזה סגור, אפשר לבחור יום אחר.'));
  }
  function firstOpenDay(mins, ignoreId) {
    var c = cfgView(), its = view().filter(function (i) { return i.id !== ignoreId; }), t = K.ymd(Date.now());
    for (var d = 0; d < 21; d++) { var day = K.addDays(t, d); if (K.slots(c, its, day, mins, Date.now()).length) return day; }
    return t;
  }
  function formNew() {
    var c = cfgView(), t = K.ymd(Date.now());
    if (!c.services.length) { sent(D.t.noSvc); return; }
    var inner = '<form class="bk bkForm" id="bkForm" novalidate>'
      + '<label>שם<input id="bkName" list="bkNames" autocomplete="off" placeholder="שם מלא"></label><datalist id="bkNames">' + D.clients.map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('') + '</datalist>'
      + '<label>טלפון<input id="bkPhone" inputmode="tel" autocomplete="off" placeholder="מספר טלפון"></label>'
      + '<label>שירות<select id="bkSvc">' + c.services.map(function (s) { return '<option value="' + esc(s.name) + '" data-m="' + s.minutes + '">' + esc(s.name) + ', ' + s.minutes + ' דק׳</option>'; }).join('') + '</select></label>'
      + '<label>תאריך<input id="bkDate" type="date" min="' + t + '"></label>'
      + '<label>שעה<select id="bkTime"></select></label>'
      + '<div class="bkSay" id="bkSay" role="status"></div>'
      + '<button type="submit" class="bkPrimary">לקבוע תור</button></form>';
    var w = sheetOf('bkNew', 'קביעת תור חדש', inner, function (w) {
      var svc = w.querySelector('#bkSvc'), dt = w.querySelector('#bkDate');
      dt.value = firstOpenDay(Number(svc.options[svc.selectedIndex].getAttribute('data-m')));
      timeOptions(w, '');
      svc.addEventListener('change', function () { dt.value = firstOpenDay(Number(svc.options[svc.selectedIndex].getAttribute('data-m'))); timeOptions(w, ''); });
      dt.addEventListener('change', function () { timeOptions(w, ''); });
      w.querySelector('#bkName').addEventListener('change', function () {
        var n = this.value.trim(), ph = w.querySelector('#bkPhone');
        D.clients.forEach(function (x) { if (x.name === n && x.phone && !ph.value) ph.value = x.phone; });
      });
      w.querySelector('#bkForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var name = clean(w.querySelector('#bkName').value), phone = clean(w.querySelector('#bkPhone').value), s = svc.value, day = dt.value, tm = w.querySelector('#bkTime').value, say = w.querySelector('#bkSay');
        if (!name || !s || !day || !tm) { say.textContent = 'צריך שם, שירות, תאריך ושעה פנויה.'; return; }
        if (phone && phone.replace(/\D/g, '').length < 9) { say.textContent = 'הטלפון נראה קצר מדי. אפשר גם בלי טלפון.'; return; }
        var sv = c.services.filter(function (x) { return x.name === s; })[0], st = K.localToMs(day, tm);
        say.textContent = 'שולח...';
        send('תור לקוחה חדש: ' + day + ' ' + tm + ' | ' + clean(s) + ' | ' + name + ' | ' + phone).then(function () {
          add({ t: 'add', it: { id: '', start: K.iso(st), end: K.iso(st + sv.minutes * 60000), serviceId: sv.id || '', service: s, name: name, phone: phone, status: 'booked' } });
          w.remove(); sent('נשלח, מתעדכן. התור של ' + name + ' ב ' + day.slice(8) + '.' + day.slice(5, 7) + ' בשעה ' + tm + ' ייכנס ליומן.');
        }, function () { say.textContent = failText(); });
      });
    });
    return w;
  }
  function formMove(id) {
    var it = view().filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    var mins = Math.round((Date.parse(it.end) - Date.parse(it.start)) / 60000), t = K.ymd(Date.now());
    var inner = '<form class="bk bkForm" id="bkForm" data-m="' + mins + '" novalidate><p class="bkIntro">' + esc(it.service) + ', ' + esc(it.name) + '<br>עכשיו ב ' + K.ymd(Date.parse(it.start)).slice(8) + '.' + K.ymd(Date.parse(it.start)).slice(5, 7) + ' בשעה ' + K.hm(Date.parse(it.start)) + '</p>'
      + '<label>תאריך חדש<input id="bkDate" type="date" min="' + t + '"></label><label>שעה חדשה<select id="bkTime"></select></label>'
      + '<div class="bkSay" id="bkSay" role="status"></div><button type="submit" class="bkPrimary">להזיז</button></form>';
    return sheetOf('bkNew', 'להזיז תור', inner, function (w) {
      var dt = w.querySelector('#bkDate'), fm = w.querySelector('#bkForm');
      dt.value = firstOpenDay(mins, id); fm.setAttribute('data-m', mins); timeOptions(fm, id);
      dt.addEventListener('change', function () { timeOptions(fm, id); });
      fm.addEventListener('submit', function (e) {
        e.preventDefault();
        var day = dt.value, tm = fm.querySelector('#bkTime').value, say = fm.querySelector('#bkSay');
        if (!day || !tm) { say.textContent = 'צריך תאריך ושעה פנויה.'; return; }
        say.textContent = 'שולח...';
        send('הזזת תור לקוחה: ' + id + ' | ' + day + ' ' + tm).then(function () {
          add({ t: 'move', id: id, start: K.iso(K.localToMs(day, tm)) });
          w.remove(); sent('נשלח, מתעדכן. התור של ' + it.name + ' יעבור ל ' + day.slice(8) + '.' + day.slice(5, 7) + ' בשעה ' + tm + '.');
        }, function () { say.textContent = failText(); });
      });
    });
  }
  function doCancel(id) {
    var it = view().filter(function (x) { return x.id === id; })[0];
    askCancel = '';
    send('ביטול תור לקוחה: ' + id).then(function () { add({ t: 'cancel', id: id }); sent('נשלח, מתעדכן. התור של ' + (it ? it.name : '') + ' יבוטל והשעה תתפנה.' + (it && validPh(it.phone) ? ' הודעה ללקוחה על הביטול תחכה ב 📤 הודעות לשליחה.' : '')); }, function () { sent(failText()); });
  }
  function doHours() {
    var h = {}, c = cfgView(), line = [];
    for (var d = 0; d < 7; d++) {
      var row = body.querySelector('.bkHrs[data-d="' + d + '"]'), closed = row.querySelector('[data-k="closed"]').checked, a = row.querySelector('[data-k="from"]').value, b = row.querySelector('[data-k="to"]').value;
      if (closed) h[d] = [];
      else {
        if (!a || !b || a >= b) { sent('בשעות של יום ' + DAYS[d] + ' הפתיחה צריכה להיות לפני הסגירה.'); return; }
        h[d] = [[a, b]].concat((c.hours[d] || []).slice(1));
      }
      line.push(DAYS_SENT[d] + ' ' + (h[d].length ? h[d].map(function (r) { return r[0] + /*keep*/ ' עד ' + r[1]; }).join(', ') : /*keep*/ 'סגור'));
    }
    send('שעות פעילות: ' + line.join(' | ')).then(function () { add({ t: 'hours', hours: h }); sent('נשלח, מתעדכן. השעות החדשות יקבעו אילו שעות פנויות לתורים.'); }, function () { sent(failText()); });
  }
  function doService(f) {
    var n = clean(f.querySelector('[data-k="sn"]').value), m = parseInt(f.querySelector('[data-k="sm"]').value, 10), p = parseInt(f.querySelector('[data-k="sp"]').value, 10);
    if (!n || !(m >= 5 && m <= 600) || !(p >= 0)) { sent('לשירות צריך שם, כמה דקות הוא לוקח (5 עד 600) ומחיר.'); return; }
    send('שירות חדש: ' + n + ' | ' + m + ' | ' + p).then(function () { add({ t: 'svc', s: { id: '', name: n, minutes: m, price: p } }); sent('נשלח, מתעדכן. השירות ' + n + ' ייכנס לרשימה.'); }, function () { sent(failText()); });
  }
  // the monitor's pulse at every tap on the owner's screen, sparks when she confirms; fixed to the page, since a tap re-renders the list
  var BKC = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'], bkCalm = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function bkFx(b, e) {
    if (bkCalm || !b) return; var r = b.getBoundingClientRect(), x = e && e.clientX ? e.clientX : r.left + r.width / 2, y = e && e.clientY ? e.clientY : r.top + r.height / 2, a = b.getAttribute('data-a');
    var c = /cancel|block/.test(a) ? BKC[1] : a === 'ok' ? BKC[3] : a === 'new' ? BKC[0] : BKC[2];
    var p = document.createElement('i'); p.className = 'bkPing'; p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.setProperty('--pc', c); document.body.appendChild(p); setTimeout(function () { p.remove(); }, 750);
    if (a !== 'ok' && a !== 'cancel2') return;
    for (var i = 0; i < 12; i++) { var k = document.createElement('i'), g = (i / 12) * 6.283, d = 40 + Math.random() * 40; k.className = 'bkSpk'; k.style.left = x + 'px'; k.style.top = y + 'px'; k.style.background = BKC[i % 4];
      k.style.setProperty('--x', Math.cos(g) * d + 'px'); k.style.setProperty('--y', Math.sin(g) * d + 'px'); document.body.appendChild(k); (function (n) { setTimeout(function () { n.remove(); }, 1000); })(k); }
  }
  function openScreen() {
    if (typeof shipOpen !== 'function') return;
    var src = W.D && W.D.bookings;
    if (!src) { if (typeof toast === 'function') toast('התורים עוד נטענים, עוד רגע ואפשר לפתוח.'); return; }
    D = src;
    var w = shipOpen('bkSheet', '📅 התורים שלי', '<div id="bkBody"></div>', function (w) {
      body = w.querySelector('#bkBody');
      onAct = function (e) {
        var b = e.target.closest && e.target.closest('[data-a]'); if (!b) return;
        bkFx(b, e);
        var a = b.getAttribute('data-a'), id = b.getAttribute('data-id');
        if (a === 'new') formNew();
        else if (a === 'move') formMove(id);
        else if (a === 'cancel') { askCancel = id; render(); }
        else if (a === 'cancel2') doCancel(id);
        else if (a === 'noshow') doNoshow(id);
        else if (a === 'addclient') doAddClient(id);
        else if (a === 'ok') doConfirm(id);
        else if (a === 'limits') doLimits();
        else if (a === 'reopen') doReopen();
        else if (a === 'copy' || a === 'wa' || a === 'mklink') doLink(a);
        else if (a === 'lkmode') { lk.mode = b.getAttribute('data-m') === 'day' ? 'day' : 'all'; render(); }
        else if (a === 'gaplink') linkSheet(b.getAttribute('data-d'), b.getAttribute('data-t'));
        else if (a === 'hours') doHours();
        else if (a === 'mode') doMode(b.getAttribute('data-m'));
        else if (a === 'hlview') healthSheet(id);
        else if (a === 'psellform') formPack(ctxOf(b));
        else if (a === 'padj') doPackAdj(id, b.getAttribute('data-d') === 'up' ? 1 : -1);
        else if (a === 'pclose') { askPack = id; render(); }
        else if (a === 'pclose2') doPackClose(id);
        else if (a === 'gnewform') formGift();
        else if (a === 'guseform') formGiftUse(id);
        else if (a === 'gcopy') { var g1 = giftById(id); if (g1) copyText(giftText(g1)); }
        else if (a === 'gwa') { var g2 = giftById(id); if (g2) W.open('https://wa.me/?text=' + encodeURIComponent(giftText(g2)), '_blank', 'noopener'); }
        else if (a === 'ccard') cardSheet(ctxOf(b));
        else if (a === 'photo') formPhoto(ctxOf(b), id || '');
        else if (a === 'post') doPost(b.getAttribute('data-pair'));
        else if (a === 'more') { moreId = moreId === id ? '' : id; render(); }
        else if (a === 'block') { askBlock = id; render(); }
        else if (a === 'block2') doBlock(id);
        else if (a === 'unblock') doUnblock(b.getAttribute('data-phone'));
        else if (a === 'unsvc') { var nm = b.getAttribute('data-name'); send('מחיקת שירות: ' + clean(nm)).then(function () { add({ t: 'unsvc', name: nm }); sent('נשלח, מתעדכן. השירות ' + nm + ' יוסר מהרשימה, ותורים שכבר נקבעו נשארים.'); }, function () { sent(failText()); }); }
      };
      body.addEventListener('click', onAct);
      body.addEventListener('change', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (k === 'cxh') doCancelTerms(e.target.value); else if (k === 'hl') doHealthSvc(e.target.getAttribute('data-name'), e.target.checked); else if (k === 'lkd') { lk.d = e.target.value; render(); } else if (k === 'lks') { lk.s = e.target.value; render(); } });
      body.addEventListener('submit', function (e) { var f = e.target; if (f.getAttribute && f.getAttribute('data-a') === 'svcform') { e.preventDefault(); doService(f); } });
      // an open cancel question closes when the screen is touched elsewhere
      body.addEventListener('pointerdown', function (e) { var tg = e.target.closest && e.target.closest('[data-a]'), ta = tg && tg.getAttribute('data-a'); if ((askCancel && ta !== 'cancel2') || (askBlock && ta !== 'block2') || (askPack && ta !== 'pclose2')) { askCancel = ''; askBlock = ''; askPack = ''; render(); } });
      note = ''; render();
    });
    return w;
  }
  document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('#gBkAppts'); if (t) openScreen(); });
  W.bkOpen = openScreen;
}

// The sheets of the monitor are white cards in light and in dark, so this screen carries its own tokens (the trade's
// light colour from lib/trade-cards.js LOOK) and does not borrow the page's dark theme ones.
function css(tradeId) {
  const L = (require('./trade-cards.js').LOOK[tradeId] || [['#b0407e', '#fbe6f1', '#fff']])[0];
  return `
#bkSheet .ycard,#bkNew .ycard{--bkA:${L[0]};--bkS:${L[1]};--bkO:${L[2]};--bkInk:#16202c;--bkDim:#5f6b7f;--bkLine:#e2e8f0}
.bk{font-family:Heebo,system-ui,sans-serif;direction:rtl;text-align:right;color:var(--bkInk)}
.bk b,.bk small,.bk p{margin:0;padding:0}
.bkDemo{padding-bottom:96px}
.bkIntro{margin:4px 0 12px!important;font-size:14.5px;line-height:1.5;color:var(--bkDim)}
.bkTop{display:flex;gap:8px;margin:0 0 6px}
.bkPrimary,.bkBtn{all:unset;box-sizing:border-box;cursor:pointer;display:grid;place-items:center;min-height:48px;padding:0 18px;border-radius:14px;background:var(--bkA);color:var(--bkO);font:700 16px Heebo,system-ui,sans-serif;text-align:center}
.bkTop .bkPrimary{flex:1}
@property --bkh{syntax:"<angle>";inherits:false;initial-value:0deg}@keyframes bkSpin{to{--bkh:360deg}}
.bkPendTop,.bkPrimary,.bkMode[aria-checked=true],.bkSeg button[aria-pressed=true],.bkDay[aria-pressed=true],.bkPick[aria-pressed=true]{position:relative}
.bkPendTop::before,.bkPrimary::before,.bkMode[aria-checked=true]::before,.bkDay[aria-pressed=true]::before,.bkPick[aria-pressed=true]::before{content:"";position:absolute;inset:-3px;border-radius:inherit;padding:2.5px;pointer-events:none;background:conic-gradient(from var(--bkh),#4285F4,#EA4335,#FBBC05,#34A853,#4285F4);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:bkSpin 3.2s linear infinite}
.bkPendTop::before{animation-duration:4.5s}
.bkMode[aria-checked=true],.bkDay[aria-pressed=true],.bkPick[aria-pressed=true]{animation:bkTurn .55s cubic-bezier(.3,1.35,.4,1)}@keyframes bkTurn{from{transform:perspective(500px) rotateX(-160deg)}}
.bkPrimary,.bkBtn,.bkLink{transition:transform .15s}.bkPrimary:active,.bkBtn:active,.bkLink:active{transform:scale(.97)}
.bkPing{position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2.5px solid var(--pc);pointer-events:none;z-index:9999;animation:bkPing .7s cubic-bezier(.2,.8,.2,1) forwards}@keyframes bkPing{to{transform:scale(7);opacity:0}}
.bkSpk{position:fixed;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;pointer-events:none;z-index:9999;animation:bkSpk .9s cubic-bezier(.2,.8,.2,1) forwards}@keyframes bkSpk{to{transform:translate(var(--x),var(--y)) scale(.3);opacity:0}}
@media (prefers-reduced-motion:reduce){.bkPendTop::before,.bkPrimary::before,.bkMode::before,.bkDay::before,.bkPick::before{animation:none}.bkMode,.bkDay,.bkPick{animation:none!important}.bkPing,.bkSpk{visibility:hidden}}
.bkBtn{margin-top:10px;min-height:44px;font-size:15px;width:100%}
.bkPrimary:focus-visible,.bkBtn:focus-visible,.bkLink:focus-visible{outline:3px solid var(--bkA);outline-offset:2px}
.bkNote{margin:8px 0;padding:10px 12px;border-radius:12px;background:var(--bkS);color:var(--bkInk);font-size:14.5px;line-height:1.5}
.bkDay{display:flex;align-items:baseline;gap:8px;margin:18px 2px 2px;font-size:16px}
.bkDay b{font-weight:800}.bkDay span{font-size:13px;color:var(--bkDim)}
.bkRow{display:grid;grid-template-columns:52px 1fr auto;column-gap:10px;align-items:center;padding:8px 2px 2px;border-bottom:1px solid var(--bkLine)}
.bkT{font-weight:700;font-variant-numeric:tabular-nums;font-size:16px}
.bkM{min-width:0}.bkM b{display:block;font-size:15.5px;font-weight:600;line-height:1.3}.bkM small{display:block;font-size:13.5px;line-height:1.3;color:var(--bkDim)}
.bkPend{color:var(--bkA);font-weight:600}
.bkDot{width:11px;height:11px;border-radius:50%;flex:none;background:#8a94a6}
.sbooked{background:#e8a900}.sconfirmed{background:#2e9e4f}.sdone{background:#8a94a6}.snoshow{background:#d93a2f}
.bkAct{grid-column:2/4;display:flex;gap:2px;margin:0 -10px 0 0}
.bkLink{all:unset;box-sizing:border-box;cursor:pointer;min-height:34px;padding:0 10px;display:inline-flex;align-items:center;border-radius:10px;font:600 14px Heebo,system-ui,sans-serif;color:var(--bkA)}
.bkLink:hover{background:var(--bkS)}.bkWarn{color:#d93a2f}
.bkGap{padding:7px 2px;font-size:13.5px;color:var(--bkDim);border-bottom:1px dashed var(--bkLine)}
.bkSec{margin:26px 2px 6px;font-size:15px;font-weight:800;color:var(--bkA)}
.bkHrs{display:flex;align-items:center;gap:6px;padding:6px 2px;border-bottom:1px solid var(--bkLine)}
.bkHrs b{width:50px;flex:none;font-size:15px}.bkChk{display:inline-flex;align-items:center;gap:4px;flex:none;width:58px;font-size:13.5px;color:var(--bkDim)}
.bkHrs span{flex:none;font-size:13.5px;color:var(--bkDim)}
.bkHrs select{flex:1;min-width:0;width:auto;min-height:40px;padding:0 6px;font-size:15px}
.bkSvc{display:flex;align-items:center;gap:8px;padding:8px 2px;border-bottom:1px solid var(--bkLine)}.bkSvc .bkM{flex:1}
.bkAdd{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.bkAdd input:first-child{grid-column:1/3}.bkAdd .bkBtn{grid-column:1/3;margin-top:0}
.bk input,.bk select{box-sizing:border-box;width:100%;min-height:46px;padding:0 12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:var(--bkInk);font:400 16px Heebo,system-ui,sans-serif}
.bk input[type=checkbox]{width:20px;min-height:20px;margin:0;flex:none}
.bk input:focus-visible,.bk select:focus-visible{outline:3px solid var(--bkA);outline-offset:1px}
.bkForm{display:flex;flex-direction:column;gap:12px;padding-top:4px}
.bkForm label{display:flex;flex-direction:column;gap:5px;font-size:13.5px;font-weight:700;color:var(--bkDim)}
.bkSay{min-height:20px;font-size:14px;color:var(--bkA);font-weight:600}
.bkLinkBox{margin:10px 0 4px;padding:12px;border:1px solid var(--bkLine);border-radius:14px;background:#fff}.bkLinkBox b{display:block;font-size:15px;font-weight:800}.bkLinkBox small{display:block;color:var(--bkDim);margin:2px 0 8px;font-size:13.5px}
.bkGap{display:flex;align-items:center;justify-content:space-between;gap:8px}.bkGap .bkLink{min-height:30px;padding:0 8px;font-size:13px}
.bkSeg{display:flex;gap:6px;margin:8px 0 6px}.bkSeg button{all:unset;box-sizing:border-box;flex:1;text-align:center;cursor:pointer;min-height:40px;display:grid;place-items:center;border:1.5px solid var(--bkLine);border-radius:10px;font:600 14px Heebo,system-ui,sans-serif;color:var(--bkDim)}
.bkSeg button[aria-pressed=true]{border-color:var(--bkA);background:var(--bkS);color:var(--bkA)}
.bkPick{display:flex;gap:8px;margin:2px 0 6px}.bkPick select{flex:1;min-width:0;min-height:42px}
.bkL2{display:flex;flex-direction:column;gap:5px;font-size:13.5px;font-weight:700;color:var(--bkDim);margin:8px 0}
.bkTom{margin:10px 0 4px;padding:10px 12px;border-radius:14px;background:var(--bkS);font-size:14.5px;line-height:1.55}.bkTom b{font-size:15px;font-weight:800;margin-inline-end:8px}.bkTom span{color:var(--bkDim);font-size:13px}
.bkPendTop{margin:10px 0 6px;padding:10px 12px;border-radius:14px;border:1.5px solid var(--bkA);background:var(--bkS)}.bkPendTop>b{font-size:15px;font-weight:800;margin-inline-end:8px}.bkPendTop>span{color:var(--bkDim);font-size:13px}
.bkPTd{margin:8px 0 0;font-size:13px;font-weight:700;color:var(--bkDim)}.bkPendTop .bkRow{border-bottom-color:transparent}
.bkCxl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:700;margin:8px 0}.bkCxl select{min-height:44px;padding:0 10px;border:1.5px solid #cbd5e1;border-radius:10px;font:inherit;background:#fff;color:inherit}
.bkAct{flex-wrap:wrap}.bkMore{grid-column:2/4;display:flex;flex-wrap:wrap;gap:2px;margin:2px -10px 4px 0;padding:6px 10px;border-radius:10px;background:var(--bkS)}.bkHint{flex:0 0 100%;font-size:13.5px;color:var(--bkInk);padding:0 0 4px}
.bkChips{display:flex;flex-wrap:wrap;gap:6px;margin-top:3px!important}.bkChip{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:12px;background:var(--bkS);color:var(--bkA);font:700 12.5px Heebo,system-ui,sans-serif}.bkChipB{cursor:pointer}.bkChipB:focus-visible{outline:3px solid var(--bkA);outline-offset:2px}.bkChipR{background:#fdecea;color:#d93a2f}.bkChipN{background:#fff4d6;color:#8a6100}
.bkModes{display:flex;flex-direction:column;gap:8px;margin:6px 0}.bkMode{all:unset;box-sizing:border-box;cursor:pointer;display:block;padding:12px 14px;border:1.5px solid var(--bkLine);border-radius:14px;background:#fff}.bkMode b{display:block;font-size:15.5px;font-weight:800}.bkMode small{display:block;margin-top:2px;font-size:13.5px;line-height:1.4;color:var(--bkDim)}.bkMode[aria-checked=true]{border-color:var(--bkA);background:var(--bkS)}.bkMode:focus-visible{outline:3px solid var(--bkA);outline-offset:2px}
.bkSvc{flex-wrap:wrap}.bkHlChk{flex:0 0 100%;display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--bkDim)}
.bkHq{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;padding:9px 8px;border-bottom:1px solid var(--bkLine);border-radius:8px;font-size:14.5px}.bkHq small{flex:0 0 100%;color:var(--bkDim);font-size:13.5px}.bkHq.y{background:#fdecea;border-bottom-color:transparent}.bkHq.y b{color:#d93a2f}.bkSig{display:block;width:100%;max-width:320px;height:auto;margin:12px 0 4px;border:1px solid var(--bkLine);border-radius:12px;background:#fff}
.bkLim{display:flex;gap:8px;margin:6px 0 4px}.bkLim label{flex:1;display:flex;flex-direction:column;gap:5px;font-size:13.5px;font-weight:700;color:var(--bkDim)}
.bkUrl{margin:6px 0 8px;padding:9px 10px;border-radius:10px;background:var(--bkS);font-size:13.5px;word-break:break-all;direction:ltr;text-align:left}
.bkOpt{all:unset;box-sizing:border-box;position:relative;flex:1;text-align:center;cursor:pointer;min-height:42px;display:grid;place-items:center;border:1.5px solid var(--bkLine);border-radius:10px;font:600 14px Heebo,system-ui,sans-serif;color:var(--bkDim)}
.bkOpt[aria-pressed=true]{border-color:var(--bkA);background:var(--bkS);color:var(--bkA)}
.bkOpt[aria-pressed=true]::before,.bkSlot.on::before{content:"";position:absolute;inset:-3px;border-radius:inherit;padding:2.5px;pointer-events:none;background:conic-gradient(from var(--bkh),#4285F4,#EA4335,#FBBC05,#34A853,#4285F4);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:bkSpin 3.2s linear infinite}
.bkOpt:focus-visible,.bkPickBtn:focus-within{outline:3px solid var(--bkA);outline-offset:2px}
.bkSlots{display:grid;grid-template-columns:1fr 1fr;gap:12px}.bkSlot{position:relative;display:flex;flex-direction:column;gap:6px;padding:10px;border:1.5px dashed var(--bkLine);border-radius:14px;background:#fff}.bkSlot b{font-size:15px}
.bkPrev{min-height:96px;border-radius:10px;background:var(--bkS);display:grid;place-items:center;overflow:hidden}.bkPrev img{display:block;width:100%;height:auto}
.bkPickBtn{position:relative;overflow:hidden;cursor:pointer;display:grid;place-items:center;min-height:42px;border:1.5px solid var(--bkA);border-radius:10px;color:var(--bkA);font:700 14px Heebo,system-ui,sans-serif}
.bk .bkFile{position:absolute;width:1px;height:1px;min-height:0;padding:0;margin:0;opacity:0;overflow:hidden;clip:rect(0 0 0 0);border:0}
.bkPair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;padding:10px;border:1px solid var(--bkLine);border-radius:14px;background:#fff}.bkPair small{grid-column:1/3;color:var(--bkDim);font-size:13.5px}.bkPair .bkLink{grid-column:1/3;justify-content:flex-start}
.bkPh{position:relative;border-radius:10px;overflow:hidden;background:var(--bkS);min-height:80px}.bkPh img{display:block;width:100%;height:auto}.bkPh span{position:absolute;inset-inline-start:6px;bottom:6px;padding:1px 8px;border-radius:10px;background:rgba(255,255,255,.88);font-size:12.5px;font-weight:700}
.bkCl{margin:6px 0}.bkGiftRow .bkChips{margin-top:4px!important}.bkPack .bkAct,.bkGiftRow .bkAct{flex:0 0 100%;margin:0 -10px 0 0}
.bkAct2{display:flex;gap:8px}.bkAct2 .bkBtn{margin-top:0;flex:1}.bkBtn.alt{background:#fff;color:var(--bkA);border:1.5px solid var(--bkA)}
@media (prefers-reduced-motion:no-preference){.bkRow{animation:bkIn .25s ease both}@keyframes bkIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}}
`;
}

// the trade only says it SUPPORTS bookings; the instance must say it explicitly (bookings: true in instance.json)
const enabled = (inst) => { const t = inst && trades.get(inst.trade); return !!(t && t.bookings === true && inst.bookings === true && inst.dataPath); };
// the code only: the client data is payload.bookings in build.js (data(), sealed), never in the page source
function html(inst) {
  if (!enabled(inst)) return '';
  return '<style>' + css(inst.trade) + '</style><script>(' + page.toString() + ')(' + B.core.toString() + ');</script>';
}

module.exports = { html, data, enabled, page, css };
