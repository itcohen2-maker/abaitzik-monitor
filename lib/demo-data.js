'use strict';
/*
  17.11.2026, Itzik: a public demo monitor at it-solution.co.il/demo. An invented barbershop,
  a real monitor page (built with MONITOR_NO_GATE by setup/demo-build.sh into /home/demo/app),
  invented data, and a real conversation (lib/demo-chat.js) that knows the same invented data.

  One source for both: seed() writes the data files the page is built from, context() is what
  the chat is told. Every date is relative to today (Israel time), so the demo never looks stale.
  Every name, phone and mail here is invented. Nothing of Itzik's, and nothing of a real customer.
*/
const fs = require('fs');
const path = require('path');

const BIZ = { name: 'מספרת רועי', owner: 'רועי', sub: 'תספורת גברים וזקן, רמת גן', city: 'רמת גן' };

function ilDay(now, plus) {
  const d = new Date(now + (plus || 0) * 864e5);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}
// "+02:00" or "+03:00", whatever Israel is on that day.
function ilOff(now) {
  const d = new Date(now);
  const il = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  const h = Math.round((il - utc) / 3600e3);
  return (h >= 0 ? '+' : '-') + String(Math.abs(h)).padStart(2, '0') + ':00';
}
function at(now, plusDays, hhmm) { return ilDay(now, plusDays) + 'T' + hhmm + ':00' + ilOff(now); }
function iso(now, plusDays, hhmm) { return new Date(at(now, plusDays, hhmm)).toISOString(); }
function addMin(hhmm, m) { const [h, mm] = hhmm.split(':').map(Number); const t = h * 60 + mm + m; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }

const CLIENTS = [
  { id: 'c-avi', name: 'אבי לוי', status: 'קבוע', terms: 'כל 3 שבועות', note: 'מספר 2 בצדדים, מספריים למעלה. אוהב קפה שחור.' },
  { id: 'c-dan', name: 'דניאל כהן', status: 'קבוע', terms: 'כל שבועיים', note: 'דהוי נמוך וזקן. תמיד מגיע עם הבן.' },
  { id: 'c-yossi', name: 'יוסי מזרחי', status: 'קבוע', terms: 'כל חודש', note: 'שומר על אורך למעלה. מבקש לא לגעת בפוני.' },
  { id: 'c-omer', name: 'עומר שפירא', status: 'חדש', terms: '', note: 'הגיע מאינסטגרם. בפעם הראשונה ביקש דהוי גבוה.' },
  { id: 'c-eli', name: 'אלי ביטון', status: 'נעלם', terms: 'היה כל 3 שבועות', note: 'לא הגיע 7 שבועות. כדאי לשלוח הודעה.' },
  { id: 'c-nir', name: 'ניר אברהם', status: 'קבוע', terms: 'כל 3 שבועות', note: 'זקן מלא, מעצב עם תער.' },
  { id: 'c-tal', name: 'טל גולן', status: 'חתן', terms: 'חתונה בעוד 3 שבועות', note: 'חבילת חתן עם 4 מלווים. הצעת מחיר נשלחה.' },
  { id: 'c-ron', name: 'רון פרץ', status: 'קבוע', terms: 'כל שבועיים', note: 'תספורת ילד לבן שלו, יונתן, באותו תור.' },
];

// Today's chair. Times in Israel.
const TODAY = [
  ['09:00', 30, 'c-avi', 'תספורת'], ['09:30', 45, 'c-dan', 'תספורת וזקן'], ['10:30', 30, 'c-yossi', 'תספורת'],
  ['11:00', 30, null, 'פנוי'], ['12:00', 45, 'c-nir', 'זקן ועיצוב'], ['13:30', 30, 'c-omer', 'תספורת'],
  ['15:00', 60, 'c-ron', 'תספורת אב ובן'], ['17:00', 30, null, 'פנוי'], ['18:00', 45, 'c-tal', 'ניסיון לחתן'],
];
const TOMORROW = [['09:30', 30, 'c-yossi', 'תיקון קצר'], ['11:00', 45, 'c-dan', 'תספורת וזקן'], ['16:30', 30, 'c-avi', 'תספורת']];

