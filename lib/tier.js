'use strict';
/*
  17.10.2026, Itzik: "תכין פרופיל של 20 דולר ... עם כל ההנחיות של חיסכון מקסימלי".
  A customer whose monitor runs on his own Claude Pro plan ($20) for mail, bank
  and documents. Pro's five hour window is small, so on this tier nothing runs
  on Opus, one session at a time, short sessions, and a day ceiling that holds
  even on the customer's own account (his account is the one that runs out).
  Turned on by MONITOR_TIER=pro20 in /etc/<id>.env. The numbers live here only.
*/

const TIERS = {
  pro20: {
    label: 'מנוי 20 דולר',
    oneStage: true,            // no Opus planner: one Haiku session does it all
    model: 'claude-haiku-5-5',
    maxLive: 1,                // one session at a time, never in parallel
    maxTurns: 12,
    sessionUsd: 0.4,           // list price, per session
    dayUsd: 3,                 // list price, per Israel day; then wait for tomorrow
    prompt: [
      'המוניטור הזה רץ על מנוי Claude Pro של 20 דולר של הלקוח. כל קריאה נספרת במכסה שלו.',
      'קוראים רק מה שהבקשה צריכה: מיילים לפי שולח, נושא ותאריך, לא את כל התיבה.',
      'מסמך אחד בכל פעם. קובץ גדול או סרוק: קודם העמוד הראשון, ושואלים אם להמשיך.',
      'בלי סוכנים, בלי עבודה במקביל, ובלי חיפוש ברשת אלא אם ביקש במפורש.',
      'בקשה גדולה (עשרות קבצים, דוח שנתי): קודם אומרים לו שזה יאכל חלק גדול מהמכסה ושואלים.',
      'תשובה עד חמש שורות.',
    ],
  },
};

function current(env) {
  const name = (env || process.env).MONITOR_TIER;
  return name && TIERS[name] ? Object.assign({ name }, TIERS[name]) : null;
}

function promptLines(tier) {
  if (!tier || !tier.prompt) return [];
  return ['פרופיל ' + tier.label + ' (חיסכון מקסימלי):', ...tier.prompt.map((l) => '  ' + l), ''];
}

module.exports = { TIERS, current, promptLines };
