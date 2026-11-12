'use strict';
/*
  12.11.2026, Itzik: "להוסיף למנהל עוד עבודה, שהוא צריך תמיד לבדוק את החיבורים שהם לא נשברים מהטופס למייל".
  The whole road of a self signup, checked without sending anyone a mail:
    1. the form page it-solution.co.il/start/ answers and posts to our signup API,
    2. the API lets that page in (CORS) and answers (a mail with a typo is refused, so no code goes out),
    3. the SMTP server of info@ takes our login (connect, STARTTLS, login, quit: nothing is sent),
    4. in the last 24 hours no code mail failed ("signup code not sent" in /var/log/monitor-wa.log),
    5. no verified signup is stuck in the queue (queued or building) for more than 20 minutes.
  Prints one JSON line { st: 'ok'|'warn', t, sub, bad: [...] }. manager.js puts it on the card as k 'signup', and a
  warn becomes a work order like any problem there. Needs /etc/monitor.env for the SMTP check (manager runs with it).
  node signup-check.js
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PAGE = 'https://it-solution.co.il/start/';
const API = 'https://wa.abaitzik.com/api/signup';
const ORIGIN = 'https://it-solution.co.il';

async function check() {
  const bad = [];
  const tm = (ms) => ({ signal: AbortSignal.timeout(ms) });
  try {
    const r = await fetch(PAGE, tm(20000));
    const h = await r.text();
    if (r.status !== 200) bad.push('דף ההרשמה מחזיר ' + r.status);
    else if (!h.includes(API)) bad.push('דף ההרשמה לא שולח לכתובת ההרשמה שלנו');
  } catch (e) { bad.push('דף ההרשמה לא נפתח'); }
  try {
    const r = await fetch(API, Object.assign({ method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } }, tm(15000)));
    if (r.headers.get('access-control-allow-origin') !== ORIGIN) bad.push('השרת לא מאשר את דף ההרשמה (CORS)');
  } catch (e) { bad.push('שרת ההרשמה לא עונה'); }
  try {
    const r = await fetch(API, Object.assign({ method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'בדיקת המנהל', email: 'manager-check@gmail.con', terms: true }) }, tm(15000)));
    const j = await r.json().catch(() => ({}));
    if (j.error !== 'email') bad.push('שרת ההרשמה ענה לא כצפוי (' + r.status + ' ' + (j.error || '') + ')');
  } catch (e) { bad.push('שרת ההרשמה לא עונה לשליחה'); }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      execFileSync('python3', ['-c', [
        'import os,smtplib,ssl',
        's=smtplib.SMTP(os.environ["SMTP_HOST"],int(os.environ.get("SMTP_PORT") or 587),timeout=25)',
        's.starttls(context=ssl.create_default_context())',
        's.login(os.environ["SMTP_USER"],os.environ["SMTP_PASS"])',
        's.quit()',
      ].join('\n')], { timeout: 40000, stdio: 'ignore', env: process.env });
    } catch (e) { bad.push('שרת המייל של info@ לא מקבל את הכניסה שלנו, קודים לא יוצאים'); }
  } else bad.push('אין הגדרות שרת מייל בסביבה של הבדיקה');
  try {
    const since = Date.now() - 24 * 3600e3;
    const lines = fs.readFileSync('/var/log/monitor-wa.log', 'utf8').split('\n').slice(-4000);
    const fails = lines.filter((l) => /signup code not sent/.test(l) && Date.parse(l.slice(0, 24)) > since);
    if (fails.length) bad.push(fails.length + ' קודי הרשמה לא נשלחו ב 24 השעות האחרונות');
  } catch (e) { /* no log here: not on the server */ }
  try {
    const Q = path.join(__dirname, 'data', 'signup', 'queue');
    const stuck = fs.readdirSync(Q).filter((n) => /\.json$/.test(n)).map((n) => { try { return JSON.parse(fs.readFileSync(path.join(Q, n), 'utf8')); } catch (e) { return null; } })
      .filter((q) => q && (q.state === 'queued' || q.state === 'building') && Date.now() - Date.parse(q.updatedAt || q.at) > 20 * 60e3);
    if (stuck.length) bad.push(stuck.length + ' נרשמים מחכים יותר מ 20 דקות למוניטור (' + stuck.map((q) => q.id).join(', ') + ')');
  } catch (e) { /* no queue yet */ }
  return bad.length
    ? { k: 'signup', st: 'warn', t: '📝 ההרשמה למוניטור נשברה', sub: bad.join(' · '), bad }
    : { k: 'signup', st: 'ok', t: '📝 ההרשמה למוניטור תקינה', sub: 'מהטופס עד המייל, נבדק עכשיו', bad };
}

module.exports = { check };
if (require.main === module) check().then((r) => console.log(JSON.stringify(r))).catch((e) => console.log(JSON.stringify({ k: 'signup', st: 'warn', t: '📝 בדיקת ההרשמה נכשלה', sub: String(e.message).slice(0, 120), bad: ['check'] })));
