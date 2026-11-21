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

function html(inst, now) {
  const t = inst && trades.get(inst.trade);
  if (!t || !inst.dataPath) return '';
  now = now || Date.now();
  const demo = inst.publicDemo === true;
  const items = dayItems(inst.dataPath, now);
  const debtors = (readJson(path.join(inst.dataPath, 'money', 'money.json'), {}) || {}).debtors || [];
  const did = demo ? (t.did || []) : [];
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
    + '[hidden]{display:none!important}</style>';
  const ring = '<div class="trStage"><button type="button" id="tradeRing" aria-label="לחיצה ומדברים" style="background:' + arcs(items) + '">'
    + '<span class="c" data-v="day"><small>הבא</small><b id="trNextT"></b><span id="trNextS"></span></span>'
    + (did.length ? '<span class="c" data-v="did" hidden><small>היום טיפלתי ב</small><b>' + did.length + '</b><span>דברים בשבילך</span></span>' : '')
    + '<span class="c" data-v="listen" hidden><small>מקשיב</small><b>דבר</b><span>ולחיצה נוספת לשליחה</span></span>'
    + '</button><i id="tradeNow" hidden></i>'
    + (did.length ? '<button type="button" id="tradeSw" aria-pressed="false"><i>' + did.length + '</i><span>מה עשיתי</span></button>' : '')
    + '</div>';
  const lists = '<div class="trList" data-v="day">' + dayRows + '</div>'
    + (did.length ? '<div class="trList" data-v="did" hidden>' + rowsHtml(did, '') + '</div>' : '');
  const quiet = debtors.length ? '<p class="trQuiet">גבייה: <u role="button" tabindex="0" data-open="' + esc(t.debtOpen) + '">' + debtors.length + ' תזכורות מוכנות</u>, כשתרצה.</p>' : '';
  const data = JSON.stringify({ items: items.map((x) => ({ m: x.m, len: x.len, c: x.c, t: x.t.slice(6), s: x.s })), day0: DAY0, span: SPAN }).replace(/</g, '\\u003c');
  const js = '<script>(function(){var w=document.getElementById("tradeCards");if(!w)return;var D=' + data + ';'
    + 'var arcs=' + arcs.toString() + ',next=' + next.toString() + ';'
    + 'var ring=document.getElementById("tradeRing"),sw=document.getElementById("tradeSw"),nowEl=document.getElementById("tradeNow"),mode="day",listening=false;'
    + 'function nowMin(){var p=new Date().toLocaleTimeString("en-GB",{timeZone:"Asia/Jerusalem",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).split(":");return +p[0]*60+ +p[1];}'
    + 'function paint(){var n=nowMin(),x=next(D.items,n);'
    + 'document.getElementById("trNextT").textContent=x?(String(Math.floor(x.m/60)).padStart(2,"0")+":"+String(x.m%60).padStart(2,"0")):"היום";'
    + 'document.getElementById("trNextS").textContent=x?x.t:(D.items.length?"סיימת את היום":"אין עבודות ביומן");'
    + 'var deg=(n-D.day0)/D.span*360;nowEl.hidden=mode!=="day"||listening||deg<0||deg>360;nowEl.style.transform="rotate("+(180+deg)+"deg) translate(-2px,"+Math.round(ring.offsetWidth/2-21)+"px)";'
    + 'var v=listening?"listen":mode;w.querySelectorAll("#tradeRing .c").forEach(function(e){e.hidden=e.getAttribute("data-v")!==v;});'
    + 'w.querySelectorAll(".trList").forEach(function(e){e.hidden=e.getAttribute("data-v")!==mode;});'
    + 'ring.classList.toggle("listen",listening);ring.style.background=listening?"":(mode==="day"?arcs(D.items):"conic-gradient(var(--tb) 0 42%,transparent 42% 43%,var(--tg) 43% 71%,transparent 71% 72%,var(--ty) 72% 99%,transparent 99%)");'
    + 'if(sw){sw.setAttribute("aria-pressed",mode==="did"?"true":"false");sw.querySelector("span").textContent=mode==="did"?"היום":"מה עשיתי";}}'
    + 'var stage=ring.parentNode,C=["var(--tb)","var(--tr)","var(--ty)","var(--tg)"];'
    + 'function ping(){var p=document.createElement("i");p.className="trPing";p.style.setProperty("--d",ring.offsetWidth+"px");stage.appendChild(p);setTimeout(function(){p.remove();},950);}'
    + 'function sparks(){for(var i=0;i<8;i++){var s=document.createElement("i"),a=i/8*6.283,r=ring.offsetWidth/2+18;s.className="trSpark";s.style.background=C[i%4];'
    + 's.style.setProperty("--x",Math.round(Math.cos(a)*r)+"px");s.style.setProperty("--y",Math.round(Math.sin(a)*r)+"px");stage.appendChild(s);(function(s){setTimeout(function(){s.remove();},800);})(s);}}'
    + 'function dropIn(){var l=w.querySelector(".trList:not([hidden])");if(!l)return;l.querySelectorAll(".trRow").forEach(function(r,i){r.classList.remove("trIn");void r.offsetWidth;r.style.animationDelay=(i*45)+"ms";r.classList.add("trIn");});}'
    + 'ring.addEventListener("click",function(){var was=listening;listening=!listening;paint();ping();if(was)sparks();var m=document.getElementById("micBtn");if(m)m.click();});'
    + 'if(sw)sw.addEventListener("click",function(){mode=mode==="day"?"did":"day";listening=false;paint();dropIn();});'
    + 'w.addEventListener("click",function(e){var o=e.target.closest("[data-open]");if(!o)return;var g=document.getElementById(o.getAttribute("data-open"));if(g)g.click();});'
    + 'w.addEventListener("keydown",function(e){if(e.key==="Enter"&&e.target.matches("[data-open]"))e.target.click();});'
    + 'paint();setInterval(paint,60000);})();</script>';
  return css + '<section id="tradeCards" aria-label="' + esc(t.label) + '">' + ring + lists + quiet + wa + '</section>' + js;
}

module.exports = { dayItems, arcs, next, html };
