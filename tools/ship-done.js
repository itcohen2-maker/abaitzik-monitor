'use strict';
/*
  "✔ טיפלתי" from the phone, written to the shared table. 6.10.2026, Home Style.

  The listener runs this, never a model: the page sends "ship-done" with the
  row id and the alert code, and this checks both against today's alerts and
  records them in handled.json next to the table. ship-brief.js and build.js
  hide a handled alert for seven days at most (lib/ship-rules.js applyHandled),
  so Rinat, Yael and Roni all count the same alerts.

  Usage: node tools/ship-done.js <id> <code> [by]
*/
const fs = require('fs');
const path = require('path');
const rules = require('../lib/ship-rules.js');

function shipDone(shipDir, id, code, by, now) {
  id = String(id || '').trim(); code = String(code || '').trim();
  if (!/^[^\n\r]{1,120}$/.test(id) || !/^[A-Z_]{2,20}$/.test(code)) throw new Error('bad id or code');
  const rows = JSON.parse(fs.readFileSync(path.join(shipDir, 'rows.json'), 'utf8'));
  let sup = {};
  try { sup = JSON.parse(fs.readFileSync(path.join(shipDir, '..', 'suppliers.json'), 'utf8')); } catch (e) { /* defaults */ }
  const at = now || new Date();
  const today = at.toLocaleDateString('sv', { timeZone: 'Asia/Jerusalem' });
  const a = rules.evaluate(rows, today, sup).find((x) => x.id === id && x.code === code);
  if (!a) throw new Error('no such alert today');
  const file = path.join(shipDir, 'handled.json');
  let handled = {};
  try { handled = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { /* first one */ }
  // Entries past the window only weigh on the file.
  for (const k of Object.keys(handled)) {
    const t = Date.parse(handled[k] && handled[k].at);
    if (!Number.isFinite(t) || at - t > (rules.HANDLED_DAYS + 1) * 86400000) delete handled[k];
  }
  handled[rules.handledKey(a)] = { id, code, at: at.toISOString(), by: String(by || 'app').slice(0, 30) };
  const tmp = file + '.' + process.pid + '.tmp';
  // Replaced whole, never edited in place: the folder lets both writers (Rinat,
  // Yael) rename into it, and the group, which is how Roni reads, only reads.
  fs.writeFileSync(tmp, JSON.stringify(handled, null, 1), { mode: 0o640 });
  fs.chmodSync(tmp, 0o640);
  fs.renameSync(tmp, file);
  return a;
}

if (require.main === module) {
  const inst = require('../lib/instance.js');
  const [id, code, by] = process.argv.slice(2);
  if (!inst.shipmentsDir || !id || !code) { console.error('usage: node tools/ship-done.js <id> <code> [by]'); process.exit(1); }
  try { const a = shipDone(inst.shipmentsDir, id, code, by || inst.name); console.log('handled ' + a.po + ' ' + a.code); }
  catch (e) { console.error('ship-done: ' + e.message); process.exit(1); }
}

module.exports = { shipDone };
