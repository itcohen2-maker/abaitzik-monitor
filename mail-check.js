'use strict';
/*
  Mail check, 15.10.2026: Itzik asked for his mail every two hours until 16:00.
  Runs at 08, 10, 12, 14 and 16 Israel time, numbered for the day. Read only:
  tools/mail-search.py opens the mailbox with EXAMINE, so nothing is marked,
  moved or sent. Each check writes one line to the chat and sends a push.

  Usage: node mail-check.js        runs only at the check hours (Israel time)
         node mail-check.js --now  runs now, for a test

  The cron line runs every hour from 05 to 14 UTC, which covers 08 to 16 Israel
  in both winter and summer time. The hour filter here picks the real checks.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = __dirname;
const CHAT = path.join(ROOT, 'data/chat/chat');
const STATE = path.join(ROOT, 'data/status/mail-check.json');
const HOURS = [8, 10, 12, 14, 16];
const LINE = /^\[(\d+)\] (\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}) \| (.*)$/;
// What counts as an invoice or receipt by its subject, and what does not (card statements, ads).
const RECEIPT = /(קבלה|חשבונית|receipt|invoice)/i;
const NOT_RECEIPT = /(פירוט|פרסומת|newsletter)/i;

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Wall clock in Israel, as a local Date, so getHours() is the Israel hour.
function israelNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
}

function readState(day) {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
  return s.day === day ? s : { day, n: 0, seen: [] };
}

// The search prints "[uid] DD.MM.YYYY HH:MM | from" and the subject on the next line.
function parseMail(out) {
  const rows = [];
  const lines = out.split('\n');
  lines.forEach((l, i) => {
    const m = LINE.exec(l);
    if (!m) return;
    const [, uid, dd, mo, yy, hh, mi, from] = m;
    rows.push({
      uid,
      at: new Date(+yy, +mo - 1, +dd, +hh, +mi),
      from: from.replace(/<[^>]*>/g, '').trim(),
      subject: (lines[i + 1] || '').trim(),
    });
  });
  return rows;
}

function say(now, state, text, title, body) {
  const stamp = `${ymd(now)}-${hm(now).replace(':', '')}`;
  const chat = { at: now.toISOString(), from: 'claude', text };
  fs.writeFileSync(path.join(CHAT, `${stamp}-claude-mailcheck.json`), JSON.stringify(chat, null, 1) + '\n');
  spawnSync('/usr/bin/node', ['notify.js', title, body], { cwd: ROOT, stdio: 'inherit', timeout: 60000 });
  spawnSync('/usr/bin/node', ['push.js', `mail check ${state.n}`], { cwd: ROOT, stdio: 'inherit', timeout: 300000 });
}

function main() {
  const force = process.argv.includes('--now');
  const now = israelNow();
  if (!force && !HOURS.includes(now.getHours())) return;

  const state = readState(ymd(now));

  // One quiet retry a minute later before any error reaches Itzik (iron rule 17.10: errors only after checking again).
  const search = () => parseMail(execFileSync('/usr/bin/python3', ['-I', path.join(ROOT, 'tools/mail-search.py'), '--days', '1', '--limit', '80'],
    { encoding: 'utf8', timeout: 180000 }));
  let rows;
  try {
    try { rows = search(); } catch { spawnSync('sleep', ['60']); rows = search(); }
  } catch (e) {
    state.n += 1;
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
    const text = `בדיקת מייל ${state.n} (${hm(now)}): לא הצלחתי לפתוח את המייל עכשיו. אנסה שוב בבדיקה הבאה.`;
    say(now, state, text, 'בדיקת מייל', 'לא נפתח המייל');
    console.error(String(e.message || e).slice(0, 500));
    process.exitCode = 1;
    return;
  }

  // The first check of the day covers since 08:00. After that, the last two hours.
  const first = state.n === 0;
  const start = first
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0)
    : new Date(now.getTime() - 2 * 3600 * 1000);
  const fresh = rows
    .filter(r => r.at >= start && r.at <= now && !state.seen.includes(r.uid))
    .sort((a, b) => (/רועי/.test(a.from) ? 0 : 1) - (/רועי/.test(b.from) ? 0 : 1) || b.at - a.at);

  state.n += 1;
  state.seen = state.seen.concat(fresh.map(r => r.uid));
  state.checkedAt = now.toISOString();
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

  // No new mail: nothing is sent, no chat line, no push, no pop-up (Itzik, 16.10.2026).
  const k = fresh.length;
  if (k === 0) return;
  const text = `בדיקת מייל ${state.n} (${hm(now)}): ${k} מיילים חדשים.\n` +
    fresh.slice(0, 8).map(r => `${r.from}: ${r.subject}`).join('\n') +
    (k > 8 ? `\nועוד ${k - 8}.` : '');
  say(now, state, text + bills(fresh), 'בדיקת מייל', `${k} חדשים`);
}

/*
  27.10.2026, Itzik: invoices and receipts are collected automatically after each mail check,
  "אם זה לקוח אנחנו שואלים אותו במוניטור". In his own monitor a PC task saves each one as a PDF
  in his Drive month folder and prints it (iron rule: every invoice is recorded, he is told, it
  is printed). A customer is asked in the same chat line instead; nothing is collected unasked.
  A card statement (פירוט) is not an invoice. Returns the note for the chat line.
*/
function bills(fresh) {
  const found = fresh.filter(r => RECEIPT.test(r.subject) && !NOT_RECEIPT.test(r.subject + ' ' + r.from));
  if (!found.length) return '';
  const list = found.map(r => `${r.at.toLocaleDateString('he-IL')} ${r.from}: ${r.subject}`).join('\n');
  if (require('./lib/instance.js').name !== 'abaitzik') {
    return `\n\n🧾 נמצאו ${found.length} חשבוניות או קבלות:\n${list}\nלשמור אותן אצלך ולהדפיס? כתוב "אסוף חשבוניות".`;
  }
  const job = 'חשבוניות וקבלות חדשות מבדיקת המייל (כלל ברזל 27.10: לרשום, להודיע, להדפיס). לכל אחת:\n' + list + '\n\n'
    + '1) בג׳ימייל בכרום (itcohen2) למצוא את המייל לפי השולח, הנושא והתאריך. '
    + '2) אם יש PDF מצורף, להוריד אותו; אם אין, להפיק PDF מהמייל עצמו (העתק קבלה: ספק, תאריך, סכום, מספר עסקה). '
    + 'אם החשבונית רק מאחורי כניסה לאתר הספק, לא להקליד סיסמה: לכתוב לאיציק שצריך להיכנס. '
    + '3) לשמור ב G:/My Drive/חשבוניות והוצאות 2026/<חודש> (לדוגמה "10 אוקטובר 2026") בשם "YYYY-MM-DD ספק סכום.pdf", בלי כפילות של קובץ שכבר שם. '
    + 'כל קבלה של Google Play ושל PayPal נדחסת לדף אחד בלבד (קנה מידה לגודל עמוד), גם בקובץ וגם בהדפסה (איציק, 27.10). '
    + '4) להדפיס למדפסת Brother MFC-L2710DW series בשיטת kiosk-printing (זיכרון: print-only-with-approval). '
    + '5) בג׳ימייל לתייג את המייל בתווית "חשבוניות 2026" ובתווית הספק שתחתיה: גוגל, Anthropic, סלקום, דומיינים ואתרים, קניות (ספק חדש מקבל תווית חדשה תחת "חשבוניות 2026"). לא למחוק מיילים. '
    + '6) לענות שורה אחת: מה נשמר, הסכום, ושנשלח להדפסה. לא דפי פירוט אשראי, לא לולוס, לא מסמכים רפואיים.';
  spawnSync('/usr/bin/node', ['pc-task.js', 'add', '--quiet', '--re', 'mail-check-bills', job], { cwd: ROOT, stdio: 'ignore', timeout: 60000 });
  return `\n\n🧾 ${found.length} חשבוניות או קבלות: המחשב שומר אותן בדרייב ושולח להדפסה.`;
}

main();
