'use strict';
/*
  12.11.2026, Itzik: a customer's own payment, for a customer who is not on the self signup trial
  (first: Dr Shulman, setup 490 and package SMALL 700 a month, plus VAT, as a monthly standing order).
  "תכין את הגבייה שלו, אבל תן לי לדבר איתו קודם": the offer is written with "on": false and nothing
  reaches the customer's page until Itzik says to turn it on.

  The file is /srv/monitor-changes/<id>.pay.json (the same spool as the plan file, writable by monitor only):
    { on, name, email, plan, items:[{name,price}], monthly:{name,price,note}, title, text, button, paidAt, paymentId }
  Prices are before VAT (SUMIT adds it, VATIncluded false).
  The first payment is the items; the monthly standing order starts a month later on the saved card (lib/sumit.js).
*/
const fs = require('fs');
const SPOOL = '/srv/monitor-changes';

function file(id) { return SPOOL + '/' + id + '.pay.json'; }
function valid(o) {
  return !!(o && Array.isArray(o.items) && o.items.length && o.items.every((x) => x && x.name && Number(x.price) > 0)
    && o.monthly && o.monthly.name && Number(o.monthly.price) > 0);
}
function read(id) {
  if (!/^[a-z0-9-]+$/.test(String(id || ''))) return null;
  try { const o = JSON.parse(fs.readFileSync(file(id), 'utf8')); return valid(o) ? o : null; } catch (e) { return null; }
}
// Only an offer that is turned on and not paid yet is live.
function live(id) { const o = read(id); return o && o.on === true && !o.paidAt ? o : null; }
function total(o) { return o.items.reduce((s, x) => s + Number(x.price), 0); }
// What the customer's page gets (never the mail address or anything else in the file).
function view(id) {
  const o = live(id); if (!o) return null;
  return {
    title: o.title || 'תשלום על המוניטור',
    text: o.text || '',
    button: o.button || 'לתשלום מאובטח',
    lines: o.items.map((x) => ({ name: x.name, price: Number(x.price) })),
    total: total(o),
    monthlyText: 'מהחודש הבא: הוראת קבע של ' + Number(o.monthly.price) + ' ₪ לחודש בתוספת מע״מ, מתחדשת כל חודש. החשבונית מגיעה אליך למייל.',
  };
}
function markPaid(id, paymentId) {
  const o = read(id); if (!o) return;
  o.paidAt = new Date().toISOString(); o.paymentId = paymentId; o.on = false;
  fs.writeFileSync(file(id) + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(file(id) + '.tmp', file(id));
}
module.exports = { file, valid, read, live, total, view, markPaid };
