'use strict';
/*
  14.11.2026: the partner way to a customer's Facebook (lib/partner.js). Every 10 minutes (cron, user monitor):
  the Pages and ad accounts shared with IT Solution's business, matched to what each customer claimed in 🔌.
  A new match: our system user is assigned to the Page and the ad accounts, and the customer is registered for
  the ad report (data/ads/sources.json, partner lines), the private messages (data/social-dm/tenants.json) and gets
  a message in his monitor. Nothing is posted or spent here. Itzik gets one 📋 line, for his information only.
    node partner-sync.js [--dry]       log /home/monitor/partner-sync.log
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const PT = require('./lib/partner.js');

const HERE = __dirname;
const DATA = path.join(HERE, 'data');
const DIR = path.join(DATA, 'partner');
const TOKEN_FILE = '/home/monitor/.fb-ads-token-itsolution';
const G = 'https://graph.facebook.com/v23.0/';
const DRY = process.argv.includes('--dry');

function rj(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function wj(f, o) { if (DRY) return; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(f + '.tmp', f); }
function say(s) { console.log(new Date().toISOString().slice(0, 16) + ' ' + s); }
function token() { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); }

async function call(ep, params, method) {
  const q = new URLSearchParams(Object.assign({ access_token: token() }, params || {}));
  const r = method === 'POST' ? await fetch(G + ep, { method: 'POST', body: q, signal: AbortSignal.timeout(30000) })
    : await fetch(G + ep + '?' + q, { signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  if (j.error) throw new Error(String(j.error.message || 'meta').slice(0, 160));
  return j;
}
async function all(ep, fields) {
  let out = [], j = await call(PT.BIZ + '/' + ep, { fields, limit: 100 });
  out = out.concat(j.data || []);
  for (let i = 0; i < 10 && j.paging && j.paging.next; i++) { const r = await fetch(j.paging.next, { signal: AbortSignal.timeout(30000) }); j = await r.json(); out = out.concat(j.data || []); }
  return out;
}

function tenantDir(t) { const r = rj(path.join(DATA, 'tenants', 'tenants', t + '.json'), null); return (r && r.dir) || '/home/' + t + '/' + t + '-monitor'; }
function tell(t, text) {
  if (DRY) return say('would tell ' + t + ': ' + text.split('\n')[0]);
  try {
    const cd = path.join(tenantDir(t), 'data', 'chat', 'chat');
    const pad = (n) => String(n).padStart(2, '0'); const at = new Date();
    const base = at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + '-' + pad(at.getHours()) + pad(at.getMinutes()) + pad(at.getSeconds()) + '-claude-partner';
    fs.writeFileSync(path.join(cd, base + '.json'), JSON.stringify({ at: at.toISOString(), from: 'claude', text, status: 'done', id: 'pt-' + crypto.randomBytes(4).toString('hex') }, null, 1), { mode: 0o664 });
  } catch (e) { say(t + ': !! הודעה למוניטור ' + e.message.slice(0, 80)); }
}
function register(t, link) {
  // the ad report, as a partner source (ads-sync.js reads tokenFile and accounts)
  const af = path.join(DATA, 'ads', 'sources.json'), as = rj(af, []).filter((x) => x.name !== t);
  if (link.adAccounts.length) as.push({ name: t, dir: tenantDir(t), tenant: true, partner: true, tokenFile: TOKEN_FILE, accounts: link.adAccounts });
  wj(af, as);
  // private messages, read only, with suggested replies (social-dm-tenants.js partner route)
  const df = path.join(DATA, 'social-dm', 'tenants.json'), ds = rj(df, []).filter((x) => x.name !== t);
  ds.push({ name: t, dir: tenantDir(t), pageId: link.pageId, tokenFile: TOKEN_FILE, enabled: true, enabledAt: link.at, via: 'partner' });
  wj(df, ds);
  // what his own 🔌 shows (lib/connections.js reads data/conn/partner.json in his folder), owned by him
  if (DRY) return;
  try {
    const dir = tenantDir(t), f = path.join(dir, 'data', 'conn', 'partner.json'), o = fs.statSync(dir);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ pageName: link.pageName, ig: link.ig, ads: link.adAccounts.length, at: link.at }));
    for (const x of [path.dirname(f), f]) { try { fs.chownSync(x, o.uid, o.gid); } catch (e) {} }
  } catch (e) { say(t + ': !! partner.json ' + e.message.slice(0, 80)); }
}

/*
  14.11.2026: his channels for social-run.js (data/social/<t>/channels.json): his Instagram (our system user token,
  the IG account of his Page) and his Page (its own Page token, kept in /home/monitor/.partner/<t>-page.token, 600).
*/
async function channels(t, link) {
  if (DRY || !link.igId) return;
  const dir = path.join(DATA, 'social', t);
  const tokDir = '/home/monitor/.partner', pf = path.join(tokDir, t + '-page.token');
  try {
    const pj = await call(link.pageId, { fields: 'access_token' });
    fs.mkdirSync(tokDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(pf, pj.access_token, { mode: 0o600 });
    const mon = fs.statSync('/home/monitor'); for (const x of [tokDir, pf]) { try { fs.chownSync(x, mon.uid, mon.gid); } catch (e) {} }
  } catch (e) { say(t + ': !! טוקן דף ' + e.message.slice(0, 80)); }
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const cf = path.join(dir, 'channels.json'), cfg = rj(cf, null) || { title: link.pageName, hour: '20:00', channels: {} };
  cfg.channels.main = { name: '@' + link.ig, id: link.igId, tokenFile: TOKEN_FILE, page: fs.existsSync(pf) ? { id: link.pageId, name: link.pageName, tokenFile: pf } : undefined };
  wj(cf, cfg);
  if (!fs.existsSync(path.join(dir, 'queue.json'))) wj(path.join(dir, 'queue.json'), []);
  try { execFileSync('chown', ['-R', 'monitor:monitor', dir]); } catch (e) {}
}
// What his monitor put in <his dir>/data/social-out (a video and its .json) goes into the queue of social-run.js.
function outbox(t) {
  const src = path.join(tenantDir(t), 'data', 'social-out'), dir = path.join(DATA, 'social', t);
  if (!fs.existsSync(path.join(dir, 'channels.json'))) return;
  let fl = []; try { fl = fs.readdirSync(src).filter((f) => /^[A-Za-z0-9_-]{1,60}\.json$/.test(f)); } catch (e) { return; }
  const qf = path.join(dir, 'queue.json'), q = rj(qf, []);
  let order = q.reduce((m, x) => Math.max(m, Number(x.order) || 0), 0), added = 0;
  for (const f of fl) {
    const j = rj(path.join(src, f), null);
    const file = j && String(j.file || '');
    if (!j || !/^[A-Za-z0-9_-]{1,60}\.mp4$/.test(file) || !fs.existsSync(path.join(src, file))) continue;
    const id = 'p' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
    if (DRY) { say('would queue ' + t + ' ' + file); continue; }
    fs.copyFileSync(path.join(src, file), path.join(dir, 'media', id + '.mp4'));
    q.push({ id, name: file.replace(/\.mp4$/, ''), file: id + '.mp4', caption: String(j.caption || '').slice(0, 2200), channel: 'main', order: ++order, from: 'customer', at: new Date().toISOString() });
    fs.unlinkSync(path.join(src, f)); fs.unlinkSync(path.join(src, file)); added++;
  }
  if (added) { wj(qf, q); try { execFileSync('chown', ['-R', 'monitor:monitor', dir]); } catch (e) {} tell(t, '📲 ' + added + ' סרטונים נכנסו לתור הפרסום. הם עולים לאינסטגרם ולדף שלך בשעה הקבועה (20:00, לא בשבת).'); say(t + ': ' + added + ' לתור הפרסום'); }
}

async function main() {
  const claims = (() => { try { return fs.readdirSync(path.join(DIR, 'claims')).filter((f) => /^[a-z0-9-]+\.json$/.test(f)); } catch (e) { return []; } })();
  if (!claims.length) return;
  const pages = await all('client_pages', 'id,name,username,link,business{id},instagram_business_account{id,username}');
  const accounts = await all('client_ad_accounts', 'id,name,business{id}');
  for (const f of claims) {
    const t = f.replace(/\.json$/, '');
    try { outbox(t); } catch (e) { say(t + ': !! outbox ' + e.message.slice(0, 80)); }
    const claim = rj(path.join(DIR, 'claims', f), null);
    if (!claim) continue;
    const lf = path.join(DIR, 'links', t + '.json'), old = rj(lf, null);
    const p = PT.match(PT.pageRef(claim.input), pages);
    if (!p) {
      // one reminder in his monitor after a day without a share, never more
      if (!claim.reminded && Date.now() - Date.parse(claim.at) > 24 * 3600e3 && !(old && old.pageId)) {
        tell(t, 'עוד לא קיבלנו את השיתוף של הדף שלך בפייסבוק. אם נתקעת באחד הצעדים, כתוב לי כאן באיזה צעד, ואני מסביר.');
        claim.reminded = new Date().toISOString(); wj(path.join(DIR, 'claims', f), claim);
      }
      continue;
    }
    const ads = PT.adsOf(p, accounts);
    if (old && old.pageId === p.id && JSON.stringify(old.adAccounts) === JSON.stringify(ads)) continue;
    // our system user on the Page and on each ad account (idempotent at Meta)
    const errs = [];
    if (!DRY) {
      try { await call(p.id + '/assigned_users', { user: PT.SYSUSER, tasks: JSON.stringify(['MANAGE', 'CREATE_CONTENT', 'MODERATE', 'MESSAGING', 'ADVERTISE', 'ANALYZE']) }, 'POST'); } catch (e) { errs.push('page: ' + e.message); }
      for (const a of ads) { try { await call(a + '/assigned_users', { user: PT.SYSUSER, tasks: JSON.stringify(['MANAGE', 'ADVERTISE', 'ANALYZE']) }, 'POST'); } catch (e) { errs.push(a + ': ' + e.message); } }
    }
    const link = { tenant: t, pageId: p.id, pageName: p.name || '', ig: (p.instagram_business_account || {}).username || '', igId: (p.instagram_business_account || {}).id || '',
      adAccounts: ads, at: new Date().toISOString(), errs };
    wj(lf, link);
    register(t, link);
    await channels(t, link);
    say(t + ': חובר ' + p.name + ', ' + ads.length + ' חשבונות מודעות' + (errs.length ? ' | !! ' + errs.join(' | ') : ''));
    if (!old || !old.pageId) {
      tell(t, '✅ פייסבוק מחובר: ' + (p.name || 'הדף שלך') + (link.ig ? ' ואינסטגרם @' + link.ig : '') + (ads.length ? ', וחשבון המודעות' : '') + '.\n'
        + 'מהיום: דוח הקמפיינים מתעדכן כל חצי שעה, לידים והודעות פרטיות נכנסים ל 📋 לטיפול עם תשובה מוצעת.\n'
        + (ads.length ? '' : 'חשבון המודעות עוד לא שותף איתנו. כדי שנריץ קמפיינים, שתף גם אותו באותו מסך שותפים.\n')
        + 'שום דבר לא מתפרסם ולא עולה כסף בלי אישור שלך.');
      if (!DRY) { try { require('./lib/handle.js').complete({ key: 'partner-' + t + '-' + p.id, kind: 'lead', who: t, title: 'חיבר פייסבוק כשותף: ' + p.name + (ads.length ? ' ו ' + ads.length + ' חשבונות מודעות' : '') + '. נפתח לבד.', link: 'biz' }); } catch (e) {} }
    }
  }
}

if (require.main === module) main().catch((e) => { say('!! ' + e.message); process.exitCode = 1; });
module.exports = { main };
