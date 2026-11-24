'use strict';
/*
  23.11.2026, Itzik: "אם זה תוקן תוך 5 דקות עד 10 דקות, אין צורך להטריד. אם הבדיקה לוקחת יותר מהזמן הזה, אז תטריד."
  On his own monitor a fault alert (tenant-check "תקלה אצל לקוח", the guard, the button checker) no longer rings his
  phone or WhatsApp at once. It goes to the manager inbox as before (fault-mail.js orders a fix) and waits here,
  in data/manager/fault-hold.json. fault-mail.js --release (cron, every 2 minutes) decides for each one:
    the fix answered and it is not "לא תוקן"      -> dropped, he is not bothered (a line on the manager card)
    the fix answered "לא תוקן"                     -> sent to him now, with that answer
    no fix was ordered (same fault today, limits)  -> sent now, nobody is working on it
    a fix runs 10 minutes and has not answered     -> sent, saying the fix is still running
    no order at all 15 minutes after the alert     -> sent
  The same FAULT test as fault-mail.js decides what is a fault, so nothing is held that no one will fix.
*/
const fs = require('fs');
const path = require('path');

const FAULT = /(בודק המוניטורים|השומר מצא תקלה|נשארה בלי תשובה|לא עלה|לא עובד|לא עובדת|לא נפתח|לא נשלח|נכשל|נכשלה|תקלה|שגיאה|נפל|תקוע|נתקע|בלי תגובה|אבטחה)/;
const NOT = /(^דוח (הבוקר|בוקר)|^הבוקר במוניטור|הכל תקין|תקין שוב|^✅ |^המנהל|צריכת טוקנים)/;
const SYSTEM = /info@it-solution\.co\.il/i;
const FIX_MS = 10 * 60e3;     // from the fix order: his "5 to 10 minutes"
const NO_ORDER_MS = 15 * 60e3; // fault-mail.js runs every 10 minutes, so an order normally exists by then
const KEEP_MS = 24 * 3600e3;

function isFault(m) {
  const s = String(m.subject || ''), b = String(m.body || ''), all = s + ' ' + b;
  if (NOT.test(s) || NOT.test(b.slice(0, 40))) return false;
  if (SYSTEM.test(String(m.from || ''))) return FAULT.test(s) || (FAULT.test(b) && /מוניטור|אריח|כפתור|מסך/.test(b));
  return /מוניטור/.test(all) && FAULT.test(all);
}
// what notify() may hold: a system fault alert, never a lead or an urgent priority 5 line
function holdable(title, body, opts) {
  if (opts && (opts.noHold || Number(opts.priority) >= 5)) return false;
  return isFault({ from: 'info@it-solution.co.il', subject: title, body: body });
}

const file = (dataPath) => path.join(dataPath, 'manager', 'fault-hold.json');
function read(dataPath) { try { return JSON.parse(fs.readFileSync(file(dataPath), 'utf8')) || []; } catch (e) { return []; } }
function write(dataPath, list) {
  const f = file(dataPath);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(list, null, 1));
  fs.renameSync(f + '.tmp', f);
}
function hold(dataPath, id, title, body, now) {
  const list = read(dataPath);
  list.push({ id: id, at: new Date(now || Date.now()).toISOString(), title: String(title || ''), body: String(body || '') });
  write(dataPath, list.slice(-200));
}
function has(dataPath, id) { return read(dataPath).some((x) => x.id === id); }

// order: { at } when a fix was ordered, { skip: true } when fault-mail.js passed it by, undefined when not seen yet.
// result: the fix answer text, or null.
function decide(item, order, result, now) {
  now = now || Date.now();
  if (result != null) return /^\s*לא תוקן/.test(result) ? { act: 'send', why: 'failed' } : { act: 'drop', why: 'fixed' };
  if (order && order.skip) return { act: 'send', why: 'no-order' };
  if (order && order.at) return now - Date.parse(order.at) >= FIX_MS ? { act: 'send', why: 'slow' } : { act: 'wait' };
  if (now - Date.parse(item.at) >= KEEP_MS) return { act: 'drop', why: 'old' };
  return now - Date.parse(item.at) >= NO_ORDER_MS ? { act: 'send', why: 'no-order' } : { act: 'wait' };
}
function note(why, result) {
  if (why === 'failed') return '\n\nהמנהל ניסה לתקן ולא הצליח: ' + String(result || '').slice(0, 300);
  if (why === 'slow') return '\n\nהמנהל מטפל בזה כבר 10 דקות ועוד לא סיים.';
  return '\n\nהמנהל לא התחיל לטפל בזה.';
}

module.exports = { FAULT, NOT, SYSTEM, FIX_MS, NO_ORDER_MS, isFault, holdable, read, write, hold, has, decide, note };
