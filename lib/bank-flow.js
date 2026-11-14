'use strict';
/*
  14.11.2026: the monitor reads a customer's bank movements through a small program on his
  own computer (pc/bank-agent.ps1, no Claude, no AI). Itzik: "ללקוח אין מנוי קלוד על המחשב שלו".

  On WhatsApp the customer writes "בנק". His computer opens the bank's login page in a clean
  Chrome window, he logs in himself (password, SMS code), the program sees the logged in home
  page by itself, reads 90 days of movements and the balance, sends them, logs out, closes the
  window and deletes its profile. The password and the code are never asked for, stored or typed.
  "ביטול בנק" cancels; "התחברתי" is answered but not needed.

  First real run, 14.11 15:47: Itzik's own monitor, Bank Hapoalim, 115 movements, 2 accounts.

  Which bank: data/bank/config.json { bank: 'hapoalim', kind: 'private'|'business' }, written by
  setup/enable-bank.sh (asked at onboarding). Itzik's own monitor defaults to Hapoalim private.
  A customer's monitor without the file treats "בנק" as an ordinary message.

  Two paths:
    Itzik's numbers: pc-task.js add --wa --pc bank, the answer comes on WhatsApp (sendOwner).
    A customer's number (wa-bridge.js tenantMessage): a chat record "בנק" (status done, so his
    worker leaves it) and a task file with re = that record, in his monitor's own queue. The
    answer is written to his chat, and the bridge's pending watch sends it to his WhatsApp.
    setup/enable-bank.sh gives the bridge (user monitor) the ACLs it needs for that.

  After the computer is done, pc-task.js calls importDone: the file becomes
  data/bank/bank/<bank>-<time>.json (600, the shape money.js reads) and the raw upload is
  deleted. Itzik: "את הקובץ אחרי שהשתמשת אתה יכול למחוק".
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PC = 'bank';
const WAIT_MS = 20 * 60 * 1000;
// What the program on the computer can read today. The rest are named so the answer is clear.
const BANKS = {
  hapoalim: { name: 'בנק הפועלים', kinds: ['private'] },
  leumi: { name: 'בנק לאומי', kinds: [] },
  discount: { name: 'בנק דיסקונט', kinds: [] },
  mizrahi: { name: 'בנק מזרחי טפחות', kinds: [] },
  beinleumi: { name: 'הבנק הבינלאומי', kinds: [] },
  mercantile: { name: 'בנק מרכנתיל', kinds: [] },
  yahav: { name: 'בנק יהב', kinds: [] },
  massad: { name: 'בנק מסד', kinds: [] },
  otsarhahayal: { name: 'בנק אוצר החייל', kinds: [] },
  onezero: { name: 'וואן זירו', kinds: [] },
  isracard: { name: 'ישראכרט', kinds: [] },
  amex: { name: 'אמריקן אקספרס', kinds: [] },
  cal: { name: 'כאל', kinds: [] },
  max: { name: 'מקס', kinds: [] },
};
function supported(bank, kind) { return !!(BANKS[bank] && BANKS[bank].kinds.indexOf(kind) > -1); }

function norm(t) { return String(t || '').replace(/[‎‏"'״׳.!?,]/g, '').replace(/\s+/g, ' ').trim(); }
function isOpen(t) { return /^(בנק|הבנק|תוריד (את )?(ה)?בנק|עדכון בנק|תעדכן (את )?(ה)?בנק)$/.test(norm(t)); }
function isIn(t) { return /^(התחברתי|מחובר|נכנסתי|אני מחובר|התחברתי לבנק)$/.test(norm(t)); }
function isCancel(t) { return /^(ביטול בנק|בטל בנק|לבטל בנק)$/.test(norm(t)); }
function isCommand(t) { return isOpen(t) || isIn(t) || isCancel(t); }

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function stateFile(dataPath) { return path.join(dataPath, 'bank', 'session.json'); }
function readState(dataPath) { return readJson(stateFile(dataPath)); }
// 660: on a customer's monitor the bridge (monitor) and the customer's user both write it (ACL).
function writeState(dataPath, s) {
  const f = stateFile(dataPath);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(s, null, 1), { encoding: 'utf8', mode: 0o660 });
  try { fs.chmodSync(f, 0o660); } catch (e) {}
}
function bankOf(dataPath, owner) {
  const c = readJson(path.join(dataPath, 'bank', 'config.json'));
  if (c && c.bank) return { bank: String(c.bank), kind: String(c.kind || 'private') };
  return owner ? { bank: 'hapoalim', kind: 'private' } : null;
}
// The computer's heartbeat (pc-task.js next --pc bank). true, false, or null when it cannot be read.
function online(dataPath) {
  const s = readJson(path.join(dataPath, 'status', 'pc-seen-' + PC + '.json'));
  if (!s) return fs.existsSync(path.join(dataPath, 'status', 'pc-seen-' + PC + '.json')) ? null : false;
  return Date.now() - Date.parse(s.at) < 3 * 60 * 1000;
}

function queueOwner(root, bank) {
  const out = execFileSync(process.execPath, [path.join(root, 'pc-task.js'), 'add', '--wa', '--pc', PC, 'BANK:RUN ' + bank],
    { cwd: root, encoding: 'utf8', timeout: 30000 });
  return { task: out.trim().split('\n')[0] };
}
// A customer's monitor: his chat record, then the task with re = that record.
function queueTenant(dataPath, chatDir, bank) {
  const at = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const chatId = 'wa-' + at.getTime().toString(36) + crypto.randomBytes(3).toString('hex');
  const base = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-' + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds()) + '-itzik-bank';
  const rec = { at: at.toISOString(), from: 'itzik', text: 'וואטסאפ\nבנק', status: 'done', ackAt: at.toISOString(), id: chatId, auto: true, via: 'wa-bridge', bank: true };
  fs.writeFileSync(path.join(chatDir, base + '.json.tmp'), JSON.stringify(rec, null, 1), { encoding: 'utf8', mode: 0o664 });
  fs.renameSync(path.join(chatDir, base + '.json.tmp'), path.join(chatDir, base + '.json'));
  const task = 'pc-' + Date.now().toString(36) + '-' + crypto.randomBytes(2).toString('hex');
  const dir = path.join(dataPath, 'pc', 'pc');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, task + '.json');
  fs.writeFileSync(f, JSON.stringify({ id: task, re: chatId, at: at.toISOString(), task: 'BANK:RUN ' + bank, status: 'pending', tries: 0, pc: PC }, null, 1), { encoding: 'utf8', mode: 0o660 });
  try { fs.chmodSync(f, 0o660); } catch (e) {}
  return { task, chatId };
}

/*
  o: { root, dataPath, text, send, owner: true } for Itzik, or { dataPath, text, send, chatDir } for a customer.
  Returns false when the text is not ours (or a customer has no bank set up), else { chatId? }.
*/
async function waTurn(o) {
  const { dataPath, text, send } = o;
  if (!isCommand(text)) return false;
  const cfg = bankOf(dataPath, !!o.owner);
  if (!cfg) return false;
  const st = readState(dataPath);
  const fresh = st && Date.now() - Date.parse(st.at) < WAIT_MS;

  if (isCancel(text)) {
    if (st) writeState(dataPath, { stage: 'closed', at: new Date().toISOString() });
    await send('✓ ביטלתי. אם חלון הבנק עוד פתוח במחשב, אפשר פשוט לסגור אותו. הוא נסגר ונמחק לבד אחרי 15 דקות.');
    return {};
  }
  if (isIn(text)) {
    if (!fresh || st.stage !== 'waiting') return false;   // "התחברתי" with no bank session is an ordinary message
    await send('✓ אין צורך לכתוב, אני מזהה לבד שהתחברת. התשובה תגיע לכאן.');
    return {};
  }
  // "בנק"
  const b = BANKS[cfg.bank] || { name: cfg.bank };
  if (!supported(cfg.bank, cfg.kind)) {
    await send('חיבור אוטומטי ל' + b.name + (cfg.kind === 'business' ? ' בחשבון עסקי' : '') + ' עוד לא קיים. בינתיים אפשר להוריד מאתר הבנק את קובץ התנועות לאקסל ולשלוח אותו כאן.');
    return {};
  }
  if (fresh && st.stage === 'waiting') { await send('חלון הבנק כבר פתוח במחשב. מתחברים בו, ואני ממשיך לבד.'); return {}; }
  if (online(dataPath) === false) { await send('המחשב עם חיבור הבנק לא מחובר עכשיו. צריך להדליק אותו, ואז לכתוב שוב: בנק'); return {}; }
  const q = o.owner ? queueOwner(o.root, cfg.bank) : queueTenant(dataPath, o.chatDir, cfg.bank);
  writeState(dataPath, { stage: 'waiting', at: new Date().toISOString(), task: q.task, bank: cfg.bank });
  await send('🏦 בעוד רגע ייפתח במחשב חלון של ' + b.name + '. מתחברים בו בעצמך, עם הסיסמה וקוד ה SMS.' + String.fromCharCode(10) +
    'ברגע שתהיה מחובר, אני מוריד את התנועות, מתנתק וסוגר את החלון. לא צריך לכתוב לי כלום. יש 15 דקות.');
  return { chatId: q.chatId };
}

