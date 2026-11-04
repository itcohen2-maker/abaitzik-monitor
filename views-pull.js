/*
  4.11.2026, Itzik: "a hidden counter in what we send a customer: where it goes, to which phones,
  how many saw it, when, how, and how much".
  The pages on it-solution.co.il (/monitor/, /security/) report to /api/track there (Upstash).
  This pulls the events every 10 minutes (monitor-views.timer), writes the report
  data/files-private/views-report.html (sealed like every private file), pushes only when something
  changed, and sends one push per new person (cap 15 a day).
  Links sent from the monitor carry ?r=<name>, so a second phone on the same name = forwarded.
  `--dry` prints without writing.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const DRY = process.argv.includes('--dry');
const KEY = fs.readFileSync(path.join(HERE, 'data', 'track-key.txt'), 'utf8').trim();
const DIR = path.join(HERE, 'data', 'views');
const STATE = path.join(DIR, 'state.json');
const EVENTS = path.join(DIR, 'events.json');
const OUT = path.join(HERE, 'data', 'files-private', 'views-report.html');
const PAGES = { monitor: 'דף המוניטור לעסק', security: 'דף אבטחת המידע' };
const DAY_CAP = 15;

function get(url) {
  return new Promise(function (ok, bad) {
    https.get(url, { timeout: 20000 }, function (r) {
      let b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () {
        if (r.statusCode !== 200) return bad(new Error('track ' + r.statusCode));
        try { ok(JSON.parse(b)); } catch (e) { bad(e); }
      });
    }).on('error', bad).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
const rd = function (f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
const il = function (t, o) { return new Date(t).toLocaleString('he-IL', Object.assign({ timeZone: 'Asia/Jerusalem' }, o || { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })); };
const dur = function (s) { s = Math.round(s || 0); return s < 60 ? s + ' שנ׳' : Math.floor(s / 60) + ' דק׳ ' + (s % 60 ? (s % 60) + ' שנ׳' : ''); };

function source(e) {
  if (e.app) return e.app;
  const r = e.ref || '';
  if (!r) return 'קישור ישיר (וואטסאפ, הודעה או מייל)';
  if (/whatsapp/i.test(r)) return 'WhatsApp';
  if (/facebook|fb\.com/i.test(r)) return 'Facebook';
  if (/instagram/i.test(r)) return 'Instagram';
  if (/mail|gmail|outlook/i.test(r)) return 'מייל';
  if (/google/i.test(r)) return 'Google';
  if (/it-solution\.co\.il/i.test(r)) return 'מתוך האתר';
  try { return new URL(r).hostname; } catch (x) { return r.slice(0, 40); }
}
function dev(e) { return [e.model || e.os, e.app ? 'בתוך ' + e.app : e.br].filter(Boolean).join(', '); }

// One row per visit (session): the open event plus the longest time and deepest scroll it reported.
function visits(evs) {
  const by = {};
  evs.forEach(function (e) {
    if (e.bot || !e.p || /^zz-/.test(e.p)) return;
    const k = e.sid || (e.v + e.t);
    const s = by[k] || (by[k] = { sid: k, p: e.p, v: e.v, r: e.r, t: e.t, sec: 0, depth: 0, cta: [], n: e.n, open: null });
    if (e.e === 'open') { s.open = e; s.t = e.t; }
    s.t = Math.min(s.t, e.t);
    s.sec = Math.max(s.sec, e.sec || 0); s.depth = Math.max(s.depth, e.depth || 0);
    if (e.e === 'cta' && e.ref && s.cta.indexOf(e.ref) < 0) s.cta.push(e.ref);
    if (!s.open) s.open = e;
  });
  return Object.values(by).sort(function (a, b) { return b.t - a.t; });
}

function report(vs) {
  const now = Date.now();
  let h = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>מי ראה את הדפים</title>'
    + '<style>body{font-family:Heebo,system-ui,sans-serif;margin:0;padding:16px;background:#f6f8fa;color:#0f172a;font-size:16px;line-height:1.6}'
    + 'h1{font-size:24px;margin:0 0 4px}h2{font-size:20px;margin:24px 0 8px;color:#123a5a}.m{color:#475569;font-size:14px}'
    + '.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:10px 0}.k div{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px;text-align:center}'
    + '.k b{display:block;font-size:26px;color:#0e7490}.v{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin:8px 0}'
    + '.v b{color:#123a5a}.fw{color:#b45309;font-weight:700}.tag{display:inline-block;background:#ecfeff;color:#0e7490;border-radius:99px;padding:0 8px;font-size:13px;margin-inline-start:4px}'
    + '@media (prefers-color-scheme:dark){body{background:#0a0a0f;color:#e5e7eb}.k div,.v{background:#13131c;border-color:#262633}h2,.v b{color:#7dd3fc}}</style></head><body>'
    + '<h1>👀 מי ראה את הדפים</h1><div class="m">מתעדכן כל 10 דקות · עדכון אחרון ' + il(now) + '</div>';
  Object.keys(PAGES).forEach(function (p) {
    const list = vs.filter(function (s) { return s.p === p; });
    const people = new Set(list.map(function (s) { return s.v; }));
    const read = list.filter(function (s) { return s.depth >= 75; }).length;
    const cta = list.filter(function (s) { return s.cta.length; }).length;
    const avg = list.length ? list.reduce(function (a, s) { return a + s.sec; }, 0) / list.length : 0;
    h += '<h2>' + PAGES[p] + '</h2><div class="k"><div><b>' + list.length + '</b>כניסות</div><div><b>' + people.size + '</b>מכשירים שונים</div>'
      + '<div><b>' + dur(avg) + '</b>זמן ממוצע</div><div><b>' + read + '</b>קראו עד הסוף</div><div><b>' + cta + '</b>לחצו על כפתור</div></div>';
    // Per name it was sent to: how many phones opened it. More than one phone = it was forwarded.
    const names = {};
    list.forEach(function (s) { const k = s.r || 'בלי שם (נשלח בלי סימון)'; (names[k] = names[k] || { ph: new Set(), n: 0, last: 0 }); names[k].ph.add(s.v); names[k].n++; names[k].last = Math.max(names[k].last, s.t); });
    const nk = Object.keys(names);
    if (nk.length) h += '<div class="m">לפי למי נשלח:</div>' + nk.map(function (k) { const x = names[k];
      return '<div class="v"><b>' + esc(k) + '</b> · ' + x.n + ' כניסות מ ' + x.ph.size + ' מכשירים' + (x.ph.size > 1 && names[k] && k.indexOf('בלי שם') < 0 ? ' <span class="fw">הועבר הלאה</span>' : '') + ' · לאחרונה ' + il(x.last) + '</div>'; }).join('');
    h += '<div class="m">כל הכניסות, מהחדשה לישנה:</div>' + (list.slice(0, 150).map(function (s) { const o = s.open || {};
      return '<div class="v"><b>' + il(s.t, { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</b>'
        + (s.r ? '<span class="tag">' + esc(s.r) + '</span>' : '') + (s.n > 1 ? '<span class="tag">כניסה ' + s.n + ' שלו</span>' : '<span class="tag">פעם ראשונה</span>')
        + '<br>📱 ' + esc(dev(o)) + ' · 📍 ' + esc(o.city || '?') + (o.country && o.country !== 'IL' ? ' (' + esc(o.country) + ')' : '')
        + '<br>🔗 הגיע דרך: ' + esc(source(o)) + '<br>⏱️ ' + dur(s.sec) + ' · גלל ' + s.depth + '% מהדף'
        + (s.cta.length ? '<br>👆 לחץ: ' + s.cta.map(function (c) { return /#chat/.test(c) ? 'בואו נדבר' : /security/.test(c) ? 'פרטי האבטחה' : esc(c); }).join(', ') : '') + '</div>';
    }).join('') || '<div class="v">עוד אף אחד לא נכנס.</div>');
  });
  return h + '</body></html>';
}

(async function () {
  const st = rd(STATE, { since: 0, seen: {}, day: '', sent: 0 });
  const got = await get('https://it-solution.co.il/api/track?k=' + encodeURIComponent(KEY) + '&since=' + (st.since || 0));
  const old = rd(EVENTS, []);
  const have = new Set(old.map(function (e) { return e.t + e.v + e.e; }));
  const fresh = got.events.filter(function (e) { return !have.has(e.t + e.v + e.e); });
  const all = old.concat(fresh).sort(function (a, b) { return a.t - b.t; }).slice(-50000);
  const vs = visits(all);
  console.log(new Date().toISOString(), 'events', all.length, 'new', fresh.length, 'visits', vs.length);
  if (DRY) { console.log(vs.slice(0, 5)); return; }
  fs.mkdirSync(DIR, { recursive: true });
  if (!fresh.length && fs.existsSync(OUT)) return;
  fs.writeFileSync(EVENTS, JSON.stringify(all));
  fs.writeFileSync(OUT, report(vs));
  // One push per new device on a page. The open event is what counts; bots and tests never.
  const today = new Date().toISOString().slice(0, 10);
  if (st.day !== today) { st.day = today; st.sent = 0; }
  fresh.filter(function (e) { return e.e === 'open' && !e.bot && PAGES[e.p]; }).forEach(function (e) {
    const k = e.p + ':' + e.v;
    if (st.seen[k]) return; st.seen[k] = e.t;
    if (st.sent >= DAY_CAP) return; st.sent++;
    const who = e.r ? e.r : 'מישהו';
    try { execFileSync('node', [path.join(HERE, 'notify.js'), '👀 ' + who + ' פתח את ' + PAGES[e.p], [dev(e), e.city, source(e)].filter(Boolean).join(' · ') + '\nהפרטים: 💼 העסק שלי ← 💻 IT Solution ← 👀 מי ראה את הדפים'], { stdio: 'ignore', timeout: 30000 }); } catch (x) { console.error('notify', x.message); }
  });
  st.since = all.length ? all[all.length - 1].t : st.since;
  fs.writeFileSync(STATE, JSON.stringify(st));
  try { execFileSync('node', [path.join(HERE, 'push.js'), 'views: page report'], { stdio: 'ignore', timeout: 180000 }); } catch (x) { console.error('push', x.message); }
})().catch(function (e) { console.error(new Date().toISOString(), 'views-pull', e.message); process.exit(1); });
