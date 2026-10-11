'use strict';

// Reply bank. Rules baked in on purpose, so a tired run cannot break them:
//   * no dashes anywhere
//   * no first names (the name is not always readable)
//   * no promises
//   * phrasing that works for a man or a woman, so we never mis-gender
//   * short: thanks plus one positive sentence
//
// Categories map to how the person reached out. Pick by category, then pick a
// variant that was not used recently on the same network.

const BANK = {
  // "רפואה שלמה", "בריאות אמן", religious wishes
  blessing: [
    'אמן, תודה רבה על הברכה 🙏',
    'תודה רבה, הברכה הזאת שווה הרבה 🙏',
    'אמן ותודה, מעריך את זה מאוד 🙏',
    'תודה ענקית על הברכה, שווה זהב 🙏',
    'אמן, ותודה שחשבתם עליי 🙏',
    'תודה רבה, ברכות כאלה עושות טוב 🙏',
  ],

  // "בהצלחה", "אלוף", "חזק", general cheering
  encouragement: [
    'תודה רבה, זה בדיוק מה שנותן כוח להמשיך 💪',
    'תודה על החיזוק, זה עושה את ההבדל 🙏',
    'תודה, המילים האלה מגיעות בול בזמן 💪',
    'תודה רבה, קיבלתי את זה בגדול 💪',
    'תודה, זה נותן דלק להמשך 🙏',
    'תודה רבה, זה מחזק אותי באמת 💪',
  ],

  // Someone says something warm and personal about Itzik himself
  personal: [
    'תודה רבה, המילים האלה עושות טוב 🙏',
    'תודה רבה, קראתי את זה 🙏',
    'תודה, קראתי את זה כמה פעמים 🙏',
    'תודה רבה, שמח שזה מגיע 🙏',
  ],

  // Someone shares their own illness or loss. Hug only.
  // Never ask for a follow or a share here. The audience is fragile.
  pain: [
    'שולח חיבוק גדול, לא קל בכלל',
    'חיבוק חזק, ומאחל רק בשורות טובות',
    'תודה ששיתפתם. חיבוק גדול מכאן',
    'קראתי כל מילה. חיבוק ענק',
  ],

  // Folk remedies, diets, treatments. Neutral thanks, never engage with the
  // content and never agree to try anything.
  medical_advice: [
    'תודה רבה על המחשבה, מעריך את זה 🙏',
    'תודה שטרחתם לכתוב, מעריך מאוד 🙏',
    'תודה רבה, נחמד מצדכם לחשוב עליי 🙏',
  ],

  // "איך אפשר לעזור"
  offer_help: [
    'הכי עוזר לשתף את הסרטון ולהעביר למישהו שזה יכול לעשות לו טוב 🙏',
    'העזרה הכי גדולה היא שיתוף, ולהעביר את זה הלאה למי שצריך 🙏',
    'שיתוף של הסרטון והעברה למישהו נוסף, זה כל מה שצריך 🙏',
  ],

  // "איפה תורמים", "יש קרן"
  donation: [
    'לא ביקשתי תרומות ואין קמפיין. מה שעוזר זה חשיפה, שיתוף ומעקב 🙏',
    'אין תרומות ואין גיוס. שיתוף ומעקב זה מה שבאמת עוזר 🙏',
  ],
};

// Anything that must never appear in an outgoing reply.
const FORBIDDEN = [
  /-/,                     // no dashes
  /\bתרמו\b/,
  /\bביט\b/,
  /\bפייבוקס\b/,
  /\bחשבון בנק\b/,
  /אני מבטיח/,
  /יהיה בסדר בטוח/,
  // He heard these back from his own feed on 11.9 and said they read as a bot:
  // warming the heart, straight from the heart, and the white heart with them.
  /חימ(מ|ם)[^.]{0,8}לב/,
  /מכל הלב/,
  /נוגע ללב/,
  /🤍|❤|♥|💗|💖|💕/,
];

function validate(text) {
  const problems = [];
  for (const rx of FORBIDDEN) {
    if (rx.test(text)) problems.push(String(rx));
  }
  if (text.length > 120) problems.push('too long');
  return problems;
}

// Pick a variant that has not been used in the last `window` replies on this
// network, so the feed never shows the same sentence twice in a row.
function pick(category, recentTexts, window = 4) {
  const variants = BANK[category];
  if (!variants) return null;
  const recent = new Set((recentTexts || []).slice(-window));
  const fresh = variants.filter((v) => !recent.has(v));
  const pool = fresh.length ? fresh : variants;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { BANK, pick, validate, FORBIDDEN };
