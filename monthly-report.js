'use strict';
/*
  The monthly report: three A4 pages as a PDF, on the 1st at 09:00.

  6.11.2026, from Revora (Noam's monthly report). Counts come from
  lib/monthly.js; this draws them, prints with Chrome (as sign.js does), puts
  the PDF in the private files, writes it to the chat, pushes to the phone and
  sends one WhatsApp line. Business only: no bank, no debts.

    node monthly-report.js                 run from the timer: only on the 1st
                                           (the 2nd if the 1st is Saturday), once a month
    node monthly-report.js --month 2026-10 --dry   make the PDF in /tmp, send nothing
    node monthly-report.js --month 2026-10 --force deliver that month now
*/
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const inst = require('./lib/instance.js');
const M = require('./lib/monthly.js');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const mi = args.indexOf('--month');
const STATE = path.join(inst.dataPath, 'status', 'monthly-report.json');
const PRIV = path.join(inst.dataPath, 'files-private');
const FONT = path.join(__dirname, 'docs', 'ner', 'fonts');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ils = (n) => Number(n || 0).toLocaleString('he-IL') + ' ₪';

function html(r, who) {
  const box = (n, l, sub) => '<div class="kpi"><b>' + n + '</b><span>' + esc(l) + '</span>' + (sub ? '<i>' + esc(sub) + '</i>' : '') + '</div>';
  const d = r.leadsIn - r.leadsPrev;
  const delta = !r.leadsPrev ? '' : d > 0 ? 'עוד ' + d + ' מחודש שעבר' : d < 0 ? (-d) + ' פחות מחודש שעבר' : 'כמו בחודש שעבר';
  const list = (arr, f, empty) => arr.length ? '<ul>' + arr.slice(0, 8).map((x) => '<li>' + f(x) + '</li>').join('') + '</ul>' + (arr.length > 8 ? '<p class="more">ועוד ' + (arr.length - 8) + '</p>' : '') : '<p class="ok">' + empty + '</p>';
  const missing = r.missing.length ? '<p class="miss">אין נתונים על: ' + esc(r.missing.join(', ')) + '. זה חסר, לא אפס.</p>' : '';
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>' +
    '@font-face{font-family:Heebo;src:url("file://' + FONT + '/heebo-v28-hebrew.woff2") format("woff2");unicode-range:U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F}' +
    '@font-face{font-family:Heebo;src:url("file://' + FONT + '/heebo-v28-latin.woff2") format("woff2")}' +
    '@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Heebo,sans-serif;color:#1d2433;background:#fff}' +
    '.pg{width:210mm;height:297mm;padding:22mm 20mm;page-break-after:always;position:relative}' +
    '.top{font-size:13px;color:#6b7385;letter-spacing:.02em}h1{font-size:34px;margin:6px 0 4px;font-weight:800}h2{font-size:20px;margin:28px 0 10px;font-weight:700}' +
    '.n{display:inline-block;width:34px;height:34px;border-radius:50%;background:#1f6feb;color:#fff;text-align:center;line-height:34px;font-weight:800;margin-left:10px}' +
    '.kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:22px}.kpi{border:1px solid #e3e7ef;border-radius:14px;padding:16px 18px}' +
    '.kpi b{display:block;font-size:34px;font-weight:800;color:#1f6feb}.kpi span{font-size:15px}.kpi i{display:block;font-style:normal;font-size:12px;color:#6b7385;margin-top:4px}' +
    'ul{margin:0;padding:0 18px 0 0;font-size:15px;line-height:1.9}.ok{color:#1a7f37;font-size:15px}.more,.miss{color:#6b7385;font-size:13px}' +
    '.step{display:flex;align-items:flex-start;gap:14px;border:1px solid #e3e7ef;border-radius:14px;padding:18px;margin:14px 0;font-size:17px;line-height:1.6}' +
    '.step .n{flex:none}.foot{position:absolute;bottom:14mm;right:20mm;left:20mm;font-size:11px;color:#9aa1b0;display:flex;justify-content:space-between}' +
    '</style></head><body>' +
    // page 1
    '<section class="pg"><div class="top">הדוח החודשי</div><h1>' + esc(r.name) + '</h1>' +
    '<h2><span class="n">1</span>מה היה החודש</h2><div class="kpis">' +
    box(r.leadsIn, 'לידים חדשים', delta) +
    box(r.quotesSent, 'הצעות מחיר שנשלחו') +
    box(r.quotesSigned.length, 'הצעות שנחתמו', r.quotesSigned.length ? ils(r.signedMonthly) + ' לחודש' + (r.signedSetup ? ' ועוד ' + ils(r.signedSetup) + ' הקמה' : '') : '') +
    box(r.formsFilled, 'טפסים שמולאו') + '</div>' +
    '<h2>מאיפה הגיעו הלידים</h2>' + list(r.sources, (s) => esc(s[0]) + ': ' + s[1], 'לא נכנסו לידים החודש.') +
    (r.newCustomers.length ? '<h2>לקוחות חדשים</h2>' + list(r.newCustomers, esc, '') : '') + missing +
    '<div class="foot"><span>המוניטור</span><span>עמוד 1 מתוך 3</span></div></section>' +
    // page 2
    '<section class="pg"><div class="top">' + esc(r.name) + '</div>' +
    '<h2><span class="n">2</span>איפה זה נתקע</h2>' +
    '<h2>הצעות שנפתחו ולא נחתמו</h2>' + list(r.openedNotSigned, (q) => esc(q.client) + ', פתח לפני ' + q.days + ' ימים', 'אין. כל הצעה שנפתחה נחתמה.') +
    '<h2>הצעות שעוד לא נפתחו</h2>' + list(r.sentNotOpened, (q) => esc(q.client) + ', נשלחה לפני ' + q.days + ' ימים', 'אין.') +
    '<h2>לידים בלי מגע שבוע ויותר</h2>' + list(r.forgotten, (l) => esc(l.name) + (l.days != null ? ', ' + l.days + ' ימים' : ''), 'אין. כל ליד קיבל מענה.') +
    '<h2>טפסים שמחכים</h2>' + list(r.formsWaiting, (f) => esc(f.title) + (f.client ? ', ' + esc(f.client) : ''), 'אין.') +
    '<div class="foot"><span>המוניטור</span><span>עמוד 2 מתוך 3</span></div></section>' +
    // page 3
    '<section class="pg" style="page-break-after:auto"><div class="top">' + esc(r.name) + '</div>' +
    '<h2><span class="n">3</span>שלושה צעדים לחודש הבא</h2>' +
    r.steps.map((s, i) => '<div class="step"><span class="n">' + (i + 1) + '</span><div>' + esc(s) + '</div></div>').join('') +
    '<div class="foot"><span>המוניטור</span><span>עמוד 3 מתוך 3</span></div></section></body></html>';
}

