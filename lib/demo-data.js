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
// 19.11.2026: the build runs at 00:20 too. "Today 08:41" would be in the future then, so such a moment moves to yesterday.
function pastIso(now, plusDays, hhmm) { const t = iso(now, plusDays, hhmm); return Date.parse(t) > now ? iso(now, plusDays - 1, hhmm) : t; }
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

// 19.11.2026: a real CRM picture, every status, every source, and a short history on each card (note).
const LEADS = [
  { k: 'ig', name: 'מתן ש.', status: 'חדש', ago: 0.05, last: 'יש תור היום בערב? צריך תספורת לפני חתונה של חבר', next: 'להציע 17:00, הפנוי של היום', hist: ['היום 08:40 הודעה באינסטגרם', 'היום 08:41 הכנתי תשובה: 17:00 פנוי'] },
  { k: 'wa', name: 'שירן', status: 'חדש', ago: 0.2, last: 'כמה עולה תספורת לילד בן 6?', next: 'לשלוח מחירון ילדים', hist: ['היום 07:15 הודעה בוואטסאפ', 'היום 07:16 הכנתי תשובה: 60 ₪, כולל חפיפה'] },
  { k: 'site', name: 'גיא רוזן', status: 'בשיחה', ago: 1, last: 'מעוניין במנוי חודשי, יש דבר כזה?', next: 'להציע מנוי 3 תספורות בחודש', amount: 210, hist: ['אתמול טופס באתר', 'אתמול שיחה של 4 דקות', 'הבא: הצעה למנוי 3 תספורות ב 210 ₪'] },
  { k: 'fb', name: 'משה דהן', status: 'הצעה', ago: 2, last: 'שלחתי לו הצעה לחבילת חתן ל 5', next: 'לחזור אליו מחר', amount: 460, hist: ['לפני יומיים הודעה במסנג׳ר', 'לפני יומיים הצעה 1008 נשלחה לחתימה', 'אתמול פתח את ההצעה פעמיים'] },
  { k: 'google', name: 'עדי פרידמן', status: 'בשיחה', ago: 1.5, last: 'שאל אם עושים גם צבע לזקן', next: 'לשלוח תמונות של עבודות צבע', hist: ['אתמול שיחה מגוגל מפות', 'אתמול שלחתי מחירון צבע'] },
  { k: 'tt', name: 'בן', status: 'חדש', ago: 0.4, last: 'ראיתי את הסרטון בטיקטוק, כמה עולה פייד?', next: 'לענות: 80 ₪, ולהציע תור מחר', hist: ['היום תגובה בטיקטוק', 'היום עבר להודעה פרטית'] },
  { k: 'ig', name: 'אור', status: 'נסגר', ago: 3, last: 'קבע תור לחמישי 12:00', next: '', amount: 80, hist: ['לפני 3 ימים הודעה באינסטגרם', 'לפני 3 ימים נקבע תור לחמישי 12:00'] },
  { k: 'wa', name: 'קובי', status: 'לא רלוונטי', ago: 6, last: 'חיפש מספרה בחיפה', next: '', hist: ['לפני שבוע הודעה בוואטסאפ', 'גר בחיפה, הפניתי בנימוס'] },
];
const SRC = { ig: 'ig-dm', wa: 'whatsapp', site: 'site', fb: 'messenger', google: 'google', tt: 'tiktok' };

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

