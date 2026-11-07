'use strict';
/*
  7.11.2026, Itzik: "בלינקדין, קודם כל תראה לי את הפוסט ואני אאשר", and the approvals sit in
  the blinking "🔔 לאישורך" strip. Each post in data/linkedin/queue.json gets an approve card
  (data/choices, lib/approvals.js) whose question carries its id in brackets, "(li-xxxx)". The
  strip sends back "אישור: <question>" or "אישור עם תיקון: <question>\n<text>" into data/chat/chat;
  this script finds that answer by the id, marks the post approved (with his edit, if any), and
  posts it to his own profile through the LinkedIn API (Share on LinkedIn, w_member_social) on
  the first run after its time. Never on Saturday, only 08:00 to 21:00 Israel time. Nothing
  goes out without his answer. One failure = one notification, no retry loop.
  Queue item: { id, date: "2026-11-08", time: "09:00", text, approved, editedText?, posted?, failed? }
  Token: the setup page's secret (data/setup/<tok>.secrets.json, step li), 60 days, no refresh.
  Cron every 10 minutes.   node linkedin-post.js --dry   says what it would do, changes nothing.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const HERE = __dirname;
const DIR = path.join(HERE, 'data', 'linkedin');
const QUEUE = path.join(DIR, 'queue.json');
const CHAT = path.join(HERE, 'data', 'chat', 'chat');
const CHOICES = path.join(HERE, 'data', 'choices', 'choices');
const SETUP = { tok: 'f837b9adea42a6f2ceda', step: 'li' };
const DRY = process.argv.includes('--dry');
const TZ = 'Asia/Jerusalem';
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const say = (s) => console.log(new Date().toISOString().slice(0, 16) + ' ' + s);
function save(q) { if (DRY) return; fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(QUEUE + '.tmp', JSON.stringify(q, null, 1)); fs.renameSync(QUEUE + '.tmp', QUEUE); }
function notify(t, b) { if (DRY) return; try { execFileSync('node', [path.join(HERE, 'notify.js'), t, b || ''], { stdio: 'ignore', timeout: 60000 }); } catch (e) {} }
function il(now) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  const g = (k) => (p.find((x) => x.type === k) || {}).value;
  return { date: g('year') + '-' + g('month') + '-' + g('day'), hm: g('hour') + ':' + g('minute'), sat: g('weekday') === 'Sat', hour: +g('hour') };
}
function dayName(d) { const a = d.split('-'); return DAYS[new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])).getUTCDay()] + ' ' + (+a[2]) + '.' + (+a[1]); }
const firstLine = (t) => String(t).split('\n').find((x) => x.trim()) || '';

// the approve card in the "🔔 לאישורך" strip
function card(it) {
  const f = path.join(CHOICES, 'linkedin-' + it.id + '.json');
  if (fs.existsSync(f) || DRY) return false;
  fs.mkdirSync(CHOICES, { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ type: 'approve', kind: 'send', id: 'linkedin-' + it.id, at: new Date().toISOString(),
    question: 'פוסט ללינקדין, יעלה ביום ' + dayName(it.date) + ' ב ' + it.time + ' (' + it.id + '): ' + firstLine(it.text).slice(0, 70),
    preview: it.text,
    why: 'פוסט בפרופיל שלך בלינקדין. אחרי "אשר" הוא עולה לבד בזמן שכתוב. "ערוך" מעלה את הנוסח שלך במקומו. "לא עכשיו" לא מעלה כלום.' }, null, 1));
  return true;
}

// his answer from the strip, found by the id in brackets
function answer(it) {
  let files = []; try { files = fs.readdirSync(CHAT).filter((f) => f.endsWith('.json')); } catch (e) { return null; }
  const key = '(' + it.id + ')';
  let best = null;
  for (const f of files) {
    const r = rd(path.join(CHAT, f), null);
    if (!r || r.from !== 'itzik' || typeof r.text !== 'string' || r.text.indexOf(key) < 0) continue;
    const lines = r.text.split('\n');
    const i = lines.findIndex((l) => l.indexOf(key) > -1);
    const l = lines[i] || '';
    let kind = null, edited = '';
    if (/^\s*אישור עם תיקון:/.test(l)) {
      kind = 'ok';
      edited = lines.slice(i + 1).filter((x) => !/^\s*קוד\s/.test(x)).join('\n').trim();
    } else if (/^\s*אישור:/.test(l)) kind = 'ok';
    else if (/^\s*לא עכשיו:/.test(l)) kind = 'later';
    if (kind && (!best || r.at > best.at)) best = { kind, edited, at: r.at };
  }
  return best;
}

async function post(text) {
  const sec = rd(path.join(HERE, 'data', 'setup', SETUP.tok + '.secrets.json'), {});
  const v = JSON.parse(sec[SETUP.step].value);
  const H = { Authorization: 'Bearer ' + v.access_token };
  const me = await (await fetch('https://api.linkedin.com/v2/userinfo', { headers: H, signal: AbortSignal.timeout(30000) })).json();
  if (!me.sub) throw new Error('userinfo ' + JSON.stringify(me).slice(0, 120));
  const r = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: Object.assign({ 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' }, H),
    body: JSON.stringify({ author: 'urn:li:person:' + me.sub, lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: 'NONE' } },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' } }) });
  const id = r.headers.get('x-restli-id') || '';
  if (!r.ok) throw new Error('ugcPosts ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return id;
}

// the 📦 line in the 🎬 tile: counts only, the drafts themselves stay out of the public page
function mirror(q, now) {
  if (DRY) return false;
  const t = il(now).date;
  const left = q.filter((x) => !x.posted && !x.failed && x.date >= t);
  const s = JSON.stringify({ total: left.length, waiting: left.filter((x) => !x.approved).length, last: left.map((x) => x.date).sort().pop() || '' });
  const f = path.join(HERE, 'docs', 'linkedin', 'stock.json');
  let old = ''; try { old = fs.readFileSync(f, 'utf8'); } catch (e) {}
  if (old === s) return false;
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s);
  return true;
}

(async () => {
  const now = new Date();
  const T = il(now);
  const q = rd(QUEUE, []);
  let changed = false, cards = 0;
  for (const it of q) {
    if (it.posted || it.failed) continue;
    if (card(it)) cards++;
    if (!it.approved) {
      const a = answer(it);
      if (a && a.kind === 'ok') { it.approved = a.at || now.toISOString(); if (a.edited) it.editedText = a.edited; changed = true; say(it.id + ': אושר' + (a.edited ? ' עם תיקון' : '')); }
      else if (a && a.kind === 'later' && !it.later) { it.later = a.at; changed = true; say(it.id + ': לא עכשיו'); }
    }
    const due = it.date < T.date || (it.date === T.date && it.time <= T.hm);
    if (it.approved && due && !T.sat && T.hour >= 8 && T.hour < 21) {
      if (DRY) { say('DRY would post ' + it.id); continue; }
      try { it.posted = await post(it.editedText || it.text); it.postedAt = now.toISOString(); say(it.id + ': עלה ' + it.posted); notify('לינקדין: הפוסט עלה', firstLine(it.editedText || it.text).slice(0, 80)); }
      catch (e) { it.failed = e.message; say(it.id + ': נכשל ' + e.message); notify('לינקדין: פוסט לא עלה', it.id + ': ' + e.message.slice(0, 120)); }
      changed = true;
    }
  }
  if (changed) save(q);
  const m = mirror(q, now);
  if ((cards || m || changed) && !DRY) { try { execFileSync('node', [path.join(HERE, 'push.js'), 'linkedin: queue'], { stdio: 'ignore', timeout: 300000 }); } catch (e) { say('push נכשל'); } }
})();
