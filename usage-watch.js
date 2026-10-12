'use strict';
/*
  Itzik, 11.10.2026: "תעקוב אחרי הצריכה של רינת ... על מנת לבדוק שלי ישארו
  מספיק טוקנים לפגסוס ולכל הלקוחות שלי. אם אתה רואה שימוש יתר תגיד לי".

  Every monitor's worker writes one line per session to its own
  data/status/usage.jsonl (worker.js, logUsage): cost at list price and the
  tokens per model. This reads all of them (Itzik, Ilay, Rinat, every customer
  found by its monitor-worker-<id>.service), and:
    - writes data/status/usage-summary.json in Itzik's monitor, today and the
      last 7 days per monitor, and the share of each model;
    - warns him by push, once a day per reason, on overuse: a monitor over
      DAY_USD today, or over three times its own usual day, or all of them
      together over ALL_USD, or a customer whose planner did the work itself
      (almost nothing went to the cheap model on a long session);
    - at 21:00 Israel leaves a report on his "תשובות" screen.
  Runs as root (the customers' folders are private to their own users) from
  monitor-usage.timer, hourly. Reads only; the one write in a customer folder
  is none. --dry prints and sends nothing.

  The dollars are what the same tokens would cost at list price. Rinat's and
  Itzik's sessions share his subscription, so the number is the honest way to
  compare who used how much of it, not a bill.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ME = '/home/monitor/abaitzik-monitor';
const DAY_USD = Number(process.env.USAGE_DAY_USD) || 15;
const CUSTOMER_DAY_USD = 8; // same default as worker.js DAY_USD
const ALL_USD =Number(process.env.USAGE_ALL_USD) || 60;
const DRY = process.argv.includes('--dry');
const STATE = path.join(ME, 'data', 'status', 'usage-alerts.json');

const ilDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
const ilHour = (d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(d));
const usd = (n) => '$' + n.toFixed(2);
// 12.10, Itzik: "בדו"חות תכניס גם כמה טוקנים". All four kinds count; most are cache reads.
const toks = (u) => Object.values(u.models || {}).reduce((n, x) => n + (x.in || 0) + (x.out || 0) + (x.cr || 0) + (x.cw || 0), 0);
const tk = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + ' מיליון' : n >= 1e3 ? Math.round(n / 1e3) + ' אלף' : String(n);

function monitors() {
  const out = [{ id: 'abaitzik', label: 'המוניטור שלך', dir: ME }];
  for (const f of fs.readdirSync('/etc/systemd/system')) {
    const m = /^monitor-worker-([a-z0-9_-]+)\.service$/.exec(f);
    if (!m) continue;
    try {
      const unit = fs.readFileSync(path.join('/etc/systemd/system', f), 'utf8');
      const dir = (/^WorkingDirectory=(.+)$/m.exec(unit) || [])[1];
      if (!dir) continue;
      let label = m[1];
      try { label = JSON.parse(fs.readFileSync(path.join(dir, 'instance.json'), 'utf8')).owner || label; } catch (e) {}
      out.push({ id: m[1], label, dir });
    } catch (e) {}
  }
  return out;
}

function lines(dir) {
  try {
    return fs.readFileSync(path.join(dir, 'data', 'status', 'usage.jsonl'), 'utf8').split('\n')
      .filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { return []; }
}

/*
  12.10, Itzik: "דו"ח מסכם כמה החשבון שלי עומד מה המכסה החודשית מה המכסה השבועית
  ... כמה כל מוניטור לקח ... איזה מצב אני עומד לגבי המנוי שלי במאה דולר".
  The meter itself (week and 5 hours, in percent) is read on the PC every 20
  minutes (pc-pull.js subSnapshot) and lands in subscription.json, with what the
  Claude Code sessions on the PC used per day. Those sessions are a row of their
  own, so the PC tasks already inside them are not counted twice.
*/
function subscription(now) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(ME, 'data', 'status', 'subscription.json'), 'utf8'));
    s.ageH = (now - Date.parse(s.at)) / 36e5;
    return s;
  } catch (e) { return null; }
}

