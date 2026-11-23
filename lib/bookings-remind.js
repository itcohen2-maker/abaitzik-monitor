'use strict';
/*
  22.11.2026: the daily reminders to a business's clients, and the quiet housekeeping of the diary, from the monitor's own
  minute tick (worker.js bookingsTick, code only, no model, no quota).

  NOTHING IS SENT TO A CLIENT FROM HERE. The product never messages third parties by itself (lib/approvals.js BLOCKED_KINDS
  'whatsapp-other'). At the hour set in data/bookings/config.json remindAt (default 18:00, Israel time) this builds ONE send
  list "תזכורות לתורים של מחר" (lib/sendlist.js, shown in 📤 הודעות לשליחה) with a prepared wa.me message per booking of
  tomorrow that is still "booked" and has not been reminded; the owner taps each and sends it from her own WhatsApp.
  Each booking gets remindedAt, so a second run builds nothing new; a booking added later in the evening gets its own row
  in the same list. A past day never gets a list: only tomorrow, counted from now.

  Also here: a booking whose end time has passed becomes done (unless cancelled or marked a no show), and a booking made by
  the public page (it leaves data/bookings/dirty) asks for a rebuild so the diary and the day ring show it.
  tick(inst, now, hooks) -> { done, dirty, reminded, listId, rebuild } ; hooks = { push(title, body), wa(text) } for the one
  line to the owner. rebuild: true when the page should be rebuilt (the caller runs push.js).
*/
const fs = require('fs');
const path = require('path');
const B = require('./bookings.js');
const BP = require('./book-page.js');
const sendlist = require('./sendlist.js');
const bh = require('./biz-home.js');
const T = require('./i18n-texts.js'); // 23.11.2026: Russian texts for an instance with lang "ru"

const C = B.core();
const TITLE = 'תזכורות לתורים של מחר';

function businessName(inst) {
  let n = inst.biz && typeof inst.biz === 'object' ? String(inst.biz.name || '') : '';
  if (!n) try { n = (bh.bizInfo(path.join(__dirname, '..'), inst.dataPath) || {}).name || ''; } catch (e) { /* none */ }
  return String(n || inst.pageTitle || inst.owner || 'העסק').replace(/^המוניטור של /, '').replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
}
// "היי דנה, מזכירה שיש לך מחר ב 10:00 עיצוב גבות אצל הקליניקה של מור. לאישור או לשינוי: <link>" in the voice of the owner
function reminderText(it, biz, fem, link, lang) {
  if (lang === 'ru') return T.reminderText({ name: it.name, time: C.hm(Date.parse(it.start)), service: it.service, biz, link });
  const first = String(it.name || '').trim().split(/\s+/)[0] || '';
  return 'היי ' + first + ', ' + (fem ? 'מזכירה' : 'מזכיר') + ' שיש לך מחר ב ' + C.hm(Date.parse(it.start)) + ' ' + it.service + ' אצל ' + biz + '. '
    + (link ? 'לאישור או לשינוי: ' + link : 'לשינוי או ביטול, כתבו לי.');
}
function listFile(dp, day) { return path.join(sendlist.dirOf(dp), day.replace(/-/g, '') + '-bkremind.json'); }
function writeList(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { encoding: 'utf8', mode: 0o664 }); fs.renameSync(f + '.tmp', f); }

// builds (or extends) tomorrow's list inside the write lock; returns { reminded, listId }
function build(inst, now) {
  const dp = inst.dataPath, cfg = B.loadConfig(dp), fem = inst.gender === 'f';
  if (C.hm(now) < cfg.remindAt) return { reminded: 0, listId: '' };
  const tomorrow = C.addDays(C.ymd(now), 1);
  const biz = businessName(inst);
  return B.withLock(dp, () => {
    const due = B.readItems(dp).filter((i) => C.ymd(Date.parse(i.start)) === tomorrow && i.status === 'booked' && !i.remindedAt && Date.parse(i.start) > now
      && /^9725\d{8}$/.test(String(i.phone || '')));
    if (!due.length) return { reminded: 0, listId: '' };
    const items = due.map((i) => ({ name: String(i.name).replace(/[-‐-―]/g, ' '), phone: i.phone,
      text: reminderText(i, biz, fem, cfg.linkToken && i.tok ? BP.BASE + '/b/a/' + cfg.linkToken + '.' + i.tok : '', inst.lang) }));
    const f = listFile(dp, tomorrow);
    let list = null; try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { list = null; }
    if (!list) list = { id: path.basename(f, '.json'), at: new Date(now).toISOString(), title: inst.lang === 'ru' ? T.REMIND_TITLE : TITLE, bk: tomorrow, items: [] };
    list.items = list.items.concat(items);
    writeList(f, list);
    // marked only after the list is on disk: a crash in between repeats a row at worst, never loses one
    due.forEach((i) => B.putItem(dp, Object.assign({}, i, { remindedAt: new Date(now).toISOString() })));
    return { reminded: due.length, listId: list.id, items: due.map((i) => ({ start: i.start, name: i.name, service: i.service })) };
  });
}

