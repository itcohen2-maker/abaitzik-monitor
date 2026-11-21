'use strict';
/*
  21.11.2026, Itzik: the trade demo of a gypsum and renovation contractor (lib/trades.js gypsum).
  The same file formats as the barbershop (lib/demo-data.js), invented data, dates relative to today.
  The three home cards (lib/trade-cards.js) read: money/money.json debtors, biz-home/events.json today,
  biz-home/quotes.json without signed. Every name, phone and mail here is invented.
*/
const fs = require('fs');
const path = require('path');
const H = require('../demo-data.js');
const { ilDay, at, iso, pastIso, addMin, writeJson } = H;

const BIZ = { name: 'דוד גבס ושיפוצים', owner: 'דוד', sub: 'גבס, תקרות ושיפוצים, ראשון לציון', city: 'ראשון לציון' };

const CLIENTS = [
  { id: 'c-levi', name: 'משפחת לוי', status: 'עבודה הסתיימה', terms: 'מקדמה 30%, יתרה בסיום', note: 'תקרה אקוסטית בסלון ותאורה שקועה. העבודה הסתיימה לפני 12 יום, היתרה עוד לא שולמה.' },
  { id: 'c-yossi', name: 'יוסי אברהם', status: 'עבודה הסתיימה', terms: 'שוטף 30', note: 'קיר גבס לחדר עבודה ונישה לטלוויזיה. הסתיים לפני 34 ימים.' },
  { id: 'c-oren', name: 'קבוצת אורן נכסים', status: 'לקוח קבוע', terms: 'שוטף 45', note: 'קבלן ראשי. 3 דירות בפרויקט ברחובות, תקרות ומחיצות.' },
  { id: 'c-cohen', name: 'רונית כהן', status: 'הצעה', terms: '', note: 'מטבח חדש, רוצה הנמכת תקרה ותאורה. מחכה לתשובה על ההצעה.' },
  { id: 'c-mizrahi', name: 'אבי מזרחי', status: 'הצעה', terms: '', note: 'סגירת מרפסת בגבס ירוק. ביקש לחשוב על זה.' },
  { id: 'c-golan', name: 'משפחת גולן', status: 'בעבודה', terms: 'מקדמה 40%', note: 'תקרת גבס ברחוב הרצל 12. היום יום שני של העבודה.' },
  { id: 'c-sharon', name: 'שרון ביטון', status: 'מדידה', terms: '', note: 'מטבח בנס ציונה, מדידה היום ב 13:00.' },
];
// [time, minutes, client, what, where]
const TODAY = [['07:30', 300, 'c-golan', 'תקרת גבס', 'רחוב הרצל 12, ראשון לציון'], ['13:00', 45, 'c-sharon', 'מדידה למטבח', 'נס ציונה']];
const TOMORROW = [['07:30', 480, 'c-golan', 'תקרת גבס, יום אחרון ושפכטל', 'רחוב הרצל 12, ראשון לציון'], ['15:00', 60, 'c-oren', 'פגישה באתר', 'רחובות']];
// [name, amount, days since the job was done]
const DEBTORS = [['משפחת לוי', 4800, 12], ['יוסי אברהם', 2300, 34], ['קבוצת אורן נכסים', 9600, 51]];
const QUOTES = [
  { no: '2041', client: 'רונית כהן', subject: 'הנמכת תקרה במטבח ותאורה', items: [['הנמכת תקרת גבס, מ״ר', 14, 220], ['פתחים לתאורה שקועה', 8, 60]], terms: 'מקדמה 30% בחתימה, יתרה בסיום', ago: 4 },
  { no: '2039', client: 'אבי מזרחי', subject: 'סגירת מרפסת בגבס ירוק', items: [['קיר גבס ירוק, מ״ר', 11, 260], ['בידוד', 11, 45]], terms: 'מקדמה 30% בחתימה, יתרה בסיום', ago: 9 },
  { no: '2036', client: 'משפחת גולן', subject: 'תקרת גבס בסלון', items: [['תקרת גבס, מ״ר', 32, 190]], terms: 'מקדמה 40%, יתרה בסיום', ago: 16, signed: true },
];
const TASKS = [[0, 'לקנות לוחות גבס ופרופילים לגולן'], [0, 'לשלוח למשפחת לוי תמונות של התקרה הגמורה'], [1, 'להזמין שפכטל וצבע'], [2, 'לחזור לאבי מזרחי על המרפסת']];

function cname(id) { const c = CLIENTS.find((x) => x.id === id); return c ? c.name : ''; }
function events(now) {
  const ev = [];
  const add = (day, list) => list.forEach(([t, len, cid, what, where], i) => ev.push({
    id: 'e' + day + '-' + i, start: at(now, day, t), end: at(now, day, addMin(t, len)),
    title: what + ': ' + cname(cid), where, attendees: [], clientId: cid,
  }));
  add(0, TODAY); add(1, TOMORROW);
  return ev;
}
const sum = (q) => q.items.reduce((a, [, n, p]) => a + n * p, 0);
const shekel = (n) => n.toLocaleString('he-IL') + ' ₪';

function brief() {
  return [
    'בוקר טוב דוד.',
    '',
    'היום: 07:30 תקרת גבס אצל משפחת גולן ברחוב הרצל 12, ו 13:00 מדידה למטבח של שרון ביטון בנס ציונה.',
    'לפני שיוצאים: לקנות לוחות גבס ופרופילים לגולן.',
    '',
    'כסף: שלושה חייבים, ' + shekel(DEBTORS.reduce((a, x) => a + x[1], 0)) + ' בסך הכל. משפחת לוי ' + shekel(4800) + ' מלפני 12 יום. הכנתי תזכורות מנומסות בשם המשרד.',
    'הצעות: רונית כהן עוד לא ענתה על הצעה 2041 (לפני 4 ימים), ואבי מזרחי על 2039 (לפני 9 ימים).',
  ].join('\n');
}

