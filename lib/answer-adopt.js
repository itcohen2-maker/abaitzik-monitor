'use strict';
/*
  15.11.2026: a message answered through its own `reply` field (stock-check items,
  "📦 מלאי סרטונים") was never shown in the chat, and the session-end check looked only
  for chat records of mine with `re`. So the answered message was sent back to the queue
  with "הודעה נשארה בלי תשובה". This copies that reply into the chat as a record of mine
  with re = the message id: he sees it, and the check counts it as answered.
*/
const fs = require('fs');
const path = require('path');

function israelStamp(d) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return p.year + p.month + p.day + '-' + p.hour + p.minute;
}

function adoptReplies(chatDir, list, now) {
  const made = [];
  let names = [];
  try { names = fs.readdirSync(chatDir); } catch (e) { return made; }
  const answered = new Set();
  names.forEach((f) => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(chatDir, f), 'utf8'));
      if (d && d.from === 'claude' && d.re) answered.add(d.re);
    } catch (e) {}
  });
  const at = now || new Date();
  (list || []).forEach((m) => {
    if (!m || !m.id || !m.file || answered.has(m.id)) return;
    let d = null;
    try { d = JSON.parse(fs.readFileSync(path.join(chatDir, m.file), 'utf8')); } catch (e) { return; }
    const reply = String((d && d.reply) || '').trim();
    if (!reply) return;
    const stamp = israelStamp(at);
    let name = stamp + '-claude-reply.json';
    for (let i = 2; fs.existsSync(path.join(chatDir, name)); i++) name = stamp + '-claude-reply-' + i + '.json';
    fs.writeFileSync(path.join(chatDir, name),
      JSON.stringify({ at: at.toISOString(), from: 'claude', re: m.id, status: 'done', text: reply }, null, 1), 'utf8');
    answered.add(m.id);
    made.push(name);
  });
  return made;
}

module.exports = { adoptReplies };