// one line of the schedule: time, FIRST name, service
const line = (i) => C.hm(Date.parse(i.start)) + ' ' + String(i.name || '').trim().split(/\s+/)[0] + ', ' + i.service;
/*
  The owner's evening summary, once a day at remindAt, when tomorrow has bookings. PRIVACY: the chat record in the tenant's own
  chat folder carries the schedule (time, first name, service); what goes over WhatsApp through the platform to Meta (waText) and
  the phone push are the generic line only, never a name. A booking added after the summary is announced in the same way.
  hooks.owner(text, waText) writes the record, hooks.push(title, body) is the phone push.
*/
function summarize(inst, now, hooks, r) {
  const dp = inst.dataPath, cfg = B.loadConfig(dp);
  if (C.hm(now) < cfg.remindAt) return '';
  const tomorrow = C.addDays(C.ymd(now), 1);
  const tom = B.readItems(dp).filter((i) => C.ymd(Date.parse(i.start)) === tomorrow && (i.status === 'booked' || i.status === 'confirmed') && Date.parse(i.start) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (!tom.length) return '';
  const f = path.join(dp, 'bookings', 'summary.json');
  let st = null; try { st = B.realDir(path.join(dp, 'bookings')) && fs.lstatSync(f).isFile() ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; } catch (e) { st = null; }
  let text, waText, kind;
  if (!st || st.day !== tomorrow) {
    const n = tom.length;
    text = (n === 1 ? 'מחר תור אחד:' : 'מחר ' + n + ' תורים:') + '\n' + tom.map(line).join('\n')
      + (r && r.reminded ? '\nהתזכורות ללקוחות (' + r.reminded + ') מחכות ב 📤 הודעות לשליחה, לחיצה על כל אחת והיא נשלחת.' : '');
    waText = n === 1 ? 'מחר תור אחד. הפירוט והתזכורת ללקוח מחכים במוניטור.' : 'מחר ' + n + ' תורים. הפירוט והתזכורות ללקוחות מחכים במוניטור.';
    kind = 'summary';
    if (inst.lang === 'ru') { text = T.summaryText(n, tom.map(line), r && r.reminded); waText = T.summaryWa(n); }
    B.writeAtomic(f, { day: tomorrow, n });
  } else if (r && r.reminded && r.items && r.items.length) {
    text = 'נוסף למחר: ' + r.items.map(line).join('; ') + '. ' + (r.items.length === 1 ? 'התזכורת מוכנה' : 'התזכורות מוכנות') + ' ב 📤 הודעות לשליחה.';
    waText = 'נוסף תור למחר. הפירוט והתזכורת מחכים במוניטור.';
    kind = 'late';
    if (inst.lang === 'ru') { text = T.lateText(r.items.map(line), r.items.length); waText = T.LATE_WA; }
  } else return '';
  try { if (hooks.push) hooks.push(kind === 'summary' ? '📅 ' + waText.split('.')[0] : (inst.lang === 'ru' ? T.LATE_PUSH : '📅 נוסף תור למחר'), waText); } catch (e) { /* the record is there anyway */ }
  try { if (hooks.owner) hooks.owner(text, waText); } catch (e) { /* idem */ }
  return kind;
}

function tick(inst, now, hooks) {
  now = now == null ? Date.now() : now;
  hooks = hooks || {};
  const dp = inst.dataPath, out = { done: 0, dirty: false, reminded: 0, listId: '', rebuild: false };
  if (!fs.existsSync(path.join(dp, 'bookings'))) return out;
  const d = B.autoDone(dp, now); out.done = typeof d === 'number' ? d : 0;
  // 24.11.2026: the visits that just became done use up the units of the clients' punch cards (lib/book-beauty.js); one unit left prepares a message
  try { const sw = require('./book-beauty.js').sweep(dp, now, inst.lang); if (sw && sw.changed) out.dirty = true; } catch (e) { /* the next tick */ }
  const dirty = path.join(dp, 'bookings', 'dirty');
  if (fs.existsSync(dirty)) { out.dirty = true; try { fs.unlinkSync(dirty); } catch (e) { /* gone */ } }
  let r = { reminded: 0, listId: '', items: [] };
  try { r = build(inst, now); } catch (e) { r = { reminded: 0, listId: '', items: [] }; }
  out.reminded = r.reminded; out.listId = r.listId;
  try { out.summary = summarize(inst, now, hooks, r); } catch (e) { out.summary = ''; }
  if (out.dirty || out.reminded) { try { B.syncEvents(dp); } catch (e) { /* the next tick */ } out.rebuild = true; }
  return out;
}

module.exports = { tick, build, summarize, reminderText, businessName, TITLE };
