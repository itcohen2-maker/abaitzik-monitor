'use strict';
/*
  10.11.2026, Itzik: "סטורי אחד ביום מ IT Solution, פעם אנגלית ופעם עברית, אחרי שהוא עלה בערוץ שלהם",
  in his own Instagram, abaitzik (אבא איציק), and "נעלה רק בערב".

  Every 10 minutes (cron, TZ=Asia/Jerusalem), from STORY_HOUR: if a reel went up today on the AI channels
  (ai-post.js marks it posted in /home/monitor/ai-queue.json), take today's item in the language that is not
  the one used last time (Hebrew, English, Hebrew...), and post the same public file as a story in abaitzik.
  Nothing went up on the channels today (Shabbat, yom tov, empty queue): no story. One story a day at most.
  A failure is one notification and the day is marked done, never a retry loop.

  The token is the system user token of Facebook Login for Business (app IT Solution Monitor, business
  portfolio "Aba Itzik אבא איציק"), copied to /home/monitor/.ig-token-abaitzik (600, owner monitor). It never expires.
  The API cannot delete a story; one that should not be there is deleted by hand in the app, or it expires in 24 hours.

    node ai-story-abaitzik.js --dry [--date YYYY-MM-DD]   prints what would go out (and ignores the hour)
    node ai-story-abaitzik.js --now                        posts today's story at once, ignores the hour
    node ai-story-abaitzik.js --status                     prints the state
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const social = require('./lib/social.js');

const QUEUE = '/home/monitor/ai-queue.json';
const STATE = '/home/monitor/abaitzik-story-state.json';
const BASE = 'https://itcohen2-maker.github.io/abaitzik-monitor/ai/';
const CH = { name: 'abaitzik', id: '17841439995081131', tokenFile: '/home/monitor/.ig-token-abaitzik' };
const STORY_HOUR = '21:00';
const DRY = process.argv.includes('--dry');
const NOW = process.argv.includes('--now');

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function notify(t, m) {
  if (DRY) return console.log('notify:', t, m);
  try { execFileSync('node', [path.join(__dirname, 'notify.js'), t, m], { stdio: 'inherit' }); } catch (e) {}
}
function israelParts(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (k) => p.find((x) => x.type === k).value;
  return { date: g('year') + '-' + g('month') + '-' + g('day'), hm: g('hour').replace('24', '00') + ':' + g('minute') };
}
// The language not used last time; Hebrew first. When today has only the other language, that one goes.
function pick(items, lastLang) {
  const want = lastLang === 'he' ? 'en' : 'he';
  return items.find((x) => x.lang === want) || items[0] || null;
}
function todays(q, date) {
  return (Array.isArray(q) ? q : []).filter((x) => x && x.posted && x.postedAt && x.file && israelParts(new Date(x.postedAt)).date === date);
}

async function main() {
  const now = israelParts(new Date());
  const di = process.argv.indexOf('--date');
  const date = di > -1 ? process.argv[di + 1] : now.date;
  const st = readJson(STATE, {});
  if (process.argv.includes('--status')) return console.log(JSON.stringify(st));
  if (!DRY && !NOW && now.hm < STORY_HOUR) return;
  if (!DRY && st.date === date) return;
  const it = pick(todays(readJson(QUEUE, []), date), st.lastLang);
  if (!it) { if (DRY) console.log('nothing went up on the channels on', date); return; }
  const url = BASE + it.file;
  if (DRY) return console.log('would post a story in abaitzik:', it.id, '(' + it.lang + ')', url);
  if (!fs.existsSync(CH.tokenFile)) {
    fs.writeFileSync(STATE, JSON.stringify(Object.assign(st, { date, failed: 'no token file' }), null, 1));
    return notify('סטורי ב abaitzik נכשל', 'אין קובץ טוקן');
  }
  try {
    const id = await social.publishOne(CH, { media_type: 'STORIES', video_url: url });
    fs.writeFileSync(STATE, JSON.stringify({ date, lastLang: it.lang, item: it.id, story: id, at: new Date().toISOString() }, null, 1));
    notify('סטורי עלה ב abaitzik', (it.name || it.id) + (it.lang === 'he' ? ' (עברית)' : ' (אנגלית)'));
  } catch (e) {
    fs.writeFileSync(STATE, JSON.stringify(Object.assign(st, { date, failed: String(e.message || e).slice(0, 200), failedAt: new Date().toISOString() }), null, 1));
    notify('סטורי ב abaitzik נכשל', (it.name || it.id) + ' | ' + String(e.message || e).slice(0, 160));
  }
}

if (require.main === module) main().catch((e) => notify('ai-story-abaitzik נפל', String(e.message || e).slice(0, 200)));
module.exports = { pick, todays, israelParts };
