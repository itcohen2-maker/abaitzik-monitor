'use strict';
/*
  21.11.2026, Itzik: the monitor for service providers, a screen, words and colors per trade.
  One entry per trade. The trade demos (lib/demo-trades/<id>.js, setup/demo-build.sh <id>) are built from it,
  and the home screen shows its three cards (lib/trade-cards.js) only on a monitor whose instance.json has "trade".
  A monitor without "trade" is not touched by any of this.
*/
const TRADES = {
  gypsum: {
    id: 'gypsum',
    host: 'demo-gypsum.m.it-solution.co.il',
    label: 'קבלן גבס ושיפוצים',
    ribbon: 'הדגמה: קבלן גבס ושיפוצים, הנתונים מומצאים. השיחה עם המוניטור אמיתית.',
    accent: '#f08a24',
    words: { client: 'לקוח', job: 'עבודה', deposit: 'מקדמה', quote: 'הצעת מחיר', day: 'יום עבודה' },
    // 21.11.2026, Itzik approved "שעון היום": the day as a ring that is also the microphone. No money waiting on
    // the first screen ("להיכנס כל פעם ולראות את האדום כסף שמחכה, זה נורא מעצבן"): collection is one quiet line.
    dayOpen: 'gBhCal', debtOpen: 'gBhClients',
    // "מה עשיתי בשבילך", behind the side switch. On the demo: [colour g|b|y, title, line, action].
    did: [
      ['b', '3 הודעות מלקוחות', 'עניתי ושמרתי, אחת מחכה לך', 'לראות'],
      ['g', 'סידרתי את היומן', 'הוספתי את המדידה בנס ציונה', 'בוצע'],
      ['y', 'תזכורת לרונית כהן', 'על הצעה 2041, מחכה לאישור שלך', 'לשלוח'],
      ['g', 'שמרתי חשבונית ספק', 'לוחות גבס ופרופילים, 2,340 ₪', 'בוצע'],
    ],
    screens: ['gBhClients', 'gBhCal', 'gBhQuote', 'gRemind', 'gTasks'],
    // 21.11.2026: the three examples of the empty conversation on the desktop home (lib/trade-desk.js), written by hand.
    // Said to the monitor, so the imperatives stay masculine for every owner. An optional askF would replace them for a feminine owner.
    ask: ['תזכיר למשפחת לוי בנימוס על היתרה', 'תכין הצעת מחיר לתקרת גבס בסלון', 'מה מחכה לי היום?'],
    // 21.11.2026, Itzik: "ה WhatsApp זה חלק חשוב מאוד מהמוניטור ... זה חובה". The demo opens with a sample
    // conversation: [who, text], who is 'me' (the business owner) or 'mon' (the monitor). Invented, demo only.
    // The reminder goes out from his own WhatsApp with one tap: the monitor prepares it, it never sends alone.
    wa: [
      ['me', '🎤 הקלטה 0:09: "סיימתי אצל משפחת לוי, נשאר להם 4,800. תזכיר להם בנימוס."'],
      ['mon', 'הכנתי תזכורת בשם המשרד: "שלום משפחת לוי, תודה שבחרתם בנו. נשמח להסדרת היתרה, 4,800 ₪, עד סוף השבוע. דוד גבס ושיפוצים". לשלוח?'],
      ['me', 'כן'],
      ['mon', 'פתחתי לך את ההודעה, לחיצה אחת והיא אצלם. אם לא ישולם עד חמישי, אזכיר לך.'],
    ],
  },
  // 21.11.2026: the three other trade demos, the same home (the day ring), each with its own day, words and WhatsApp.
  beauty: {
    id: 'beauty', host: 'demo-beauty.m.it-solution.co.il', label: 'קוסמטיקאית', fem: true, collect: 'תשלומים',
    ribbon: 'הדגמה: קוסמטיקאית, הנתונים מומצאים. השיחה עם המוניטור אמיתית.',
    accent: '#c2508f',
    words: { client: 'לקוחה', job: 'טיפול', deposit: 'מקדמה', quote: 'הצעת מחיר', day: 'יום טיפולים' },
    dayOpen: 'gRemind', debtOpen: 'gBhClients',
    did: [
      ['b', 'הודעות לשירן, נועה ויעל', 'לא היו אצלך חודשיים, מוכנות לשליחה', 'לשלוח'],
      ['g', 'שמרתי חשבונית ספק', 'קרמים וסרום, 1,240 ₪', 'בוצע'],
      ['y', 'כתבתי פוסט לאינסטגרם', 'לפני ואחרי טיפול פנים', 'לראות'],
      ['g', 'רשמתי מה נגמר', 'נשארו 2 מהסרום, הזמנה מוכנה', 'לראות'],
    ],
    screens: ['gBhClients', 'gRemind', 'gTasks', 'gCIdeas'],
    // 21.11.2026: the three examples of the empty conversation on the desktop home (lib/trade-desk.js), written by hand.
    // Said to the monitor, so the imperatives stay masculine for every owner. An optional askF would replace them for a feminine owner.
    ask: ['תבדוק מי לא הייתה אצלי חודשיים', 'תכתוב לי פוסט לאינסטגרם על טיפול פנים', 'מה מחכה לי היום?'],
    wa: [
      ['me', '🎤 הקלטה 0:07: "תבדוק מי לא הייתה אצלי חודשיים ותכין להן הודעה."'],
      ['mon', 'שלוש לקוחות: שירן, נועה ויעל. לכל אחת הכנתי הודעה אישית, למשל: "שירן, התגעגעתי. יש לי מקום ביום שלישי בבוקר לפילינג העדין שאהבת." לשלוח?'],
      ['me', 'כן, רק לשירן ולנועה'],
      ['mon', 'פתחתי לך את שתיהן, לחיצה על כל אחת והיא אצלה. מערכת התורים שלך נשארת כמו שהיא.'],
    ],
  },
  consult: {
    id: 'consult', host: 'demo-consult.m.it-solution.co.il', label: 'יועץ עסקי', collect: 'ריטיינרים',
    ribbon: 'הדגמה: יועץ עסקי, הנתונים מומצאים. השיחה עם המוניטור אמיתית.',
    accent: '#1f4e8c',
    words: { client: 'לקוח', job: 'פגישה', deposit: 'ריטיינר', quote: 'הצעת מחיר', day: 'יום פגישות' },
    dayOpen: 'gBhCal', debtOpen: 'gBhClients',
    did: [
      ['b', 'תמללתי פגישה של 48 דקות', 'בית הקפה של נועה: 3 החלטות, 4 משימות', 'לראות'],
      ['g', 'שלחתי סיכום פגישה', 'לשגיא שיווק, אחרי שאישרת', 'בוצע'],
      ['y', 'תזכורת ריטיינר', 'בית הקפה של נועה, מחכה לאישור שלך', 'לשלוח'],
      ['g', 'רשמתי מה הבטחת', '2 משימות שלך מהפגישה, עם תאריך', 'לראות'],
    ],
    screens: ['gBhClients', 'gBhCal', 'gBhMeet', 'gBhMail', 'gBhQuote'],
    // 21.11.2026: the three examples of the empty conversation on the desktop home (lib/trade-desk.js), written by hand.
    // Said to the monitor, so the imperatives stay masculine for every owner. An optional askF would replace them for a feminine owner.
    ask: ['תסכם לי את הפגישה עם בית הקפה של נועה', 'תכין תזכורת ריטיינר לשגיא שיווק', 'מה הבטחתי ללקוחות השבוע?'],
    wa: [
      ['me', '🎙️ קובץ שמע: פגישה עם בית הקפה של נועה, 48:12'],
      ['mon', 'תמללתי. הוחלט: להעלות את ארוחת הבוקר ב 4 ₪, לצמצם את המאפים מ 14 ל 8, ולפתוח אירועים קטנים בערב. המשימות שלך: טבלת תמחור עד חמישי, ותחזית תזרים לשלושה חודשים. הפגישה הבאה ב 3.12. לשלוח לנועה את הסיכום?'],
      ['me', 'כן'],
      ['mon', 'פתחתי לך את הסיכום, לחיצה אחת והוא אצלה. את שתי המשימות שלך רשמתי עם תאריך.'],
    ],
  },
  photo: {
    id: 'photo', host: 'demo-photo.m.it-solution.co.il', label: 'צלם אירועים', collect: 'מקדמות ויתרות',
    ribbon: 'הדגמה: צלם אירועים, הנתונים מומצאים. השיחה עם המוניטור אמיתית.',
    accent: '#0f9a8f',
    words: { client: 'לקוח', job: 'אירוע', deposit: 'מקדמה', quote: 'חוזה', day: 'יום צילום' },
    dayOpen: 'gBhCal', debtOpen: 'gBhClients',
    did: [
      ['b', 'שלחתי חוזה לחתימה', 'חברת נקודה, אירוע חברה ב 18.12', 'בוצע'],
      ['g', 'שמרתי תאריך ביומן', 'מאיה ויובל, 5.12, אולמי הים', 'בוצע'],
      ['y', 'תזכורת מקדמה', 'עדי ותומר, מחכה לאישור שלך', 'לשלוח'],
      ['g', 'הכנתי הודעה עם הגלריה', 'משפחת אורן, בר המצווה של אורי', 'לראות'],
    ],
    screens: ['gBhClients', 'gBhCal', 'gBhQuote', 'gRemind', 'gCIdeas'],
    // 21.11.2026: the three examples of the empty conversation on the desktop home (lib/trade-desk.js), written by hand.
    // Said to the monitor, so the imperatives stay masculine for every owner. An optional askF would replace them for a feminine owner.
    ask: ['תשלח לזוג של 14.1 חוזה לחתימה', 'תזכיר לעדי ותומר על המקדמה', 'אילו אירועים יש לי החודש?'],
    wa: [
      // 21.11.2026, Itzik: "צלם חתונות שולח גם את הטופס עם חתימה דיגיטלית". The contract goes out for a digital signature.
      ['me', '🎤 הקלטה 0:06: "תשלח לזוג של 14.1 את החוזה לחתימה."'],
      ['mon', 'הכנתי לעדי ותומר חוזה עם חתימה דיגיטלית: חתונה ב 14.1 בגני הדר, מקדמה 1,500 ₪. הם חותמים מהטלפון, בלי להדפיס. לשלוח?'],
      ['me', 'כן'],
      ['mon', 'פתחתי לך את ההודעה עם הקישור, לחיצה אחת והיא אצלם.'],
      ['mon', '✍️ עדי ותומר חתמו על החוזה. שמרתי את 14.1 ביומן, והחוזה החתום בתיקייה שלהם.'],
    ],
  },
};
function get(id) { return Object.prototype.hasOwnProperty.call(TRADES, String(id)) ? TRADES[id] : null; }
// The trade whose demo page sent this request (the Origin header), or null. Exact match only.
function byOrigin(o) { o = String(o || ''); return Object.values(TRADES).find((t) => o === 'https://' + t.host) || null; }
function isDemoOrigin(o) { return !!byOrigin(o); }
module.exports = { TRADES, get, byOrigin, isDemoOrigin };
