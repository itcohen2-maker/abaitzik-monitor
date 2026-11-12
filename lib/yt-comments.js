'use strict';
/*
  12.11.2026, Itzik: "▶️ יוטיוב" in 🔌 חיבורים reads the public comments of the customer's channel, read only.
  No OAuth: the customer gives a link to the channel (or a video, or @handle) and we read public comments with our
  own API key (YT_API_KEY in /etc/monitor.env, project it-solution-monitor, YouTube Data API v3 only).
  Files, in the monitor's own data/: yt/channel.json { input, at, id, title, err } and yt/comments.json
  { at, items:[{ id, at, author, text, video, vtitle, replies, likes, q, lead, url }] }.
  YouTube API terms: stored comment data is kept at most 30 days, so older items are dropped on every run.
  Nothing is ever posted, liked or answered.
*/
const fs = require('fs');
const path = require('path');

const API = 'https://www.googleapis.com/youtube/v3/';
const KEEP_DAYS = 30;
const MAX = 200;

const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

// What kind of link did the customer give?
function parseInput(s) {
  s = String(s || '').trim();
  let m;
  if ((m = /(?:^|\/channel\/)(UC[A-Za-z0-9_-]{22})(?:$|[/?#])/.exec(s))) return { kind: 'id', v: m[1] };
  if ((m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(s))) return { kind: 'video', v: m[1] };
  if ((m = /(?:^|youtube\.com\/)@([A-Za-z0-9._\-֐-׿]{2,100})/.exec(s))) return { kind: 'handle', v: '@' + m[1] };
  if ((m = /youtube\.com\/user\/([A-Za-z0-9_-]{2,60})/.exec(s))) return { kind: 'user', v: m[1] };
  return null;
}

const QW = /^(?:איך|מה|למה|כמה|איפה|מתי|האם|יש|אפשר|מישהו|מאיפה|באיזה|איזה|איזו|how|what|why|where|when|can|is|are|do|does)(?=[\s,.!]|$)/i;
const LEAD = /(מחיר|כמה עולה|כמה זה עולה|עלות|להזמין|הזמנה|טלפון|וואטסאפ|ווטסאפ|ואטסאפ|פרטים|ליצור קשר|צור קשר|לקבוע|תור|מעוניין|מעוניינת|רוצה לקנות|איפה קונים|price|how much|contact|whatsapp)/i;
function isQuestion(t) { t = String(t || '').trim(); return /\?|؟/.test(t) || QW.test(t); }
function isLead(t) { return LEAD.test(String(t || '')); }

async function get(fetchImpl, ep, params, key) {
  const u = API + ep + '?' + new URLSearchParams(Object.assign({}, params, { key })).toString();
  const r = await fetchImpl(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || ('http ' + r.status)); e.status = r.status; e.reason = j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason; throw e; }
  return j;
}

async function resolve(fetchImpl, key, input) {
  const p = parseInput(input);
  if (!p) return { err: 'לא זיהיתי קישור לערוץ. אפשר להדביק קישור לערוץ, לסרטון, או @שם הערוץ.' };
  let id = p.kind === 'id' ? p.v : '';
  if (p.kind === 'video') {
    const v = await get(fetchImpl, 'videos', { part: 'snippet', id: p.v }, key);
    id = v.items && v.items[0] && v.items[0].snippet.channelId || '';
  }
  const q = id ? { id } : p.kind === 'handle' ? { forHandle: p.v } : p.kind === 'user' ? { forUsername: p.v } : null;
  if (!q) return { err: 'לא מצאתי את הערוץ מהקישור הזה.' };
  const c = await get(fetchImpl, 'channels', Object.assign({ part: 'snippet' }, q), key);
  const it = c.items && c.items[0];
  if (!it) return { err: 'לא מצאתי את הערוץ מהקישור הזה.' };
  return { id: it.id, title: it.snippet.title || '' };
}

function merge(old, fresh, now) {
  const cut = (now || Date.now()) - KEEP_DAYS * 864e5;
  const by = {};
  (old || []).concat(fresh || []).forEach((x) => { if (x && x.id && Date.parse(x.at) >= cut) by[x.id] = Object.assign(by[x.id] || {}, x); });
  return Object.values(by).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, MAX);
}

async function comments(fetchImpl, key, channelId) {
  const j = await get(fetchImpl, 'commentThreads', { part: 'snippet', allThreadsRelatedToChannelId: channelId, order: 'time', maxResults: '50', textFormat: 'plainText' }, key);
  const items = (j.items || []).map((t) => {
    const s = t.snippet || {}, c = (s.topLevelComment && s.topLevelComment.snippet) || {};
    const text = String(c.textOriginal || c.textDisplay || '').slice(0, 1200);
    return {
      id: t.id, at: c.publishedAt || '', author: String(c.authorDisplayName || '').slice(0, 80), text,
      video: s.videoId || c.videoId || '', replies: s.totalReplyCount || 0, likes: c.likeCount || 0,
      q: isQuestion(text), lead: isLead(text),
      url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(s.videoId || c.videoId || '') + '&lc=' + encodeURIComponent(t.id),
    };
  });
  const vids = [...new Set(items.map((x) => x.video).filter(Boolean))].slice(0, 50);
  if (vids.length) {
    try {
      const v = await get(fetchImpl, 'videos', { part: 'snippet', id: vids.join(',') }, key);
      const T = {}; (v.items || []).forEach((x) => { T[x.id] = x.snippet && x.snippet.title || ''; });
      items.forEach((x) => { x.vtitle = String(T[x.video] || '').slice(0, 120); });
    } catch (e) { /* titles are a nicety */ }
  }
  return items;
}

// One monitor's run. Returns { changed, err }. Writes only into dataPath/yt.
async function run(dataPath, key, opts) {
  const o = opts || {}, f = o.fetch || fetch, now = o.now || Date.now();
  const dir = path.join(dataPath, 'yt');
  const chF = path.join(dir, 'channel.json'), coF = path.join(dir, 'comments.json');
  const ch = rd(chF);
  if (!ch || !ch.input) return { changed: false };
  let changed = false;
  const write = (file, obj) => { fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 1)); fs.renameSync(file + '.tmp', file); if (o.chown) o.chown(file); };
  if (!ch.id || ch.resolvedFor !== ch.input) {
    let r; try { r = await resolve(f, key, ch.input); } catch (e) { r = { err: 'יוטיוב לא ענה עכשיו, ננסה שוב בעוד רבע שעה.' }; }
    const next = Object.assign({}, ch, { resolvedFor: ch.input, id: r.id || '', title: r.title || '', err: r.err || '', checkedAt: new Date(now).toISOString() });
    write(chF, next); changed = true;
    if (!next.id) return { changed, err: next.err };
    Object.assign(ch, next);
    // a new channel: the old channel's comments go
    try { const old = rd(coF); if (old && old.ch && old.ch !== ch.id) fs.unlinkSync(coF); } catch (e) {}
  }
  let fresh;
  try { fresh = await comments(f, key, ch.id); }
  catch (e) {
    // comments turned off on the channel is not a fault of ours
    if (e.reason === 'commentsDisabled') { fresh = []; } else return { changed, err: e.message };
  }
  const old = rd(coF) || { items: [] };
  const items = merge(old.items, fresh, now);
  const same = JSON.stringify(items) === JSON.stringify(old.items || []);
  if (!same || old.ch !== ch.id) { write(coF, { at: new Date(now).toISOString(), ch: ch.id, items }); changed = true; }
  else if (!same) changed = true;
  return { changed };
}

