#!/usr/bin/env node
/*
  בדיקת תקינות של כל מה שצריך כדי שהמערכת תמשיך לעבוד כשאיציק לא ליד המחשב.

  נכתב ב-13.09.2026 אחרי שהוא שאל למה המוניטור לא מחזיר לו תשובות.
  התשובה הייתה שאין שם אף אחד שקורא, ולכן הבדיקה הראשונה כאן היא בדיוק זו:
  כמה זמן הודעה שלו מחכה בלי שנגעו בה.

  הבדיקה לא מתקנת ולא נוגעת בכלום. היא רק אומרת מה חי ומה מת, ולכל כשל
  היא אומרת מה הפעולה. בלי פעולה כתובה, ממצא הוא רק רעש.

  שימוש:
    node healthcheck.js            דוח לקונסולה
    node healthcheck.js --json     פלט מכונה
    node healthcheck.js --quiet    מדפיס רק אם יש כשל
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const https = require('https');

const HERE = __dirname;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = 'Profile 3';                       // ראה [[chrome-relaunch]]
const CLAUDE_EXT = 'fcoeoabgfenejglbffodgkkbkcdhcgfn';
const USER_DATA = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
const PUBLIC_URL = 'https://itcohen2-maker.github.io/abaitzik-monitor/';

const checks = [];
function ok(name, detail) { checks.push({ name, state: 'ok', detail }); }
function warn(name, detail, action) { checks.push({ name, state: 'warn', detail, action }); }
function fail(name, detail, action) { checks.push({ name, state: 'fail', detail, action }); }

function ps(cmd) {
  try {
    return execFileSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { encoding: 'utf8', timeout: 20000 }).trim();
  } catch (e) { return ''; }
}

function head(url) {
  return new Promise(resolve => {
    const req = https.get(url, { timeout: 12000 }, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
  });
}

/* ---------- 1. הודעות שמחכות ---------- */
function waitingMessages() {
  const dir = path.join(HERE, 'data', 'chat', 'chat');
  if (!fs.existsSync(dir)) { warn('תיבת ההודעות', 'אין תיקיית צ׳אט', 'לבדוק את נתיב data/chat'); return; }
  const mine = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return null; }
  }).filter(m => m && m.from === 'itzik');

  // מה שמדאיג הוא הודעה שאיש לא נגע בה, לא הודעה שעוד לא נגמרה.
  // הודעה מסומנת עם ackAt נקראה, גם אם העבודה עליה נמשכת.
  const unread = mine.filter(m => !m.ackAt && m.status !== 'done');
  const openWork = mine.filter(m => m.ackAt && m.status !== 'done');

  if (unread.length) {
    const oldest = unread.map(m => new Date(m.at).getTime()).filter(t => !isNaN(t)).sort()[0];
    const hours = oldest ? (Date.now() - oldest) / 36e5 : 0;
    const line = unread.length + ' שלא נקראו, הוותיקה מחכה ' + hours.toFixed(1) + ' שעות';
    if (hours > 6) fail('תיבת ההודעות', line, 'אף סשן לא קרא את התיבה. לפתוח את הטרמינל ולהריץ סבב.');
    else warn('תיבת ההודעות', line, 'לקרוא ולסמן ackAt.');
    return;
  }
  ok('תיבת ההודעות', mine.length + ' הודעות שלו, הכל נקרא'
    + (openWork.length ? ', ' + openWork.length + ' עוד בעבודה' : ''));
}

/* ---------- 2. כרום והתוסף ---------- */
function chrome() {
  if (!fs.existsSync(CHROME)) {
    fail('כרום מותקן', 'לא נמצא ' + CHROME, 'להתקין כרום מחדש');
    return;
  }
  const n = Number(ps('(Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object).Count') || 0);
  if (!n) {
    fail('כרום רץ', 'אין תהליך כרום',
      'Start-Process "' + CHROME + '" -ArgumentList \'--profile-directory=' + PROFILE + '\'');
  } else {
    ok('כרום רץ', n + ' תהליכים');
  }

  const ext = path.join(USER_DATA, PROFILE, 'Extensions', CLAUDE_EXT);
  if (fs.existsSync(ext)) ok('תוסף קלוד', 'מותקן ב-' + PROFILE);
  else fail('תוסף קלוד', 'לא נמצא ב-' + PROFILE,
    'להתקין מ-https://claude.ai/chrome בתוך הפרופיל הזה');

  // הפרופיל חייב להיטען. הפעלה בלי הדגל נתקעת על מסך בחירת הפרופיל,
  // ואז שום תוסף לא רץ ואין חיבור. זה בדיוק מה שקרה ב-13.09.
  const lock = path.join(USER_DATA, PROFILE, 'Network');
  if (n && !fs.existsSync(lock)) {
    warn('פרופיל נטען', 'לא ברור שהפרופיל ' + PROFILE + ' נפתח',
      'לסגור את כרום ולהפעיל עם ‎--profile-directory=' + PROFILE);
  }
}