const AGENTS = [
  ['anoa01', 'נועה', 'מזכירת התורים'], ['amaya01', 'מאיה', 'אחראית על הלידים'], ['aavi01', 'אבי', 'שומר הלקוחות'],
  ['ayossi01', 'יוסי', 'כסף, מלאי וספקים'], ['ashira01', 'שירה', 'רשתות חברתיות'],
];
// [agent, kind, sched, text, result of the last run]
const ROUTINES = [
  ['anoa01', 'work', { freq: 'daily', hm: '07:30' }, 'להכין לכל מי שיש לו תור היום הודעת תזכורת, ולהציג לי לאישור', 'הכנתי 7 תזכורות לתורים של היום. הן מחכות ב 📤 הודעות לשליחה, כל אחת בלחיצה אחת.'],
  ['anoa01', 'remind', { freq: 'daily', hm: '19:45' }, 'לסגור קופה ולספור מזומן', ''],
  ['amaya01', 'work', { freq: 'hourly', hm: '09:05' }, 'לבדוק לידים חדשים מאינסטגרם, וואטסאפ והאתר, ולהכין לכל אחד תשובה', 'נכנסו 2 לידים. מתן ש. מאינסטגרם רוצה תור הערב, הצעתי לו 17:00. שירן שאלה כמה עולה תספורת לילד, הכנתי תשובה: 60 ₪.'],
  ['aavi01', 'work', { freq: 'weekly', hm: '10:00', days: [0] }, 'למצוא לקוחות קבועים שלא הגיעו יותר מ 6 שבועות, ולנסח לכל אחד הודעת געגוע', 'נמצא אחד: אלי ביטון, 7 שבועות. הכנתי לו הודעה עם הצעה ליום חמישי ב 12:00.'],
  ['aavi01', 'work', { freq: 'daily', hm: '10:00' }, 'לבקש ביקורת בגוגל ממי שהסתפר אתמול', '4 לקוחות הסתפרו אתמול. הכנתי לכל אחד בקשה קצרה לביקורת. עומר כבר כתב 5 כוכבים.'],
  ['ayossi01', 'work', { freq: 'weekly', hm: '09:00', days: [4] }, 'לבדוק מלאי מוצרים ולהכין הזמנה לספק', 'נשארה קופסת תער אחת וווקס לארבעה ימים. הכנתי הזמנה: 6 ווקס מאט, 2 שמפו לזקן, 2 קופסאות תער.'],
  ['ayossi01', 'work', { freq: 'monthly', hm: '09:00', dom: 1 }, 'לסכם את החודש: הכנסות, ביטולים ולקוחות חדשים', 'אוקטובר: 18,450 ₪ מ 208 תורים, 9 ביטולים, 14 לקוחות חדשים (6 מאינסטגרם).'],
  ['ashira01', 'work', { freq: 'weekly', hm: '12:00', days: [2] }, 'להכין פוסט לאינסטגרם מהתספורת הכי יפה של השבוע', 'הכנתי טיוטה לפוסט עם התספורת של עומר. מחכה לאישור שלך.'],
  ['ashira01', 'work', { freq: 'daily', hm: '20:30' }, 'לבדוק תגובות והודעות חדשות באינסטגרם ובפייסבוק', 'אתמול: 3 תגובות ו 2 הודעות. הכנתי תשובות, אחת מהן שאלה על חבילת חתן.'],
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
  writeJson(path.join(bh, 'meetings.json'), meetings(now));
  writeJson(path.join(bh, 'mail.json'), MAIL.map((m, i) => ({ id: 'm' + i, at: iso(now, -m.ago, m.hh), from: m.from, subject: m.subject, text: m.text, tag: m.tag, reply: m.reply || '' })));
  writeJson(path.join(bh, 'quotes.json'), [
    { id: 'q1', at: new Date(now - 2 * 864e5).toISOString(), no: '1007', client: 'טל גולן', subject: 'חבילת חתן', items: [['תספורת וזקן לחתן', 1, 180], ['תספורת למלווה', 4, 70], ['הגעה עד הבית בבוקר החתונה', 1, 200]], terms: 'מקדמה 100 ₪ בקביעת התאריך', valid: '14 יום' },
    // 19.11.2026: one sent for signing and opened, one signed
    { id: 'q2', at: new Date(now - 1.6 * 864e5).toISOString(), no: '1008', client: 'משה דהן', subject: 'חבילת חתן ל 5', items: [['תספורת וזקן לחתן', 1, 180], ['תספורת למלווה', 4, 70]], terms: 'מקדמה 100 ₪ בחתימה', valid: '14 יום', notes: 'נשלחה לחתימה דיגיטלית, נפתחה פעמיים' },
    { id: 'q3', at: new Date(now - 3 * 864e5).toISOString(), no: '1006', client: 'גיא רוזן', subject: 'מנוי חודשי', items: [['מנוי 3 תספורות בחודש', 1, 210]], terms: 'הוראת קבע חודשית', valid: '30 יום', notes: 'נחתמה דיגיטלית ב PDF' },
  ]);
  // 🔌 every connection the monitor has (lib/connections.js), Itzik 17.11: "לשים שם את כל החיבורים הקיימים שלנו".
  // Connected in the demo: WhatsApp, Google, Facebook and Instagram, signature. The rest show their connect button
  // (a tap on the page gives the demo line, lib/public-demo.js). Invented accounts only, example.com.
  const got = new Date(now - 20 * 864e5).toISOString();
  writeJson(path.join(dataPath, 'conn', 'setup.json'), { tok: 'de00de00de00de00de00',
    steps: [['google', '📧', 'גוגל: מייל, יומן ודרייב', 'google'], ['ms', '📅', 'מיקרוסופט: יומן אאוטלוק', 'microsoft'],
      ['ff', '🎙️', 'פיירפליס', 'fireflies'], ['yt', '▶️', 'יוטיוב', 'google'], ['li', '💼', 'לינקדין', 'linkedin'], ['tt', '🎵', 'טיקטוק', 'tiktok']]
      .map(([id, icon, title, provider]) => ({ id, icon, title, oauth: { provider } })),
    state: { google: { got, revokedAt: '', who: 'roi.barber@example.com' } },
    ready: { google: true, meta: true, microsoft: true, fireflies: true, linkedin: true, tiktok: true } });
  writeJson(path.join(dataPath, 'conn', 'wa.json'), { phone: '972500000123', via: 'shared' });
  writeJson(path.join(dataPath, 'conn', 'partner.json'), { pageName: 'מספרת רועי' });
  // 19.11.2026: the money view (bank, debtors, forecast) and the accounting read, as for a customer with those add-ons.
  writeJson(path.join(dataPath, 'status', 'features.json'), { wa: true, money: true, morning: true });
  // 🧑‍💼 the manager and her agents (lib/routines.js, lib/agents-ui.js), Itzik 17.11: "חסר המנהל ... עם כל הסוכנים שלו".
  // Every routine has today's last run with its result, so the screen shows work done, not an empty form.
  const rdir = path.join(dataPath, 'routines');
  fs.rmSync(rdir, { recursive: true, force: true });
  writeJson(path.join(rdir, 'agents.json'), AGENTS.map(([id, name, role], i) => ({ id, name, role, c: i % 4 })));
  ROUTINES.forEach(([agent, kind, sched, text, result], i) => {
    // the last run is the routine's own last scheduled time (the same clock the worker uses)
    const lastIso = new Date(require('./routines.js').lastScheduled({ sched }, now)).toISOString();
    writeJson(path.join(rdir, 'routines', 'rdemo' + i + '.json'), { id: 'rdemo' + i, agent, kind, sched, text, state: 'active',
      createdAt: new Date(now - 30 * 864e5).toISOString(), lastRunAt: result ? lastIso : null, lastResult: result || '',
      runs: result ? [{ at: lastIso, result }] : [] });
  });
  // 📝 notes (lib/notes-sync.js state), what a barber jots down
  const nt = (id, d, text, html) => ({ id, text, at: new Date(now - d * 864e5).toISOString(), upd: new Date(now - d * 864e5).toISOString(), html: html || '', by: '' });
  writeJson(path.join(dataPath, 'notes', 'notes', 'state.json'), { at: new Date(now).toISOString(), gone: {}, tasksDone: [], tasksCleared: [], remGone: {}, srcEdits: {}, notes: [
    nt('ndemo1', 0.2, 'מבצע חנוכה: תספורת וזקן ב 95 במקום 110, רק בבוקר. לשאול את המוניטור איך לנסח לאינסטגרם'),
    nt('ndemo2', 2, 'מכונת תספורת חדשה: וואל מגיק קליפ או באביליס. לבדוק מחירים לפני סוף החודש'),
    nt('ndemo3', 5, 'רעיונות לסטורי: לפני ואחרי, טיפ לטיפוח זקן, הקפה של הבוקר במספרה'),
  ] });
  // 📊 campaigns (ads-sync.js format, numbers only)
  writeJson(path.join(dataPath, 'ads', 'status.json'), { ok: true, who: 'מספרת רועי', at: new Date(now).toISOString(), accounts: [{ id: 'act_demo', name: 'מספרת רועי', currency: 'ILS', status: 1, campaigns: [
    { id: 'c1', name: 'תור היום בערב | רמת גן 5 ק״מ | 30 ליום', status: 'ACTIVE', objective: 'OUTCOME_LEADS', budget: 30, budgetLife: 0, spend7: 196.4, leads7: 9, msgs7: 14, cpl7: 21.8, clicks7: 312, impr7: 8450, spendToday: 18.2 },
    { id: 'c2', name: 'חבילת חתן | מתחתנים בקרוב | 20 ליום', status: 'ACTIVE', objective: 'OUTCOME_ENGAGEMENT', budget: 20, budgetLife: 0, spend7: 131.9, leads7: 3, msgs7: 6, cpl7: 44, clicks7: 141, impr7: 5120, spendToday: 12.5 },
    { id: 'c3', name: 'תספורת ראשונה לילדים | הורים באזור', status: 'PAUSED', objective: 'OUTCOME_TRAFFIC', budget: 0, budgetLife: 0, spend7: 22.3, leads7: 0, msgs7: 1, cpl7: 0, clicks7: 58, impr7: 1904, spendToday: 0 },
  ] }] });
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
    writeJson(path.join(bz, 'demo-lead-' + i + '.json'), { id: 'demo-lead-' + i, kind: 'lead', name: l.name, phone: '', email: '', status: l.status, amount: l.amount || 0,
      note: l.last + (l.hist ? '\n' + l.hist.join('\n') : ''), last: l.last, next: l.next, nextAt: l.next ? ilDay(now, l.ago < 1 ? 0 : 1) : '', at: t, updatedAt: t, source: SRC[l.k], ref: SRC[l.k], srcKey: 'demo:' + i });
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
  writeJson(path.join(rp, 'demo-brief.json'), { at: pastIso(now, 0, '07:30'), title: 'דוח בוקר', body: brief(now) });
  const ch = path.join(dataPath, 'chat', 'chat');
  fs.rmSync(ch, { recursive: true, force: true });
  const q1 = pastIso(now, 0, '07:45'), a1 = pastIso(now, 0, '07:46');
  writeJson(path.join(ch, 'demo-q1.json'), { at: q1, from: 'itzik', id: 'demo-q1', text: 'מה יש לי היום?', status: 'done', ackAt: q1 });
  writeJson(path.join(ch, 'demo-a1.json'), { at: a1, from: 'claude', re: 'demo-q1', text: brief(now) });
  more(dataPath, now);
  return { clients: CLIENTS.length, events: events(now).length, leads: LEADS.length };
}

