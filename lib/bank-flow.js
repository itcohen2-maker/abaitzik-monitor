'use strict';
/*
  14.11.2026, Itzik: the monitor downloads the bank movements file on a computer of
  the customer, and the customer logs in himself. "המוניטור יפתח לו את הכרום, הוא
  יתחבר, יעדכן אפילו דרך הוואטסאפ, והמוניטור יתחבר ויתנתק".

  14.11 evening, Itzik: "ללקוח אין מנוי קלוד על המחשב שלו". So the computer runs
  pc/bank-agent.ps1 (no Claude): it opens Chrome in an empty profile, waits for the login
  itself, reads the movements from the bank's own site, logs out and deletes the profile.
  "בנק" is all the customer writes; "התחברתי" is answered but no longer needed.
  The first version (below, kept for the record) ran Claude in Chrome on that computer.

  The flow, on WhatsApp, Itzik's numbers only (wa-bridge.js calls waTurn):
    "בנק"        the bank computer (pc-task.js --pc bank) opens the bank's login page in
                 Chrome. Its answer comes back on WhatsApp: "תתחבר ותכתוב התחברתי".
    "התחברתי"    within 20 minutes: Claude on that computer, with Chrome, goes to the
                 movements screen, exports the file, copies it to its out folder (which
                 goes up to the monitor), and logs out of the bank. The answer and the
                 file name come back on WhatsApp.
    "ביטול בנק"  closes the session here.
  The password and the SMS code are typed only by the customer, only on his computer.
  Nothing here or on the computer ever asks for them, stores them, or types them.

  State: data/bank/session.json { stage: 'open'|'waiting'|'download', at, task }.
  First test: Itzik's own monitor, Bank Hapoalim, the second computer (keys.json pcName "bank").
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PC = 'bank';
const WAIT_MS = 20 * 60 * 1000;
const BANK = {
  name: 'בנק הפועלים',
  login: 'https://login.bankhapoalim.co.il/ng-portals/auth/he/',
};

function norm(t) { return String(t || '').replace(/[‎‏"'״׳.!?,]/g, '').replace(/\s+/g, ' ').trim(); }
function isOpen(t) { return /^(בנק|הבנק|תוריד (את )?(ה)?בנק|עדכון בנק|תעדכן (את )?(ה)?בנק)$/.test(norm(t)); }
function isIn(t) { return /^(התחברתי|מחובר|נכנסתי|אני מחובר|התחברתי לבנק)$/.test(norm(t)); }
function isCancel(t) { return /^(ביטול בנק|בטל בנק|לבטל בנק)$/.test(norm(t)); }

function stateFile(dataPath) { return path.join(dataPath, 'bank', 'session.json'); }
function readState(dataPath) { try { return JSON.parse(fs.readFileSync(stateFile(dataPath), 'utf8')); } catch (e) { return null; } }
function writeState(dataPath, s) {
  fs.mkdirSync(path.dirname(stateFile(dataPath)), { recursive: true });
  fs.writeFileSync(stateFile(dataPath), JSON.stringify(s, null, 1), 'utf8');
}

function pcTask(root, args) {
  const out = execFileSync(process.execPath, [path.join(root, 'pc-task.js'), 'add', '--wa', '--pc', PC].concat(args),
    { cwd: root, encoding: 'utf8', timeout: 30000 });
  const lines = out.trim().split('\n');
  return { id: lines[0], on: /pc: on/.test(out) };
}
function online(root) {
  try { return /^on/.test(execFileSync(process.execPath, [path.join(root, 'pc-task.js'), 'online', '--pc', PC], { cwd: root, encoding: 'utf8', timeout: 15000 })); }
  catch (e) { return false; }
}

// Returns true when the text was a bank command (and was answered with send).
async function waTurn(o) {
  const { root, dataPath, text, send } = o;
  const st = readState(dataPath);
  const fresh = st && Date.now() - Date.parse(st.at) < WAIT_MS;

  if (isCancel(text)) {
    if (st) writeState(dataPath, { stage: 'closed', at: new Date().toISOString() });
    await send('✓ ביטלתי. אם חלון הבנק עוד פתוח במחשב, אפשר פשוט לסגור אותו. הוא נמחק לבד אחרי 15 דקות.');
    return true;
  }
  if (isOpen(text)) {
    if (fresh && st.stage === 'waiting') { await send('חלון הבנק כבר פתוח במחשב. מתחברים בו, ואני ממשיך לבד.'); return true; }
    if (!online(root)) { await send('המחשב של הבנק לא מחובר עכשיו. צריך להדליק אותו, ואז לכתוב שוב: בנק'); return true; }
    const t = pcTask(root, ['BANK:RUN']);
    writeState(dataPath, { stage: 'waiting', at: new Date().toISOString(), task: t.id });
    await send('🏦 בעוד רגע ייפתח במחשב חלון של ' + BANK.name + '. מתחברים בו בעצמך, עם הסיסמה וקוד ה SMS.' + String.fromCharCode(10) +
      'ברגע שתהיה מחובר, אני מוריד את התנועות, מתנתק וסוגר את החלון. לא צריך לכתוב לי כלום. יש 15 דקות.');
    return true;
  }
  if (isIn(text)) {
    if (!fresh || st.stage !== 'waiting') return false;   // "התחברתי" with no bank session is an ordinary message
    await send('✓ אין צורך לכתוב, אני מזהה לבד שהתחברת. התשובה תגיע לכאן.');
    return true;
  }
  return false;
}

/*
  pc-task.js done, for a BANK:RUN task: the agent's JSON (files-private/pc-out/<id>/bank-*.json,
  accounts with masked numbers) becomes one file in data/bank/bank/, the shape money.js reads:
  { at, bank, balance, movements: [{ date, payee, amount, account }] }. Returns the count.
*/
function importDone(dataPath, id) {
  const dir = path.join(dataPath, 'files-private', 'pc-out', String(id).replace(/[^\w-]/g, ''));
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^bank-.*\.json$/.test(f)); } catch (e) { return 0; }
  let n = 0;
  files.forEach((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const accs = Array.isArray(d.accounts) ? d.accounts : [];
    const bal = accs.reduce((a, x) => a + (typeof x.balance === 'number' ? x.balance : 0), 0);
    const mv = [];
    accs.forEach((a) => (a.movements || []).forEach((m) => {
      if (!m || typeof m.amount !== 'number' || !/^\d{4}-\d{2}-\d{2}$/.test(String(m.date))) return;
      mv.push({ date: m.date, payee: String(m.payee || '').slice(0, 120), amount: m.amount, account: String(a.account || ''), pending: !!m.pending });
    }));
    const out = path.join(dataPath, 'bank', 'bank');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, f.replace(/^bank-/, String(d.bank || 'bank') + '-')),
      JSON.stringify({ at: new Date().toISOString(), bank: String(d.bank || ''), from: d.from, to: d.to, balance: Math.round(bal * 100) / 100, movements: mv }, null, 1), 'utf8');
    n += mv.length;
  });
  const st = readState(dataPath);
  if (st && st.task === id) writeState(dataPath, { stage: 'closed', at: new Date().toISOString(), task: id, got: n });
  return n;
}

module.exports = { waTurn, importDone, isOpen, isIn, isCancel, PC };
