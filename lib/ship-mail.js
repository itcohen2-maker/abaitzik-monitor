'use strict';
/*
  From an e-mail to a row of the shipments table. 6.10.2026, Home Style, version 2.

  The updates reach one mailbox (Outlook, Yael's). Nothing here talks to a mail
  server: a message comes in as { id, from, subject, received, body }, and what
  comes out is what to write and what to leave for a person. The provider that
  fetches the messages is in ship-mail.js.

  The rule that matters: a mail changes a row only when it can be tied to exactly
  one row by the order number, and only forward. A status never moves back, a
  date is written only when the mail names it, and everything else is queued for
  Rinat with the mail's subject, never guessed. Every change goes into the row's
  history with the mail id, so "where did this come from" always has an answer.

  The patterns below come from the file and from the answers on the questionnaire
  (customs file numbers from ICL, 8 digits starting 62; containers are four
  letters and seven digits). No real mail has been seen yet, so a pattern that
  does not fit lands in the queue and does no harm.
*/
const ORDER = ['booking confirm', 'goods on board', 'שלחתי ניירת', 'נשלחה ניירת ללקוחה', 'בשחרור', 'משוחרר', 'במלאי'];
const STATUS_WORDS = [
  [/booking (is )?confirm|אישור בוקינג|בוקינג אושר/i, 'BOOKING CONFIRM'],
  [/on board|sailed|departed|vessel departure|הפליג|יצא מהנמל/i, 'Goods On Board'],
  [/released|customs release|שוחרר/i, 'משוחרר'],
];
const rank = (s) => ORDER.indexOf(String(s || '').trim().toLowerCase());

function isoDate(s) {
  const m = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(s);
  if (!m) return '';
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  return d.getUTCFullYear() === y && d.getUTCMonth() === Number(m[2]) - 1 ? d.toISOString().slice(0, 10) : '';
}

function extract(msg, rows) {
  const text = String(msg.subject || '') + '\n' + String(msg.body || '');
  const poSet = new Set();
  for (const r of rows) for (const p of String(r.po).split(/\s+/)) if (p) poSet.add(p);
  const pos = [...new Set((text.match(/\b[67]\d{3}\b/g) || []).filter((p) => poSet.has(p)))];
  const containers = [...new Set(text.match(/\b[A-Z]{4}\d{7}\b/g) || [])];
  const customs = [...new Set((text.match(/\b62\d{6}\b/g) || []))];
  let status = null;
  for (const [re, name] of STATUS_WORDS) if (re.test(text)) { status = name; break; }
  const etd = /ETD\s*[:\-]?\s*([0-9./-]{6,10})/i.exec(text);
  const eta = /ETA\s*[:\-]?\s*([0-9./-]{6,10})/i.exec(text);
  return { pos, containers, customs, status, etd: etd ? isoDate(etd[1]) : '', eta: eta ? isoDate(eta[1]) : '' };
}

// Returns { applied: [...], queued: [...] } and edits `rows` in place.
function apply(msgs, rows, nowIso) {
  const applied = [], queued = [];
  const seen = new Set();
  for (const h of rows) for (const e of (h.history || [])) if (e.src && e.src.startsWith('mail:')) seen.add(e.src);
  for (const msg of msgs) {
    const src = 'mail:' + msg.id;
    if (seen.has(src)) continue;
    const x = extract(msg, rows);
    const note = (reason) => queued.push({ id: msg.id, from: msg.from || '', subject: String(msg.subject || '').slice(0, 120), reason });
    if (!x.pos.length) {
      if (x.status || x.containers.length || x.customs.length) note('אין מספר הזמנה בהודעה');
      continue;
    }
    if (x.pos.length > 1) { note('כמה הזמנות בהודעה אחת: ' + x.pos.join(', ')); continue; }
    const hit = rows.filter((r) => String(r.po).split(/\s+/).includes(x.pos[0]) && !/^(במלאי|הזמנה מבוטלת)/.test(String(r.status || '')));
    if (hit.length !== 1) { note(hit.length ? 'כמה שורות פתוחות להזמנה ' + x.pos[0] : 'אין שורה פתוחה להזמנה ' + x.pos[0]); continue; }
    const row = hit[0];
    const set = (field, to) => {
      if (!to || row[field] === to) return;
      (row.history = row.history || []).push({ at: nowIso, field, from: row[field] || '', to, src });
      applied.push({ po: row.po, field, from: row[field] || '', to, src });
      row[field] = to;
    };
    if (x.status && rank(x.status) > rank(row.status)) set('status', x.status);
    else if (x.status && rank(x.status) < rank(row.status)) note('סטטוס ' + x.status + ' מאחור: בשורה כבר ' + row.status);
    if (x.etd) set('etd', x.etd);
    if (x.eta) set('eta', x.eta);
    if (x.customs.length === 1) set('customs', x.customs[0]);
    else if (x.customs.length > 1) note('כמה מספרי תיק עמילות בהודעה');
    if (x.containers.length === 1) set('container', x.containers[0]);
    else if (x.containers.length > 1) note('כמה מכולות בהודעה');
  }
  return { applied, queued };
}

module.exports = { extract, apply, isoDate };
