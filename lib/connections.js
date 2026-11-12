'use strict';
/*
  7.11.2026, stage 3 of the monitor site plan: the "🔌 חיבורים" screen.
  What is connected (✓) and what is not, with a one tap connect link for each, the same links the
  setup page uses (/oauth/<p>/start?t=&s=). Read at build time from the instance's own setup state
  (data/conn/source.json names the setup token). Google is also checked live every 10 minutes by
  cal-sync.js, so a dead Google token shows as "not connected" even when the setup file says got.
  The non OAuth ones (bank, accounting, WhatsApp, signatures) are listed as active or as a paid add-on.
*/
const fs = require('fs');
const path = require('path');

const BASE = 'https://form.it-solution.co.il';
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

function ready(p) { try { return require('./oauth.js').ready(p); } catch (e) { return false; } }

/*
  10.11.2026, Itzik: every monitor shows every connection the monitor can do. What is not in the customer's plan
  is shown but locked (not clickable, "תוספת בתשלום"). The plan sits in instance.json as "plan":
  basic | small | medium | large. No plan (Alon) and Itzik's own monitor: everything open.
  This is the split agreed on 8.11 (pricing-tiers): change it here when the packages change.
*/
const PLAN_KEYS = {
  basic: ['google', 'wa', 'sign'],
  small: ['google', 'wa', 'sign', 'meta', 'microsoft'],
  medium: ['google', 'wa', 'sign', 'meta', 'microsoft', 'fireflies', 'linkedin', 'youtube'],
  large: ['google', 'wa', 'sign', 'meta', 'microsoft', 'fireflies', 'linkedin', 'youtube', 'bank', 'acc'],
};
const PLAN_NAME = { basic: 'בסיס', small: 'SMALL', medium: 'MEDIUM', large: 'LARGE' };
const CATALOG = [
  { key: 'google', icon: '📧', title: 'גוגל: מייל, יומן ודרייב' },
  { key: 'meta', icon: '📘', title: 'פייסבוק, אינסטגרם ומודעות' },
  { key: 'microsoft', icon: '🗓️', title: 'מיקרוסופט: יומן ומייל' },
  { key: 'fireflies', icon: '🎙️', title: 'תמלול פגישות (פיירפליס)' },
  { key: 'linkedin', icon: '💼', title: 'לינקדין' },
  { key: 'youtube', icon: '▶️', title: 'יוטיוב' },
  { key: 'tiktok', icon: '🎵', title: 'טיקטוק' },
];
function planOpen(plan, instName) { return instName === 'abaitzik' || !plan || !PLAN_KEYS[plan]; }
function allowed(plan, instName, key) { return planOpen(plan, instName) || PLAN_KEYS[plan].indexOf(key) >= 0; }
function keyOf(d) {
  const p = d.oauth.provider;
  const sc = [].concat(d.oauth.scopes || []).join(' ');
  if (p === 'google' && (/youtube|^yt/i.test(String(d.id)) || /youtube/i.test(sc) || /יוטיוב|youtube/i.test(String(d.title || '')))) return 'youtube';
  return p;
}

// a step is connected when it was got after its last revoke
function isOn(s) {
  if (!s || !s.got) return false;
  return !s.revokedAt || Date.parse(s.revokedAt) < Date.parse(s.got);
}

