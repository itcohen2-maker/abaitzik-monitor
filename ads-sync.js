'use strict';
/*
  10.11.2026, Itzik: Ilay as a new customer, "📊 מצב הקמפיינים" on his monitor, from his own ad account.

  Every 30 minutes: for each monitor in data/ads/sources.json, read its Meta ad accounts through the
  Facebook connection made on its setup page (lib/oauth.js, provider meta), and write
  <monitor>/data/ads/status.json: campaigns, status, budget, and the last 7 days (spend, leads,
  messages, clicks, impressions) plus today's spend. The token never leaves Itzik's data/setup;
  the customer's copy holds numbers only. Reading only: nothing in the ad account is changed.

  sources.json: [{ "name": "ilay", "dir": "/home/ilay/ilay-monitor", "setup": "<page token>", "step": "meta", "tenant": true }]
  node ads-sync.js [--dry]     Timer: monitor-ads.timer (root). Log /var/log/monitor-ads.log
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const HERE = __dirname;
const SETUP = path.join(HERE, 'data', 'setup');
const SOURCES = path.join(HERE, 'data', 'ads', 'sources.json');
const DRY = process.argv.includes('--dry');
const G = 'https://graph.facebook.com/v21.0';
const LEAD = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'leadgen_grouped'];
const MSG = ['onsite_conversion.messaging_conversation_started_7d'];

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function say(s) { console.log(new Date().toISOString().slice(0, 16) + ' ' + s); }

function savedFor(src) {
  const sec = readJson(path.join(SETUP, src.setup + '.secrets.json'), {});
  try { const v = JSON.parse(sec[src.step].value); return v && v.provider === 'meta' && v.token ? v : null; } catch (e) { return null; }
}

async function get(u, token) {
  const r = await fetch(G + u + (u.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  if (j.error) { const e = new Error(String(j.error.message || 'meta').slice(0, 120)); e.code = j.error.code; throw e; }
  return j;
}

function count(actions, kinds) {
  let n = 0;
  (actions || []).forEach((a) => { if (kinds.indexOf(a.action_type) > -1) n = Math.max(n, Number(a.value) || 0); });
  return n;
}

async function pull(token) {
  const acc = await get('/me/adaccounts?fields=id,name,currency,account_status&limit=25', token);
  const out = [];
  for (const a of acc.data || []) {
    const camps = await get('/' + a.id + '/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget&limit=50', token);
    const week = await get('/' + a.id + '/insights?level=campaign&date_preset=last_7d&fields=campaign_id,spend,impressions,clicks,actions&limit=200', token);
    const today = await get('/' + a.id + '/insights?level=campaign&date_preset=today&fields=campaign_id,spend&limit=200', token);
    const W = {}, T = {};
    (week.data || []).forEach((x) => { W[x.campaign_id] = x; });
    (today.data || []).forEach((x) => { T[x.campaign_id] = x; });
    const list = (camps.data || []).map((c) => {
      const w = W[c.id] || {};
      const spend = Number(w.spend) || 0, leads = count(w.actions, LEAD), msgs = count(w.actions, MSG);
      return { id: c.id, name: String(c.name || '').slice(0, 120), status: c.effective_status || c.status || '', objective: c.objective || '',
        budget: c.daily_budget ? Number(c.daily_budget) / 100 : 0, budgetLife: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : 0,
        spend7: spend, leads7: leads, msgs7: msgs, cpl7: leads ? Math.round(spend / leads * 100) / 100 : 0,
        clicks7: Number(w.clicks) || 0, impr7: Number(w.impressions) || 0, spendToday: Number((T[c.id] || {}).spend) || 0 };
    });
    // the running ones first, then by spend
    list.sort((x, y) => ((y.status === 'ACTIVE') - (x.status === 'ACTIVE')) || (y.spend7 - x.spend7));
    out.push({ id: a.id, name: String(a.name || '').slice(0, 120), currency: a.currency || '', status: a.account_status, campaigns: list });
  }
  return out;
}

function write(src, next) {
  const f = path.join(src.dir, 'data', 'ads', 'status.json');
  const old = readJson(f, null);
  const strip = (x) => JSON.stringify(Object.assign({}, x, { at: '' }));
  if (old && strip(old) === strip(next)) return false;
  if (DRY) { console.log(JSON.stringify(next).slice(0, 600)); return false; }
  const st = fs.statSync(src.dir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  try { fs.chownSync(path.dirname(f), st.uid, st.gid); } catch (e) {}
  fs.writeFileSync(f + '.tmp', JSON.stringify(next));
  fs.renameSync(f + '.tmp', f);
  try { fs.chownSync(f, st.uid, st.gid); } catch (e) {}
  return true;
}

function publish(src) {
  // as the monitor's own user, like cal-sync.js. A customer's page is built in place.
  const uid = fs.statSync(src.dir).uid;
  const run = src.tenant ? [process.execPath, 'build.js'] : [process.execPath, 'push.js', 'campaigns changed'];
  try { execFileSync('sudo', ['-u', '#' + uid, '-H'].concat(run), { cwd: src.dir, stdio: 'ignore', timeout: 300000 });
    if (src.tenant) execFileSync('chmod', ['-R', 'o+rX', path.join(src.dir, 'docs')]); }
  catch (e) { say(src.name + ': בנייה נכשלה ' + e.message.slice(0, 80)); }
}

async function one(src) {
  const connect = 'https://form.it-solution.co.il/oauth/meta/start?t=' + src.setup + '&s=' + src.step;
  const saved = savedFor(src);
  if (!saved) {
    say(src.name + ': אין חיבור פייסבוק בדף ההקמה');
    if (write(src, { ok: false, why: 'none', connect, at: new Date().toISOString() })) publish(src);
    return;
  }
  let accounts;
  try { accounts = await pull(saved.token); }
  catch (e) {
    const revoked = e.code === 190 || e.code === 102;
    say(src.name + ': ' + (revoked ? 'החיבור נותק' : 'שגיאה') + ' ' + e.message);
    // only a cut connection or a missing permission is shown; a passing failure keeps the last copy
    if (revoked || e.code === 200 || e.code === 10) {
      if (write(src, { ok: false, why: revoked ? 'revoked' : 'perm', detail: e.message, connect, at: new Date().toISOString() })) publish(src);
    }
    return;
  }
  const n = accounts.reduce((s, a) => s + a.campaigns.length, 0);
  say(src.name + ': ' + accounts.length + ' חשבונות מודעות, ' + n + ' קמפיינים');
  if (write(src, { ok: true, who: saved.who || '', accounts, at: new Date().toISOString() })) publish(src);
}

(async () => {
  for (const src of readJson(SOURCES, [])) {
    try { await one(src); } catch (e) { say(src.name + ': ' + e.message.slice(0, 120)); }
  }
})();
