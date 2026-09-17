/*
  The engagement wave.

  Itzik, 17.9: "go back to our plan of likes and replies, several times a day,
  graded, no night hours, and start on YouTube too." The plan existed. What it
  never had was a clock: it ran when somebody happened to ask for it, which is
  the same reason his monitor messages used to sit unread.

  This is the clock. It fires on the slot times, works out which network this
  slot belongs to and whether the hour is allowed, and starts one headless
  session to run a single wave. It does not reply to anybody itself, for the
  same reason `worker.js` does not: a script improvising in his name is worse
  than silence.

  Usage: node wave.js [--dry] [--net=tiktok|youtube|facebook|instagram]
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HERE = __dirname;
const STATUS = path.join(HERE, 'data', 'status');
const LOG = path.join(STATUS, 'wave.log');
const LOCK = path.join(STATUS, 'wave.lock');
const DRY = process.argv.includes('--dry');
const FORCED = (process.argv.find((a) => a.startsWith('--net=')) || '').slice(6);

/*
  The slot table, on odd minutes on purpose.

  Round minutes are the cheapest tell there is: an account that acts at exactly
  08:00 every day is reading a cron file out loud. These come from the burst
  schedule he set on 7.9, with YouTube added on 17.9 at his word, spaced so two
  networks never share an hour.
*/
const SLOTS = [
  { at: '07:34', net: 'tiktok' },
  { at: '09:23', net: 'youtube' },
  { at: '10:07', net: 'instagram' },
  { at: '12:34', net: 'tiktok' },
  { at: '14:23', net: 'youtube' },
  { at: '15:07', net: 'instagram' },
  { at: '17:34', net: 'tiktok' },
  { at: '19:23', net: 'youtube' },
  { at: '21:34', net: 'tiktok' },
];

/*
  The graded day.

  An account that answers comments at three in the morning is obviously a bot,
  and the silence between 23:00 and 07:00 is what buys the rest of the day its
  credibility. The caps are per wave, not per hour.
*/
function band(hour) {
  if (hour < 7 || hour >= 23) return { name: 'לילה', cap: 0 };
  if (hour < 9) return { name: 'בוקר, קל', cap: 5 };
  if (hour < 18) return { name: 'יום', cap: 8 };
  return { name: 'שעות שיא', cap: 12 };
}

function say(line) {
  const t = new Date().toTimeString().slice(0, 8);
  try { fs.appendFileSync(LOG, t + '  ' + line + '\n', 'utf8'); } catch (e) {}
  console.log(t + '  ' + line);
}
function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function claimLock() {
  const cur = readJson(LOCK, null);
  if (cur && cur.pid && alive(cur.pid) && Date.now() - Date.parse(cur.at) < 20 * 60 * 1000) return false;
  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8');
  return true;
}

/*
  Which slot is this.

  The task fires every minute and most of those minutes belong to nobody. A
  window rather than an exact match, because Task Scheduler is allowed to be a
  minute late and a missed wave is worse than a wave that starts at 12:35.
*/
function slotNow(now) {
  if (FORCED) return { at: 'ידני', net: FORCED };
  const mins = now.getHours() * 60 + now.getMinutes();
  return SLOTS.find((s) => {
    const [h, m] = s.at.split(':').map(Number);
    const d = mins - (h * 60 + m);
    return d >= 0 && d <= 2;
  }) || null;
}

function prompt(slot, b) {
  return [
    'זו הרצה אוטומטית. אין אדם בצד השני של הפלט הזה ואף אחד לא יקרא אותו.',
    'אל תבקש אישור ואל תציע לעשות משהו: תבצע.',
    '',
    'גל מעורבות אחד ברשת ' + slot.net + '. חלון: ' + b.name + '. תקרה: עד ' + b.cap + ' תשובות.',
    '',
    'כללי הבית: הפעל את הסקיל abaitzik-onboarding לפני שאתה נוגע במשהו.',
    '',
    'הגל: עד שמונה דקות, רשת אחת בלבד, לא לעבור לרשת אחרת.',
    'לייק לכל תגובה חדשה. תשובה כתובה רק למה שמצדיק אותה.',
    'בין פעולה לפעולה 8 עד 20 שניות, מרווח שונה בכל פעם.',
    '',
    'הנוסח שאיציק קבע ב17.9, ואין לחרוג ממנו:',
    '  מחמאה, פרגון או מילים טובות: אחת מהחמש, בסבב, בלי לחזור פעמיים ברצף.',
    '    תודה רבה, תודה, תודה עם אימוגי שריר, תודה רבה מעריך מאוד, תודה רבה אוהב מאוד.',
    '  בשורה רעה, צער או קושי: משפט קצר שמאחל בשורות טובות ושולח חיזוק.',
    '  כל דבר אחר, כולל שאלות רפואיות והמלצות דתיות: לא עונים, רושמים בדוח.',
    '',
    'דילוג: מי שכבר קיבל תשובה, גם אם התשובה מקופלת ולא נראית על המסך,',
    'ומי שכבר ענינו לו היום על סרטון אחר.',
    '',
    'בריחה: אם מופיע קאפצ׳ה, אימות, בקשת האטה או הודעת יותר מדי נסיונות,',
    'תעצור מיד באמצע, לא תנסה שוב, ותכתוב את זה בדוח.',
    '',
    'בסוף: דוח ב-data/reports/reports, ואז npm test, node build.js, git add -A,',
    'git commit, git push. דוח שלא נדחף הוא דוח שהוא לא קיבל.',
  ].join('\n');
}

function main() {
  const now = new Date();
  const b = band(now.getHours());
  const slot = slotNow(now);
  if (!slot) { if (DRY) say('לא שעת גל.'); return; }
  if (b.cap === 0) { say('חלון לילה. אין פעולות.'); return; }
  say('גל ' + slot.net + ' בחלון ' + b.name + ', תקרה ' + b.cap + '.');
  if (DRY) return;
  if (!claimLock()) { say('גל אחר עוד רץ. מדלג.'); return; }
  const child = spawn('claude', ['-p', '--dangerously-skip-permissions'],
    { cwd: HERE, shell: true, windowsHide: true });
  child.stdin.end(prompt(slot, b), 'utf8');
  let out = '';
  child.stdout.on('data', (x) => { out += x; });
  child.stderr.on('data', (x) => { out += x; });
  // A wave is eight minutes of work. Twelve is the outside of that, and past it
  // the session is not working, it is thinking about working.
  const cap = setTimeout(() => {
    say('!! הגל עבר 12 דקות. עוצר אותו.');
    try { process.kill(child.pid); } catch (e) {}
  }, 12 * 60 * 1000);
  child.on('close', (code) => {
    clearTimeout(cap);
    say('הגל הסתיים, קוד ' + code + '. ' + String(out).trim().slice(-220).replace(/\s+/g, ' '));
    try { fs.unlinkSync(LOCK); } catch (e) {}
  });
  child.on('error', (e) => {
    clearTimeout(cap); say('!! הגל לא עלה: ' + e.message);
    try { fs.unlinkSync(LOCK); } catch (e2) {}
  });
}
main();