function summarize(now, sub) {
  const today = ilDay(now);
  const pcRow = sub && sub.pc && sub.ageH < 26;
  const days = [];
  for (let i = 0; i < 8; i++) days.push(ilDay(new Date(now - i * 864e5)));
  return monitors().map((mon) => {
    const byDay = {}, tokDay = {}, models = {};
    let sessions = 0, longSolo = 0, pc = 0;
    for (const u of lines(mon.dir)) {
      const d = ilDay(new Date(u.at));
      if (!days.includes(d)) continue;
      if (pcRow && u.src === 'pc') continue;
      byDay[d] = (byDay[d] || 0) + (u.usd || 0);
      tokDay[d] = (tokDay[d] || 0) + toks(u);
      if (d === today) {
        sessions++;
        if (u.src === 'pc') pc++;
        for (const [m, x] of Object.entries(u.models || {})) {
          const k = /haiku/.test(m) ? 'haiku' : /opus/.test(m) ? 'opus' : /sonnet/.test(m) ? 'sonnet' : m;
          models[k] = (models[k] || 0) + (x.usd || 0);
        }
        // a long session (over a dollar) that sent nothing to a subagent: the planner did the legwork
        if ((u.usd || 0) > 1 && !u.sub) longSolo++;
      }
    }
    const past = days.slice(1).map((d) => byDay[d] || 0).filter((x) => x > 0).sort((a, b) => a - b);
    const usual = past.length ? past[Math.floor(past.length / 2)] : 0;
    const week = days.slice(0, 7);
    return { id: mon.id, label: mon.label, today: byDay[today] || 0, usual, week: week.reduce((s, d) => s + (byDay[d] || 0), 0), sessions, longSolo, models, pc,
      tokToday: tokDay[today] || 0, tokWeek: week.reduce((s, d) => s + (tokDay[d] || 0), 0),
      yesterday: { usd: byDay[days[1]] || 0, tok: tokDay[days[1]] || 0 } };
  }).concat(pcRow ? [(() => {
    const g = (d) => sub.pc[d] || { usd: 0, tok: 0 };
    const week = days.slice(0, 7);
    return { id: 'pc', label: 'המחשב (סשנים שאתה פותח)', today: g(today).usd, usual: 0, week: week.reduce((n, d) => n + g(d).usd, 0),
      sessions: 0, longSolo: 0, models: {}, pc: 0, tokToday: g(today).tok, tokWeek: week.reduce((n, d) => n + g(d).tok, 0),
      yesterday: g(days[1]) };
  })()] : []);
}

const bar = (pct, w) => { const n = Math.max(0, Math.min(w, Math.round(pct / 100 * w))); return '█'.repeat(n) + '░'.repeat(w - n); };
const when = (iso) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

// The subscription in plain words, with bars: the table he asked for, readable on the phone.
function subText(sum, sub, now) {
  const out = [];
  if (!sub) out.push('מצב המנוי: עוד לא נקרא מהמחשב.');
  else {
    const plan = /max_20x/.test(sub.tier) ? 'Max פי 20, 200 דולר לחודש' : /max/.test(sub.plan) ? 'Max פי 5, 100 דולר לחודש' : sub.plan;
    out.push('המנוי: ' + plan + '. מחיר קבוע, בלי חיוב נוסף' + (sub.extra ? ' (שימוש נוסף בתשלום מופעל!)' : '') + '.');
    out.push('אין מכסה חודשית ואין יומית. יש שתיים: שבועית, וחלון של 5 שעות.');
    if (sub.week) {
      const left = Date.parse(sub.week.resets) - now;
      const gone = Math.max(0.01, 1 - left / (7 * 864e5));
      const pace = sub.week.pct / gone;
      out.push('שבועית  ' + bar(sub.week.pct, 20) + ' ' + Math.round(sub.week.pct) + '%, מתאפסת ' + when(sub.week.resets) + '.');
      out.push('   עברו ' + Math.round(gone * 100) + '% מהשבוע. ' + (pace <= 100 ? 'בקצב הזה תסיים את השבוע בערך ב ' + Math.round(pace) + '%.'
        : 'בקצב הזה המכסה נגמרת בערך ' + when(new Date(now + (100 - sub.week.pct) / (sub.week.pct / (gone * 7 * 864e5))).toISOString()) + ', לפני האיפוס.'));
    }
    if (sub.five) out.push('5 שעות  ' + bar(sub.five.pct, 20) + ' ' + Math.round(sub.five.pct) + '%' + (sub.five.resets ? ', מתאפס ' + when(sub.five.resets) : '') + '.');
    if (sub.ageH > 2) out.push('(נקרא לאחרונה ' + when(sub.at) + ', המחשב כבוי מאז.)');
  }
  const tot = sum.reduce((n, s) => n + s.week, 0);
  if (tot > 0) {
    out.push('', 'מי לקח כמה השבוע (מחיר מחירון, ובערך מה זה מהמכסה השבועית):');
    for (const s of sum.slice().sort((a, b) => b.week - a.week)) {
      const share = s.week / tot * 100;
      out.push(bar(share, 12) + ' ' + Math.round(share) + '%  ' + s.label + ': ' + usd(s.week) + (sub && sub.week ? ', בערך ' + Math.round(share / 100 * sub.week.pct) + '% מהמכסה' : '') + '. היום ' + usd(s.today) + '.');
    }
  }
  return out.join('\n');
}

