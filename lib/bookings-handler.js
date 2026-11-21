'use strict';
/*
  22.11.2026: the fixed lines of the screen 📅 התורים שלי (lib/bookings-ui.js) applied with no model, like the other fixed
  format handlers of listen.js (leads, alarms, sendlist). The page sends one line per tap through the monitor's own channel
  (sendText: the customer's own ntfy topic or upload service), the customer's own listener reads it and calls handle():

    תור לקוחה חדש: <YYYY-MM-DD HH:MM> | <service> | <name> | <phone>      הזזת תור לקוחה: <id> | <YYYY-MM-DD HH:MM>
    ביטול תור לקוחה: <id>      שעות פעילות: ...      שירות חדש: <name> | <minutes> | <price>      מחיקת שירות: <name>

  handle(inst, text, now) -> null when the text is not one of these lines for a monitor with bookings (it goes on to the
  normal path), else { ok, reply, changed }. reply is the short Hebrew answer, in the feminine when inst.gender is 'f'.
  On a refusal it says why and gives up to three nearest free times; it never books anything on its own initiative.
  changed: the page should be rebuilt (listen.js publishChat does it).
*/
const B = require('./bookings.js');
const BU = require('./bookings-ui.js');
const L = require('./book-links.js');

const LINE = /^(?:תור לקוחה חדש|הזזת תור לקוחה|ביטול תור לקוחה|שעות פעילות|שירות חדש|הסרת שירות|מחיקת שירות|סימון תור לקוחה|הוספת לקוחה|קישור ליום|אישור תור לקוחה|מגבלות קישור|פתיחת קישור):/;
// The page sends "<kind>\n<line>\n\nקוד" (kind first, code last): both come off.
function normalize(text) {
  let t = String(text == null ? '' : text).replace(/\n[ \t]*קוד[^\n]*$/, '').replace(/\s*קוד\s*[0-9]{3,6}\s*$/, '').trim();
  t = t.replace(/^\s*(?:משימה\s+)?תור לקוחה\s*\n\s*/, '');
  t = t.replace(/^\s*(?:משימה\s+)?תור לקוחה\s+(?=(?:תור לקוחה חדש|הזזת תור לקוחה|ביטול תור לקוחה|שעות פעילות|שירות חדש|הסרת שירות|מחיקת שירות|סימון תור לקוחה|הוספת לקוחה|קישור ליום|אישור תור לקוחה|מגבלות קישור|פתיחת קישור):)/, '');
  return t.trim();
}
const C = B.core();
function dayName(ms) { return B.DAY_NAMES[C.dow(C.ymd(ms))]; }
function when(iso) {
  const ms = Date.parse(iso), d = C.ymd(ms);
  return 'יום ' + dayName(ms) + ' ' + d.slice(8) + '.' + d.slice(5, 7) + ' בשעה ' + C.hm(ms);
}
function slotList(slots, wanted) {
  const same = C.ymd(Date.parse(wanted));
  return slots.map((s) => { const ms = Date.parse(s.start), d = C.ymd(ms); return (d === same ? '' : d.slice(8) + '.' + d.slice(5, 7) + ' ') + s.time; }).join(', ');
}
// why a request was refused, for the owner
function reason(r, fem) {
  if (r.error === 'conflict') { const w = (r.with || [])[0]; return 'השעה תפוסה' + (w ? ': ' + w.service + ' ל' + w.name + ' ב ' + C.hm(Date.parse(w.start)) : '') + '.'; }
  if (r.error === 'closed') return 'השעה הזאת מחוץ לשעות הפעילות, או ביום סגור.';
  if (r.error === 'past') return 'השעה הזאת כבר עברה.';
  const why = { start: 'לא הבנתי את התאריך והשעה.', service: 'לא מצאתי את השירות הזה ברשימה.', name: 'חסר שם.', notfound: 'התור לא נמצא, אולי כבר בוטל.', cancelled: 'התור כבר בוטל.', busy: 'היומן עסוק ברגע זה, ' + (fem ? 'נסי' : 'נסה') + ' שוב.' }[r.why];
  return why || 'לא הצלחתי לבצע.';
}

