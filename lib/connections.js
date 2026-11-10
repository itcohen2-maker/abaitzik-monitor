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
  if (p === 'google' && (/youtube/i.test(String(d.id)) || /youtube/i.test(sc))) return 'youtube';
  return p;
}

// a step is connected when it was got after its last revoke
function isOn(s) {
  if (!s || !s.got) return false;
  return !s.revokedAt || Date.parse(s.revokedAt) < Date.parse(s.got);
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
  (def.steps || []).forEach((d) => {
    if (!d.oauth || !d.oauth.provider) return;
    const p = d.oauth.provider;
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
    if (seen[c.key]) return;
    const ok = allowed(plan, instName, c.key);
    rows.push({ id: 'cat-' + c.key, icon: c.icon, title: c.title, key: c.key, on: false, who: '', fixed: true, locked: !ok,
      paid: ok ? 'כלול, מחברים בתיאום עם IT Solution' : 'תוספת בתשלום, לא כלול בחבילת ' + PLAN_NAME[plan] });
  });
  const F = features || {};
  const own = instName === 'abaitzik';
  rows.push({ id: 'wa', icon: '💬', title: 'וואטסאפ', on: own, soon: !own, who: '', fixed: true });
  rows.push({ id: 'sign', icon: '✍️', title: 'חתימה דיגיטלית', on: true, who: '', fixed: true });
  const bankOk = allowed(plan, instName, 'bank') && (own || !planOpen(plan, instName) || !!F.bank);
  rows.push({ id: 'bank', icon: '🏦', title: 'חיבור לבנק', on: !!F.bank, who: '', fixed: true, locked: !bankOk && !F.bank,
    paid: F.bank ? '' : bankOk ? 'כלול, מחברים בתיאום עם IT Solution' : 'תוספת בתשלום, בתיאום עם IT Solution' });
  const accOk = own || (!planOpen(plan, instName) && allowed(plan, instName, 'acc'));
  rows.push({ id: 'acc', icon: '🧾', title: 'הנהלת חשבונות (ריווחית ועוד)', on: own, who: '', fixed: true, locked: !accOk,
    paid: own ? '' : accOk ? 'כלול, מחברים בתיאום עם IT Solution' : 'תוספת בתשלום' });
  return { rows, at: new Date().toISOString() };
}

module.exports = { list, isOn, PLAN_KEYS, allowed };
