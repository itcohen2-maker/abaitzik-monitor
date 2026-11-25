'use strict';
/*
  25.11.2026, Itzik: "לידים שהם מחוץ לארץ זה פישינג, ואני לא רוצה לקבל את הלידים האלה, לא להכניס אותם לרשימה".
  Since 23.11 a WhatsApp number that is not Israeli makes no lead (lib/wa-stranger.js). This is the same rule for every
  other way a lead is made with a phone: the Meta scanner, the site chat, a signup, a referrer. A lead with no phone
  (a Facebook comment) cannot be judged and stays. Israeli: 0 + digits, +972, 972, 00972. Everything else is foreign.
*/
const fs = require('fs');
const path = require('path');

function isForeign(phone) {
  const raw = String(phone || '').trim();
  const d = raw.replace(/\D/g, '');
  if (d.length < 7) return false; // not a number we can judge
  if (raw.startsWith('+') || raw.startsWith('00')) return !/^(\+|00)972/.test(raw.replace(/[\s\-().]/g, ''));
  if (d.startsWith('972')) return false;
  if (d.startsWith('0')) return false; // a local Israeli number
  return true; // digits that start with another country's code
}

// Counted quietly (the last 100, the number hidden), so nothing is lost if he ever asks.
function note(dataPath, src, phone) {
  try {
    const f = path.join(dataPath, 'status', 'lead-foreign.json');
    let l = []; try { l = JSON.parse(fs.readFileSync(f, 'utf8')) || []; } catch (e) { l = []; }
    const d = String(phone || '').replace(/\D/g, '');
    l.push({ at: new Date().toISOString(), src: String(src || ''), tail: d.slice(-3), len: d.length });
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(l.slice(-100), null, 1));
  } catch (e) { /* counting never blocks */ }
}

module.exports = { isForeign, note };
