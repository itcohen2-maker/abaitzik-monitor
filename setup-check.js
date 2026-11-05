'use strict';
/*
  5.11.2026, Itzik: "a checker that goes button by button and checks that everything is
  clickable and reaches the permissions that are really needed". For one setup page, or all:
  1. the live page (https://form.it-solution.co.il/s/<token>) has a real link for every
     "connect" card, and no card asks to paste a key or copy a code;
  2. every link, followed like a browser would (no cookies), lands on the right provider's
     sign in screen with our client id, our exact callback, and the permissions that card needs;
  3. the provider does not answer with its own error page (wrong redirect, unknown app).
  It signs in to nothing and saves nothing.

  node setup-check.js <token>       one page
  node setup-check.js --all         every page in data/setup
  node setup-check.js --all --notify   and push once when something is red (the daily guard)
  Timer: monitor-setup-check.timer, every day 07:45 Israel, after oauth-health.
*/
const fs = require('fs');
const path = require('path');
const BASE = process.env.SETUP_BASE || 'https://form.it-solution.co.il';
const DIR = process.env.SETUP_DIR || path.join(__dirname, 'data', 'setup');
const oa = require('./lib/oauth.js');

// What each provider's sign in screen must look like, and what it must ask for.
const EXPECT = {
  google: { host: /(^|\.)accounts\.google\.com$/, scopes: (st) => oa.scopesFor('google', st.oauth.scopes) },
  // shallow: these providers check our callback only after sign in, so a check with no cookies
  // can only follow the button to their sign in screen. The full check is a real sign in.
  meta: { host: /(^|\.)facebook\.com$/, need: ['config_id'], shallow: true },
  microsoft: { host: /^login\.(microsoftonline|live)\.com$/, scopes: () => ['offline_access', 'Calendars.ReadWrite'], shallow: true },
  fireflies: { host: /^(api|app)\.fireflies\.ai$/ },
  linkedin: { host: /(^|\.)linkedin\.com$/, scopes: () => ['w_member_social'] },
  tiktok: { host: /(^|\.)tiktok\.com$/ },
};
// Text a provider shows when our app or callback is wrong.
const PROVIDER_ERROR = /(redirect_uri_mismatch|invalid_client|AADSTS\d+|URL blocked|Can't load URL|isn't available right now|does not match the registered|unauthorized_client|invalid_request|app is not active|Error 400|Error 401)/i;

async function hop(url) {
  const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (setup-check)', 'Accept-Language': 'he,en' }, signal: AbortSignal.timeout(20000) });
  return { status: r.status, loc: r.headers.get('location'), body: r.status < 300 || r.status >= 400 ? (await r.text()).slice(0, 200000) : '' };
}

async function checkCard(tok, st) {
  const p = st.oauth.provider;
  const out = { id: st.id, title: st.title, provider: p, ok: false, why: '' };
  if (!oa.ready(p)) { out.why = 'הספק עוד לא מוגדר בשרת (הכרטיס מציג "בקרוב")'; out.pending = true; return out; }
  const start = BASE + '/oauth/' + p + '/start?t=' + tok + '&s=' + encodeURIComponent(st.id);
  const a = await hop(start);
  if (a.status !== 302 || !a.loc) { out.why = 'הכפתור לא מפנה (' + a.status + ')'; return out; }
  const u = new URL(a.loc);
  const E = EXPECT[p];
  if (!E.host.test(u.hostname)) { out.why = 'מפנה למקום לא צפוי: ' + u.hostname; return out; }
  const cb = u.searchParams.get('redirect_uri');
  if (cb !== BASE + '/oauth/' + p + '/callback') { out.why = 'כתובת החזרה שגויה: ' + cb; return out; }
  if (!u.searchParams.get('client_id') && !u.searchParams.get('client_key')) { out.why = 'חסר מזהה האפליקציה'; return out; }
  if (!u.searchParams.get('state')) { out.why = 'חסר state חתום'; return out; }
  for (const k of E.need || []) if (!u.searchParams.get(k)) { out.why = 'חסר ' + k; return out; }
  const sc = String(u.searchParams.get('scope') || '');
  for (const s of (E.scopes ? E.scopes(st) : [])) if (sc.indexOf(s) < 0) { out.why = 'חסרה הרשאה: ' + s; return out; }
  out.scopes = sc.split(/[ ,]+/).filter(Boolean).map((s) => s.replace('https://www.googleapis.com/auth/', ''));
  // Follow the provider a few hops, as a browser with no cookies would, and look for its error page.
  let url = a.loc, last = null;
  for (let i = 0; i < 5; i++) {
    last = await hop(url);
    if (last.status >= 300 && last.status < 400 && last.loc) { url = new URL(last.loc, url).toString(); if (/\/oauth\/[a-z]+\/callback/.test(url) && url.indexOf(BASE) === 0) { out.why = 'הספק החזיר מיד שגיאה'; return out; } continue; }
    break;
  }
  if (last.status >= 400 && last.status !== 401 && last.status !== 403) { out.why = 'הספק ענה ' + last.status; return out; }
  const m = PROVIDER_ERROR.exec(last.body || '');
  if (m) { out.why = 'דף שגיאה אצל הספק: ' + m[1]; return out; }
  out.ok = true; out.landed = new URL(url).hostname; out.shallow = !!E.shallow;
  return out;
}

