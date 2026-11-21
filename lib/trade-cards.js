'use strict';
/*
  21.11.2026, Itzik: a service provider's monitor opens on his day, in the words of his trade (lib/trades.js).
  "שעון היום", approved the same day: the day from 06:00 to 20:00 as a ring in the four colours of the microphone,
  each job an arc, a white mark for now, and "הבא" in the middle. The ring is also the microphone: a tap talks.
  A side switch turns it into "מה עשיתי בשבילך". No money waiting on the first screen ("נורא מעצבן"):
  collection is one quiet line that opens the clients screen when he wants it.
    jobs       biz-home/events.json, today (Israel)
    reminders  reminders/reminders/*.json, due today
    collection money/money.json debtors
  Only for a monitor whose instance.json has a known "trade"; any other monitor gets ''. The sample WhatsApp
  conversation and "מה עשיתי" (invented, lib/trades.js) are drawn on the public demo only.
*/
const fs = require('fs');
const path = require('path');
const trades = require('./trades.js');

const DAY0 = 360, SPAN = 840; // 06:00, 14 hours
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayIL = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
function minIL(t) { const [h, m] = new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).split(':').map(Number); return h * 60 + m; }
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }

// Today's jobs and reminders: [{m, len, c, t, s}], m = minutes since midnight in Israel.
function dayItems(dataPath, now) {
  now = now || Date.now();
  const today = dayIL(now), out = [];
  const ev = (readJson(path.join(dataPath, 'biz-home', 'events.json'), []) || []).filter((e) => e && e.start && dayIL(e.start) === today)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  ev.forEach((e, i) => {
    const m = minIL(e.start), len = Math.max(15, Math.round((Date.parse(e.end || e.start) - Date.parse(e.start)) / 60000) || 15);
    const [what, who] = String(e.title || '').split(/:\s*/);
    out.push({ m, len, c: i % 2 ? 'b' : 'g', t: hhmm(m) + ' ' + what, s: [who, e.where].filter(Boolean).join(', ') });
  });
  let rem = [];
  try { rem = fs.readdirSync(path.join(dataPath, 'reminders', 'reminders')).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dataPath, 'reminders', 'reminders', f), null)); } catch (e) { rem = []; }
  rem.filter((r) => r && r.due && dayIL(r.due) === today).forEach((r) => {
    const m = minIL(r.due), [head, ...rest] = String(r.text || '').split(/:\s*/);
    out.push({ m, len: 15, c: 'y', t: hhmm(m) + ' ' + head, s: rest.join(': ') });
  });
  return out.sort((a, b) => a.m - b.m);
}

// The ring: a conic gradient of the day, track between the arcs. Runs in node and, as text, on the page.
function arcs(items) {
  var D0 = 360, SP = 840, f = function (x) { return (Math.round(x * 10) / 10) + 'deg'; }, at = 0, parts = [];
  (items || []).slice().sort(function (a, b) { return a.m - b.m; }).forEach(function (x) {
    var s = Math.max(0, (x.m - D0) / SP * 360), e = Math.min(360, (x.m + x.len - D0) / SP * 360);
    if (e <= s || e <= at) return;
    s = Math.max(s, at);
    if (s > at) parts.push('var(--trk) ' + f(at) + ' ' + f(s));
    parts.push('var(--t' + x.c + ') ' + f(s) + ' ' + f(e));
    at = e;
  });
  if (at < 360) parts.push('var(--trk) ' + f(at) + ' 360deg');
  return 'conic-gradient(' + parts.join(',') + ')';
}
function next(items, nowMin) { for (var i = 0; i < (items || []).length; i++) if (items[i].m > nowMin) return items[i]; return null; }

function rowsHtml(list, empty) {
  if (!list.length) return '<div class="trRow"><span class="t">' + esc(empty) + '</span></div>';
  return list.map((r) => '<div class="trRow"><span class="trDot" style="background:var(--t' + r[0] + ')"></span><span class="t">' + esc(r[1])
    + (r[2] ? '<small>' + esc(r[2]) + '</small>' : '') + '</span>' + (r[3] ? '<span class="v">' + esc(r[3]) + '</span>' : '') + '</div>').join('');
}

