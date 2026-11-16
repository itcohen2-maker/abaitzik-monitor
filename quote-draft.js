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
console.log(JSON.stringify({ ok: true, id: r.id, no: r.no, client: r.client, net: Math.round(net * 100) / 100 }));
