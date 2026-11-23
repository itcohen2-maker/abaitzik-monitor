'use strict';
/*
  23.11.2026, Itzik, after the cosmetician's board: "אחרי זה אני רוצה לוח שנה כזה גם למוניטור שלי".
  The same two views over HIS Google calendar (the copy cal-sync.js keeps in data/cal, D.cal in the sealed payload):
    - a small week on top of 📅 היומן: seven days, how many meetings each, one bar per meeting;
    - the full board on the whole screen, a day or a week as a time grid, the all day events on a row of their own,
      a red line for now, and a card for a meeting (when, where, who, the description, the meeting link).
  Read only: nothing here writes to the calendar. On HIS monitor only through the dummy first (his rule of 22.11):
  instance.json calBoard: true, set by setup/owner-dummy.sh on the dummy copy. Without it html() is '' and the page is as it was.
*/
function page() {
  var W = window, TZ = 'Asia/Jerusalem';
  var DL = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var bd = { day: '', mode: 'week', sel: '' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dk(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }); }
  function hm(ms) { return new Date(ms).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }); }
  function mins(ms) { var s = hm(ms); return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)); }
  function addDays(d, n) { return new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function dow(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); }
  function dm(d) { return Number(d.slice(8)) + '.' + Number(d.slice(5, 7)); }
  function all() { var c = W.D && W.D.cal; return c && c.events ? c.events : []; }
  function onDay(e, day) {
    if (e.allDay) { var s = String(e.start).slice(0, 10), en = String(e.end || e.start).slice(0, 10); return en > s ? (day >= s && day < en) : day === s; }
    return dk(Date.parse(e.start)) === day;
  }
  function dayEvents(day) { return all().filter(function (e) { return onDay(e, day); }).sort(function (a, b) { return (a.allDay ? 0 : Date.parse(a.start)) - (b.allDay ? 0 : Date.parse(b.start)); }); }
  function past(e) { return !e.allDay && Date.parse(e.end || e.start) < Date.now(); }

  // ---- the small week, on top of 📅 היומן ----
  W.calWeekMini = function () {
    var t = dk(Date.now()), h = '', n = 0;
    for (var d = 0; d < 7; d++) {
      var day = addDays(t, d), its = dayEvents(day); n += its.length;
      h += '<button type="button" class="cbWd' + (d === 0 ? ' now' : '') + '" data-cb="day" data-cd="' + day + '" aria-label="' + esc(DAYS[dow(day)] + ' ' + dm(day) + ', ' + its.length + ' פגישות') + '">'
        + '<span class="cbWdN">' + DL[dow(day)] + '</span><span class="cbWdD">' + Number(day.slice(8)) + '</span>'
        + '<span class="cbWdB">' + its.slice(0, 6).map(function (e) { return '<i class="' + (e.allDay ? 'ad' : '') + '"></i>'; }).join('') + '</span>'
        + '<span class="cbWdC">' + its.length + '</span></button>';
    }
    return '<div class="cbWeek"><div class="cbWeekH"><b>השבוע</b><span>' + n + ' פגישות</span></div><div class="cbWds">' + h + '</div>'
      + '<button type="button" class="cbFull" data-cb="board">⛶ הלוח המלא, יום ושבוע</button></div>';
  };

  // ---- the full board ----
  function days() { var n = bd.mode === 'week' ? 7 : 1, out = []; for (var d = 0; d < n; d++) out.push(addDays(bd.day, d)); return out; }
  function hours(ds) {
    var lo = 24, hi = 0;
    ds.forEach(function (day) { dayEvents(day).forEach(function (e) { if (e.allDay) return; var a = mins(Date.parse(e.start)), b = mins(Date.parse(e.end || e.start)); if (b <= a) b = 24 * 60; lo = Math.min(lo, Math.floor(a / 60)); hi = Math.max(hi, Math.ceil(b / 60)); }); });
    lo = Math.min(lo, 9); hi = Math.max(hi, 18);
    return [Math.max(0, lo), Math.min(24, hi)];
  }
  function grid() {
    var ds = days(), hr = hours(ds), PX = bd.mode === 'week' ? 0.9 : 1.4, H = (hr[1] - hr[0]) * 60 * PX, today = dk(Date.now());
    var head = '<div class="cbH" style="--n:' + ds.length + '"><span></span>' + ds.map(function (day) {
      return '<b class="' + (day === today ? 'now' : '') + '" data-cb="day" data-cd="' + day + '">' + (bd.mode === 'week' ? DL[dow(day)] + '<span>' + Number(day.slice(8)) + '</span>' : DAYS[dow(day)] + ' ' + dm(day)) + '</b>';
    }).join('') + '</div>';
    var allRow = ds.some(function (day) { return dayEvents(day).some(function (e) { return e.allDay; }); })
      ? '<div class="cbAll" style="--n:' + ds.length + '"><span>כל היום</span>' + ds.map(function (day) {
        return '<div>' + dayEvents(day).filter(function (e) { return e.allDay; }).map(function (e) { return '<button type="button" class="cbChip" data-cb="ev" data-id="' + esc(e.id) + '">' + esc(e.title || 'אירוע') + '</button>'; }).join('') + '</div>';
      }).join('') + '</div>' : '';
    var lines = ''; for (var h = hr[0]; h <= hr[1]; h++) lines += '<i class="cbL" style="top:' + Math.round((h - hr[0]) * 60 * PX) + 'px"><bdi dir="ltr">' + (h < 10 ? '0' : '') + h + ':00</bdi></i>';
    var cols = ds.map(function (day) {
      var now = day === today ? '<i class="cbNow" style="top:' + Math.round((mins(Date.now()) - hr[0] * 60) * PX) + 'px"></i>' : '';
      var blocks = dayEvents(day).filter(function (e) { return !e.allDay; }).map(function (e) {
        var s = Date.parse(e.start), en = Date.parse(e.end || e.start), a = mins(s), b = dk(en) === day ? mins(en) : 24 * 60;
        var top = (a - hr[0] * 60) * PX, ht = Math.max(22, (b - a) * PX - 2);
        return '<button type="button" class="cbBlk' + (past(e) ? ' past' : '') + (bd.sel === e.id ? ' on' : '') + '" data-cb="ev" data-id="' + esc(e.id) + '" style="top:' + Math.round(top) + 'px;height:' + Math.round(ht) + 'px">'
          + '<b>' + esc(e.title || 'פגישה') + '</b>' + (bd.mode === 'day' ? '<small><bdi dir="ltr">' + hm(s) + '–' + hm(en) + '</bdi>' + (e.where ? ' · 📍 ' + esc(e.where) : '') + (e.meet ? ' · 🎥' : '') + '</small>' : '') + '</button>';
      }).join('');
      return '<div class="cbC' + (day === today ? ' now' : '') + '" style="height:' + Math.round(H) + 'px">' + now + blocks + '</div>';
    }).join('');
    return head + allRow + '<div class="cbW"><div class="cbT" style="height:' + Math.round(H) + 'px">' + lines + '</div><div class="cbCs" style="--n:' + ds.length + ';background:repeating-linear-gradient(to bottom,#e2e8f0 0 1px,transparent 1px ' + (60 * PX) + 'px)">' + cols + '</div></div>';
  }
  function card() {
    if (!bd.sel) return '';
    var e = all().filter(function (x) { return x.id === bd.sel; })[0]; if (!e) { bd.sel = ''; return ''; }
    var s = Date.parse(e.start), en = Date.parse(e.end || e.start), day = e.allDay ? String(e.start).slice(0, 10) : dk(s);
    var when = DAYS[dow(day)] + ' ' + dm(day) + (e.allDay ? ', כל היום' : ', <bdi dir="ltr">' + hm(s) + '–' + hm(en) + '</bdi>');
    var note = String(e.note || '').replace(/קישור לפגישה:\s*\S+/g, '').trim().slice(0, 500);
    return '<div class="cbCard" role="dialog" aria-label="' + esc(e.title || 'פגישה') + '"><button type="button" class="cbX2" data-cb="close" aria-label="סגירה">✕</button>'
      + '<b class="cbCt">' + esc(e.title || 'פגישה') + '</b>'
      + '<div class="cbR"><span>מתי</span><b>' + when + '</b></div>'
      + (e.where ? '<div class="cbR"><span>איפה</span><b>' + esc(e.where) + '</b></div>' : '')
      + (e.who && e.who.length ? '<div class="cbR"><span>מי</span><b>' + esc(e.who.join(', ')) + '</b></div>' : '')
      + (note ? '<div class="cbR"><span>פרטים</span><b class="cbNote">' + esc(note) + '</b></div>' : '')
      + (e.meet ? '<a class="cbMeet" href="' + esc(e.meet) + '" target="_blank" rel="noopener">🎥 כניסה לפגישה</a>' : '') + '</div>';
  }
  function title() { var a = days(), f = a[0], l = a[a.length - 1]; return bd.mode === 'day' ? DAYS[dow(f)] + ' ' + dm(f) : dm(f) + '–' + dm(l); }
  function draw() {
    var w = document.getElementById('calBoard'); if (!w) return;
    var n = 0; days().forEach(function (day) { n += dayEvents(day).length; });
    var sc = w.querySelector('.cbS'), top = sc ? sc.scrollTop : -1;
    w.innerHTML = '<div class="cbHd"><button type="button" class="cbX" data-cb="x" aria-label="סגירה">✕</button><b>📅 הלוח שלי</b>'
      + '<div class="cbSeg"><button type="button" data-cb="mday" aria-pressed="' + (bd.mode === 'day') + '">יום</button><button type="button" data-cb="mweek" aria-pressed="' + (bd.mode === 'week') + '">שבוע</button></div></div>'
      + '<div class="cbNav"><button type="button" data-cb="prev" aria-label="קודם">→</button><b>' + title() + '</b><span>' + n + ' פגישות</span><button type="button" data-cb="today">היום</button><button type="button" data-cb="next" aria-label="הבא">←</button></div>'
      + '<div class="cbS">' + grid() + '</div>' + card();
    sc = w.querySelector('.cbS');
    if (sc) { if (top >= 0) sc.scrollTop = top; else { var nw = w.querySelector('.cbNow'), f = w.querySelector('.cbBlk'); var y = nw ? nw.offsetTop : f ? f.offsetTop : 0; sc.scrollTop = Math.max(0, y - 80); } }
  }
  function close() { var w = document.getElementById('calBoard'); if (w) w.remove(); }
  W.calBoardOpen = function (day, mode) {
    bd.day = day || dk(Date.now()); bd.mode = mode === 'day' ? 'day' : 'week'; bd.sel = '';
    close();
    var w = document.createElement('div'); w.id = 'calBoard'; w.className = 'cbBoard'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'הלוח שלי');
    document.body.appendChild(w); draw();
  };
  function pulse(el, e) { try { el.animate([{ transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.3,1.4,.5,1)' }); } catch (x) {} }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('calBoard')) { if (bd.sel) { bd.sel = ''; draw(); } else close(); } });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cb]'), inBoard = e.target.closest && e.target.closest('#calBoard');
    if (!b) { if (inBoard && bd.sel && !(e.target.closest && e.target.closest('.cbCard'))) { bd.sel = ''; draw(); } return; }
    var a = b.getAttribute('data-cb'); pulse(b, e);
    if (a === 'board') return W.calBoardOpen('', 'week');
    if (a === 'day' && !inBoard) return W.calBoardOpen(b.getAttribute('data-cd'), 'day');
    if (!inBoard) return;
    if (a === 'x') return close();
    if (a === 'close') bd.sel = '';
    else if (a === 'mday') bd.mode = 'day';
    else if (a === 'mweek') bd.mode = 'week';
    else if (a === 'prev') bd.day = addDays(bd.day, bd.mode === 'week' ? -7 : -1);
    else if (a === 'next') bd.day = addDays(bd.day, bd.mode === 'week' ? 7 : 1);
    else if (a === 'today') bd.day = dk(Date.now());
    else if (a === 'day') { bd.day = b.getAttribute('data-cd'); bd.mode = 'day'; bd.sel = ''; }
    else if (a === 'ev') bd.sel = b.getAttribute('data-id');
    draw();
  }, true);
}

