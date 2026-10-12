/*
  The PC half of pc-task.js.

  Itzik, 1.10: "תבנה שהמחשב יקלוט לבד משימות מהמוניטור שהשרת מסמן לו".
  Runs every minute from a hidden scheduled task (setup-pc-pull.ps1). Most
  minutes it is one ssh call that finds nothing and exits: no Claude, no
  tokens (29.9, a Claude polling loop burned thirty million). Only when the
  server has marked a task does it start a session here, with his Chrome
  attached, and send that session's answer back to the server, which writes
  it in his thread and pushes.

  Usage: node pc-pull.js [--dry]
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

if (process.platform !== 'win32') { console.log('pc-pull runs on the PC only.'); process.exit(0); }

const HERE = __dirname;
const inst = require('./lib/instance.js');
const KEY = 'C:/Users/User/.ssh/monitor_server';
const HOST = 'root@178.105.63.97';
const REMOTE = '/home/monitor/abaitzik-monitor';
const STATUS = path.join(inst.dataPath, 'status');
const LOG = path.join(STATUS, 'pc-pull.log');
const LIVE = path.join(STATUS, 'pc-pull-live.json');
const DRY = process.argv.includes('--dry');
// Two at once is plenty for one PC and one Chrome.
const MAX_LIVE = 2;
const MAX_SESSION_MS = 30 * 60 * 1000;

function say(line) {
  const l = new Date().toISOString() + ' ' + line;
  try { fs.mkdirSync(STATUS, { recursive: true }); fs.appendFileSync(LOG, l + '\n', 'utf8'); } catch (e) {}
  console.log(l);
}
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function alive(pid) {
  try { process.kill(+pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function liveNow() {
  const live = readJson(LIVE, {});
  Object.keys(live).forEach((pid) => {
    if (!alive(pid) || Date.now() - Date.parse(live[pid].at) > MAX_SESSION_MS + 60 * 1000) delete live[pid];
  });
  try { fs.writeFileSync(LIVE, JSON.stringify(live, null, 1), 'utf8'); } catch (e) {}
  return live;
}
function setLive(pid, v) {
  const live = readJson(LIVE, {});
  if (v) live[pid] = v; else delete live[pid];
  try { fs.writeFileSync(LIVE, JSON.stringify(live, null, 1), 'utf8'); } catch (e) {}
}

// One command on the server, as the monitor user, with optional stdin.
function remote(args, input) {
  return new Promise((resolve) => {
    const cmd = 'cd ' + REMOTE + ' && sudo -u monitor node pc-task.js ' + args;
    const c = spawn('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', HOST, cmd], { windowsHide: true });
    let out = '', err = '';
    c.stdout.on('data', (b) => { out += b; });
    c.stderr.on('data', (b) => { err += b; });
    c.on('error', (e) => resolve({ code: -1, out, err: e.message }));
    c.on('close', (code) => resolve({ code, out, err }));
    c.stdin.end(input || '', 'utf8');
  });
}

function prompt(t) {
  return [
    'זו הרצה אוטומטית על המחשב של ' + inst.owner + ', עם הכרום שלו מחובר. אין אדם בצד השני של הפלט.',
    'סשן בשרת קיבל ממנו הודעה במוניטור וסימן שהיא צריכה את המחשב (דפדפן, ריווחית, קבצים כאן).',
    'אל תבקש אישור ואל תציע: תבצע עד הסוף ותאמת.',
    '',
    'כללי הבית: הפעל את הסקיל abaitzik-onboarding לפני שאתה נוגע במשהו. הכללים האדומים בתוקף.',
    '',
    'ההודעה המקורית שלו:',
    String(t.message || '(לא נמצאה)'),
    '',
    'המשימה כפי שהשרת ניסח אותה:',
    t.task,
    '',
    'חשוב:',
    '  - אל תכתוב לצ׳אט של המוניטור ואל תריץ push.js או git. התשובה שלך חוזרת לשרת לבד.',
    '  - קובץ שצריך להגיע אליו: scp ל-' + HOST + ':' + REMOTE + '/data/files-private/<שם>, ואז',
    '    ssh ... "chown monitor:monitor ' + REMOTE + '/data/files-private/<שם>", ובתשובה כתוב files/<שם>.',
    '  - כל טאב שפתחת נסגר לפני שאתה מדפיס את התשובה, גם אם נכשלת באמצע. הוא ביקש את זה שוב ב 8.10:',
    '    טאבים שנשארים פתוחים מפריעים לו. לא סוגרים את המוניטור ולא טאב שהוא פתח בעצמו.',
    '',
    'בסוף, הדבר האחרון שאתה מדפיס: התשובה אליו, בין שתי השורות האלה בדיוק:',
    '<<<ANSWER',
    '(עד חמש שורות קצרות, עברית של יום יום, המשפט הראשון הוא התוצאה, בלי מקפים, בלי אימוג׳י, בלי שמות קבצים)',
    'ANSWER>>>',
    'אם לא הצלחת, כתוב בתוך הסימנים מה נתקע ומה הוא צריך לעשות.',
  ].join('\n');
}

// 12.10: JSON out, so each session's tokens reach the server's usage.jsonl.
function usageOf(d) {
  const models = {};
  for (const [m, u] of Object.entries(d.modelUsage || {})) {
    models[m] = { in: u.inputTokens || 0, out: u.outputTokens || 0, cr: u.cacheReadInputTokens || 0, cw: u.cacheCreationInputTokens || 0, usd: +(u.costUSD || 0).toFixed(4) };
  }
  return { usd: +(d.total_cost_usd || 0).toFixed(4), turns: d.num_turns || 0, ms: d.duration_ms || 0,
    sub: (d.subagent_stats && d.subagent_stats.spawned) || 0, models };
}

function work(t) {
  return new Promise((resolve) => {
    say('מתחיל משימה ' + t.id + ': ' + t.task.slice(0, 80));
    const child = spawn('claude', ['-p', '--chrome', '--output-format', 'json', '--dangerously-skip-permissions'], { cwd: HERE, shell: true, windowsHide: true });
    setLive(child.pid, { id: t.id, at: new Date().toISOString() });
    let out = '', err = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { err += b; });
    const timer = setTimeout(() => { say('!! עברו 30 דקות, עוצר ' + t.id); try { child.kill(); } catch (e) {} }, MAX_SESSION_MS);
    child.stdin.end(prompt(t), 'utf8');
    child.on('error', (e) => { clearTimeout(timer); setLive(child.pid, null); resolve({ ok: false, why: 'הסשן לא עלה: ' + e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      setLive(child.pid, null);
      let text = String(out), usage = null;
      try {
        const d = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
        usage = usageOf(d);
        text = String(d.result || '');
      } catch (e) {}
      const m = text.match(/<<<ANSWER\s*([\s\S]*?)\s*ANSWER>>>/g);
      const last = m && m[m.length - 1].replace(/^<<<ANSWER\s*|\s*ANSWER>>>$/g, '').trim();
      if (last) resolve({ ok: true, text: last, usage });
      else resolve({ ok: false, why: 'קוד ' + code + ', בלי תשובה. ' + (text + ' ' + err).trim().slice(-200), usage });
    });
  });
}

/*
  12.10, Itzik: "דו"ח מסכם כמה החשבון שלי עומד מה המכסה ... איזה מצב אני עומד
  לגבי המנוי שלי במאה דולר". The real numbers (the 5 hour window and the week)
  are only on Anthropic's side and need the full Claude login, which exists on
  this PC and not on the server (its token is inference only). Every 20 minutes
  the PC asks, read only, and hands the answer to the server (pc-task.js sub),
  where usage-watch.js and the morning brief read it. No Claude session, no tokens.
*/
async function subSnapshot() {
  const mark = path.join(STATUS, 'sub-last.json');
  if (Date.now() - ((readJson(mark, {}).at) || 0) < 20 * 60 * 1000) return;
  try { fs.writeFileSync(mark, JSON.stringify({ at: Date.now() })); } catch (e) {}
  try {
    const cred = readJson(path.join(process.env.USERPROFILE || 'C:/Users/User', '.claude', '.credentials.json'), {}).claudeAiOauth || {};
    if (!cred.accessToken) return;
    const r = await fetch('https://api.anthropic.com/api/oauth/usage', { headers: {
      Authorization: 'Bearer ' + cred.accessToken, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) { say('!! מצב המנוי לא נקרא: ' + r.status); return; }
    const d = await r.json();
    const w = (x) => x ? { pct: x.utilization, resets: x.resets_at } : null;
    const snap = { plan: cred.subscriptionType || '', tier: cred.rateLimitTier || '', five: w(d.five_hour), week: w(d.seven_day),
      weekOpus: w(d.seven_day_opus), weekSonnet: w(d.seven_day_sonnet), extra: d.extra_usage ? !!d.extra_usage.is_enabled : false,
      // the Claude Code sessions opened on this PC, which log nothing of their own
      pc: require('./lib/pc-claude-usage.js').pcUsage(path.join(process.env.USERPROFILE || 'C:/Users/User', '.claude', 'projects')) };
    const s = await remote('sub', JSON.stringify(snap));
    if (s.code !== 0) say('!! מצב המנוי לא נשלח: ' + s.err.trim().slice(-120));
  } catch (e) { say('!! מצב המנוי: ' + e.message); }
}

async function main() {
  if (!DRY) await subSnapshot();
  const live = liveNow();
  const room = MAX_LIVE - Object.keys(live).length;
  if (room <= 0) return;
  for (let i = 0; i < room; i++) {
    const r = await remote('next');
    if (r.code !== 0) { say('!! השרת לא ענה: ' + (r.err || r.code).toString().trim().slice(0, 200)); return; }
    const line = r.out.trim();
    if (!line) return;
    let t;
    try { t = JSON.parse(line); } catch (e) { say('!! תשובה לא מובנת מהשרת: ' + line.slice(0, 200)); return; }
    if (DRY) { say('יש משימה (dry, לא מבצע ולא מחזיר): ' + t.id); return; }
    // Each task in its own detached process, so a long one never holds the
    // scheduled task and the next minute can pick up another.
    const c = spawn(process.execPath, [__filename, '--task', Buffer.from(line).toString('base64')],
      { cwd: HERE, detached: true, stdio: 'ignore', windowsHide: true });
    c.unref();
  }
}

async function one(b64) {
  const t = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  const res = await work(t);
  if (res.usage) {
    const u = await remote('usage ' + t.id, JSON.stringify(res.usage));
    if (u.code !== 0) say('!! הצריכה לא נרשמה: ' + t.id + ' ' + u.err.trim().slice(-120));
  }
  if (res.ok) {
    const r = await remote('done ' + t.id, res.text);
    say((r.code === 0 ? 'הוחזר לשרת: ' : '!! ההחזרה נכשלה: ') + t.id + ' ' + r.err.trim().slice(-200));
  } else {
    const r = await remote('fail ' + t.id, res.why);
    say('!! ' + t.id + ' נכשל (' + r.out.trim() + '): ' + res.why.slice(0, 200));
  }
}

const ti = process.argv.indexOf('--task');
if (ti > -1) one(process.argv[ti + 1]);
else main();
