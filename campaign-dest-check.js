'use strict';
/*
  The manager's campaign destination check. Plain code, no model.

  17.11.2026, Itzik, after the monitor ads were found sending people to the chat instead of the signup page:
  "סוכן, שהוא בודק קמפיין, והוא בודק שכל מודעה משויכת בסוף המודעה לאן שהיא צריכה ללכת. חלק לדף עם הכפתור
  של הוואטסאפ, ופרסומות של המוניטור ילכו לטופס ההרשמה. זה יהיה העבודה של הסוכן."

  Every running ad (ACTIVE, in review, with issues) in every active campaign of the IT Solution ad account:
  - a monitor ad (campaign or ad name says מוניטור, or ref m-*) must lead to https://it-solution.co.il/start/
    (a Facebook lead form is flagged too: it is not the signup page);
  - any other ad (the rescue track: Lovable, Base44, site, app) must lead to the page with the WhatsApp
    button, https://it-solution.co.il/?ref=...#chat.
  Each link is also opened once (HTTP 200).
  Writes data/status/campaign-dest.json, read by the manager card (lib/manager.js campaignDestItem).
  A new wrong ad rings once (notify.js). It only reports: changing an ad needs Itzik's "כן".
  Run: node campaign-dest-check.js   (cron every 30 minutes)
*/
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = __dirname;
const OUT = path.join(DIR, 'data', 'status', 'campaign-dest.json');
const TOKEN_FILE = '/home/monitor/.fb-ads-token-itsolution';
const SEED_CAMPAIGN = '52563094715764';
const G = 'https://graph.facebook.com/v23.0/';
const LIVE = ['ACTIVE', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES'];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 20000 }, (r) => {
      let b = ''; r.on('data', (d) => { b += d; });
      r.on('end', () => resolve({ status: r.statusCode, body: b, location: r.headers.location }));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
async function graph(p, token) {
  const r = await get(G + p + (p.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token));
  const j = JSON.parse(r.body);
  if (j.error) throw new Error(j.error.message);
  return j;
}

// the rule, kept pure so the tests can hold it
function isMonitorAd(campaignName, adName, ref) {
  // 23.11.2026: the cosmeticians campaign (ref c-beauty, c-beauty-ru) is a monitor campaign too; the alert called it a rescue ad
  return /מוניטור/.test(campaignName || '') || /מוניטור/.test(adName || '') || /^[mc]-/.test(ref || '');
}
function destOf(creative) {
  const oss = (creative && creative.object_story_spec) || {};
  const d = oss.video_data || oss.link_data || {};
  const v = (d.call_to_action && d.call_to_action.value) || {};
  if (v.lead_gen_form_id) return { form: String(v.lead_gen_form_id) };
  const link = v.link || d.link || (((creative.asset_feed_spec || {}).link_urls || [])[0] || {}).website_url || '';
  return { link };
}
function judge(campaignName, adName, dest) {
  const ref = ((dest.link || '').match(/[?&]ref=([^&#]+)/) || [])[1] || '';
  const monitor = isMonitorAd(campaignName, adName, ref);
  const want = monitor ? 'דף ההרשמה it-solution.co.il/start' : 'הדף עם כפתור הוואטסאפ it-solution.co.il/?ref=...#chat';
  if (dest.form) return { monitor, ok: false, want, got: 'טופס לידים בתוך פייסבוק (' + dest.form + ')' };
  let u = null; try { u = new URL(dest.link); } catch (e) { /* no link */ }
  if (!u) return { monitor, ok: false, want, got: 'אין קישור במודעה' };
  const host = u.hostname.replace(/^www\./, '') === 'it-solution.co.il';
  // 21.11.2026: the trades campaign (צלם, קבלן, יועץ, קוסמטיקאית) leads to /day/?ref=m-<trade>, the trade's own
  // monitor signup page (same signup button, ref kept). That is right, so /day/ counts for a monitor ad with an m- ref.
  const ok = monitor ? host && (/^\/start\/?$/.test(u.pathname) || (/^\/day\/?$/.test(u.pathname) && /^[mc]-/.test(ref)))
    : host && (u.pathname === '/' || u.pathname === '') && u.hash === '#chat' && !!ref;
  return { monitor, ok, want, got: dest.link };
}

async function main() {
  const token = fs.readFileSync(TOKEN_FILE, 'utf8').replace(/^﻿/, '').trim();
  const acct = (await graph(SEED_CAMPAIGN + '?fields=account_id', token)).account_id;
  const camps = (await graph('act_' + acct + '/campaigns?fields=id,name,effective_status&limit=100', token)).data
    .filter((c) => LIVE.includes(c.effective_status)); // IN_PROCESS: a budget change being applied, the ads still run
  const ads = [];
  for (const c of camps) {
    const list = (await graph(c.id + '/ads?fields=id,name,effective_status,creative{object_story_spec,asset_feed_spec}&limit=100', token)).data;
    for (const a of list) {
      if (!LIVE.includes(a.effective_status)) continue;
      const dest = destOf(a.creative || {});
      const j = judge(c.name, a.name, dest);
      if (j.ok) {
        try {
          const r = await get(dest.link.split('#')[0]);
          if (r.status !== 200) { j.ok = false; j.got += ' (הדף החזיר ' + r.status + ')'; }
        } catch (e) { j.ok = false; j.got += ' (הדף לא נפתח)'; }
      }
      ads.push({ id: a.id, name: a.name, campaign: c.name, status: a.effective_status, monitor: j.monitor, ok: j.ok, want: j.want, got: j.got });
    }
  }
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first run */ }
  const bad = ads.filter((a) => !a.ok);
  const was = new Set((prev.bad || []).map((a) => a.id + '|' + a.got));
  const fresh = bad.filter((a) => !was.has(a.id + '|' + a.got));
  const out = { at: new Date().toISOString(), total: ads.length, monitor: ads.filter((a) => a.monitor).length, bad, ads };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  if (fresh.length) {
    try {
      require('child_process').execFileSync('node', [path.join(DIR, 'notify.js'), '📣 מודעה שמובילה למקום הלא נכון',
        fresh.map((a) => a.name + ': צריכה ללכת ל' + a.want + ', והיא הולכת ל ' + a.got).join('\n').slice(0, 900)], { cwd: DIR, stdio: 'ignore', timeout: 60000 });
    } catch (e) { console.error('notify: ' + e.message); }
  }
  console.log(new Date().toISOString(), 'ads', ads.length, 'bad', bad.length, 'new', fresh.length);
}

if (require.main === module) main().catch((e) => { console.error(new Date().toISOString(), e.message); process.exitCode = 1; });
module.exports = { isMonitorAd, destOf, judge };
