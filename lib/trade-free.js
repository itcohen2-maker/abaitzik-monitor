'use strict';
/*
  21.11.2026, Itzik: "אולי נוסיף כפתור, אייקון, ׳כלול במחיר׳, ולחיצה עליו מראה את כל האימונים ועוד דברים שנחליט לשים שם."
  A trade monitor's home gets one pill, "🎁 כלול במחיר", next to the microphone hint under the ring. A tap opens a sheet
  (the look of the trade sheets, .trSheet/.trCard of lib/trade-cards.js) that says everything in it is already part of the price,
  and lists what is there: the three trainings, quotes, digital signing, meeting summaries, reminders, post ideas, the calendar.
  Each row has "לפתוח", which presses the real entry of the page (a tile or an icon), so in a demo it does what that entry does in a demo.

  The list is data (FREE). A row is shown only when its target exists in this build, never a dead row:
    open 'chat:<command>'  one of the three trainings, shown while the fast chat is on (the same switch that shows the three icons)
    open '<id>'            a tile id of build.js (the trade's screens and the always on tiles); alt is an icon used when the tile is not there
  Not in the list, on purpose: ☀️ the morning brief (gBrief) is not on any trade's home, and a standalone entry for signing does not
  exist for a customer (it is part of the quote screen, so the row opens that).
  Only a monitor whose instance.json has a known "trade" gets anything (html() is '' for any other). The sheet closes on ✕, a tap outside,
  Esc and the browser's Back, all of which lib/trade-cards.js already does for every .trSheet.
*/
const trades = require('./trades.js');
const TC = require('./trade-cards.js');

// the three trainings, the page's own icons (build.js icFc*) and the messages they send
const CHAT = { 'אימון עסקי': 'icFcCoach', 'אימון אישי': 'icFcPersonal', 'אימון מכירות': 'icFcSales' };

// icon, name, one short line; neutral wording (plural or infinitive), so it is right for a man and a woman alike
const FREE = [
  { id: 'coach', icon: '🧭', name: 'אימון עסקי', line: 'מאמן עסקי שמכיר את העסק שלך', open: 'chat:אימון עסקי' },
  { id: 'personal', icon: '🌿', name: 'אימון אישי', line: 'שיחה אישית, בקצב שלך', open: 'chat:אימון אישי' },
  { id: 'sales', icon: '🎯', name: 'אימון מכירות', line: 'מתאמנים על שיחת מכירה מול לקוח קשה', open: 'chat:אימון מכירות' },
  { id: 'quote', icon: '🧾', name: 'הצעות מחיר', line: 'הצעה מעוצבת תוך דקה', open: 'gBhQuote' },
  { id: 'sign', icon: '✍️', name: 'חתימה דיגיטלית', line: 'הלקוח חותם מהטלפון', open: 'gBhQuote' },
  { id: 'meet', icon: '🎙️', name: 'סיכומי פגישות', line: 'תמלול וסיכום, והמשימות ביומן', open: 'gBhMeet' },
  { id: 'remind', icon: '⏰', name: 'תזכורות', line: 'בוואטסאפ, בשעה שביקשת', open: 'gRemind' },
  { id: 'ideas', icon: '📸', name: 'רעיונות לפוסטים', line: 'פוסט מוכן לאינסטגרם', open: 'gCIdeas' },
  { id: 'cal', icon: '📅', name: 'יומן', line: 'מה מחכה ביומן, ומה בהמשך', open: 'gBhCal', alt: 'icTCal' },
];
const TITLE = 'כלול במחיר';
const INTRO = 'הכול כבר בפנים, בלי תוספת תשלום.';

// What this trade has (build time): the trainings always (the page hides them when the chat is off), a tile when it is one of the trade's.
function items(t) {
  return FREE.filter((it) => it.open.indexOf('chat:') === 0 ? !!CHAT[it.open.slice(5)] : (TC.targetOk(t, it.open) || !!it.alt));
}

