'use strict';
/*
  One WhatsApp message a day: what is still open (lib/open-loops.js).

  4.11.2026, Itzik: "תתחיל עם כל מה שהצענו". The first step of the plan after the
  Instinct comparison: the monitor speaks first, once a day, and only with what
  changed. No new item since yesterday: nothing is sent at all.

  Messages per day: at most 1 (data/status/wa-daily.json holds { day, keys }).
  Not on Saturday. Cost: free inside the 24 hour window, a template message
  (a few agorot) outside it.

  Timer: monitor-wa-daily.timer, 08:30 Israel time (setup/monitor-wa-daily.*). Moved from 08:00 on 10.11.2026 so it also
  carries the fallback of the manager's morning push (lib/morning-wa.js): if the push was sent and the monitor was not
  opened since, the manager's open lines go in this same message, once a day.

  Usage: node wa-daily.js           send if there is something new
         node wa-daily.js --dry     print the message, send and save nothing
         node wa-daily.js --force   send even if one went out today
*/
const fs = require('fs');
const path = require('path');
const inst = require('./lib/instance.js');
const loops = require('./lib/open-loops.js');
const out = require('./lib/wa-out.js');
const mw = require('./lib/morning-wa.js');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const STATE = path.join(inst.dataPath, 'status', 'wa-daily.json');

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()); }

(async () => {
  const day = today();
  if (new Date(day + 'T12:00:00Z').getUTCDay() === 6 && !FORCE) { console.log('שבת, לא שולחים'); return; }
  const st = readJson(STATE, { day: '', keys: [] });
  if (st.day === day && !FORCE && !DRY) { console.log('כבר נשלח היום'); return; }
  const items = loops.list(inst.dataPath, Date.now());
  const loopsText = loops.message(items, st.keys, inst.publicUrl);
  // 10.11: the fallback of the manager's morning push (lib/morning-wa.js). One WhatsApp: the manager's open lines and, when there is
  // something new, the open loops under them. Otherwise nothing changes.
  const fb = mw.check(inst.dataPath, Date.now());
  const fbSend = fb.d.send;
  const text = fbSend ? mw.text(fb.card, inst.publicUrl, loopsText) : loopsText;
  if (DRY) {
    console.log('גיבוי הבוקר: ' + (fbSend ? 'שולח' : 'לא שולח') + ' (' + fb.d.reason + ')');
    console.log(JSON.stringify(fb.input));
    console.log(text || '(אין חדש, לא נשלח כלום)'); console.log('פתוחים: ' + items.length); return;
  }
  const keys = items.map((i) => i.key);
  if (!text) {
    // Nothing new. Keep the open list current, so a loop that closes and opens again counts as new.
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify({ day: st.day, keys: keys, checkedAt: new Date().toISOString() }, null, 1));
    console.log('אין חדש, לא נשלח');
    return;
  }
  const r = await out.sendOwner(inst.dataPath, text, { kind: 'daily' });
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ day: day, keys: keys, sentAt: new Date().toISOString(), via: r.via }, null, 1));
  if (fbSend) mw.markSent(inst.dataPath, day, r.via);
  console.log('נשלח בוואטסאפ (' + r.via + '), ' + items.length + ' פתוחים' + (fbSend ? ', כולל גיבוי הבוקר' : ''));
})().catch((e) => {
  // Never quiet: the reason goes to the log and to the phone.
  console.error('!! wa-daily: ' + e.message);
  try { require('child_process').execFileSync('node', ['notify.js', 'ההודעה היומית בוואטסאפ לא יצאה', String(e.message).slice(0, 200)], { cwd: __dirname, timeout: 60000 }); } catch (x) { console.error('!! notify too: ' + x.message); }
  process.exitCode = 1;
});
