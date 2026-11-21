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
    cards: [
      { k: 'debt', emoji: '💰', title: 'מי חייב לי', open: 'gBhClients', btn: 'לשלוח תזכורת בשם המשרד' },
      { k: 'today', emoji: '📅', title: 'מה היום', open: 'gBhCal', btn: null },
      { k: 'quotes', emoji: '🧾', title: 'הצעות שמחכות', open: 'gBhQuote', btn: 'להזכיר' },
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
