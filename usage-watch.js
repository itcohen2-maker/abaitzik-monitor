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

function summarize(now) {
  const today = ilDay(now);
  const days = [];
  for (let i = 0; i < 8; i++) days.push(ilDay(new Date(now - i * 864e5)));
  return monitors().map((mon) => {
    const byDay = {}, tokDay = {}, models = {};
    let sessions = 0, longSolo = 0, pc = 0;
    for (const u of lines(mon.dir)) {
      const d = ilDay(new Date(u.at));
      if (!days.includes(d)) continue;
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
  });
}

function reasons(sum) {
  const out = [];
  for (const s of sum) {
    // 12.10: a customer stops at its own ceiling (worker.js overBudget); he hears it here.
    if (s.id !== 'abaitzik' && s.today >= CUSTOMER_DAY_USD) out.push([s.id + ':cap', s.label + ' הגיע לתקרה היומית (' + usd(s.today) + '). ההודעות מחכות למחר. להעלות: MONITOR_DAY_USD בקובץ /etc/' + s.id + '.env.']);
    else if (s.today > DAY_USD) out.push([s.id + ':day', s.label + ': ' + usd(s.today) + ' היום, מעל הסף של ' + usd(DAY_USD) + '.']);
    else if (s.usual >= 2 && s.today > 3 * s.usual) out.push([s.id + ':x3', s.label + ': ' + usd(s.today) + ' היום, פי ' + (s.today / s.usual).toFixed(1) + ' מיום רגיל (' + usd(s.usual) + ').']);
    if (s.longSolo >= 3) out.push([s.id + ':solo', s.label + ': ' + s.longSolo + ' סשנים ארוכים היום בלי להעביר עבודה למודל הזול.']);
  }
  const all = sum.reduce((n, s) => n + s.today, 0);
  if (all > ALL_USD) out.push(['all:day', 'כל המוניטורים יחד: ' + usd(all) + ' היום, מעל ' + usd(ALL_USD) + '. זה בא על חשבון פגסוס והלקוחות.']);
  return out;
}

function text(sum) {
  return sum.map((s) => {
    const m = Object.entries(s.models).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + usd(v)).join(', ');
    return s.label + ': היום ' + tk(s.tokToday) + ' טוקנים, ' + usd(s.today) + ' ב ' + s.sessions + ' סשנים' + (s.pc ? ' (' + s.pc + ' במחשב)' : '') + (m ? ' (' + m + ')' : '') +
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
  const sum = summarize(now);
  const body = text(sum);
  const why = reasons(sum);
  if (DRY) { console.log(body); console.log(why.map((r) => '! ' + r[1]).join('\n') || 'אין שימוש יתר'); return; }

  writeAsMonitor(path.join(ME, 'data', 'status', 'usage-summary.json'), JSON.stringify({ at: now.toISOString(), monitors: sum }, null, 1));

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
module.exports = { summarize, reasons, text, tk };
