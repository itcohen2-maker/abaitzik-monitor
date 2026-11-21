'use strict';
/*
  9.11.2026, Itzik: "בכל מקרה אנחנו צריכים ... תכין את זה פעם אחת". Automatic posting for a customer, the
  same way ai-post.js posts our own channels, run from files so a new customer needs no code:

    data/social/<id>/channels.json   { "title", "hour": "20:00", "channels": { "main": { "name", "id", "token" | "tokenFile",
                                         "page"?: { "id", "name", "token" | "tokenFile" } } } }
    data/social/<id>/queue.json      [ { "id", "name", "file", "caption", "poster"?, "channel"?: "main", "order" } ]
    data/social/<id>/media/          the videos (never in a public repo; Meta gets a signed one hour address, lib/social-media.js)
    data/social/<id>/state.json      the day each channel last posted (written here)
    data/social/<id>/status.json     what the customer's tile shows: what went up, what waits, the last problem (written here)

  Every 10 minutes (cron): per customer and channel, from the hour in channels.json, if nothing went up today,
  the lowest "order" item not posted yet goes up as a reel, a story and a page video. Not on Saturday or yom tov.
  One failure = one notification to Itzik and the item is marked failed, no retry loop.

    node social-run.js --dry                    prints what would go out now
    node social-run.js --status                 prints each customer's channels and what waits
    node social-run.js --now <id> <item id>     posts that item at once
    node social-run.js --only <id>              one customer
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const social = require('./lib/social.js');
const media = require('./lib/social-media.js');

const DRY = process.argv.includes('--dry');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const wr = (f, o) => { fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(f + '.tmp', f); };

function notify(t, m) {
  if (DRY) return console.log('notify:', t, m);
  try { execFileSync(process.execPath, [path.join(__dirname, 'notify.js'), t, m], { stdio: 'inherit' }); } catch (e) {}
}
function israelNow() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date());
  const g = (k) => p.find((x) => x.type === k).value;
  return { date: g('year') + '-' + g('month') + '-' + g('day'), hm: g('hour').replace('24', '00') + ':' + g('minute'), wd: g('weekday') };
}
async function yomTov(date) {
  try {
    const r = await fetch('https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&i=on&start=' + date + '&end=' + date, { signal: AbortSignal.timeout(8000) });
    return ((await r.json()).items || []).some((x) => x.yomtov);
  } catch (e) { return false; }
}

const waiting = (q, ch) => q.filter((x) => (x.channel || 'main') === ch && !x.posted && !x.failed).sort((a, b) => (a.order || 0) - (b.order || 0));

// What the customer's tile reads. Plain facts; the tile turns them into plain Hebrew.
function writeStatus(dir, cfg, q, state, problem) {
  const channels = {};
  Object.keys(cfg.channels || {}).forEach((k) => {
    const next = waiting(q, k)[0];
    channels[k] = { name: cfg.channels[k].name, last: state[k] || '', waiting: waiting(q, k).length, next: next ? { id: next.id, name: next.name } : null };
  });
  const recent = q.filter((x) => x.posted).sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt))).slice(0, 5)
    .map((x) => ({ name: x.name, at: x.postedAt, channel: (cfg.channels[x.channel || 'main'] || {}).name || '', story: !!(x.auto && x.auto.story), page: !!(x.auto && x.auto.page) }));
  const failed = q.filter((x) => x.failed).slice(-3).map((x) => ({ name: x.name, at: x.failedAt, why: x.failed }));
  wr(path.join(dir, 'status.json'), { at: new Date().toISOString(), hour: cfg.hour || '20:00', channels, recent, failed, problem: problem || '' });
}

async function postItem(id, dir, cfg, q, state, it, now) {
  const ch = (cfg.channels || {})[it.channel || 'main'];
  if (!ch) return console.log(id, 'no channel', it.channel);
  if (!fs.existsSync(path.join(dir, 'media', it.file))) {
    it.failed = 'הקובץ לא נמצא: ' + it.file; it.failedAt = new Date().toISOString();
    wr(path.join(dir, 'queue.json'), q); writeStatus(dir, cfg, q, state);
    return notify('פרסום ללקוח נכשל', (cfg.title || id) + ': ' + it.name + ' | ' + it.failed);
  }
  if (DRY) return console.log('would post', id, it.id, 'to', ch.name, media.url(id, it.file).replace(/\/[a-f0-9]{32}\//, '/<sig>/'));
  const key = it.channel || 'main';
  try {
    const r = await social.postAll(ch, media.url(id, it.file, 3 * 3600), { caption: it.caption || '', posterUrl: it.poster ? media.url(id, it.poster, 3 * 3600) : '' });
    it.posted = true; it.postedAt = new Date().toISOString();
    it.auto = { reel: r.reel, story: r.story || null, storyError: r.storyError || null, page: r.page || null, pageError: r.pageError || null, channel: ch.name };
    state[key] = now.date; wr(path.join(dir, 'state.json'), state);
    wr(path.join(dir, 'queue.json'), q); writeStatus(dir, cfg, q, state);
    notify('פרסום ללקוח עלה', (cfg.title || id) + ' | ' + ch.name + ': ' + it.name + (r.story ? ' (ריל וסטורי)' : ' (ריל בלבד, הסטורי נכשל)') + (ch.page ? (r.page ? ', וגם בדף' : ', הדף נכשל') : ''));
  } catch (e) {
    it.failed = String(e.message || e).slice(0, 200); it.failedAt = new Date().toISOString();
    state[key] = now.date; wr(path.join(dir, 'state.json'), state);
    wr(path.join(dir, 'queue.json'), q); writeStatus(dir, cfg, q, state, it.failed);
    notify('פרסום ללקוח נכשל', (cfg.title || id) + ' | ' + ch.name + ': ' + it.name + ' | ' + it.failed);
  }
}

(async function () {
  const root = media.ROOT;
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
  const only = arg('--only');
  let ids = []; try { ids = fs.readdirSync(root).filter((d) => /^[a-z0-9-]{1,30}$/.test(d) && fs.existsSync(path.join(root, d, 'channels.json'))); } catch (e) {}
  if (only) ids = ids.filter((d) => d === only);
  if (!ids.length) return console.log('no customer with data/social/<id>/channels.json');
  const now = israelNow();

  if (process.argv.includes('--status')) {
    ids.forEach((id) => {
      const dir = path.join(root, id), cfg = rd(path.join(dir, 'channels.json'), {}), q = rd(path.join(dir, 'queue.json'), []), st = rd(path.join(dir, 'state.json'), {});
      Object.keys(cfg.channels || {}).forEach((k) => console.log(id, k, (cfg.channels[k] || {}).name, 'last:', st[k] || '-', 'waiting:', waiting(q, k).length));
    });
    return;
  }

  const forced = process.argv.indexOf('--now') > -1;
  if (!forced && (now.wd === 'Sat' || await yomTov(now.date))) return;
  for (const id of ids) {
    const dir = path.join(root, id), cfg = rd(path.join(dir, 'channels.json'), {}), q = rd(path.join(dir, 'queue.json'), []), state = rd(path.join(dir, 'state.json'), {});
    if (forced) {
      if (process.argv[process.argv.indexOf('--now') + 1] !== id) continue;
      const it = q.find((x) => x.id === process.argv[process.argv.indexOf('--now') + 2]);
      if (!it) { console.log('no such item'); continue; }
      if (it.posted) { console.log('already posted'); continue; }
      await postItem(id, dir, cfg, q, state, it, now);
      continue;
    }
    if (now.hm < (cfg.hour || '20:00')) { if (!DRY) writeStatus(dir, cfg, q, state); continue; }
    for (const k of Object.keys(cfg.channels || {})) {
      if (state[k] === now.date) continue;
      const it = waiting(q, k)[0];
      if (it) await postItem(id, dir, cfg, q, state, it, now);
    }
    if (!DRY) writeStatus(dir, cfg, q, state);
  }
})().catch((e) => notify('social-run נפל', String(e.message || e).slice(0, 200)));
