'use strict';
/*
  What was opened and not closed. Plain code, no model.

  4.11.2026, the daily WhatsApp message (wa-daily.js). Instinct's best habit is
  "you did not answer the accountant, shall I?". The monitor already holds every
  loop; this collects the ones still open:
    approvals waiting for him, leads nobody closed, a quote the client opened and
    did not sign, a form sent and not filled, his own requests still unanswered,
    and today's appointments.
  Money never appears here (24.10: debts are shown only on request, folded).

  Every item has a stable key, so the daily message can say only what is new
  (29.10, Itzik: a push is the change itself, not a headline).
*/
const fs = require('fs');
const path = require('path');
const brief = require('./brief.js');

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const WAIT_MS = 2 * HOUR;          // his request counts as stuck after two hours
const LEAD_DAYS = 14;               // an open lead older than this is history, not a loop
const CLOSED = /^(done|טופל|סגור|נסגר|לא רלוונטי|בוטל)$/;

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function clip(s, n) {
  const t = brief.noDash(String(s || '').replace(/\s+/g, ' ').trim());
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
}
function days(ms) { return Math.max(1, Math.round(ms / DAY)); }

// Quotes (sign.js): the client opened it and has not signed.
function quotes(dataPath) {
  const dir = path.join(dataPath, 'sign');
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.def.json')); } catch (e) { return []; }
  return files.map((f) => {
    const tok = f.replace(/\.def\.json$/, '');
    const def = readJson(path.join(dir, f), {});
    const st = readJson(path.join(dir, tok + '.json'), {});
    if (st.signedAt || def.archived || !(st.openedAt || def.sentAt)) return null;
    return { key: 'quote:' + tok, kind: 'quote', at: st.openedAt || def.sentAt,
      t: 'ההצעה ל' + clip(def.client, 30) + (st.openedAt ? ' נפתחה ועוד לא נחתמה' : ' נשלחה ועוד לא נפתחה') };
  }).filter(Boolean);
}

// Forms (forms.js): sent and not submitted.
function forms(dataPath) {
  const dir = path.join(dataPath, 'forms');
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.def.json')); } catch (e) { return []; }
  return files.map((f) => {
    const tok = f.replace(/\.def\.json$/, '');
    const def = readJson(path.join(dir, f), {});
    const st = readJson(path.join(dir, tok + '.json'), {});
    if (st.submittedAt || def.archived || !(st.openedAt || def.sentAt)) return null;
    return { key: 'form:' + tok, kind: 'form', at: st.openedAt || def.sentAt,
      t: 'הטופס "' + clip(def.title, 40) + '" של ' + clip(def.client, 30) + ' עוד לא מולא' };
  }).filter(Boolean);
}

// Approvals: cards on the page and change requests.
function approvals(inp, dataPath) {
  const out = brief.openApprovals(inp.choices, inp.now).map((a) => ({ key: 'appr:' + (a.id || a.question), kind: 'approve', at: a.at, t: 'מחכה לאישור שלך: ' + clip(a.question, 70) }));
  (readJson(path.join(dataPath, 'status', 'change-requests.json'), []) || []).forEach((c) => {
    if (c && c.status === 'pending') out.push({ key: 'cr:' + c.id, kind: 'approve', at: c.at, t: 'מחכה לאישור שלך: ' + clip(c.text, 70) });
  });
  return out;
}

function leads(inp) {
  return (inp.contacts || []).filter((c) => {
    const at = Date.parse(c && c.at);
    return c && c.name && !CLOSED.test(String(c.status || '').trim()) && !isNaN(at) && inp.now - at <= LEAD_DAYS * DAY;
  }).map((c) => {
    const age = inp.now - Date.parse(c.at);
    return { key: 'lead:' + (c.id || c.file || c.name), kind: 'lead', at: c.at,
      t: 'ליד פתוח: ' + clip(c.name, 30) + (c.network ? ' (' + clip(c.network, 20) + ')' : '') + (age > 2 * DAY ? ', מחכה ' + days(age) + ' ימים' : '') };
  });
}

// His own messages that have no answer yet, after two hours, within a week.
function waiting(inp) {
  const chat = inp.chat || [];
  const answered = new Set(chat.filter((x) => x.from === 'claude' && x.re).map((x) => x.re));
  return chat.filter((x) => x.from === 'itzik' && x.id && x.status !== 'done' && !answered.has(x.id)
    && !String(x.text || '').startsWith('מייל:')
    && inp.now - Date.parse(x.at) > WAIT_MS && inp.now - Date.parse(x.at) <= 7 * DAY)
    .map((x) => ({ key: 'wait:' + x.id, kind: 'wait', at: x.at, t: 'בקשה שלך עוד בלי תשובה: ' + clip(String(x.text || '').split('\n').slice(-1)[0] || x.text, 60) }));
}

function appts(inp) {
  return brief.todayAppts(inp.appts, inp.now).map((a) => ({ key: 'appt:' + a.ms + ':' + a.what, kind: 'appt', at: new Date(a.ms).toISOString(),
    t: 'היום' + (a.noTime ? '' : ' ב ' + new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(a.ms))) + ': ' + clip(a.what, 60) }));
}

// Importance order: approvals, leads, quotes, forms, his waiting requests, appointments.
function list(dataPath, now) {
  const inp = brief.gather(dataPath, now || Date.now());
  return [].concat(approvals(inp, dataPath), leads(inp), quotes(dataPath), forms(dataPath), waiting(inp), appts(inp));
}

/*
  The message. Only what is new since the last one; what was already told and is
  still open becomes one count line. Nothing new: null, and nothing is sent.
*/
const MAX_LINES = 8;
// 13.11.2026, Itzik: WhatsApp carries only what waits for his decision or answer. Leads, quotes, forms and
// appointments stay in the monitor; no updates and no dates in the message.
const REQUEST_KINDS = new Set(['approve', 'wait']);
function message(all, prevKeys, url) {
  const items = all.filter((i) => REQUEST_KINDS.has(i.kind));
  const seen = new Set(prevKeys || []);
  const fresh = items.filter((i) => !seen.has(i.key));
  if (!fresh.length) return null;
  const old = items.length - fresh.length;
  const lines = fresh.slice(0, MAX_LINES).map((i) => '• ' + i.t);
  if (fresh.length > MAX_LINES) lines.push('• ועוד ' + (fresh.length - MAX_LINES) + ' חדשים');
  let s = 'מה פתוח היום:\n' + lines.join('\n');
  if (old > 0) s += '\n\n' + (old === 1 ? 'ועוד דבר אחד ששלחתי קודם ועדיין פתוח.' : 'ועוד ' + old + ' ששלחתי קודם ועדיין פתוחים.');
  if (url) s += '\n\nהכל במוניטור: ' + url;
  s += '\nאפשר לענות כאן על כל שורה, במילים שלך.';
  return s;
}

module.exports = { list, message, quotes, forms, approvals, leads, waiting, appts, WAIT_MS };