// The page side of the trade home, put on the page with toString (like lib/demo-acts.js client). Plain ES5, no
// closing script tag inside. D = { items, day0, span, wa }.
function page(D, arcs, next) {
  var w = document.getElementById('tradeCards'); if (!w) return;
  var ring = document.getElementById('tradeRing'), sw = document.getElementById('tradeSw'), nowEl = document.getElementById('tradeNow');
  var hintT = document.getElementById('trHintT'), hint = document.getElementById('trHint');
  var stage = ring.parentNode, C = ['var(--tb)', 'var(--tr)', 'var(--ty)', 'var(--tg)'];
  var mode = 'day', listening = false, DEMO = !!window.PUBLIC_DEMO, memWay = '';
  // The way he chose when the phone refused the microphone. Kept until the monitor is closed (sessionStorage):
  // closing and opening is what frees the microphone on an iPhone, so the next visit tries it again.
  function way() { try { return sessionStorage.getItem('trMicWay') || ''; } catch (e) { return memWay; } }
  function setWay(v) { memWay = v; try { if (v) sessionStorage.setItem('trMicWay', v); else sessionStorage.removeItem('trMicWay'); } catch (e) {} paint(); }
  function nowMin() { var p = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).split(':'); return +p[0] * 60 + +p[1]; }
  function paint() {
    var n = nowMin(), x = next(D.items, n);
    document.getElementById('trNextT').textContent = x ? (String(Math.floor(x.m / 60)).padStart(2, '0') + ':' + String(x.m % 60).padStart(2, '0')) : 'היום';
    document.getElementById('trNextS').textContent = x ? x.t : (D.items.length ? 'סיימת את היום' : 'אין עבודות ביומן');
    var deg = (n - D.day0) / D.span * 360;
    nowEl.hidden = mode !== 'day' || listening || deg < 0 || deg > 360;
    nowEl.style.transform = 'rotate(' + (180 + deg) + 'deg) translate(-2px,' + Math.round(ring.offsetWidth / 2 - 21) + 'px)';
    var v = listening ? 'listen' : mode;
    w.querySelectorAll('#tradeRing .c').forEach(function (e) { e.hidden = e.getAttribute('data-v') !== v; });
    w.querySelectorAll('.trList').forEach(function (e) { e.hidden = e.getAttribute('data-v') !== mode; });
    ring.classList.toggle('listen', listening);
    ring.style.background = listening ? '' : (mode === 'day' ? arcs(D.items) : 'conic-gradient(var(--tb) 0 42%,transparent 42% 43%,var(--tg) 43% 71%,transparent 71% 72%,var(--ty) 72% 99%,transparent 99%)');
    if (sw) { sw.setAttribute('aria-pressed', mode === 'did' ? 'true' : 'false'); sw.querySelector('span').textContent = mode === 'did' ? 'היום' : 'מה עשיתי'; }
    var wy = way();
    hintT.textContent = wy === 'wa' ? 'מקליטים בוואטסאפ' : wy === 'kb' ? 'מכתיבים במקלדת' : 'לחיצה ומדברים';
    hint.classList.toggle('wa', wy === 'wa');
  }
  function ping() { var p = document.createElement('i'); p.className = 'trPing'; p.style.setProperty('--d', ring.offsetWidth + 'px'); stage.appendChild(p); setTimeout(function () { p.remove(); }, 950); }
  function sparks() {
    for (var i = 0; i < 8; i++) {
      var s = document.createElement('i'), a = i / 8 * 6.283, r = ring.offsetWidth / 2 + 18;
      s.className = 'trSpark'; s.style.background = C[i % 4];
      s.style.setProperty('--x', Math.round(Math.cos(a) * r) + 'px'); s.style.setProperty('--y', Math.round(Math.sin(a) * r) + 'px');
      stage.appendChild(s); (function (s) { setTimeout(function () { s.remove(); }, 800); })(s);
    }
  }
  function dropIn() { var l = w.querySelector('.trList:not([hidden])'); if (!l) return; l.querySelectorAll('.trRow').forEach(function (r, i) { r.classList.remove('trIn'); void r.offsetWidth; r.style.animationDelay = (i * 45) + 'ms'; r.classList.add('trIn'); }); }
  function say(t) { if (window.demoToast) window.demoToast(t); }

  // ---- the other ways to talk, and the way back to the microphone ----
  function waUrl() {
    if (D.wa) return D.wa;
    try { var R = (window.D && window.D.conn && window.D.conn.rows) || []; for (var i = 0; i < R.length; i++) if (R[i].id === 'wa' && R[i].link) return R[i].link; } catch (e) {}
    return '';
  }
  function goWa() {
    if (DEMO) { say('נפתח וואטסאפ, בשיחה עם המוניטור. מחזיקים את המיקרופון ומדברים.'); return; }
    var u = waUrl(); if (u) window.open(u, '_blank', 'noopener');
  }
  function goKb() { var q = document.getElementById('quickText'); if (!q) return; q.scrollIntoView({ block: 'center' }); q.focus(); }
  function appMode() { return !!((window.navigator && window.navigator.standalone) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); }
  function closeSheets() { ['trFb', 'trGuide'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); }); }
  function sheet(id, label, inner) {
    closeSheets();
    var s = document.createElement('div'); s.id = id; s.className = 'trSheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', label);
    s.innerHTML = '<div class="trCard"><button type="button" class="trX" aria-label="סגירה">✕</button>' + inner + '</div>';
    s.addEventListener('click', function (e) { if (e.target === s || e.target.closest('.trX')) s.remove(); });
    document.body.appendChild(s);
    return s;
  }
  function fallback() {
    var hasWa = DEMO || !!waUrl();
    var s = sheet('trFb', 'אפשר לדבר גם אחרת', '<b class="trH">האייפון לא נתן להקליט כאן</b><p>זו לא תקלה שלך. אפשר לדבר עכשיו באחת משתי הדרכים:</p>'
      + (hasWa ? '<button type="button" class="trBig trWa" data-go="wa"><span>להקליט בוואטסאפ<small>נפתחת השיחה עם המוניטור, מחזיקים את המיקרופון</small></span></button>' : '')
      + '<button type="button" class="trBig trKb" data-go="kb"><span>להכתיב במקלדת<small>לוחצים על המיקרופון שבמקלדת</small></span></button>'
      + '<button type="button" class="trLink" data-go="fix">לתקן את המיקרופון</button>');
    s.addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]'); if (!b) return; var g = b.getAttribute('data-go');
      if (g === 'fix') { guide(); return; }
      setWay(g); s.remove(); if (g === 'wa') goWa(); else goKb();
    });
  }
  function guide() {
    var app = appMode();
    var saf = '<ol><li>לוחצים על הסמל <b>aA</b> ליד הכתובת של הדף.</li><li>בוחרים <b>הגדרות אתר</b>.</li><li>ליד <b>מיקרופון</b> בוחרים <b>התר</b>.</li></ol>'
      + '<p class="trNote">מתקנים פעם אחת, וזה נשאר. דרך נוספת: הגדרות, אפליקציות, Safari, מיקרופון, התר.</p>';
    var ap = '<ol><li>מחליקים מלמטה למעלה ועוצרים באמצע, כדי לראות את האפליקציות הפתוחות.</li><li>מחליקים את <b>המוניטור</b> למעלה, כדי לסגור אותו.</li>'
      + '<li>פותחים אותו שוב, לוחצים על הטבעת, ובחלון של האייפון לוחצים <b>התר</b>.</li></ol>'
      + '<p class="trNote">באפליקציה ממסך הבית האייפון שואל שוב אחרי כל מעבר בין אפליקציות. זו מגבלה של אפל. כדי שזה ייגמר: לפתוח את המוניטור ב Safari ולתקן שם פעם אחת, או להמשיך להקליט בוואטסאפ.</p>';
    var s = sheet('trGuide', 'לתקן את המיקרופון', '<b class="trH">לתקן את המיקרופון</b>'
      + '<div class="trTabs"><button type="button" data-g="saf">ב Safari</button><button type="button" data-g="app">אפליקציה ממסך הבית</button></div>'
      + '<div data-gv="saf">' + saf + '</div><div data-gv="app">' + ap + '</div>'
      + '<button type="button" class="trBig trTest" data-test="1"><span>לבדוק עכשיו<small>שנייה אחת של הקלטה</small></span></button><div class="trRes" role="status"></div>');
    function tab(g) { s.querySelectorAll('[data-g]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-g') === g ? 'true' : 'false'); }); s.querySelectorAll('[data-gv]').forEach(function (v) { v.hidden = v.getAttribute('data-gv') !== g; }); }
    tab(app ? 'app' : 'saf');
    var res = s.querySelector('.trRes');
    function good() { res.className = 'trRes ok'; res.textContent = 'המיקרופון עובד ✓'; setWay(''); setTimeout(function () { s.remove(); }, 1200); }
    function bad() { res.className = 'trRes bad'; res.textContent = 'עוד חסום. עוברים על השלבים למעלה, ואז בודקים שוב.'; }
    s.addEventListener('click', function (e) {
      var g = e.target.closest('[data-g]'); if (g) { tab(g.getAttribute('data-g')); return; }
      if (!e.target.closest('[data-test]')) return;
      res.className = 'trRes'; res.textContent = 'מקשיב שנייה...';
      if (DEMO) { setTimeout(good, 900); return; }
      try {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) { setTimeout(function () { st.getTracks().forEach(function (t) { t.stop(); }); good(); }, 900); }, bad);
      } catch (err) { bad(); }
    });
  }

  ring.addEventListener('click', function () {
    var mic = document.getElementById('micBtn');
    ping();
    if (listening) { sparks(); if (DEMO) { listening = false; paint(); } if (mic) mic.click(); return; }
    var wy = way();
    if (wy === 'wa') { goWa(); return; }
    if (wy === 'kb') { goKb(); return; }
    if (DEMO) { listening = true; paint(); }
    if (mic) mic.click();
  });
  if (sw) sw.addEventListener('click', function () { mode = mode === 'day' ? 'did' : 'day'; paint(); dropIn(); });
  w.addEventListener('click', function (e) {
    if (e.target.closest('#trTry')) { fallback(); return; }
    var o = e.target.closest('[data-open]'); if (!o) return; var g = document.getElementById(o.getAttribute('data-open')); if (g) g.click();
  });
  w.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('[data-open]')) e.target.click(); });
  // The ring shows what the real microphone does: the monitor marks #micBtn "on" while it records.
  var micEl = document.getElementById('micBtn');
  if (micEl && !DEMO && window.MutationObserver) new MutationObserver(function () { var on = micEl.classList.contains('on'); if (on !== listening) { listening = on; paint(); } }).observe(micEl, { attributes: true, attributeFilter: ['class'] });
  // The monitor's own "stuck microphone" sheet is replaced here by the two other ways and the guide. Its script
  // comes later on the page, so the name is taken once the page is parsed.
  function take() { window.micSheet = function () { listening = false; paint(); fallback(); }; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', take); else take();
  paint(); setInterval(paint, 60000);
}