// For the page (D.yt): the channel and the newest comments.
function forPage(dataPath) {
  const ch = rd(path.join(dataPath, 'yt', 'channel.json'));
  if (!ch || !ch.input) return null;
  const co = rd(path.join(dataPath, 'yt', 'comments.json')) || { items: [] };
  const cut = Date.now() - KEEP_DAYS * 864e5;
  return {
    ch: { input: String(ch.input).slice(0, 200), title: ch.title || '', err: ch.err || '', ok: !!ch.id },
    at: co.at || '', items: (co.items || []).filter((x) => Date.parse(x.at) >= cut).slice(0, 60),
  };
}

// The listener's message from the 🔌 sheet: "▶️ ערוץ יוטיוב: <link>" (or "הסרה").
function parseMsg(text) {
  const m = /^\s*(?:משימה)?\s*(?:▶️|▶)?\s*ערוץ יוטיוב\s*[:：]\s*(\S[^\n]*)/.exec(String(text || ''));
  return m ? m[1].trim().slice(0, 300) : null;
}
function setChannel(dataPath, input) {
  const dir = path.join(dataPath, 'yt');
  fs.mkdirSync(dir, { recursive: true });
  if (/^(?:הסרה|הסר|ניתוק)$/.test(input)) {
    for (const n of ['channel.json', 'comments.json']) { try { fs.unlinkSync(path.join(dir, n)); } catch (e) {} }
    return { ok: true, removed: true };
  }
  if (!parseInput(input)) return { ok: false, reply: 'לא זיהיתי קישור לערוץ יוטיוב. אפשר להדביק קישור לערוץ, לסרטון, או @שם הערוץ.' };
  const f = path.join(dir, 'channel.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify({ input, at: new Date().toISOString() }, null, 1));
  fs.renameSync(f + '.tmp', f);
  return { ok: true };
}

module.exports = { parseInput, isQuestion, isLead, resolve, comments, merge, run, forPage, parseMsg, setChannel, KEEP_DAYS };
