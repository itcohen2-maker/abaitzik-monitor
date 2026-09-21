'use strict';
/*
  תזכורות לתאריך רחוק.

  איציק, 21.9: "שים לי תזכורת עוד חודש לבקש תו נכה, תעשה כפתור ייעודי".
  alarm.js לא מתאים לזה: ntfy מחזיק הודעה מתוזמנת עד שלושה ימים בלבד. אז כל
  תזכורת היא קובץ ב-data/reminders/reminders, והמשימה AbaItzikReminders מריצה
  את זה כל בוקר ב-09:00 ושולחת את מה שהגיע זמנו.

  Usage: node remind.js                       שולח את מה שהגיע זמנו
         node remind.js --dry                 מראה מה היה נשלח, בלי לשלוח
         node remind.js add YYYY-MM-DD "טקסט" [id ההודעה שלו]

  התקציב: הודעה אחת לכל תזכורת, פעם אחת. רוב הימים אפס. תזכורת שנשלחה
  מסומנת בקובץ שלה, כך שריצה כפולה לא שולחת שוב, ותזכורת שלא יצאה נכנסת
  לתור של notify ומסומנת כך שלא תיכנס לתור פעמיים.
*/
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const DIR = path.join(HERE, 'data', 'reminders', 'reminders');
const args = process.argv.slice(2);

function list() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => {
    const file = path.join(DIR, f);
    return { file, doc: JSON.parse(fs.readFileSync(file, 'utf8')) };
  });
}

function add(day, text, re) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !text) {
    console.error('usage: node remind.js add YYYY-MM-DD "text" [re]');
    process.exit(1);
  }
  fs.mkdirSync(DIR, { recursive: true });
  // תשע בבוקר שלו. שעון ישראל באוקטובר עדיין קיץ עד סוף החודש, אבל התאריך
  // נקבע כאן לפי השעון של המחשב שמריץ את המשימה, שהוא שעון ישראל.
  const due = new Date(day + 'T09:00:00');
  const slug = String(text).replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30).replace(/^-|-$/g, '');
  const name = day.replace(/-/g, '') + '-' + (slug || 'reminder') + '.json';
  const doc = { at: new Date().toISOString(), due: due.toISOString(), text };
  if (re) doc.re = re;
  fs.writeFileSync(path.join(DIR, name), JSON.stringify(doc, null, 1) + '\n', 'utf8');
  console.log('נקבעה: ' + name + '  ' + due.toLocaleString('he-IL'));
}

async function run() {
  const dry = args.includes('--dry');
  const now = new Date();
  const due = list().filter(r => !r.doc.sentAt && !r.doc.queuedAt && new Date(r.doc.due) <= now);
  if (!due.length) { console.log('אין תזכורת שהגיע זמנה.'); return; }
  const ch = require('./lib/notify-channels.js');
  let changed = false;
  for (const r of due) {
    if (dry) { console.log('היה נשלח: ' + r.doc.text); continue; }
    const res = await ch.notify('תזכורת', r.doc.text);
    if (res.ok) {
      r.doc.sentAt = new Date().toISOString();
      console.log('נשלחה דרך ' + res.channel + ': ' + r.doc.text);
    } else {
      r.doc.queuedAt = new Date().toISOString();
      console.log('!! לא יצאה, בתור של notify: ' + r.doc.text + '  ' + res.tried.join(' | '));
      process.exitCode = 2;
    }
    fs.writeFileSync(r.file, JSON.stringify(r.doc, null, 1) + '\n', 'utf8');
    changed = true;
  }
  // שהדף יראה "נשלחה" ולא ימשיך להבטיח תזכורת שכבר יצאה.
  if (changed) {
    try {
      require('child_process').execFileSync(process.execPath, [path.join(HERE, 'push.js'), 'reminders: sent'],
        { cwd: HERE, stdio: 'inherit' });
    } catch (e) {
      console.error('!! push נכשל: ' + e.message);
      process.exitCode = 2;
    }
  }
}

if (args[0] === 'add') add(args[1], args[2], args[3]);
else run().catch(e => { console.error(e); process.exit(1); });