const LEADS = [
  { k: 'ig', name: 'מתן ש.', status: 'חדש', ago: 0.05, last: 'יש תור היום בערב? צריך תספורת לפני חתונה של חבר', next: 'להציע 17:00, הפנוי של היום' },
  { k: 'wa', name: 'שירן', status: 'חדש', ago: 0.2, last: 'כמה עולה תספורת לילד בן 6?', next: 'לשלוח מחירון ילדים' },
  { k: 'site', name: 'גיא רוזן', status: 'בשיחה', ago: 1, last: 'מעוניין במנוי חודשי, יש דבר כזה?', next: 'להציע מנוי 3 תספורות בחודש' },
  { k: 'fb', name: 'משה דהן', status: 'הצעה', ago: 2, last: 'שלחתי לו הצעה לחבילת חתן ל 5', next: 'לחזור אליו מחר' },
  { k: 'ig', name: 'אור', status: 'נסגר', ago: 3, last: 'קבע תור לחמישי 12:00', next: '' },
];
const SRC = { ig: 'ig-dm', wa: 'whatsapp', site: 'site', fb: 'messenger' };

const MAIL = [
  { ago: 0, hh: '08:10', from: 'ספק מוצרי שיער', subject: 'ההזמנה שלך יוצאת מחר', text: 'שלום רועי, 6 קופסאות ווקס מאט ו 2 שמפו לזקן יוצאים מחר בבוקר. חשבונית מצורפת.', tag: 'ספקים' },
  { ago: 0, hh: '07:20', from: 'טל גולן', subject: 'לגבי החתונה', text: 'אחי, אפשר להוסיף עוד מלווה לחבילה? ויש מצב להגיע אלינו הביתה בבוקר?', tag: 'דחוף', reply: 'אפשר להוסיף, 70 ₪ למלווה. הגעה עד הבית בבוקר החתונה בתוספת 200 ₪. לסגור?' },
  { ago: 1, hh: '21:05', from: 'Google', subject: 'ביקורת חדשה: 5 כוכבים', text: 'עומר שפירא כתב: "הכי טוב ברמת גן, יצאתי עם תספורת שאני לא מפסיק לקבל עליה מחמאות".', tag: 'ביקורת', reply: 'תודה עומר, כיף לשמוע. נתראה בתור הבא.' },
  { ago: 2, hh: '10:40', from: 'רואה החשבון', subject: 'חסרות קבלות לאוקטובר', text: 'רועי, חסרות לי 3 קבלות מאוקטובר: חשמל, ספק המוצרים והשכירות.', tag: 'כסף' },
];

const TASKS = [
  [0, 'לשלוח לאלי ביטון הודעה, לא הגיע 7 שבועות'],
  [0, 'להזמין סכיני תער חדשים, נשארה קופסה אחת'],
  [0, 'לשלוח לרואה החשבון 3 קבלות מאוקטובר'],
  [1, 'לאשר לטל גולן את המלווה החמישי בחבילת החתן'],
  [2, 'לפרסם סטורי עם התספורת של עומר (קיבלתי אישור)'],
];

function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1)); }
function cname(id) { const c = CLIENTS.find((x) => x.id === id); return c ? c.name : ''; }

function events(now) {
  const ev = [];
  const add = (day, list) => list.forEach(([t, len, cid, what], i) => ev.push({
    id: 'e' + day + '-' + i, start: at(now, day, t), end: at(now, day, addMin(t, len)),
    title: cid ? what + ': ' + cname(cid) : 'פנוי', where: 'המספרה', attendees: [], clientId: cid || '',
  }));
  add(0, TODAY); add(1, TOMORROW);
  return ev;
}