/*
  19.11.2026, Itzik: "שמוניטור ההדגמה ידגים הכל, שיהיה לו את הריח של כל הדברים שהמוניטור יכול לעשות, גם התוספות בתשלום".
  Everything below is what a paying customer with every add-on sees, invented for the barbershop:
  meeting summaries, the money view (bank, debtors, forecast), the accounting documents, the bank lines with the
  payments they matched, Instagram and Facebook messages with a suggested reply, a signed quote, a campaign draft
  and its daily numbers, content ideas, YouTube comments, the control board, personal mode, a reel ready to upload,
  and the morning numbers. Names, phones and mails are invented (050 000, example.com).
*/
const MEETINGS = [
  { d: -1, hh: '13:00', title: 'פגישה עם ספק מוצרי שיער', client: 'ספק מוצרי שיער', people: ['רועי', 'נציג הספק'],
    summary: 'סיכמנו מחירון חדש לשנה הבאה: ווקס מאט יורד ל 28 ₪ ליחידה בהזמנה של 12 ומעלה. שמפו לזקן נשאר באותו מחיר. משלוח חינם מעל 600 ₪.',
    decisions: ['הזמנה קבועה של 12 ווקס פעם בחודש', 'לנסות את שמן הזקן החדש, 6 יחידות במבצע השקה'],
    tasksMe: ['לאשר את ההזמנה הקבועה עד יום ראשון', 'לשים את שמן הזקן ליד הקופה'], tasksClient: ['לשלוח מחירון מעודכן ב PDF'],
    next: 'שיחה קצרה בעוד חודש, לראות איך שמן הזקן נמכר' },
  { d: -2, hh: '19:30', title: 'שיחה עם טל גולן על החתונה', client: 'טל גולן', people: ['רועי', 'טל גולן'],
    summary: 'טל רוצה את כל החבילה בבית, בבוקר החתונה, עם 5 מלווים במקום 4. ביקש שהאבא יהיה ראשון כי הוא צריך לצאת מוקדם.',
    decisions: ['5 מלווים, 70 ₪ לכל אחד', 'הגעה הביתה ב 08:00, תוספת 200 ₪', 'מקדמה 100 ₪ בחתימה על ההצעה'],
    tasksMe: ['לעדכן את ההצעה ל 5 מלווים ולשלוח לחתימה', 'לחסום ביומן את בוקר החתונה 07:30 עד 11:00'], tasksClient: ['לשלוח כתובת מדויקת וחניה'],
    next: 'ניסיון לחתן היום ב 18:00 במספרה' },
  { d: -6, hh: '10:00', title: 'פגישה עם רואה החשבון', client: 'רואה החשבון', people: ['רועי', 'רואה החשבון'],
    summary: 'עברנו על הרבעון. ההכנסות עלו ב 11 אחוז, ההוצאות על מוצרים עלו ב 6 אחוז. חסרות 3 קבלות מאוקטובר. כדאי לפתוח קופת גמל לעצמאי עד סוף השנה.',
    decisions: ['להעביר את כל הקבלות דרך המוניטור, ישר להנהלת החשבונות', 'לבדוק קופת גמל לעצמאי עד 31.12'],
    tasksMe: ['לשלוח 3 קבלות מאוקטובר', 'לקבוע שיחה עם סוכן פנסיה'], tasksClient: ['להכין דוח רווח והפסד לרבעון'],
    next: 'פגישה הבאה בתחילת ינואר' },
];
function meetings(now) {
  return MEETINGS.map((m, i) => ({ id: 'mdemo' + i, src: 'fireflies', title: m.title, at: iso(now, m.d, m.hh), clientId: '', client: m.client,
    people: m.people, summary: m.summary, decisions: m.decisions, tasksClient: m.tasksClient, tasksMe: m.tasksMe, next: m.next, keywords: [] }));
}

