'use strict';
/*
  9.11.2026, Itzik: "בכל מקרה אנחנו צריכים לעבוד על הדברים האלה ... תכין את זה פעם אחת".
  The Instagram and Facebook page publishing core, written once for everyone: ai-post.js (our own two
  channels) and social-run.js (a customer's channels) both use it, so a fix reaches every monitor.

  A channel is { name, id, token | tokenFile, page?: { id, name, token | tokenFile } }.
    tokenFile: one line, cleaned to letters and digits (how our own token files have always been read).
    token:     a string as it is (a customer's token that came from the connect button).
  Media must be a public https address Meta can fetch (see social-media.js: a signed, short lived one for
  a customer's files, so nothing private sits in a public repo).
*/
const fs = require('fs');
const API = 'https://graph.facebook.com/v23.0/';

function tokenOf(x) {
  if (x.token) return String(x.token).trim();
  return fs.readFileSync(x.tokenFile, 'utf8').replace(/[^A-Za-z0-9]/g, '');
}
async function call(ch, ep, params, method) {
  const q = new URLSearchParams(Object.assign({ access_token: tokenOf(ch) }, params));
  const r = method === 'POST' ? await fetch(API + ep, { method: 'POST', body: q }) : await fetch(API + ep + '?' + q);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}
// One container, wait until Meta has processed it, then publish it.
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
// A video on a Facebook page, from the same public file.
async function postPage(pg, videoUrl, description) {
  const body = new URLSearchParams({ file_url: videoUrl, description: description || '', access_token: tokenOf(pg) });
  const r = await fetch(API + pg.id + '/videos', { method: 'POST', body });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.id;
}
/*
  A reel, a story and the page video, from one video. The reel must go up; the story and the page are
  tried after it and only noted when they fail (storyError, pageError), never retried in a loop.
  opts: { posterUrl, caption, noPage }
*/
async function postAll(ch, videoUrl, opts) {
  opts = opts || {};
  const out = {};
  const reel = { media_type: 'REELS', video_url: videoUrl, caption: opts.caption || '', share_to_feed: 'true' };
  if (opts.posterUrl) reel.cover_url = opts.posterUrl;
  out.reel = await publishOne(ch, reel);
  try { out.story = await publishOne(ch, { media_type: 'STORIES', video_url: videoUrl }); }
  catch (e) { out.storyError = String(e.message || e).slice(0, 200); }
  if (ch.page && !opts.noPage) {
    try { out.page = await postPage(ch.page, videoUrl, opts.caption); }
    catch (e) { out.pageError = String(e.message || e).slice(0, 200); }
  }
  return out;
}

module.exports = { API, tokenOf, call, publishOne, postPage, postAll };
