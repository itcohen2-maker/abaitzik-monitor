'use strict';
/*
  11.11.2026: mail from info@it-solution.co.il (tools/send-mail.py, SMTP from the environment, see
  plans/2026-11-11-self-signup-trial-sumit.md). Until SMTP is set up the mail is not sent: it waits in
  data/signup/outbox.jsonl (to and subject only, never the body, which can hold a code) and the caller is told.
*/
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function ready(env) { const e = env || process.env; return !!(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS); }

function send(dataPath, m) {
  return new Promise((resolve) => {
    if (!ready()) {
      try {
        const f = path.join(dataPath, 'signup', 'outbox.jsonl');
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), to: m.to, subject: m.subject }) + '\n');
      } catch (e) { /* nothing more to do */ }
      return resolve({ ok: false, error: 'smtp' });
    }
    const child = execFile('python3', [path.join(__dirname, '..', 'tools', 'send-mail.py')], { timeout: 40000, env: process.env }, (err, out, errOut) => {
      if (err) return resolve({ ok: false, error: String(errOut || err.message).slice(0, 160) });
      resolve({ ok: /sent/.test(out) });
    });
    child.stdin.end(JSON.stringify(m));
  });
}

// The two mails of the signup, plain Hebrew, no dashes.
function codeMail(name, code) {
  return {
    subject: 'קוד הכניסה שלך למוניטור: ' + code,
    text: 'שלום ' + name + ',\n\nקוד הכניסה שלך: ' + code + '\nמקלידים אותו בדף ההרשמה. הקוד בתוקף 15 דקות.\n\nאם לא ביקשת קוד, אפשר להתעלם מהמייל.\n\nIT Solution · המוניטור העסקי',
  };
}
function readyMail(name, url, pass) {
  return {
    subject: 'המוניטור שלך מוכן',
    text: 'שלום ' + name + ',\n\nהמוניטור שלך מוכן, ושבוע הניסיון מתחיל עכשיו: 40 פעולות, ושיחה עם המוניטור ואימונים בלי הגבלה.\n\n'
      + 'הקישור: ' + url + '\nקוד הכניסה: ' + pass + '\n\nכדאי להוסיף את הקישור למסך הבית של הטלפון. את אותו קישור אפשר לפתוח גם מהמחשב, עם אותו קוד.\n\nIT Solution · המוניטור העסקי',
  };
}

module.exports = { send, ready, codeMail, readyMail };
