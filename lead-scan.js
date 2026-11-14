'use strict';
/*
  11.11.2026, Itzik: "תקים מערכת שתסרוק ותבדוק את כל הלידים שמגיעים, כי אני לא בודק את זה."
  Eran wrote "פרטים" under the paid ad and sat 14 hours unseen: comments and messages from the
  ads never reached the monitor, only the site's chat did.

  Every 10 minutes (cron, user monitor) this asks Meta, read only, for the ITsolution page:
    comments on the page's posts and on its ad posts, Messenger and Instagram conversations,
    and Instant Form leads.
  Every person who wrote becomes one lead in data/biz/biz (lib/leads.js addFound), alerted once
  (urgent push + 📋 לטיפול). The first run only fills the table, no alerts.
  What Meta refuses is written to data/status/lead-scan.json (need: [...]) and shown above the
  table, so a missing permission is never silent. Nothing is ever posted or sent from here.

  Token: /home/monitor/.fb-leads-token-itsolution if present (system user ai-poster with
  pages_read_user_content, pages_messaging, pages_manage_ads, leads_retrieval, ads_read),
  else the page token the AI channel already uses.
  --dry prints what it would add.
*/
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const inst = require('./lib/instance.js');
const leads = require('./lib/leads.js');

const PAGE = '1341874565686928';
const BUSINESS = '2131000707784066';
const G = 'https://graph.facebook.com/v23.0/';
const HOME = process.env.HOME || '/home/monitor';
const DRY = process.argv.includes('--dry');
const STATUS = path.join(inst.dataPath, 'status', 'lead-scan.json');
const INBOX = 'https://business.facebook.com/latest/inbox/all?asset_id=' + PAGE + '&business_id=' + BUSINESS;

function token() {
  for (const f of ['.fb-leads-token-itsolution', '.fb-page-token-itsolution']) {
    try { const t = fs.readFileSync(path.join(HOME, f), 'utf8').replace(/[^A-Za-z0-9]/g, ''); if (t) return { t, f }; } catch (e) { /* next */ }
  }
  return null;
}

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 20000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({ error: { message: 'bad json' } }); } });
    }).on('error', (e) => resolve({ error: { message: e.message, net: true } }))
      .on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

function needOf(err) {
  const m = String((err && err.message) || '');
  const p = /(pages_[a-z_]+|leads_retrieval|ads_read|ads_management|instagram_[a-z_]+)/.exec(m);
  return p ? p[1] : (/ads_posts|Not enough permission/i.test(m) ? 'pages_manage_ads' : 'pages_read_user_content');
}

async function scan(tk) {
  const found = []; const need = new Set(); let netErr = ''; let igOff = false; // 14.11: the page has no professional Instagram linked
  const q = (p) => get(G + p + (p.includes('?') ? '&' : '?') + 'access_token=' + tk);
  const seenErr = (j) => { if (j.error) { if (j.error.net) netErr = j.error.message; else if (/אינסטגרם|Instagram account/i.test(String(j.error.message || ''))) igOff = true; else need.add(needOf(j.error)); return true; } return false; };

  // Comments: the page's posts and its ad posts (dark posts never show in the feed).
  const cf = 'comments.limit(50){id,from,message,created_time,permalink_url}';
  for (const [edge, src] of [['feed', 'fb-comment'], ['ads_posts', 'fb-comment']]) {
    const j = await q(PAGE + '/' + edge + '?fields=id,permalink_url,' + cf + '&limit=50');
    if (seenErr(j)) continue;
    (j.data || []).forEach((post) => ((post.comments && post.comments.data) || []).forEach((c) => {
      if (!c.from || c.from.id === PAGE) return;
      found.push({ src, key: 'c:' + c.from.id, name: c.from.name, text: c.message, at: c.created_time, link: INBOX.replace('/all?', '/facebook?') });
    }));
  }
  // 14.11.2026, Itzik: "תבדוק את עיניין האינסטגרם". Comments on the Instagram side of the ads (page-backed account,
  // no username is returned, so the key is the comment id). One comment found this way had waited since 2.11.
  if (RAW) {
    const ads = await get(G + 'act_191762840889782/ads?effective_status=' + encodeURIComponent('["ACTIVE"]') + '&fields=creative{effective_instagram_media_id}&limit=100&access_token=' + RAW);
    const media = new Set(((ads && ads.data) || []).map((a) => a.creative && a.creative.effective_instagram_media_id).filter(Boolean));
    for (const m of media) {
      const j = await get(G + m + '/comments?fields=id,text,timestamp,username,from&limit=50&access_token=' + RAW);
      if (j.error) { if (j.error.net) netErr = j.error.message; continue; }
      (j.data || []).forEach((c) => found.push({ src: 'ig-comment', key: 'igc:' + c.id, name: (c.from && c.from.username) || c.username || 'מגיב באינסטגרם',
        text: c.text, at: c.timestamp, link: INBOX.replace('/all?', '/instagram?') }));
    }
  }
  // Conversations: Messenger and Instagram.
  for (const [plat, src] of [['messenger', 'messenger'], ['instagram', 'ig-dm']]) {
    const j = await q(PAGE + '/conversations?platform=' + plat + '&fields=participants,updated_time,messages.limit(1){message,from,created_time}&limit=50');
    if (seenErr(j)) continue;
    (j.data || []).forEach((cv) => {
      const who = ((cv.participants && cv.participants.data) || []).find((p) => p.id !== PAGE && p.username !== 'itsolution.ai');
      if (!who) return;
      const m = (cv.messages && cv.messages.data && cv.messages.data[0]) || {};
      found.push({ src, key: 'm:' + who.id, name: who.name || who.username, text: m.from && m.from.id === who.id ? m.message : '', at: cv.updated_time, link: INBOX.replace('/all?', '/' + plat + '?') });
    });
  }
  // Instant Form leads.
  const lf = await q(PAGE + '/leadgen_forms?fields=id,name,leads.limit(50){id,created_time,field_data}&limit=25');
  if (!seenErr(lf)) {
    (lf.data || []).forEach((form) => ((form.leads && form.leads.data) || []).forEach((l) => {
      const f = {}; (l.field_data || []).forEach((x) => { f[x.name] = (x.values || [])[0] || ''; });
      found.push({ src: 'leadform', key: 'l:' + l.id, name: f.full_name || f.first_name || 'טופס מטא', phone: f.phone_number || '', email: f.email || '',
        text: 'טופס "' + (form.name || '') + '"', at: l.created_time, link: 'https://business.facebook.com/latest/leads_center?business_id=' + BUSINESS });
    }));
  }
  return { found, need: [...need].sort(), netErr };
}

