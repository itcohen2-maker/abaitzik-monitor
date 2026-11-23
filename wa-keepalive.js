'use strict';
/*
  23.11.2026, Itzik: "אתה שולח הודעה לוואטסאפ, אם לא נשלחה שום הודעה, אתה יוזם את ההודעה אחרי 23 שעות ו55 דקות.
  ככה ייווצר לנו רצף והמשכיות. הכוונה היא רק אליי."

  Meta's free 24 hour window opens only with a message FROM him (wa-bridge.js keeps lastIn). A message from us does
  not extend it. So 23:55 after his last message, if he wrote nothing since, one message goes to him with a button
  "המשך". His tap is a message from him: the window opens for another 24 hours, and wa-bridge.js takes the tap
  silently (payload keep|go), with no answer and no task. Once per message of his. Only his own number, only his
  own monitor. Cron every minute.

  Usage: node wa-keepalive.js [--dry]
*/
const fs = require('fs');
const path = require('path');
const inst = require('./lib/instance.js');
const W = require('./lib/wa-out.js');

const AT = (23 * 60 + 55) * 60e3;  // his words: 23 hours and 55 minutes
const LAST = 24 * 3600e3 - 30e3;   // past this Meta refuses free messages, so nothing is tried
const DRY = process.argv.includes('--dry');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

function due(lastIn, sentFor, now) {
  if (!lastIn || sentFor === lastIn) return false;
  const age = now - lastIn;
  return age >= AT && age < LAST;
}

async function main() {
  if (inst.name !== 'abaitzik') return;
  const cfg = rd(path.join(inst.dataPath, 'wa.json'), null);
  if (!cfg || !cfg.phoneId) return;
  const to = W.owner(cfg);
  const last = (rd(path.join(inst.dataPath, 'status', 'wa-bridge.json'), {}).lastIn || {})[to];
  const SF = path.join(inst.dataPath, 'status', 'wa-keepalive.json');
  const st = rd(SF, {});
  if (!due(last, st.sentFor, Date.now())) return;
  const stamp = new Date().toISOString().slice(0, 16);
  if (DRY) { console.log(stamp + ' DRY would send, last message from him ' + new Date(last).toISOString()); return; }
  st.sentFor = last; st.at = new Date().toISOString();
  fs.writeFileSync(SF, JSON.stringify(st, null, 1)); // first, so a failure is not retried every minute
  try {
    await W.post(cfg, { messaging_product: 'whatsapp', to: to, type: 'interactive', interactive: { type: 'button',
      body: { text: '🔁 עברו כמעט 24 שעות מההודעה האחרונה שלך כאן. לחיצה על "המשך" שומרת את הקו פתוח ליום נוסף.' },
      action: { buttons: [{ type: 'reply', reply: { id: 'keep|go', title: 'המשך' } }] } } });
    console.log(stamp + ' sent, last message from him ' + new Date(last).toISOString());
  } catch (e) { st.err = String(e.message).slice(0, 200); fs.writeFileSync(SF, JSON.stringify(st, null, 1)); console.log(stamp + ' failed: ' + st.err); }
}

if (require.main === module) main();
module.exports = { due, AT, LAST };
