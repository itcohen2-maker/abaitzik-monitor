'use strict';
/*
  10.11.2026, Itzik: "תן הודעה הסרטונים מוכנים". When a held video of the AI channel (ai-queue.json, hold:true)
  gets a new file in docs/ai/media and the file has not changed for 10 minutes (the render finished),
  one phone push per new version, so he can look before anything is released. Cron every 10 minutes.
  Nothing here releases a hold.   node ai-ready.js --dry
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const DRY = process.argv.includes('--dry');
const INIT = process.argv.includes('--init');
const M = '/home/monitor/abaitzik-monitor';
const SEEN = '/home/monitor/ai-ready-seen.json';
let q = []; try { q = JSON.parse(fs.readFileSync('/home/monitor/ai-queue.json', 'utf8')); } catch (e) { process.exit(0); }
let seen = {}; try { seen = JSON.parse(fs.readFileSync(SEEN, 'utf8')); } catch (e) {}
const now = Date.now(), fresh = [];
q.filter((x) => x.hold && !x.posted && x.file).forEach((x) => {
  let st; try { st = fs.statSync(path.join(M, 'docs/ai', x.file)); } catch (e) { return; }
  const t = Math.floor(st.mtimeMs);
  if (now - t < 10 * 60 * 1000) return;
  if (seen[x.id] && seen[x.id] >= t) return;
  if (!INIT) fresh.push((x.name || x.id).split(' · ')[0]);
  seen[x.id] = t;
});
if (fresh.length) {
  const body = (fresh.length === 1 ? 'סרטון מתוקן מוכן לבדיקה: ' : fresh.length + ' סרטונים מתוקנים מוכנים לבדיקה: ') + fresh.join(', ') + ' · מוניטור, 🎬 סרטונים, 🤖 ערוץ AI. לא עולה עד שתאשר.';
  console.log(new Date().toISOString() + ' ' + body);
  if (DRY) process.exit(0);
  try { execFileSync(process.execPath, [path.join(M, 'notify.js'), '🤖 סרטון AI מוכן', body], { cwd: M, stdio: 'inherit' }); } catch (e) {}
}
if (!DRY) fs.writeFileSync(SEEN, JSON.stringify(seen));
