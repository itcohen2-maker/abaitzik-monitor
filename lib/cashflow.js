'use strict';
/*
  Cash forecast for the next 90 days. Pure: no files, no network, no clock
  except the `today` the caller passes in.

  24.10.2026, Stage 4 of the money work (money.js calls this).

  Rules, in plain words:
  - Start from the cash in the latest bank balance.
  - Each open invoice with something left to pay comes in on its due day.
    An invoice already past due is NOT counted: nobody knows when it will be
    paid, so the forecast stays conservative and the late amount is shown
    separately by money.js.
  - Recurring expenses are found in the bank history: the same payee charged
    roughly every month (gap of 20 to 40 days between charges, at least three
    charges). Each one goes out every 30 days from its next expected day, at
    the median of its past charges.
  - whatIf(extraMonthly) adds one more monthly outflow from day 0, to answer
    "what if I take on a cost of X a month".

  Output: forecast90 is 13 weekly points, the balance at the end of week 1 to
  week 13 (day 7 to day 91). When the cash is unknown, forecast90 is [].
*/

const DAY = 24 * 3600 * 1000;
const WEEKS = 13;
const HORIZON = WEEKS * 7;

function dayIndex(iso, today) {
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  return Math.floor((t - today) / DAY);
}

function median(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function payeeKey(p) {
  return String(p || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/*
  Recurring monthly expenses from bank movements.
  movements: [{date: 'YYYY-MM-DD', payee, amount}] where a charge is amount < 0.
  Returns [{payee, monthly, next}] where next is the YYYY-MM-DD of the next
  expected charge (last charge + 30 days, moved forward past `today`).
*/
function recurring(movements, today) {
  const byPayee = Object.create(null);
  (movements || []).forEach((m) => {
    const amt = Number(m && m.amount);
    const t = Date.parse(m && m.date);
    if (!(amt < 0) || !isFinite(t)) return;
    const k = payeeKey(m.payee);
    if (!k) return;
    (byPayee[k] = byPayee[k] || { name: String(m.payee).trim(), rows: [] }).rows.push({ t, a: -amt });
  });
  const out = [];
  Object.keys(byPayee).forEach((k) => {
    const rows = byPayee[k].rows.sort((a, b) => a.t - b.t);
    if (rows.length < 3) return;
    const gaps = [];
    for (let i = 1; i < rows.length; i += 1) gaps.push((rows[i].t - rows[i - 1].t) / DAY);
    const monthlyLike = median(gaps) >= 20 && median(gaps) <= 40 && gaps.every((g) => g >= 15 && g <= 50);
    if (!monthlyLike) return;
    const last = rows[rows.length - 1].t;
    let next = last + 30 * DAY;
    while (next < today) next += 30 * DAY;
    out.push({
      payee: byPayee[k].name,
      monthly: Math.round(median(rows.map((r) => r.a)) * 100) / 100,
      next: new Date(next).toISOString().slice(0, 10),
    });
  });
  return out.sort((a, b) => b.monthly - a.monthly);
}

/*
  input: {cash, invoices:[{left, due}], movements, today (epoch ms)}
  opts:  {whatIf: number} extra monthly outflow, shekels
  Returns {forecast90, recurring}.
*/
function forecast(input, opts) {
  const today = input.today;
  const extra = opts && Number(opts.whatIf) > 0 ? Number(opts.whatIf) : 0;
  const rec = recurring(input.movements, today);
  if (typeof input.cash !== 'number' || !isFinite(input.cash)) {
    return { forecast90: [], recurring: rec };
  }
  // flow[d] = net change on day d (d from 0 to HORIZON-1)
  const flow = new Array(HORIZON).fill(0);
  (input.invoices || []).forEach((inv) => {
    const left = Number(inv && inv.left);
    const d = dayIndex(inv && inv.due, today);
    if (!(left > 0) || d === null) return;
    if (d < 0) return; // past due: not counted, see header
    if (d < HORIZON) flow[d] += left;
  });
  const addMonthly = (amount, startDay) => {
    for (let d = startDay; d < HORIZON; d += 30) {
      if (d >= 0) flow[d] -= amount;
    }
  };
  rec.forEach((r) => {
    const d = dayIndex(r.next, today);
    addMonthly(r.monthly, d === null ? 0 : Math.max(0, d));
  });
  if (extra) addMonthly(extra, 0);

  const out = [];
  let bal = input.cash;
  let idx = 0;
  for (let w = 1; w <= WEEKS; w += 1) {
    const end = w * 7;
    for (; idx < end; idx += 1) bal += flow[idx];
    out.push(Math.round(bal * 100) / 100);
  }
  return { forecast90: out, recurring: rec };
}

// What a fixed monthly cost of `extraMonthly` does to the same forecast.
function whatIf(input, extraMonthly) {
  return forecast(input, { whatIf: extraMonthly }).forecast90;
}

module.exports = { forecast, whatIf, recurring, HORIZON, WEEKS, DAY };
