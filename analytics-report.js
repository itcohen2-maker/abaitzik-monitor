/*
  5.11.2026, Itzik (iron rule): "שיהיה אנליטיק לכל דבר ... ובודק שיבדוק את כל האנליטים ביחד ויחזיר תמיד תשובות בדוחות".
  One reader for every measurement we have, one report in the monitor's reports, twice a day
  (monitor-analytics.timer, 08:10 and 20:10 Israel time).

  Sources:
    1. candletimes.com/api/visit (Upstash): visits per site (ner, ner-add, itzik-site, pegasus, salinda), per day, source, country.
    2. data/views/events.json (views-pull.js, it-solution.co.il /api/track): opens, time, scroll, cta per page.
    3. data/forms, data/setup, data/sign, data/docsign state files: opened, opens, submitted, signed.
    4. data/shachar/state.json: waitlist, invites, usage.
  A source that counted in the last week and shows 0 yesterday and today is reported as broken, at the top.
  `--dry` prints the report and writes nothing.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const HERE = __dirname;
const DRY = process.argv.includes('--dry');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const NL = '\n';
const ilDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(t));
const ilShort = (t) => new Date(t).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const NAMES = { ner: 'candletimes.com', 'ner-add': 'candletimes, הוספה למסך הבית', 'itzik-site': 'abaitzik.com', pegasus: 'פגסוס', salinda: 'סלינדה' };
const PAGES = { monitor: 'it-solution.co.il/monitor', security: 'it-solution.co.il/security', home: 'it-solution.co.il (דף הבית)', chat: 'it-solution.co.il, הצ׳אט (מהמודעות)', 'monitor-guide': 'it-solution.co.il, מדריך המוניטור', privacy: 'it-solution.co.il, פרטיות', terms: 'it-solution.co.il, תנאים' };

function getJson(url, headers) {
  return new Promise((ok, bad) => {
    https.get(url, { headers: headers || {}, timeout: 20000 }, (r) => {
      let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => {
        if (r.statusCode !== 200) return bad(new Error('HTTP ' + r.statusCode));
        try { ok(JSON.parse(b)); } catch (e) { bad(e); }
      });
    }).on('error', bad).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
function addDays(day, n) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function top(o, n) { return Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0] + ' ' + x[1]).join(', '); }

async function main() {
  const now = Date.now(), today = ilDay(now), yest = addDays(today, -1);
  const alarms = [], parts = [];

  // 1. Visits counter (candletimes api).
  let keys = rd(path.join(HERE, 'data', 'keys.json'), {});
  try {
    const v = await getJson('https://candletimes.com/api/visit', { 'x-ner-key': keys.nerVisit || '' });
    const lines = [];
    Object.keys(v.days || {}).forEach((site) => {
      const d = v.days[site] || {};
      let w = 0, pw = 0;
      for (let i = 1; i <= 7; i++) w += d[addDays(today, -i)] || 0;
      for (let i = 8; i <= 14; i++) pw += d[addDays(today, -i)] || 0;
      const t = d[today] || 0, y = d[yest] || 0;
      if (site !== 'salinda' && site !== 'ner-add' && Math.max(w, pw) >= 7 && t === 0 && y === 0) {
        const last = Object.keys(d).filter((k) => d[k] > 0).sort().pop();
        alarms.push(NAMES[site] + ' הפסיק לספור: אפס אתמול והיום' + (last ? ', הספירה האחרונה ב ' + last.slice(8, 10) + '.' + last.slice(5, 7) : '') + '. לבדוק שהמדידה עדיין בדף.');
      }
      const trend = pw ? Math.round((w - pw) / pw * 100) : null;
      lines.push('• ' + (NAMES[site] || site) + ': היום ' + t + ', אתמול ' + y + ', 7 ימים ' + w + (trend === null ? '' : ' (' + (trend >= 0 ? 'עלייה ' : 'ירידה ') + Math.abs(trend) + '% משבוע קודם)')
        + (v.from && v.from[site] ? NL + '   מקורות: ' + top(v.from[site], 5) : '')
        + (v.where && v.where[site] ? NL + '   ארצות: ' + top(v.where[site], 5) : ''));
    });
    parts.push('🌐 כניסות לאתרים' + NL + lines.join(NL));
  } catch (e) {
    alarms.push('מונה הכניסות של האתרים (candletimes.com/api/visit) לא ענה: ' + e.message + '.');
  }

  // 2. it-solution.co.il pages (track events pulled by views-pull.js every 10 minutes).
  const ev = rd(path.join(HERE, 'data', 'views', 'events.json'), []);
  const real = ev.filter((e) => !e.bot && e.p && !/^zz-/.test(e.p) && !/^בדיקה/.test(e.r || ''));
  const day1 = real.filter((e) => now - e.t < 864e5), day7 = real.filter((e) => now - e.t < 7 * 864e5);
  const by = {};
  day7.forEach((e) => {
    const b = by[e.p] = by[e.p] || { open1: 0, open7: 0, dev: new Set(), cta: 0, chat: 0, sec: {}, utm: {} };
    if (e.e === 'open') { b.open7++; if (now - e.t < 864e5) b.open1++; b.dev.add(e.v); }
    if (e.e === 'cta') b.cta++;
    if (e.e === 'chat_open') b.chat++;
    if (e.sid && e.sec) b.sec[e.sid] = Math.max(b.sec[e.sid] || 0, e.sec);
    if (e.utm_source || e.us) { const u = (e.utm_source || e.us) + (e.utm_campaign || e.uc ? '/' + (e.utm_campaign || e.uc) : ''); b.utm[u] = (b.utm[u] || 0) + (e.e === 'open' ? 1 : 0); }
  });
  const mins = (x) => x >= 120 ? Math.round(x / 60) + ' דק׳' : x + ' שנ׳';
  const pl = Object.keys(by).filter((p) => by[p].open7).map((p) => {
    const b = by[p], s = Object.values(b.sec), avg = s.length ? Math.round(s.reduce((a, x) => a + x, 0) / s.length) : 0;
    return '• ' + (PAGES[p] || p) + ': פתיחות היום ' + b.open1 + ', 7 ימים ' + b.open7 + ', מכשירים שונים ' + b.dev.size
      + (avg ? ', זמן ממוצע ' + mins(avg) : '') + (b.cta ? ', לחיצות על כפתור ' + b.cta : '') + (b.chat ? ', פתחו צ׳אט ' + b.chat : '')
      + (Object.keys(b.utm).length ? NL + '   קמפיינים: ' + top(b.utm, 5) : '');
  });
  parts.push('💻 IT Solution, הדפים' + NL + (pl.length ? pl.join(NL) : '• אין פתיחות ב 7 הימים האחרונים.'));
  if (!ev.length) alarms.push('קובץ האירועים של it-solution.co.il ריק. לבדוק את views-pull.js (monitor-views.timer).');

  // 3. Forms, setup pages, quote signing, document signing.
  const fl = [];
  const scan = (dir, kind, fn) => { let fs1 = []; try { fs1 = fs.readdirSync(path.join(HERE, 'data', dir)); } catch (e) {} fs1.filter((f) => /\.def\.json$/.test(f)).forEach((f) => { const tok = f.replace('.def.json', ''); fn(rd(path.join(HERE, 'data', dir, f), {}), rd(path.join(HERE, 'data', dir, tok + '.json'), {}), kind); }); };
  const st = (d, s, kind, doneKey, doneWord) => {
    fl.push('• ' + kind + ', ' + (d.client || d.title || '') + ': ' + (s.openedAt ? 'נפתח ' + ilShort(s.openedAt) + (s.opens > 1 ? ', ' + s.opens + ' פתיחות' : '') + (s.lastOpenAt && s.opens > 1 ? ', אחרונה ' + ilShort(s.lastOpenAt) : '') : 'עוד לא נפתח')
      + (s[doneKey] ? ', ' + doneWord + ' ' + ilShort(s[doneKey]) : (s.openedAt ? ', עוד לא ' + doneWord : '')));
  };
  scan('forms', 'טופס', (d, s, k) => st(d, s, k, 'submittedAt', 'נשלח'));
  scan('setup', 'דף חיבורים', (d, s, k) => st(d, s, k, 'finishedAt', 'הסתיים'));
  scan('sign', 'הצעת מחיר לחתימה', (d, s, k) => st(d, s, k, 'signedAt', 'נחתם'));
  let docs = []; try { docs = fs.readdirSync(path.join(HERE, 'data', 'docsign')); } catch (e) {}
  docs.forEach((dn) => {
    const def = rd(path.join(HERE, 'data', 'docsign', dn, 'def.json'), null), s = rd(path.join(HERE, 'data', 'docsign', dn, 'state.json'), {});
    if (!def || !def.signers) return;
    const o = s.opens || {};
    fl.push('• מסמך לחתימה, ' + (def.title || dn) + ': ' + def.signers.map((x) => x.name + (s[x.id] ? ' חתם' : (o[x.id] ? ' פתח ולא חתם' : ' לא פתח'))).join(', ') + (s.doneAt ? '. כולם חתמו.' : ''));
  });
  parts.push('📝 טפסים וחתימות' + NL + (fl.length ? fl.join(NL) : '• אין.'));

  // 4. Shachar.
  const sh = rd(path.join(HERE, 'data', 'shachar', 'state.json'), null);
  if (sh) {
    const wl = sh.waitlist || [], u = sh.usage || {};
    const new1 = wl.filter((x) => x.created_at && now - Date.parse(x.created_at) < 864e5).length;
    parts.push('🌅 שחר' + NL + '• בקשות כניסה: ' + wl.length + ' בסך הכל, ' + new1 + ' ב 24 השעות האחרונות' + NL
      + '• משתמשים: ' + (u.users || 0) + ', פעילים השבוע ' + (u.active7 || 0) + ', היום ' + (u.activeToday || 0) + ', הודעות ' + (u.messages || 0) + (u.minutes ? ', ' + Math.round(u.minutes) + ' דקות' : ''));
    if (sh.usage && sh.usage.at && now - Date.parse(sh.usage.at) > 6 * 3600e3) alarms.push('נתוני השימוש של שחר לא התעדכנו מאז ' + ilShort(sh.usage.at) + '.');
  }

  const body = (alarms.length ? '⚠️ דורש בדיקה' + NL + alarms.map((a) => '• ' + a).join(NL) + NL + NL : '✅ כל המקורות סופרים.' + NL + NL) + parts.join(NL + NL);
  const title = 'מדידה, כל הנכסים: ' + (alarms.length ? alarms.length + ' תקלות במדידה' : 'הכל סופר');
  const rep = { at: new Date(now).toISOString(), title, body };
  if (DRY) { console.log(title + NL + NL + body); return; }
  const stamp = new Date(now + 2 * 3600e3).toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const f = path.join(HERE, 'data', 'reports', 'reports', stamp.slice(0, 8) + '-' + stamp.slice(8, 12) + '-analytics.json');
  fs.writeFileSync(f, JSON.stringify(rep, null, 1));
  console.log('wrote', f);
}
main().catch((e) => { console.error(e); process.exit(1); });
