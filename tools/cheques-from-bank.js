#!/usr/bin/env node
/*
  29.10, Itzik: "צ'ק עתידי שנפרע, צריך להוריד אותו מהרשימה אוטומטית מהטופס".
  The board lists every kind:cheque without `got`. This marks `got` on each
  cheque whose number shows up as a cleared cheque credit in a Bank Hapoalim
  transactions export, so it drops off Yoel's board by itself.

  Usage: node tools/cheques-from-bank.js <transactions.json>
  The file is the JSON the bank's /current-account/transactions call returns.
*/
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'rivhit', 'rivhit');
const bank = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rows = (bank.transactions || bank).filter(t => t.eventActivityTypeCode == 1 && /שיק/.test(t.activityDescription || ''));

const ymd = n => { const s = String(n); return +s.slice(6, 8) + '.' + +s.slice(4, 6) + '.' + s.slice(2, 4); };
let marked = 0;
for (const f of fs.readdirSync(DIR).filter(f => /^c-.*\.json$/.test(f))) {
  const p = path.join(DIR, f);
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (c.kind !== 'cheque' || c.got) continue;
  const no = String(c.no || '').replace(/^0+/, '');
  const hit = rows.find(t => String(t.referenceNumber).replace(/^0+/, '') === no && Math.abs(+t.eventAmount - +c.amount) < 0.01);
  if (!hit) continue;
  c.got = ymd(hit.eventDate);
  c.note = String(c.note || '') + ' נפרע בבנק ' + c.got + ' (סומן אוטומטית).';
  fs.writeFileSync(p, JSON.stringify(c, null, 1) + '\n');
  console.log('נפרע: ' + c.name + ' ' + c.amount + ' צ׳ק ' + c.no + ' ב ' + c.got);
  marked++;
}
console.log(marked ? marked + ' צ׳קים סומנו כנפרעו' : 'אין צ׳ק חדש שנפרע');
