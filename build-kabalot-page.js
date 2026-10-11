'use strict';
// The page itself. Kept apart from build-kabalot.js so the parsing and the
// look can change without disturbing each other.
//
// Shape of the screen, in the order a question gets asked: what did the year
// cost, who charged the most, and then every single charge with a way back to
// the original mail. The per-vendor block answers "what am I still paying for
// every month" without a spreadsheet, which is the thing that actually leaks
// money.

const fs = require('fs');
const path = require('path');

module.exports = function build() {
  const { load, esc, money, OUT } = require('./build-kabalot.js');
  const { rows, collectedAt } = load();

  // Totals, per currency. Never summed across currencies.
  const totals = {};
  let noAmount = 0;
  for (const r of rows) {
    if (r.amount == null) { noAmount++; continue; }
    totals[r.currency] = (totals[r.currency] || 0) + r.amount;
  }

  // Per vendor: how many charges, how much, and whether it looks recurring.
  // Three or more charges in three or more different months is a standing
  // order in everything but name, and that is the list worth reading.
  const byVendor = new Map();
  for (const r of rows) {
    if (!byVendor.has(r.vendor)) {
      byVendor.set(r.vendor, { vendor: r.vendor, cat: r.cat, n: 0, months: new Set(), sums: {} });
    }
    const v = byVendor.get(r.vendor);
    v.n++;
    if (r.month) v.months.add(r.month);
    if (r.amount != null) v.sums[r.currency] = (v.sums[r.currency] || 0) + r.amount;
  }
  const vendors = [...byVendor.values()].map(v => ({
    ...v,
    months: v.months.size,
    recurring: v.n >= 3 && v.months.size >= 3,
    top: Math.max(0, ...Object.values(v.sums)),
  })).sort((a, b) => b.top - a.top || b.n - a.n);

  // Months, newest first.
  const byMonth = new Map();
  for (const r of rows) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, { key: r.month, he: r.monthHe, rows: [], sums: {} });
    const m = byMonth.get(r.month);
    m.rows.push(r);
    if (r.amount != null) m.sums[r.currency] = (m.sums[r.currency] || 0) + r.amount;
  }
  const months = [...byMonth.values()].sort((a, b) => (b.key || '').localeCompare(a.key || ''));

  const sumLine = sums => Object.entries(sums)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => money(n, c)).join(' · ') || '—';

  const head = `
  <header>
    <h1>קבלות</h1>
    <p class="lede">כל מה שחויב מתחילת 2026, מהמייל, עם קישור לכל קבלה.</p>
  </header>

  <section class="cards">
    <div class="card"><b>${rows.length}</b><small>קבלות</small></div>
    ${Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([c, n]) =>
      `<div class="card"><b>${esc(money(n, c))}</b><small>סך הכל ${esc(c)}</small></div>`).join('')}
    ${noAmount ? `<div class="card warn"><b>${noAmount}</b><small>בלי סכום, צריך לפתוח</small></div>` : ''}
  </section>`;

  const vendorRows = vendors.map(v => `
    <tr>
      <td class="v">${esc(v.vendor)}${v.recurring ? ' <span class="tag">חודשי</span>' : ''}
          <small>${esc(v.cat)}</small></td>
      <td class="n">${v.n}</td>
      <td class="s">${esc(sumLine(v.sums))}</td>
    </tr>`).join('');

  const monthBlocks = months.map(m => `
    <section class="month">
      <h3>${esc(m.he)} <span>${esc(sumLine(m.sums))}</span></h3>
      <ul class="list">
        ${m.rows.map(r => `
        <li>
          <a href="${esc(r.link)}" target="_blank" rel="noopener">
            <span class="who">${esc(r.vendor)}</span>
            <span class="what">${esc(r.subj)}</span>
            <span class="when">${r.at ? esc(r.at.toLocaleDateString('he-IL')) : ''}</span>
            <span class="amt${r.amount == null ? ' miss' : ''}">${r.amount == null ? 'לבדוק' : esc(money(r.amount, r.currency))}</span>
          </a>
        </li>`).join('')}
      </ul>
    </section>`).join('');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>קבלות</title>
<meta name="theme-color" content="#0f172a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
  :root{--ink:#0f172a;--dim:#64748b;--line:#e2e8f0;--bg:#f6f8fb;--card:#fff;--accent:#0ea5e9;--warn:#b45309}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);font-family:Heebo,system-ui,sans-serif;font-weight:300;
    line-height:1.55;padding:0 14px calc(env(safe-area-inset-bottom,0px) + 40px)}
  header,main,section{max-width:640px;margin-inline:auto}
  header{padding:calc(env(safe-area-inset-top,0px) + 26px) 0 2px}
  h1{font-size:28px;font-weight:500;margin:0}
  .lede{color:var(--dim);font-size:14px;margin:2px 0 18px}

  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:9px;margin-bottom:22px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 14px}
  .card b{display:block;font-size:21px;font-weight:500}
  .card small{display:block;color:var(--dim);font-size:12px;margin-top:1px}
  .card.warn b{color:var(--warn)}

  h2{font-size:14px;font-weight:500;color:var(--dim);margin:24px 0 8px}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);
    border-radius:14px;overflow:hidden}
  td{padding:10px 13px;border-top:1px solid var(--line);font-size:14px;vertical-align:top}
  tr:first-child td{border-top:0}
  td.v{font-weight:500}
  td.v small{display:block;color:var(--dim);font-weight:300;font-size:11.5px}
  td.n{color:var(--dim);width:42px;text-align:center}
  td.s{text-align:end;white-space:nowrap;font-size:13.5px}
  .tag{display:inline-block;background:#e0f2fe;color:#0369a1;border-radius:6px;
    padding:1px 6px;font-size:10.5px;font-weight:500;vertical-align:middle}

  .month{margin-top:22px}
  .month h3{font-size:15px;font-weight:500;margin:0 0 7px;display:flex;justify-content:space-between;
    align-items:baseline;gap:10px}
  .month h3 span{color:var(--dim);font-size:13px;font-weight:300;white-space:nowrap}
  .list{list-style:none;margin:0;padding:0;background:var(--card);border:1px solid var(--line);
    border-radius:14px;overflow:hidden}
  .list li+li a{border-top:1px solid var(--line)}
  .list a{display:grid;grid-template-columns:1fr auto;gap:1px 10px;padding:11px 13px;
    text-decoration:none;color:inherit}
  .list a:active{background:#f1f5f9}
  .who{font-weight:500;font-size:14px}
  .amt{grid-row:1/3;align-self:center;font-size:15px;white-space:nowrap}
  .amt.miss{color:var(--warn);font-size:12.5px}
  .what{grid-column:1;color:var(--dim);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .when{display:none}

  footer{max-width:640px;margin:30px auto 0;padding-top:14px;border-top:1px solid var(--line);
    color:var(--dim);font-size:12px;text-align:center}
</style>
</head>
<body>
${head}
<main>
  <h2>לפי מי שחייב</h2>
  <table>${vendorRows}</table>

  <h2>לפי חודש</h2>
  ${monthBlocks}
</main>
<footer>
  נאסף מהמייל ב-${esc(new Date(collectedAt).toLocaleString('he-IL'))}.
  לחיצה על שורה פותחת את הקבלה המקורית ב-Gmail.
</footer>
</body>
</html>
`;

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
  console.log(`kabalot: ${rows.length} receipts, ${vendors.length} vendors, ` +
              `${months.length} months, ${noAmount} without an amount`);
};
