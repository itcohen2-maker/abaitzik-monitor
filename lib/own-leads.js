'use strict';
/*
  12.11.2026, Itzik: "הליד עכשיו שנכנס זה אני הייתי, אז אני רוצה למחוק אותו מהרשומות, הוא לא נחשב."
  A lead that comes from Itzik's own phone or his own mail boxes is a test of the system: it is still created (so he
  sees the flow work), but it is marked `test: true`, shown greyed as "בדיקה שלך", not counted in the lead counts,
  reports or manager, and it never alerts (no tile alert, no 📋 לטיפול item, no urgent push).

  The ONE place the list is written is OWN below. The WhatsApp allow list (data/wa.json "allow", already normalized
  as 9725xxxxxxxx) is his own numbers too, so it is read on top of the constants.
*/
const fs = require('fs');
const path = require('path');

const OWN = {
  // 21.11.2026: his own phone and mails come from data/private-ids.json (lib/private-ids.js), not from this public file
  phones: require('./private-ids.js').list('leadPhones'),
  emails: ['info@it-solution.co.il'].concat(require('./private-ids.js').list('leadMails')),
};

// 052-123 4567, +972 52 123 4567, 972521234567 -> 0521234567 ; anything else -> '' (never throws)
function normPhone(p) {
  let d = String(p == null ? '' : p).replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return /^0\d{8,9}$/.test(d) ? d : '';
}

function ownPhones(dataPath) {
  const set = new Set(OWN.phones.map(normPhone).filter(Boolean));
  if (dataPath) {
    try {
      const w = JSON.parse(fs.readFileSync(path.join(dataPath, 'wa.json'), 'utf8'));
      (Array.isArray(w.allow) ? w.allow : []).forEach((x) => { const n = normPhone(x); if (n) set.add(n); });
    } catch (e) { /* no allow list here: the constants are enough */ }
  }
  return set;
}

// 24.11.2026, Itzik: "תתקן שליד לא יכנס" (after the Google Review Test signup became a lead). A signup of his own, or one
// that came through a test link (ref "google-verify-test", "...-test", "verify-..."), is a test: no lead, no 📋 לטיפול.
const TEST_REF = /(^|[-_])(test|verify)([-_]|$)/i;
function isTestSignup(dataPath, q) {
  q = q || {};
  return TEST_REF.test(String(q.ref || '')) || isOwn(dataPath, { phone: q.phone, email: q.email });
}

// isOwn(dataPath, { phone, email }) -> true when either is one of his.
function isOwn(dataPath, c) {
  c = c || {};
  const ph = normPhone(c.phone);
  if (ph && ownPhones(dataPath).has(ph)) return true;
  const em = String(c.email || '').trim().toLowerCase();
  return !!em && OWN.emails.indexOf(em) >= 0;
}

// The same, for the raw text of a site chat lead: every address and every phone number in it is checked.
function isOwnText(dataPath, text) {
  const t = String(text || '');
  const mails = t.match(/[^\s@,;<>:()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"']+/g) || [];
  if (mails.some((m) => isOwn(dataPath, { email: m }))) return true;
  const phones = t.match(/\+?\d[\d\s\-]{7,14}\d/g) || [];
  return phones.some((p) => isOwn(dataPath, { phone: p }));
}

module.exports = { OWN, normPhone, ownPhones, isOwn, isOwnText, isTestSignup, TEST_REF };
