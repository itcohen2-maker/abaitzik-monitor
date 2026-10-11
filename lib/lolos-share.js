'use strict';
/*
  The "דף לשיתוף" on the bookkeeping screen (Itzik, 11.10.2026): the open
  accounts PDF and its gallery pictures are made again by themselves whenever
  the debtors data changes, and the old ones are deleted. He asked: always the
  current one, never a pile of old versions.

  Runs from build.js before the private files are sealed. It only works when
  the debtors report exists (Itzik's instance); anywhere else it does nothing.
  The data's fingerprint sits in data/lolos-share.json with the file names,
  so an unchanged report costs one hash and no Chrome.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PREFIX = /^lolos-open-/;

function ils(n) { return '₪ ' + Math.round(n).toLocaleString('en-US'); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function readDebts(dataPath) {
  const dir = path.join(dataPath, 'rivhit', 'rivhit');
  if (!fs.existsSync(dir)) return null;
  const debts = [];
  let sum = null;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    if (d.kind === 'debt' && +d.amount > 0) debts.push(d);
    else if (d.kind === 'sum') sum = d;
  }
  if (!debts.length) return null;
  debts.sort((a, b) => b.amount - a.amount);
  return { debts, sum };
}

function asOf(sum) {
  const m = sum && /(\d+)\.(\d+)\.(\d{2,4})/.exec(sum.period || '');
  if (m) return { d: +m[1], m: +m[2], y: m[3].length === 2 ? 2000 + +m[3] : +m[3] };
  const t = new Date((sum && sum.at) || Date.now());
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(t).split('-');
  return { d: +p[2], m: +p[1], y: +p[0] };
}

function html(data, when) {
  const total = data.debts.reduce((a, d) => a + (+d.amount || 0), 0);
  const invs = data.debts.reduce((a, d) => a + (d.inv || []).length, 0);
  const rows = data.debts.map((d, i) => {
    const lines = (d.inv || []).map(v => {
      const part = v.left != null && Math.round(v.left) !== Math.round(v.amount);
      return `<tr><td class="n">חשבונית ${esc(v.n)}</td><td class="dt">${esc(v.date)}</td><td class="a">${ils(part ? v.left : v.amount)}${part ? ` <span class="of">מתוך ${ils(v.amount)}</span>` : ''}</td></tr>`;
    }).join('');
    return `<div class="c"><div class="h"><span class="i">${i + 1}</span><b class="nm">${esc(d.name)}</b><b class="t">${ils(d.amount)}</b></div><table>${lines}</table></div>`;
  }).join('');
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@page{size:A4;margin:16mm 14mm}
body{font-family:Arial,"Liberation Sans","DejaVu Sans",sans-serif;color:#1d2735;margin:0}
h1{font-size:22pt;margin:0 0 2px}
.sub{color:#6b7684;font-size:11pt;margin-bottom:14px}
.top{background:#eef2f7;border-radius:10px;padding:12px 18px;font-size:12.5pt;margin-bottom:18px;display:flex;gap:28px;align-items:baseline}
.top b{font-size:17pt}
.c{border-bottom:1px solid #d9dee5;padding:8px 0;break-inside:avoid}
.h{display:flex;align-items:baseline;font-size:13pt}
.i{color:#8a94a3;width:28px;font-weight:400}
.nm{flex:1}
table{width:100%;border-collapse:collapse;font-size:11.5pt;margin-right:28px;width:calc(100% - 28px)}
td{padding:2px 0}
.dt{text-align:center;width:30%}
.a{text-align:left;width:30%}
.of{color:#8a94a3;font-size:9.5pt;unicode-bidi:isolate;direction:rtl}
</style></head><body>
<h1>לולוס, חשבונות פתוחים</h1>
<div class="sub">נכון ל ${when.d}.${when.m}.${when.y}, אחרי הצלבה מול הבנק</div>
<div class="top"><span>סה״כ פתוח <b>${ils(total)}</b></span><span>${data.debts.length} לקוחות</span><span>${invs} חשבוניות</span></div>
${rows}
</body></html>`;
}

function chrome() {
  for (const c of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) if (fs.existsSync(c)) return c;
  return null;
}

/*
  Returns {pdf, pages:[jpg...], date:'d.m'} or null. Never throws: a failure
  keeps whatever was there before and says so in the build log.
*/
function ensure(dataPath) {
  const data = readDebts(dataPath);
  if (!data) return null;
  const out = path.join(dataPath, 'files-private');
  const manFile = path.join(dataPath, 'lolos-share.json');
  const key = crypto.createHash('sha1').update(JSON.stringify(data) + '|v3').digest('hex').slice(0, 8);
  let man = null;
  try { man = JSON.parse(fs.readFileSync(manFile, 'utf8')); } catch (e) {}
  if (man && man.key === key && [man.pdf].concat(man.pages).every(f => fs.existsSync(path.join(out, f)))) return man;

  const when = asOf(data.sum);
  const stamp = `${when.y}-${String(when.m).padStart(2, '0')}-${String(when.d).padStart(2, '0')}-${key.slice(0, 4)}`;
  const bin = chrome();
  if (!bin) { console.error('lolos-share: no chrome'); return man; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lolos-share-'));
  try {
    fs.writeFileSync(path.join(tmp, 'p.html'), html(data, when));
    const pdfName = `lolos-open-accounts-${stamp}.pdf`;
    const pdfTmp = path.join(tmp, pdfName);
    execFileSync(bin, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
      '--user-data-dir=' + path.join(tmp, 'prof'), '--print-to-pdf=' + pdfTmp, 'file://' + path.join(tmp, 'p.html')],
      { stdio: 'ignore', timeout: 90000 });
    if (!fs.existsSync(pdfTmp) || fs.statSync(pdfTmp).size < 1000) throw new Error('empty pdf');
    const pages = execFileSync('python3', ['-c', `
import sys, pymupdf
d = pymupdf.open(sys.argv[1]); names = []
for i, p in enumerate(d):
    n = '%s-%d.jpg' % (sys.argv[3], i + 1)
    p.get_pixmap(dpi=180).save(sys.argv[2] + '/' + n, jpg_quality=88)
    names.append(n)
print('\\n'.join(names))
`, pdfTmp, tmp, `lolos-open-${stamp}`], { encoding: 'utf8', timeout: 60000 }).trim().split('\n').filter(Boolean);
    fs.mkdirSync(out, { recursive: true });
    // The old versions go only after the new ones are ready.
    for (const f of fs.readdirSync(out)) if (PREFIX.test(f)) fs.unlinkSync(path.join(out, f));
    for (const f of [pdfName].concat(pages)) fs.copyFileSync(path.join(tmp, f), path.join(out, f));
    man = { key, pdf: pdfName, pages, date: `${when.d}.${when.m}`, at: new Date().toISOString() };
    fs.writeFileSync(manFile, JSON.stringify(man, null, 1) + '\n');
    console.log('lolos-share: new', pdfName, pages.length, 'pages');
  } catch (e) {
    console.error('lolos-share:', e.message);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return man;
}

function buttons(man) {
  if (!man) return '';
  return `   <button type="button" class="yb yb1" data-r="${man.pdf}">📤 חשבונות פתוחים עד ${man.date} (PDF)</button>\n`
    + man.pages.map((p, i) => `   <button type="button" class="yb yb${(i + 1) % 4 + 1}" data-r="${p}">🖼️ כתמונה לגלריה, עמוד ${i + 1}</button>`).join('\n');
}

module.exports = { ensure, buttons, html, readDebts };
