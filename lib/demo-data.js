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
  writeJson(path.join(bh, 'meetings.json'), []);
  writeJson(path.join(bh, 'mail.json'), MAIL.map((m, i) => ({ id: 'm' + i, at: iso(now, -m.ago, m.hh), from: m.from, subject: m.subject, text: m.text, tag: m.tag, reply: m.reply || '' })));
  writeJson(path.join(bh, 'quotes.json'), [{ id: 'q1', at: new Date(now - 2 * 864e5).toISOString(), no: '1007', client: 'טל גולן', subject: 'חבילת חתן', items: [['תספורת וזקן לחתן', 1, 180], ['תספורת למלווה', 4, 70], ['הגעה עד הבית בבוקר החתונה', 1, 200]], terms: 'מקדמה 100 ₪ בקביעת התאריך', valid: '14 יום' }]);
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
  writeJson(path.join(dataPath, 'status', 'features.json'), { wa: true });
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