/*
  pc-task.js done, for a BANK:RUN task (run as the monitor's own user): the agent's JSON
  (files-private/pc-out/<id>/bank-*.json, account numbers masked) becomes one file in
  data/bank/bank/, { at, bank, from, to, balance, movements: [{ date, payee, amount, account, pending }] },
  and the raw upload is deleted. Returns the count of movements.
*/
function importDone(dataPath, id) {
  const dir = path.join(dataPath, 'files-private', 'pc-out', String(id).replace(/[^\w-]/g, ''));
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^bank-.*\.json$/.test(f)); } catch (e) { return 0; }
  let n = 0;
  const out = path.join(dataPath, 'bank', 'bank');
  files.forEach((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const accs = Array.isArray(d.accounts) ? d.accounts : [];
    const bal = accs.reduce((a, x) => a + (typeof x.balance === 'number' ? x.balance : 0), 0);
    const mv = [];
    accs.forEach((a) => (a.movements || []).forEach((m) => {
      if (!m || typeof m.amount !== 'number' || !/^\d{4}-\d{2}-\d{2}$/.test(String(m.date))) return;
      mv.push({ date: m.date, payee: String(m.payee || '').slice(0, 120), amount: m.amount, account: String(a.account || ''), pending: !!m.pending });
    }));
    // bank data is the owner's only: the folder 700, the file 600 (the server hosts other customers too).
    fs.mkdirSync(out, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(out, 0o700); } catch (e) {}
    fs.writeFileSync(path.join(out, f.replace(/^bank-/, String(d.bank || 'bank').replace(/[^\w-]/g, '') + '-')),
      JSON.stringify({ at: new Date().toISOString(), bank: String(d.bank || ''), from: d.from, to: d.to, balance: Math.round(bal * 100) / 100, movements: mv }, null, 1),
      { encoding: 'utf8', mode: 0o600 });
    n += mv.length;
  });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  const st = readState(dataPath);
  if (st && st.task === id) writeState(dataPath, { stage: 'closed', at: new Date().toISOString(), task: id, got: n });
  return n;
}

module.exports = { waTurn, importDone, isOpen, isIn, isCancel, isCommand, supported, bankOf, BANKS, PC };
