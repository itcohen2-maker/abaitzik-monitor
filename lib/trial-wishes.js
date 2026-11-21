'use strict';
/*
  12.11.2026, Itzik: "אני רוצה שנפעיל שומר ... לראות שכל הבקשות המיוחדות של המשתמשים החדשים שנכנסו, כמו עכשיו חן,
  שביקש לנקות את המייל, בוצעו על הצד הטוב ביותר".
  Every trial answers "מה לעשות בשבילך השבוע" in the signup questionnaire (profile.md, "ביקש שיעשה בשבילו השבוע:").
  This guard follows each such wish until the customer got an answer about it, and says plainly what blocks it:
    entry     he has not opened the monitor yet
    connect   the wish needs Gmail (or the calendar) and he has not connected it
    cannot    the monitor cannot do it today (cleaning or deleting mail needs a Gmail permission we do not ask for:
              we have gmail.readonly and gmail.compose only), so Itzik must decide what to offer instead
    open      everything is there and nobody answered it yet
    done      a monitor answer mentions it
  Pure apart from reading the files. manager.js puts one line on the card (k 'wishes'); open over 24 hours is warn.
*/
const fs = require('fs');
const path = require('path');

const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const MAIL = /מייל|ג׳?ימייל|דואר|inbox|email/i;
const CAL = /יומן|פגיש|calendar/i;
const CLEAN = /לנקות|ניקוי|למחוק|מחיקה|לארכב|ארכיון|לסדר את המייל|להעיף|ספאם/;

function wishOf(home) {
  try { const m = fs.readFileSync(path.join(home, 'data', 'profile.md'), 'utf8').match(/ביקש שיעשה בשבילו השבוע:\s*(.+)/); return m ? m[1].trim() : ''; } catch (e) { return ''; }
}

// The words of the wish that matter for matching an answer: longer than 2 letters, no stop words.
function keyWords(w) { return String(w).split(/[\s,.!?״"׳']+/).filter((x) => x.length > 2 && !/^(לי|את|של|עם|כל|לנקות|לעשות)$/.test(x)); }

function status(o) {
  const w = o.wish;
  if (!w) return '';
  const answered = (o.answers || []).some((t) => keyWords(w).some((k) => t.includes(k)));
  if (answered) return 'done';
  if (MAIL.test(w) && CLEAN.test(w)) return o.google ? 'cannot' : (o.visited ? 'connect' : 'entry');
  if (!o.visited) return 'entry';
  if ((MAIL.test(w) || CAL.test(w)) && !o.google) return 'connect';
  return 'open';
}

const SAY = {
  entry: 'עוד לא נכנס למוניטור',
  connect: 'מחכה שיחבר את הג׳ימייל (🔌), בלי זה אי אפשר',
  // 12.11.2026, Itzik: "אנחנו נגיד שאנחנו לא מוחקים מהג׳ימייל". Done once a monitor answer says so (the manager prompt, lib/mail-prefs.js).
  cannot: 'אנחנו לא מוחקים מהג׳ימייל: צריך שיקבל הסבר והצעה למיון במקום',
  open: 'הכל מחובר ועוד לא קיבל תשובה',
};

/*
  DATA: Itzik's data folder (signup queue, sources, visits). Returns [{ id, name, wish, st, say, hours }].
*/
function list(DATA, now) {
  const t = now || Date.now();
  const Q = path.join(DATA, 'signup', 'queue');
  let names = [];
  try { names = fs.readdirSync(Q).filter((n) => /^t[a-f0-9]{6}\.json$/.test(n)); } catch (e) { return []; }
  const sources = rd(path.join(DATA, 'cal', 'sources.json'), []);
  const out = [];
  names.forEach((n) => {
    const q = rd(path.join(Q, n), null);
    if (!q || q.state !== 'ready') return;
    const id = q.id || n.slice(0, -5);
    const home = '/home/' + id + '/' + id + '-monitor';
    if (!fs.existsSync(path.join(home, 'data'))) return;
    const wish = wishOf(home);
    if (!wish) return;
    const src = (Array.isArray(sources) ? sources : []).find((x) => x && x.name === id) || {};
    const visited = ((rd(path.join(DATA, 'visits', id + '.json'), {}).sessions) || []).length > 0;
    const answers = [];
    try {
      const C = path.join(home, 'data', 'chat', 'chat');
      fs.readdirSync(C).filter((f) => f.endsWith('.json')).forEach((f) => { const m = rd(path.join(C, f), null); if (m && m.from === 'claude') answers.push(String(m.text || '')); });
    } catch (e) { /* no chat yet */ }
    const st = status({ wish, visited, google: !!(src.step && src.mail), answers });
    out.push({ id, name: q.name || id, wish, st, say: SAY[st] || '', hours: Math.round((t - Date.parse(q.updatedAt || q.at)) / 36e5) });
  });
  return out;
}

// The manager card line.
function item(rows) {
  const open = rows.filter((r) => r.st && r.st !== 'done');
  if (!rows.length) return null;
  if (!open.length) return { k: 'wishes', st: 'done', t: '🎯 הבקשות של הנרשמים טופלו', sub: rows.map((r) => r.name + ': ' + r.wish).join(' · ').slice(0, 300) };
  const late = open.some((r) => r.st === 'cannot' || (r.st === 'open' && r.hours >= 24));
  return { k: 'wishes', st: late ? 'warn' : 'todo', t: '🎯 ' + open.length + ' בקשות של נרשמים חדשים עוד פתוחות',
    sub: open.map((r) => r.name + ' ביקש "' + r.wish + '": ' + r.say).join(' · ').slice(0, 400) };
}

module.exports = { list, item, status, wishOf };

if (require.main === module) {
  const rows = list(process.argv[2] || path.join(__dirname, '..', 'data'));
  console.log(JSON.stringify({ rows, item: item(rows) }, null, 1));
}
