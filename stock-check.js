'use strict';
/*
  7.11.2026, Itzik: "שתמיד יהיו סרטונים בקנה מוכנים... הכל יהיה תמיד מסוגר בסרטונים ומעודכן",
  and everything in the one 🎬 tile. Every morning this counts how far each queue reaches
  (WhatsApp statuses, candle.times, מה בצלחת) with lib/stock.js, the same numbers the tile shows,
  and when one runs short it puts a request into the monitor's own queue (data/chat/chat, the way
  wa-bridge.js does), so the worker prepares more before it runs out. One request per channel,
  again only after 3 days if it is still short. Code only, no model.
  node stock-check.js --dry   prints the stock, writes nothing.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stock = require('./lib/stock.js');
const HERE = __dirname;
const CHAT = path.join(HERE, 'data', 'chat', 'chat');
const ASKED = path.join(HERE, 'data', 'status', 'stock-asked.json');
const DRY = process.argv.includes('--dry');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const S = stock.compute({
  st: rd(path.join(HERE, 'docs', 'status', 'queue.json'), []),
  nr: rd('/home/monitor/ner-queue.json', []),
  pl: rd(path.join(HERE, 'docs', 'plate', 'queue.json'), []),
  ai: rd(path.join(HERE, 'docs', 'ai', 'queue.json'), []),
  li: rd(path.join(HERE, 'docs', 'linkedin', 'stock.json'), null),
}, today);

const HOW_AI = 'ערוץ ה AI עולה כסרטון אחד ביום לכל שפה עד שישי (שבת לא). פריט במצב hold לא עולה: להזכיר לאיציק בכרטיס אישור אחד קצר מה מחכה לאישורו. אם חסרים סרטונים, להכין תסריטים להקלטה לפי הסקיל ai-explainer-video ולהעלות לדרייב, ולבקש ממנו להקליט. לא להסיר hold בעצמו.';
// 11.11.2026: English needs no recording, it is the cloned voice; it follows the Hebrew topics.
const HOW_AI_EN = 'אנגלית לא צריכה הקלטה: לוקחים נושא שכבר יש לו סרטון בעברית ועוד אין לו אנגלית, ומכינים גרסה אנגלית לפי הסקיל ai-explainer-video (קול משובט, כל משפט חי ולא מונוטוני, שאלה מתלהבת בסוף כמו ב cent-en, תמונת הפרופיל של איציק במסך הסיום), עם hold: true לאישור שלו. אם אין נושא בעברית בלי אנגלית, להכין תסריטים כמו בעברית.';
const HOW = {
  st: 'להכין סטטוסים לוואטסאפ לפי הסבב (ראשון שחר, שני האתר, שלישי המוניטור, רביעי שחר, חמישי המוניטור, שישי נרות, בלי שבת), סרטון חדש לכל יום, לתור docs/status/queue.json.',
  nr: 'להכין את השבוע הבא של candle.times (2 פוסטים ו 2 סטוריז ביום, עברית ואנגלית, בלי שבת וחג, דמויות חדשות) ולהכניס ל /home/monitor/ner-queue.json עם approved: true (הנרות עולים לבד בלי אישור, איציק 7.11), ואז node ner-post.js --mirror.',
  li: 'לכתוב עוד פוסטים ללינקדין בקול של איציק (דגש על ההרצאות, בלי מקפים, בלי אימוג׳י, בלי שמות לקוחות) ולהכניס ל data/linkedin/queue.json, ראשון שלישי וחמישי ב 09:00. כרטיסי האישור ב 🔔 לאישורך נוצרים לבד (linkedin-post.js).',
  pl: 'להכין עוד סטוריז של מה בצלחת לפי הסדר בדרייב (מה בצלחת עם דמות/00 סדר ההעלאה.txt) ולהכניס ל docs/plate/queue.json לאישור של איציק.',
};

const asked = rd(ASKED, {});
let wrote = 0;
for (const c of S) {
  console.log(today + ' ' + c.id + ': ' + c.line + (c.low ? ' [חסר]' : ''));
  if (!c.low || DRY) continue;
  // 11.11.2026: statuses and candles are filled by stock-fill.js on the PC (Sonnet, every morning 06:30).
  // A request here only reached a Haiku session that closed it without doing anything.
  if (c.id === 'st' || c.id === 'nr') continue;
  const last = asked[c.id] ? Date.parse(asked[c.id]) : 0;
  // 11.11.2026, Itzik: statuses ran out and nobody filled them, because a channel was asked again only after 3 days.
  // Now it is asked again every morning while it is still short of a full week.
  if (Date.now() - last < 20 * 3600000) continue;
  const at = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const base = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-' + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds()) + '-itzik-auto';
  let name = base + '.json';
  for (let i = 2; fs.existsSync(path.join(CHAT, name)); i++) name = base + '-' + i + '.json';
  const rec = { at: at.toISOString(), from: 'itzik', status: 'working', ackAt: at.toISOString(), auto: true, via: 'stock-check',
    id: 'stk-' + at.getTime().toString(36) + crypto.randomBytes(3).toString('hex'),
    text: '📦 מלאי סרטונים\n' + c.title + ': ' + c.line + '.\n' + (HOW[c.id] || (c.id === 'ai-en' ? HOW_AI_EN : HOW_AI)) + '\nאחרי ההכנה, השורה באריח 🎬 הסרטונים מתעדכנת לבד.' };
  fs.mkdirSync(CHAT, { recursive: true });
  fs.writeFileSync(path.join(CHAT, name + '.tmp'), JSON.stringify(rec, null, 1), 'utf8');
  fs.renameSync(path.join(CHAT, name + '.tmp'), path.join(CHAT, name));
  asked[c.id] = at.toISOString();
  wrote++;
}
if (wrote) { fs.mkdirSync(path.dirname(ASKED), { recursive: true }); fs.writeFileSync(ASKED, JSON.stringify(asked, null, 1)); }