// The bank, read only: the last lines, and which invoice each payment closed.
const BANK = [
  [0, '08:12', 'העברה מגיא רוזן', 210, 'סגר חשבונית 3051'], [0, '07:40', 'ביט מאבי לוי', 80, 'סגר קבלה על התספורת של אתמול'],
  [-1, '18:30', 'הפקדת מזומן', 1240, 'קופת היום'], [-1, '12:05', 'ספק מוצרי שיער', -612, 'חשבונית ספק 8841, תואמת להזמנה'],
  [-2, '09:00', 'שכירות המספרה', -4200, 'הוראת קבע'], [-3, '16:20', 'סליקת אשראי', 2180, '24 עסקאות'],
  [-4, '10:00', 'חברת החשמל', -386, 'קבלה נשמרה להנהלת החשבונות'], [-5, '11:30', 'העברה מטל גולן', 100, 'מקדמה על חבילת החתן'],
];
const DOCS = [
  ['חשבונית מס', '3052', 'משה דהן', 460, 'נשלחה, מחכה לתשלום'], ['חשבונית מס', '3051', 'גיא רוזן', 210, 'שולמה היום, נסגרה מול הבנק'],
  ['קבלה', '7120', 'אבי לוי', 80, 'הופקה אוטומטית מהביט'], ['קבלה', '7119', 'טל גולן', 100, 'מקדמה על חבילת החתן'],
  ['תעודת משלוח', '412', 'ספק מוצרי שיער', 612, 'נקלטה מהמייל, תואמת להזמנה'], ['חשבונית ספק', '8841', 'ספק מוצרי שיער', 612, 'שולמה אתמול'],
];
const DEBTORS = [['משה דהן', 460, 4], ['דניאל כהן', 330, 38], ['רון פרץ', 240, 51], ['אלי ביטון', 110, 64]];
function ilDate(now, plus) { const [y, m, d] = ilDay(now, plus).split('-'); return d + '/' + m + '/' + y; }
function shekel(n) { return (n < 0 ? 'מינוס ' : '') + Math.abs(n).toLocaleString('he-IL') + ' ₪'; }

