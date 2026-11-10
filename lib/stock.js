'use strict';
/*
  7.11.2026: how far each video queue reaches. Used twice, with the same numbers: by stock-check.js on the
  server (asks for more when short) and by the 🎬 הסרטונים sheet (build.js inlines this file, so it stays
  ES5, with no regex digit classes, no backticks and no template slots).
  compute({ st, nr, pl }, 'YYYY-MM-DD') -> [{ id, title, line, low }]
*/
var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
function addDay(d, n) {
  var p = String(d).split('-');
  var t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return t.toISOString().slice(0, 10);
}
function dow(d) { var p = String(d).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
function nice(d) { var p = String(d).split('-'); return DAYS[dow(d)] + ' ' + (+p[2]) + '.' + (+p[1]); }
function short(d) { var p = String(d).split('-'); return (+p[2]) + '.' + (+p[1]); }
// the next 7 days that need something (Saturday never does)
function needed(today) { var out = []; for (var i = 0; i < 7; i++) { var d = addDay(today, i); if (dow(d) !== 6) out.push(d); } return out; }

// 10.11.2026, Itzik made the manager the owner of ALL video stock: it has to reach Friday of this week
// (next Friday when today is Friday or Saturday), Saturday never needs anything.
function daysToFriday(today) { var w = dow(today), n = w <= 5 ? 5 - w : 6, c = 0; for (var i = 0; i <= n; i++) { if (dow(addDay(today, i)) !== 6) c++; } return c; }

function reach(dates, today, what) {
  var have = {}; dates.forEach(function (d) { if (d >= today) have[d] = 1; });
  var need = needed(today), until = '', missing = [];
  for (var i = 0; i < need.length; i++) { if (have[need[i]]) { if (!missing.length) until = need[i]; } else missing.push(need[i]); }
  var last = Object.keys(have).sort().pop() || '';
  var line = last ? 'מוכן עד ' + nice(last) : 'אין ' + what + ' מוכנים';
  if (missing.length) line += ', חסרים: ' + missing.map(short).join(', ');
  return { line: line, low: missing.length > 0, until: until, last: last };
}

function compute(Q, today) {
  Q = Q || {};
  var st = (Q.st || []).map(function (x) { return x.date; });
  var nr = (Q.nr || []).filter(function (x) { return !x.posted && !x.failed && !x.rejected && !x.hold; }).map(function (x) { return x.date; });
  var pl = (Q.pl || []).filter(function (x) { return !x.posted; }).length;
  var li = Q.li && typeof Q.li === 'object' && !Array.isArray(Q.li) ? Q.li : null;
  var a = reach(st, today, 'סטטוסים'), b = reach(nr, today, 'פריטים');
  var ai = Q.ai && Q.ai.length ? Q.ai : null, aiOut = [];
  if (ai) {
    var need = daysToFriday(today);
    ['he', 'en'].forEach(function (lg) {
      var mine = ai.filter(function (x) { return x.lang === lg && !x.posted && !x.failed; });
      var ready = mine.filter(function (x) { return !x.hold; }).length, held = mine.length - ready;
      var line = (lg === 'he' ? 'עברית' : 'אנגלית') + ': ' + ready + ' מוכנים' + (held ? ', ' + held + ' מחכים לאישורך' : '') + ', צריך ' + need + ' עד שישי';
      aiOut.push({ id: 'ai-' + lg, title: '🤖 ערוץ AI', line: line, low: ready < need, held: held, need: need, ready: ready });
    });
  }
  return aiOut.concat([
    { id: 'st', title: '📲 סטטוס', line: a.line, low: a.low },
    { id: 'nr', title: '🕯️ נרות', line: b.line, low: b.low },
    { id: 'pl', title: '🍽️ מה בצלחת', line: pl ? pl + ' סטוריז מוכנים בתור' : 'אין סטוריז מוכנים', low: pl < 4 },
  ].concat(li ? [{ id: 'li', title: '💼 לינקדין', line: li.total ? li.total + ' פוסטים בתור' + (li.last ? ' עד ' + nice(li.last) : '') + (li.waiting ? ', ' + li.waiting + ' מחכים לאישורך' : '') : 'אין פוסטים בתור', low: (li.total || 0) < 2 }] : []));
}

if (typeof module !== 'undefined') module.exports = { compute: compute };
