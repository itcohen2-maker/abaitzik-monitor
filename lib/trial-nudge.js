'use strict';
/*
  12.11.2026, Itzik: "במקרה ומישהו נרשם ולא נכנס תוך כמה שעות, המערכת תשלח לו התראה. במידה ומישהו נכנס וניסה
  וחיבר או לא חיבר משהו, והשתמש יום אחד ואחרי יומיים לא השתמש, המערכת בשבוע הניסיון תיתן לו התראה, וביום לפני
  סיום השבוע תיתן לו שוב התראה".

  Three mails in a trial week, each at most once per trial, from info@ (lib/mailer.js):
    noEntry  the monitor is ready NOENTRY_H hours and nobody opened it
    idle     he opened it, and has not been back for IDLE_H hours (while the trial still runs)
    lastDay  the last day of the trial (from day 6 on), whatever he did
  Mail goes out only 09:00 to 20:00 Israel time, never on Saturday; a mail that waits goes at the next window.
  Pure: decide() takes the facts and the clock and returns which mail is due. trial-nudge.js does the files.
  No dashes in any text a customer reads.
*/
const NOENTRY_H = 3;
const IDLE_H = 48;
const DAY = 864e5;

function ilParts(now) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false, weekday: 'short' });
  const p = {}; f.formatToParts(new Date(now)).forEach((x) => { p[x.type] = x.value; });
  return { hour: Number(p.hour) % 24, wd: p.weekday };
}
function window(now) { const p = ilParts(now); return p.wd !== 'Sat' && p.hour >= 9 && p.hour < 20; }

/*
  f: { start (ms, the trial began = the monitor was ready), days (7), visits: [ms of session starts and lasts],
       lastVisit (ms or 0), sent: { noEntry, idle, lastDay } }
  Returns 'noEntry' | 'idle' | 'lastDay' | ''.
*/
function decide(f, now) {
  const s = f.sent || {};
  const end = f.start + (f.days || 7) * DAY;
  if (!f.start || now >= end) return '';
  if (!window(now)) return '';
  // the last day comes first: it is the one that must not be missed
  if (!s.lastDay && now >= end - DAY) return 'lastDay';
  if (!f.lastVisit) return !s.noEntry && now - f.start >= NOENTRY_H * 3600e3 ? 'noEntry' : '';
  if (!s.idle && now - f.lastVisit >= IDLE_H * 3600e3) return 'idle';
  return '';
}

const hello = (name) => (name && name.indexOf('@') < 0 ? 'שלום ' + name + ',' : 'שלום,');
const SIGN = '\n\nIT Solution · המוניטור העסקי';
const CODE = 'קוד הכניסה נמצא במייל "המוניטור שלך מוכן".';

/*
  k: the mail. c: { name, url, google (Gmail connected), mails (sorted since the last visit), urgent, daysLeft, used, total }
*/
function mail(k, c) {
  if (k === 'noEntry') return {
    subject: 'המוניטור שלך מחכה לך',
    text: hello(c.name) + '\n\nהמוניטור שלך מוכן כבר כמה שעות, ועוד לא נכנסת אליו.\n\n'
      + 'הקישור: ' + c.url + '\n' + CODE + '\n\n'
      + 'הצעד הראשון לוקח דקה: לחבר את הג׳ימייל. המוניטור קורא את המיילים של השבוע האחרון, מראה לך מה דחוף, ומכין טיוטות תשובה. שום דבר לא נשלח בלי שאתה לוחץ שלח.' + SIGN,
  };
  if (k === 'idle') {
    const did = c.google && c.mails
      ? 'מאז הפעם האחרונה שנכנסת, המוניטור מיין בשבילך ' + c.mails + ' מיילים' + (c.urgent ? ', ' + c.urgent + ' מהם דחופים' : '') + '. הכל מחכה לך במסך 📧 מייל.'
      : c.google ? 'המוניטור ממשיך למיין לך את המייל, וכל מה שחדש מחכה לך במסך 📧 מייל.'
        : 'עוד לא חיברת את הג׳ימייל. זה לוקח דקה, ומאותו רגע המוניטור ממיין לך את המייל, מראה מה דחוף ומכין טיוטות תשובה. הכפתור "🚀 בוא נתחיל" מחכה לך בראש המסך.';
    return {
      subject: c.google && c.mails ? 'המוניטור מיין לך ' + c.mails + ' מיילים' : 'המוניטור שלך מחכה לך',
      text: hello(c.name) + '\n\nלא נכנסת למוניטור כבר יומיים.\n' + did + '\n\n'
        + 'נשארו לך ' + c.daysLeft + ' ימים בשבוע הניסיון.\n'
        + 'הקישור: ' + c.url + '\n' + CODE + SIGN,
    };
  }
  if (k === 'lastDay') return {
    subject: 'שבוע הניסיון נגמר ' + (c.endText || 'מחר'),
    text: hello(c.name) + '\n\nשבוע הניסיון שלך במוניטור נגמר ' + (c.endText || 'מחר') + '.'
      + (c.used ? ' השתמשת ב ' + c.used + ' פעולות מתוך ' + c.total + '.' : '')
      + (c.google && c.mails ? ' המוניטור מיין בשבילך ' + c.mails + ' מיילים השבוע.' : '') + '\n\n'
      + 'כדי להמשיך בלי הפסקה: חבילת הכניסה, 390 ₪ לחודש, באריח 📦 החבילה החודשית בתוך המוניטור. כל מה שהמוניטור למד עליך נשאר.\n'
      + 'רוצה חבילה גדולה יותר, או שיש שאלה? אפשר פשוט לענות למייל הזה.\n\n'
      + 'הקישור: ' + c.url + SIGN,
  };
  return null;
}

// "ביום ראשון ב 10:00": when the trial ends, in Israel time. The last day mail can go out on Sunday morning when
// day six was a Saturday, so it names the day and hour and never says "tomorrow".
const DAYS_HE = { Sun: 'ראשון', Mon: 'שני', Tue: 'שלישי', Wed: 'רביעי', Thu: 'חמישי', Fri: 'שישי', Sat: 'שבת' };
function endText(end) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(end)).forEach((x) => { p[x.type] = x.value; });
  const h = Number(p.hour) % 24;
  return (p.weekday === 'Sat' ? 'בשבת' : 'ביום ' + DAYS_HE[p.weekday]) + ' ב ' + (h < 10 ? '0' : '') + h + ':' + p.minute;
}

module.exports = { decide, mail, window, endText, NOENTRY_H, IDLE_H };
