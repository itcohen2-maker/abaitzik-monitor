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
  // 12.11.2026: the longer questionnaire adds two more pains.
  tasks: ['✅', 'משימות שנופלות בין הכיסאות', 'כותבים לי כל משימה ברגע שהיא עולה, ואני מסדר לפי ימים ומזכיר עד שסימנת בוצע.'],
  suppliers: ['📦', 'חשבוניות ספקים והוצאות', 'מעלים לי חשבונית או צילום, ואני שומר, מסכם כל חודש ותופס חיוב כפול.'],
};
// 12.11.2026, Itzik: "הטופס ממש דל, צריך להאריך אותו ואולי גם משהו אישי". The longer questionnaire, one question a screen.
const TEAM = { solo: 'רק אני', small: '2 עד 5', big: '6 ומעלה' };
const FROM = { wa: 'וואטסאפ', phone: 'טלפון', site: 'האתר', social: 'אינסטגרם ופייסבוק', refer: 'המלצות' };
const TOOLS = { head: 'בראש', paper: 'מחברת', excel: 'אקסל', soft: 'תוכנה או CRM', acct: 'תוכנת הנהלת חשבונות' };
const START = { '06': '06:00', '07': '07:00', '08': '08:00', '09': '09:00' };
const STYLE = { short: 'קצר ולעניין', full: 'מפורט, עם הסבר' };
const pick = (arr, map, max) => [...new Set((Array.isArray(arr) ? arr : []).filter((x) => map[x]))].slice(0, max);
function personalMap() { const m = {}; require('./personal.js').CATALOG.forEach((c) => { m[c.k] = c; }); return m; }
const TALK = { text: 'כתיבה', voice: 'הקלטה', wa: 'וואטסאפ' };
const CONNECT = { google: 'גוגל', microsoft: 'מיקרוסופט', later: 'אחר כך' };

function clean(s, n) { return String(s == null ? '' : s).replace(/[<>\u0000-\u001f‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }

// Returns the cleaned answers, or null when nothing usable came.
function sanitize(a) {
  if (!a || typeof a !== 'object') return null;
  const out = {
    biz: BIZ[a.biz] ? a.biz : '',
    pains: [...new Set((Array.isArray(a.pains) ? a.pains : []).filter((p) => PAINS[p]))].slice(0, 3),
    team: TEAM[a.team] ? a.team : '',
    from: pick(a.from, FROM, 5),
    tools: pick(a.tools, TOOLS, 5),
    start: START[a.start] ? a.start : '',
    personal: pick(a.personal, personalMap(), 12),
    style: STYLE[a.style] ? a.style : '',
    talk: TALK[a.talk] ? a.talk : '',
    bizName: clean(a.bizName, 60),
    wish: clean(a.wish, 300),
    connect: CONNECT[a.connect] ? a.connect : '',
    // 11.11: the mobile his WhatsApp is on, asked only when he chose WhatsApp (lib/wa-tenants.js maps it to his monitor).
    waPhone: a.talk === 'wa' ? require('./wa-tenants.js').norm(a.waPhone) : '',
  };
  return (out.biz || out.pains.length || out.talk || out.bizName || out.wish || out.connect || out.team || out.from.length
    || out.tools.length || out.start || out.personal.length || out.style) ? out : null;
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
    // 12.11.2026, Itzik: "שימחקו בעצמם את הג׳ימייל. אנחנו נגיד שאנחנו לא מוחקים מהג׳ימייל" (a delete permission would risk the Google review).
    if (/מייל|ג׳?ימייל|דואר/.test(p.wish) && /לנקות|ניקוי|למחוק|מחיקה|לארכב|ארכיון|ספאם|להעיף/.test(p.wish)) {
      L.push('אני לא מוחק מיילים מהג׳ימייל שלך, המחיקה תמיד נשארת אצלך. מה שאני כן עושה: אחרי חיבור הג׳ימייל (🔌) אני ממיין כל מייל לדחוף, חשוב או פרסומת, ומראה לך מאיזה שולחים מגיעות הכי הרבה פרסומות. ככה מוחקים אותן בג׳ימייל בכמה לחיצות.');
    } else
    L.push('כתוב לי את זה בתיבה במסך הבית, ואני מתחיל. זו הפעולה הראשונה שלך מתוך ה 40 של שבוע הניסיון.');
  }
  L.push('');
  if (p.talk === 'voice') L.push('איך לדבר איתי: לוחצים על המיקרופון במסך הבית ומדברים בעברית, כמו להקליט הודעה.');
  else if (p.talk === 'wa' && p.waPhone) {
    L.push('איך לדבר איתי: בוואטסאפ, מהמספר שנתת. כותבים, מקליטים או מעבירים לי הודעה של לקוח, והיא נכנסת לכאן.');
    L.push('את הוואטסאפ אנחנו פותחים לך בימים הקרובים, ותקבל הודעה כשהוא מוכן. עד אז כותבים בתיבה במסך הבית.');
  }
  else if (p.talk === 'wa') L.push('איך לדבר איתי: אפשר לכתוב במסך הבית כבר עכשיו. את הוואטסאפ נחבר יחד, כתוב לי "וואטסאפ" ונסדר.');
  else L.push('איך לדבר איתי: כותבים בתיבה במסך הבית, משפט רגיל, בלי פקודות.');
  if (p.connect !== 'google' && p.connect !== 'microsoft') L.push('עוד לא חיברת את המייל והיומן? לוחצים על 🔌 חיבורים, זה לוקח דקה.');
  if (p.start) L.push('כל בוקר ב ' + START[p.start] + ' תקבל ממני תזכורת לפתוח את המוניטור ולראות מה יש לך היום.');
  if (p.personal && p.personal.length) {
    const m = personalMap();
    L.push('');
    L.push('🏡 המצב האישי שלך כבר מוכן, עם: ' + p.personal.map((k) => m[k].t).join(', ') + '. לוחצים על העיגול 🏡 מצב אישי. תמיד אפשר לשנות.');
  }
  if (p.style === 'short') L.push('ביקשת תשובות קצרות ולעניין. ככה אני עונה.');
  else if (p.style === 'full') L.push('ביקשת תשובות מפורטות עם הסבר. ככה אני עונה.');
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
  if (p.talk) L.push('איך נוח לו לדבר: ' + TALK[p.talk] + (p.waPhone ? ' (' + p.waPhone + ')' : ''));
  if (p.wish) L.push('ביקש שיעשה בשבילו השבוע: ' + p.wish);
  if (p.connect) L.push('חיבור מייל ויומן: ' + CONNECT[p.connect]);
  if (p.team) L.push('כמה בעסק: ' + TEAM[p.team]);
  if (p.from && p.from.length) L.push('מאיפה מגיעים לקוחות: ' + p.from.map((k) => FROM[k]).join(', '));
  if (p.tools && p.tools.length) L.push('איפה הוא מנהל היום: ' + p.tools.map((k) => TOOLS[k]).join(', '));
  if (p.start) L.push('היום שלו מתחיל ב ' + START[p.start]);
  if (p.style) L.push('איך הוא רוצה תשובות: ' + STYLE[p.style] + '. לענות לו בדיוק כך.');
  if (p.personal && p.personal.length) { const m = personalMap(); L.push('המצב האישי: ' + p.personal.map((k) => m[k].t).join(', ')); }
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

module.exports = { BIZ, PAINS, TALK, CONNECT, TEAM, FROM, TOOLS, START, STYLE, sanitize, welcome, profileSection, summaryLine };