/* ---------- 3. השתלטות מרחוק ---------- */
function remote() {
  const st = ps("(Get-Service chromoting -ErrorAction SilentlyContinue).Status");
  const start = ps("(Get-Service chromoting -ErrorAction SilentlyContinue).StartType");
  if (!st) {
    fail('השתלטות מרחוק', 'שירות chromoting לא מותקן',
      'להתקין מ-remotedesktop.google.com/access');
  } else if (st !== 'Running') {
    fail('השתלטות מרחוק', 'השירות במצב ' + st, 'Start-Service chromoting');
  } else if (start !== 'Automatic') {
    warn('השתלטות מרחוק', 'רץ אבל לא אוטומטי (' + start + ')',
      'Set-Service chromoting -StartupType Automatic');
  } else {
    ok('השתלטות מרחוק', 'רץ, אוטומטי');
  }
}

/* ---------- 4. שינה ---------- */
function sleepSetting() {
  const ac = ps("powercfg /q SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String 'Current AC Power Setting' | Select-Object -First 1");
  const m = /0x([0-9a-f]+)/i.exec(ac || '');
  if (!m) { warn('שינה', 'לא הצלחתי לקרוא את ההגדרה', 'לבדוק ידנית בהגדרות צריכת חשמל'); return; }
  const secs = parseInt(m[1], 16);
  if (secs === 0) ok('שינה', 'כבויה בחיבור לחשמל');
  else fail('שינה', 'המחשב נרדם אחרי ' + Math.round(secs / 60) + ' דקות',
    'powercfg /change standby-timeout-ac 0');
}

/* ---------- 4b. מצב לילה ---------- */
function nightMode() {
  // שתי משימות: שינה ב-23:00 והערה ב-06:55. שינה ולא כיבוי, כי שינה
  // שומרת את הזיכרון ולכן הטרמינל וכרום שורדים את הלילה.
  // צריך להבחין בין משימה שנמחקה לבין משימה שאין הרשאה לקרוא אותה.
  // AbaItzikMorningWake רצה כ-SYSTEM. Get-ScheduledTask בלי הרשאות מנהל
  // מדווח עליה "לא נמצא", וזה שקר. schtasks לפחות אומר במפורש גישה נדחתה.
  const q = ps("foreach($n in 'AbaItzikNightSleep','AbaItzikMorningWake'){" +
    "$o=(schtasks /query /tn $n 2>&1 | Out-String);" +
    "if($o -match 'denied|נדחת'){\"$n=DENIED\"}" +
    "elseif($o -match [regex]::Escape($n)){\"$n=Ready\"}else{\"$n=MISSING\"}}");
  const has = n => q.indexOf(n + '=Ready') > -1;
  // משימת ההערה רצה כ-SYSTEM, ושאילתה בלי הרשאות מנהל מקבלת עליה
  // גישה נדחתה ולא חסר. אסור להציג את זה כאילו המשימה נמחקה.
  const denied = q.indexOf('AbaItzikMorningWake=DENIED') > -1;
  if (!has('AbaItzikNightSleep')) {
    warn('מצב לילה', 'משימת השינה חסרה', 'להריץ setup-night.ps1 בהרשאות מנהל');
  } else if (denied) {
    ok('מצב לילה', 'שינה 01:00 קיימת. ההערה רצה כ-SYSTEM ואי אפשר לקרוא אותה מכאן');
  } else if (!has('AbaItzikMorningWake')) {
    warn('מצב לילה', 'משימת ההערה חסרה', 'להריץ setup-night.ps1 בהרשאות מנהל');
  } else {
    ok('מצב לילה', 'שינה 01:00, הערה 06:00');
  }

  const rtc = ps("(powercfg /q SCHEME_CURRENT SUB_SLEEP RTCWAKE | Select-String 'Current AC Power Setting')");
  if (/0x0*1/.test(rtc)) ok('טיימר הערה', 'מורשה');
  else if (rtc) fail('טיימר הערה', 'חסום, ולכן ההערה בבוקר לא תרוץ',
    'powercfg -setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1');
}

