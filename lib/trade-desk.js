'use strict';
/*
  21.11.2026, Itzik: "adapted to the browser, behaves differently from the phone, the answers screen must not be long
  complicated rows, everything consistent with the monitor". The desktop browser version of a trade monitor.

  Scope, on purpose narrow: only a monitor whose instance.json has a known "trade" (lib/trades.js) gets any of this,
  and only at `(min-width:1000px) and (pointer:fine)`. Every rule below sits inside that one media query, so a phone, a
  tablet and a narrow window keep exactly their own layout. Any other monitor gets '' (like lib/trade-cards.js).

  What it does, all by restyling the page that is already there:
    rail     the real nav.bn becomes a vertical rail (same buttons, same handlers, same red dot and counters)
    day      the header and #tradeCards (the day ring, the microphone, today / what I did) are the left column
    work     the write box (#talkCard) on top, the rest of the home under it; the chat sheet docks beside the day
    answers  master/detail: one line rows on one side, the chosen answer as a document on the other. The rows are
             drawn from the cards renderAnswers already made (it is not touched); the chosen card stays in place
             and is shown as the document, so its buttons and its reply box keep working.
    keys     Space starts and stops the ring (it presses #tradeRing), arrows move between answers.
  The client part is a plain function put on the page with toString, like lib/trade-cards.js page().
*/
const trades = require('./trades.js');

const MQ = '(min-width:1000px) and (pointer:fine)';
const RAIL = 88, DAY = 460; // px; the work area is the rest

