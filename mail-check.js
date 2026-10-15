'use strict';
/*
  Mail check, 15.10.2026: Itzik asked for his mail every two hours until 16:00.
  Runs at 08, 10, 12, 14 and 16 Israel time, numbered for the day. Read only:
  tools/mail-search.py opens the mailbox with EXAMINE, so nothing is marked,
  moved or sent. Each check writes one line to the chat and sends a push.

  Usage: node mail-check.js        runs only at the check hours (Israel time)
         node mail-check.js --now  runs now, for a test

  The cron line runs every hour from 05 to 14 UTC, which covers 08 to 16 Israel
  in both winter and summer time. The hour filter here picks the real checks.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = __dirname;
const CHAT = path.join(ROOT, 'data/chat/chat');
const STATE = path.join(ROOT, 'data/status/mail-check.json');
const HOURS = [8, 10, 12, 14, 16];
const LINE = /^\[(\d+)\] (\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}) \| (.*)$/;

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Wall clock in Israel, as a local Date, so getHours() is the Israel hour.
function israelNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
}

function readState(day) {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
  return s.day === day ? s : { day, n: 0, seen: [] };
}

// The search prints "[uid] DD.MM.YYYY HH:MM | from" and the subject on the next line.
function parseMail(out) {
  const rows = [];
  const lines = out.split('\n');
  lines.forEach((l, i) => {
    const m = LINE.exec(l);
    if (!m) return;
    const [, uid, dd, mo, yy, hh, mi, from] = m;
    rows.push({
      uid,
      at: new Date(+yy, +mo - 1, +dd, +hh, +mi),
      from: from.replace(/<[^>]*>/g, '').trim(),
      subject: (lines[i + 1] || '').trim(),
    });
  });
  return rows;
}

function say(now, state, text, title, body) {
  const stamp = `${ymd(now)}-${hm(now).replace(':', '')}`;
  const chat = { at: now.toISOString(), from: 'claude', text };
  fs.writeFileSync(path.join(CHAT, `${stamp}-claude-mailcheck.json`), JSON.stringify(chat, null, 1) + '\n');
  spawnSync('/usr/bin/node', ['notify.js', title, body], { cwd: ROOT, stdio: 'inherit', timeout: 60000 });
  spawnSync('/usr/bin/node', ['push.js', `mail check ${state.n}`], { cwd: ROOT, stdio: 'inherit', timeout: 300000 });
}

function main() {
  const force = process.argv.includes('--now');
  const now = israelNow();
  if (!force && !HOURS.includes(now.getHours())) return;

  const state = readState(ymd(now));

  let rows;
  try {
    const out = execFileSync('/usr/bin/python3', ['-I', path.join(ROOT, 'tools/mail-search.py'), '--days', '1', '--limit', '80'],
      { encoding: 'utf8', timeout: 180000 });
    rows = parseMail(out);
  } catch (e) {
    state.n += 1;
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
    const text = `בדיקת מייל ${state.n} (${hm(now)}): לא הצלחתי לפתוח את המייל עכשיו. אנסה שוב בבדיקה הבאה.`;
    say(now, state, text, 'בדיקת מייל', 'לא נפתח המייל');
    console.error(String(e.message || e).slice(0, 500));
    process.exitCode = 1;
    return;
  }

  // The first check of the day covers since 08:00. After that, the last two hours.
  const first = state.n === 0;
  const start = first
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0)
    : new Date(now.getTime() - 2 * 3600 * 1000);
  const fresh = rows
    .filter(r => r.at >= start && r.at <= now && !state.seen.includes(r.uid))
    .sort((a, b) => (/רועי/.test(a.from) ? 0 : 1) - (/רועי/.test(b.from) ? 0 : 1) || b.at - a.at);

  state.n += 1;
  state.seen = state.seen.concat(fresh.map(r => r.uid));
  state.checkedAt = now.toISOString();
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

  const k = fresh.length;
  const text = k === 0
    ? `בדיקת מייל ${state.n}: אין חדש.`
    : `בדיקת מייל ${state.n} (${hm(now)}): ${k} מיילים חדשים.\n` +
      fresh.slice(0, 8).map(r => `${r.from}: ${r.subject}`).join('\n') +
      (k > 8 ? `\nועוד ${k - 8}.` : '');
  say(now, state, text, 'בדיקת מייל', `${k} חדשים`);
}

main();
