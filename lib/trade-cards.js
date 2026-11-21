'use strict';
/*
  21.11.2026, Itzik: a service provider's monitor opens with three cards in the words of his trade
  (lib/trades.js), and the rest folded behind "עוד כלים". Built at build time from the data files:
    debt   money/money.json debtors [[name, amount, days since the job was done]]
    today  biz-home/events.json, the events of today (Israel)
    quotes biz-home/quotes.json, the ones not signed
  Only for a monitor whose instance.json has a known "trade"; any other monitor gets ''.
  A tap on a card opens its screen (the tile button with that id). The action button shows the demo line
  on the public demo (window.demoToast), and is not drawn on any other monitor yet.
*/
const fs = require('fs');
const path = require('path');
const trades = require('./trades.js');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shekel = (n) => Number(n || 0).toLocaleString('he-IL') + ' ₪';
const dayIL = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }

const LINES = {
  debt: (dp) => (readJson(path.join(dp, 'money', 'money.json'), {}).debtors || [])
    .map(([name, amount, days]) => name + ' · ' + shekel(amount) + ' · ' + days + ' ימים מסיום העבודה'),
  today: (dp, now) => (readJson(path.join(dp, 'biz-home', 'events.json'), []) || [])
    .filter((e) => e && e.start && dayIL(e.start) === dayIL(now))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .map((e) => hhmm(e.start) + ' ' + String(e.title || '').split(':')[0] + (e.where ? ', ' + e.where : '')),
  quotes: (dp, now) => (readJson(path.join(dp, 'biz-home', 'quotes.json'), []) || [])
    .filter((q) => q && !q.signed)
    .map((q) => { const d = Math.max(0, Math.round((now - Date.parse(q.at)) / 864e5)); return q.client + ' · נשלחה לפני ' + d + ' ימים, עוד לא חתם'; }),
};

function payload(dataPath, trade, now) {
  now = now || Date.now();
  return trade.cards.map((c) => {
    let lines = [];
    try { lines = (LINES[c.k] || (() => []))(dataPath, now); } catch (e) { lines = []; }
    return { k: c.k, emoji: c.emoji, title: c.title, lines: lines.length ? lines.slice(0, 4) : ['אין כרגע'], btn: lines.length ? c.btn : null, open: c.open };
  });
}

function html(inst, now) {
  const t = inst && trades.get(inst.trade);
  if (!t || !inst.dataPath) return '';
  const demo = inst.publicDemo === true;
  const cards = payload(inst.dataPath, t, now).map((c) => '<div class="tcCard" role="button" tabindex="0" data-open="' + esc(c.open) + '">'
    + '<b class="tcT"><span aria-hidden="true">' + c.emoji + '</span> ' + esc(c.title) + '</b>'
    + c.lines.map((l) => '<div class="tcL">' + esc(l) + '</div>').join('')
    + (c.btn && demo ? '<button type="button" class="tcBtn" data-say="' + esc(c.title) + '">' + esc(c.btn) + '</button>' : '')
    + '</div>').join('');
  // 21.11.2026, Itzik: WhatsApp is a must. On the public demo the cards open with a sample conversation of the trade.
  const wa = demo && Array.isArray(t.wa) && t.wa.length
    ? '<div id="tradeWa" aria-label="ככה זה נראה בוואטסאפ"><b class="twH">💬 ככה זה נראה בוואטסאפ</b>'
      + t.wa.map(([who, text]) => '<div class="twB ' + (who === 'me' ? 'twMe' : 'twMon') + '">' + esc(text) + '</div>').join('') + '</div>'
    : '';
  const css = '<style>#tradeWa{display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:16px;background:#efeae2;font-family:Heebo,system-ui,sans-serif}'
    + '#tradeWa .twH{color:#075e54;font-weight:800;margin-bottom:2px}'
    + '#tradeWa .twB{max-width:85%;padding:8px 12px;border-radius:12px;line-height:1.45;color:#111b21;box-shadow:0 1px 1px rgba(0,0,0,.12)}'
    + '#tradeWa .twMe{align-self:flex-start;background:#d9fdd3}#tradeWa .twMon{align-self:flex-end;background:#fff}'
    + '#tradeCards{--tc:' + t.accent + ';display:flex;flex-direction:column;gap:12px;margin:10px 0 calc(150px + env(safe-area-inset-bottom))}'
    + '#tradeCards .tcCard{display:block;min-height:44px;padding:14px 16px;border-radius:16px;border:2px solid var(--tc);background:rgba(127,127,127,.08);text-align:start;cursor:pointer;font-family:Heebo,system-ui,sans-serif}'
    + '#tradeCards .tcT{display:block;font-weight:800;font-size:1.15em;color:var(--tc);margin-bottom:6px}'
    + '#tradeCards .tcL{font-size:1em;line-height:1.5;padding:2px 0}'
    + '#tradeCards .tcBtn{margin-top:10px;min-height:44px;padding:0 16px;border-radius:999px;border:0;background:var(--tc);color:#fff;font:700 1em Heebo,system-ui,sans-serif;cursor:pointer}</style>';
  const js = '<script>(function(){var w=document.getElementById("tradeCards");if(!w)return;'
    + 'w.addEventListener("click",function(e){var b=e.target.closest(".tcBtn");if(b){e.stopPropagation();if(window.demoToast)window.demoToast("הכנתי הודעה מנומסת בשם המשרד, והיא מחכה לאישור שלך.");return;}'
    + 'var c=e.target.closest(".tcCard");if(!c)return;var g=document.getElementById(c.getAttribute("data-open"));if(g)g.click();});'
    + 'w.addEventListener("keydown",function(e){if(e.key==="Enter"&&e.target.classList.contains("tcCard"))e.target.click();});})();</script>';
  return css + '<section id="tradeCards" aria-label="' + esc(t.label) + '">' + wa + cards + '</section>' + js;
}

module.exports = { payload, html };
