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
         node net-daily.js --queue     (on the server, from monitor-net-daily.timer)

  Itzik, 1.10: "אני ביקשתי ממך לעשות כל יום בשבע בבוקר בדיקה, אתה לא בודק".
  He was right. The 07:00 task on the PC depended on setup-net-daily.ps1 having
  been run there, and even when it ran, the session wrote its reports into the
  PC's own data folder, which is not in git and never reaches the server, so
  the networks screen kept showing 24.9. Now the server owns the clock: at
  07:00 Israel it marks the job in the PC queue (pc-task.js), pc-pull.js on
  the PC claims it the first minute the PC is on, and the session there writes
  each report straight to the server over ssh. A PC that is off at seven does
  it when it wakes. Run on the PC without --queue, this does nothing, so the
  old scheduled task cannot run a second, invisible scan.

  Itzik, 28.9: every day at seven in the morning, followers on every network
  and story views on TikTok, Instagram and Facebook. It needs his logged in
  browser, so it runs on his PC only; setup-net-daily.ps1 registers it at 07:00.

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
const QUEUE = process.argv.includes('--queue');
const REPORTS = path.join(HERE, 'data', 'reports', 'reports');
const PCDIR = path.join(HERE, 'data', 'pc', 'pc');
// His request of 28.9 for the seven o'clock report. A final failure of the
// PC job is told to him in that thread; a success writes nothing to the chat.
const REQUEST = 'ntfy-m0prnKTTXUTD';
const SSH = 'ssh -i C:/Users/User/.ssh/monitor_server -o BatchMode=yes root@178.105.63.97';
const SERVER_REPORTS = '/home/monitor/abaitzik-monitor/data/reports/reports';

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
    '  tiktok: https://www.tiktok.com/tiktokstudio  (עוקבים, צפיות, צפיות בסטורי אם יש, תגובות חדשות מאתמול)',
    '  facebook: https://www.facebook.com/professional_dashboard/  (עוקבים, חשיפה, צפיות בסטורי אם יש, תגובות והודעות שממתינות)',
    '  instagram: https://www.instagram.com/abaitzik/  (עוקבים, צפיות ברילים האחרונים, צפיות בסטורי הפעיל אם יש, הודעות שממתינות)',
    '  youtube: https://studio.youtube.com/  (מנויים, צפיות, תגובות חדשות)',
    '',
    'לכל רשת קובץ אחד ב-data/reports/reports בשם ' + day.replace(/-/g, '') + '-HHMM-daily-<network>.json:',
    '{"at":"<ISO עם +03:00>","network":"<network>","title":"<שם הרשת בעברית>, דוח יומי: <המספר החשוב>",',
    ' "body":"<המספרים, והשינוי מאתמול אם ידוע. מי פנה ומחכה לתשובה. בלי פנימיות>"}',
    'בכל דוח חובה: מספר העוקבים, ואם יש סטורי פעיל כמה צפיות יש לו. אין סטורי, כתוב שאין.',
    'רק מספרים שראית על המסך. מה שלא נטען או לא נראה, כתוב שלא נראה.',
    'בלי מקפים, בלי אימוגי, בלי שם פרטי.',
    '',
    'בסוף: npm test, ואז `node push.js "דוח רשתות יומי"`.',
    'לא git add ולא git commit ולא git push בעצמך.',
  ].join('\n');
}

