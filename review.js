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

function prompt(seen) {
  return [
    'אתה בודק את "המוניטור", אפליקציית דף אחד לטלפון שאבא איציק מקים ללקוחות שלא מבינים בטכנולוגיה.',
    'הקוד בתיקייה הזאת: build.js בונה את הדף (HTML, CSS ו-JS בתוך מחרוזות), listen.js ו-worker.js מקבלים הודעות ועונים,',
    'tenants-*.js מסנכרנים ובודקים לקוחות, setup-server.js הוא ההגדרה הראשונה של לקוח, plans/ ו-README.md מתארים את המוצר.',
    'הלקוחה הבאה: רינת, מעצבת טקסטיל בכירה בהום סטייל. היא עובדת מהאייפון, לא טכנולוגית, ותשתמש בזה כדי לדבר עם קלוד ולקבל תוצרים.',
    '',
    'המשימה: רק שיפורים. לא לתקן, לא לשנות קבצים. לקרוא את הקוד, לדמיין לקוחה חדשה שפותחת את הדף בפעם הראשונה ומשתמשת בו שבוע,',
    `ולהביא עד ${MAX} שיפורים קונקרטיים שהכי ישפרו לה את החוויה: מה מבלבל, מה חסר, מה מסובך מדי, מה נראה לא גמור, מה יכול להיות פשוט יותר.`,
    'עדיפות לדברים שלקוח יפגוש בפועל. לא רעיונות כלליים, כל שיפור מצביע על משהו מסוים בדף.',
    '',
    'שיפורים שכבר הוצעו ואין להציע שוב:',
    seen.length ? seen.map(t => '- ' + t).join('\n') : '- אין עדיין',
    '',
    'הפלט: JSON בלבד, בלי שום טקסט לפניו או אחריו, מערך של אובייקטים:',
    '[{"t":"כותרת קצרה, עד 8 מילים","d":"שתיים שלוש שורות בעברית פשוטה: מה הבעיה היום ומה השיפור","area":"איפה בדף","size":"קטן|בינוני|גדול"}]',
    'עברית פשוטה, בלי מונחים טכניים, בלי מקפים.',
  ].join('\n');
}

function runClaude(text) {
  return new Promise((resolve, reject) => {
    // Read only: the session may look, it may not touch anything.
    const args = ['-p', '--allowedTools', 'Read,Grep,Glob', '--output-format', 'text'];
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
  const seen = existing().map(x => x.t);
  const ideas = parse(await runClaude(prompt(seen)));
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
