'use strict';
/*
  Posts the AI channel reels (docs/ai, queue /home/monitor/ai-queue.json) to the two Instagram
  accounts through the Instagram API of the app "IT Solution poster".

  Itzik, 9.11.2026: "כל יום יעלה סרטון אחד", 20:00, reel and story, Hebrew to itsolution.ai,
  English to itsolution.global. Today was the exception: posted at once with --now.

  Channels (token files are 600, owner monitor, one line, no BOM):
    he -> itsolution.ai      17841456612749770   /home/monitor/.ig-token-itsolution-ai
    en -> itsolution.global  17841452824199374   /home/monitor/.ig-token-itsolution-global

  Every 10 minutes (cron, TZ=Asia/Jerusalem): per channel, from 20:00, if nothing went up today,
  take the lowest "order" item of that language that is not posted yet and post it as a reel and a story.
  Not on Saturday or yom tov. One failure = one notification and the item is marked failed, no retry loop.

    node ai-post.js --dry          prints what would go out now
    node ai-post.js --now <id>     posts that item at once (reel and story), ignores the clock
    node ai-post.js --status       prints the state of the channels
*/
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');

const QUEUE = '/home/monitor/ai-queue.json';
const STATE = '/home/monitor/ai-post-state.json';
const BASE = 'https://itcohen2-maker.github.io/abaitzik-monitor/ai/';
const API = 'https://graph.facebook.com/v23.0/';
const CHANNELS = {
  he: { name: 'itsolution.ai', id: '17841456612749770', tokenFile: '/home/monitor/.ig-token-itsolution-ai' },
  en: { name: 'itsolution.global', id: '17841452824199374', tokenFile: '/home/monitor/.ig-token-itsolution-global' }
};
const POST_HOUR = '20:00';
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
async function yomTov(date) {
  try {
    const r = await fetch('https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&i=on&start=' + date + '&end=' + date, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return (j.items || []).some(function (x) { return x.yomtov; });
  } catch (e) { return false; }
}
function token(ch) { return fs.readFileSync(ch.tokenFile, 'utf8').replace(/[^A-Za-z0-9]/g, ''); }
async function call(ch, ep, params, method) {
  const q = new URLSearchParams(Object.assign({ access_token: token(ch) }, params));
  const r = method === 'POST' ? await fetch(API + ep, { method: 'POST', body: q }) : await fetch(API + ep + '?' + q);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}
async function publishOne(ch, p) {
  const c = await call(ch, ch.id + '/media', p, 'POST');
  let ok = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(function (r) { setTimeout(r, 6000); });
    const s = await call(ch, c.id, { fields: 'status_code' });
    if (s.status_code === 'FINISHED') { ok = true; break; }
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('container ' + s.status_code);
  }
  if (!ok) throw new Error('container timeout');
  const m = await call(ch, ch.id + '/media_publish', { creation_id: c.id }, 'POST');
  return m.id;
}
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function save(q) {
  fs.writeFileSync(QUEUE, JSON.stringify(q, null, 1));
  fs.writeFileSync(path.join(__dirname, 'docs', 'ai', 'queue.json'), JSON.stringify(q, null, 1));
}
function push(msg) {
  execFile(process.execPath, ['push.js', msg], { cwd: __dirname, timeout: 180000 }, function () {});
}

async function post(it, ch, now) {
  const out = {};
  const video = BASE + it.file;
  const reel = { media_type: 'REELS', video_url: video, caption: it.ig || '', share_to_feed: 'true' };
  if (it.poster) reel.cover_url = BASE + it.poster;
  out.reel = await publishOne(ch, reel);
  try { out.story = await publishOne(ch, { media_type: 'STORIES', video_url: video }); }
  catch (e) { out.storyError = String(e.message || e).slice(0, 200); }
  return out;
}

(async function () {
  const now = israelNow();
  const q = readJson(QUEUE, null);
  if (!q) return console.log('no queue');
  const state = readJson(STATE, {});
  const nowIdx = process.argv.indexOf('--now');
  const forced = nowIdx > -1 ? process.argv[nowIdx + 1] : null;

  if (process.argv.includes('--status')) {
    Object.keys(CHANNELS).forEach(function (l) {
      const left = q.filter(function (x) { return x.lang === l && !x.posted && !x.failed; }).length;
      console.log(l, CHANNELS[l].name, 'last:', state[l] || '-', 'waiting:', left);
    });
    return;
  }

  const jobs = [];
  if (forced) {
    const it = q.find(function (x) { return x.id === forced; });
    if (!it) return console.log('no such id', forced);
    if (it.posted) return console.log('already posted', forced);
    jobs.push(it);
  } else {
    if (now.wd === 'Sat' || await yomTov(now.date)) return;
    if (now.hm < POST_HOUR) return;
    Object.keys(CHANNELS).forEach(function (l) {
      if (state[l] === now.date) return;
      const next = q.filter(function (x) { return x.lang === l && !x.posted && !x.failed; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })[0];
      if (next) jobs.push(next);
    });
  }
  if (!jobs.length) return;

  for (const it of jobs) {
    const ch = CHANNELS[it.lang];
    if (!ch) continue;
    if (DRY) { console.log('would post', it.id, 'to', ch.name, BASE + it.file); continue; }
    try {
      const r = await post(it, ch, now);
      it.posted = true; it.postedAt = new Date().toISOString(); it.auto = { reel: r.reel, story: r.story || null, storyError: r.storyError || null, channel: ch.name };
      state[it.lang] = now.date;
      fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
      save(q);
      notify('ערוץ AI עלה', ch.name + ': ' + it.name + (r.story ? ' (ריל וסטורי)' : ' (ריל בלבד, הסטורי נכשל: ' + r.storyError + ')'));
    } catch (e) {
      it.failed = String(e.message || e).slice(0, 200); it.failedAt = new Date().toISOString();
      state[it.lang] = now.date;
      fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
      save(q);
      notify('ערוץ AI נכשל', ch.name + ': ' + it.name + ' | ' + it.failed);
    }
  }
  if (!DRY) push('ai channel: auto post state');
})().catch(function (e) { notify('ai-post נפל', String(e.message || e).slice(0, 200)); });