function more(dataPath, now) {
  const W = (rel, o) => writeJson(path.join(dataPath, rel), o);
  const day = (d) => ilDay(now, d);
  // 🎙️ the meeting summaries tile needs a Fireflies key; a placeholder, the demo never calls Fireflies
  W('keys.json', { firefliesKey: 'demo-not-a-real-key' });
  // 💰 the money view on the home screen (money.js format)
  W('money/money.json', { at: pastIso(now, 0, '07:00'), cash: 23480, debt: DEBTORS.reduce((a, x) => a + x[1], 0), late: DEBTORS.filter((x) => x[2] > 30).reduce((a, x) => a + x[1], 0),
    forecast90: [23480, 24900, 22100, 25600, 27300, 26800, 29400], anomalies: [{ t: 'חיוב כפול אפשרי', sub: 'ספק מוצרי שיער חייב 612 ₪ פעמיים בשבועיים. כדאי לבדוק מולו.' }] });
  // debtors for the morning brief, given to it directly below. Never as data/rivhit: build.js then makes the owner's
  // open accounts PDF (lib/lolos-share.js) with Chrome.
  fs.rmSync(path.join(dataPath, 'rivhit'), { recursive: true, force: true });
  const debts = DEBTORS.map(([name, amount, ago]) => ({ kind: 'debt', name, amount, inv: [{ date: ilDate(now, -ago), amount }] }));
  // 📦 actions used this month, for the package tile
  const days = Number(day(0).slice(8, 10));
  fs.mkdirSync(path.join(dataPath, 'status'), { recursive: true });
  fs.writeFileSync(path.join(dataPath, 'status', 'usage.jsonl'), Array.from({ length: days }, (_, i) => JSON.stringify({ at: pastIso(now, -i, '12:00'), msgs: 14 + (i * 7) % 11, usd: 0 })).join('\n') + '\n');
  // 🎛️ the control board
  W('board-prefs.json', { report: { show: true }, updates: { google: true, manager: true, max: 8 }, rows: [{ id: 'tt', ic: '🎵', n: 'טיקטוק' }],
    plan: [
      { row: 'mp', date: day(0), time: '19:00', title: 'פוסט: לפני ואחרי של עומר', state: 'will' },
      { row: 'ms', date: day(0), time: '12:30', title: 'סטורי: הקפה של הבוקר במספרה', state: 'ok' },
      { row: 'mr', date: day(1), time: '18:00', title: 'ריל: פייד ב 60 שניות', state: 'hand' },
      { row: 'mp', date: day(2), time: '10:00', title: 'פוסט: מבצע חנוכה, תספורת וזקן ב 95', state: 'wait' },
      { row: 'tt', date: day(1), time: '20:00', title: 'טיקטוק: טיפ לטיפוח זקן', state: 'will' },
      { row: 'mr', date: day(-1), time: '18:00', title: 'ריל: תספורת ילד ראשונה', state: 'ok' },
    ] });
  // 💡 content ideas
  const idd = path.join(dataPath, 'ideas', 'ideas');
  fs.rmSync(idd, { recursive: true, force: true });
  [['ריל: שלוש טעויות בטיפוח זקן, כל אחת ב 5 שניות', 'instagram', 0.3], ['סטורי: סקר, פייד גבוה או נמוך?', 'instagram', 1], ['טיקטוק: תספורת אב ובן, לפני ואחרי', 'tiktok', 2],
    ['פוסט: למה כדאי להגיע לתספורת כל 3 שבועות', 'facebook', 4]].forEach(([text, network, ago], i) =>
    W('ideas/ideas/demo-idea-' + i + '.json', { id: 'demo-idea-' + i, at: new Date(now - ago * 864e5).toISOString(), text, network, used: false }));
  // ▶️ YouTube comments
  W('yt/channel.json', { input: '@roi-barber-demo', title: 'מספרת רועי', id: 'UCdemo', at: pastIso(now, -20, '10:00') });
  W('yt/comments.json', { at: pastIso(now, 0, '07:00'), items: [
    { id: 'y1', at: pastIso(now, 0, '06:40'), author: 'נדב', text: 'איזה מכונה אתה משתמש לפייד? ויש לכם תורים בשישי?', video: 'v1', vtitle: 'פייד ב 60 שניות', replies: 0, likes: 3, q: true, lead: true, url: '' },
    { id: 'y2', at: pastIso(now, -1, '21:10'), author: 'יואב', text: 'הכי מסודר שראיתי. כמה זמן לוקחת תספורת כזו?', video: 'v1', vtitle: 'פייד ב 60 שניות', replies: 0, likes: 5, q: true, lead: false, url: '' },
    { id: 'y3', at: pastIso(now, -3, '15:00'), author: 'עמית', text: 'אחלה טיפ על השמן לזקן', video: 'v2', vtitle: 'טיפוח זקן בבית', replies: 1, likes: 2, q: false, lead: false, url: '' },
  ] });
  // 🏡 personal mode, his own life next to the business (only he sees it)
  W('personal/state.json', { chosen: true, picked: ['doctor', 'dates', 'bills', 'kidsSchool'], order: [], extra: [], at: pastIso(now, -5, '21:00'),
    notes: { dates: 'יום הולדת לאמא בעוד שבועיים, להזמין עוגה', bills: 'ארנונה לתשלום עד סוף החודש' } });
  W('personal/items.json', [
    { id: 'ipd1', k: 'doctor', line: 'רופא שיניים, ביקורת', when: day(6) + ' 08:30', src: 'mail', ref: 'demo1', at: pastIso(now, -2, '09:00') },
    { id: 'ipd2', k: 'dates', line: 'יום הולדת לאמא', when: day(13), src: 'mail', ref: 'demo2', at: pastIso(now, -2, '09:00') },
    { id: 'ipd3', k: 'bills', line: 'ארנונה, 1,180 ₪', when: day(9), src: 'mail', ref: 'demo3', at: pastIso(now, -1, '09:00') },
    { id: 'ipd4', k: 'kidsSchool', line: 'אסיפת הורים בגן', when: day(3) + ' 18:00', src: 'mail', ref: 'demo4', at: pastIso(now, -1, '09:00') },
  ]);
  // 🎁 a reel ready to upload (the file itself is a placeholder; the demo page answers its buttons)
  fs.rmSync(path.join(dataPath, 'ready'), { recursive: true, force: true });
  W('ready/demo-reel-fade.json', { at: pastIso(now, 0, '06:30'), title: 'ריל: פייד ב 60 שניות, עם כתוביות ומוזיקה', files: ['demo-reel-fade.mp4'] });
  fs.mkdirSync(path.join(dataPath, 'files-private'), { recursive: true });
  fs.writeFileSync(path.join(dataPath, 'files-private', 'demo-reel-fade.mp4'), '');

  // 📄 reports: accounting documents, the bank, the campaign of yesterday, the campaign draft, a meeting
  const rp = (id, d, hh, title, body, network) => W('reports/reports/' + id + '.json', Object.assign({ at: pastIso(now, d, hh), title, body }, network ? { network } : {}));
  rp('demo-acc', 0, '07:10', 'הנהלת חשבונות: מסמכים מהשבוע', [
    'החיבור לחשבונית ירוקה פעיל, קריאה בלבד. אלה המסמכים של השבוע:', '',
    ...DOCS.map(([k, no, who, sum, st]) => '• ' + k + ' ' + no + ', ' + who + ', ' + shekel(sum) + ': ' + st),
    '', 'חסרות לרואה החשבון 3 קבלות מאוקטובר: חשמל, ספק המוצרים והשכירות. מצאתי את שתיים מהן במייל והעברתי. השכירות עוד חסרה.'].join('\n'));
  rp('demo-bank', 0, '07:05', 'הבנק: תנועות ותשלומים שהתאמתי', [
    'חיבור לבנק בקריאה בלבד. יתרה הבוקר: 23,480 ₪.', '',
    ...BANK.map(([d, hh, what, sum, note]) => '• ' + ilDate(now, d).slice(0, 5) + ' ' + hh + ' ' + what + ': ' + shekel(sum) + ' (' + note + ')'),
    '', 'חייבים: ' + DEBTORS.map(([n, a, ago]) => n + ' ' + shekel(a) + ' (' + ago + ' ימים)').join(', ') + '.',
    'שלושה מהם מעל 30 יום. הכנתי לכל אחד תזכורת תשלום עדינה, היא מחכה ב 📤 הודעות לשליחה.'].join('\n'));
  rp('demo-ads', 0, '07:00', 'הקמפיינים אתמול', [
    'תור היום בערב | רמת גן: 28 ₪ הוצאה, 2 לידים, 21.8 ₪ לליד. הכי טוב השבוע.',
    'חבילת חתן: 19 ₪ הוצאה, ליד אחד (משה דהן), 4 הודעות.',
    'תספורת ראשונה לילדים: מושהה.', '',
    'המלצה: להעביר 10 ₪ ליום מחבילת החתן לתור היום בערב. כתוב "מאשר" ואעשה את זה.'].join('\n'), 'facebook');
  rp('demo-camp', -1, '16:20', 'טיוטת קמפיין: מבצע חנוכה', [
    'כותרת: תספורת וזקן ב 95 ₪, רק בבקרים של חנוכה',
    'טקסט: 8 בקרים, 8 תורים בכל בוקר. מי שמזמין עכשיו מקבל שמן זקן במתנה. לוחצים ומקבלים תור בוואטסאפ.',
    'קהל: גברים 20 עד 45, 5 ק״מ מהמספרה. תקציב: 25 ₪ ליום, 8 ימים.',
    'קריאייטיב: הסרטון של עומר, לפני ואחרי, 12 שניות, כתוביות בעברית.', '',
    'מחכה לאישור שלך. אחרי האישור הקמפיין עולה במודעות של פייסבוק ואינסטגרם, ואני שולח לך כל בוקר כמה הוצא וכמה לידים.'].join('\n'), 'instagram');
  rp('demo-meet', -1, '13:45', 'סיכום פגישה: ספק מוצרי שיער', [MEETINGS[0].summary, '', 'החלטות: ' + MEETINGS[0].decisions.join('; ') + '.',
    'משימות שלך (נכנסו ל ✅ משימות וליומן): ' + MEETINGS[0].tasksMe.join('; ') + '.'].join('\n'));

  // 💬 answers: Instagram and Facebook messages with a ready reply, a signed quote, the bank, a form
  const ch = (id, d, hh, text, extra) => W('chat/chat/' + id + '.json', Object.assign({ at: pastIso(now, d, hh), from: 'claude', status: 'done', id, text }, extra || {}));
  ch('demo-dm1', 0, '08:41', '📩 📸 אינסטגרם, מתן ש.: "יש תור היום בערב? צריך תספורת לפני חתונה של חבר"\n\nתשובה מוצעת:\nהיי מתן, יש לי היום ב 17:00. לשריין לך? תספורת 80 ₪, עם זקן 110 ₪.\n\nלהעתיק ולשלוח מ📸 אינסטגרם, או לכתוב לי מה לשנות.', { dm: 'demo1' });
  ch('demo-dm2', 0, '06:55', '📩 📘 פייסבוק, הילה: "אפשר לקנות שובר מתנה לבעלי ליום הולדת?"\n\nתשובה מוצעת:\nבטח הילה. שובר לתספורת וזקן 110 ₪, אפשר להעביר בביט ואני שולח שובר דיגיטלי עם השם שלו. לשלוח?\n\nלהעתיק ולשלוח מ📘 פייסבוק, או לכתוב לי מה לשנות.', { dm: 'demo2' });
  ch('demo-sign', -1, '20:14', '✍️ גיא רוזן חתם על הצעה 1006 (מנוי 3 תספורות בחודש, 210 ₪). ההצעה החתומה נשמרה ב PDF בתיקייה שלו, והוצאתי לו חשבונית 3051. הוא כבר שילם.');
  ch('demo-sign2', 0, '09:20', '👀 משה דהן פתח את הצעה 1008 (חבילת חתן, 460 ₪) פעמיים מאתמול ועוד לא חתם. כדאי לחזור אליו היום. הכנתי הודעה קצרה, היא ב 📤.');
  ch('demo-form', 0, '10:05', '📝 טופס "שאלון לחתן" מולא עכשיו ע״י טל גולן: 5 מלווים, הגעה ב 08:00, האבא ראשון. הוספתי לכרטיס שלו ולסיכום הפגישה. הטופס נפתח 3 פעמים, מולא פעם אחת.');

  // 📤 payment reminders and the follow up, ready to send one by one from his own WhatsApp
  const sid = ilDay(now, 0).replace(/-/g, '') + '-0710-demo-pay';
  W('sendlist/sendlist/' + sid + '.json', { id: sid, at: at(now, 0, '07:10'), title: 'תזכורות תשלום ומעקב', note: 'מהבנק ומהנהלת החשבונות, אתה שולח מהוואטסאפ שלך',
    items: DEBTORS.filter((x) => x[2] > 30).map(([n, a]) => ({ name: n, phone: '0500000000', text: 'היי ' + n.split(' ')[0] + ', רק תזכורת קטנה: נשארו ' + a + ' ₪ מהתספורות האחרונות. אפשר בביט למספר של המספרה. תודה!' }))
      .concat([{ name: 'משה דהן', phone: '0500000000', text: 'היי משה, ראיתי שפתחת את ההצעה לחבילת החתן. יש שאלה? אשמח לשריין לכם את הבוקר.' }]) });
  // ☀️ the morning numbers on the home card (lib/brief.js), today and the six days before (the small lines)
  const B = require('./brief.js');
  const bd = path.join(dataPath, 'brief', 'brief');
  fs.rmSync(bd, { recursive: true, force: true });
  const busy = TODAY.filter((x) => x[2]).length;
  for (let d = 6; d >= 0; d--) {
    const at = now - d * 864e5;
    const inp = Object.assign(B.gather(dataPath, at), { features: { money: true }, debts });
    const doc = B.buildBrief(inp);
    doc.kpis.forEach((k) => {
      if (k.k === 'תורים היום') k.v = d === 0 ? busy : 6 + (d * 3) % 4;
      if (k.k === 'מזומן') k.v = 23480 - d * 640 + (d % 2) * 900;
    });
    doc.kpis.forEach((k) => { if (Array.isArray(k.spark)) k.spark[k.spark.length - 1] = k.v; });
    W('brief/brief/' + ilDay(at, 0).replace(/-/g, '') + '.json', doc);
  }
}

