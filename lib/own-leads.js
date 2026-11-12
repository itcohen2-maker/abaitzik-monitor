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
  phones: ['0526507525'],
  emails: ['itcohen2@gmail.com', 'hagitit7@gmail.com', 'info@it-solution.co.il'],
};

// 052-650 7525, +972 52 650 7525, 972526507525 -> 0526507525 ; anything else -> '' (never throws)
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

module.exports = { OWN, normPhone, ownPhones, isOwn, isOwnText };
