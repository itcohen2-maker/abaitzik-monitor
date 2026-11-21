'use strict';
/*
  11.11.2026, Itzik: "בתחתית של לוח הבקרה, מהמייל: אם הגיע משהו מיוחד, אם משהו צריך אישור מיידי או את תשומת ליבי,
  ורשימה של כל הדברים שהמנהל עשה, וזה מתעדכן כל הזמן."

  Every 15 minutes (cron, 07 to 23 Israel time) this looks at the last two days of the inbox, sender and subject only,
  never the body, and sorts what matters into three groups for the 📬 block under the control board:
    now    🚨 לאישור מיידי      a request to approve, sign, confirm, a payment that failed, an account on hold
    look   👀 לתשומת לבך        invoices and payments, official or legal mail, meetings, leads, security alerts
    special ⭐ מיוחד             a person wrote to him (not a system or a mailing list), or a known client
  Marketing, newsletters, webinars and one time codes are left out.

  Plain rules, no model, read only (tools/mail-search.py opens the box with EXAMINE). It never sends, marks or answers.
  Writes data/status/mail-board.json only when the list changed, so board-refresh.js rebuilds the page only then.
  The subject of a stranger's mail is shown as plain text on Itzik's page, it is never handed to a session.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'data', 'status', 'mail-board.json');
const LINE = /^\[(\d+)\] (\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}) \| (.*)$/;

const SKIP = /\(פרסומת\)|newsletter|וובינר|webinar|ניוזלטר|מבצע|הנחה|sale|promo|unsubscribe|הקוד שלך|is your (verification )?code|verification code|קוד אימות|קוד כניסה|wetransfer|digest|סיכום שבועי|weekly/i;
const NOW = /לאישור|לאשר|נא לאשר|אישור נדרש|ממתין לאישור|לחתימה|לחתום|חתימה|דחוף|urgent|action required|נדרשת פעולה|פעולה נדרשת|confirm your|please approve|to approve|requires your|נכשל|נדחה|declined|failed payment|payment failed|suspended|הושעה|הוגבל|restricted|disabled|חסום|נחסם|expir|יפוג|פג תוקף|overdue|בפיגור|התראה אחרונה|final notice|אחרון לתשלום/i;
const LOOK = /חשבונית|קבלה|תשלום|חיוב|שולם|חוב|invoice|receipt|payment|billing|רשות המסים|מס הכנסה|מע״מ|מעמ|ביטוח לאומי|עירייה|ארנונה|בנק|כללית|מכבי|ביטוח|פנסיה|עו״ד|עורך דין|משפט|תביעה|הסכם|חוזה|contract|פגישה|פגישת|זימון|הזמנה:|invitation|updated invitation|ליד|פנייה חדשה|טופס|formsubmit|new submission|התראת אבטחה|security alert|sign.?in|כניסה חדשה|אימות|verification|app review|business verification|meta for business|google cloud|oauth/i;
const ROBOT = /no.?reply|noreply|notification|notifications|mailer|news|newsletter|info@|support@|marketing|hello@|team@|updates@|bounce|automated|do.?not.?reply/i;
const KNOWN = /רועי|אלון|איליי|ilay|שולמן|shulman|טום|רינת|יהודה|שחר|הגיתית|hagitit|יניב|נעם/i;
const SELF = /itcohen2@gmail\.com/i;

function israelNowMs() { return Date.now(); }

function parse(out) {
  const rows = [];
  const lines = out.split('\n');
  lines.forEach((l, i) => {
    const m = LINE.exec(l);
    if (!m) return;
    const [, uid, dd, mo, yy, hh, mi, from] = m;
    // the dates are Israel wall clock; store as ISO with the Israel offset of that day
    const local = `${yy}-${mo}-${dd}T${hh}:${mi}:00`;
    const off = offsetFor(local);
    rows.push({ uid, at: new Date(local + off).toISOString(), from: from.trim(), subject: (lines[i + 1] || '').trim() });
  });
  return rows;
}

// +02:00 in winter, +03:00 in summer, worked out for that very date.
function offsetFor(local) {
  const guess = new Date(local + 'Z');
  const s = guess.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'shortOffset' });
  const m = /GMT([+-]\d+)/.exec(s);
  const h = m ? parseInt(m[1], 10) : 2;
  return (h >= 0 ? '+' : '-') + String(Math.abs(h)).padStart(2, '0') + ':00';
}

function nameOf(from) {
  const n = from.replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
  return n || (/<([^>]+)>/.exec(from) || [, from])[1];
}

// "Re: Re: Fwd:" is one thread; the subject is shown and grouped without them.
function clean(subject) { return String(subject || '').replace(/^\s*((re|fwd?|הועבר|תשובה)\s*:\s*)+/i, '').trim(); }

function classify(r) {
  const s = r.subject || '', f = r.from || '', all = s + ' ' + f;
  if (SKIP.test(all)) return '';
  if (SELF.test(f)) return '';
  if (NOW.test(s)) return 'now';
  if (LOOK.test(all)) return 'look';
  if (KNOWN.test(f) || !ROBOT.test(f)) return 'special';
  return '';
}

function main() {
  let out;
  try {
    out = execFileSync('/usr/bin/python3', ['-I', path.join(ROOT, 'tools', 'mail-search.py'), '--days', '2', '--limit', '80'],
      { encoding: 'utf8', timeout: 150000 });
  } catch (e) {
    // keep the last list on the page; the error goes to the log, the check runs again in 15 minutes
    console.error(new Date().toISOString() + ' mail search failed: ' + String(e.message || e).slice(0, 200));
    let prev = {}; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (x) {}
    prev.err = new Date().toISOString();
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(prev, null, 1) + '\n');
    process.exitCode = 1;
    return;
  }
  const now = israelNowMs();
  const groups = {};
  parse(out).forEach((r) => {
    if (now - Date.parse(r.at) > 48 * 3600000) return;
    const kind = classify(r);
    if (!kind) return;
    // the same sender and subject again (five security alerts) is one line with a count
    const subj = clean(r.subject);
    const key = kind + '|' + nameOf(r.from) + '|' + subj.replace(/\d{4,}/g, '#');
    const g = groups[key] || (groups[key] = { kind, from: nameOf(r.from).slice(0, 60), subject: subj.slice(0, 140), at: r.at, n: 0, uids: [] });
    g.n += 1; g.uids.push(r.uid);
    if (r.at > g.at) g.at = r.at;
  });
  const items = Object.values(groups).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 30);
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (x) {}
  const sig = JSON.stringify(items);
  if (prev.sig === sig && !prev.err) { console.log(new Date().toISOString() + ' mail board: no change'); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), sig, items }, null, 1) + '\n');
  console.log(new Date().toISOString() + ' mail board: ' + items.length + ' items');
}

if (require.main === module) main();
module.exports = { classify, parse, nameOf, clean };
