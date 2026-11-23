'use strict';
// 21.11.2026: the trade demo of a cosmetician (lib/trades.js beauty). The monitor is her appointments diary (lib/bookings.js):
// hours, services and prices, today and the coming days, and who did not come back. Invented data only.
const B = require('../bookings.js');
const { ilDay } = require('../demo-data.js');
const BP = require('../book-page.js');
const R = require('../bookings-remind.js');
const path = require('path');
const fs = require('fs');

// 22.11.2026: the demo is open all seven days, 09:00 to 18:00, so that "today" always has its day on show whatever day a visitor
// comes on (the real default for a customer stays Sunday to Thursday, Friday short, Saturday closed: lib/bookings.js DEFAULT_CONFIG)
const HOURS = { 0: [['09:00', '18:00']], 1: [['09:00', '18:00']], 2: [['09:00', '18:00']], 3: [['09:00', '18:00']], 4: [['09:00', '18:00']], 5: [['09:00', '18:00']], 6: [['09:00', '18:00']] };
const SERVICES = [
  { id: 'brows', name: 'עיצוב גבות', minutes: 20, price: 80 },
  { id: 'face', name: 'טיפול פנים', minutes: 60, price: 320, health: true },
  { id: 'anti', name: 'אנטי אייג׳ינג', minutes: 75, price: 450, health: true },
  { id: 'peel', name: 'פילינג', minutes: 60, price: 380, health: true },
];
const mins = (name) => SERVICES.find((s) => s.name === name).minutes;

// The coming days: [day offset, hh:mm, service, client id, status, source]. The ring, the day list and the
// morning report all come from here (events.json is written from the bookings, not by hand).
const AHEAD = [
  [0, '09:00', 'עיצוב גבות', 'c-dana', 'confirmed', 'owner'],
  [0, '11:00', 'טיפול פנים', 'c-hadas', 'confirmed', 'owner'],
  [0, '15:30', 'פילינג', 'c-michal', 'booked', 'link'],
  [1, '10:00', 'אנטי אייג׳ינג', 'c-lior', 'booked', 'link'],
  [1, '11:30', 'עיצוב גבות', 'c-roni', 'confirmed', 'link'],
  [1, '14:00', 'עיצוב גבות', 'c-dana', 'booked', 'owner'],
  [2, '09:30', 'טיפול פנים', 'c-roni', 'confirmed', 'owner'],
  [3, '12:00', 'פילינג', 'c-lior', 'confirmed', 'owner'],
  [5, '10:00', 'עיצוב גבות', 'c-dana', 'confirmed', 'owner'],
];
// Past visits (days ago), done. Shiran 9 weeks, Noa 8 weeks and a day, Yael 10 weeks: they are the ones who did not come back.
const BEHIND = [
  [63, '10:00', 'פילינג', 'c-shiran'], [100, '10:00', 'פילינג', 'c-shiran'],
  [57, '12:00', 'טיפול פנים', 'c-noa'], [86, '12:00', 'טיפול פנים', 'c-noa'],
  [70, '14:00', 'אנטי אייג׳ינג', 'c-yael'],
  [28, '11:00', 'טיפול פנים', 'c-hadas'], [56, '11:00', 'טיפול פנים', 'c-hadas'],
  [21, '09:00', 'עיצוב גבות', 'c-dana'], [42, '09:00', 'עיצוב גבות', 'c-dana'],
];

