/*
  The daily Instagram report, from the logged in profile.

  Itzik, 29.10 (idea "רוצה את זה"): every morning, the last seven days of
  reach, views, likes, comments, saves and shares per post and reel, plus the
  follower count. The 07:00 network report has followers and story views only;
  this one reads the professional insights, which need his logged in browser,
  so it runs on his PC only, at 07:30 (setup-insta-daily.ps1).

  Reading only. No like, no comment, no follow, no message, no friend request.
  The session writes one JSON file locally; this script checks it, fixes the
  dashes and the time stamp, and only then sends it to the server's reports
  folder and runs push.js there as monitor (the PC data folder never reaches
  the server).

  Usage: node insta-daily.js [--dry] [--force]
  Log: data/status/insta-daily.log. The stamp per day makes a second run a no-op.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');

const HERE = __dirname;
const STATUS = path.join(HERE, 'data', 'status');
const LOG = path.join(STATUS, 'insta-daily.log');
const STAMP = path.join(STATUS, 'insta-daily.json');
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const SSH_KEY = 'C:/Users/User/.ssh/monitor_server';
const SERVER = 'root@178.105.63.97';
const SERVER_DIR = '/home/monitor/abaitzik-monitor';
const SERVER_REPORTS = SERVER_DIR + '/data/reports/reports';
const CAP_MS = 25 * 60 * 1000;

function israel(d) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  // Offset of Israel time from UTC in minutes: +180 in summer, +120 in winter.
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const off = Math.round((asUtc - d.getTime()) / 60000);
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  return {
    ymd: p.year + p.month + p.day,
    day: p.year + '-' + p.month + '-' + p.day,
    hhmm: p.hour + p.minute,
    iso: p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + sign + hh + ':' + mm,
  };
}

function say(line) {
  const t = new Date().toTimeString().slice(0, 8);
  try { fs.appendFileSync(LOG, t + '  ' + line + '\n', 'utf8'); } catch (e) {}
  console.log(t + '  ' + line);
}
function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

function prompt(now, file) {
  return [
    'זו הרצה אוטומטית. אין אדם בצד השני של הפלט הזה ואף אחד לא יקרא אותו.',
    'אל תבקש אישור ואל תציע לעשות משהו: תבצע.',
    '',
    'דוח אינסטגרם יומי, ' + now.day + '. קריאה בלבד.',
    'כללי הבית: הפעל את הסקיל abaitzik-onboarding לפני שאתה נוגע במשהו.',
    '',
    'אסור לגמרי: לייק, תגובה, תשובה, הודעה, בקשת חברות, מעקב, מחיקה, שינוי הגדרה.',
    'לא פותחים מסנג׳ר. לא פותחים סטוריז עם כוכב ירוק (חברים קרובים). לא נוגעים ב-ManyChat.',
    '',
    'הדפדפן: קודם `list_connected_browsers`. בחר את הדפדפן של פרופיל 4 (Profile 4) שמחובר לאינסטגרם.',
    'אם אי אפשר לזהות את הפרופיל, בחר את Browser 1. פותחים לשונית חדשה עם tabs_create_mcp.',
    'אם הרשימה ריקה, כותבים בקובץ את השורה "נכשל: אין דפדפן מחובר" ועוצרים.',
    '',
    'הנתונים, בלשונית הזאת:',
    '  1. https://www.instagram.com/abaitzik/ : מספר העוקבים.',
    '  2. https://www.instagram.com/accounts/insights/ (או לוח המקצועי, professional dashboard): לכל פוסט וריל מ-7 הימים האחרונים:',
    '     חשיפות, צפיות, לייקים, תגובות, שמירות ושיתופים. סכומים לשבוע, ואם יש, השינוי מהשבוע שלפניו.',
    '  רק מה שראית על המסך. מה שלא נטען או לא נראה, כותבים שלא נראה.',
    '',
    'כותבים את הדוח לקובץ: ' + file,
    '{"at":"' + now.iso + '","title":"אינסטגרם, דוח יומי: <המספר החשוב, למשל חשיפה השבוע>",',
    ' "body":"<טקסט פשוט, שורות מופרדות במעבר שורה, בלי טבלאות>"}',
    'סדר הגוף: תקופה (תאריכים בלי מקפים, למשל 23.10 עד 29.10) ומספר העוקבים עם השינוי.',
    'אחר כך סיכום השבוע: חשיפות, צפיות, לייקים, תגובות, שמירות, שיתופים.',
    'אחר כך עד חמישה פוסטים או רילס הבולטים, כל אחד בשורה עם המספרים שלו.',
    'בסוף מה חריג (ירידה חדה, פוסט שהתפוצץ, משהו שכדאי לדעת), או שאין.',
    'בלי מקפים בשום מקום (לא מקף רגיל, לא מקף ארוך), בלי אימוג׳י, בלי שם פרטי, בלי אנגלית, בלי פנימיות.',
    '',
    'בסוף: כל טאב שפתחת נסגר. גם קבוצות Claude שנשארו בסרגל כ-Closed נמחקות. לא סוגרים את המוניטור ולא טאבים שלו.',
    'התשובה שלך: שורה אחת, "נכתב" או "נכשל: <מה>".',
  ].join('\n');
}

// Last checks on the file before it goes to the server.
function prepare(file, now) {
  const r = readJson(file, null);
  if (!r || typeof r.title !== 'string' || typeof r.body !== 'string' || !r.title.trim() || !r.body.trim()) {
    return { error: 'הקובץ חסר title או body' };
  }
  // Iron rule: no dashes in anything published. Hyphens between numbers become "עד",
  // list dashes at the start of a line go, anything left becomes a comma.
  const clean = (s) => s
    .replace(/^\s*[-–—]+\s*/gm, '')
    .replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 עד $2')
    .replace(/\s*[-–—]+\s*/g, ', ');
  const out = { at: now.iso, title: clean(r.title).trim(), body: clean(r.body).trim() };
  return { out };
}