// All of it inside one media query. Tokens only (--ground, --surface, --ink, --dim, --line, --accent...): light and dark follow.
function rules() {
  const home = 'body:not(.offHome) .wrap';
  const ans = 'body.offHome .wrap:has(#pA:not([hidden]))';
  return [
    // ---- the page: a rail on the start side; on the home a fixed day column, then the work area ----
    '.wrap{max-width:none;margin:0;padding:26px 0 0;padding-inline-start:' + RAIL + 'px;min-height:100vh}',
    'body.offHome .wrap{padding-bottom:40px}',
    'body.offHome .wrap>*:not(.bn){max-width:860px;width:100%;margin-inline:auto;box-sizing:border-box}',
    home + '{padding-inline-start:' + (RAIL + DAY) + 'px;padding-bottom:0}',
    '.wrap{box-sizing:border-box}',
    home + '::before{content:"";position:fixed;top:var(--dkTop,0px);bottom:0;inset-inline-start:' + (RAIL + DAY - 1) + 'px;width:1px;background:var(--line);pointer-events:none}',
    // ---- the rail: the real bottom navigation, standing up ----
    '.bn{inset:0 auto 0 auto;inset-inline-start:0;width:' + RAIL + 'px;height:auto;flex-direction:column;justify-content:flex-start;gap:4px;padding:92px 0 18px;border-top:0;border-inline-end:1px solid var(--line);background:var(--surface);-webkit-backdrop-filter:none;backdrop-filter:none}',
    'nav.bn::before{top:0;bottom:0;left:0;right:auto;width:2px;height:auto;background:linear-gradient(to bottom,var(--blue),var(--red),var(--yellow),var(--green))}',
    '.bn button{flex:none;width:100%;min-height:0;padding:12px 0;gap:5px;font-size:12.5px;font-weight:500;border-radius:0;transition:color .2s}',
    '.bn button:hover{color:var(--ink)}',
    '.bn button svg,.bn button[aria-pressed="true"] svg{width:26px;height:26px;padding:0;border:0;border-radius:0;background:none;box-shadow:none;stroke:currentColor;stroke-width:1.7}',
    '.bn button[aria-pressed="true"]{color:var(--accent);font-weight:700;background:linear-gradient(to left,var(--accent-soft),transparent 85%);box-shadow:none}',
    '.bn button[aria-pressed="true"] svg{color:var(--accent);stroke:var(--accent);stroke-width:1.9}',
    '.bn button[aria-pressed="true"]::before{content:"";position:absolute;inset-inline-start:0;top:8px;bottom:8px;width:3.5px;background:var(--accent);border-radius:0 3px 3px 0}',
    '[dir=rtl] .bn button[aria-pressed="true"]::before{border-radius:3px 0 0 3px}',
    '.bn button.hasnew svg{border:0}',
    '.bn .cnt{top:6px;inset-inline-end:auto;inset-inline-start:calc(50% + 6px)}',
    '.bn .dot{top:8px;inset-inline-end:auto;inset-inline-start:calc(50% + 8px)}',
    // ---- the day column ----
    // the header and the day: fixed to the window beside the rail, so the work area can scroll by itself
    home + '>.hd{position:fixed;inset-inline-start:' + RAIL + 'px;top:calc(var(--dkTop,0px) + 26px);width:' + DAY + 'px;box-sizing:border-box;margin:0;padding:0 34px;flex-wrap:nowrap;z-index:2}',
    home + '>.hd .t{font-size:25px;line-height:1.2}',
    home + '>.hd .s{font-size:14px}',
    home + ' #tradeCards{position:fixed;inset-inline-start:' + RAIL + 'px;top:calc(var(--dkTop,0px) + 96px);bottom:0;width:' + DAY + 'px;margin:0;padding:6px 34px 26px;gap:12px;overflow-y:auto;overflow-x:hidden;box-sizing:border-box}',
    '#tradeCards>*{flex:none}',
    'body #tradeRing{width:clamp(232px,34vh,296px)}',
    '#tradeCards .trStage{padding:14px 0 6px}',
    '#tradeCards .trHintRow{margin-top:2px}',
    '#tradeCards .trHint{font-size:15px;padding:8px 18px;margin-top:6px}',
    '#tradeCards .trRow{padding:13px 8px}#tradeCards .trRow .t{font-size:16.5px}#tradeCards .trRow .t small{font-size:13.5px}',
    '#deskKeys{text-align:center;color:var(--dim);font-size:13px;margin:-2px 0 4px}#deskKeys kbd{font:inherit;font-weight:700;color:var(--ink)}',
    // the side switch of the ring becomes a two part control above the list (the same toggle, see page())
    '#tradeCards:has(#deskSeg) #tradeSw{display:none}',
    '#deskSeg{display:flex;margin-top:4px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface)}',
    '#deskSeg button{all:unset;box-sizing:border-box;flex:1;text-align:center;padding:10px 0;font:500 15px Heebo,system-ui,sans-serif;color:var(--dim);cursor:pointer;transition:background .2s,color .2s}',
    '#deskSeg button+button{border-inline-start:1px solid var(--line)}',
    '#deskSeg button[aria-pressed="true"]{background:var(--accent-soft);color:var(--accent);font-weight:700}',
    '#deskSeg button:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}',
    // ---- the work area: the write box on top, the rest under it in a readable column (the page's normal flow) ----
    home + '>#talkCard,' + home + '>#fcRow,' + home + '>#reloadBtn{margin-inline:44px!important}',
    home + '>#talkCard{max-width:880px;margin-top:0!important}',
    home + '>#pH{margin-inline:44px;max-width:68ch}',
    home + '>#pH>:not(#tradeCards){max-width:68ch}',
    home + '>#pH #approvalsBox,' + home + '>#pH #leadAlert{margin-top:14px}',
    // the chat sheet of the monitor opens over the whole window; here it sits in the work area, the day stays visible
    '#fcSheet.gFull{left:0!important;right:' + (RAIL + DAY) + 'px!important;width:auto!important;inset-inline-start:auto}',
    '#fcSheet.gFull .ycard{max-width:720px!important}',
    // ---- the answers: list on the start side, the chosen answer as a document ----
    ans + '{display:flex;flex-direction:column;height:calc(100vh - var(--dkTop,0px));overflow:hidden;padding:18px 0 0;padding-inline-start:' + RAIL + 'px}',
    ans + '>*:not(.bn){max-width:none;width:auto;margin-inline:0;padding-inline:0}',
    ans + '>#paneBar{padding-inline:28px}',
    '.bn button[aria-pressed="true"],.bn button[aria-pressed="true"].hasnew{color:var(--accent)!important}',
    ans + '>.hd{padding-inline:28px;margin:0 0 12px;flex:none}',
    ans + '>#pA{flex:1;min-height:0}',
    '#pA:not([hidden]){display:grid;grid-template-columns:440px minmax(0,1fr);grid-template-rows:auto auto auto auto auto minmax(0,1fr);padding:0;min-height:0;border-top:1px solid var(--line)}',
    '#pA>*{grid-column:1/-1}',
    '#pA>h2,#pA>#holdLine,#pA>#ansHelp,#pA>#aTip,#pA>#aChips,#pA>#aSearch{grid-column:1;margin-inline:28px}',
    '#pA>h2{margin-top:18px;font-size:22px}',
    '#pA>#aChips{margin-bottom:10px}',
    '#pA>#aSearch{width:calc(100% - 56px);box-sizing:border-box;margin-bottom:10px;padding:9px 14px}',
    '#pA>#deskList{grid-column:1;grid-row:6;min-height:0;overflow-y:auto;border-top:1px solid var(--line);border-inline-end:1px solid var(--line)}',
    '#pA>#ansBox{grid-column:2;grid-row:1/-1;min-height:0;overflow-y:auto;overflow-x:hidden}',
    '#deskList .deskRow{display:grid;grid-template-columns:12px minmax(0,1fr) auto;column-gap:14px;align-items:start;width:100%;box-sizing:border-box;text-align:start;padding:14px 28px 14px 22px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;cursor:pointer;position:relative;transition:background .15s}',
    '#deskList .deskRow:hover{background:color-mix(in srgb,var(--accent-soft) 45%,transparent)}',
    '#deskList .deskRow:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}',
    '#deskList .deskRow .d{width:11px;height:11px;border-radius:50%;margin-top:8px;background:var(--green)}',
    '#deskList .deskRow.fresh .d{background:var(--red)}#deskList .deskRow.back .d{background:var(--orange)}#deskList .deskRow.mine .d{background:var(--blue)}',
    '#deskList .deskRow .t,#deskList .deskRow .w{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#deskList .deskRow .t{font-size:16.5px;font-weight:500;line-height:1.4}',
    '#deskList .deskRow .w{color:var(--dim);font-size:13.5px;margin-top:2px}',
    '#deskList .deskRow .h{color:var(--dim);font-size:13px;margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '#deskList .deskRow.fresh .t{font-weight:700}#deskList .deskRow.fresh .h{color:var(--ink);font-weight:600}',
    '#deskList .deskRow.sel{background:var(--accent-soft)}',
    '#deskList .deskRow.sel::before{content:"";position:absolute;inset-inline-start:0;top:0;bottom:0;width:4px;background:var(--accent)}',
    '#deskList .deskMore{display:block;width:100%;padding:14px;border:0;background:transparent;color:var(--accent);font:600 15px Heebo,system-ui,sans-serif;cursor:pointer}',
    '#deskList .deskKeys{padding:16px 28px;color:var(--dim);font-size:13px}',
    '#ansBox>.ansc:not(.deskSel),#ansBox>button.ab,#ansBox>.ansUp{display:none}',
    '#ansBox>.ansc.deskSel{display:block;background:transparent;border:0;border-radius:0;box-shadow:none;margin:0;padding:30px 56px 44px;max-width:calc(68ch + 112px);box-sizing:border-box;line-height:1.75}',
    // the ring of an unread answer (lib/reply-pill.js) stays on its row's dot; the document itself is plain
    '#ansBox>.ansc.fresh.deskSel,#ansBox>.ansc.back.deskSel{border:0!important;background:transparent!important;box-shadow:none!important}',
    '#ansBox>.ansc.deskSel .achev{display:none}',
    '#ansBox>.ansc.deskSel>.w{font-size:14.5px;margin-bottom:14px}',
    '#ansBox>.ansc.deskSel .atxt{font-size:17px;line-height:1.75;-webkit-line-clamp:unset}',
    '#ansBox>.ansc.deskSel ul,#ansBox>.ansc.deskSel ol{margin:0 0 14px;padding-inline-start:1.5em;list-style-position:outside}',
    '#ansBox>.ansc.deskSel li{margin:0;padding-inline-start:.2em}',
    '#ansBox>.ansc.deskSel .arow{margin-top:26px;padding-top:18px;border-top:1px solid var(--line);gap:10px}',
    '#ansBox>.ansc.deskSel .arow .ab{padding:10px 20px;font-size:15px;border-radius:10px}',
    '#ansBox>.aempty{padding:40px 56px}',
    // ---- reduced motion and small heights ----
    '@media (max-height:760px){' + home + ' #tradeCards{padding-top:2px}body #tradeRing{width:clamp(220px,33vh,250px)}#tradeCards .trRow{padding:9px 8px}#tradeCards .trStage{padding-top:8px}}',
    '@media (prefers-reduced-motion:reduce){#deskSeg button,#deskList .deskRow,.bn button{transition:none}}',
  ].join('\n');
}

