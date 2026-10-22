'use strict';
/*
  Posts the candle site's Instagram queue (candle.times) through the Instagram
  API. Itzik, 22.10: two posts and two stories a day, never on Shabbat or yom
  tov, and only what he saw in the "עולה השבוע" tile and did not stop.

  Queue: /home/monitor/ner-queue.json, a list of
    { name, date: "2026-10-22", time: "20:00", kind: "post"|"story",
      file: "media/x.mp4", caption, approved: true, hold: false }
  Media is served from docs/ner/media on GitHub Pages (docs/files is encrypted
  by gate.js, Instagram cannot fetch from there; found out 22.10).
  Token: /home/monitor/.ig-token (600, Instagram login token, 60 days).

  Cron every 10 minutes, TZ=Asia/Jerusalem. An item goes out on the first run
  after its time, if it is approved, not held, not posted yet, and less than
  three hours late. One failure = one notification, no retry loop: the item is
  marked failed and waits for a person.

  node ner-post.js --dry   prints what would go out now, posts nothing.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const QUEUE = '/home/monitor/ner-queue.json';
const TOKEN = fs.readFileSync('/home/monitor/.ig-token', 'utf8').trim();
const BASE = 'https://itcohen2-maker.github.io/abaitzik-monitor/ner/';
const API = 'https://graph.instagram.com/v23.0/';
const DRY = process.argv.includes('--dry');

function notify(t, m) {
  if (DRY) return console.log('notify:', t, m);
  try { execFileSync('node', [path.join(__dirname, 'notify.js'), t, m], { stdio: 'inherit' }); } catch (e) {}
}
function israelNow() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date());
  const g = function (k) { return p.find(function (x) { return x.type === k; }).value; };
  return { date: g('year') + '-' + g('month') + '-' + g('day'), hm: g('hour').replace('24', '00') + ':' + g('minute'), wd: g('weekday') };
}
async function call(ep, params, method) {
  const q = new URLSearchParams(Object.assign({ access_token: TOKEN }, params));
  const r = method === 'POST' ? await fetch(API + ep, { method: 'POST', body: q }) : await fetch(API + ep + '?' + q);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}
async function yomTov(date) {
  // hebcal: is this Israel date a yom tov (work forbidden)? Unknown = false, Saturday is checked separately.
  try {
    const r = await fetch('https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&i=on&start=' + date + '&end=' + date, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return (j.items || []).some(function (x) { return x.yomtov; });
  } catch (e) { return false; }
}
async function publish(it) {
  const p = { video_url: BASE + it.file };
  if (it.kind === 'story') p.media_type = 'STORIES';
  else { p.media_type = 'REELS'; p.caption = it.caption || ''; p.share_to_feed = 'true'; }
  const c = await call('me/media', p, 'POST');
  for (let i = 0; i < 40; i++) {
    await new Promise(function (r) { setTimeout(r, 6000); });
    const s = await call(c.id, { fields: 'status_code' });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('container ' + s.status_code);
  }
  const m = await call('me/media_publish', { creation_id: c.id }, 'POST');
  return m.id;
}

(async function () {
  const now = israelNow();
  if (now.wd === 'Sat' || await yomTov(now.date)) return;
  let q;
  try { q = JSON.parse(fs.readFileSync(QUEUE, 'utf8')); } catch (e) { return; }
  const late = function (it) {
    const due = Date.parse(it.date + 'T' + it.time + ':00');
    const cur = Date.parse(now.date + 'T' + now.hm + ':00');
    return cur - due;
  };
  const due = q.filter(function (it) {
    return it.approved && !it.hold && !it.posted && !it.failed && it.date === now.date && late(it) >= 0 && late(it) < 3 * 3600 * 1000;
  });
  if (!due.length) return;
  const done = [];
  for (const it of due) {
    if (DRY) { console.log('would post', it.kind, it.name, it.file); continue; }
    try { it.posted = await publish(it); it.postedAt = new Date().toISOString(); done.push(it.name); }
    catch (e) { it.failed = e.message; notify('נרות: העלאה נכשלה', it.name + ': ' + e.message); }
    fs.writeFileSync(QUEUE, JSON.stringify(q, null, 1));
  }
  if (done.length) notify('נרות: עלה לאינסטגרם', done.length + ' פריטים עלו ל candle.times: ' + done.join(', '));
})();
