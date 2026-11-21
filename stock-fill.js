'use strict';
/*
  11.11.2026, Itzik: "הסטטוסים להמשך השבוע נגמרו... כמו הקנדל, זה צריך להיות מלא תמיד לשבוע מראש אוטומטי."
  stock-check.js on the server noticed the gap every morning, but its request went to a Haiku session
  that answered "not prepared yet" and closed it. Nothing was ever filled.
  This runs on the PC every morning (task AbaItzikStockFill, 06:30, hidden). It asks the server what is
  missing for the next 7 days of WhatsApp statuses (st) and candle.times (nr). Nothing missing: it ends,
  no model. Something missing: one Claude session on Sonnet (Haiku could not do this work) follows
  setup/stock-fill-method.md, then the stock is checked again and one line goes to Itzik's chat.
  node stock-fill.js --dry   only prints what is missing.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const HERE = __dirname;
const KEY = 'C:/Users/User/.ssh/monitor_server';
const HOST = 'root@178.105.63.97';
const REMOTE = '/home/monitor/abaitzik-monitor';
const LOG = path.join(HERE, 'data', 'status', 'stock-fill.log');
const LOCK = path.join(HERE, 'data', 'status', 'stock-fill.lock');
const DRY = process.argv.includes('--dry');
const MAX_MS = 100 * 60 * 1000;

function say(s) {
  const line = new Date().toISOString() + '  ' + s;
  console.log(line);
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) {}
}
function ssh(cmd, input) {
  return execFileSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', HOST, cmd],
    { encoding: 'utf8', input: input || '', windowsHide: true, timeout: 120000 });
}
function short() {
  const out = ssh('cd ' + REMOTE + ' && sudo -u monitor node stock-check.js --dry');
  return out.split('\n').filter((l) => / (st|nr): /.test(l) && /חסרים/.test(l)).map((l) => l.trim());
}
function tellChat(text) {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const p = (n) => String(n).padStart(2, '0');
  const name = il.getFullYear() + p(il.getMonth() + 1) + p(il.getDate()) + '-' + p(il.getHours()) + p(il.getMinutes()) + '-claude-stock-fill.json';
  const rec = JSON.stringify({ at: now.toISOString(), from: 'claude', text }, null, 1);
  const f = REMOTE + '/data/chat/chat/' + name;
  ssh('cat > ' + f + ' && chown monitor:monitor ' + f + ' && cd ' + REMOTE + ' && sudo -u monitor node push.js "stock fill" >/dev/null 2>&1; true', rec);
}

function main() {
  let miss;
  try { miss = short(); } catch (e) { say('!! לא הצלחתי לבדוק מלאי בשרת: ' + String(e.message).slice(0, 200)); process.exit(1); }
  if (!miss.length) { say('מלאי מלא לשבוע, אין מה להכין'); return; }
  say('חסר: ' + miss.join(' | '));
  if (DRY) return;
  try {
    const l = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    if (Date.now() - Date.parse(l.at) < MAX_MS + 600000) { say('ריצה קודמת עוד פעילה, יוצא'); return; }
  } catch (e) {}
  fs.writeFileSync(LOCK, JSON.stringify({ at: new Date().toISOString(), pid: process.pid }));
  const prompt = 'You are an unattended job on Itzik\'s PC, in ' + HERE + '. Read setup/stock-fill-method.md and follow it exactly. '
    + 'The server stock check says these queues are short for the next 7 days:\n' + miss.join('\n') + '\n'
    + 'Fill every missing day (st = WhatsApp statuses, nr = candle.times), with new media as the method says, check it, deliver, '
    + 'and run the stock check on the server again. Never post to any network, never message anyone. '
    + 'If something needs Itzik\'s decision, skip that part. Finish with ONE short Hebrew paragraph, no dashes: what you added for which days, or what you could not do and why.';
  const child = spawn('claude', ['-p', '--model', 'sonnet', '--output-format', 'json', '--dangerously-skip-permissions'],
    { cwd: HERE, shell: true, windowsHide: true });
  let out = '';
  child.stdout.on('data', (b) => { out += b; });
  const timer = setTimeout(() => { say('!! עבר הזמן, עוצר'); try { child.kill(); } catch (e) {} }, MAX_MS);
  child.stdin.end(prompt, 'utf8');
  child.on('close', (code) => {
    clearTimeout(timer);
    try { fs.unlinkSync(LOCK); } catch (e) {}
    let res = '';
    try { res = JSON.parse(out).result || ''; } catch (e) { res = out.slice(-800); }
    say('הסשן הסתיים, קוד ' + code + ': ' + String(res).replace(/\s+/g, ' ').slice(0, 400));
    let after = [];
    try { after = short(); } catch (e) {}
    const text = after.length
      ? '📦 מילוי אוטומטי של הסטטוסים והנרות: עדיין חסר. ' + after.join(' | ') + (res ? '\n' + res : '')
      : '📦 מילוי אוטומטי: הסטטוסים והנרות מלאים לשבוע הקרוב.' + (res ? '\n' + res : '');
    try { tellChat(text); } catch (e) { say('!! לא נכתב לצ׳אט: ' + String(e.message).slice(0, 200)); }
  });
}
main();