function brief(now) {
  const busy = TODAY.filter((x) => x[2]);
  return [
    'בוקר טוב רועי.',
    '',
    'היום ' + busy.length + ' תורים, הראשון ב 09:00 (אבי לוי) והאחרון ב 18:00 (ניסיון לטל גולן, החתן).',
    'יש שני חלונות פנויים: 11:00 ו 17:00.',
    '',
    'לידים: 3 חדשים. מתן מאינסטגרם רוצה תור היום בערב, אפשר להציע לו את 17:00.',
    'שירן שאלה בוואטסאפ כמה עולה תספורת לילד, ובן מטיקטוק שאל על פייד.',
    '',
    'לחזור אליו: אלי ביטון לא הגיע 7 שבועות.',
    'במייל: טל גולן רוצה מלווה חמישי והגעה הביתה. הכנתי לו תשובה.',
    '',
    'כסף: בבנק 23,480 ₪. גיא רוזן שילם 210 ₪ הבוקר. שלושה חייבים מעל 30 יום, תזכורות מוכנות ב 📤.',
    'משה דהן פתח את הצעת החתן פעמיים ועוד לא חתם.',
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
  // 19.11.2026: the add-ons and the screens the demo now shows, so the chat answers about them too
  l.push('החבילה: Medium, 1,000 פעולות בחודש. תוספות פעילות: חיבור לבנק בקריאה בלבד, הנהלת חשבונות (חשבונית ירוקה). מחוברים גם: וואטסאפ, גוגל, פייסבוק ואינסטגרם, פיירפליס, יוטיוב.');
  l.push('הבנק (קריאה בלבד): יתרה 23,480 ₪. תנועות אחרונות: ' + BANK.map(([d, hh, w, s, n]) => (d === 0 ? 'היום' : d === -1 ? 'אתמול' : 'לפני ' + (-d) + ' ימים') + ' ' + w + ' ' + s + ' ₪ (' + n + ')').join('; ') + '.');
  l.push('חייבים: ' + DEBTORS.map(([n, a, ago]) => n + ' ' + a + ' ₪ מלפני ' + ago + ' ימים').join('; ') + '. תזכורות תשלום מוכנות ב 📤 הודעות לשליחה. תחזית 90 יום: כ 29,400 ₪ בבנק.');
  l.push('מסמכים בהנהלת החשבונות השבוע: ' + DOCS.map(([k, no, w, s, st]) => k + ' ' + no + ' ' + w + ' ' + s + ' ₪, ' + st).join('; ') + '.');
  l.push('סיכומי פגישות (פיירפליס): ' + MEETINGS.map((m) => m.title + ': ' + m.summary + ' החלטות: ' + m.decisions.join(', ') + '. משימות: ' + m.tasksMe.join(', ')).join(' | '));
  l.push('הצעות מחיר: 1007 טל גולן חבילת חתן; 1008 משה דהן חבילת חתן ל 5, 460 ₪, נשלחה לחתימה דיגיטלית ונפתחה פעמיים בלי חתימה; 1006 גיא רוזן מנוי 3 תספורות 210 ₪, נחתמה ושולמה.');
  l.push('הודעות ברשתות עם תשובה מוצעת: מתן באינסטגרם (תור הערב, הוצע 17:00), הילה בפייסבוק (שובר מתנה 110 ₪). ביוטיוב שאלו איזו מכונה לפייד ואם יש תורים בשישי.');
  l.push('קמפיינים: טיוטת מבצע חנוכה (תספורת וזקן 95 ₪ בבקרים, 25 ₪ ליום, 8 ימים) מחכה לאישור. אתמול: תור היום בערב 28 ₪ ו 2 לידים, חבילת חתן 19 ₪ וליד אחד.');
  l.push('תוכן מתוכנן: היום 19:00 פוסט לפני ואחרי של עומר; מחר 18:00 ריל פייד ב 60 שניות (מוכן להעלאה); בעוד יומיים פוסט מבצע חנוכה מחכה לאישור.');
  l.push('מצב אישי (רק רועי רואה): רופא שיניים בעוד 6 ימים 08:30, אסיפת הורים בגן בעוד 3 ימים 18:00, ארנונה 1,180 ₪ בעוד 9 ימים, יום הולדת לאמא בעוד 13 ימים.');
  return l.join('\n');
}

// 21.11.2026: the helpers are shared with the trade demos (lib/demo-trades/<id>.js).
module.exports = { BIZ, seed, context, brief, ilDay, ilOff, at, iso, pastIso, addMin, writeJson, ilDate, shekel };

if (require.main === module) {
  const dp = process.argv[2];
  if (!dp) { console.error('usage: node lib/demo-data.js <dataPath>'); process.exit(1); }
  // 21.11.2026: --trade <id> seeds that trade demo instead of the barbershop
  const ti = process.argv.indexOf("--trade"), trade = ti > -1 ? String(process.argv[ti + 1] || "").replace(/[^a-z]/g, "") : "";
  console.log(JSON.stringify(trade ? require("./demo-trades/" + trade + ".js").seed(dp) : seed(dp)));
}
