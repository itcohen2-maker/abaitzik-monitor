#!/usr/bin/env node
/*
  Itzik, 5.10: "check in an hour if they answered by mail, then tell me with a
  blinking button". Looks in his mail (read only) for a reply from the
  occupational clinic newer than message AFTER. Found: saves it to data/occ
  (the clinic tile blinks until he opens it), writes in his thread, pushes and
  sends a notification. Not found: says so once and checks again in an hour,
  until 18:00 Israel.

  node occ-check.js <after-mail-id> <thread re> [--dry]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const [after, re] = process.argv.slice(2);
const dry = process.argv.includes('--dry');
if (!after || !re) { console.error('usage: node occ-check.js <after-mail-id> <re> [--dry]'); process.exit(1); }

function run(cmd, args) { return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 180000 }); }
function israel(d) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d)
    .reduce((o, x) => (o[x.type] = x.value, o), {});
  return p;
}
function stamp(d) { const p = israel(d); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+03:00`; }
function chat(slug, text) {
  const p = israel(new Date());
  const file = path.join(ROOT, 'data/chat/chat', `${p.year}${p.month}${p.day}-${p.hour}${p.minute}-claude-${slug}.json`);
  const doc = { at: stamp(new Date()), from: 'claude', re, text };
  if (dry) return console.log(file, doc);
  fs.writeFileSync(file, JSON.stringify(doc) + '\n');
}

const list = run('python3', ['tools/mail-search.py', '--from', 'mac.org.il', '--days', '3', '--limit', '20']);
const ids = [...list.matchAll(/^\[(\d+)\][^\n]*\n\s*([^\n]*)/gm)]
  .filter(m => +m[1] > +after && !/automatic reply|השב אוטומטי/i.test(m[2]))
  .map(m => m[1]);

if (ids.length) {
  const id = ids[0];
  const full = run('python3', ['tools/mail-search.py', '--id', id]).replace(/\r/g, '');
  const subject = (full.match(/^Subject: (.*)$/m) || [])[1] || '';
  const body = full.split(/\n\n/).slice(1).join('\n\n').split(/\n\s*From: /)[0].trim().slice(0, 1200);
  const doc = { id: 'mail-' + id, at: stamp(new Date()), subject, text: body };
  if (dry) console.log(doc);
  else {
    fs.mkdirSync(path.join(ROOT, 'data/occ/occ'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'data/occ/occ', `${id}.json`), JSON.stringify(doc, null, 1) + '\n');
  }
  chat('occ-reply', `המרפאה התעסוקתית ענתה במייל:\n${body}\n\nזה גם בכפתור של המרפאה במסך הבית, שמהבהב עכשיו.`);
  if (!dry) {
    run('node', ['push.js', 'occ: clinic replied by mail']);
    try { run('node', ['notify.js', 'המרפאה ענתה', body.slice(0, 200)]); } catch (e) { console.error('notify', e.message); }
  }
  console.log('found', id);
} else {
  const hour = +israel(new Date()).hour;
  const again = hour < 17;
  const first = !process.argv.includes('--again');
  if (first) {
    chat('occ-none', again ? 'המרפאה עוד לא ענתה במייל. אבדוק שוב כל שעה עד 18:00, וכשיענו הכפתור של המרפאה יהבהב.'
                           : 'המרפאה עוד לא ענתה במייל היום.');
    if (!dry) run('node', ['push.js', 'occ: no clinic reply yet']);
  } else if (!again) {
    chat('occ-none-end', 'עד 18:00 המרפאה לא ענתה במייל. מחר בבוקר כדאי להתקשר, בין 08:00 ל 11:00.');
    if (!dry) run('node', ['push.js', 'occ: no clinic reply today']);
  }
  if (again && !dry) {
    execFileSync('at', ['now', '+', '1', 'hour'], { input: `cd ${ROOT} && node occ-check.js ${after} ${re} --again >> /tmp/occ-check.log 2>&1\n` });
  }
  console.log('none', again ? 'rescheduled' : 'stopped');
}
