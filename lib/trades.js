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
  },
};
function get(id) { return Object.prototype.hasOwnProperty.call(TRADES, String(id)) ? TRADES[id] : null; }
module.exports = { TRADES, get };
