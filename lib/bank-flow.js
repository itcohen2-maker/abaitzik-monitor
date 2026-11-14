'use strict';
/*
  14.11.2026, Itzik: the monitor downloads the bank movements file on a computer of
  the customer, and the customer logs in himself. "המוניטור יפתח לו את הכרום, הוא
  יתחבר, יעדכן אפילו דרך הוואטסאפ, והמוניטור יתחבר ויתנתק".

  The flow, on WhatsApp, Itzik's numbers only (wa-bridge.js calls waTurn):
    "בנק"        the bank computer (pc-task.js --pc bank) opens the bank's login page in
                 Chrome. Its answer comes back on WhatsApp: "תתחבר ותכתוב התחברתי".
    "התחברתי"    within 20 minutes: Claude on that computer, with Chrome, goes to the
                 movements screen, exports the file, copies it to its out folder (which
                 goes up to the monitor), and logs out of the bank. The answer and the
                 file name come back on WhatsApp.
    "ביטול בנק"  closes the session here.
  The password and the SMS code are typed only by the customer, only on his computer.
  Nothing here or on the computer ever asks for them, stores them, or types them.

  State: data/bank/session.json { stage: 'open'|'waiting'|'download', at, task }.
  First test: Itzik's own monitor, Bank Hapoalim, the second computer (keys.json pcName "bank").
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PC = 'bank';
const WAIT_MS = 20 * 60 * 1000;
const BANK = {
  name: 'בנק הפועלים',
  login: 'https://login.bankhapoalim.co.il/ng-portals/auth/he/',
};

function norm(t) { return String(t || '').replace(/[‎‏"'״׳.!?,]/g, '').replace(/\s+/g, ' ').trim(); }
function isOpen(t) { return /^(בנק|הבנק|תוריד (את )?(ה)?בנק|עדכון בנק|תעדכן (את )?(ה)?בנק)$/.test(norm(t)); }
function isIn(t) { return /^(התחברתי|מחובר|נכנסתי|אני מחובר|התחברתי לבנק)$/.test(norm(t)); }
function isCancel(t) { return /^(ביטול בנק|בטל בנק|לבטל בנק)$/.test(norm(t)); }

function stateFile(dataPath) { return path.join(dataPath, 'bank', 'session.json'); }
function readState(dataPath) { try { return JSON.parse(fs.readFileSync(stateFile(dataPath), 'utf8')); } catch (e) { return null; } }
function writeState(dataPath, s) {
  fs.mkdirSync(path.dirname(stateFile(dataPath)), { recursive: true });
  fs.writeFileSync(stateFile(dataPath), JSON.stringify(s, null, 1), 'utf8');
}

function pcTask(root, args) {
  const out = execFileSync(process.execPath, [path.join(root, 'pc-task.js'), 'add', '--wa', '--pc', PC].concat(args),
    { cwd: root, encoding: 'utf8', timeout: 30000 });
  const lines = out.trim().split('\n');
  return { id: lines[0], on: /pc: on/.test(out) };
}
function online(root) {
  try { return /^on/.test(execFileSync(process.execPath, [path.join(root, 'pc-task.js'), 'online', '--pc', PC], { cwd: root, encoding: 'utf8', timeout: 15000 })); }
  catch (e) { return false; }
}

function openTask() {
  return [
    '1. הרץ ב PowerShell בדיוק את הפקודה הזאת, שפותחת את אתר הבנק בכרום של המחשב:',
    "   Start-Process 'chrome.exe' '" + BANK.login + "'",
    '2. אל תעשה שום דבר נוסף. אל תיגע בדף, אל תמלא שדות.',
    'התשובה, מילה במילה: פתחתי את אתר ' + BANK.name + ' במחשב. תתחבר עם הסיסמה והקוד, ותכתוב לי כאן: התחברתי',
  ].join('\n');
}

function downloadTask(today) {
  return [
    'המשתמש כבר התחבר בעצמו לאתר ' + BANK.name + ' בכרום של המחשב הזה. אתה לא מתחבר ולא מקליד שום סיסמה או קוד.',
    '1. בכרום, פתח את הלשונית של ' + BANK.name + ' (login.bankhapoalim.co.il או www.bankhapoalim.co.il). אם אין, פתח לשונית חדשה בכתובת https://login.bankhapoalim.co.il/ng-portals/rb/he/homepage',
    '2. אם מופיע מסך כניסה שמבקש סיסמה או קוד: עצור כאן. אל תמלא כלום. התשובה: לא מחובר לבנק. צריך להתחבר שוב ולכתוב התחברתי.',
    '3. עבור למסך תנועות בעובר ושב (בסרגל העליון: עו״ש, ואז תנועות בחשבון).',
    '4. בחר טווח תאריכים של 90 הימים האחרונים, עד היום ' + today + '. אם אין בחירה חופשית, בחר את הטווח הארוך ביותר עד שלושה חודשים.',
    '5. לחץ על כפתור הייצוא לאקסל (סמל של אקסל, או ייצוא, או הורדה). חכה עד 60 שניות שהקובץ יסיים לרדת.',
    '6. מצא בתיקיית ההורדות של המשתמש (%USERPROFILE%\\Downloads) את הקובץ החדש ביותר מסוג xlsx, xls או csv שנוצר בדקות האחרונות.',
    '7. העתק אותו (לא להזיז) לתיקיית התוצרים של המשימה, בשם: תנועות בנק ' + today + ' + הסיומת המקורית.',
    '8. חזור לאתר הבנק ולחץ על יציאה או התנתקות. ודא שמופיע שוב מסך הכניסה. אחר כך סגור את הלשונית.',
    '9. גם אם צעד 3 עד 7 נכשל: בצע את צעד 8, התנתקות, לפני שאתה עונה.',
    'התשובה: כמה שורות תנועה יש בקובץ (אם ראית), מאיזה תאריך עד איזה תאריך, והאם ההתנתקות הצליחה.',
  ].join('\n');
}

function ilDate() {
  return new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '.');
}

// Returns true when the text was a bank command (and was answered with send).
async function waTurn(o) {
  const { root, dataPath, text, send } = o;
  const st = readState(dataPath);
  const fresh = st && Date.now() - Date.parse(st.at) < WAIT_MS;

  if (isCancel(text)) {
    if (st) writeState(dataPath, { stage: 'closed', at: new Date().toISOString() });
    await send('✓ ביטלתי את חיבור הבנק. אם נשארת מחובר באתר, כדאי ללחוץ שם על יציאה.');
    return true;
  }
  if (isOpen(text)) {
    if (fresh && (st.stage === 'waiting' || st.stage === 'download')) {
      await send(st.stage === 'download' ? 'ההורדה מהבנק כבר רצה במחשב. התשובה תגיע לכאן.' : 'אתר הבנק כבר פתוח במחשב. כשתתחבר, תכתוב לי: התחברתי');
      return true;
    }
    if (!online(root)) { await send('המחשב של הבנק לא מחובר עכשיו. צריך להדליק אותו, ואז לכתוב שוב: בנק'); return true; }
    const t = pcTask(root, ['--model', 'haiku', openTask()]);
    writeState(dataPath, { stage: 'waiting', at: new Date().toISOString(), task: t.id });
    await send('🏦 מבקש מהמחשב לפתוח את אתר ' + BANK.name + '. עוד רגע תגיע הודעה שהוא פתוח.');
    return true;
  }
  if (isIn(text)) {
    if (!fresh || st.stage !== 'waiting') return false;   // "התחברתי" with no bank session is an ordinary message
    const t = pcTask(root, ['--chrome', '--model', 'sonnet', downloadTask(ilDate())]);
    writeState(dataPath, { stage: 'download', at: new Date().toISOString(), task: t.id });
    await send('✓ מוריד עכשיו את קובץ התנועות ואז מתנתק מהבנק. זה לוקח כמה דקות, והתשובה תגיע לכאן.');
    return true;
  }
  return false;
}

module.exports = { waTurn, isOpen, isIn, isCancel, openTask, downloadTask, PC };
