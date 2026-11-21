// 15.11.2026: send one file (PDF as a document) to Itzik's own WhatsApp only. Never to anyone else.
// node tools/wa-send-doc.js <file> "<caption>"
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const WA = require(path.join(ROOT, 'lib', 'wa-api.js'));
const out = require(path.join(ROOT, 'lib', 'wa-out.js'));
(async function () {
  const file = process.argv[2], caption = process.argv[3] || '';
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'wa.json'), 'utf8'));
  const to = out.owner(c);
  if (!to) throw new Error('no owner');
  const mime = /\.pdf$/i.test(file) ? 'application/pdf' : /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const fd = new FormData();
  fd.append('messaging_product', 'whatsapp'); fd.append('type', mime);
  fd.append('file', new Blob([fs.readFileSync(file)], { type: mime }), path.basename(file));
  let r = await fetch(WA.base(c) + '/' + c.phoneId + '/media', { method: 'POST', headers: WA.auth(c), body: fd });
  let j = await r.json(); if (!r.ok) throw new Error('upload ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  const body = mime === 'application/pdf'
    ? { messaging_product: 'whatsapp', to, type: 'document', document: { id: j.id, filename: path.basename(file), caption } }
    : { messaging_product: 'whatsapp', to, type: 'image', image: { id: j.id, caption } };
  r = await fetch(WA.base(c) + '/' + c.phoneId + '/messages', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, WA.auth(c)), body: JSON.stringify(body) });
  j = await r.json(); if (!r.ok) throw new Error('send ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  console.log('sent', j.messages && j.messages[0].id);
})().catch(e => { console.error('err', e.message); process.exit(1); });