const CSS = `
.cbWeek{margin:10px 0 8px;padding:10px 10px 8px;border:1px solid #e2e8f0;border-radius:16px;background:#fff;color:#16202c;direction:rtl;text-align:right;font-family:Heebo,system-ui,sans-serif}
.cbWeekH{display:flex;align-items:center;gap:8px;margin-bottom:6px}.cbWeekH b{font-size:15px;font-weight:800}.cbWeekH span{flex:1;font-size:13px;color:#5f6b7f}
.cbWds{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.cbWd{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 0 5px;border-radius:12px;background:#efeafd;min-height:84px;color:#16202c}
.cbWd.now{background:#6d4bd8;color:#fff}
.cbWdN{font-size:12px;font-weight:700}.cbWdD{font-size:17px;font-weight:800;line-height:1}
.cbWdB{display:flex;flex-direction:column;gap:2px;width:70%;min-height:22px;justify-content:flex-end}.cbWdB i{display:block;height:3px;border-radius:2px;background:#6d4bd8}.cbWdB i.ad{background:#e8a900}
.cbWd.now .cbWdB i{background:#fff}.cbWdC{font-size:12.5px;font-weight:700}
.cbFull{all:unset;box-sizing:border-box;cursor:pointer;display:grid;place-items:center;width:100%;min-height:42px;margin-top:8px;border-radius:14px;border:1.5px solid #6d4bd8;color:#6d4bd8;font:700 15px Heebo,system-ui,sans-serif}
.cbWd:focus-visible,.cbFull:focus-visible{outline:3px solid #6d4bd8;outline-offset:2px}
.cbBoard{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#fff;color:#16202c;direction:rtl;text-align:right;font-family:Heebo,system-ui,sans-serif;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
.cbHd{display:flex;align-items:center;gap:10px;padding:10px 12px 6px}.cbHd>b{flex:1;font-size:18px;font-weight:800}
.cbX,.cbX2{all:unset;box-sizing:border-box;cursor:pointer;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#efeafd;font-size:18px}
.cbSeg{display:flex;gap:6px;width:150px}.cbSeg button{all:unset;box-sizing:border-box;flex:1;text-align:center;cursor:pointer;min-height:40px;display:grid;place-items:center;border:1.5px solid #e2e8f0;border-radius:12px;font:700 14px Heebo,system-ui,sans-serif;color:#5f6b7f}
.cbSeg button[aria-pressed=true]{border-color:#6d4bd8;background:#efeafd;color:#6d4bd8}
.cbNav{display:flex;align-items:center;gap:4px;padding:0 8px 6px}.cbNav b{font-size:15.5px;font-weight:800}.cbNav span{flex:1;font-size:13px;color:#5f6b7f;margin-inline-start:6px}
.cbNav button{all:unset;cursor:pointer;min-height:34px;padding:0 10px;display:inline-flex;align-items:center;border-radius:10px;font:600 14px Heebo,system-ui,sans-serif;color:#6d4bd8}
.cbS{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;border-top:1px solid #e2e8f0}
.cbH,.cbAll{position:sticky;top:0;z-index:8;display:grid;grid-template-columns:44px repeat(var(--n),1fr);background:#fff;box-shadow:0 1px 0 #e2e8f0}
.cbH b{display:flex;flex-direction:column;align-items:center;padding:6px 2px;font-size:12.5px;font-weight:700;line-height:1.2;cursor:pointer}.cbH b span{font-size:15px;font-weight:800}.cbH b.now{color:#6d4bd8}
.cbAll{position:static;z-index:1;box-shadow:none;border-bottom:1px solid #e2e8f0;padding:3px 0}.cbAll>span{font-size:10.5px;color:#5f6b7f;text-align:center;align-self:center}.cbAll>div{display:flex;flex-direction:column;gap:2px;padding:0 2px;min-width:0}
.cbChip{all:unset;box-sizing:border-box;cursor:pointer;display:block;padding:2px 5px;border-radius:6px;background:#fff3cd;border-inline-start:3px solid #e8a900;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbW{display:flex;position:relative}.cbT{position:relative;flex:none;width:44px}
.cbL{position:absolute;inset-inline-start:0;width:44px;margin-top:-8px;font-style:normal;font-size:11px;color:#5f6b7f;text-align:center}
.cbCs{flex:1;display:grid;grid-template-columns:repeat(var(--n),1fr)}
.cbC{position:relative;border-inline-start:1px solid #e2e8f0}.cbC.now{background:rgba(109,75,216,.04)}
.cbNow{position:absolute;inset-inline:0;height:2px;background:#d93a2f;z-index:2}.cbNow::before{content:"";position:absolute;inset-inline-start:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:#d93a2f}
.cbBlk{all:unset;box-sizing:border-box;cursor:pointer;position:absolute;inset-inline:2px;z-index:1;overflow:hidden;padding:2px 5px;border-radius:7px;border-inline-start:4px solid #6d4bd8;background:#efeafd;font-size:11.5px;line-height:1.25;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.cbBlk b{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cbBlk small{display:block;font-size:11.5px;color:#5f6b7f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbBlk.past{opacity:.55}.cbBlk.on{outline:2.5px solid #6d4bd8;outline-offset:-1px;z-index:2}
.cbCard{position:absolute;inset-inline:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:9;padding:14px 14px 12px;border-radius:18px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.22);animation:cbUp .22s ease both;max-height:60vh;overflow:auto}
@keyframes cbUp{from{transform:translateY(20px);opacity:0}}
.cbX2{position:absolute;top:10px;inset-inline-end:10px;width:34px;height:34px;font-size:15px}
.cbCt{display:block;margin:0 0 8px;padding-inline-end:40px;font-size:17px;font-weight:800}
.cbR{display:flex;gap:10px;padding:5px 0;border-bottom:1px solid #e2e8f0;font-size:14.5px}.cbR span{width:56px;flex:none;color:#5f6b7f}.cbR b{font-weight:600;min-width:0;overflow-wrap:anywhere}.cbNote{white-space:pre-wrap;font-weight:400!important}
.cbMeet{display:grid;place-items:center;min-height:44px;margin-top:10px;border-radius:14px;background:#6d4bd8;color:#fff;font:700 15px Heebo,system-ui,sans-serif;text-decoration:none}
@media (min-width:900px){.cbBlk{font-size:12.5px}.cbH b{font-size:14px}.cbCard{inset-inline:auto 24px;width:380px}}
@media (prefers-reduced-motion:reduce){.cbCard{animation:none}}
`;

function html(inst) {
  if (!inst || inst.calBoard !== true) return '';
  return '<style>' + CSS + '</style><script>(' + page.toString() + ')();</script>';
}
module.exports = { html, page, CSS };
