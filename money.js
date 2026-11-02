'use strict';
/*
  The money page's numbers: cash, debt, late amount, a 90 day forecast and
  anomalies. Written to data/money/money.json, which build.js passes to the
  page as D.money (another agent draws the KPI cards from it).

  24.10.2026, Stage 4 of the money work. A plain script, like daily-brief.js,
  run by a timer three times a day (setup/money.timer). No model is called
  anywhere in it.

  Sources, in order of what each one gives:
  - Morning (Green Invoice), open invoices, only when the 'morning' feature is
    on (lib/features.js, Itzik's approval). Keys: env MORNING_ID, MORNING_SECRET,
    and MORNING_SANDBOX=1 for the sandbox. A failed login or request stops the
    run with an error; nothing is retried (saving skill, rule 4).
  - Otherwise, and for the debtors in any case, data/rivhit/rivhit/*.json with
    kind "debt" (the open invoices behind each customer's total).
  - Bank history: data/bank/bank/*.json, each {at, balance, movements:[{date,
    payee, amount}]}, amount < 0 is a charge. The newest file gives the cash.
    Nothing writes these yet: the bank tile's files are read by a session and
    written as text reports, so this folder is empty until a parser writes it.

  Cost rule: the input is hashed with today's date (Israel). When the hash is
  the same as the last run's, the script exits before any work and writes
  nothing. A new day with the same inputs runs once, so an invoice that became
  30 days late is still seen.

  Notifications: only new anomalies, at most two per Israel day, each one
  counted in the message. An anomaly that could not be sent stays unseen and
  goes out on a later run that has budget.

  Usage: node money.js           compute, write, notify
         node money.js --dry     print the result, save nothing, send nothing
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const inst = require('./lib/instance.js');
const features = require('./lib/features.js');
const morning = require('./lib/morning.js');
const cashflow = require('./lib/cashflow.js');
const anomaly = require('./lib/anomaly.js');
const ch = require('./lib/notify-channels.js');

const DRY = process.argv.includes('--dry');
const DAILY_CAP = 2;
const DIR = path.join(inst.dataPath, 'money');
const OUT = path.join(DIR, 'money.json');
const LAST = path.join(DIR, 'last.json');

function readJson(f, d) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; }
}

function writeJson(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v, null, 1), 'utf8');
}

// Folder docs, the same way build.js loadDocs reads them. A broken file is skipped.
function docsIn(sub) {
  const dir = path.join(inst.dataPath, sub, sub);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(dir, f), null)).filter(Boolean);
}

// Bank: the newest file gives the cash, all files give the history (no duplicates).
function bank() {
  const files = docsIn('bank').filter((b) => typeof b.balance === 'number' && isFinite(Date.parse(b.at)));
  if (!files.length) return { cash: null, movements: [] };
  files.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const seen = new Set();
  const movements = [];
  files.forEach((f) => (Array.isArray(f.movements) ? f.movements : []).forEach((m) => {
    const k = [m.date, m.payee, m.amount].join('|');
    if (seen.has(k)) return;
    seen.add(k);
    movements.push(m);
  }));
  return { cash: files[files.length - 1].balance, movements };
}

// Debtors from the Rivhit report: one customer per debt record.
function rivhitDebtors() {
  return docsIn('rivhit')
    .filter((r) => r.kind === 'debt' && Array.isArray(r.inv))
    .map((r) => ({
      name: String(r.name || ''),
      inv: r.inv.map((x) => ({ n: String(x.n || ''), date: String(x.date || ''), left: Number(x.left) || 0 })),
    }));
}

// Morning's open invoices grouped by client, in the same shape as rivhitDebtors.
function morningDebtors(items) {
  const by = Object.create(null);
  items.forEach((i) => {
    const name = i.client || '';
    (by[name] = by[name] || { name, inv: [] }).inv.push({ n: i.number || i.id, date: i.due || i.date, left: i.left });
  });
  return Object.keys(by).map((k) => by[k]);
}

async function openFromMorning() {
  const env = process.env;
  const creds = { id: env.MORNING_ID, secret: env.MORNING_SECRET };
  if (!creds.id || !creds.secret) return { skipped: 'no MORNING_ID or MORNING_SECRET in the environment' };
  const r = await morning.openInvoices(creds, { sandbox: env.MORNING_SANDBOX === '1' });
  return { items: r.items };
}

function hashOf(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function israelDay(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

async function main() {
  const now = Date.now();
  const today = israelDay(now);
  const feat = features.read(inst.dataPath);

  let invoices = [];
  let debtors = rivhitDebtors();
  let source = 'rivhit';
  if (feat.morning) {
    const m = await openFromMorning();
    if (m.skipped) {
      console.log('Morning: ' + m.skipped + '. The debtors report is used instead.');
    } else {
      invoices = m.items;
      debtors = morningDebtors(m.items);
      source = 'morning';
    }
  }
  if (source === 'rivhit') {
    debtors.forEach((d) => d.inv.forEach((x) => invoices.push({ left: x.left, due: x.date, number: x.n, client: d.name })));
  }

  const b = bank();
  const input = {
    today: now,
    cash: b.cash,
    invoices: invoices.map((i) => ({ left: i.left, due: i.due || i.date })),
    movements: b.movements,
  };

  // The cost rule: same inputs and the same day as the last run means nothing to do.
  const inputs = { day: today, source, cash: b.cash, invoices, movements: b.movements, debtors };
  const hash = hashOf(inputs);
  const last = readJson(LAST, {});
  if (!DRY && last.hash === hash && fs.existsSync(OUT)) {
    console.log('money: nothing new since the last run, nothing written');
    return;
  }

  const fc = cashflow.forecast(input);
  const debt = Math.round(invoices.reduce((a, i) => a + (i.left || 0), 0) * 100) / 100;
  const overdue = anomaly.overdueAnomalies(debtors, now);
  const late = Math.round(invoices.reduce((a, i) => {
    const base = Date.parse(i.due || i.date);
    return isFinite(base) && (now - base) / 86400000 > anomaly.OVERDUE_DAYS ? a + (i.left || 0) : a;
  }, 0) * 100) / 100;
  const all = anomaly.chargeAnomalies(b.movements).concat(overdue);

  const out = {
    at: new Date(now).toISOString(),
    cash: b.cash,
    debt,
    late,
    forecast90: fc.forecast90,
    anomalies: all.map((a) => ({ t: a.t, sub: a.sub })),
  };

  if (DRY) {
    console.log(JSON.stringify(out, null, 1));
    return;
  }

  // Notifications: new anomalies only, DAILY_CAP per Israel day.
  const sentToday = last.day === today ? (last.sent || 0) : 0;
  let budget = DAILY_CAP - sentToday;
  const seen = Array.isArray(last.seen) ? last.seen.slice() : [];
  let sent = sentToday;
  // 24.10.2026, Itzik: money alerts only for a customer who turned money on.
  const fresh = feat.money ? anomaly.fresh(all, seen) : [];
  // The notifier is async; the loop waits for each answer so the count is exact.
  for (const a of fresh) {
    if (budget <= 0) break;
    const n = sent + 1;
    const body = a.sub + ' (התראה ' + n + ' מתוך ' + DAILY_CAP + ' להיום)';
    const r = await ch.notify(a.t, body);
    if (r.ok || r.held) {
      seen.push(a.key);
      sent += 1;
      budget -= 1;
    } else {
      console.log('money: notification not sent, kept for a later run: ' + a.t);
      break;
    }
  }

  writeJson(OUT, out);
  writeJson(LAST, {
    hash,
    day: today,
    sent,
    seen: seen.slice(-500),
    at: out.at,
  });
  console.log('money: written, ' + all.length + ' anomalies, ' + sent + ' notified today, source ' + source);
}

main().catch((e) => {
  console.error('money: stopped, ' + e.message);
  process.exitCode = 1;
});
