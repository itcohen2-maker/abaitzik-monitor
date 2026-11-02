'use strict';
/*
  1.11.2026, Itzik: in the client demo, when he says on WhatsApp "תוציא לי מייל
  מרונית, מה היא ביקשה", the answer comes on WhatsApp AND the mail itself (or the
  quote, the invoice) shows up on the monitor under "תשובות", with buttons:
  reply, send again, send on WhatsApp, save to the phone, PDF.

  The worker, answering inside the demo frame (wa-bridge.js), calls this to put
  what it made up on the screen. The page reads it live through wa-bridge
  (/api/feed), no rebuild needed.

    node demo-feed.js add '<json>'     one item
    node demo-feed.js clear            empty the screen (wa-bridge does it when demo turns on)
    node demo-feed.js list

  An item: { "type": "mail" | "quote" | "invoice" | "doc" | "note" | "lead" | "meeting" | "report" | "task",
             lead: "phone"; meeting: "when", "where"; report: "kpis": {"הוצאה": "₪612", ...};
             "title": "...", "from": "...", "subject": "...", "text": "...",
             "client": "...", "items": [["פריט", 1, 1000], ...] }
  quote and invoice need client and items; the page adds VAT 18% and the totals.
*/
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, 'data', 'demo', 'feed.json');
const TYPES = ['mail', 'quote', 'invoice', 'doc', 'note', 'lead', 'meeting', 'report', 'task'];

function load() { try { const a = JSON.parse(fs.readFileSync(F, 'utf8')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function save(a) { fs.mkdirSync(path.dirname(F), { recursive: true }); fs.writeFileSync(F + '.tmp', JSON.stringify(a.slice(-40), null, 1)); fs.renameSync(F + '.tmp', F); }
function clean(o) {
  if (!o || typeof o !== 'object') throw new Error('צריך אובייקט JSON');
  const type = TYPES.indexOf(o.type) > -1 ? o.type : 'note';
  const s = (v, n) => (v == null ? '' : String(v)).slice(0, n);
  const it = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), type,
    title: s(o.title, 140), from: s(o.from, 120), subject: s(o.subject, 200), text: s(o.text, 4000), client: s(o.client, 160),
    phone: s(o.phone, 40), when: s(o.when, 80), where: s(o.where, 160) };
  if (o.kpis && typeof o.kpis === 'object') { it.kpis = {}; Object.keys(o.kpis).slice(0, 8).forEach((k) => { it.kpis[s(k, 30)] = s(o.kpis[k], 30); }); }
  if (Array.isArray(o.items)) it.items = o.items.slice(0, 20).map((r) => [s(r[0], 160), Number(r[1]) || 0, Number(r[2]) || 0]).filter((r) => r[0]);
  if ((type === 'quote' || type === 'invoice') && !(it.items && it.items.length)) throw new Error('להצעת מחיר או חשבונית צריך items');
  if (!it.title) it.title = type === 'mail' ? (it.subject || 'מייל') : type === 'quote' ? 'הצעת מחיר' : type === 'invoice' ? 'חשבונית' : type === 'lead' ? 'ליד חדש' : type === 'meeting' ? 'פגישה' : type === 'report' ? 'דוח' : type === 'task' ? 'משימה' : 'עדכון';
  return it;
}

if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'add') {
    const it = clean(JSON.parse(arg || fs.readFileSync(0, 'utf8')));
    const a = load(); a.push(it); save(a);
    console.log('נוסף למסך ההדגמה: ' + it.type + ' ' + it.title);
  } else if (cmd === 'clear') { save([]); console.log('המסך נוקה'); }
  else if (cmd === 'list') { console.log(JSON.stringify(load(), null, 1)); }
  else { console.log('node demo-feed.js add <json> | clear | list'); process.exitCode = 1; }
}
module.exports = { load, save, clean };