// The page side, put on the page with toString. Plain ES5, no closing script tag inside.
function page(D) {
  function $(id) { return document.getElementById(id); }
  function chatOn() { var r = $('fcRow'); return !!(r && !r.hidden && $('icFcCoach')); }
  function targetOf(it) {
    if (it.open.indexOf('chat:') === 0) return chatOn() ? $(D.chat[it.open.slice(5)]) : null;
    var e = $(it.open); if (!e && it.alt) e = $(it.alt); return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function openSheet() {
    ['trFb', 'trGuide', 'trFree'].forEach(function (id) { var e = $(id); if (e) e.remove(); });
    var list = D.items.filter(targetOf); if (!list.length) return;
    var s = document.createElement('div'); s.id = 'trFree'; s.className = 'trSheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', D.title);
    s.innerHTML = '<div class="trCard"><button type="button" class="trX" aria-label="סגירה">✕</button><b class="trH">' + esc(D.title) + '</b><p>' + esc(D.intro) + '</p>'
      + list.map(function (it, i) {
        return '<div class="frRow"><span class="frI" aria-hidden="true">' + esc(it.icon) + '</span><span class="frT"><b>' + esc(it.name) + '</b><small>' + esc(it.line) + '</small></span>'
          + '<button type="button" class="frGo" data-i="' + i + '" aria-label="לפתוח: ' + esc(it.name) + '">לפתוח</button></div>';
      }).join('') + '</div>';
    s.addEventListener('click', function (e) {
      if (e.target === s || e.target.closest('.trX')) { s.remove(); return; }
      var g = e.target.closest('.frGo'); if (!g) return;
      var t = targetOf(list[+g.getAttribute('data-i')]);
      s.remove();
      // after the sheet's history step is gone (build.js histSync), so the screen it opens keeps its own
      if (t) setTimeout(function () { t.click(); }, 150);
    });
    document.body.appendChild(s);
    var f = s.querySelector('.frGo'); if (f) { try { f.focus({ preventScroll: true }); } catch (x) {} }
  }
  function mount() {
    var w = $('tradeCards'); if (!w || $('trFreeBtn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'trFreeBtn'; b.innerHTML = '<span aria-hidden="true">🎁</span> ' + esc(D.title);
    b.addEventListener('click', openSheet);
    var row = w.querySelector('.trHintRow'); if (row) row.appendChild(b); else w.appendChild(b);
  }
  mount();
  document.addEventListener('DOMContentLoaded', mount);
  setTimeout(mount, 1500); // the public demo puts the page back together after load
}

function css() {
  return '#trFreeBtn{all:unset;cursor:pointer;position:relative;box-sizing:border-box;display:inline-flex;align-items:center;gap:5px;margin-top:8px;margin-inline-start:8px;padding:5px 12px;border-radius:999px;'
    + 'background:var(--accent-soft,rgba(127,127,127,.18));color:var(--accent,inherit);border:1px solid color-mix(in srgb,var(--accent,#888) 45%,transparent);font:700 13px Heebo,system-ui,sans-serif;white-space:nowrap}'
    + '#trFreeBtn::after{content:"";position:absolute;inset:-8px -4px}'
    + '#trFreeBtn:focus-visible{outline:3px solid var(--accent,#4285F4);outline-offset:2px}'
    + '#trFree .frRow{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #2a2f3a}'
    + '#trFree .frI{flex:none;width:36px;text-align:center;font-size:26px;line-height:1}'
    + '#trFree .frT{flex:1;min-width:0}#trFree .frT b{display:block;font-size:16px;font-weight:800}#trFree .frT small{display:block;font-size:13.5px;color:#aeb5c1;margin-top:1px}'
    + '#trFree .frGo{all:unset;cursor:pointer;box-sizing:border-box;flex:none;min-height:44px;padding:0 16px;display:inline-flex;align-items:center;border-radius:999px;background:#fff;color:#111;font:800 14.5px Heebo,system-ui,sans-serif}'
    + '#trFree .frGo:focus-visible{outline:3px solid #4285F4;outline-offset:2px}';
}

function html(inst) {
  const t = inst && trades.get(inst.trade);
  if (!t || !inst.dataPath) return '';
  const data = JSON.stringify({ title: TITLE, intro: INTRO, chat: CHAT, items: items(t) }).replace(/</g, '\\u003c');
  return '<style>' + css() + '</style><script>(' + page.toString() + ')(' + data + ');</script>';
}

module.exports = { FREE, CHAT, TITLE, INTRO, items, page, html };
