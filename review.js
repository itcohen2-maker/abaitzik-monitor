'use strict';
/*
  The reviewer. Improvements only.

  Itzik, 30.9, before Rinat joins as a customer: "I asked you several times to
  make an app that goes over it and brings ideas for improvements, only
  improvements." So once a day a Claude session reads this monitor the way a
  new customer would meet it, and returns a short list of concrete things to
  make better. It can only read: no edits, no shell, no network. What it finds
  lands on the "רעיונות" screen, where "רוצה את זה" sends the idea to me like
  any other request, so nothing changes until he picks it.

  Usage: node review.js            run a review, save the ideas, publish
         node review.js --dry      print the ideas, save nothing
*/
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const DRY = process.argv.includes('--dry');
const DIR = path.join(inst.dataPath, 'better', 'better');
const MAX = 6;

function existing() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; }
  }).filter(Boolean);
}

// Itzik, 30.10: on Sundays the reviewer also looks at the home tiles and proposes removing the finished ones.
// Same daily session and the same cap of six, so no extra run and no extra cost on other days.
function isSunday() {
  return new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).startsWith('Sun');
}

function prompt(seen) {
  return [
    'אתה בודק את "המוניטור", אפליקציית דף אחד לטלפון שאבא איציק מקים ללקוחות שלא מבינים בטכנולוגיה.',
    'הקוד בתיקייה הזאת: build.js בונה את הדף (HTML, CSS ו-JS בתוך מחרוזות), listen.js ו-worker.js מקבלים הודעות ועונים,',
    'tenants-*.js מסנכרנים ובודקים לקוחות, setup-server.js הוא ההגדרה הראשונה של לקוח, plans/ ו-README.md מתארים את המוצר.',
    'הלקוח הבא: בעל עסק קטן שעובד מהאייפון, לא טכנולוגי, ומשתמש בזה כדי לדבר עם קלוד ולקבל תוצרים.',
    // Itzik, 12.10: no approval to develop for Rinat B's Home Style monitor, so nothing of it is proposed.
    'לא להציע שום דבר למוניטור של רינת ב ורוני בהום סטייל: משלוחים, הזמנות, ספקים, התראות ודוחות שלהם. אין אישור לפתח שם.',
    '',
    'המשימה: רק שיפורים. לא לתקן, לא לשנות קבצים. לקרוא את הקוד, לדמיין לקוחה חדשה שפותחת את הדף בפעם הראשונה ומשתמשת בו שבוע,',
    `ולהביא עד ${MAX} שיפורים קונקרטיים שהכי ישפרו לה את החוויה: מה מבלבל, מה חסר, מה מסובך מדי, מה נראה לא גמור, מה יכול להיות פשוט יותר.`,
    'עדיפות לדברים שלקוח יפגוש בפועל. לא רעיונות כלליים, כל שיפור מצביע על משהו מסוים בדף.',
    '',
    // Itzik, 12.10: "כל זמן אותם רעיונות.. אתה ממלא אחר התשובות ומתקן? אז אין מה להציע שוב".
    // A title alone let the same idea come back in other words, so each comes with what it says.
    'שיפורים שכבר הוצעו. אסור להציע שוב אף אחד מהם, גם לא במילים אחרות, גם לא חלק ממנו, וגם לא את ההפך שלו:',
    seen.length ? seen.map(x => '- ' + (x.built ? '[בוצע] ' : '') + x.t + ': ' + x.d).join('\n') : '- אין עדיין',
    'רוב מה שהוצע כבר נבנה. לפני שמציעים משהו, לחפש בקוד (Grep) את המילים שלו ואת ההערות "Reviewer" ו"from the reviewer":',
    'אם הדבר כבר קיים בקוד, לא להציע אותו. עדיף להחזיר פחות שיפורים, או מערך ריק [], מאשר לחזור על משהו.',
    '',
    'הפלט: JSON בלבד, בלי שום טקסט לפניו או אחריו, מערך של אובייקטים:',
    '[{"t":"כותרת קצרה, עד 8 מילים","d":"שתיים שלוש שורות בעברית פשוטה: מה הבעיה היום ומה השיפור","area":"איפה בדף","size":"קטן|בינוני|גדול"}]',
    ...(isSunday() ? [
      '',
      'היום יום ראשון: לעבור על אריחי הבית ב-docs/index.html. על כל אריח שהעבודה שלו הסתיימה (פרויקט שנסגר, הרצאה שבוטלה, אירוע שעבר, קמפיין שנגמר),',
      'להחזיר רעיון אחד בכותרת "להסיר את האריח <שם>", עם סיבה של משפט אחד. להחזיר כזה רק אם הסיבה גלויה בקבצים, לא לנחש.',
      'הרעיונות האלה נכנסים לאותה מכסה של עד שישה רעיונות.',
    ] : []),
    'עברית פשוטה, בלי מונחים טכניים, בלי מקפים.',
  ].join('\n');
}

function runClaude(text) {
  return new Promise((resolve, reject) => {
    // Read only: the session may look, it may not touch anything.
    const args = ['-p', '--model', 'haiku', '--allowedTools', 'Read,Grep,Glob', '--output-format', 'text'];
    const child = spawn('claude', args, { cwd: __dirname, env: process.env });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('timeout')); }, 25 * 60 * 1000);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('claude exited ' + code + ': ' + err.slice(0, 200)));
      resolve(out);
    });
    child.stdin.end(text);
  });
}

function parse(out) {
  const a = out.indexOf('['), b = out.lastIndexOf(']');
  if (a < 0 || b < a) throw new Error('no JSON in the answer');
  const arr = JSON.parse(out.slice(a, b + 1));
  return arr.filter(x => x && x.t && x.d).slice(0, MAX).map(x => ({
    t: String(x.t).replace(/[-–—]/g, ' ').trim(),
    d: String(x.d).replace(/[-–—]/g, ' ').trim(),
    area: String(x.area || ''),
    size: String(x.size || ''),
  }));
}

async function main() {
  const all = existing();
  const seen = all.map(x => x.t);
  const ideas = parse(await runClaude(prompt(all.filter(x => x.t).map(x => ({ t: x.t, d: String(x.d || '').slice(0, 160), built: !!x.built })))));
  const fresh = ideas.filter(x => !seen.includes(x.t));
  if (DRY) { console.log(JSON.stringify(fresh, null, 1)); return; }
  fs.mkdirSync(DIR, { recursive: true });
  const at = new Date().toISOString();
  const stamp = at.slice(0, 16).replace(/[-:T]/g, '');
  fresh.forEach((x, i) => {
    fs.writeFileSync(path.join(DIR, stamp + '-' + String(i + 1).padStart(2, '0') + '.json'),
      JSON.stringify(Object.assign({ at, by: 'review' }, x), null, 1));
  });
  console.log(at.slice(11, 19) + '  ' + fresh.length + ' new ideas');
  if (!fresh.length) return;
  try { execFileSync('node', ['push.js', 'בודק השיפורים: ' + fresh.length + ' רעיונות חדשים'], { cwd: __dirname, stdio: 'ignore', timeout: 240000 }); }
  catch (e) { console.log('publish failed: ' + String(e.message).slice(0, 120)); }
  try { execFileSync('node', ['notify.js', '💡 ' + fresh.length + ' רעיונות לשיפור המוניטור', fresh.map(x => x.t).join(' · ')], { cwd: __dirname, stdio: 'ignore', timeout: 60000 }); }
  catch (e) {}
}

main().catch(e => { console.log(new Date().toISOString().slice(11, 19) + '  REVIEW FAILED: ' + e.message); process.exit(1); });