// The same job, phrased for the PC queue. pc-pull.js wraps it in its own
// header and collects the answer, so this is only the work itself.
function pcTask(day) {
  const ymd = day.replace(/-/g, '');
  return [
    'דוח הרשתות היומי של ' + day + ' (הבדיקה של שבע בבוקר). קריאה בלבד.',
    'קודם בודקים בשרת אם הדוח של היום כבר נכתב: ' + SSH + ' "ls ' + SERVER_REPORTS + ' | grep ' + ymd + '-.*-daily-"',
    'אם יש ארבעה קבצים, התשובה היא "הדוח של היום כבר בשרת" ועוצרים.',
    '',
    'אסור לגמרי: לייק, תגובה, תשובה, הודעה, בקשת חברות, מעקב, מחיקה.',
    'לא פותחים מסנג׳ר. לא פותחים סטוריז עם כוכב ירוק. לא נוגעים ב-ManyChat.',
    '',
    'ארבע רשתות, עד חמש דקות לכל אחת, בלשונית חדשה בכרום שלו:',
    '  tiktok: https://www.tiktok.com/tiktokstudio  (עוקבים, צפיות, צפיות בסטורי אם יש, תגובות חדשות מאתמול)',
    '  facebook: https://www.facebook.com/professional_dashboard/  (עוקבים, חשיפה, צפיות בסטורי אם יש, תגובות והודעות שממתינות)',
    '  instagram: https://www.instagram.com/abaitzik/  (עוקבים, צפיות ברילים האחרונים, צפיות בסטורי הפעיל אם יש, הודעות שממתינות)',
    '  youtube: https://studio.youtube.com/  (מנויים, צפיות, תגובות חדשות)',
    '',
    'לכל רשת קובץ JSON אחד בשם ' + ymd + '-HHMM-daily-<network>.json (network: tiktok, facebook, instagram, youtube):',
    '{"at":"<ISO עם +03:00>","network":"<network>","title":"<שם הרשת בעברית>, דוח יומי: <המספר החשוב>",',
    ' "body":"<המספרים, והשינוי מהדוח הקודם אם ידוע. מי פנה ומחכה לתשובה. בלי פנימיות>"}',
    'הדוח הקודם לשם השוואה: ' + SSH + ' "ls -t ' + SERVER_REPORTS + ' | grep daily- | head -4" ואז cat.',
    'בכל דוח חובה: מספר העוקבים, ואם יש סטורי פעיל כמה צפיות יש לו. אין סטורי, כתוב שאין.',
    'רק מספרים שראית על המסך. מה שלא נטען או לא נראה, כתוב שלא נראה. בלי מקפים, בלי אימוג׳י, בלי שם פרטי.',
    '',
    'הקבצים נכתבים בשרת, לא במחשב (תיקיית הנתונים במחשב לא מגיעה למוניטור):',
    '  scp -i C:/Users/User/.ssh/monitor_server <קובץ> root@178.105.63.97:' + SERVER_REPORTS + '/',
    '  ואחרי כולם: ' + SSH + ' "chown monitor:monitor ' + SERVER_REPORTS + '/' + ymd + '-*-daily-*.json"',
    'בסוף מוודאים ב ls בשרת שארבעת הקבצים שם. התשובה: שורה אחת עם מספר העוקבים בכל רשת.',
  ].join('\n');
}

// On the server: put today's job in the PC queue, once.
function queue() {
  const day = localDay(new Date());
  const ymd = day.replace(/-/g, '');
  let have = [];
  try { have = fs.readdirSync(REPORTS).filter((f) => f.startsWith(ymd + '-') && /-daily-/.test(f)); } catch (e) {}
  if (have.length >= 4 && !FORCE) { console.log('today\'s report is already in: ' + have.join(' ')); return; }
  let open = [];
  try {
    open = fs.readdirSync(PCDIR).filter((f) => f.endsWith('.json'))
      .map((f) => readJson(path.join(PCDIR, f), null)).filter(Boolean)
      .filter((t) => t.netDaily === day && t.status !== 'failed');
  } catch (e) {}
  if (open.length && !FORCE) { console.log('already queued for ' + day + ': ' + open.map((t) => t.id).join(' ')); return; }
  if (DRY) { console.log(pcTask(day)); return; }
  const { execFileSync } = require('child_process');
  const id = String(execFileSync(process.execPath, [path.join(HERE, 'pc-task.js'), 'add', '--quiet', '--re', REQUEST, pcTask(day)],
    { cwd: HERE, encoding: 'utf8' })).trim();
  // Tagged with the day, so a second run of the timer the same day is a no-op.
  const f = path.join(PCDIR, id + '.json');
  const t = readJson(f, null);
  if (t) { t.netDaily = day; fs.writeFileSync(f, JSON.stringify(t, null, 1), 'utf8'); }
  console.log(new Date().toISOString() + ' queued ' + id + ' for ' + day);
}

function main() {
  if (QUEUE) return queue();
  if (process.platform === 'win32' && !FORCE) {
    say('הדוח היומי עבר לתור המחשב: השרת מסמן אותו ב 07:00 והמחשב קולט לבד. לא רץ כאן.');
    return;
  }
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