// What the demo chat is told. Plain lines, the same invented data the page shows.
function context(now) {
  now = now || Date.now();
  const l = [];
  l.push('העסק: ' + BIZ.name + ', ' + BIZ.sub + '. הבעלים: ' + BIZ.owner + ', עובד עם שני פועלים. עבודות גבס, תקרות, מחיצות ושיפוצים קטנים.');
  l.push('מחירון בערך: תקרת גבס 190 עד 220 ₪ למ״ר, קיר גבס ירוק 260 ₪ למ״ר, פתח לתאורה 60 ₪. מקדמה 30% עד 40% בחתימה, יתרה בסיום.');
  l.push('היום (' + ilDay(now, 0) + '): ' + TODAY.map(([t, , c, w, where]) => t + ' ' + w + ', ' + where + ' (' + cname(c) + ')').join('; ') + '.');
  l.push('מחר: ' + TOMORROW.map(([t, , c, w, where]) => t + ' ' + w + ', ' + where + ' (' + cname(c) + ')').join('; ') + '.');
  l.push('לקוחות: ' + CLIENTS.map((c) => c.name + ' (' + c.status + (c.terms ? ', ' + c.terms : '') + '): ' + c.note).join(' | '));
  l.push('חייבים: ' + DEBTORS.map(([n, a, d]) => n + ' ' + shekel(a) + ', ' + d + ' ימים מסיום העבודה').join('; ') + '. תזכורות בשם המשרד מוכנות לשליחה.');
  l.push('הצעות מחיר: ' + QUOTES.map((q) => q.no + ' ' + q.client + ', ' + q.subject + ', ' + shekel(sum(q)) + ' לפני מע״מ, ' + (q.signed ? 'נחתמה' : 'נשלחה לפני ' + q.ago + ' ימים ועוד לא נחתמה')).join('; ') + '.');
  l.push('משימות: ' + TASKS.map(([d, t]) => (d === 0 ? 'היום' : d === 1 ? 'מחר' : 'בעוד יומיים') + ': ' + t).join(' | '));
  return l.join('\n');
}

function seed(dataPath, now) {
  now = now || Date.now();
  const W = (rel, o) => writeJson(path.join(dataPath, rel), o);
  // the barbershop's leftovers, when the folder was seeded before (instance.json and data stay between runs)
  for (const d of ['biz/biz', 'tasks/tasks', 'reminders/reminders', 'reports/reports', 'chat/chat', 'routines', 'sendlist/sendlist', 'notes', 'ads', 'rivhit'])
    fs.rmSync(path.join(dataPath, d), { recursive: true, force: true });
  W('biz-home/clients.json', CLIENTS.map((c) => Object.assign({ biz: '', emails: [], domains: [], aliases: [] }, c)));
  W('biz-home/events.json', events(now));
  W('biz-home/meetings.json', []);
  W('biz-home/mail.json', []);
  W('biz-home/quotes.json', QUOTES.map((q, i) => ({ id: 'q' + (i + 1), at: new Date(now - q.ago * 864e5).toISOString(), no: q.no, client: q.client,
    subject: q.subject, items: q.items, terms: q.terms, valid: '30 יום', notes: q.signed ? 'נחתמה דיגיטלית' : 'נשלחה לחתימה דיגיטלית', signed: !!q.signed })));
  const debt = DEBTORS.reduce((a, x) => a + x[1], 0);
  W('money/money.json', { at: pastIso(now, 0, '07:00'), cash: 31200, debt, late: DEBTORS.filter((x) => x[2] > 30).reduce((a, x) => a + x[1], 0),
    forecast90: [31200, 29800, 33500, 36100, 34900, 38200, 40100], anomalies: [], debtors: DEBTORS });
  const got = new Date(now - 20 * 864e5).toISOString();
  W('conn/setup.json', { tok: 'de00de00de00de00de00', steps: [{ id: 'google', icon: '📧', title: 'גוגל: מייל, יומן ודרייב', oauth: { provider: 'google' } }],
    state: { google: { got, revokedAt: '', who: 'david.gypsum@example.com' } }, ready: { google: true } });
  W('conn/wa.json', { phone: '972500000123', via: 'shared' });
  W('conn/partner.json', { pageName: BIZ.name });
  W('status/features.json', { wa: true, money: true });
  TASKS.forEach(([d, text], i) => W('tasks/tasks/demo-' + i + '.json', { id: 'demo-t' + i, day: ilDay(now, d), text, n: i + 1 }));
  // 21.11.2026: no money on the day ring (Itzik: "נורא מעצבן"); the debts live in the quiet collection line.
  W('reminders/reminders/demo-cohen.json', { at: new Date(now).toISOString(), due: iso(now, 0, '16:00'), text: 'לחזור לרונית כהן: הצעה 2041, נשלחה לפני 4 ימים' });
  W('reports/reports/demo-brief.json', { at: pastIso(now, 0, '06:30'), title: 'דוח בוקר', body: brief(now) });
  const q1 = pastIso(now, 0, '06:45'), a1 = pastIso(now, 0, '06:46');
  W('chat/chat/demo-q1.json', { at: q1, from: 'itzik', id: 'demo-q1', text: 'מה יש לי היום?', status: 'done', ackAt: q1 });
  W('chat/chat/demo-a1.json', { at: a1, from: 'claude', re: 'demo-q1', text: brief(now) });
  return { clients: CLIENTS.length, events: events(now).length, quotes: QUOTES.length, debts: DEBTORS.length };
}

module.exports = { BIZ, seed, context, brief };