const CLIENTS = [
  { id: 'c-hadas', name: 'הדס לוי', status: 'קבועה', terms: 'כל 4 שבועות', note: 'טיפול פנים. עור רגיש, בלי חומצות חזקות.', phone: '972500000101' },
  { id: 'c-shiran', name: 'שירן אוחיון', status: 'לא חזרה', terms: 'הייתה כל 5 שבועות', note: 'לא הייתה 9 שבועות. אהבה את הפילינג העדין.', phone: '972500000102' },
  { id: 'c-noa', name: 'נועה ברק', status: 'לא חזרה', terms: 'הייתה כל חודש', note: 'לא הייתה 8 שבועות. שאלה בזמנו על סדרת טיפולים.', phone: '972500000103' },
  { id: 'c-yael', name: 'יעל שגיא', status: 'לא חזרה', terms: '', note: 'לא הייתה 10 שבועות. באה לפני אירועים.', phone: '972500000104' },
  { id: 'c-dana', name: 'דנה פרץ', status: 'קבועה', terms: 'כל 3 שבועות', note: 'עיצוב גבות. משלמת בסוף החודש.', phone: '972500000105' },
  { id: 'c-michal', name: 'מיכל רון', status: 'חדשה', terms: '', note: 'הגיעה מאינסטגרם. פילינג ראשון היום.', phone: '972500000106' },
  { id: 'c-lior', name: 'ליאור כץ', status: 'חדשה', terms: '', note: 'קבעה תור מהקישור. טיפול ראשון מחר.', phone: '972500000107' },
  { id: 'c-roni', name: 'רוני דהן', status: 'חדשה', terms: '', note: 'קבעה תור מהקישור, עיצוב גבות ואחר כך טיפול פנים.', phone: '972500000108' },
];
const cname = (id) => CLIENTS.find((c) => c.id === id).name;
const phoneOf = (id) => CLIENTS.find((c) => c.id === id).phone;
const row = ([, t, what, cid]) => [t, mins(what), cid, what, ''];

// does a visit of `len` minutes starting at hh:mm fit the real hours of that day
function fits(day, t, len) {
  const r = HOURS[B.core().dow(day)] || [], end = B.core().pad(Math.floor((+t.slice(0, 2) * 60 + +t.slice(3) + len) / 60)) + ':' + B.core().pad((+t.slice(3) + len) % 60);
  return r.some(([a, z]) => t >= a && end <= z);
}

// writes data/bookings and the events from them. A wide open config is used while the invented history is written (a
// day may fall on the closed Saturday), then the real hours are saved.
function seedBookings(dataPath, now) {
  now = now || Date.now();
  const open = { 0: [['00:00', '23:59']], 1: [['00:00', '23:59']], 2: [['00:00', '23:59']], 3: [['00:00', '23:59']], 4: [['00:00', '23:59']], 5: [['00:00', '23:59']], 6: [['00:00', '23:59']] };
  B.saveConfig(dataPath, { hours: open, services: SERVICES, slotMinutes: 15, bufferMinutes: 0 });
  let n = 0;
  BEHIND.forEach(([ago, t, what, cid]) => {
    const r = B.add(dataPath, { start: ilDay(now, -ago) + ' ' + t, service: what, name: cname(cid), phone: phoneOf(cid), src: 'owner' }, now - (ago + 1) * 864e5);
    if (r.ok) { B.setStatus(dataPath, r.booking.id, 'done', now); n++; }
  });
  AHEAD.forEach(([d, t, what, cid, status, src]) => {
    // today's earlier hours are past, so a booking for them is written as if made yesterday
    // a later day that falls on a closed day (Saturday, Friday afternoon) moves to the next open one; today stays where it is
    let dd = d;
    while (dd > 0 && dd < d + 7 && !fits(ilDay(now, dd), t, mins(what))) dd++;
    const r = B.add(dataPath, { start: ilDay(now, dd) + ' ' + t, service: what, name: cname(cid), phone: phoneOf(cid), src }, now - 864e5);
    if (r.ok) { if (status !== 'booked') B.setStatus(dataPath, r.booking.id, status, now); n++; }
  });
  // the demo's own booking link (lib/book-page.js DEMO_LINK): the owner's screen shows it, the public page works on invented data
  B.saveConfig(dataPath, { hours: HOURS, services: SERVICES, slotMinutes: 15, bufferMinutes: 0, linkToken: BP.DEMO_LINK, remindAt: '06:00' });
  // two invented health declarations (lib/book-health.js), so that the owner's screen shows the chip and the sheet
  try {
    const H = require('../book-health.js'), none = {};
    H.QUESTIONS.filter((q) => !q.free).forEach((q) => { none[q.id] = { a: 'n' }; });
    const sig = 'M20,80L32,50L45,82L58,44L72,84L88,46L104,78L124,60L150,70';
    H.save(dataPath, phoneOf('c-michal'), { answers: Object.assign({}, none, { q3: { a: 'y', d: 'כדור לבלוטת התריס, כל בוקר' } }), note: '', sig }, '', now - 2 * 864e5, B);
    H.save(dataPath, phoneOf('c-hadas'), { answers: Object.assign({}, none, { q2: { a: 'y', d: 'רגישות לבישום' } }), note: 'עור רגיש, בלי חומצות חזקות', sig }, '', now - 20 * 864e5, B);
  } catch (e) { /* the demo goes on without them */ }
  B.syncEvents(dataPath);
  // tomorrow's reminders as a send list, built as the evening tick builds them (the clock is forced to 18:00 of today here)
  const eighteen = B.core().localToMs(ilDay(now, 0), '18:00');
  try { R.build({ dataPath, gender: 'f', biz: { name: 'הקליניקה של מור' } }, Math.max(eighteen, now)); } catch (e) { /* the demo goes on without it */ }
  // and what the owner sees when a client books herself from the link (a message in her chat)
  const dir = path.join(dataPath, 'chat', 'chat'); fs.mkdirSync(dir, { recursive: true });
  const at = new Date(now - 40 * 60e3).toISOString();
  fs.writeFileSync(path.join(dir, 'demo-bk1.json'), JSON.stringify({ at, from: 'claude', id: 'demo-bk1', status: 'done',
    text: '📅 תור חדש מהקישור: ליאור כץ, אנטי אייג׳ינג, מחר בשעה 10:00. נכנס ליומן שלך ב 📅 התורים שלי.' }, null, 1));
  return n;
}