function seed(dataPath, now) {
  now = now || Date.now();
  const bh = path.join(dataPath, 'biz-home');
  writeJson(path.join(bh, 'clients.json'), CLIENTS.map((c) => Object.assign({ biz: '', emails: [], domains: [], aliases: [] }, c)));
  writeJson(path.join(bh, 'events.json'), events(now));
  writeJson(path.join(bh, 'meetings.json'), []);
  writeJson(path.join(bh, 'mail.json'), MAIL.map((m, i) => ({ id: 'm' + i, at: iso(now, -m.ago, m.hh), from: m.from, subject: m.subject, text: m.text, tag: m.tag, reply: m.reply || '' })));
  writeJson(path.join(bh, 'quotes.json'), [{ id: 'q1', at: new Date(now - 2 * 864e5).toISOString(), no: '1007', client: 'טל גולן', subject: 'חבילת חתן', items: [['תספורת וזקן לחתן', 1, 180], ['תספורת למלווה', 4, 70], ['הגעה עד הבית בבוקר החתונה', 1, 200]], terms: 'מקדמה 100 ₪ בקביעת התאריך', valid: '14 יום' }]);
  // 📤 messages ready to send, one by one, from his own WhatsApp (lib/sendlist.js)
  const sl = path.join(dataPath, 'sendlist', 'sendlist');
  fs.rmSync(sl, { recursive: true, force: true });
  writeJson(path.join(sl, ilDay(now, 0).replace(/-/g, '') + '-0730-demo.json'), { id: ilDay(now, 0).replace(/-/g, '') + '-0730-demo', at: at(now, 0, '07:30'), title: 'תזכורות לתורים של היום', note: 'הכנתי לכל לקוח הודעה, אתה שולח מהוואטסאפ שלך',
    items: TODAY.filter((x) => x[2]).slice(0, 6).map(([t, , c]) => ({ name: cname(c), phone: '0500000000', text: 'היי ' + cname(c).split(' ')[0] + ', מזכיר שיש לך תור היום ב ' + t + ' במספרה. אם משהו השתנה, תכתוב לי ואזיז לך.' })) });
  // leads
  const bz = path.join(dataPath, 'biz', 'biz');
  fs.rmSync(bz, { recursive: true, force: true });
  LEADS.forEach((l, i) => {
    const t = new Date(now - l.ago * 864e5).toISOString();
    writeJson(path.join(bz, 'demo-lead-' + i + '.json'), { id: 'demo-lead-' + i, kind: 'lead', name: l.name, phone: '', email: '', status: l.status, amount: 0,
      note: l.last, last: l.last, next: l.next, nextAt: l.next ? ilDay(now, l.ago < 1 ? 0 : 1) : '', at: t, updatedAt: t, source: SRC[l.k], ref: SRC[l.k], srcKey: 'demo:' + i });
  });
  // tasks
  const tk = path.join(dataPath, 'tasks', 'tasks');
  fs.rmSync(tk, { recursive: true, force: true });
  TASKS.forEach(([d, text], i) => writeJson(path.join(tk, 'demo-' + i + '.json'), { id: 'demo-t' + i, day: ilDay(now, d), text, n: i + 1 }));
  // reminders: back to clients
  const rm = path.join(dataPath, 'reminders', 'reminders');
  fs.rmSync(rm, { recursive: true, force: true });
  writeJson(path.join(rm, 'demo-eli.json'), { at: new Date(now).toISOString(), due: iso(now, 0, '19:00'), text: 'לחזור לאלי ביטון: לא הגיע 7 שבועות. הצעה: "התגעגענו, יש לך תור ביום חמישי 12:00?"' });
  writeJson(path.join(rm, 'demo-moshe.json'), { at: new Date(now).toISOString(), due: iso(now, 1, '10:00'), text: 'משה דהן: לחזור לגבי הצעת חבילת החתן' });
  // the morning report and two answers
  const rp = path.join(dataPath, 'reports', 'reports');
  fs.rmSync(rp, { recursive: true, force: true });
  writeJson(path.join(rp, 'demo-brief.json'), { at: iso(now, 0, '07:30'), title: 'דוח בוקר', body: brief(now) });
  const ch = path.join(dataPath, 'chat', 'chat');
  fs.rmSync(ch, { recursive: true, force: true });
  const q1 = iso(now, 0, '07:45'), a1 = iso(now, 0, '07:46');
  writeJson(path.join(ch, 'demo-q1.json'), { at: q1, from: 'itzik', id: 'demo-q1', text: 'מה יש לי היום?', status: 'done', ackAt: q1 });
  writeJson(path.join(ch, 'demo-a1.json'), { at: a1, from: 'claude', re: 'demo-q1', text: brief(now) });
  return { clients: CLIENTS.length, events: events(now).length, leads: LEADS.length };
}