/* ---------- 4c. שעון הגלים ---------- */
function wave() {
  // הכשל של המשימה הזאת שקט: אין שגיאה ואין התראה, פשוט בוקר
  // בלי גל. לכן לא מספיק שהמשימה קיימת, צריך שהטריגר שלה יהיה
  // יומי. טריגר חד פעמי עובד יום אחד ואז נגמר בלי להגיד כלום.
  const q = ps("$t=Get-ScheduledTask -TaskName 'AbaItzikWave' -ErrorAction SilentlyContinue;" +
    "if(-not $t){'MISSING'}else{" +
    "$d=($t.Triggers | Where-Object {$_.CimClass.CimClassName -eq 'MSFT_TaskDailyTrigger' -and $_.Enabled});" +
    "if(-not $d){'NOTDAILY'}elseif($t.State -eq 'Disabled'){'DISABLED'}else{" +
    "'OK ' + (Get-ScheduledTaskInfo -TaskName 'AbaItzikWave').NextRunTime}}");
  if (!q || q === 'MISSING') {
    fail('שעון הגלים', 'משימת הגלים חסרה, ולכן לא יהיו גלים', 'powershell -File setup-wave.ps1');
  } else if (q === 'NOTDAILY') {
    fail('שעון הגלים', 'הטריגר אינו יומי, ולכן מחר בבוקר אין גל', 'powershell -File setup-wave.ps1');
  } else if (q === 'DISABLED') {
    fail('שעון הגלים', 'המשימה מכובה', 'Enable-ScheduledTask -TaskName AbaItzikWave');
  } else {
    ok('שעון הגלים', 'יומי, הבא ' + q.slice(3).trim());
  }
}

/* ---------- 5. הדף הציבורי ---------- */
async function publicPage() {
  const code = await head(PUBLIC_URL);
  if (code === 200) ok('הדף הציבורי', PUBLIC_URL + ' מחזיר 200');
  else fail('הדף הציבורי', 'מחזיר ' + (code || 'אין תשובה'),
    'node build.js ואז commit ו-push של docs/');
}

/* ---------- 6. גיט ---------- */
function git() {
  let dirty = '';
  try {
    dirty = execFileSync('git', ['status', '--porcelain'], { cwd: HERE, encoding: 'utf8' }).trim();
  } catch (e) { warn('גיט', 'אין מאגר או ש-git לא זמין', 'לבדוק ידנית'); return; }
  const n = dirty ? dirty.split('\n').length : 0;
  if (n > 40) warn('גיט', n + ' קבצים לא שמורים', 'לעשות commit לפני שזה נערם');
  else ok('גיט', n ? n + ' קבצים בעבודה' : 'נקי');
}

/* ---------- 7. גיבוי ---------- */
function backup() {
  const dir = path.join(HERE, 'backups');
  if (!fs.existsSync(dir)) { warn('גיבוי', 'אין תיקיית גיבויים', 'node backup.js'); return; }
  const files = fs.readdirSync(dir).map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) { fail('גיבוי', 'התיקייה ריקה', 'node backup.js'); return; }
  const days = (Date.now() - files[0].t) / 864e5;
  if (days > 3) warn('גיבוי', 'האחרון מלפני ' + days.toFixed(1) + ' ימים', 'node backup.js');
  else ok('גיבוי', 'האחרון מלפני ' + days.toFixed(1) + ' ימים');
}

/* ---------- הרצה ---------- */
(async function main() {
  waitingMessages();
  chrome();
  remote();
  sleepSetting();
  nightMode();
  wave();
  git();
  backup();
  await publicPage();

  const bad = checks.filter(c => c.state !== 'ok');
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ at: new Date().toISOString(), checks }, null, 2));
  } else if (!(process.argv.includes('--quiet') && !bad.length)) {
    const mark = { ok: 'תקין ', warn: 'שים לב', fail: 'נפל  ' };
    console.log('בדיקת תקינות · ' + new Date().toLocaleString('he-IL'));
    console.log('-'.repeat(64));
    for (const c of checks) {
      console.log(mark[c.state] + ' | ' + c.name + ' | ' + c.detail);
      if (c.action) console.log('       ' + c.action);
    }
    console.log('-'.repeat(64));
    console.log(bad.length ? bad.length + ' בעיות' : 'הכל תקין');
  }
  process.exitCode = checks.some(c => c.state === 'fail') ? 1 : 0;
})();
