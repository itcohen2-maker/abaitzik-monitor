'use strict';
/*
  16.11.2026, Itzik, after the promises check: meeting summaries (Fireflies) are sold from Small, and no customer had them,
  because the key could only be set by hand as root. Now the customer pastes his Fireflies API key in 🔌 חיבורים.
  The page sends "🎙️ מפתח פיירפליס: <key>" (sealed, only where the monitor seals its messages), and the customer's own
  listener (listen.js, his own Linux user) saves it here into data/keys.json "firefliesKey", with no model. The message
  file is deleted at once and the logs show the key masked, so the key never stays in the chat or a log.
  fireflies-pull.js (setup/enable-fireflies.sh, every 30 minutes) brings the meetings into 🎙️ סיכומי פגישות.
*/
const fs = require('fs');
const path = require('path');

const RE = /^\s*(?:משימה)?\s*(?:🎙️|🎙)?\s*מפתח פיירפליס\s*[:：]\s*(\S[^\n]*)/;

function parseMsg(text) {
  const m = RE.exec(String(text || ''));
  return m ? m[1].trim() : '';
}
// For logs: the key is never written out.
// 22.11.2026: the lines of the appointments screen carry a client's name and phone: never in a log in the clear
const BOOKING_LINE = /^\s*(?:משימה\s+)?(?:מגבלות קישור|פתיחת קישור|אישור תור לקוחה|תור לקוחה|הזזת תור לקוחה|ביטול תור לקוחה|סימון תור לקוחה|הוספת לקוחה|שירות חדש|שעות פעילות|מחיקת שירות|הסרת שירות|תנאי ביטול|הצהרת בריאות לשירות|אישור תורים:|חסימת לקוחה:|ביטול חסימה:)/;
function mask(text) {
  if (BOOKING_LINE.test(String(text || ''))) return 'תור לקוחה (הפרטים לא נרשמים כאן)';
  return String(text || '').replace(/(מפתח פיירפליס\s*[:：]\s*)\S+/g, '$1••••');
}
function hasKey(dataPath) {
  try { return !!String(JSON.parse(fs.readFileSync(path.join(dataPath, 'keys.json'), 'utf8')).firefliesKey || '').trim(); } catch (e) { return false; }
}
function setKey(dataPath, input) {
  const v = String(input || '').trim();
  const f = path.join(dataPath, 'keys.json');
  let k = {};
  try { k = JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch (e) { if (fs.existsSync(f)) throw new Error('keys.json unreadable'); }
  if (/^(?:הסרה|הסר|ניתוק)$/.test(v)) {
    delete k.firefliesKey;
  } else {
    if (!/^[A-Za-z0-9_\-.]{16,200}$/.test(v)) return { ok: false, reply: 'זה לא נראה כמו מפתח של Fireflies. מעתיקים אותו ב Fireflies: Settings, ואז Developer settings, ואז API Key.' };
    k.firefliesKey = v;
  }
  const tmp = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(k, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, f);
  if (!k.firefliesKey) return { ok: true, removed: true, reply: 'המפתח של Fireflies הוסר. סיכומי פגישות חדשים לא ייכנסו עד שתחבר שוב.' };
  return { ok: true, reply: 'המפתח של Fireflies נשמר. הפגישות שלך יופיעו ב 🎙️ סיכומי פגישות תוך חצי שעה.' };
}

module.exports = { parseMsg, mask, hasKey, setKey };