/*
  12.11.2026, Itzik: a customer connects his own WhatsApp number himself, through Kapso. The row opens
  https://wa.abaitzik.com/api/wa/connect?t=<tenant id>&c=<code>, which checks the code and sends him on to a fresh
  Kapso setup link. The tenant id is the instance name (setup/new-tenant.sh gives both the same id). The code is the fast
  chat key already in his own data/fc-key.txt (the same key the server keeps in data/fastchat/tenants.json and his page
  holds as D.fcKey), so no new secret travels. The link sits only in the sealed payload, never in live.json.
  Connected = his data/wa.json (written by setup/wa-kapso-provision.sh) has phoneId and kapsoKey; who is the number.
  Without a code the row stays the old "בתיאום עם IT Solution" text.
*/
const WA_CONNECT = 'https://wa.abaitzik.com/api/wa/connect';
/*
  12.11.2026, Itzik: "כן, תבנה את החיבור המהיר", a customer with no Facebook connects in 10 seconds. The primary
  action is now "חיבור מהיר": wa.me/<shared IT Solution number>?text=<phrase with his code> (lib/wa-quick.js; the code
  comes from the same fc-key.txt, so the page builds it with no new secret). The own number (Kapso) link stays as a
  small second action only when features.json has {"waOwn":true}: Kapso Pro is not paid yet.
  Connected: his own number through Kapso (wa.json phoneId and kapsoKey), or the quick one: data/conn/wa.json
  {phone, via:'shared'}, written by root (lib/wa-quick-provision.js) when the bridge mapped his phone.
*/
function waRow(dataPath, instName, plan, F) {
  F = F || {};
  const ok = allowed(plan, instName, 'wa');
  const w = rd(path.join(dataPath, 'wa.json')) || {};
  const own = !!(w.phoneId && w.kapsoKey);
  const q = rd(path.join(dataPath, 'conn', 'wa.json')) || {};
  const shared = !own && !!(q.phone && q.via === 'shared');
  let code = ''; try { code = fs.readFileSync(path.join(dataPath, 'fc-key.txt'), 'utf8').trim(); } catch (e) { /* none yet */ }
  const okTenant = /^[a-z0-9][a-z0-9-]{0,40}$/.test(String(instName || ''));
  const canLink = ok && /^[a-f0-9]{24,64}$/.test(code) && okTenant;
  const on = own || shared;
  const row = { id: 'wa', icon: '💬', title: 'וואטסאפ', on: ok && on, who: ok && own ? String(w.kapsoDisplay || '') : ok && shared ? require('./wa-quick.js').mask(q.phone) : '',
    fixed: !canLink && !on, locked: !ok,
    paid: !ok ? 'תוספת בתשלום, לא כלול בחבילת ' + PLAN_NAME[plan] : (canLink || on) ? '' : 'כלול, מחברים בתיאום עם IT Solution' };
  if (!canLink) return row;
  const ownLink = WA_CONNECT + '?t=' + encodeURIComponent(instName) + '&c=' + encodeURIComponent(code);
  if (own) { if (F.waOwn) row.link = ownLink; return row; }
  if (shared) { row.note = 'לניתוק כתבו לי בוואטסאפ: ניתוק'; return row; }
  row.link = require('./wa-quick.js').link(require('./wa-quick.js').code(code, instName));
  row.linkLabel = 'חיבור מהיר';
  if (F.waOwn) { row.link2 = ownLink; row.link2Label = 'מספר משלך, בשם העסק שלך'; }
  return row;
}

