'use strict';
/*
  11.11.2026, Itzik: "לפני שזה נפתח, שאלון אפיון שנוכל להתאים אותו יותר ... המשהו אישי הזה שיהיה רק בשבילו".
  While his trial monitor is built (about 3 minutes) the signup page asks five tap questions. This file is the pure
  part: clean the answers, and turn them into the personal welcome in his monitor and a section of his profile.md.
  No model: the welcome is written from the answers, so it costs nothing and never fails.
*/
const BIZ = { clinic: 'מטפל או קליניקה', service: 'נותן שירות', shop: 'חנות', office: 'יועץ או משרד', field: 'בעל מקצוע בשטח', other: 'אחר' };
const PAINS = {
  money: ['💰', 'לקוחות שלא משלמים', 'כותבים לי מי חייב וכמה, ואני עוקב, מזכיר לך ומכין לו הודעת תזכורת מנומסת.'],
  leads: ['🔔', 'לידים שהולכים לאיבוד', 'כל פנייה נרשמת אצלי ומחכה עד שטיפלת. כותבים "ליד חדש" עם שם וטלפון.'],
  quotes: ['🧾', 'הצעות מחיר', 'כותבים "הצעת מחיר ל..." עם הסכום, ואני מכין הצעה עם חתימה מהטלפון.'],
  cal: ['📅', 'יומן ותזכורות', 'כותבים "תזכיר לי..." ואני מזכיר בזמן, וכל בוקר מראה מה יש לך היום.'],
  mail: ['📧', 'מיילים', 'אחרי חיבור המייל אני ממיין את מה שנכנס ומכין טיוטות תשובה. אף מייל לא יוצא בלי אישור שלך.'],
  social: ['📣', 'שיווק ורשתות', 'מבקשים פוסט, רעיון לסרטון או נוסח למודעה, ואני מכין.'],
};
const TALK = { text: 'כתיבה', voice: 'הקלטה', wa: 'וואטסאפ' };
const CONNECT = { google: 'גוגל', microsoft: 'מיקרוסופט', later: 'אחר כך' };

function clean(s, n) { return String(s == null ? '' : s).replace(/[<>\u0000-\u001f‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }

// Returns the cleaned answers, or null when nothing usable came.
function sanitize(a) {
  if (!a || typeof a !== 'object') return null;
  const out = {
    biz: BIZ[a.biz] ? a.biz : '',
    pains: [...new Set((Array.isArray(a.pains) ? a.pains : []).filter((p) => PAINS[p]))].slice(0, 3),
    talk: TALK[a.talk] ? a.talk : '',
    bizName: clean(a.bizName, 60),
    wish: clean(a.wish, 300),
    connect: CONNECT[a.connect] ? a.connect : '',
  };
  return (out.biz || out.pains.length || out.talk || out.bizName || out.wish || out.connect) ? out : null;
}

// The first thing he sees in "תשובות": a plan for his week, from his own answers. Plain text, no dashes.
function welcome(name, p) {
  const nm = clean(name, 40) || 'שלום';
  const L = [];
  L.push('בניתי לך את המוניטור לפי מה שסיפרת' + (p.bizName ? ' על ' + p.bizName : '') + (p.biz && p.biz !== 'other' ? ' (' + BIZ[p.biz] + ')' : '') + '.');
  const pains = p.pains.length ? p.pains : ['cal', 'leads', 'quotes'];
  L.push('');
  L.push(p.pains.length ? 'מה שהכי מעיק עליך, ומה אני עושה עם זה השבוע:' : 'שלושה דברים להתחיל בהם השבוע:');
  pains.forEach((k, i) => { const x = PAINS[k]; L.push((i + 1) + '. ' + x[0] + ' ' + x[1] + ': ' + x[2]); });
  if (p.wish) {
    L.push('');
    L.push('ביקשת: "' + p.wish + '".');
    L.push('כתוב לי את זה בתיבה במסך הבית, ואני מתחיל. זו הפעולה הראשונה שלך מתוך ה 40 של שבוע הניסיון.');
  }
  L.push('');
  if (p.talk === 'voice') L.push('איך לדבר איתי: לוחצים על המיקרופון במסך הבית ומדברים בעברית, כמו להקליט הודעה.');
  else if (p.talk === 'wa') L.push('איך לדבר איתי: אפשר לכתוב במסך הבית כבר עכשיו. את הוואטסאפ נחבר יחד, כתוב לי "וואטסאפ" ונסדר.');
  else L.push('איך לדבר איתי: כותבים בתיבה במסך הבית, משפט רגיל, בלי פקודות.');
  if (p.connect !== 'google' && p.connect !== 'microsoft') L.push('עוד לא חיברת את המייל והיומן? לוחצים על 🔌 חיבורים, זה לוקח דקה.');
  L.push('');
  L.push('השיחה איתי ושלושת האימונים (מכירות, עסקי ואישי) בלי הגבלה, כל השבוע.');
  return { title: 'ברוך הבא, ' + nm + ': התוכנית שלך לשבוע', body: L.join('\n') };
}

// The section added to his profile.md, so every session that works for him knows who he is.
function profileSection(p) {
  const L = ['', '## מטופס האפיון בהרשמה'];
  if (p.bizName) L.push('שם העסק: ' + p.bizName);
  if (p.biz) L.push('סוג העסק: ' + BIZ[p.biz]);
  if (p.pains.length) L.push('מה הכי מעיק: ' + p.pains.map((k) => PAINS[k][1]).join(', '));
  if (p.talk) L.push('איך נוח לו לדבר: ' + TALK[p.talk]);
  if (p.wish) L.push('ביקש שיעשה בשבילו השבוע: ' + p.wish);
  if (p.connect) L.push('חיבור מייל ויומן: ' + CONNECT[p.connect]);
  return L.join('\n') + '\n';
}

// One line for Itzik's 📋 לטיפול, so he knows what interests him before he calls.
function summaryLine(name, p) {
  const bits = [];
  if (p.bizName || p.biz) bits.push((p.bizName ? p.bizName + ', ' : '') + (p.biz ? BIZ[p.biz] : ''));
  if (p.pains.length) bits.push('מעיק: ' + p.pains.map((k) => PAINS[k][1]).join(', '));
  if (p.wish) bits.push('ביקש: ' + p.wish.slice(0, 80));
  return 'אפיון של ' + clean(name, 40) + ': ' + (bits.join('. ') || 'בלי תשובות');
}

module.exports = { BIZ, PAINS, TALK, CONNECT, sanitize, welcome, profileSection, summaryLine };
