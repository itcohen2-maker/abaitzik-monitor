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
};
function get(id) { return Object.prototype.hasOwnProperty.call(TRADES, String(id)) ? TRADES[id] : null; }
// The trade whose demo page sent this request (the Origin header), or null. Exact match only.
function byOrigin(o) { o = String(o || ''); return Object.values(TRADES).find((t) => o === 'https://' + t.host) || null; }
function isDemoOrigin(o) { return !!byOrigin(o); }
module.exports = { TRADES, get, byOrigin, isDemoOrigin };