module.exports = require('./make.js').make({
  BIZ: { name: 'הקליניקה של מור', owner: 'מור', sub: 'קליניקה לטיפוח, הרצליה', city: 'הרצליה' },
  mail: 'mor.clinic@example.com',
  cash: 12600,
  about: [
    'מור קוסמטיקאית עצמאית, עובדת לבד. המוניטור הוא יומן התורים שלה: שעות הפעילות, השירותים והמחירים, התורים של היום ושל הימים הבאים. תור שנקבע מהקישור נכנס ליומן שלה לבד, וכשלקוחה מבקשת להזיז או לבטל, זה נרשם שם.',
    'שעות הפעילות: כל יום 09:00 עד 18:00.',
    'מחירון: ' + SERVICES.map((s) => s.name + ' ' + s.minutes + ' דקות, ' + s.price + ' ₪').join('; ') + '.',
    'מה המוניטור עושה בשבילה: יומן התורים, לקוחות שלא חזרו, חשבוניות ספקים ומלאי, רעיונות ופוסטים לאינסטגרם, ותזכורות תשלום.',
  ],
  brief: [
    'בוקר טוב מור.',
    '',
    'היום ביומן שלך: 09:00 עיצוב גבות, 11:00 טיפול פנים להדס לוי, ו 15:30 פילינג.',
    'ב 14:00 כדאי להזמין קרמים, נשארו 2 מהסרום.',
    '',
    'שלוש לקוחות לא היו אצלך חודשיים: שירן, נועה ויעל. הכנתי לכל אחת הודעה אישית, מחכות לאישור שלך.',
    'פוסט לפני ואחרי מוכן לפרסום ב 19:00.',
  ],
  CLIENTS,
  TODAY: AHEAD.filter((x) => x[0] === 0).map(row),
  TOMORROW: AHEAD.filter((x) => x[0] === 1).map(row),
  seedBookings,
  REMINDERS: [[0, '14:00', 'להזמין קרמים: נשארו 2 מהסרום'], [0, '19:00', 'פוסט לאינסטגרם: לפני ואחרי, מוכן לפרסום']],
  DEBTORS: [['דנה פרץ', 240, 21]],
  QUOTES: [],
  TASKS: [[0, 'לאשר את ההודעות לשירן, נועה ויעל'], [1, 'לצלם לפני ואחרי של הפילינג'], [2, 'לבדוק מחיר סרום אצל ספק שני']],
});