function handle(inst, text, now) {
  if (!inst || !inst.dataPath || !BU.enabled(inst)) return null;
  const line = normalize(text);
  if (!LINE.test(line)) return null;
  const dp = inst.dataPath, fem = inst.gender === 'f';
  now = now == null ? Date.now() : now;
  const req = B.parseRequest(line);
  if (!req) return { ok: false, reply: 'לא הצלחתי לקרוא את השורה מהמסך. ' + (fem ? 'נסי' : 'נסה') + ' שוב.', changed: false };
  const refused = (r, wanted, svc) => {
    const near = wanted ? B.nearestSlots(dp, wanted, svc, 3, now) : [];
    return { ok: false, changed: false, reply: reason(r, fem) + (near.length ? ' שעות פנויות קרובות: ' + slotList(near, wanted) + '.' : '') };
  };
  try {
    if (req.kind === 'add') {
      const r = B.add(dp, { start: req.start, service: req.service, name: req.name, phone: req.phone, src: 'owner' }, now);
      if (!r.ok) return refused(r, r.error === 'bad' ? '' : req.start, req.service);
      B.syncEvents(dp);
      return { ok: true, changed: true, reply: 'נקבע: ' + r.booking.service + ' ל' + r.booking.name + ' ב' + when(r.booking.start) + '.' };
    }
    if (req.kind === 'move') {
      const old = B.readItems(dp).find((i) => i.id === req.id);
      const r = B.move(dp, req.id, req.start, now);
      if (!r.ok) return refused(r, r.error === 'bad' ? '' : req.start, old && (old.serviceId || old.service));
      B.syncEvents(dp);
      return { ok: true, changed: true, reply: 'הוזז: התור של ' + r.booking.name + ' עבר ל' + when(r.booking.start) + '.' };
    }
    if (req.kind === 'cancel') {
      const r = B.cancel(dp, req.id, now);
      if (!r.ok) return refused(r, '', '');
      B.syncEvents(dp);
      return { ok: true, changed: true, reply: 'בוטל: התור של ' + r.booking.name + ' ב' + when(r.booking.start) + '. השעה התפנתה.' };
    }
    if (req.kind === 'link') {
      const cfg0 = B.loadConfig(dp), sv = req.service ? cfg0.services.find((s) => s.name === req.service || s.id === req.service) : null;
      if (req.service && !sv) return { ok: false, changed: false, reply: 'לא מצאתי את השירות הזה ברשימה.' };
      const r = L.prepare(dp, { d: req.d, s: sv && sv.id, t: req.t, to: req.to }, now);
      if (!r.ok) {
        const why = { nolink: 'עוד אין קישור לקביעת תור. אפשר ליצור אותו במסך 📅 התורים שלי.', params: 'צריך יום בשבועיים הקרובים שהעסק פתוח בו, או שירות מהרשימה.', none: 'לא מצאתי לקוחה בשם ' + req.to + ' עם טלפון.',
          many: 'יש כמה לקוחות בשם ' + req.to + ', כתבו את השם המלא.', phone: 'הטלפון של ' + req.to + ' לא תקין.', unsafe: 'לא הצלחתי לכתוב את ההודעה.' }[r.error];
        return { ok: false, changed: false, reply: why || 'לא הצלחתי להכין את ההודעה.' };
      }
      return { ok: true, changed: true, reply: 'הכנתי הודעה ל' + r.name + ' עם הקישור. היא מחכה ב 📤 הודעות לשליחה.' };
    }
    if (req.kind === 'limits') {
      if (!(req.perHour >= 1 && req.perHour <= 200 && req.perDay >= 1 && req.perDay <= 1000)) return { ok: false, changed: false, reply: 'המגבלה צריכה להיות בין 1 ל 200 בשעה ובין 1 ל 1000 ביום.' };
      const c = B.loadConfig(dp); c.limits.perHour = req.perHour; c.limits.perDay = req.perDay; B.saveConfig(dp, c);
      return { ok: true, changed: true, reply: 'עדכנתי: עד ' + req.perHour + ' תורים בשעה ועד ' + req.perDay + ' ביום דרך הקישור.' };
    }
    if (req.kind === 'reopen') {
      const c = B.loadConfig(dp); c.reopenedAt = new Date(now).toISOString(); B.saveConfig(dp, c);
      return { ok: true, changed: true, reply: 'פתחתי את הקישור שוב. הספירה של השעה האחרונה התחילה מחדש.' };
    }
    if (req.kind === 'confirm') {
      const r = B.setStatus(dp, req.id, 'confirmed', now);
      if (!r.ok) return refused(r, '', '');
      B.syncEvents(dp);
      return { ok: true, changed: true, reply: 'אישרתי: התור של ' + r.booking.name + ' ב' + when(r.booking.start) + '.' };
    }
    if (req.kind === 'client') {
      const r = B.promoteClient(dp, req.id);
      if (!r.ok) return refused(r, '', '');
      B.syncEvents(dp);
      return { ok: true, changed: true, reply: 'הוספתי ללקוחות: ' + r.booking.name + '.' };
    }
    if (req.kind === 'mark') {
      const r = B.setStatus(dp, req.id, req.status, now);
      if (!r.ok) return refused(r, '', '');
      B.syncEvents(dp);
      return { ok: true, changed: true, reply: 'סומן: התור של ' + r.booking.name + ' ב' + when(r.booking.start) + (req.status === 'noshow' ? ' כתור שלא הגיעו אליו.' : ' כתור שהסתיים.') };
    }
    const cfg = B.loadConfig(dp);
    if (req.kind === 'hours') { cfg.hours = req.hours; B.saveConfig(dp, cfg); return { ok: true, changed: true, reply: 'עדכנתי את שעות הפעילות.' }; }
    if (req.kind === 'service') {
      if (!(req.minutes >= 5 && req.minutes <= 600) || !req.name) return { ok: false, changed: false, reply: 'לשירות צריך שם ו 5 עד 600 דקות.' };
      cfg.services = cfg.services.filter((s) => s.name !== req.name).concat([{ name: req.name, minutes: req.minutes, price: req.price }]);
      B.saveConfig(dp, cfg);
      return { ok: true, changed: true, reply: 'הוספתי את השירות ' + req.name + ': ' + req.minutes + ' דקות, ' + req.price + ' ₪.' };
    }
    if (req.kind === 'unservice') {
      const had = cfg.services.length;
      cfg.services = cfg.services.filter((s) => s.name !== req.name && s.id !== req.name);
      if (cfg.services.length === had) return { ok: false, changed: false, reply: 'לא מצאתי שירות בשם ' + req.name + '.' };
      B.saveConfig(dp, cfg);
      return { ok: true, changed: true, reply: 'הסרתי את השירות ' + req.name + '. תורים שכבר נקבעו נשארים.' };
    }
  } catch (e) { return { ok: false, changed: false, reply: 'לא הצלחתי לבצע: ' + String(e && e.message || e).slice(0, 80) }; }
  return null;
}

// Is this one of the screen's lines for a monitor with bookings? (cheap, no work done)
function isLine(inst, text) { return !!(inst && inst.dataPath && BU.enabled(inst) && LINE.test(normalize(text))); }
// The listener's way: the work runs under the ASYNC lock (timers while another process holds it), so the listener's event loop is
// never frozen by a sync wait. Resolves to { ok, reply, changed }, or null when the text is not one of the lines.
async function handleAsync(inst, text, now) {
  if (!isLine(inst, text)) return null;
  try { return await B.withLockAsync(inst.dataPath, () => handle(inst, text, now)); }
  catch (e) { return { ok: false, changed: false, reply: e && e.message === 'busy' ? 'היומן עסוק ברגע זה, נסו שוב בעוד רגע.' : 'לא הצלחתי לבצע.' }; }
}

module.exports = { handle, handleAsync, isLine, normalize, LINE };