function reasons(sum, sub) {
  const out = [];
  for (const s of sum) {
    // The PC row is his own sessions, not a monitor: no ceiling, no per monitor alarm.
    if (s.id === 'pc') continue;
    // 12.10: a customer stops at its own ceiling (worker.js overBudget); he hears it here.
    if (s.id !== 'abaitzik' && s.today >= CUSTOMER_DAY_USD) out.push([s.id + ':cap', s.label + ' הגיע לתקרה היומית (' + usd(s.today) + '). ההודעות מחכות למחר. להעלות: MONITOR_DAY_USD בקובץ /etc/' + s.id + '.env.']);
    else if (s.today > DAY_USD) out.push([s.id + ':day', s.label + ': ' + usd(s.today) + ' היום, מעל הסף של ' + usd(DAY_USD) + '.']);
    else if (s.usual >= 2 && s.today > 3 * s.usual) out.push([s.id + ':x3', s.label + ': ' + usd(s.today) + ' היום, פי ' + (s.today / s.usual).toFixed(1) + ' מיום רגיל (' + usd(s.usual) + ').']);
    if (s.longSolo >= 3) out.push([s.id + ':solo', s.label + ': ' + s.longSolo + ' סשנים ארוכים היום בלי להעביר עבודה למודל הזול.']);
  }
  if (sub && sub.week && sub.ageH < 3) {
    const left = Date.parse(sub.week.resets) - Date.now();
    const gone = Math.max(0.01, 1 - left / (7 * 864e5));
    if (sub.week.pct >= 80) out.push(['sub:80', 'המכסה השבועית ב ' + Math.round(sub.week.pct) + '%, מתאפסת ' + when(sub.week.resets) + '.']);
    else if (sub.week.pct / gone > 110 && sub.week.pct >= 30) out.push(['sub:pace', 'בקצב הנוכחי המכסה השבועית תיגמר לפני האיפוס (' + Math.round(sub.week.pct) + '% אחרי ' + Math.round(gone * 100) + '% מהשבוע).']);
  }
  const all = sum.reduce((n, s) => n + s.today, 0);
  if (all > ALL_USD) out.push(['all:day', 'כל המוניטורים יחד: ' + usd(all) + ' היום, מעל ' + usd(ALL_USD) + '. זה בא על חשבון פגסוס והלקוחות.']);
  return out;
}

function text(sum) {
  return sum.map((s) => {
    const m = Object.entries(s.models).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + usd(v)).join(', ');
    return s.label + ': היום ' + tk(s.tokToday) + ' טוקנים, ' + usd(s.today) + (s.id === 'pc' ? '' : ' ב ' + s.sessions + ' סשנים') + (s.pc ? ' (' + s.pc + ' במחשב)' : '') + (m ? ' (' + m + ')' : '') +
      ', שבוע ' + tk(s.tokWeek) + ' טוקנים, ' + usd(s.week) + (s.usual ? ', יום רגיל ' + usd(s.usual) : '') + '.';
  }).join('\n') + '\nסך הכל היום: ' + tk(sum.reduce((n, s) => n + s.tokToday, 0)) + ' טוקנים, ' + usd(sum.reduce((n, s) => n + s.today, 0)) + '.';
}

function asMonitor(args) {
  return execFileSync('sudo', ['-u', 'monitor', ...args], { cwd: ME, encoding: 'utf8', timeout: 120000 });
}

function writeAsMonitor(file, data) {
  const tmp = '/tmp/usage-' + process.pid + '.json';
  fs.writeFileSync(tmp, data);
  asMonitor(['cp', tmp, file]);
  fs.unlinkSync(tmp);
}

function main() {
  const now = new Date();
  const sub = subscription(now);
  const sum = summarize(now, sub);
  const body = subText(sum, sub, now) + '\n\n' + text(sum);
  const why = reasons(sum, sub);
  if (DRY) { console.log(body); console.log(why.map((r) => '! ' + r[1]).join('\n') || 'אין שימוש יתר'); return; }

  writeAsMonitor(path.join(ME, 'data', 'status', 'usage-summary.json'), JSON.stringify({ at: now.toISOString(), monitors: sum, sub, subText: subText(sum, sub, now) }, null, 1));

  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  const day = ilDay(now);
  if (state.day !== day) state = { day, sent: [] };
  const fresh = why.filter((r) => !state.sent.includes(r[0]));
  if (fresh.length) {
    try { asMonitor(['node', 'notify.js', 'צריכת טוקנים גבוהה', fresh.map((r) => r[1]).join(' ')]); } catch (e) { console.error('notify failed', e.message); }
    state.sent.push(...fresh.map((r) => r[0]));
  }
  if (ilHour(now) === 21 && !state.report) {
    const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(now).replace(/[-:, ]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
    const rep = { at: now.toISOString(), network: 'usage', title: 'צריכת הטוקנים היום', body: body + (why.length ? '\n\nשימוש יתר: ' + why.map((r) => r[1]).join(' ') : '\n\nאין שימוש יתר.') };
    writeAsMonitor(path.join(ME, 'data', 'reports', 'reports', stamp + '-usage.json'), JSON.stringify(rep));
    state.report = true;
  }
  writeAsMonitor(STATE, JSON.stringify(state));
  console.log(new Date().toISOString(), body.replace(/\n/g, ' | '), fresh.length ? 'warned ' + fresh.length : '');
}

if (require.main === module) main();
module.exports = { summarize, reasons, text, tk, subText, subscription };
