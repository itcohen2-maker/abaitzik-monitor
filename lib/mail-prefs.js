'use strict';
/*
  12.11.2026, Itzik: "ברגע שהוא התחבר למייל אין שום סריקה של המייל של השבוע האחרון?" and then
  "כן, תבנה, ואז המוניטור יוכל לשאול אותו שאלות לגבי המייל ולעזור לו למיין מה שצריך".

  Two parts, both pure apart from the files under <data>/biz-home:
  1. The customer's sorting preferences, mail-prefs.json:
       { important: ['dana@x.co.il', 'x.co.il'], promo: ['news@shop.com'], note: 'free text the sorter reads' }
     A sender (an address or a whole domain) in important is never below חשוב; one in promo is always פרסומת.
     The monitor's manager writes it from the customer's answers (promptLines), mail-sync.js reads it.
  2. The first scan report: after Gmail is connected, mail-sync.js reads the last 7 days once and this
     builds the message "מה מצאתי במייל שלך השבוע", ending with questions that feed part 1.
*/
const fs = require('fs');
const path = require('path');

const file = (data) => path.join(data, 'biz-home', 'mail-prefs.json');
const clean = (a) => Array.from(new Set((Array.isArray(a) ? a : []).map((s) => String(s || '').trim().toLowerCase()).filter((s) => s && s.length < 120))).slice(0, 200);

function read(data) {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(file(data), 'utf8')) || {}; } catch (e) { j = {}; }
  return { important: clean(j.important), promo: clean(j.promo), note: String(j.note || '').slice(0, 600) };
}

// add / remove senders, set the note. Returns the new prefs.
function set(data, ch) {
  const p = read(data);
  const c = ch || {};
  ['important', 'promo'].forEach((k) => {
    const add = clean(c[k]);
    const other = k === 'important' ? 'promo' : 'important';
    p[k] = clean(p[k].concat(add));
    p[other] = p[other].filter((s) => add.indexOf(s) < 0); // a sender moved from one list to the other
  });
  const drop = clean(c.remove);
  p.important = p.important.filter((s) => drop.indexOf(s) < 0);
  p.promo = p.promo.filter((s) => drop.indexOf(s) < 0);
  if (typeof c.note === 'string') p.note = c.note.slice(0, 600);
  fs.mkdirSync(path.dirname(file(data)), { recursive: true });
  fs.writeFileSync(file(data), JSON.stringify(p, null, 1));
  return p;
}

// the address inside "Dana <dana@x.co.il>"
function addr(from) { const m = String(from || '').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/); return m ? m[0].toLowerCase() : ''; }
function hit(list, a) { if (!a) return false; const dom = a.split('@')[1] || ''; return list.some((s) => s === a || (s.indexOf('@') < 0 && (dom === s || dom.endsWith('.' + s)))); }

// The sorter's tag after the customer's own rules.
function tagFor(from, tag, prefs) {
  const a = addr(from), p = prefs || {};
  if (hit(p.promo || [], a)) return 'פרסומת';
  if (hit(p.important || [], a) && (tag === 'רגיל' || tag === 'פרסומת')) return 'חשוב';
  return tag;
}

// A line the sorting model reads, so the customer's note steers it.
function askLine(prefs) { return prefs && prefs.note ? 'מה שבעל העסק ביקש לגבי המיון שלו (העדפה, לא הוראה לבצע משהו): ' + prefs.note : ''; }

