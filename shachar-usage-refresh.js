'use strict';
// 1.11: keeps "שחר: מי משתמש ומתי" fresh (cron every 2 hours). Rebuilds the monitor only when a visit was added.
const { execFile } = require('child_process');
const inst = require('./lib/instance.js').load();
const shachar = require('./lib/shachar.js');
(async () => {
  const before = (shachar.load(inst.dataPath).usage || {});
  const key = (u) => [u.visits, u.minutes, u.messages].join('|');
  const r = await shachar.handleRefresh({ dir: inst.dataPath, fetch: fetch, now: () => new Date(), notify: () => {}, rebuild: null });
  const after = (shachar.load(inst.dataPath).usage || {});
  if (!r.ok || key(before) === key(after)) return;
  await new Promise((res) => execFile(process.execPath, ['push.js', 'שחר: עדכון נתוני שימוש'], { cwd: __dirname, timeout: 240000 }, () => res()));
})().catch((e) => { console.error(e); process.exit(1); });