function html(inst, now) {
  const t = inst && trades.get(inst.trade);
  if (!t || !inst.dataPath) return '';
  now = now || Date.now();
  const demo = inst.publicDemo === true;
  const items = dayItems(inst.dataPath, now);
  const debtors = (readJson(path.join(inst.dataPath, 'money', 'money.json'), {}) || {}).debtors || [];
  const did = demo ? (t.did || []) : [];
  // 21.11.2026: when the phone refuses the microphone, the ring offers WhatsApp (the monitor's line) or the keyboard
  const waConn = readJson(path.join(inst.dataPath, 'conn', 'wa.json'), null);
  const waTo = waConn && waConn.via === 'shared' ? 'https://wa.me/' + require('./wa-tenants.js').SHARED_PHONE : '';
  const dayRows = rowsHtml(items.map((x) => [x.c, x.t, x.s, '']), 'אין היום עבודות ביומן');
  const wa = demo && Array.isArray(t.wa) && t.wa.length
    ? '<div id="tradeWa" aria-label="ככה זה נראה בוואטסאפ"><b class="twH">ככה זה נראה בוואטסאפ</b>'
      + t.wa.map(([who, text]) => '<div class="twB ' + (who === 'me' ? 'twMe' : 'twMon') + '">' + esc(text) + '</div>').join('') + '</div>'
    : '';
  const css = '<style>'
    + '#tradeCards{--tb:#4285F4;--tr:#EA4335;--ty:#FBBC05;--tg:#34A853;--trk:rgba(127,127,127,.22);--trl:rgba(127,127,127,.25);display:flex;flex-direction:column;gap:12px;margin:6px 0 calc(150px + env(safe-area-inset-bottom));font-family:Heebo,system-ui,sans-serif}'
    + '#tradeCards .trStage{position:relative;display:grid;place-items:center;padding:6px 0 2px}'
    + '#tradeRing{all:unset;box-sizing:border-box;cursor:pointer;width:min(214px,62vw);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;position:relative;-webkit-tap-highlight-color:transparent}'
    + '#tradeRing::before{content:"";position:absolute;inset:14px;border-radius:50%;background:var(--ground,#101217)}'
    + '#tradeRing:focus-visible{outline:3px solid var(--tb);outline-offset:4px}'
    + '#tradeRing .c{position:relative;text-align:center;max-width:62%}'
    + '#tradeRing .c small{display:block;font-size:13px;opacity:.7}#tradeRing .c b{display:block;font-size:30px;font-weight:900;letter-spacing:-.02em;line-height:1.1;margin:2px 0;font-variant-numeric:tabular-nums}'
    + '#tradeRing .c span{font-size:14px;opacity:.88}'
    // 21.11.2026, Itzik: "מתאר נוצץ, הצבעים זזים ומגיבים כשיש פעולה ... פעימה עם מתאר זה מעולה". The monitor's own
    // motion (lib/motion.js): a shimmering outline that always turns, a pulse on every tap, the colours run and the
    // ring breathes while it listens, sparks when it sends, rows that drop in. All of it stops for less motion.
    + '#tradeRing{transition:transform .18s cubic-bezier(.2,.8,.2,1)}#tradeRing:active{transform:scale(.96)}'
    + '#tradeRing::after{content:"";position:absolute;inset:-7px;border-radius:50%;padding:2px;pointer-events:none;opacity:.8;'
    + 'background:conic-gradient(from var(--th,0deg),transparent 0 55%,var(--tb) 70%,var(--tr) 80%,var(--ty) 90%,var(--tg) 100%);'
    + '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:trHalo 4s linear infinite}'
    + '@property --th{syntax:"<angle>";inherits:false;initial-value:0deg}@keyframes trHalo{to{--th:360deg}}'
    + '#tradeRing.listen{background:conic-gradient(from var(--ta,0deg),var(--tb),var(--tr),var(--ty),var(--tg),var(--tb))!important;animation:trRun 1.6s linear infinite,trBreath 1.8s ease-in-out infinite}'
    + '#tradeRing.listen::after{inset:-10px;opacity:1;animation-duration:1.1s}'
    + '@property --ta{syntax:"<angle>";inherits:false;initial-value:0deg}@keyframes trRun{to{--ta:360deg}}'
    + '@keyframes trBreath{0%,100%{scale:1;box-shadow:0 0 0 0 rgba(66,133,244,0)}50%{scale:1.04;box-shadow:0 0 26px 6px rgba(66,133,244,.45)}}'
    + '.trPing{position:absolute;left:50%;top:50%;width:var(--d);height:var(--d);margin:calc(var(--d) / -2) 0 0 calc(var(--d) / -2);border-radius:50%;border:3px solid var(--tb);pointer-events:none;animation:trPing .9s cubic-bezier(.2,.8,.2,1) forwards}'
    + '@keyframes trPing{from{transform:scale(1);opacity:.85}to{transform:scale(1.35);opacity:0}}'
    + '.trSpark{position:absolute;left:50%;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;pointer-events:none;animation:trSpark .75s ease-out forwards}'
    + '@keyframes trSpark{to{transform:translate(var(--x),var(--y)) scale(.4);opacity:0}}'
    + '#tradeSw i{position:relative}#tradeSw i::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid var(--tg);opacity:0;animation:trSwP 2.6s ease-out 1.2s 3}'
    + '@keyframes trSwP{0%{transform:scale(.9);opacity:.85}70%,100%{transform:scale(1.4);opacity:0}}'
    + '.trIn{animation:trDrop .4s cubic-bezier(.2,.8,.2,1) both}@keyframes trDrop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'
    + '@media (prefers-reduced-motion:reduce){#tradeRing::after,#tradeRing.listen,#tradeSw i::after,.trIn,.trPing,.trSpark{animation:none!important}.trPing,.trSpark{display:none}}'
    + '#tradeNow{position:absolute;width:4px;height:22px;border-radius:2px;background:currentColor;top:50%;left:50%;transform-origin:2px 0;pointer-events:none}'
    + '#tradeSw{all:unset;cursor:pointer;position:absolute;inset-inline-end:4px;top:0;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:12px;font-weight:700;width:60px;text-align:center;opacity:.85}'
    + '#tradeSw i{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;border:1.5px solid var(--trl);font-style:normal;font-weight:900;font-size:15px}'
    + '#tradeSw[aria-pressed="true"] i{border-color:var(--tg);color:var(--tg)}#tradeSw:focus-visible i{outline:3px solid var(--tb);outline-offset:2px}'
    + '#tradeCards .trList{padding:0 6px}#tradeCards .trRow{display:flex;gap:12px;align-items:baseline;padding:11px 0;border-bottom:1px solid var(--trl)}'
    + '#tradeCards .trDot{width:10px;height:10px;border-radius:50%;flex:none;transform:translateY(-1px)}'
    + '#tradeCards .trRow .t{flex:1;font-size:16px;font-weight:500}#tradeCards .trRow .t small{display:block;font-size:13.5px;opacity:.72;font-weight:400;margin-top:2px}'
    + '#tradeCards .trRow .v{font-size:14.5px;font-weight:700;opacity:.85}'
    + '#tradeCards .trQuiet{padding:0 6px;font-size:14.5px;opacity:.85;line-height:1.5}#tradeCards .trQuiet u{text-decoration:none;border-bottom:1px solid currentColor;cursor:pointer}'
    + (wa ? '#tradeWa{display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:14px;background:#efeae2}'
      + '#tradeWa .twH{color:#075e54;font-weight:800;margin-bottom:2px}'
      + '#tradeWa .twB{max-width:85%;padding:8px 12px;border-radius:12px;line-height:1.45;color:#111b21;box-shadow:0 1px 1px rgba(0,0,0,.12)}'
      + '#tradeWa .twMe{align-self:flex-start;background:#d9fdd3}#tradeWa .twMon{align-self:flex-end;background:#fff}' : '')
    // one microphone on a trade home: the ring. The monitor's own button stays in the page (the ring presses it), unseen.
    + '#micBtn{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;overflow:hidden!important}'
    + '#tradeRing .c .trHint{display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:5px 11px;border-radius:999px;background:rgba(127,127,127,.18);font-size:13px;font-weight:700;opacity:1}'
    + '#tradeRing .c .trHint svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}#tradeRing .c .trHint.wa{background:rgba(37,211,102,.22)}'
    + '#tradeRing .c .trHint span{font-size:13px;opacity:1}'
    + '.trLinkS{all:unset;cursor:pointer;align-self:center;font:500 13.5px Heebo,system-ui,sans-serif;opacity:.75;text-decoration:underline;text-underline-offset:4px;padding:6px 10px}'
    + '.trSheet{position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;font-family:Heebo,system-ui,sans-serif;direction:rtl}'
    + '.trCard{position:relative;width:100%;max-width:520px;max-height:88vh;overflow:auto;background:#1a1d24;color:#eef0f4;border-radius:22px 22px 0 0;padding:18px 18px calc(22px + env(safe-area-inset-bottom));animation:trUp .35s cubic-bezier(.16,1,.3,1)}'
    + '@keyframes trUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}'
    + '.trCard .trH{display:block;font-size:19px;font-weight:900;margin:0 0 4px;padding-inline-end:44px}.trCard p{margin:0 0 14px;color:#c3c9d4;font-size:15px;line-height:1.5}'
    + '.trX{all:unset;cursor:pointer;position:absolute;top:12px;inset-inline-end:12px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#2a2f3a;font-size:17px}'
    + '.trBig{all:unset;box-sizing:border-box;cursor:pointer;display:block;width:100%;min-height:58px;padding:12px 16px;border-radius:14px;font-size:17px;font-weight:800;margin-bottom:10px}'
    + '.trBig small{display:block;font-size:13px;font-weight:500;opacity:.85}.trBig.trWa{background:#25D366;color:#06260f}.trBig.trKb{background:#2a2f3a;color:#eef0f4}.trBig.trTest{background:#fff;color:#111}'
    + '.trBig:focus-visible,.trLink:focus-visible,.trX:focus-visible{outline:3px solid #4285F4;outline-offset:2px}'
    + '.trLink{all:unset;cursor:pointer;display:block;text-align:center;margin-top:6px;padding:8px;font-size:15px;font-weight:700;color:#9cc0ff;text-decoration:underline;text-underline-offset:4px}'
    + '.trTabs{display:flex;gap:6px;margin:6px 0 12px}.trTabs button{all:unset;cursor:pointer;flex:1;text-align:center;padding:8px 6px;border-radius:10px;border:1.5px solid #3a3f4a;font-size:14px;font-weight:700;color:#c3c9d4}'
    + '.trTabs button[aria-pressed="true"]{border-color:#4285F4;color:#fff;background:#1f2b45}'
    + '.trCard ol{margin:0 0 10px;padding-inline-start:22px;font-size:15.5px;line-height:1.55}.trCard li{margin-bottom:8px}.trCard .trNote{font-size:13.5px;color:#aeb5c1}'
    + '.trRes{margin-top:6px;font-size:15.5px;font-weight:800;text-align:center;min-height:24px}.trRes.ok{color:#7ee2a0}.trRes.bad{color:#ffb4ab}'
    + '@media (prefers-reduced-motion:reduce){.trCard{animation:none}}'
    + '[hidden]{display:none!important}</style>';
  const ring = '<div class="trStage"><button type="button" id="tradeRing" aria-label="לחיצה ומדברים" style="background:' + arcs(items) + '">'
    + '<span class="c" data-v="day"><small>הבא</small><b id="trNextT"></b><span id="trNextS"></span><span class="trHint" id="trHint"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg><span id="trHintT">לחיצה ומדברים</span></span></span>'
    + (did.length ? '<span class="c" data-v="did" hidden><small>היום טיפלתי ב</small><b>' + did.length + '</b><span>דברים בשבילך</span></span>' : '')
    + '<span class="c" data-v="listen" hidden><small>מקשיב</small><b>דבר</b><span>ולחיצה נוספת לשליחה</span></span>'
    + '</button><i id="tradeNow" hidden></i>'
    + (did.length ? '<button type="button" id="tradeSw" aria-pressed="false"><i>' + did.length + '</i><span>מה עשיתי</span></button>' : '')
    + '</div>';
  const lists = '<div class="trList" data-v="day">' + dayRows + '</div>'
    + (did.length ? '<div class="trList" data-v="did" hidden>' + rowsHtml(did, '') + '</div>' : '');
  const quiet = debtors.length ? '<p class="trQuiet">גבייה: <u role="button" tabindex="0" data-open="' + esc(t.debtOpen) + '">' + debtors.length + ' תזכורות מוכנות</u>, כשתרצה.</p>' : '';
  const data = JSON.stringify({ items: items.map((x) => ({ m: x.m, len: x.len, c: x.c, t: x.t.slice(6), s: x.s })), day0: DAY0, span: SPAN, wa: waTo }).replace(/</g, '\\u003c');
  const js = '<script>(' + page.toString() + ')(' + data + ',' + arcs.toString() + ',' + next.toString() + ');</script>';
  const tryIt = demo ? '<button type="button" id="trTry" class="trLinkS">מה קורה כשהאייפון חוסם את המיקרופון?</button>' : '';
  return css + '<section id="tradeCards" aria-label="' + esc(t.label) + '">' + ring + tryIt + lists + quiet + wa + '</section>' + js;
}

module.exports = { dayItems, arcs, next, page, html };