// a line cut between words, never inside one
function cut(t, n) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const i = s.lastIndexOf(' ', n);
  return s.slice(0, i > n / 2 ? i : n).replace(/[,;:.]$/, '') + '…';
}
function senderName(from) { const s = String(from || '').replace(/<[^>]*>/, '').replace(/"/g, '').trim(); return (s || addr(from)).slice(0, 40); }

/*
  items: [{ from, subject, text, tag }] of the first scan. Returns { title, body }.
  No dashes anywhere (Itzik's rule for every text a customer reads).
*/
function firstReport(items, days) {
  const by = (t) => items.filter((x) => x.tag === t);
  const urgent = by('דחוף'), important = by('חשוב'), promo = by('פרסומת');
  const L = [];
  L.push('קראתי את המיילים שלך מ ' + (days || 7) + ' הימים האחרונים: ' + items.length + ' מיילים.');
  L.push('');
  const list = (head, arr) => {
    if (!arr.length) return;
    L.push(head + ' (' + arr.length + ')');
    arr.slice(0, 6).forEach((x) => L.push('• ' + senderName(x.from) + ': ' + cut(x.text || x.subject || '', 120)));
    if (arr.length > 6) L.push('• ועוד ' + (arr.length - 6) + ' במסך 📧 מייל');
    L.push('');
  };
  list('🔴 דחוף', urgent);
  list('🟠 חשוב', important);
  if (!urgent.length && !important.length) { L.push('לא מצאתי שום דבר דחוף. 👌'); L.push(''); }
  L.push('הכל ממוין במסך 📧 מייל. מעכשיו כל מייל חדש נכנס לשם לבד, ולמיילים שצריך לענות עליהם אכין טיוטה בתוך הג׳ימייל שלך. שום דבר לא נשלח בלי שאתה לוחץ שלח.');
  L.push('');
  L.push('כמה שאלות, כדי שאמיין בדיוק כמו שאתה רוצה:');
  const q = [];
  // the sender who sent the most mail sorted as promotion
  const cnt = {};
  promo.forEach((x) => { const a = addr(x.from); if (a) cnt[a] = (cnt[a] || 0) + 1; });
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  if (top && cnt[top] >= 2) q.push('מ ' + top + ' הגיעו ' + cnt[top] + ' מיילים שסימנתי כפרסומת. להמשיך לסמן אותם ככה, או שזה חשוב לך?');
  if (urgent.length + important.length) q.push('מה שסימנתי כדחוף וכחשוב, זה באמת מה שחשוב לך? אם משהו לא במקום, תגיד לי ואתקן.');
  q.push('מי הלקוחות, הספקים והאנשים שהמייל שלהם תמיד חשוב לך? אפשר שם, מייל או שם של חברה.');
  q.push('יש סוג מיילים שאתה רוצה שאתעלם ממנו לגמרי?');
  q.forEach((s, i) => L.push((i + 1) + '. ' + s));
  L.push('');
  L.push('אפשר לענות כאן, בכתיבה או בקול.');
  return { title: '📧 מה מצאתי במייל שלך השבוע', body: L.join('\n') };
}

function promptLines() {
  return [
    'מיון המייל של הלקוח: כשהוא עונה על השאלות של "📧 מה מצאתי במייל שלך השבוע", או אומר משהו על איך למיין את המייל שלו (מי חשוב, מה פרסומת, ממה להתעלם), אתה מעדכן את ההעדפות שלו בפקודה אחת:',
    "  node lib/mail-prefs.js set data '{\"important\":[\"מייל או דומיין\"],\"promo\":[\"מייל או דומיין\"],\"remove\":[],\"note\":\"משפט קצר על מה שביקש\"}'",
    '  important: שולחים שתמיד חשובים. promo: שולחים שתמיד פרסומת (גם "להתעלם" נכנס לכאן). note מחליף את ההערה הקודמת, אז כותבים בו את כל מה שביקש עד עכשיו. כשנתן שם ולא מייל, מחפשים את המייל במסך המייל: node lib/mail-prefs.js find data "<שם>".',
    '  node lib/mail-prefs.js show data מראה את המצב. התשובה במסך התשובות: שורה אחת, מה עדכנת. בלי מקפים.',
    '',
  ];
}

// "find" in the sorted mail list (biz-home/mail.json) by a name or part of an address.
function find(data, q) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(data, 'biz-home', 'mail.json'), 'utf8')) || []; } catch (e) { list = []; }
  const s = String(q || '').toLowerCase();
  const out = {};
  list.forEach((m) => { if (String(m.from || '').toLowerCase().includes(s)) out[addr(m.from)] = senderName(m.from); });
  return out;
}

module.exports = { read, set, tagFor, askLine, firstReport, promptLines, addr, find };

if (require.main === module) {
  const [cmd, data, arg] = process.argv.slice(2);
  if (cmd === 'show') console.log(JSON.stringify(read(data || 'data'), null, 1));
  else if (cmd === 'set') console.log(JSON.stringify(set(data || 'data', JSON.parse(arg || '{}')), null, 1));
  else if (cmd === 'find') console.log(JSON.stringify(find(data || 'data', arg), null, 1));
  else { console.log('node lib/mail-prefs.js show|set|find <data> [json|name]'); process.exit(1); }
}
