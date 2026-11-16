'use strict';
/*
  16.11.2026, Itzik: "אנחנו מבטיחים הצעת מחיר במוניטור ללקוחות, ועכשיו שביקשתי שיכין לי הוא מתעלם ממני".
  "תכין לי הצעת מחיר" in the chat ends here: the worker session writes the quote as JSON and runs
    node quote-draft.js <file.json>
  The draft goes into data/biz-home/quotes.json marked by: "monitor". Nothing is sent to anyone.
  The tile 🧾 הצעות מחיר comes back by itself even where it was hidden, and blinks softly until opened
  (build.js tenantTiles, lib/biz-home.js). A draft file under data/biz-home is removed after it is read.
*/
const fs = require('fs');
const path = require('path');
const inst = require('./lib/instance.js');
const BH = require('./lib/biz-home.js');

const f = process.argv[2];
if (!f) { console.error('usage: node quote-draft.js <file.json>'); process.exit(2); }
let q;
try { q = JSON.parse(fs.readFileSync(f === '-' ? 0 : f, 'utf8')); } catch (e) { console.error('לא הצלחתי לקרוא את הקובץ: ' + e.message); process.exit(2); }
const r = BH.addQuote(inst.dataPath, q, 'monitor');
if (!r) { console.error('חסר שם לקוח, או פריט עם שם, כמות ומחיר.'); process.exit(1); }
try { const full = path.resolve(f); if (full.startsWith(path.resolve(BH.dirOf(inst.dataPath))) && /draft-[^\/]*\.json$/.test(full)) fs.unlinkSync(full); } catch (e) { /* kept */ }
const net = r.items.reduce((s, it) => s + it[1] * it[2], 0) * (1 - (r.disc || 0) / 100);
const res = { ok: true, id: r.id, no: r.no, client: r.client, net: Math.round(net * 100) / 100 };
/*
  16.11.2026, Itzik: "רציתי לקבל הצעת מחיר על דף A4 עם לוגו מסודר". --pdf prints the quote as one A4 page (lib/csign.js pdfHtml,
  the business details and logo from lib/biz-home.js) into data/files-private, and prints its files/<name> link. An answer
  that names files/<name> goes to WhatsApp as the file itself (wa-bridge.js), after the text.
*/
if (process.argv.includes('--pdf')) {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const root = path.dirname(require.resolve('./lib/instance.js')).replace(/[\\/]lib$/, '');
  const html = require('./lib/csign.js').pdfHtml({ q: r, biz: BH.bizInfo(root, inst.dataPath), logo: BH.logoData(inst.dataPath) });
  const name = 'quote-' + r.no + '.pdf';
  const outDir = path.join(inst.dataPath, 'files-private');
  fs.mkdirSync(outDir, { recursive: true });
  const tmpHtml = path.join(os.tmpdir(), 'quote-' + r.id + '.html');
  fs.writeFileSync(tmpHtml, html);
  const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find((c) => { try { execFileSync('which', [c], { stdio: 'ignore' }); return true; } catch (e) { return false; } }) || 'google-chrome';
  try {
    execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=4000',
      '--user-data-dir=' + path.join(os.tmpdir(), 'qd-chrome-' + process.pid), '--print-to-pdf=' + path.join(outDir, name), 'file://' + tmpHtml], { stdio: 'ignore', timeout: 60000 });
    res.file = 'files/' + name;
  } catch (e) { res.pdfError = String(e.message).slice(0, 160); }
  try { fs.unlinkSync(tmpHtml); } catch (e) { /* gone */ }
  if (!res.file) { console.log(JSON.stringify(res)); process.exit(3); }
}
console.log(JSON.stringify(res));
