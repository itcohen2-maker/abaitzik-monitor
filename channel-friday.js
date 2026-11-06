'use strict';
/*
  6.11.2026, Itzik: "את ההודעה של היום בערוץ היית צריך לתת לי תזכורת להעלות את זה".
  Every Friday morning: builds the WhatsApp channel message "זמני שבת | candletimes"
  (times from hebcal, the same numbers as the site) and puts it in the monitor as a
  reminder that nags until he marks it done. Nothing is posted to WhatsApp: a channel
  can only be posted by hand from his phone.

  cron (monitor): 30 5 * * 5  -> 07:30 Israel in winter. The reminder itself shows at 08:00.
  Usage: node channel-friday.js [--dry] [YYYY-MM-DD]
*/
const { execFileSync } = require('child_process');
const path = require('path');

const CITIES = [
  ['ירושלים', 281184], ['תל אביב', 293397], ['ראשון לציון', 293703], ['נתניה', 294071],
  ['אשדוד', 295629], ['באר שבע', 295530], ['צפת', 293100], ['אילת', 295277],
];
// Short sayings with their source. One per week, in turn.
const SAYINGS = [
  ['אל תאמר לכשאפנה אשנה, שמא לא תפנה.', 'הלל, פרקי אבות'],
  ['איזהו עשיר? השמח בחלקו.', 'בן זומא, פרקי אבות'],
  ['הוי מקבל את כל האדם בסבר פנים יפות.', 'שמאי, פרקי אבות'],
  ['במקום שאין אנשים, השתדל להיות איש.', 'הלל, פרקי אבות'],
  ['איזהו מכובד? המכבד את הבריות.', 'בן זומא, פרקי אבות'],
  ['אם אין אני לי, מי לי? וכשאני לעצמי, מה אני? ואם לא עכשיו, אימתי?', 'הלל, פרקי אבות'],
  ['לא עליך המלאכה לגמור, ולא אתה בן חורין להיבטל ממנה.', 'רבי טרפון, פרקי אבות'],
  ['הוי דן את כל האדם לכף זכות.', 'יהושע בן פרחיה, פרקי אבות'],
  ['אמור מעט ועשה הרבה.', 'שמאי, פרקי אבות'],
  ['כל המקיים נפש אחת, כאילו קיים עולם מלא.', 'מסכת סנהדרין'],
];

function israelDay(d) { return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }

async function times(id, day) {
  const [y, m, dd] = day.split('-');
  const r = await fetch(`https://www.hebcal.com/shabbat?cfg=json&geonameid=${id}&gy=${y}&gm=${+m}&gd=${+dd}&M=on`);
  if (!r.ok) throw new Error('hebcal ' + r.status);
  const j = await r.json();
  const pick = c => (j.items.find(x => x.category === c) || {}).date || '';
  const par = j.items.find(x => x.category === 'parashat');
  return { c: pick('candles').slice(11, 16), h: pick('havdalah').slice(11, 16), par: par ? (par.hebrew || '') : '' };
}

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const day = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || israelDay(Date.now());
  const rows = [];
  let par = '';
  for (const [name, id] of CITIES) {
    const t = await times(id, day);
    if (!t.c || !t.h) throw new Error('missing time for ' + name);
    par = par || t.par;
    rows.push(`${name} ${t.c} | ${t.h}`);
  }
  const week = Math.floor(Date.parse(day) / (7 * 864e5));
  const [say, src] = SAYINGS[week % SAYINGS.length];
  const msg = [
    '🕯️ שבת שלום',
    `"${say}" (${src})`,
    '',
    par,
    'הדלקה | הבדלה',
    ...rows,
    '',
    'כל עיר אחרת: candletimes.com',
    'כרטיס שבת שלום אישי לעיר שלך: candletimes.com/card',
    'מתנה מאבא איציק',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  const text = '📢 הודעת שישי לערוץ "זמני שבת | candletimes": מעתיקים ומדביקים בערוץ בוואטסאפ\n\n' + msg;
  if (dry) { console.log(text); return; }
  execFileSync('node', [path.join(__dirname, 'remind.js'), 'add', day, text, '--at', '08:00', '--nag'], { stdio: 'inherit' });
  console.log('channel-friday: reminder set for', day);
})().catch(e => { console.error('channel-friday failed:', e.message); process.exit(1); });