function sendToServer(name, text) {
  const local = path.join(STATUS, name);
  fs.writeFileSync(local, JSON.stringify(text, null, 1), 'utf8');
  const remote = SERVER_REPORTS + '/' + name;
  execFileSync('scp', ['-i', SSH_KEY, '-o', 'BatchMode=yes', local, SERVER + ':' + remote], { stdio: 'pipe' });
  execFileSync('ssh', ['-i', SSH_KEY, '-o', 'BatchMode=yes', SERVER,
    'chown monitor:monitor ' + remote + ' && cd ' + SERVER_DIR + ' && sudo -u monitor node push.js "דוח אינסטגרם יומי"'],
  { stdio: 'pipe' });
  return remote;
}

function main() {
  if (process.platform !== 'win32' && !DRY) { console.log('runs on the PC only'); return; }
  const now = israel(new Date());
  const st = readJson(STAMP, {});
  if (st.day === now.day && !FORCE) { say('הדוח של היום כבר רץ.'); return; }
  say('דוח אינסטגרם יומי ' + now.day + '.');
  const file = path.join(STATUS, 'insta-daily-' + now.ymd + '.json');
  if (DRY) { console.log(prompt(now, file)); return; }
  fs.mkdirSync(STATUS, { recursive: true });
  try { fs.unlinkSync(file); } catch (e) {}
  fs.writeFileSync(STAMP, JSON.stringify({ day: now.day, at: new Date().toISOString() }), 'utf8');

  const child = spawn('claude', ['-p', '--chrome', '--dangerously-skip-permissions'],
    { cwd: HERE, shell: true, windowsHide: true });
  child.stdin.end(prompt(now, file), 'utf8');
  let out = '';
  child.stdout.on('data', (x) => { out += x; });
  child.stderr.on('data', (x) => { out += x; });
  // One session, one attempt. A stuck session is stopped, not run again.
  const cap = setTimeout(() => {
    say('!! עבר 25 דקות. עוצר.');
    try { execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {}); } catch (e) {}
  }, CAP_MS);
  child.on('error', (e) => { clearTimeout(cap); say('!! לא עלה: ' + e.message); });
  child.on('close', (code) => {
    clearTimeout(cap);
    say('הסתיים, קוד ' + code + '. ' + String(out).trim().slice(-200).replace(/\s+/g, ' '));
    // A partial report (no insights, not logged in) is not sent as if it were the real one.
    const last = String(out).trim().split('\n').pop() || '';
    if (/נכשל/.test(last)) { say('!! לא נשלח, הדוח חלקי: ' + last.slice(0, 200)); return; }
    const got = prepare(file, now);
    if (got.error) { say('!! לא נשלח: ' + got.error); return; }
    try {
      const remote = sendToServer(now.ymd + '-' + now.hhmm + '-instagram.json', got.out);
      say('נשלח לשרת: ' + remote);
    } catch (e) {
      say('!! שליחה לשרת נכשלה: ' + String(e.stderr || e.message).slice(0, 200));
    }
  });
}
main();