function pdf(htmlText, out) {
  const tmp = path.join(require('os').tmpdir(), 'monthly-' + Date.now() + '.html');
  fs.writeFileSync(tmp, htmlText, 'utf8');
  return new Promise((ok, no) => execFile('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
    '--allow-file-access-from-files', '--virtual-time-budget=6000', '--print-to-pdf=' + out, 'file://' + tmp], { timeout: 90000 },
  (e) => { try { fs.unlinkSync(tmp); } catch (x) {} return e ? no(e) : ok(out); }));
}

// The 1st of the month, or the 2nd when the 1st is Saturday. Never on Saturday.
function dueToday(now) {
  const d = M.dayOf(now), dom = Number(d.slice(8, 10));
  const wd = new Date(d + 'T12:00:00Z').getUTCDay();
  if (wd === 6) return false;
  if (dom === 1) return true;
  return dom === 2 && new Date(d.slice(0, 8) + '01T12:00:00Z').getUTCDay() === 6;
}

async function main() {
  const now = Date.now();
  const today = M.dayOf(now);
  const ym = mi >= 0 ? args[mi + 1] : M.prevMonth(today.slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('month must be YYYY-MM');
  const st = (() => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } })();
  if (!DRY && !FORCE) {
    if (!dueToday(now)) { console.log(today + ' לא יום הדוח'); return; }
    if (st.done === ym) { console.log('הדוח של ' + ym + ' כבר יצא'); return; }
  }
  const r = M.collect(inst.dataPath, ym, now);
  const who = '';
  const name = 'monthly-' + ym + '.pdf';
  const out = DRY ? path.join(require('os').tmpdir(), name) : path.join(PRIV, name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await pdf(html(r, who), out);
  console.log('PDF: ' + out);
  if (DRY) { console.log(JSON.stringify(r, null, 1)); return; }

  const line = r.name + ': ' + r.leadsIn + ' לידים, ' + r.quotesSigned.length + ' הצעות נחתמו. הצעד הראשון: ' + r.steps[0];
  const chatDir = path.join(inst.dataPath, 'chat', 'chat');
  const stamp = new Date(now).toISOString().replace(/[^0-9]/g, '').slice(0, 12);
  fs.writeFileSync(path.join(chatDir, stamp.slice(0, 8) + '-' + stamp.slice(8, 12) + '-claude-monthly-' + ym + '.json'),
    JSON.stringify({ at: new Date(now).toISOString(), from: 'claude', status: 'done',
      text: '📊 הדוח החודשי של ' + r.name + ' מוכן, שלושה עמודים: files/' + name + '\n\n' + line }, null, 1), 'utf8');
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ done: ym, at: new Date(now).toISOString() }), 'utf8');
  const run = (cmd, a) => { try { execFileSync('node', [cmd].concat(a), { cwd: __dirname, timeout: 240000, stdio: 'ignore' }); } catch (e) { console.error('!! ' + cmd + ': ' + e.message); } };
  run('push.js', ['monthly report ' + ym]);
  run('notify.js', ['📊 הדוח החודשי מוכן', line]);
  try { await require('./lib/wa-out.js').sendOwner(inst.dataPath, '📊 ' + line + '\nהדוח המלא במוניטור, תחת תשובות.', { kind: 'monthly' }); }
  catch (e) { console.error('!! wa: ' + e.message); }
}

if (require.main === module) main().catch((e) => { console.error('!! ' + e.message); process.exit(1); });
module.exports = { html, dueToday };