async function checkPage(tok) {
  const def = JSON.parse(fs.readFileSync(path.join(DIR, tok + '.def.json'), 'utf8'));
  const page = await (await fetch(BASE + '/s/' + tok, { signal: AbortSignal.timeout(20000) })).text();
  const res = { tok, client: def.client, cards: [], problems: [] };
  for (const st of def.steps) {
    if (st.input) res.problems.push(st.title + ': עדיין מבקש להדביק מפתח');
    if (st.ms) res.problems.push(st.title + ': עדיין חיבור בקוד במקום כפתור');
    if (st.copy && /iam\.gserviceaccount\.com/.test(st.copy.value || '')) res.problems.push(st.title + ': עדיין מבקש לשתף עם כתובת');
    if (!st.oauth) { res.cards.push({ id: st.id, title: st.title, provider: '', ok: true, why: 'בלי חיבור (שאלה או אישור)' }); continue; }
    const href = '/oauth/' + st.oauth.provider + '/start?t=' + tok + '&amp;s=' + encodeURIComponent(st.id);
    const live = oa.ready(st.oauth.provider);
    if (live && page.indexOf(href) < 0) { res.cards.push({ id: st.id, title: st.title, provider: st.oauth.provider, ok: false, why: 'הכפתור לא מופיע בדף החי' }); continue; }
    res.cards.push(await checkCard(tok, st));
  }
  return res;
}

function report(r) {
  const L = [r.client + ' (' + r.tok.slice(0, 6) + ')'];
  r.cards.forEach((c) => L.push((c.ok ? '✓ ' : (c.pending ? '… ' : '✗ ')) + c.title + (c.provider ? ' [' + c.provider + ']' : '') + (c.ok && c.scopes && c.scopes.length ? ': ' + c.scopes.join(', ') : '') + (c.ok && c.shallow ? ' (נבדק עד מסך הכניסה)' : '') + (c.ok ? '' : ': ' + c.why)));
  r.problems.forEach((p) => L.push('✗ ' + p));
  return L.join('\n');
}

module.exports = { checkPage, checkCard, report };

if (require.main === module) {
  const args = process.argv.slice(2);
  const toks = args.includes('--all')
    ? fs.readdirSync(DIR).filter((f) => /^[a-f0-9]{16,40}\.def\.json$/.test(f)).map((f) => f.split('.')[0])
    : args.filter((a) => /^[a-f0-9]{16,40}$/.test(a));
  (async () => {
    const bad = [];
    for (const t of toks) {
      const def = JSON.parse(fs.readFileSync(path.join(DIR, t + '.def.json'), 'utf8'));
      if (!def.steps.some((s) => s.oauth)) continue;
      const r = await checkPage(t);
      console.log(new Date().toISOString() + '\n' + report(r) + '\n');
      if (r.problems.length || r.cards.some((c) => !c.ok && !c.pending)) bad.push(r.client);
    }
    if (bad.length && args.includes('--notify')) {
      require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'notify.js'), '🔌 בודק דפי ההקמה', 'כפתור התחברות לא תקין אצל: ' + bad.join(', ') + '. הפירוט ב /var/log/monitor-setup-check.log'], { cwd: __dirname, timeout: 60000 });
    }
    process.exit(bad.length ? 1 : 0);
  })().catch((e) => { console.error(e.message); process.exit(2); });
}
