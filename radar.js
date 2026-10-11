'use strict';
/*
  The tool radar. Once a week, new open source tools that could help a client.

  Itzik, 11.10.2026, after a reel about five repos blowing up on GitHub: he
  chose to have this found for him every week instead of stumbling on it. A
  Claude session searches the web (it can only search and read pages, nothing
  else) for what is new and rising, keeps only what fits the work we actually
  do for the people below, and writes up to five finds to the same "רעיונות"
  screen as the daily reviewer, marked 🔭 and carrying the tool's link. Nothing
  is installed: "רוצה את זה" sends it to me like any other request.

  Usage: node radar.js            run, save the finds, publish
         node radar.js --dry      print the finds, save nothing
*/
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const inst = require('./lib/instance.js');

const DRY = process.argv.includes('--dry');
const DIR = path.join(inst.dataPath, 'better', 'better');
const MAX = 5;

function seenFinds() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; }
  }).filter(x => x && x.by === 'radar');
}

function prompt(seen) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `היום ${today}. אתה הרדאר השבועי של אבא איציק: מחפש ברשת כלים חדשים בקוד פתוח (בעיקר מה שעולה ב GitHub Trending ובחדשות בשבועיים האחרונים)`,
    'ומביא רק מה שבאמת יכול לעזור בעבודה שלנו. הלקוחות והעבודה:',
    '- רינת: מעצבת טקסטיל בכירה בהום סטייל. קבצי PSD ו AI, מצגות ללקוחות, הדמיות תלת מימד של מחלקות בחנות, אינסרטים לאריזות, צביעה מחדש של דוגמאות.',
    '- הרילים של איציק ושל לקוחות: עריכת וידאו אנכי בעברית, כתוביות, צבע, b-roll, קול, הסרת רקע.',
    '- המוניטור: אפליקציית דף אחד לטלפון שבה לקוחות לא טכנולוגיים מדברים עם קלוד ומקבלים תוצרים. שרת לינוקס קטן, Node.',
    '- לקוחות חדשים: עסקים קטנים שלא מבינים בטכנולוגיה.',
    '',
    'כללים: רק כלים שאפשר להריץ אצלנו (חינמי או זול, לינוקס או ווינדוס). לא כלים למק בלבד. לא כלים שרק עוטפים מודל שכבר יש לנו.',
    'לבדוק בדף של הכלי עצמו מה הוא עושה ובאיזה מצב הוא. אם הוא בגרסה מוקדמת או שיש שאלה משפטית, לכתוב את זה.',
    'עדיף שלושה ממצאים טובים מחמישה בינוניים. אם אין השבוע שום דבר שווה, להחזיר [].',
    '',
    'כלים שכבר הובאו ואין להביא שוב:',
    seen.length ? seen.map(x => '- ' + x.t + (x.u ? ' (' + x.u + ')' : '')).join('\n') : '- אין עדיין',
    '',
    `הפלט: JSON בלבד, בלי שום טקסט לפניו או אחריו, מערך של עד ${MAX} אובייקטים:`,
    '[{"t":"שם הכלי ובמה הוא עוזר, עד 8 מילים","d":"שתיים שלוש שורות בעברית פשוטה: מה הוא עושה, למי מאיתנו ולמה, ובאיזה מצב הוא","u":"https://הקישור לדף הכלי","area":"רינת|רילים|מוניטור|לקוחות","size":"קטן|בינוני|גדול"}]',
    'עברית פשוטה, בלי מונחים טכניים מיותרים, בלי מקפים.',
  ].join('\n');
}

function runClaude(text) {
  return new Promise((resolve, reject) => {
    // Search and read only: the session may look at the web, it may not touch anything here.
    const args = ['-p', '--allowedTools', 'WebSearch,WebFetch', '--output-format', 'text'];
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
    t: String(x.t).replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim(),
    d: String(x.d).replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim(),
    u: /^https:\/\/[^\s"'<>]+$/.test(String(x.u || '')) ? String(x.u) : '',
    area: String(x.area || ''),
    size: String(x.size || ''),
  }));
}

async function main() {
  const seen = seenFinds();
  const finds = parse(await runClaude(prompt(seen)));
  const fresh = finds.filter(x => !seen.some(s => s.t === x.t || (x.u && s.u === x.u)));
  if (DRY) { console.log(JSON.stringify(fresh, null, 1)); return; }
  fs.mkdirSync(DIR, { recursive: true });
  const at = new Date().toISOString();
  const stamp = at.slice(0, 16).replace(/[-:T]/g, '');
  fresh.forEach((x, i) => {
    fs.writeFileSync(path.join(DIR, stamp + '-r' + String(i + 1).padStart(2, '0') + '.json'),
      JSON.stringify(Object.assign({ at, by: 'radar' }, x), null, 1));
  });
  console.log(at.slice(11, 19) + '  ' + fresh.length + ' new tools');
  if (!fresh.length) return;
  try { execFileSync('node', ['push.js', 'הרדאר השבועי: ' + fresh.length + ' כלים חדשים'], { cwd: __dirname, stdio: 'ignore', timeout: 240000 }); }
  catch (e) { console.log('publish failed: ' + String(e.message).slice(0, 120)); }
  try { execFileSync('node', ['notify.js', '🔭 ' + fresh.length + ' כלים חדשים באריח רעיונות', fresh.map(x => x.t).join(' · ')], { cwd: __dirname, stdio: 'ignore', timeout: 60000 }); }
  catch (e) { console.log('notify failed: ' + String(e.message).slice(0, 120)); }
}

main().catch(e => { console.log(new Date().toISOString().slice(11, 19) + '  RADAR FAILED: ' + e.message); process.exit(1); });
