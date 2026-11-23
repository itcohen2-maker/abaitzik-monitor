'use strict';
/*
  22.11.2026: the fixed lines of the screen 📅 התורים שלי (lib/bookings-ui.js) applied with no model, like the other fixed
  format handlers of listen.js (leads, alarms, sendlist). The page sends one line per tap through the monitor's own channel
  (sendText: the customer's own ntfy topic or upload service), the customer's own listener reads it and calls handle():

    תור לקוחה חדש: <YYYY-MM-DD HH:MM> | <service> | <name> | <phone>      הזזת תור לקוחה: <id> | <YYYY-MM-DD HH:MM>
    ביטול תור לקוחה: <id>      שעות פעילות: ...      שירות חדש: <name> | <minutes> | <price>      מחיקת שירות: <name>
  24.11.2026: מכירת כרטיסייה, תיקון כרטיסייה, סגירת כרטיסייה, יצירת כרטיס מתנה, שימוש בכרטיס מתנה, תמונות לפני ואחרי (lib/book-beauty.js)

  handle(inst, text, now) -> null when the text is not one of these lines for a monitor with bookings (it goes on to the
  normal path), else { ok, reply, changed }. reply is the short Hebrew answer, in the feminine when inst.gender is 'f'.
  On a refusal it says why and gives up to three nearest free times; it never books anything on its own initiative.
  changed: the page should be rebuilt (listen.js publishChat does it).
*/
const B = require('./bookings.js');
const BU = require('./bookings-ui.js');
const L = require('./book-links.js');
const BB = require('./book-beauty.js');

