'use strict';
/*
  סיכום האבץ של היום, פעם אחת ביום.

  איציק, 17.9: "כל מה שאני אצלם היום מה שאכלתי, בסוף היום תאגור את הכל
  ותגיד לי כמה אבץ היה באוכל." הדף כבר אוגר ומראה בכל רגע. זה החלק שאומר
  לו בלי שיפתח: הודעה אחת ב-21:00.

  Usage: node zinc-day.js [--dry] [--force] [--day YYYY-MM-DD]

  התקציב: הודעה אחת ביום ולא יותר. ב-13.9 אינדיקטור ששלח פעימה כל דקה
  שרף את המכסה של ntfy והפיל את כל ההתראות, אז כאן יש חותם ליום. אם היום
  כבר נשלח, הריצה יוצאת בלי לשלוח כלום, וריצה כפולה בטוחה. ויום בלי אוכל
  רשום לא שולח כלום: אין מה לדווח עליו, והודעה ריקה היא רעש.
*/
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const FOOD = path.join(HERE, 'data', 'food', 'food');
const STAMP = path.join(HERE, 'data', 'status', 'zinc-day.json');
const TARGET = 11; // מ״ג ליום, גבר בוגר. אותו יעד שהדף מציג.

const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const dayArg = process.argv.indexOf('--day');
const DAY = dayArg > -1 ? process.argv[dayArg + 1] : localDay(new Date());

// היום שלו, לא היום של UTC. ב-21:00 בישראל UTC כבר יכול להיות מחר, ודוח
// שמסכם את "מחר" הוא דוח ריק.
function localDay(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function items(day) {
  if (!fs.existsSync(FOOD)) return [];
  return fs.readdirSync(FOOD).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(FOOD, f), 'utf8')); }
    catch (e) { return null; }
  }).filter(f => f && String(f.at || '').slice(0, 10) === day);
}

function round(n) { return Math.round(n * 10) / 10; }

function summary(day) {
  const all = items(day);
  const known = all.filter(f => f.zinc !== undefined && f.zinc !== null && f.zinc !== '');
  const missing = all.length - known.length;
  const total = round(known.reduce((a, f) => a + (Number(f.zinc) || 0), 0));
  const top = known.slice().sort((a, b) => (Number(b.zinc) || 0) - (Number(a.zinc) || 0)).slice(0, 3);
  return { all, known, missing, total, top };
}

function body(s) {
  const lines = [];
  lines.push(s.total + ' מ״ג אבץ מתוך ' + TARGET + ' ביעד היומי.');
  if (s.total < TARGET) lines.push('חסרים ' + round(TARGET - s.total) + ' מ״ג.');
  else lines.push('היום סגור מבחינת אבץ.');
  if (s.top.length) {
    lines.push('');
    lines.push(s.top.map(f => (f.name || 'פריט') + ': ' + round(Number(f.zinc) || 0) + ' מ״ג').join('\n'));
  }
  // לא בולעים את החוסר. מספר נמוך שמבוסס על שורות שלא חושבו הוא מספר שקרי.
  if (s.missing) {
    lines.push('');
    lines.push(s.missing === 1 ? 'פריט אחד עוד בלי ערך אבץ, אז המספר יכול לעלות.'
      : s.missing + ' פריטים עוד בלי ערך אבץ, אז המספר יכול לעלות.');
  }
  lines.push('');
  lines.push('הפירוט המלא בתוך "עקוב אחרי התזונה" במוניטור.');
  return lines.join('\n');
}

function sent() {
  try { return JSON.parse(fs.readFileSync(STAMP, 'utf8')); } catch (e) { return {}; }
}

// רק כשמריצים את הקובץ הזה ישירות. require ממבחן לא ישלח הודעה לאיציק:
// קובץ שמודד תזונה ושולח הודעה בזמן שמישהו רק קורא אותו הוא בדיוק סוג
// התקלה שהפילה את המכסה ב-13.9.
if (require.main === module) (async () => {
  const s = summary(DAY);
  const text = body(s);

  if (!s.all.length) {
    console.log('אין אוכל רשום ל-' + DAY + '. לא נשלח כלום.');
    return;
  }
  const stamp = sent();
  if (stamp.day === DAY && !FORCE) {
    console.log('הסיכום של ' + DAY + ' כבר נשלח ב-' + stamp.at + '. לא נשלח שוב.');
    return;
  }
  if (DRY) {
    console.log('— יבש —\nאבץ היום: ' + s.total + ' מ״ג\n' + text);
    return;
  }

  const ch = require('./lib/notify-channels.js');
  const r = await ch.notify('אבץ היום: ' + s.total + ' מ״ג', text);
  fs.mkdirSync(path.dirname(STAMP), { recursive: true });
  fs.writeFileSync(STAMP, JSON.stringify({
    day: DAY, at: new Date().toISOString(), total: s.total,
    items: s.all.length, missing: s.missing,
    ok: !!r.ok, channel: r.ok ? r.channel : null,
  }, null, 2) + '\n');
  if (r.ok) console.log('נשלח דרך ' + r.channel);
  else {
    // אותו כלל של notify.js: ערוץ חסום הוא לא ערוץ שהגיע. אומרים את זה.
    console.log('!! לא נשלח לאף ערוץ. ההודעה בתור ותנוסה שוב.');
    console.log('!! ' + (r.tried || []).join(' | '));
    process.exitCode = 2;
  }
})();

module.exports = { summary, body, localDay, TARGET };
