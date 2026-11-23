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
    // 23.11.2026, Itzik: the demo looks like its video (it-solution.co.il/day tr-<id>.mp4) in night mode too. Demos only.
    skin: 'dark',
    words: { client: 'לקוח', job: 'עבודה', deposit: 'מקדמה', quote: 'הצעת מחיר', day: 'יום עבודה' },
    // 21.11.2026, Itzik approved "שעון היום": the day as a ring that is also the microphone. No money waiting on
    // the first screen ("להיכנס כל פעם ולראות את האדום כסף שמחכה, זה נורא מעצבן"): collection is one quiet line.
    dayOpen: 'gBhCal', debtOpen: 'gBhClients',
    // "מה עשיתי בשבילך", behind the side switch. On the demo: [colour g|b|y, title, line, action, target]. 21.11.2026 (QA 9): the optional 5th is the id of the screen the action opens (a tile or a bottom tab that exists in that trade: its screens, the always-on tiles gTasks gNotes gCamp gMyMgr gSend, or nA, the answers tab); "בוצע" is a status and has none.
    did: [
      ['b', '3 הודעות מלקוחות', 'עניתי ושמרתי, אחת מחכה לך', 'לראות', 'nA'],
      ['g', 'סידרתי את היומן', 'הוספתי את המדידה בנס ציונה', 'בוצע'],
      ['y', 'תזכורת לרונית כהן', 'על הצעה 2041, מחכה לאישור שלך', 'לשלוח', 'gSend'],
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
    // 23.11.2026, Itzik: "אצלי זה מופיע סגול" (his phone at night). Her video is light pink, so her demo is always light.
    skin: 'light',
    // 23.11.2026 (owner, desktop screenshot of her customer monitor in night mode): a customer's beauty monitor is light too,
    // whatever the phone says. Only her own explicit choice (the skin buttons) changes it. Applied by defaultSkin below.
    house: 'light',
    words: { client: 'לקוחה', job: 'טיפול', deposit: 'מקדמה', quote: 'הצעת מחיר', day: 'יום טיפולים' },
    dayOpen: 'gBkAppts', debtOpen: 'gBhClients',
    // 21.11.2026, Itzik: "if she has no appointment management she will not buy the monitor". bookings: true gives this
    // trade the 📅 התורים שלי screen (lib/bookings-ui.js, store lib/bookings.js): its hours, services and appointments.
    bookings: true,
    did: [
      ['b', '3 תורים חדשים מהקישור', 'נכנסו ליומן שלך, אחד מחכה לאישור', 'לראות', 'gBkAppts'],
      ['b', 'הודעות לשירן, נועה ויעל', 'לא היו אצלך חודשיים, מוכנות לשליחה', 'לשלוח', 'gSend'],
      ['g', 'שמרתי חשבונית ספק', 'קרמים וסרום, 1,240 ₪', 'בוצע'],
      ['y', 'כתבתי פוסט לאינסטגרם', 'לפני ואחרי טיפול פנים', 'לראות', 'gCIdeas'],
      ['g', 'רשמתי מה נגמר', 'נשארו 2 מהסרום, הזמנה מוכנה', 'לראות', 'gTasks'],
    ],
    screens: ['gBkAppts', 'gBhClients', 'gRemind', 'gTasks', 'gCIdeas'],
    // 21.11.2026: the three examples of the empty conversation on the desktop home (lib/trade-desk.js), written by hand.
    // Said to the monitor, so the imperatives stay masculine for every owner. An optional askF would replace them for a feminine owner.
    ask: ['תבדוק מי לא הייתה אצלי חודשיים', 'תכתוב לי פוסט לאינסטגרם על טיפול פנים', 'מה מחכה לי היום?'],
    wa: [
      ['me', '🎤 הקלטה 0:07: "תבדוק מי לא הייתה אצלי חודשיים ותכין להן הודעה."'],
      ['mon', 'שלוש לקוחות: שירן, נועה ויעל. לכל אחת הכנתי הודעה אישית, למשל: "שירן, התגעגעתי. יש לי מקום ביום שלישי בבוקר לפילינג העדין שאהבת." לשלוח?'],
      ['me', 'כן, רק לשירן ולנועה'],
      ['mon', 'פתחתי לך את שתיהן, לחיצה על כל אחת והיא אצלה. כשיקבעו תור, הוא ייכנס ליומן שלך לבד.'],
    ],
  },
  consult: {
    id: 'consult', host: 'demo-consult.m.it-solution.co.il', label: 'יועץ עסקי', collect: 'ריטיינרים',
    ribbon: 'הדגמה: יועץ עסקי, הנתונים מומצאים. השיחה עם המוניטור אמיתית.',
    accent: '#1f4e8c',
    skin: 'dark',
    words: { client: 'לקוח', job: 'פגישה', deposit: 'ריטיינר', quote: 'הצעת מחיר', day: 'יום פגישות' },
    dayOpen: 'gBhCal', debtOpen: 'gBhClients',
    did: [
      ['b', 'תמללתי פגישה של 48 דקות', 'בית הקפה של נועה: 3 החלטות, 4 משימות', 'לראות', 'gBhMeet'],
      ['g', 'שלחתי סיכום פגישה', 'לשגיא שיווק, אחרי שאישרת', 'בוצע'],
      ['y', 'תזכורת ריטיינר', 'בית הקפה של נועה, מחכה לאישור שלך', 'לשלוח', 'gSend'],
      ['g', 'רשמתי מה הבטחת', '2 משימות שלך מהפגישה, עם תאריך', 'לראות', 'gTasks'],
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
    skin: 'dark',
    words: { client: 'לקוח', job: 'אירוע', deposit: 'מקדמה', quote: 'חוזה', day: 'יום צילום' },
    dayOpen: 'gBhCal', debtOpen: 'gBhClients',
    did: [
      ['b', 'שלחתי חוזה לחתימה', 'חברת נקודה, אירוע חברה ב 18.12', 'בוצע'],
      ['g', 'שמרתי תאריך ביומן', 'מאיה ויובל, 5.12, אולמי הים', 'בוצע'],
      ['y', 'תזכורת מקדמה', 'עדי ותומר, מחכה לאישור שלך', 'לשלוח', 'gSend'],
      ['g', 'הכנתי הודעה עם הגלריה', 'משפחת אורן, בר המצווה של אורי', 'לראות', 'gSend'],
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
// 22.11.2026, Itzik: "אמרנו בשביל להחליף לי את הלוק החדש שאני צריך קודם כל לעבוד על מוניטור דמה שהוא תואם את המוניטור שלי".
// His own monitor in the trade look, for the dummy copy only (instance.json ownerLook: true, setup/owner-dummy.sh). Not in TRADES:
// signup (ref=m-*), the demo hosts and bookings never see it. screens null: every tile of his stays.
const OWNER = {
  id: 'owner', label: 'המוניטור שלי', collect: 'גבייה', dayOpen: 'gBhCal', debtOpen: '', screens: null, did: [], wa: [],
  words: { client: 'לקוח', job: 'משימה', deposit: 'מקדמה', quote: 'הצעת מחיר', day: 'היום שלי' },
  ask: ['מה מחכה לי היום?', 'אילו לידים פתוחים עכשיו?', 'תכין לי סיכום של השבוע'],
};
// The look of a monitor: its trade, or the owner look on the dummy. Only lib/trade-cards.js html and lib/trade-desk.js html ask this.
// 23.11.2026, Itzik ("כל המוניטורים של כולם ... שהם בלוק החדש"): a customer without a trade gets the new look too. The generic trade is the
// owner look (OWNER above) for a business that is none of the four trades: generic words and examples, the feminine ones for gender f.
// No owner things: trade-cards keys its owner-only parts on id 'owner' (SYS agents, the owner's money and bank tiles stay with him).
// screens null: every tile of the customer stays (ALWAYS only). get('generic') is the only way in: the demos, signup and TRADES never see it.
const GENERIC = {
  id: 'generic', label: 'העסק שלי', collect: 'תשלומים', dayOpen: '', debtOpen: '', screens: null, did: [], wa: [],
  words: { client: 'לקוח', job: 'משימה', deposit: 'מקדמה', quote: 'הצעת מחיר', day: 'היום שלי' },
  ask: ['מה מחכה לי היום?', 'מי עוד לא שילם?', 'תכין לי סיכום של השבוע'],
  askF: ['מה מחכה לי היום?', 'מי עוד לא שילם?', 'תכיני לי סיכום של השבוע'],
};
function forInst(inst) { if (!inst) return null; return get(inst.trade) || (inst.ownerLook === true ? OWNER : null); }
// The skin a page starts in before any choice of the visitor (build.js head script). A public demo starts in its video's look;
// a customer's monitor starts in the trade's house look (house), or in none (the phone decides, as before).
function defaultSkin(inst) {
  const t = inst && inst.trade ? get(inst.trade) : null;
  if (!t) return '';
  return inst.publicDemo === true ? (t.skin || '') : (t.house || '');
}
function get(id) { if (String(id) === GENERIC.id) return GENERIC; return Object.prototype.hasOwnProperty.call(TRADES, String(id)) ? TRADES[id] : null; }
// The trade whose demo page sent this request (the Origin header), or null. Exact match only.
function byOrigin(o) { o = String(o || ''); return Object.values(TRADES).find((t) => o === 'https://' + t.host) || null; }
function isDemoOrigin(o) { return !!byOrigin(o); }
module.exports = { TRADES, OWNER, get, forInst, defaultSkin, byOrigin, isDemoOrigin };