const LINE = /^(?:תור לקוחה חדש|הזזת תור לקוחה|ביטול תור לקוחה|שעות פעילות|שירות חדש|הסרת שירות|מחיקת שירות|סימון תור לקוחה|הוספת לקוחה|קישור ליום|אישור תור לקוחה|מגבלות קישור|פתיחת קישור|תנאי ביטול|הצהרת בריאות לשירות|אישור תורים|חסימת לקוחה|ביטול חסימה|מכירת כרטיסייה|תיקון כרטיסייה|סגירת כרטיסייה|יצירת כרטיס מתנה|שימוש בכרטיס מתנה|תמונות לפני ואחרי):/;
// The page sends "<kind>\n<line>\n\nקוד" (kind first, code last): both come off.
function normalize(text) {
  let t = String(text == null ? '' : text).replace(/\n[ \t]*קוד[^\n]*$/, '').replace(/\s*קוד\s*[0-9]{3,6}\s*$/, '').trim();
  t = t.replace(/^\s*(?:משימה\s+)?תור לקוחה\s*\n\s*/, '');
  t = t.replace(/^\s*(?:משימה\s+)?תור לקוחה\s+(?=(?:תור לקוחה חדש|הזזת תור לקוחה|ביטול תור לקוחה|שעות פעילות|שירות חדש|הסרת שירות|מחיקת שירות|סימון תור לקוחה|הוספת לקוחה|קישור ליום|אישור תור לקוחה|מגבלות קישור|פתיחת קישור|תנאי ביטול|הצהרת בריאות לשירות|אישור תורים|חסימת לקוחה|ביטול חסימה|מכירת כרטיסייה|תיקון כרטיסייה|סגירת כרטיסייה|יצירת כרטיס מתנה|שימוש בכרטיס מתנה|תמונות לפני ואחרי):)/, '');
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

// 23.11.2026: the owner's short answers of an instance with lang "ru" go through the dictionary (lib/i18n.js t(), phrase by phrase)
function handle(inst, text, now) {
  const r = handleCore(inst, text, now);
  if (inst && inst.lang === 'ru' && r && typeof r.reply === 'string') return Object.assign({}, r, { reply: require('./i18n.js').t('ru', r.reply) });
  return r;
}
function handleCore(inst, text, now) {
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
      const wasC = B.readItems(dp).find((i) => i.id === req.id);
      const r = B.cancel(dp, req.id, now);
      if (!r.ok) return refused(r, '', '');
      B.syncEvents(dp);
      // 23.11.2026: the client is told, as a prepared WhatsApp message for the owner to send (never sent from here)
      let mC = { ok: false };
      if (wasC && wasC.status !== 'cancelled') { try { mC = L.prepareCancelled(dp, r.booking, require('./bookings-remind.js').businessName(inst), now, undefined, inst.lang); } catch (e) { mC = { ok: false }; } }
      return { ok: true, changed: true, reply: 'בוטל: התור של ' + r.booking.name + ' ב' + when(r.booking.start) + '. השעה התפנתה.' + (mC.ok ? ' הכנתי ללקוחה הודעה על הביטול, והיא מחכה ב 📤 הודעות לשליחה.' : '') };
    }
    if (req.kind === 'link') {
      const cfg0 = B.loadConfig(dp), sv = req.service ? cfg0.services.find((s) => s.name === req.service || s.id === req.service) : null;
      if (req.service && !sv) return { ok: false, changed: false, reply: 'לא מצאתי את השירות הזה ברשימה.' };
      const r = L.prepare(dp, { d: req.d, s: sv && sv.id, t: req.t, to: req.to, lang: inst.lang }, now);
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
      const was = B.readItems(dp).find((i) => i.id === req.id);
      const r = B.setStatus(dp, req.id, 'confirmed', now);
      if (!r.ok) return refused(r, '', '');
      B.syncEvents(dp);
      const base = 'אישרתי: התור של ' + r.booking.name + ' ב' + when(r.booking.start) + '.';
      // 23.11.2026: the first confirmation of a booking with a mobile phone prepares the client's confirmation message (terms and her own link), for the owner to send
      if (was && was.status !== 'confirmed') {
        let m = { ok: false };
        try { m = L.prepareConfirm(dp, r.booking, require('./bookings-remind.js').businessName(inst), now, undefined, inst.lang); } catch (e) { m = { ok: false }; }
        if (m.ok) return { ok: true, changed: true, reply: base + ' הכנתי ללקוחה הודעת אישור עם תנאי הביטול, והיא מחכה ב 📤 הודעות לשליחה.' };
      }
      return { ok: true, changed: true, reply: base };
    }
    if (req.kind === 'cancelterms') {
      if (B.CANCEL_HOURS.indexOf(req.hours) < 0) return { ok: false, changed: false, reply: 'אפשר לבחור בלי הגבלה, או 2, 4, 12, 24 או 48 שעות.' };
      const c = B.loadConfig(dp); c.cancelHours = req.hours; B.saveConfig(dp, c);
      return { ok: true, changed: true, reply: req.hours > 0 ? 'עדכנתי: ביטול או שינוי עד ' + req.hours + ' שעות לפני התור.' : 'עדכנתי: אפשר לבטל או לשנות בכל זמן.' };
    }
    if (req.kind === 'healthsvc') {
      const cfgH = B.loadConfig(dp), svH = cfgH.services.find((s) => s.name === req.name || s.id === req.name);
      if (!svH) return { ok: false, changed: false, reply: 'לא מצאתי שירות בשם ' + req.name + '.' };
      svH.health = req.on; B.saveConfig(dp, cfgH);
      return { ok: true, changed: true, reply: req.on ? 'עדכנתי: השירות ' + svH.name + ' ידרוש הצהרת בריאות חתומה מהלקוחה לפני קביעת תור בקישור.' : 'עדכנתי: השירות ' + svH.name + ' כבר לא ידרוש הצהרת בריאות.' };
    }
    if (req.kind === 'approval') {
      const cA = B.loadConfig(dp);
      cA.approval = req.mode; B.saveConfig(dp, cA);
      return { ok: true, changed: true, reply: req.mode === 'auto' ? 'עדכנתי: תור שנקבע מהקישור מאושר מיד.' : 'עדכנתי: תורים מהקישור מחכים לאישור שלך.' };
    }
    if (req.kind === 'block' || req.kind === 'unblock') {
      const ph = B.normPhone(req.ref), byId = B.readItems(dp).find((i) => i.id === req.ref);
      const phone = byId ? B.normPhone(byId.phone) : ph;
      if (!/^9725\d{8}$/.test(phone)) return { ok: false, changed: false, reply: byId ? 'לתור הזה אין טלפון נייד תקין, אז אי אפשר לחסום.' : 'לא מצאתי את הלקוחה.' };
      const cB = B.loadConfig(dp), has = cB.blocked.indexOf(phone) >= 0;
      if (req.kind === 'block') {
        if (!has) { if (cB.blocked.length >= 500) return { ok: false, changed: false, reply: 'אפשר לחסום עד 500 מספרים.' }; cB.blocked.push(phone); B.saveConfig(dp, cB); }
        return { ok: true, changed: true, reply: 'חסמתי מהקישור: ' + (byId ? byId.name : phone) + '. היא לא תוכל לקבוע תור חדש דרך הקישור, ותורים שכבר נקבעו נשארים. תורים שאת קובעת בעצמך לא מושפעים.' };
      }
      if (!has) return { ok: false, changed: false, reply: 'המספר הזה לא ברשימת החסומות.' };
      cB.blocked = cB.blocked.filter((p) => p !== phone); B.saveConfig(dp, cB);
      return { ok: true, changed: true, reply: 'ביטלתי את החסימה. היא יכולה לקבוע תור דרך הקישור.' };
    }
    // 24.11.2026: punch cards, gift cards and before and after photos (lib/book-beauty.js). The owner's own lines; nothing is sent from here.
    if (req.kind === 'packsell' || req.kind === 'packadj' || req.kind === 'packclose') {
      const WHY = { client: 'לא מצאתי את הלקוחה הזאת.', service: 'לא מצאתי את השירות הזה ברשימה.', count: 'מספר הטיפולים בכרטיסייה צריך להיות בין 1 ל 100.', price: 'המחיר לא תקין.', expires: 'תאריך התוקף צריך להיות בעתיד.',
        full: 'אפשר עד 300 כרטיסיות.', notfound: 'הכרטיסייה לא נמצאה.', closed: 'הכרטיסייה כבר סגורה.', zero: 'בכרטיסייה הזאת לא נשארו טיפולים.' };
      const r = req.kind === 'packsell' ? BB.sellPack(dp, req, now) : req.kind === 'packadj' ? BB.adjustPack(dp, req.id, req.delta, now, inst.lang) : BB.closePack(dp, req.id, now);
      if (!r.ok) return { ok: false, changed: false, reply: WHY[r.error] || 'לא הצלחתי לבצע.' };
      const sw = req.kind === 'packsell' ? BB.sweep(dp, now, inst.lang) : { prepared: req.kind === 'packadj' && r.prepared ? r.prepared : 0 };
      const v = BB.packsView(dp, now).find((x) => x.id === r.pack.id) || { left: 0, total: r.pack.total, name: r.pack.name };
      const more = sw && sw.prepared ? ' נשאר טיפול אחד, והכנתי ללקוחה הודעה על כך. היא מחכה ב 📤 הודעות לשליחה.' : '';
      if (req.kind === 'packclose') return { ok: true, changed: true, reply: 'סגרתי את הכרטיסייה של ' + v.name + '.' };
      return { ok: true, changed: true, reply: (req.kind === 'packsell' ? 'רשמתי כרטיסייה ל' + v.name + ': ' + v.total + ' טיפולים. ' : 'עדכנתי: ל' + v.name + ' ') + 'נשארו ' + v.left + ' מתוך ' + v.total + '.' + more };
    }
    if (req.kind === 'giftnew') {
      const r = BB.createGift(dp, req, now, inst.lang);
      if (!r.ok) return { ok: false, changed: false, reply: { nolink: 'עוד אין קישור לקביעת תור. אפשר ליצור אותו במסך 📅 התורים שלי.', amount: 'הסכום צריך להיות בין 1 ל 100000 ₪.', service: 'לא מצאתי את השירות הזה ברשימה.',
        recipient: 'חסר שם למי שמקבלת את המתנה.', expires: 'תאריך התוקף צריך להיות בעתיד.', full: 'אפשר עד 500 כרטיסי מתנה.', code: 'לא הצלחתי ליצור קוד, נסו שוב.' }[r.error] || 'לא הצלחתי לבצע.' };
      return { ok: true, changed: true, reply: 'יצרתי כרטיס מתנה ל' + r.gift.recipient + ', קוד ' + r.gift.code + '.' + (r.prepared ? ' הכנתי לקונה הודעה עם הקישור, והיא מחכה ב 📤 הודעות לשליחה.' : ' הקישור מחכה במסך כרטיסי המתנה, ואפשר לשלוח אותו בוואטסאפ.') };
    }
    if (req.kind === 'giftuse') {
      const r = BB.useGift(dp, req.id, req.amount, now);
      if (!r.ok) return { ok: false, changed: false, reply: { notfound: 'כרטיס המתנה לא נמצא.', used: 'כרטיס המתנה כבר נוצל.', toomuch: 'הסכום גדול ממה שנשאר בכרטיס.' }[r.error] || 'לא הצלחתי לבצע.' };
      return { ok: true, changed: true, reply: r.left > 0 && r.gift.kind === 'amount' ? 'סימנתי שימוש בכרטיס המתנה של ' + r.gift.recipient + '. נשארו ' + r.left + ' ₪.' : 'סימנתי את כרטיס המתנה של ' + r.gift.recipient + ' כמנוצל.' };
    }
    if (req.kind === 'photos') {
      const r = BB.finalizePhotos(dp, req, now);
      if (!r.ok) return { ok: false, changed: false, reply: { missing: 'התמונות עוד לא הגיעו. ' + (fem ? 'נסי' : 'נסה') + ' לשלוח שוב בעוד רגע.', booking: 'התור לא נמצא.', who: 'לא מצאתי את הלקוחה.', unsafe: 'לא הצלחתי לשמור את התמונות.' }[r.error] || 'לא הצלחתי לבצע.' };
      return { ok: true, changed: true, reply: 'שמרתי את התמונות לפני ואחרי של ' + (r.pair.name || 'הלקוחה') + '. הן נשמרות אצלך בלבד, ולא מופיעות בדף הקביעה.' };
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
      // 24.11.2026: a done visit uses one unit of the client's punch card; a no show gives it back
      let swM = { prepared: 0 };
      try { swM = BB.sweep(dp, now, inst.lang); } catch (e) { swM = { prepared: 0 }; }
      return { ok: true, changed: true, reply: 'סומן: התור של ' + r.booking.name + ' ב' + when(r.booking.start) + (req.status === 'noshow' ? ' כתור שלא הגיעו אליו.' : ' כתור שהסתיים.') + (swM && swM.prepared ? ' נשאר טיפול אחד בכרטיסייה, והכנתי ללקוחה הודעה ב 📤 הודעות לשליחה.' : '') };
    }
    const cfg = B.loadConfig(dp);
    if (req.kind === 'hours') { cfg.hours = req.hours; B.saveConfig(dp, cfg); return { ok: true, changed: true, reply: 'עדכנתי את שעות הפעילות.' }; }
    if (req.kind === 'service') {
      if (!(req.minutes >= 5 && req.minutes <= 600) || !req.name) return { ok: false, changed: false, reply: 'לשירות צריך שם ו 5 עד 600 דקות.' };
      const old = cfg.services.find((s) => s.name === req.name); // re-adding a service keeps its health declaration setting
      cfg.services = cfg.services.filter((s) => s.name !== req.name).concat([{ name: req.name, minutes: req.minutes, price: req.price, health: !!(old && old.health) }]);
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