// The page side. Plain ES5, no closing script tag inside. Does nothing outside the media query, and follows it when the
// window is resized across it.
function page(MQ) {
  var mql; try { mql = window.matchMedia(MQ); } catch (e) { return; }
  var sel = 0, list = null, box = null, obs = null, raf = 0, segObs = null, ringObs = null;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function txt(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function typing(t) { return !!(t && t.closest && t.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]')); }
  // any window over the page: the monitor's sheets, its dialogs, the trade guide, the chat
  function overlay() {
    // (a sheet parked outside the window, like the monitor's own request sheet, is not open)
    var l = document.querySelectorAll('.ysheet,.fview,.trSheet,.ui-dlg-bg,#fcSheet,[role="dialog"],dialog[open]'), i, e, r, c;
    for (i = 0; i < l.length; i++) {
      e = l[i]; if (!e.isConnected || e.hidden) continue;
      r = e.getBoundingClientRect(); c = getComputedStyle(e);
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth && c.visibility !== 'hidden' && c.display !== 'none' && c.opacity !== '0') return true;
    }
    return false;
  }
  function homeShown() { var h = $('pH'); return !!(h && !h.hidden && !document.body.classList.contains('offHome')); }
  function ansShown() { var a = $('pA'); return !!(a && !a.hidden); }

  // ---- home: a two part control for the side switch, and the keyboard hint ----
  function buildHome() {
    var w = $('tradeCards'), sw = $('tradeSw'); if (!w) return;
    var hintRow = w.querySelector('.trHintRow');
    if (hintRow && !$('deskKeys')) {
      var k = document.createElement('div'); k.id = 'deskKeys';
      k.innerHTML = '<kbd>רווח</kbd>: להקליט · <kbd>Enter</kbd>: לשלוח';
      hintRow.parentNode.insertBefore(k, hintRow.nextSibling);
    }
    var firstList = w.querySelector('.trList');
    if (sw && firstList && !$('deskSeg')) {
      var seg = document.createElement('div'); seg.id = 'deskSeg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'היום או מה עשיתי');
      var n = txt(sw.querySelector('i'));
      seg.innerHTML = '<button type="button" data-m="day">היום</button><button type="button" data-m="did">מה עשיתי' + (n ? ' (' + esc(n) + ')' : '') + '</button>';
      firstList.parentNode.insertBefore(seg, firstList);
      var paint = function () {
        var did = sw.getAttribute('aria-pressed') === 'true';
        seg.querySelector('[data-m="day"]').setAttribute('aria-pressed', did ? 'false' : 'true');
        seg.querySelector('[data-m="did"]').setAttribute('aria-pressed', did ? 'true' : 'false');
      };
      // the same toggle the round switch has: pressing it is what the page already does
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-m]'); if (!b) return;
        var did = sw.getAttribute('aria-pressed') === 'true';
        if ((b.getAttribute('data-m') === 'did') !== did) sw.click();
      });
      if (window.MutationObserver) { segObs = new MutationObserver(paint); segObs.observe(sw, { attributes: true, attributeFilter: ['aria-pressed'] }); }
      paint();
    }
    // the hand that marks "now" on the ring was placed for the phone's ring; move it to the ring's real size
    var ring = $('tradeRing'), now = $('tradeNow');
    if (ring && now && window.ResizeObserver && !ringObs) {
      var fix = function () { var s = now.style.transform || ''; var r = s.replace(/translate\(-2px,\s*-?[\d.]+px\)/, 'translate(-2px,' + Math.round(ring.offsetWidth / 2 - 21) + 'px)'); if (r !== s) now.style.transform = r; };
      ringObs = new ResizeObserver(fix); ringObs.observe(ring); fix();
    }
  }
  function unbuildHome() {
    ['deskKeys', 'deskSeg'].forEach(function (id) { var e = $(id); if (e) e.remove(); });
    if (segObs) { segObs.disconnect(); segObs = null; }
    if (ringObs) { ringObs.disconnect(); ringObs = null; }
  }

  // ---- answers: rows from the cards that renderAnswers made; the chosen card stays and is the document ----
  function cards() { return box ? Array.prototype.slice.call(box.querySelectorAll(':scope > .ansc')) : []; }
  function rowOf(c, i) {
    var w = c.querySelector(':scope > .w'), parts = txt(w).split(' · ');
    var body = c.querySelector(':scope > .atxt'), title = '';
    if (body) title = txt(body);
    else { var cl = c.cloneNode(true); Array.prototype.forEach.call(cl.querySelectorAll('.aq,.w,.arow,.rbox,.asaid,.achev,button,textarea'), function (e) { e.remove(); }); title = txt(cl); }
    var q = c.querySelector(':scope > .aq'), dim = '';
    if (q) { var ql = q.querySelector('.qline,.qfold summary'); dim = txt(ql); }
    if (!dim) dim = parts[0] || '';
    var stamp = parts[1] || '', m = stamp.match(/\d{1,2}:\d{2}/);
    var cls = c.classList.contains('fresh') ? 'fresh' : c.classList.contains('back') ? 'back' : c.classList.contains('mine') ? 'mine' : 'done';
    return { cls: cls, title: title.slice(0, 140) || 'תשובה', dim: dim.slice(0, 140), time: m ? m[0] : stamp };
  }
  function sync() {
    raf = 0;
    if (!mql.matches || !ansShown()) return;
    box = $('ansBox'); var pa = $('pA'); if (!box || !pa) return;
    var cs = cards();
    if (sel >= cs.length) sel = cs.length - 1; if (sel < 0) sel = 0;
    if (!list) { list = document.createElement('div'); list.id = 'deskList'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'רשימת התשובות'); pa.insertBefore(list, box);
      list.addEventListener('click', function (e) {
        var b = e.target.closest('.deskRow'); if (b) { choose(+b.getAttribute('data-i'), true); return; }
        if (e.target.closest('.deskMore')) { var m = box.querySelector(':scope > button.ab'); if (m) m.click(); }
      });
    }
    var html = cs.map(function (c, i) {
      var r = rowOf(c, i);
      return '<button type="button" class="deskRow ' + r.cls + (i === sel ? ' sel' : '') + '" role="option" aria-selected="' + (i === sel) + '" data-i="' + i + '"><i class="d"></i><span><span class="t">' + esc(r.title) + '</span><span class="w">' + esc(r.dim) + '</span></span><span class="h">' + esc(r.time) + '</span></button>';
    }).join('');
    if (box.querySelector(':scope > button.ab')) html += '<button type="button" class="deskMore">להציג עוד</button>';
    if (cs.length) html += '<div class="deskKeys">חצים למעלה ולמטה: מעבר בין תשובות</div>';
    if (list.getAttribute('data-h') !== html) { list.innerHTML = html; list.setAttribute('data-h', html); }
    cs.forEach(function (c, i) {
      var want = i === sel;
      if (c.classList.contains('deskSel') !== want) c.classList.toggle('deskSel', want);
      if (want && c.classList.contains('acol')) c.classList.remove('acol');
    });
  }
  function later() { if (!raf) raf = window.requestAnimationFrame(sync); }
  function choose(i, focusRow) {
    var cs = cards(); if (!cs.length) return;
    sel = Math.max(0, Math.min(cs.length - 1, i));
    sync();
    if (box) box.scrollTop = 0;
    var r = list && list.querySelector('.deskRow[data-i="' + sel + '"]');
    if (r) { r.scrollIntoView({ block: 'nearest' }); if (focusRow || document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('deskRow')) r.focus({ preventScroll: true }); }
  }
  function buildAnswers() {
    box = $('ansBox'); if (!box) return;
    if (!obs && window.MutationObserver) { obs = new MutationObserver(later); obs.observe(box, { childList: true, attributes: true, subtree: true, attributeFilter: ['class'] }); }
    var pa = $('pA'); if (pa && window.MutationObserver && !pa._deskObs) { pa._deskObs = new MutationObserver(later); pa._deskObs.observe(pa, { attributes: true, attributeFilter: ['hidden'] }); }
    later();
  }
  function unbuildAnswers() {
    if (obs) { obs.disconnect(); obs = null; }
    var pa = $('pA'); if (pa && pa._deskObs) { pa._deskObs.disconnect(); pa._deskObs = null; }
    if (list) { list.remove(); list = null; }
    cards().forEach(function (c) { c.classList.remove('deskSel'); });
  }

  // ---- keys ----
  function onKey(e) {
    if (!mql.matches || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    var t = e.target;
    // Enter sends the write box (it was a new line); Shift+Enter keeps the new line. The same submit the button makes.
    if (e.key === 'Enter' && !e.shiftKey && t && t.id === 'quickText') {
      var f = $('quickForm');
      if (f && String(t.value || '').trim()) { e.preventDefault(); if (f.requestSubmit) f.requestSubmit(); else { var qb = $('quickBtn'); if (qb) qb.click(); } }
      return;
    }
    if (e.key === ' ' || e.code === 'Space') {
      // not while typing, not on a control that Space already presses, not with a window open: then it is the ring
      if (e.repeat || typing(t) || (t && t.closest && t.closest('button,a,summary,[role="button"],[role="option"],[role="tab"]'))) return;
      if (!homeShown() || overlay()) return;
      var ring = $('tradeRing'); if (!ring) return;
      e.preventDefault(); ring.click();
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && ansShown() && !e.shiftKey) {
      if (typing(t) || overlay() || !list) return;
      e.preventDefault(); choose(sel + (e.key === 'ArrowDown' ? 1 : -1), false);
    }
  }

  // the public demo has a ribbon above the page; the columns end where the window ends
  function rib() { var r = $('demoRib'); document.documentElement.style.setProperty('--dkTop', (r && r.isConnected && mql.matches ? r.offsetHeight : 0) + 'px'); }
  function apply() {
    rib();
    if (mql.matches) { buildHome(); buildAnswers(); } else { unbuildHome(); unbuildAnswers(); }
  }
  document.addEventListener('keydown', onKey);
  if (window.PUBLIC_DEMO) { setInterval(rib, 1000); window.addEventListener('resize', rib); }
  if (mql.addEventListener) mql.addEventListener('change', apply); else if (mql.addListener) mql.addListener(apply);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
}

function html(inst) {
  const t = inst && trades.get(inst.trade);
  if (!t || !inst.dataPath) return '';
  const js = '<script>(' + page.toString() + ')(' + JSON.stringify(MQ) + ');</script>';
  return '<style>@media ' + MQ + '{\n' + rules() + '\n}</style>' + js;
}

module.exports = { MQ, rules, page, html };