// 14.11.2026: the leads token is a system user token (ai-poster, never expires, 15 scopes incl. pages_read_user_content,
// pages_messaging, leads_retrieval). Page edges (feed, ads_posts, conversations) need the PAGE token, so it is asked for every run.
let RAW = '';
async function pageToken(tk) {
  if (!tk || tk.f !== '.fb-leads-token-itsolution') return tk;
  const j = await get(G + PAGE + '?fields=access_token&access_token=' + tk.t);
  RAW = tk.t; // 14.11: the ads (and their Instagram comments) are read with the system user token itself
  return j && j.access_token ? { t: j.access_token, f: tk.f } : tk;
}

(async () => {
  const tk = await pageToken(token());
  let prev = null; try { prev = JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch (e) { /* first run */ }
  const at = new Date().toISOString();
  if (!tk) { console.log(at + ' !! no token'); return; }
  const r = await scan(tk.t);
  if (r.netErr && !r.found.length) { console.log(at + ' !! network: ' + r.netErr + ' (retry next round)'); return; }
  // Oldest first, so the first message of a person is the one that opens the lead.
  r.found.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const first = !prev;
  const added = [];
  if (DRY) { r.found.forEach((f) => console.log('would see: ' + f.src + ' ' + f.name + ': ' + String(f.text || '').slice(0, 60))); }
  // 14.11.2026, Itzik: "אני לא פותח את האפליקציה הזאת אז אני צריך שהמנהל יאתר את ההודעות האלו". A new message from a
  // lead we already have (an answer, a phone number) is caught too, not only the first one.
  const replied = [];
  if (!DRY) r.found.forEach((f) => { const n = leads.addFound(inst.dataPath, f, (lead, line) => replied.push({ lead, line })); if (n) added.push(n); });
  const st = { at, ok: r.need.length === 0, need: r.need, token: tk.f.replace(/^\./, ''), seen: r.found.length, added: added.length };
  console.log(at + ' seen ' + r.found.length + ', new ' + added.length + (r.need.length ? ', missing: ' + r.need.join(',') : ''));
  if (DRY) return;
  fs.mkdirSync(path.dirname(STATUS), { recursive: true });
  fs.writeFileSync(STATUS, JSON.stringify(st, null, 1), 'utf8');

  if (!first) {
    added.filter((n) => !n.test).forEach((n) => { // 12.11.2026: his own phone or mail is a test, no item and no alert
      const where = leads.SOURCES[n.source] || n.source;
      try { require('./lib/handle.js').add(inst.dataPath, { key: 'lead:' + n.id, kind: 'lead', who: n.name, title: 'ליד חדש (' + where + '), לחזור אליו', link: 'biz', at: n.at, bizId: n.id }); }
      catch (e) { console.log('!! handle: ' + e.message); }
      try { console.log(execFileSync(process.execPath, ['notify.js', '--urgent', '🔔 ליד חדש: ' + n.name, where + (n.last ? ': "' + n.last.slice(0, 120) + '"' : '') + '. בעסק שלי, IT Solution, כל הלידים.'], { cwd: __dirname, encoding: 'utf8', timeout: 60000 }).trim()); }
      catch (e) { console.log('!! notify: ' + e.message); }
    });
  }
  if (!first) replied.filter((x) => !x.lead.test).forEach(({ lead, line }) => {
    const where = leads.SOURCES[lead.source] || lead.source;
    try { require('./lib/handle.js').add(inst.dataPath, { key: 'lead-msg:' + lead.id + ':' + Date.now(), kind: 'lead', who: lead.name, title: 'הודעה חדשה (' + where + '): "' + line.slice(0, 160) + '"', link: 'biz', at: new Date().toISOString(), bizId: lead.id }); }
    catch (e) { console.log('!! handle: ' + e.message); }
    try { console.log(execFileSync(process.execPath, ['notify.js', '--urgent', '💬 הודעה חדשה מ' + lead.name, where + ': "' + line.slice(0, 160) + '". בעסק שלי, IT Solution, לידים.'], { cwd: __dirname, encoding: 'utf8', timeout: 60000 }).trim()); }
    catch (e) { console.log('!! notify: ' + e.message); }
  });
  const changed = added.length || replied.length || !prev || prev.ok !== st.ok || String(prev.need) !== String(st.need);
  if (changed) {
    try { execFileSync(process.execPath, ['push.js', 'leads: scan ' + added.length + ' new'], { cwd: __dirname, stdio: 'inherit', timeout: 300000 }); }
    catch (e) { console.log('!! push: ' + e.message); }
  }
})();