function brief(now) {
  const busy = TODAY.filter((x) => x[2]);
  return [
    'בוקר טוב רועי.',
    '',
    'היום ' + busy.length + ' תורים, הראשון ב 09:00 (אבי לוי) והאחרון ב 18:00 (ניסיון לטל גולן, החתן).',
    'יש שני חלונות פנויים: 11:00 ו 17:00.',
    '',
    'לידים: 2 חדשים מאתמול בלילה. מתן מאינסטגרם רוצה תור היום בערב, אפשר להציע לו את 17:00.',
    'שירן שאלה בוואטסאפ כמה עולה תספורת לילד.',
    '',
    'לחזור אליו: אלי ביטון לא הגיע 7 שבועות.',
    'במייל: טל גולן רוצה מלווה חמישי והגעה הביתה. הכנתי לו תשובה.',
  ].join('\n');
}

// What the demo chat is told. Plain lines, the same invented data the page shows.
function context(now) {
  now = now || Date.now();
  const l = [];
  l.push('העסק: ' + BIZ.name + ', ' + BIZ.sub + '. הבעלים: ' + BIZ.owner + '. כיסא אחד, עובד לבד, פתוח א׳ עד ה׳ 09:00 עד 20:00, ו׳ עד 14:00.');
  l.push('מחירון: תספורת 80 ₪, תספורת וזקן 110 ₪, זקן ועיצוב 60 ₪, ילד עד גיל 12: 60 ₪, חבילת חתן 180 ₪ ועוד 70 ₪ לכל מלווה.');
  l.push('היום (' + ilDay(now, 0) + '), התורים: ' + TODAY.map(([t, , c, w]) => t + ' ' + (c ? w + ' ' + cname(c) : 'פנוי')).join('; ') + '.');
  l.push('מחר: ' + TOMORROW.map(([t, , c, w]) => t + ' ' + w + ' ' + cname(c)).join('; ') + '.');
  l.push('לקוחות: ' + CLIENTS.map((c) => c.name + ' (' + c.status + (c.terms ? ', ' + c.terms : '') + '): ' + c.note).join(' | '));
  l.push('לידים: ' + LEADS.map((x) => x.name + ' [' + x.status + '] "' + x.last + '"' + (x.next ? ', הבא: ' + x.next : '')).join(' | '));
  l.push('מיילים: ' + MAIL.map((m) => m.from + ': ' + m.subject + '. ' + m.text).join(' | '));
  l.push('משימות: ' + TASKS.map(([d, t]) => (d === 0 ? 'היום' : d === 1 ? 'מחר' : 'בעוד יומיים') + ': ' + t).join(' | '));
  l.push('הכנסות החודש עד היום: 14,320 ₪ מ 162 תורים. בחודש שעבר באותו זמן: 12,900 ₪. ביטולים החודש: 6, שניים מהם בלי הודעה.');
  return l.join('\n');
}

module.exports = { BIZ, seed, context, brief };

if (require.main === module) {
  const dp = process.argv[2];
  if (!dp) { console.error('usage: node lib/demo-data.js <dataPath>'); process.exit(1); }
  console.log(JSON.stringify(seed(dp)));
}
