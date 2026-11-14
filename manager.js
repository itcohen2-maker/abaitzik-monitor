'use strict';
/*
  The manager's round (Itzik, 4.11.2026: "נגדיר אותך כמנהל"). Server only, timer
  monitor-manager.timer at 07:25, 13:00 and 18:00 Israel; cal-pull.js on the PC also
  runs it right after it reads the calendar (07:15).

  Writes data/manager/manager/<YYYYMMDD>.json (the "המנהל" card on the home screen,
  lib/manager.js), schedules a ntfy alarm 30 minutes before each timed calendar
  event of today (alarm.js, once per event), and pushes:
    morning: one push with what is left for him today (once a day),
    18:00:   one push only if "מה בצלחת" or the WhatsApp status is still open.
  Budget: at most 2 pushes a day plus one per timed event.

  Usage: node manager.js [--dry] [--evening]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');
const M = require('./lib/manager.js');

const DRY = process.argv.includes('--dry');
const EVENING = process.argv.includes('--evening') ||
  Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false })) >= 17;
const dataPath = inst.dataPath;
const dir = path.join(dataPath, 'manager');
const stateFile = path.join(dir, 'state.json');

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function log(s) { console.log(new Date().toISOString().slice(0, 19) + '  ' + s); }
function run(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { log('!! ' + args[0] + ' failed: ' + String(e.stderr || e.message).slice(0, 200)); return null; }
}

if (!DRY) run('node', ['manager-work.js']); // 11.11: all three rounds (Itzik: "המנהל יבדוק 3 פעמים ביום ויטפל") // 8.11: the manager's own checks first, so the card shows them

const now = Date.now();
const inp = M.gather(dataPath, __dirname, now);
// 10.11: the setup forms that came back are pulled into the customers' monitors first (lib/setup-intake.js); --dry only reads the last result
inp.intake = (() => { try { return DRY ? JSON.parse(fs.readFileSync(path.join(dataPath, 'setup-intake', 'summary.json'), 'utf8')) : require('./lib/setup-intake.js').managerRound({ data: dataPath }); } catch (e) { log('intake: ' + String(e.message).slice(0, 100)); return null; } })();
const m = M.build(inp);
// 12.11.2026, Itzik: "המנהל צריך תמיד לבדוק את החיבורים שהם לא נשברים מהטופס למייל". Every round: the signup road (signup-check.js).
// A warn is fixed by the PC like any problem on the card (the FIX loop below).
try { const sc = JSON.parse(execFileSync('node', ['signup-check.js'], { cwd: __dirname, encoding: 'utf8', timeout: 120000 }).trim().split('\n').pop()); if (sc && sc.k) m.items.push({ k: sc.k, st: sc.st, t: sc.t, sub: sc.sub }); } catch (e) { m.items.push({ k: 'signup', st: 'warn', t: '📝 בדיקת ההרשמה לא רצה', sub: String(e.message).slice(0, 120) }); }
// 12.11.2026, Itzik: "שומר שכל הבקשות המיוחדות של המשתמשים החדשים בוצעו". The wish from each trial's questionnaire (lib/trial-wishes.js).
try { const TW = require('./lib/trial-wishes.js'); const wi = TW.item(TW.list(dataPath, now)); if (wi) m.items.push(wi); } catch (e) { log('wishes: ' + e.message); }
if (DRY) { console.log(JSON.stringify(m, null, 1)); console.log(M.pushText(m)); process.exit(0); }

fs.mkdirSync(path.join(dir, 'manager'), { recursive: true });
fs.writeFileSync(path.join(dir, 'manager', m.day.replace(/-/g, '') + '.json'), JSON.stringify(m, null, 1));
log('round ' + m.day + ': ' + m.items.map(i => i.k + '=' + i.st).join(' '));

const st = readJson(stateFile, {});
st.alarms = (st.alarms || []).filter(x => x.startsWith(m.day));
// 11.11: a plate story posted and not on the site or in the highlight: the manager sends the PC job himself, once per item.
st.plateSite = st.plateSite || {};
for (const it of M.plateSiteMissing(inp.plate, now)) {
  if (st.plateSite[it.id]) continue;
  if (run('node', ['pc-task.js', 'add', '--quiet', '--re', 'plate-site-' + it.id, M.plateSiteJob(it)]) !== null) { st.plateSite[it.id] = new Date(now).toISOString(); log('plate site job ' + it.id); }
}
// 11.11: open external approvals are checked by the PC itself (browser + mail): pending or needs info once a day, not submitted once a week.
st.apprTask = st.apprTask || {};
for (const a of (inp.approvals || [])) {
  const A = require('./approvals.js');
  if (!A.OPEN(a.status)) continue;
  const gap = (a.status === 'notSubmitted' ? 7 * 24 : 20) * 3600e3;
  if (st.apprTask[a.id] && now - Date.parse(st.apprTask[a.id]) < gap) continue;
  if (run('node', ['pc-task.js', 'add', '--quiet', '--re', 'approval-' + a.id, A.taskText(a)]) !== null) { st.apprTask[a.id] = new Date(now).toISOString(); log('approval check ' + a.id); }
}
// 12.11.2026, Itzik: "רואה חשבון רוצה את כל החשבוניות בהדפסות ... לאסוף מכל המיילים, משלושת החשבונות, לשים בתיקייה בדרייב,
// ובסוף החודש אני אדפיס". mail-check.js now only saves each invoice to the month folder. On the 1st of the month the manager
// sends one PC job for the month that ended: sweep the three mailboxes, fill the gaps, one merged PDF to print, and a 📋 item.
{
  const il = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); // YYYY-MM-DD
  if (il.slice(8, 10) === '01') {
    const d = new Date(Date.parse(il + 'T12:00:00Z') - 2 * 864e5);
    const ym = d.toISOString().slice(0, 7);
    const HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    const mon = String(d.getUTCMonth() + 1).padStart(2, '0') + ' ' + HE[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    if (st.invoiceMonth !== ym) {
      const job = 'סוף חודש, חשבוניות לרואה החשבון (איציק 12.11.2026): כל החשבוניות והקבלות של ' + mon + ' מודפסות יחד פעם בחודש. '
        + '1) לעבור בג׳ימייל בכרום על שלושת החשבונות: itcohen2, itcohen2p1 ו 100lolosf@gmail.com (עם f; את מספר u בודקים לפי הכתובת), ולחפש את כל החשבוניות והקבלות של ' + mon + ' (חשבונית, קבלה, invoice, receipt, PayPal, Google Play, מטא, סלקום, Anthropic, דומיינים). '
        + '2) כל אחת שעוד לא נמצאת ב G:/My Drive/חשבוניות והוצאות 2026/' + mon + ' לשמור שם כ PDF בשם "YYYY-MM-DD ספק סכום.pdf" (בלי מייל PDF: להפיק PDF מהמייל) ולהוסיף שורה ל "00 רשימה לרואה החשבון.txt" שבאותה תיקייה. לא דפי פירוט אשראי ולא מסמכים רפואיים. '
        + '3) לאחד את כל ה PDF של החודש, לפי תאריך, לקובץ אחד "להדפסה ' + mon + '.pdf" באותה תיקייה (Google Play ו PayPal בדף אחד כל אחת), ובעמוד הראשון את הרשימה עם הסכום הכולל. '
        + '4) לא להדפיס: איציק מדפיס כשהוא מחליט. אם הוא כותב "תדפיס את החשבוניות", מדפיסים את הקובץ המאוחד בשיטה שבזיכרון, ורושמים ב "00 מה הודפס.txt". '
        + '5) לענות שורה אחת: כמה חשבוניות, הסכום הכולל, ושהקובץ "להדפסה ' + mon + '.pdf" מוכן בדרייב.';
      if (run('node', ['pc-task.js', 'add', '--re', 'invoices-' + ym, job]) !== null) {
        st.invoiceMonth = ym; log('invoices month job ' + ym);
        try { require('./lib/handle.js').complete({ key: 'invoices-' + ym, kind: 'lead', who: 'רואה החשבון', title: 'החשבוניות של ' + mon + ' נאספות לקובץ אחד להדפסה בדרייב. כשמוכן: "תדפיס את החשבוניות"', link: 'answers' }); } catch (e) { log('invoices handle: ' + e.message); }
      }
    }
  }
}
// 11.11.2026, Itzik: "אני רוצה שהמנהל יבדוק 3 פעמים ביום ויטפל בבעיה או בבקשה".
// Every round, each problem on the card (st warn) that is not his alone becomes one work order in the PC queue
// (pc-task.js, full Claude with memory). Once per problem per day, at most 3 per round. The answer lands in his chat.
const FIX_SKIP = new Set(['handle', 'cal', 'brief', 'leads', 'plate', 'status', 'linkedin', 'work']); // his own, or already a task elsewhere
const FIX_HIM = /(לשלם|תשלום|כסף|בנק|חתימ|דרכון|סלפי|לאשר|אישורך|באישורך|להתקשר|זיכוי)/;
st.fixed = st.fixed || {};
for (const k of Object.keys(st.fixed)) if (!k.startsWith(m.day)) delete st.fixed[k];
let fixN = 0;
for (const it of m.items) {
  if (fixN >= 3 || it.st !== 'warn' || FIX_SKIP.has(it.k)) continue;
  const key = m.day + '|' + it.k + '|' + it.t;
  if (st.fixed[key] || FIX_HIM.test(it.t + ' ' + (it.sub || ''))) continue;
  const job = 'המנהל מצא בעיה בסבב ומבקש לטפל בה עכשיו: ' + it.t + (it.sub ? '. פרטים: ' + it.sub : '') + '. '
    + 'לבדוק את הסיבה, לתקן מה שאפשר לתקן לבד, ולוודא שהתיקון עובד. תמיד לבדוק הכל (איציק, 14.11): את המצב בפועל אחרי התיקון, את המוניטור החי בדפדפן אם זה מופיע שם, ומה התיקון יכול לשבור בצד. לא לכתוב "לא בדקתי", לבדוק. כללים: בלי לשלם, בלי לשלוח לאנשים, בלי לפרסם ובלי למחוק מידע של לקוח; '
    + 'מה שדורש את איציק (כסף, חתימה, אישור, לחיצה בטלפון) לא לעשות אלא לכתוב לו במשפט אחד מה נשאר לו. בסוף שורה אחת בעברית: מה מצאת ומה עשית.';
  if (run('node', ['pc-task.js', 'add', '--re', 'manager-fix-' + it.k + '-' + m.day, job]) !== null) { st.fixed[key] = new Date(now).toISOString(); fixN++; log('fix job ' + it.k); }
}
// 14.11.2026, Itzik: "כל שבוע ביום שבת המנהל ידאג שיש מלאי סרטונים וסטטוסים לכל השבוע הבא. תמיד".
// Saturday, every round: lib/stock.js counts the next week (Sunday to Friday) of every channel. Each channel that is
// short becomes one PC job (pc-task.js, full Claude with memory), once per channel per Saturday, and checks itself after.
const isSat = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getDay() === 6;
if (isSat) {
  st.satStock = st.satStock && st.satStock.day === m.day ? st.satStock : { day: m.day, sent: {} };
  let S = [];
  try {
    const stock = require('./lib/stock.js');
    S = stock.compute({
      st: readJson(path.join(__dirname, 'docs', 'status', 'queue.json'), []),
      nr: readJson('/home/monitor/ner-queue.json', []),
      pl: readJson(path.join(__dirname, 'docs', 'plate', 'queue.json'), []),
      ai: readJson(path.join(__dirname, 'docs', 'ai', 'queue.json'), []),
      li: readJson(path.join(__dirname, 'docs', 'linkedin', 'stock.json'), null),
    }, m.day);
  } catch (e) { log('!! saturday stock: ' + e.message); }
  const low = S.filter(c => c.low);
  log('saturday stock: ' + (low.length ? low.map(c => c.id).join(',') + ' short' : 'full week'));
  for (const c of low) {
    if (st.satStock.sent[c.id]) continue;
    if (c.need && (c.ready || 0) + (c.held || 0) >= c.need) { log("saturday stock " + c.id + ": enough made, waiting for his approval"); continue; } // the AI channel: approval is his, not more videos
    const job = 'המנהל, בדיקת שבת (איציק 14.11: כל שבת לדאוג שיש מלאי סרטונים וסטטוסים לכל השבוע הבא, תמיד). '
      + c.title + ': ' + c.line + '. להשלים עכשיו את כל השבוע הבא, ראשון עד שישי, לפי הסקילים והכללים של הערוץ הזה. '
      + 'מה שצריך את האישור של איציק נכנס לתור כמחכה לאישורו, לא עולה לרשת. '
      + 'תמיד לבדוק הכל: אחרי ההכנה לספור שוב את התור ולוודא שכל יום בשבוע הבא מכוסה ושהקבצים באמת קיימים. בסוף שורה אחת בעברית: מה הוכן ומה עוד חסר.';
    if (run('node', ['pc-task.js', 'add', '--re', 'sat-stock-' + c.id + '-' + m.day, job]) !== null) { st.satStock.sent[c.id] = new Date(now).toISOString(); log('saturday stock job ' + c.id); }
  }
}
for (const e of M.alarmsDue(m, now, st.alarms)) {
  const at = new Date(e.ms - 30 * 60000).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
  const out = run('node', ['alarm.js', at, 'בעוד חצי שעה: ' + e.title + (e.where ? ', ' + e.where : '')]);
  if (out !== null) { st.alarms.push(m.day + '|' + e.id); log('alarm ' + at + ' ' + e.title); }
}

const p = M.pushText(m);
const HOUR = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }));
const li = m.items.find(i => i.k === 'linkedin' && i.st === 'warn');
if (!EVENING && st.pushed !== m.day && p) {
  if (run('node', ['notify.js', p.title, p.body]) !== null) { st.pushed = m.day; st.pushedAt = new Date().toISOString(); } // 10.11: pushedAt feeds the 08:30 WhatsApp fallback (lib/morning-wa.js)
} else if (!EVENING && HOUR >= 12 && li && st.liNoon !== m.day) {
  // 9.11: the 13:00 round, one more reminder for a LinkedIn post still waiting for his approval (once a day)
  if (run('node', ['notify.js', 'המנהל: ' + li.t, li.sub]) !== null) st.liNoon = m.day;
} else if (EVENING && st.evening !== m.day) {
  const open = m.items.filter(i => ((i.k === 'plate' || i.k === 'status') && i.st === 'todo') || (i.k === 'linkedin' && i.st === 'warn'));
  if (open.length && run('node', ['notify.js', 'תזכורת ערב', open.map(i => i.t + ': ' + i.sub).join('\n')]) !== null) st.evening = m.day;
}
// 10.11: an item waiting in 📋 לטיפול for more than 3 hours is pushed again at the 13:00 and 18:00 rounds (once per round).
// The push follows quiet hours like any push; the tile on the home screen blinks at every hour.
const hd = m.items.find(i => i.k === 'handle');
if (hd && hd.hours > 3 && !(HOUR < 12) && st.handleAt !== m.day + '-' + (EVENING ? 'e' : 'n')) {
  if (run('node', ['notify.js', 'המנהל: ' + hd.t, hd.sub]) !== null) st.handleAt = m.day + '-' + (EVENING ? 'e' : 'n');
}
fs.writeFileSync(stateFile, JSON.stringify(st));
run('node', ['push.js', 'manager round']);
