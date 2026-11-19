'use strict';
/*
  12.11.2026: the campaign sheet's interviewer. Before a campaign request goes to the worker, the customer is asked
  for as much as possible: what it is for, who the audience is, the offer, what to write, how people reach the
  business. The page sends what is known so far (kinds, the text with earlier answers, file names); a short Haiku
  call returns up to three questions, each with ready answers to tap, and says when there is enough for a good draft.
  19.11.2026, Itzik: "כל פעם שאלה אחת ... מאוד מתיש. אי אפשר לדעת כמה שאלות". Now one round: everything missing at once,
  up to six, and the page shows how many. Answering them all does not start another round.
  Runs on the customers' API key (lib/customer-env.js through sales-train forCustomer), never the owner subscription.
*/

const TOPICS = [
  'למה זה צריך לשמש: מכירה, פניות ולידים, הרשמה לאירוע או לקורס, מודעות לעסק חדש, החזרת לקוחות ישנים',
  'קהל היעד: מי הם (גיל, מין, מקצוע או מצב), איפה הם גרים או עובדים, מה מעניין אותם, מה הבעיה שלהם',
  'מה מוכרים או מציעים כאן בדיוק, ומה מיוחד בזה לעומת אחרים',
  'מבצע, מחיר, תאריך או מועד אחרון, אם יש',
  'מה לכתוב על התמונות או בכיתוב: המסר הראשי במשפט אחד',
  'איך פונים: טלפון, וואטסאפ, קישור, כתובת או הודעה פרטית',
  'טון: רציני, חם, מצחיק, יוקרתי',
  'במודעה ממומנת: אזור גאוגרפי ותקציב יומי משוער',
];

function system(business) {
  return [
    'אתה עוזר שמראיין בעל עסק קטן בישראל לפני שמכינים לו קמפיין ברשתות. המטרה: להוציא ממנו כמה שיותר מידע והוראות, כדי שהטיוטה תתאים בדיוק.',
    'העסק: ' + (business || 'לא ידוע, ואם זה חסר שאל קודם מה העסק עושה') + '.',
    // 19.11.2026, the end to end check: with no business known it offered "מספרה" and "מסעדה" as answers, the test
    // customer tapped one, and the draft came out for a business he does not have. And it asked what "לא נבחר" meant.
    'אם העסק לא ידוע: התשובות לדוגמה לשאלה מה העסק עושה הן כלליות (מוצרים, שירות, אוכל ושתייה, משהו אחר), לא ניחוש של סוג עסק מסוים.',
    '"מה לעשות: לא נבחר" פירושו שהלקוח עוד לא בחר סוג תוצר. אל תשאל עליו ואל תזכיר את המילים האלה.',
    'הנושאים לפי סדר חשיבות:',
    TOPICS.map((t, i) => (i + 1) + '. ' + t).join('\n'),
    'קרא מה כבר ידוע. שאל בבת אחת על כל מה שחסר או לא ברור, בסבב אחד בלבד, הכי חשוב קודם, עד 6 שאלות. אל תשאיר שום שאלה לסבב הבא: אחרי הסבב הזה לא שואלים יותר. אם חסר רק מעט, שאל רק מעט. שאלה קצרה, בגובה העיניים, בלשון זכר או ניטרלית.',
    'לכל שאלה תן 3 או 4 תשובות קצרות לדוגמה שמתאימות לעסק הזה ולמה שכבר נאמר, כדי שאפשר יהיה ללחוץ במקום להקליד. לא להמציא עובדות על העסק בתוך התשובות לדוגמה: הן אפשרויות, לא קביעות.',
    'ready=true רק כשידועים לפחות: למה זה ישמש, מי הקהל, מה ההצעה, ואיך פונים. אז questions ריק.',
    'בלי מקפים מכל סוג, בלי אימוג׳י. עברית.',
    'החזר JSON בלבד, בלי שום טקסט סביבו, בצורה הזו:',
    '{"ready":false,"note":"משפט אחד: מה עוד חסר כדי שהקמפיין ייצא טוב","questions":[{"q":"שאלה","opts":["תשובה","תשובה","תשובה"]}]}',
  ].join('\n');
}

function input(b) {
  const kinds = Array.isArray(b.kinds) ? b.kinds.map(String).slice(0, 8) : [];
  const files = Array.isArray(b.files) ? b.files.map(String).slice(0, 20) : [];
  const text = String(b.text || '').slice(0, 3000);
  return [
    // 19.11.2026: no kind chosen is said by leaving the line out; the words "לא נבחר" made it ask about a campaign that was not chosen.
    kinds.length ? 'מה לעשות: ' + kinds.join(', ') : '',
    'קבצים: ' + (files.length ? files.length + ' (' + files.join(', ') + ')' : 'אין'),
    'מה הלקוח כתב וענה עד עכשיו:',
    text.trim() || '(כלום עדיין)',
  ].join('\n');
}

function parse(out) {
  const s = String(out || '');
  const a = s.indexOf('{'), z = s.lastIndexOf('}');
  if (a < 0 || z <= a) return null;
  let j; try { j = JSON.parse(s.slice(a, z + 1)); } catch (e) { return null; }
  const clean = (x, n) => String(x || '').replace(/[‐-―-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const qs = (Array.isArray(j.questions) ? j.questions : []).slice(0, 6).map((q) => ({
    q: clean(q && q.q, 140),
    opts: (Array.isArray(q && q.opts) ? q.opts : []).slice(0, 4).map((o) => clean(o, 60)).filter(Boolean),
  })).filter((q) => q.q);
  return { ready: !!j.ready, note: clean(j.note, 200), questions: qs };
}

// A small daily cap per monitor, so a stuck button cannot run up the customers' key.
const CAP = 60;
const used = new Map();
function allow(name, now) {
  const day = new Date(now || Date.now()).toISOString().slice(0, 10);
  const k = day + '|' + name;
  const n = used.get(k) || 0;
  if (n >= CAP) return false;
  used.set(k, n + 1);
  if (used.size > 500) for (const key of used.keys()) if (!key.startsWith(day)) used.delete(key);
  return true;
}

async function ask(llm, body, opts) {
  const o = opts || {};
  if (!allow(o.name || '-')) return { status: 429, json: { error: 'cap' } };
  let out;
  try { out = await llm('haiku', system(o.business), input(body || {}), 45000); }
  catch (e) { return { status: 502, json: { error: 'llm' } }; }
  const r = parse(out);
  if (!r) return { status: 502, json: { error: 'parse' } };
  return { status: 200, json: r };
}

module.exports = { ask, parse, input, system, allow, TOPICS };
