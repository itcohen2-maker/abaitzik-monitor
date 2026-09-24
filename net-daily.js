/*
  The daily network report.

  Itzik, 24.9: he tapped Instagram and got a report four days old, and asked
  for all of them, Instagram, Facebook, TikTok and the rest, to be updated
  every day. The reports stopped on 20.9 because they were a side effect of the
  engagement waves, and the waves stopped on 21.9 when he ruled out comments
  and likes. The reading was never ruled out, only the acting.

  So this is the reading on its own: once a day, one headless session looks at
  the four networks and writes one report per network with the numbers. It
  touches nothing. No like, no reply, no message, no friend request.

  Usage: node net-daily.js [--dry] [--force]

  Budget: one session a day and no notification of its own. A stamp per day
  makes a double run safe.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const HERE = __dirname;
const STATUS = path.join(HERE, 'data', 'status');
const LOG = path.join(STATUS, 'net-daily.log');
const STAMP = path.join(STATUS, 'net-daily.json');
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

function localDay(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function say(line) {
  const t = new Date().toTimeString().slice(0, 8);
  try { fs.appendFileSync(LOG, t + '  ' + line + '\n', 'utf8'); } catch (e) {}
  console.log(t + '  ' + line);
}
function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

function prompt(day) {
  return [
    'זו הרצה אוטומטית. אין אדם בצד השני של הפלט הזה ואף אחד לא יקרא אותו.',
    'אל תבקש אישור ואל תציע לעשות משהו: תבצע.',
    '',
    'דוח רשתות יומי, ' + day + '. קריאה בלבד.',
    'כללי הבית: הפעל את הסקיל abaitzik-onboarding לפני שאתה נוגע במשהו.',
    '',
    'אסור לגמרי: לייק, תגובה, תשובה, הודעה, בקשת חברות, מעקב, מחיקה.',
    'לא פותחים מסנג׳ר. לא פותחים סטוריז עם כוכב ירוק. לא נוגעים ב-ManyChat.',
    '',
    'הדפדפן: קודם `list_connected_browsers`. אם יש אחד, `select_browser` עליו.',
    'אם יש יותר מאחד, בחר את Browser 1. פותחים לשונית חדשה עם tabs_create_mcp.',
    'אם הרשימה ריקה, כתוב דוח אחד שאומר את זה ועצור.',
    '',
    'ארבע רשתות, עד חמש דקות לכל אחת:',
    '  tiktok: https://www.tiktok.com/tiktokstudio  (עוקבים, צפיות, תגובות חדשות מאתמול)',
    '  facebook: https://www.facebook.com/professional_dashboard/  (עוקבים, חשיפה, תגובות והודעות שממתינות)',
    '  instagram: https://www.instagram.com/abaitzik/  (עוקבים, צפיות ברילים האחרונים, הודעות שממתינות)',
    '  youtube: https://studio.youtube.com/  (מנויים, צפיות, תגובות חדשות)',
    '',
    'לכל רשת קובץ אחד ב-data/reports/reports בשם ' + day.replace(/-/g, '') + '-HHMM-daily-<network>.json:',
    '{"at":"<ISO עם +03:00>","network":"<network>","title":"<שם הרשת בעברית>, דוח יומי: <המספר החשוב>",',
    ' "body":"<המספרים, והשינוי מאתמול אם ידוע. מי פנה ומחכה לתשובה. בלי פנימיות>"}',
    'רק מספרים שראית על המסך. מה שלא נטען או לא נראה, כתוב שלא נראה.',
    'בלי מקפים, בלי אימוגי, בלי שם פרטי.',
    '',
    'בסוף: npm test, ואז `node push.js "דוח רשתות יומי"`.',
    'לא git add ולא git commit ולא git push בעצמך.',
  ].join('\n');
}

function main() {
  const day = localDay(new Date());
  const st = readJson(STAMP, {});
  if (st.day === day && !FORCE) { say('הדוח של היום כבר רץ.'); return; }
  say('דוח רשתות יומי ' + day + '.');
  if (DRY) { console.log(prompt(day)); return; }
  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(STAMP, JSON.stringify({ day, at: new Date().toISOString() }), 'utf8');
  const child = spawn('claude', ['-p', '--chrome', '--dangerously-skip-permissions'],
    { cwd: HERE, shell: true, windowsHide: true });
  child.stdin.end(prompt(day), 'utf8');
  let out = '';
  child.stdout.on('data', (x) => { out += x; });
  child.stderr.on('data', (x) => { out += x; });
  // Four networks at five minutes each, plus the push. Past thirty it is stuck.
  const cap = setTimeout(() => {
    say('!! עבר 30 דקות. עוצר.');
    try { execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {}); } catch (e) {}
  }, 30 * 60 * 1000);
  child.on('close', (code) => {
    clearTimeout(cap);
    say('הסתיים, קוד ' + code + '. ' + String(out).trim().slice(-220).replace(/\s+/g, ' '));
  });
  child.on('error', (e) => { clearTimeout(cap); say('!! לא עלה: ' + e.message); });
}
main();