function list(dataPath, instName, features, over, plan) {
  const sn0 = over ? null : rd(path.join(dataPath, 'conn', 'setup.json'));
  const src = over ? { setup: over.tok } : (rd(path.join(dataPath, 'conn', 'source.json')) || (sn0 && { setup: sn0.tok }));
  if (!src || !/^[a-f0-9]{8,40}$/.test(String(src.setup || ''))) return null;
  const tok = src.setup;
  const snap = sn0;
  const SD = over && over.setupDir ? over.setupDir : path.join(dataPath, 'setup');
  const def = (snap && { steps: snap.steps }) || rd(path.join(SD, tok + '.def.json')) || { steps: [] };
  const st = (snap && { steps: snap.state }) || rd(path.join(SD, tok + '.json')) || {};
  const isReady = (p) => (snap && snap.ready ? !!snap.ready[p] : ready(p));
  const cal = rd(path.join(dataPath, 'cal', 'status.json'));
  const steps = st.steps || {};
  const rows = [], seen = {};
  const F = features || {};
  const own = instName === 'abaitzik';
  // 12.11.2026, Itzik: "אנחנו לא מתחברים לטיק טוק". Our TikTok app still waits for TikTok's review (sandbox keys
  // work only for Itzik's own account), so a customer sees the row only once features.json has {"tiktok":true}.
  const hide = (k) => k === 'tiktok' && !own && !F.tiktok;
  (def.steps || []).forEach((d) => {
    if (!d.oauth || !d.oauth.provider) return;
    const p = d.oauth.provider;
    if (hide(keyOf(d))) return;
    let on = isOn(steps[d.id]);
    if (on && p === 'google' && d.id === (src.calStep || 'google') && cal && cal.ok === false) on = false;
    const s = steps[d.id] || {};
    const key = keyOf(d), ok = allowed(plan, instName, key);
    seen[key] = true;
    rows.push({
      id: d.id, icon: d.icon || '🔗', title: d.title || d.id, key,
      on: on && ok, who: on && ok ? String(s.who || '') : '',
      soon: ok && !on && !isReady(p),
      locked: !ok, paid: ok ? '' : 'תוספת בתשלום, לא כלול בחבילת ' + PLAN_NAME[plan],
      link: ok ? BASE + '/oauth/' + p + '/start?t=' + encodeURIComponent(tok) + '&s=' + encodeURIComponent(d.id) : '',
    });
  });
  // what the monitor can do but this setup page has no step for: listed too, connected together with us
  CATALOG.forEach((c) => {
    if (seen[c.key] || hide(c.key)) return;
    const ok = allowed(plan, instName, c.key);
    rows.push({ id: 'cat-' + c.key, icon: c.icon, title: c.title, key: c.key, on: false, who: '', fixed: true, locked: !ok,
      paid: ok ? 'כלול, מחברים בתיאום עם IT Solution' : 'תוספת בתשלום, לא כלול בחבילת ' + PLAN_NAME[plan] });
  });
  // 10.11.2026, Itzik: "את הוואטסאפ אנחנו לא מראים בהתחלה, רק עוד כמה ימים עד שנקבל ממטא את האישור". A customer sees
  // the row only once his data/status/features.json has {"wa":true} (node -e "require('./lib/features.js').enable('<data>','wa')").
  if (own) rows.push({ id: 'wa', icon: '💬', title: 'וואטסאפ', on: true, who: '', fixed: true, paid: '' });
  else if (F.wa) rows.push(waRow(dataPath, instName, plan, F));
  // 12.11.2026: YouTube is read only, public comments by a channel link (lib/yt-comments.js), not an OAuth grant.
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].key === 'youtube') rows.splice(i, 1);
  if (!hide('youtube')) {
    const yok = allowed(plan, instName, 'youtube');
    let ych = null; try { ych = JSON.parse(fs.readFileSync(path.join(dataPath, 'yt', 'channel.json'), 'utf8')); } catch (e) { /* not given */ }
    rows.push({ id: 'yt', icon: '▶️', title: 'יוטיוב: תגובות מהערוץ', key: 'youtube', yt: true, on: !!(yok && ych && ych.id),
      who: yok && ych ? String(ych.title || ych.input || '') : '', ytErr: (ych && ych.err) || '', locked: !yok,
      paid: yok ? '' : 'תוספת בתשלום, לא כלול בחבילת ' + PLAN_NAME[plan] });
  }
  rows.push({ id: 'sign', icon: '✍️', title: 'חתימה דיגיטלית', on: true, who: '', fixed: true });
  const bankOk = allowed(plan, instName, 'bank') && (own || !planOpen(plan, instName) || !!F.bank);
  rows.push({ id: 'bank', icon: '🏦', title: 'חיבור לבנק', on: !!F.bank, who: '', fixed: true, locked: !bankOk && !F.bank,
    paid: F.bank ? '' : bankOk ? 'כלול, מחברים בתיאום עם IT Solution' : 'תוספת בתשלום, בתיאום עם IT Solution' });
  const accOk = own || (!planOpen(plan, instName) && allowed(plan, instName, 'acc'));
  rows.push({ id: 'acc', icon: '🧾', title: 'הנהלת חשבונות (ריווחית ועוד)', on: own, who: '', fixed: true, locked: !accOk,
    paid: own ? '' : accOk ? 'כלול, מחברים בתיאום עם IT Solution' : 'תוספת בתשלום' });
  return { rows, at: new Date().toISOString() };
}

module.exports = { list, isOn, PLAN_KEYS, allowed, waRow };
