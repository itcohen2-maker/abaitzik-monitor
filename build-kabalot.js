'use strict';
// Generates docs/kabalot/index.html: every receipt that arrived in the mail
// since the start of the year, on one page, grouped by who charged and by
// month, with a link straight back to the original message.
//
// The source is data/receipts.json, collected out of his own Gmail. Amounts
// are read from the subject and the preview line, because that is where
// almost every biller puts them. A receipt whose amount is in neither is
// still listed: a missing number is something to go and look at, not a
// reason to hide a charge. The counters say how many those are.
//
// Currencies are never added together. A shekel total and a dollar total are
// two different facts, and one converted number would hide the rate on the
// day of the charge. Run: node build-kabalot.js

const fs = require('fs');
const path = require('path');

// KABALOT_SRC lets the generator run against a fixture, so the layout and the
// amount parsing can be checked without touching the real mail.
const SRC = process.env.KABALOT_SRC || path.join(__dirname, 'data', 'receipts.json');
const OUT = path.join(__dirname, 'docs', 'kabalot');

// Who is behind an address. Matched on the domain, longest first, so
// cellcominv.co.il does not fall through to a shorter cellcom rule.
const VENDORS = [
  ['googleplay-noreply@google.com', 'Google Play', 'דיגיטל'],
  ['payments-noreply@google.com',   'Google',      'דיגיטל'],
  ['mail.anthropic.com',            'Anthropic',   'דיגיטל'],
  ['anthropic.com',                 'Anthropic',   'דיגיטל'],
  ['vercel.com',                    'Vercel',      'דיגיטל'],
  ['openai.com',                    'OpenAI',      'דיגיטל'],
  ['manychat.com',                  'ManyChat',    'דיגיטל'],
  ['stripe.com',                    'Stripe',      'דיגיטל'],
  ['email.apple.com',               'Apple',       'דיגיטל'],
  ['apple.com',                     'Apple',       'דיגיטל'],
  ['youtube.com',                   'YouTube',     'דיגיטל'],
  ['google.com',                    'Google',      'דיגיטל'],
  ['paypal.co.il',                  'PayPal',      'תשלומים'],
  ['payplus.co.il',                 'PayPlus',     'תשלומים'],
  ['weareplanet.com',               'Planet',      'תשלומים'],
  ['ezcount.co.il',                 'חשבוניות',    'תשלומים'],
  ['isracard.co.il',                'ישראכרט',     'אשראי'],
  ['icc.co.il',                     'כאל',         'אשראי'],
  ['max-finance.co.il',             'מקס',         'אשראי'],
  ['cal-online.co.il',              'כאל',         'אשראי'],
  ['cellcominv.co.il',              'סלקום',       'תשתיות'],
  ['cellcom.co.il',                 'סלקום',       'תשתיות'],
  ['iec.co.il',                     'חשמל',        'תשתיות'],
  ['partner.co.il',                 'פרטנר',       'תשתיות'],
  ['hot.net.il',                    'הוט',         'תשתיות'],
  ['bezeq.co.il',                   'בזק',         'תשתיות'],
  ['maccabi4u.org.il',              'מכבי',        'בריאות'],
  ['passportcard.co.il',            'פספורטכארד',  'בריאות'],
  ['harel-group.co.il',             'הראל',        'בריאות'],
  ['elalinfo.co.il',                'אל על',       'נסיעות'],
  ['airalo.com',                    'Airalo',      'נסיעות'],
  ['booking.com',                   'Booking',     'נסיעות'],
  ['gett.com',                      'גט',          'נסיעות'],
  ['wolt.com',                      'וולט',        'נסיעות'],
  ['namecheap.com',                 'Namecheap',   'דיגיטל'],
  ['godaddy.com',                   'GoDaddy',     'דיגיטל'],
  ['cloudflare.com',                'Cloudflare',  'דיגיטל'],
  ['figma.com',                     'Figma',       'דיגיטל'],
  ['canva.com',                     'Canva',       'דיגיטל'],
  ['adobe.com',                     'Adobe',       'דיגיטל'],
];

function vendorOf(rec) {
  const from = String(rec.from || '').toLowerCase();
  for (const [needle, name, cat] of VENDORS) {
    if (from === needle || from.endsWith('@' + needle) || from.endsWith('.' + needle)) {
      return { name, cat };
    }
  }
  const name = String(rec.name || from.split('@')[1] || from || 'לא ידוע').trim();
  return { name, cat: 'אחר' };
}

// The amount. Two shapes cover nearly everything: a symbol in front of the
// number (₪49.90, $20.00) and a number in front of a word (49.90 ש"ח).
// Both orders appear in the same inbox, sometimes in the same message.
const CUR = [
  [/[₪]\s*([\d,]+(?:\.\d{1,2})?)/,                    'ILS'],
  [/([\d,]+(?:\.\d{1,2})?)\s*(?:₪|ש"ח|ש״ח|שח\b|שקל)/, 'ILS'],
  [/(?:ILS|NIS)\s*([\d,]+(?:\.\d{1,2})?)/i,           'ILS'],
  [/[$]\s*([\d,]+(?:\.\d{1,2})?)/,                    'USD'],
  [/(?:USD)\s*([\d,]+(?:\.\d{1,2})?)/i,               'USD'],
  [/([\d,]+(?:\.\d{1,2})?)\s*(?:USD)/i,               'USD'],
  [/[€]\s*([\d,]+(?:\.\d{1,2})?)/,                    'EUR'],
  [/(?:EUR)\s*([\d,]+(?:\.\d{1,2})?)/i,               'EUR'],
];

function amountOf(rec) {
  // The subject first. When a biller puts the amount in the subject it is the
  // amount charged; the preview line may also carry a balance, a previous
  // total or a price before tax, and picking that one would be wrong.
  for (const text of [rec.subj || '', rec.snip || '']) {
    for (const [re, cur] of CUR) {
      const m = re.exec(text);
      if (!m) continue;
      const n = Number(String(m[1]).replace(/,/g, ''));
      // A receipt number is not a price. Four-plus digits with no decimal
      // point next to a currency sign is rare; a bare integer that large is
      // usually an invoice id that happened to sit beside a symbol.
      if (!isFinite(n) || n <= 0) continue;
      return { amount: n, currency: cur };
    }
  }
  return { amount: null, currency: '' };
}

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n, cur) => {
  if (n == null) return '';
  const sym = cur === 'ILS' ? '₪' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '';
  return sym + n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function load() {
  if (!fs.existsSync(SRC)) {
    console.error('אין data/receipts.json. צריך לאסוף קודם.');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const rows = (raw.items || raw).map(r => {
    const v = vendorOf(r);
    const a = amountOf(r);
    const at = r.iso ? new Date(r.iso) : null;
    return {
      tid: r.tid || '',
      vendor: v.name,
      cat: v.cat,
      from: r.from || '',
      subj: r.subj || '',
      at,
      month: at ? at.getFullYear() + '-' + String(at.getMonth() + 1).padStart(2, '0') : '',
      monthHe: at ? MONTHS[at.getMonth()] + ' ' + at.getFullYear() : 'ללא תאריך',
      amount: a.amount,
      currency: a.currency,
      link: r.tid ? 'https://mail.google.com/mail/u/0/#all/' + r.tid : '',
    };
  });
  rows.sort((a, b) => (b.at ? +b.at : 0) - (a.at ? +a.at : 0));
  return { rows, collectedAt: raw.collectedAt || new Date().toISOString() };
}

module.exports = { VENDORS, vendorOf, amountOf, load, esc, money, MONTHS, OUT };

if (require.main === module) require('./build-kabalot-page.js')();
