'use strict';
/*
  27.10.2026, Itzik: "שים לך תזכורת לבדוק כל כמה זמן האם יש אישור".
  it-solution.co.il was bought at LiveDNS and pointed to Vercel's name servers,
  but the .il registry holds a new domain (serverHold) until it is checked.
  Every half hour (cron, no Claude) this asks a public resolver for the
  domain and then the site itself. Once the site answers, it writes one chat
  line, pushes once, and marks itself done so it never speaks again.
*/
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DOMAIN = 'it-solution.co.il';
const DONE = path.join(ROOT, 'data', 'status', 'domain-watch-done.json');

async function main() {
  if (fs.existsSync(DONE)) return;
  const r = new dns.Resolver(); r.setServers(['8.8.8.8', '1.1.1.1']);
  let ips = [];
  try { ips = await r.resolve4(DOMAIN); } catch { return console.log(new Date().toISOString(), 'not in DNS yet'); }
  let status = 0;
  try { status = (await fetch('https://' + DOMAIN + '/', { redirect: 'follow', signal: AbortSignal.timeout(20000) })).status; } catch (e) { return console.log(new Date().toISOString(), 'DNS ok', ips.join(','), 'site not answering yet:', e.message); }
  if (status !== 200) return console.log(new Date().toISOString(), 'DNS ok, site status', status);
  const at = new Date();
  const stamp = at.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  const line = { at: at.toISOString(), from: 'claude', text: 'הדומיין שוחרר: האתר נפתח בכתובת https://' + DOMAIN + ' 🎉\nאפשר להמשיך בממומן. הקישור לצ׳אט במודעות: https://' + DOMAIN + '/#chat\nבסשן הבא: להחליף את הקישור במודעות ולהקים את המייל info@' + DOMAIN + '.' };
  fs.writeFileSync(path.join(ROOT, 'data', 'chat', 'chat', stamp + '-claude-domain-live.json'), JSON.stringify(line, null, 1));
  fs.mkdirSync(path.dirname(DONE), { recursive: true });
  fs.writeFileSync(DONE, JSON.stringify({ at: at.toISOString(), ips }));
  spawnSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', timeout: 300000 });
  spawnSync('node', ['push.js', 'domain-watch: ' + DOMAIN + ' is live'], { cwd: ROOT, stdio: 'ignore', timeout: 300000 });
  // 27.10, Itzik: "שיגיע אישור תעדכן". The ad links move to the new domain on the PC (Chrome, Ads Manager).
  const job = 'הדומיין it-solution.co.il שוחרר ונפתח. לעדכן את 4 המודעות בקמפיין "ITsolution דף חדש 27.10" (campaign 52556959006764, adset 52556959014964, act_191762840889782) כך שהקישור יהיה לדומיין החדש. '
    + 'בכרום (Profile 4) לפתוח את מנהל המודעות, ובכל אחת מהמודעות 52556961240364 (ref ads-assistant), 52556961257764 (ads-stuck), 52556961282964 (ads-emails), 52556961355164 (ads-base44): '
    + 'ליצור קריאייטיב חדש זהה לקיים (אותו page_id 1341874565686928, video_id, image_url, title, message, LEARN_MORE) רק עם הקישור https://it-solution.co.il/?ref=<ref>#chat, ולהחליף אותו במודעה. '
    + 'באותה עריכה להחליף גם את הסרטון בגרסה עם הפתיחה המתוקנת (27.10, בלי מסך לבן): ads-assistant מ C:/Users/User/Downloads/ITsolution-ads/v/v1.mp4, ads-stuck מ v/v2.mp4, ads-emails מ m/M4-feed.mp4 (סטורי m/M4-story.mp4), ads-base44 מ m/M1-feed.mp4 (סטורי m/M1-story.mp4). לא להעלות שום מודעת נרות. '
    + 'לא להפעיל את הקמפיין ולא לשנות תקציב, מיקומים או סטטוס. בלי אינסטגרם. קודם לוודא בדפדפן ש https://it-solution.co.il/#chat נפתח עם הצ׳אט. '
    + 'בסוף לבדוק שבכל 4 המודעות הקישור החדש, ולענות לאיציק שורה אחת: הקישורים עודכנו, הקמפיין מושהה ומחכה שיפעיל.';
  spawnSync(process.execPath, ['pc-task.js', 'add', '--re', 'domain-watch', job], { cwd: ROOT, stdio: 'ignore', timeout: 60000 });
  spawnSync('node', ['notify.js', 'הדומיין שוחרר', 'האתר נפתח ב ' + DOMAIN + '. המחשב מעדכן עכשיו את הקישורים במודעות.'], { cwd: ROOT, stdio: 'ignore', timeout: 60000 });
  console.log(at.toISOString(), 'LIVE', ips.join(','));
}
main().catch((e) => console.log(new Date().toISOString(), 'error', e.message));
